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

/**
 * An 808 bass: one sine voice with a quick pitch drop for the knock at the
 * start, a long body, and a little saturation so it is heard on small
 * speakers. Like the original it is monophonic: a new note cuts the last one.
 */
function bass808(): Instrument {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.035,
    octaves: 1.3,
    oscillator: { type: "sine" },
    envelope: { attack: 0.003, decay: 1.4, sustain: 0.55, release: 0.3 },
    volume: -1,
  });
  const drive = new Tone.Distortion({ distortion: 0.35, wet: 0.35 });
  const filter = new Tone.Filter({ type: "lowpass", frequency: 1400, Q: 0.5 });
  synth.chain(drive, filter);
  let held: number | null = null;
  return {
    output: filter,
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
    dispose: () => [synth, drive, filter].forEach((n) => n.dispose()),
  };
}

const builders: Record<SynthId, () => Instrument> = {
  b808: bass808,

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

  // A warm sawtooth with a gentle filter sweep. Less resonance than before,
  // so it thumps instead of bleeping.
  bass: () =>
    wrap(
      new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "sawtooth" },
        filter: { type: "lowpass", Q: 0.8, rolloff: -24 },
        envelope: { attack: 0.004, decay: 0.3, sustain: 0.75, release: 0.12 },
        filterEnvelope: {
          attack: 0.003,
          decay: 0.3,
          sustain: 0.35,
          release: 0.15,
          baseFrequency: 80,
          octaves: 2.4,
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
