import * as Tone from "tone";
import type { DrumVoice } from "./drums";

/**
 * A kit modeled on the Roland TR-808. The original machine made every sound
 * with analog circuits rather than recordings, so the same recipes work in
 * code: a pitch-dropping sine for the kick, two tuned tones plus noise for
 * the snare, clusters of square waves for hats and cowbell. No sample files,
 * so nothing to license.
 */

const all = (...nodes: { dispose(): unknown }[]) => () => nodes.forEach((n) => n.dispose());

export function kick808(): DrumVoice {
  const drive = new Tone.Distortion({ distortion: 0.12, wet: 0.5 });
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 3,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 1.1, sustain: 0, release: 0.2 },
    volume: 2,
  }).connect(drive);
  return {
    output: drive,
    trigger: (t) => body.triggerAttackRelease("A1", 1, t),
    dispose: all(body, drive),
  };
}

export function snare808(): DrumVoice {
  const out = new Tone.Gain(1);
  const low = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
    volume: -8,
  }).connect(out);
  const high = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
    volume: -12,
  }).connect(out);
  const filter = new Tone.Filter({ type: "highpass", frequency: 1800 }).connect(out);
  const snap = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
    volume: -6,
  }).connect(filter);
  return {
    output: out,
    trigger: (t) => {
      low.triggerAttackRelease(185, 0.1, t);
      high.triggerAttackRelease(330, 0.06, t);
      snap.triggerAttack(t);
    },
    dispose: all(low, high, filter, snap, out),
  };
}

function hat808(decay: number): DrumVoice {
  const filter = new Tone.Filter({ type: "highpass", frequency: 7500 });
  const metal = new Tone.MetalSynth({
    harmonicity: 5.1,
    modulationIndex: 40,
    resonance: 8000,
    octaves: 1,
    envelope: { attack: 0.001, decay, release: 0.02 },
    volume: -16,
  }).connect(filter);
  return {
    output: filter,
    trigger: (t) => metal.triggerAttack(300, t),
    choke: (t) => metal.triggerRelease(t),
    dispose: all(metal, filter),
  };
}

export const closedHat808 = () => hat808(0.035);
export const openHat808 = () => hat808(0.55);

export function clap808(): DrumVoice {
  const filter = new Tone.Filter({ type: "bandpass", frequency: 1000, Q: 2 });
  const out = new Tone.Gain(1.8);
  filter.connect(out);
  const bursts = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.01, sustain: 0 },
  }).connect(filter);
  const tail = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0 },
    volume: -4,
  }).connect(filter);
  return {
    output: out,
    trigger: (t) => {
      for (const d of [0, 0.01, 0.02, 0.03]) bursts.triggerAttack(t + d);
      tail.triggerAttack(t + 0.035);
    },
    dispose: all(filter, bursts, tail, out),
  };
}

export function tom808(): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.12,
    octaves: 1.5,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.1 },
    volume: -2,
  });
  return {
    output: synth,
    trigger: (t) => synth.triggerAttackRelease("E2", 0.45, t),
    dispose: all(synth),
  };
}

/** Two short, high tones through a high-pass filter: the 808 rimshot click. */
export function rim808(): DrumVoice {
  const filter = new Tone.Filter({ type: "highpass", frequency: 300 });
  const opts = { oscillator: { type: "triangle" as const }, envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 } };
  const a = new Tone.Synth({ ...opts, volume: -4 }).connect(filter);
  const b = new Tone.Synth({ ...opts, volume: -8 }).connect(filter);
  return {
    output: filter,
    trigger: (t) => {
      a.triggerAttackRelease(455, 0.02, t);
      b.triggerAttackRelease(1667, 0.02, t);
    },
    dispose: all(a, b, filter),
  };
}

/** Two square waves at 540 and 800 Hz through a band-pass filter, like the original circuit. */
export function cowbell808(): DrumVoice {
  const filter = new Tone.Filter({ type: "bandpass", frequency: 800, Q: 0.8 });
  const out = new Tone.Gain(1.2);
  filter.connect(out);
  const opts = { oscillator: { type: "square" as const }, envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.05 } };
  const a = new Tone.Synth({ ...opts, volume: -14 }).connect(filter);
  const b = new Tone.Synth({ ...opts, volume: -14 }).connect(filter);
  return {
    output: out,
    trigger: (t) => {
      a.triggerAttackRelease(540, 0.3, t);
      b.triggerAttackRelease(800, 0.3, t);
    },
    dispose: all(a, b, filter, out),
  };
}
