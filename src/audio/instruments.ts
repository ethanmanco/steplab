import * as Tone from "tone";
import { midiToFreq } from "../core/notes";
import type { SynthId, ToneShape } from "../core/types";

/** A playable melody voice. Most are polyphonic, so a step can hold a chord. */
export interface Instrument {
  output: Tone.ToneAudioNode;
  /** A note with a known length, from the sequencer. */
  play(midi: number, seconds: number, time: number, velocity: number): void;
  /** Start and end a held note, from a live keyboard. */
  attack(midi: number, time: number, velocity: number): void;
  release(midi: number, time: number): void;
  releaseAll(time?: number): void;
  /** Apply a channel's tone knobs: filter, envelope scaling and glide. */
  setTone(tone: ToneShape): void;
  dispose(): void;
}

/** 0.5 keeps the preset's envelope; 0 is a quarter as long, 1 four times as long. */
export const envelopeScale = (knob: number) => 4 ** ((knob - 0.5) * 2);
/** The tone filter: 60 Hz when closed up to 20 kHz (wide open) on a log scale. */
export const cutoffHz = (knob: number) => 60 * (20000 / 60) ** knob;

interface Shape {
  attack: number;
  release: number;
}

/** The low-pass filter at the end of every instrument, driven by the cutoff and resonance knobs. */
function shaper(): Tone.Filter {
  return new Tone.Filter({ type: "lowpass", frequency: 20000, Q: 0.5, rolloff: -12 });
}

function applyFilter(f: Tone.Filter, t: ToneShape) {
  f.frequency.rampTo(cutoffHz(t.cutoff), 0.03);
  f.Q.rampTo(0.5 + t.resonance * 14, 0.03);
}

function wrap(synth: Tone.PolySynth, base: Shape, chain: Tone.ToneAudioNode[] = []): Instrument {
  const tone = shaper();
  const nodes = [synth, ...chain, tone];
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
  return {
    output: tone,
    play: (midi, seconds, time, velocity) => synth.triggerAttackRelease(midiToFreq(midi), seconds, time, velocity),
    attack: (midi, time, velocity) => synth.triggerAttack(midiToFreq(midi), time, velocity),
    release: (midi, time) => synth.triggerRelease(midiToFreq(midi), time),
    releaseAll: (time) => synth.releaseAll(time),
    setTone(t) {
      applyFilter(tone, t);
      synth.set({
        envelope: { attack: base.attack * envelopeScale(t.attack), release: base.release * envelopeScale(t.release) },
        portamento: t.glide * 0.3,
      } as never);
    },
    dispose: () => nodes.forEach((n) => n.dispose()),
  };
}

/** Build a polyphonic preset: options for the voice, plus any effects between it and the tone filter. */
function poly(
  voice: typeof Tone.Synth | typeof Tone.MonoSynth | typeof Tone.FMSynth | typeof Tone.AMSynth,
  options: Record<string, unknown> & { envelope: Shape & Record<string, number> },
  chain: () => Tone.ToneAudioNode[] = () => [],
): () => Instrument {
  return () =>
    wrap(
      new Tone.PolySynth(voice as never, options as never),
      { attack: options.envelope.attack, release: options.envelope.release },
      chain(),
    );
}

/**
 * An 808 bass: one sine voice with a quick pitch drop for the knock at the
 * start, a long body, and a little saturation so it is heard on small
 * speakers. Like the original it is monophonic: a new note cuts the last one.
 */
function bass808(): Instrument {
  const base = { attack: 0.003, release: 0.3 };
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.035,
    octaves: 1.3,
    oscillator: { type: "sine" },
    envelope: { attack: base.attack, decay: 1.4, sustain: 0.55, release: base.release },
    volume: -1,
  });
  const drive = new Tone.Distortion({ distortion: 0.35, wet: 0.35 });
  const filter = new Tone.Filter({ type: "lowpass", frequency: 1400, Q: 0.5 });
  const tone = shaper();
  synth.chain(drive, filter, tone);
  let held: number | null = null;
  return {
    output: tone,
    play: (midi, seconds, time, velocity) => synth.triggerAttackRelease(midiToFreq(midi), seconds, time, velocity),
    attack: (midi, time, velocity) => {
      held = midi;
      synth.triggerAttack(midiToFreq(midi), time, velocity);
    },
    release: (midi, time) => {
      // Only the most recent key ends the note, so playing legato never cuts the newest one.
      if (held === midi) synth.triggerRelease(time);
    },
    releaseAll: (time) => synth.triggerRelease(time),
    setTone(t) {
      applyFilter(tone, t);
      synth.envelope.attack = base.attack * envelopeScale(t.attack);
      synth.envelope.release = base.release * envelopeScale(t.release);
      synth.set({ portamento: t.glide * 0.3 });
    },
    dispose: () => [synth, drive, filter, tone].forEach((n) => n.dispose()),
  };
}

const lowpass = (frequency: number, Q = 0.7) => () => [new Tone.Filter({ type: "lowpass", frequency, Q })];

