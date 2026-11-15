import * as Tone from "tone";
import { volumeToDb } from "../core/mix";
import { midiToFreq } from "../core/notes";
import { audibleChannels, type StepEvents } from "../core/schedule";
import { secondsPerStep, swingDelay } from "../core/timing";
import type { Channel, DelayTime, Project, SampleInfo, ToneShape } from "../core/types";
import { createDrumVoice, type DrumVoice } from "./drums";
import { createInstrument, cutoffHz, envelopeScale, type Instrument } from "./instruments";

/**
 * The sound-making part of the app, laid out like FL Studio's mixer. Every
 * channel gets a voice and an insert strip:
 *
 *   voice -> tone filter -> 3 band EQ -> compressor -> fader + pan -> master
 *                                                       \-> reverb send
 *                                                       \-> delay send
 *
 * The reverb and delay are shared returns that feed the master, which ends in
 * a limiter. The graph knows nothing about the transport, so the live engine
 * and the offline WAV render build the same graph and feed it the same events.
 */
export interface Graph {
  play(project: Project, events: StepEvents, step: number, time: number): void;
  previewDrum(channelId: string, time: number): void;
  noteOn(channelId: string, pitch: number, velocity: number, time: number): void;
  noteOff(channelId: string, pitch: number, time: number): void;
  sync(project: Project): void;
  setBacking(keepChannelId: string | null, level: number): void;
  silence(time?: number): void;
  dispose(): void;
}

/** Looks up decoded audio for a sample, if it has loaded. */
export type SampleSource = (id: string) => AudioBuffer | undefined;

/** Notes end a hair before their last step so repeated notes stay distinct. */
const NOTE_FILL = 0.92;
const CHOKES: Partial<Record<string, string>> = { chat: "ohat", hat808: "ohat808" };
const DELAY_BEATS: Record<DelayTime, number> = { "16n": 0.25, "8n": 0.5, "8n.": 0.75, "4n": 1 };

/** Send amounts are faders too: 0 is off, 1 is full level. */
const sendGain = (amount: number) => (amount <= 0 ? 0 : amount * amount);

interface Slot {
  key: string;
  sound: Channel["sound"];
  filter: Tone.Filter;
  eqLow: Tone.Filter;
  eqMid: Tone.Filter;
  eqHigh: Tone.Filter;
  comp: Tone.Compressor;
  makeup: Tone.Gain;
  strip: Tone.Channel;
  reverbSend: Tone.Gain;
  delaySend: Tone.Gain;
  drum?: DrumVoice;
  synth?: Instrument;
  octave: number;
}

/** A sample as a melodic instrument: pitched around its root note. */
function sampleInstrument(buffer: AudioBuffer, info: SampleInfo): Instrument {
  const sampler = new Tone.Sampler({ urls: { [info.root]: new Tone.ToneAudioBuffer(buffer) }, attack: 0.002, release: 0.4 });
  return {
    output: sampler,
    play: (midi, seconds, time, velocity) => sampler.triggerAttackRelease(midiToFreq(midi), seconds, time, velocity),
    attack: (midi, time, velocity) => sampler.triggerAttack(midiToFreq(midi), time, velocity),
    release: (midi, time) => sampler.triggerRelease(midiToFreq(midi), time),
    releaseAll: (time) => sampler.releaseAll(time),
    setTone(t: ToneShape) {
      sampler.attack = 0.008 * envelopeScale(t.attack);
      sampler.release = 0.4 * envelopeScale(t.release);
    },
    dispose: () => sampler.dispose(),
  };
}

/** A sample as a drum: played once, at its own pitch. */
function sampleDrum(buffer: AudioBuffer): DrumVoice {
  const player = new Tone.Player(new Tone.ToneAudioBuffer(buffer));
  return {
    output: player,
    trigger: (t) => {
      player.stop(t);
      player.start(t);
    },
    choke: (t) => player.stop(t),
    dispose: () => player.dispose(),
  };
}

