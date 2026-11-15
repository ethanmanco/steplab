import * as Tone from "tone";
import { midiToFreq } from "../core/notes";
import type { SynthId } from "../core/types";

/** A playable melody voice: polyphonic, so a step can hold a chord. */
export interface Instrument {
  output: Tone.ToneAudioNode;
  /** A note with a known length, from the sequencer. */
  play(midi: number, seconds: number, time: number, velocity: number): void;
  /** Start and end a held note, from a live keyboard. */
  attack(midi: number, time: number, velocity: number): void;
  release(midi: number, time: number): void;
  releaseAll(time?: number): void;
  dispose(): void;
}

function wrap(synth: Tone.PolySynth, chain: Tone.ToneAudioNode[] = []): Instrument {
  const nodes = [synth, ...chain];
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
  return {
    output: nodes[nodes.length - 1]!,
    play: (midi, seconds, time, velocity) =>
      synth.triggerAttackRelease(midiToFreq(midi), seconds, time, velocity),
    attack: (midi, time, velocity) => synth.triggerAttack(midiToFreq(midi), time, velocity),
    release: (midi, time) => synth.triggerRelease(midiToFreq(midi), time),
    releaseAll: (time) => synth.releaseAll(time),
    dispose: () => nodes.forEach((n) => n.dispose()),
  };
}

const builders: Record<SynthId, () => Instrument> = {
  // Detuned saws through a low-pass filter: bright but not harsh.
  lead: () =>
    wrap(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 18 },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.5, release: 0.12 },
        volume: -14,
      }),
      [new Tone.Filter({ type: "lowpass", frequency: 2800, Q: 1 })],
    ),

  // A square wave with a quick filter sweep on every note.
  bass: () =>
    wrap(
      new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "square" },
        filter: { type: "lowpass", Q: 2, rolloff: -24 },
        envelope: { attack: 0.003, decay: 0.2, sustain: 0.6, release: 0.08 },
        filterEnvelope: {
          attack: 0.002,
          decay: 0.18,
          sustain: 0.25,
          release: 0.1,
          baseFrequency: 110,
          octaves: 3.2,
        },
        volume: -8,
      }),
    ),

  // FM with a fast-falling envelope: a bell-ish pluck.
  pluck: () =>
    wrap(
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 4,
        oscillator: { type: "sine" },
        modulation: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 },
        modulationEnvelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.2 },
        volume: -6,
      }),
    ),

  // Slow attack and long release, filtered soft.
  pad: () =>
    wrap(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
        envelope: { attack: 0.16, decay: 0.3, sustain: 0.7, release: 0.9 },
        volume: -18,
      }),
      [new Tone.Filter({ type: "lowpass", frequency: 1300, Q: 0.5 })],
    ),
};

export function createInstrument(id: SynthId): Instrument {
  return builders[id]();
}