const builders: Record<SynthId, () => Instrument> = {
  b808: bass808,

  // Detuned saws through a low-pass filter: bright but not harsh.
  lead: poly(
    Tone.Synth,
    {
      oscillator: { type: "fatsawtooth", count: 3, spread: 18 },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.5, release: 0.12 },
      volume: -14,
    },
    lowpass(2800, 1),
  ),

  // A warm sawtooth with a gentle filter sweep, so it thumps instead of bleeping.
  bass: poly(Tone.MonoSynth, {
    oscillator: { type: "sawtooth" },
    filter: { type: "lowpass", Q: 0.8, rolloff: -24 },
    envelope: { attack: 0.004, decay: 0.3, sustain: 0.75, release: 0.12 },
    filterEnvelope: { attack: 0.003, decay: 0.3, sustain: 0.35, release: 0.15, baseFrequency: 80, octaves: 2.4 },
    volume: -8,
  }),

  // FM with a fast-falling envelope: a bell-ish pluck.
  pluck: poly(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 4,
    oscillator: { type: "sine" },
    modulation: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 },
    modulationEnvelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.2 },
    volume: -6,
  }),

  // Slow attack and long release, filtered soft.
  pad: poly(
    Tone.Synth,
    {
      oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
      envelope: { attack: 0.16, decay: 0.3, sustain: 0.7, release: 0.9 },
      volume: -18,
    },
    lowpass(1300, 0.5),
  ),

  // Electric piano: two sine waves in FM, with the bright "tine" fading fast.
  keys: poly(Tone.FMSynth, {
    harmonicity: 1,
    modulationIndex: 3.5,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 0.002, decay: 1.6, sustain: 0.15, release: 0.6 },
    modulationEnvelope: { attack: 0.002, decay: 0.45, sustain: 0.1, release: 0.5 },
    volume: -8,
  }),

  // A plucked string body: falling harmonics with a quick decay and no sustain.
  piano: poly(
    Tone.Synth,
    {
      oscillator: { type: "custom", partials: [1, 0.55, 0.32, 0.22, 0.14, 0.09, 0.05, 0.03] },
      envelope: { attack: 0.002, decay: 2.2, sustain: 0, release: 0.7 },
      volume: -10,
    },
    lowpass(4200, 0.5),
  ),

  // Many detuned saws that swell in: a string section.
  strings: poly(
    Tone.Synth,
    {
      oscillator: { type: "fatsawtooth", count: 5, spread: 24 },
      envelope: { attack: 0.35, decay: 0.3, sustain: 0.85, release: 1.2 },
      volume: -20,
    },
    lowpass(3000, 0.5),
  ),

  // A sawtooth whose filter opens on each note, like a horn section.
  brass: poly(Tone.MonoSynth, {
    oscillator: { type: "sawtooth" },
    filter: { type: "lowpass", Q: 1, rolloff: -24 },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.2 },
    filterEnvelope: { attack: 0.06, decay: 0.3, sustain: 0.6, release: 0.2, baseFrequency: 300, octaves: 3 },
    volume: -12,
  }),

  // Inharmonic FM with a long ring: glassy bells.
  bell: poly(Tone.FMSynth, {
    harmonicity: 3.5,
    modulationIndex: 12,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 0.001, decay: 2.5, sustain: 0, release: 2 },
    modulationEnvelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1 },
    volume: -14,
  }),

  // Drawbar-style harmonics that sustain while held.
  organ: poly(Tone.Synth, {
    oscillator: { type: "custom", partials: [1, 1, 0.6, 0, 0.5, 0, 0.3, 0.25] },
    envelope: { attack: 0.005, decay: 0.1, sustain: 1, release: 0.08 },
    volume: -18,
  }),

  // Seven wide-detuned saws: the big trance and K-pop chorus lead.
  supersaw: poly(
    Tone.Synth,
    {
      oscillator: { type: "fatsawtooth", count: 7, spread: 45 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.4 },
      volume: -22,
    },
    lowpass(6500, 0.5),
  ),

  // A wooden bar: FM with a short, hollow decay.
  marimba: poly(Tone.FMSynth, {
    harmonicity: 4,
    modulationIndex: 2,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.3 },
    modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
    volume: -6,
  }),

  // A soft triangle with a gentle swell and vibrato.
  flute: poly(
    Tone.Synth,
    {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.08, decay: 0.1, sustain: 0.9, release: 0.25 },
      volume: -8,
    },
    () => [new Tone.Vibrato({ frequency: 5, depth: 0.08 }), new Tone.Filter({ type: "lowpass", frequency: 2600 })],
  ),

  // A pure sine low end.
  sub: poly(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.9, release: 0.15 },
    volume: -4,
  }),

  // Two detuned saws, filtered dark: the drum and bass "reese".
  reese: poly(
    Tone.Synth,
    {
      oscillator: { type: "fatsawtooth", count: 2, spread: 30 },
      envelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.2 },
      volume: -12,
    },
    lowpass(650, 2),
  ),

  // A narrow pulse wave: the classic game console sound.
  chip: poly(Tone.Synth, {
    oscillator: { type: "pulse", width: 0.25 },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.6, release: 0.05 },
    volume: -18,
  }),
};

export function createInstrument(id: SynthId): Instrument {
  return builders[id]();
}