export function createGraph(project: Project, samples: SampleSource = () => undefined): Graph {
  const limiter = new Tone.Limiter(-1).toDestination();
  const master = new Tone.Gain(0.85).connect(limiter);
  const reverb = new Tone.Freeverb({ roomSize: 0.84, dampening: 4500, wet: 1 }).connect(master);
  const delay = new Tone.FeedbackDelay({ delayTime: 0.375, feedback: 0.35, wet: 1 }).connect(master);
  const slots = new Map<string, Slot>();
  let backing: { keep: string; level: number } | null = null;

  function voiceKey(p: Project, ch: Channel): string {
    const info = ch.sample ? p.samples.find((s) => s.id === ch.sample) : undefined;
    const loaded = info && samples(info.id) ? `${info.id}@${info.root}` : "";
    return `${ch.kind}:${ch.sound}:${loaded}`;
  }

  function makeVoice(p: Project, ch: Channel, slot: Slot) {
    const info = ch.sample ? p.samples.find((s) => s.id === ch.sample) : undefined;
    const buffer = info ? samples(info.id) : undefined;
    if (ch.kind === "drum") {
      slot.drum = buffer ? sampleDrum(buffer) : createDrumVoice(ch.sound);
      slot.drum.output.connect(slot.filter);
    } else {
      slot.synth = buffer && info ? sampleInstrument(buffer, info) : createInstrument(ch.sound);
      slot.synth.output.connect(slot.filter);
    }
  }

  function freeVoice(slot: Slot, later: boolean) {
    const drum = slot.drum;
    const synth = slot.synth;
    slot.drum = undefined;
    slot.synth = undefined;
    synth?.releaseAll();
    const free = () => {
      drum?.dispose();
      synth?.dispose();
    };
    // Let release tails finish before freeing a voice that was swapped out.
    if (later) setTimeout(free, 1500);
    else free();
  }

  function newSlot(): Slot {
    const filter = new Tone.Filter({ type: "lowpass", frequency: 20000, Q: 0.5, rolloff: -12 });
    // Three shelving and peaking bands: exactly flat at 0 dB, unlike a crossover EQ.
    const eqLow = new Tone.Filter({ type: "lowshelf", frequency: 250, gain: 0 });
    const eqMid = new Tone.Filter({ type: "peaking", frequency: 1200, Q: 0.8, gain: 0 });
    const eqHigh = new Tone.Filter({ type: "highshelf", frequency: 4500, gain: 0 });
    const comp = new Tone.Compressor({ threshold: 0, ratio: 1, attack: 0.01, release: 0.2 });
    const makeup = new Tone.Gain(1);
    const strip = new Tone.Channel();
    const reverbSend = new Tone.Gain(0).connect(reverb);
    const delaySend = new Tone.Gain(0).connect(delay);
    filter.chain(eqLow, eqMid, eqHigh, comp, makeup, strip);
    strip.connect(master);
    strip.connect(reverbSend);
    strip.connect(delaySend);
    return { key: "", sound: "kick", filter, eqLow, eqMid, eqHigh, comp, makeup, strip, reverbSend, delaySend, octave: 0 };
  }

  function disposeSlot(slot: Slot) {
    freeVoice(slot, false);
    [slot.filter, slot.eqLow, slot.eqMid, slot.eqHigh, slot.comp, slot.makeup, slot.strip, slot.reverbSend, slot.delaySend].forEach((n) => n.dispose());
  }

  /** Mixer settings for one strip. Synth strips stay open for live playing under a solo; the sequencer skips them itself. */
  function applyStrip(slot: Slot, ch: Channel, open: boolean) {
    const ducked = backing && ch.id !== backing.keep ? backing.level : 1;
    const db = volumeToDb(ch.volume * ducked);
    slot.strip.mute = !open;
    if (Number.isFinite(db)) slot.strip.volume.rampTo(db, 0.02);
    else slot.strip.volume.value = -Infinity;
    slot.strip.pan.rampTo(ch.pan, 0.02);
    slot.eqLow.gain.value = ch.fx.low;
    slot.eqMid.gain.value = ch.fx.mid;
    slot.eqHigh.gain.value = ch.fx.high;
    // Compression amount: from off (no threshold) to firm, with a little makeup gain.
    slot.comp.threshold.value = -30 * ch.fx.comp;
    slot.comp.ratio.value = 1 + 5 * ch.fx.comp;
    slot.makeup.gain.value = Tone.dbToGain(6 * ch.fx.comp);
    slot.reverbSend.gain.rampTo(sendGain(ch.fx.reverb), 0.02);
    slot.delaySend.gain.rampTo(sendGain(ch.fx.delay), 0.02);
    // Drums and samples use the strip's tone filter; synths have their own and leave this one open.
    const filterOn = ch.kind === "drum" || !!ch.sample;
    slot.filter.frequency.rampTo(filterOn ? cutoffHz(ch.tone.cutoff) : 20000, 0.03);
    slot.filter.Q.rampTo(filterOn ? 0.5 + ch.tone.resonance * 14 : 0.5, 0.03);
    slot.synth?.setTone(ch.tone);
    slot.octave = ch.kind === "synth" ? ch.tone.octave : 0;
  }

  const graph: Graph = {
    play(p, events, step, time) {
      const at = time + swingDelay(step, p.swing, p.bpm);
      for (const hit of events.drums) {
        // A closed hat chokes every ringing open hat of its kit, like on a real machine.
        const choked = CHOKES[hit.sound];
        if (choked) slots.forEach((s) => s.sound === choked && s.drum?.choke?.(at));
        slots.get(hit.channelId)?.drum?.trigger(at);
      }
      const stepSec = secondsPerStep(p.bpm);
      for (const n of events.notes) {
        const slot = slots.get(n.channelId);
        slot?.synth?.play(n.pitch + slot.octave * 12, n.steps * stepSec * NOTE_FILL, at, n.velocity);
      }
    },
    previewDrum(channelId, time) {
      slots.get(channelId)?.drum?.trigger(time);
    },
    noteOn(channelId, pitch, velocity, time) {
      const slot = slots.get(channelId);
      slot?.synth?.attack(pitch + slot.octave * 12, time, velocity);
    },
    noteOff(channelId, pitch, time) {
      const slot = slots.get(channelId);
      slot?.synth?.release(pitch + slot.octave * 12, time);
    },
    sync(p) {
      const audible = audibleChannels(p);
      const keep = new Set<string>();
      for (const ch of p.channels) {
        keep.add(ch.id);
        let slot = slots.get(ch.id);
        if (!slot) {
          slot = newSlot();
          slots.set(ch.id, slot);
        }
        const key = voiceKey(p, ch);
        if (slot.key !== key) {
          if (slot.key) freeVoice(slot, true);
          slot.key = key;
          slot.sound = ch.sound;
          makeVoice(p, ch, slot);
        }
        applyStrip(slot, ch, ch.kind === "synth" ? !ch.muted : audible.has(ch.id));
      }
      for (const [id, slot] of slots) {
        if (keep.has(id)) continue;
        disposeSlot(slot);
        slots.delete(id);
      }
      // Master strip and the shared returns.
      master.gain.rampTo(p.master.volume, 0.02);
      // 0.7 is a small room; 0.97 a long hall.
      reverb.roomSize.value = 0.7 + p.master.reverbSize * 0.27;
      delay.delayTime.rampTo((60 / p.bpm) * DELAY_BEATS[p.master.delayTime], 0.05);
      delay.feedback.rampTo(p.master.delayFeedback, 0.05);
    },
    setBacking(keep, level) {
      backing = keep === null ? null : { keep, level: Math.min(1, Math.max(0, level)) };
    },
    silence(time) {
      slots.forEach((s) => s.synth?.releaseAll(time));
    },
    dispose() {
      slots.forEach(disposeSlot);
      slots.clear();
      [reverb, delay, master, limiter].forEach((n) => n.dispose());
    },
  };
  graph.sync(project);
  return graph;
}
