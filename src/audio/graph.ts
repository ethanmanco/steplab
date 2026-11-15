import * as Tone from "tone";
import { volumeToDb } from "../core/mix";
import { rowToMidi } from "../core/notes";
import { eventsAtStep } from "../core/schedule";
import { secondsPerStep } from "../core/timing";
import type { Project, SynthId, TrackMix } from "../core/types";
import { createDrumKit } from "./drums";
import { createInstrument, type Instrument } from "./instruments";

/**
 * The sound-making part of the app: instruments, one channel strip per track,
 * and a master limiter. It knows nothing about the transport, so the live
 * engine and the offline WAV render build the exact same graph.
 */
export interface Graph {
  playStep(project: Project, step: number, time: number): void;
  previewDrum(project: Project, track: number, time: number): void;
  previewNote(project: Project, track: number, row: number, time: number): void;
  applyMix(project: Project): void;
  silence(time?: number): void;
  dispose(): void;
}

/** Notes end a little before the next step so repeated notes stay distinct. */
const NOTE_FILL = 0.9;

function setChannel(ch: Tone.Channel, mix: TrackMix): void {
  ch.mute = mix.muted;
  const db = volumeToDb(mix.volume);
  if (Number.isFinite(db)) ch.volume.rampTo(db, 0.02);
  else ch.volume.value = -Infinity;
}

interface MelodySlot {
  channel: Tone.Channel;
  synth: SynthId;
  instrument: Instrument;
}

export function createGraph(project: Project): Graph {
  const limiter = new Tone.Limiter(-1).toDestination();
  const master = new Tone.Gain(0.85).connect(limiter);

  const kit = createDrumKit();
  const drumChannels = project.drums.map((d) => {
    const ch = new Tone.Channel().connect(master);
    kit[d.id].output.connect(ch);
    return ch;
  });

  const melodies: MelodySlot[] = project.melodies.map((m) => {
    const channel = new Tone.Channel().connect(master);
    const instrument = createInstrument(m.synth);
    instrument.output.connect(channel);
    return { channel, synth: m.synth, instrument };
  });

  /** Swap a track's instrument when its sound is changed. */
  function syncSynths(p: Project) {
    p.melodies.forEach((m, i) => {
      const slot = melodies[i];
      if (!slot || slot.synth === m.synth) return;
      const old = slot.instrument;
      old.releaseAll();
      // Let any release tail finish before freeing the old synth.
      setTimeout(() => old.dispose(), 1500);
      slot.instrument = createInstrument(m.synth);
      slot.instrument.output.connect(slot.channel);
      slot.synth = m.synth;
    });
  }

  const graph: Graph = {
    playStep(p, step, time) {
      const events = eventsAtStep(p, step);
      for (const hit of events.drums) kit[hit.id].trigger(time);
      const stepSec = secondsPerStep(p.bpm);
      for (const hit of events.melodies) {
        const inst = melodies[hit.track]?.instrument;
        if (!inst) continue;
        for (const n of hit.notes) inst.play(n.midi, n.steps * stepSec * NOTE_FILL, time);
      }
    },
    previewDrum(p, track, time) {
      const d = p.drums[track];
      if (d && !d.muted) kit[d.id].trigger(time);
    },
    previewNote(p, track, row, time) {
      const m = p.melodies[track];
      const inst = melodies[track]?.instrument;
      if (!m || m.muted || !inst) return;
      inst.play(rowToMidi(m.synth, row), secondsPerStep(p.bpm) * 2, time);
    },
    applyMix(p) {
      syncSynths(p);
      p.drums.forEach((d, i) => {
        const ch = drumChannels[i];
        if (ch) setChannel(ch, d);
      });
      p.melodies.forEach((m, i) => {
        const slot = melodies[i];
        if (slot) setChannel(slot.channel, m);
      });
    },
    silence(time) {
      melodies.forEach((s) => s.instrument.releaseAll(time));
    },
    dispose() {
      Object.values(kit).forEach((v) => v.dispose());
      drumChannels.forEach((c) => c.dispose());
      melodies.forEach((s) => {
        s.instrument.dispose();
        s.channel.dispose();
      });
      master.dispose();
      limiter.dispose();
    },
  };
  graph.applyMix(project);
  return graph;
}
