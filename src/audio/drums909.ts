import * as Tone from "tone";
import type { DrumVoice } from "./drums";

/**
 * A kit modeled on the Roland TR-909, the drum machine behind house and
 * techno. Next to the 808 it is punchier and brighter: a kick with a hard
 * click and a fast pitch drop, a snare with lots of bright "snappy" noise,
 * and crisp metallic hats and cymbals. The real machine played its cymbals
 * from tiny recordings; here every sound is synthesized, then baked like the
 * other drums (see bake.ts), so playing them costs next to nothing.
 */

const all = (...nodes: { dispose(): unknown }[]) => () => nodes.forEach((n) => n.dispose());

export function kick909(): DrumVoice {
  const out = new Tone.Gain(1);
  const drive = new Tone.Distortion({ distortion: 0.2, wet: 0.4 }).connect(out);
  // A sine dropping from about 245 Hz to 49 Hz in 30 ms: the 909 thump.
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 5,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.05 },
    volume: 0,
  }).connect(drive);
  // The beater click that makes a 909 kick cut through a mix.
  const hp = new Tone.BiquadFilter({ type: "highpass", frequency: 1500 }).connect(out);
  const click = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.005, sustain: 0 },
    volume: -8,
  }).connect(hp);
  return {
    output: out,
    trigger: (t) => {
      body.triggerAttackRelease("G1", 0.4, t);
      click.triggerAttack(t);
    },
    dispose: all(body, drive, click, hp, out),
  };
}

export function snare909(): DrumVoice {
  const out = new Tone.Gain(1);
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.015,
    octaves: 1.4,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.02 },
    volume: -6,
  }).connect(out);
  const ring = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    volume: -12,
  }).connect(out);
  // Bright, long "snappy" noise: the part that makes it a 909 snare.
  const lp = new Tone.BiquadFilter({ type: "lowpass", frequency: 9000 }).connect(out);
  const hp = new Tone.BiquadFilter({ type: "highpass", frequency: 1800 }).connect(lp);
  const snappy = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
    volume: -4,
  }).connect(hp);
  return {
    output: out,
    trigger: (t) => {
      body.triggerAttackRelease(190, 0.08, t);
      ring.triggerAttackRelease(330, 0.04, t);
      snappy.triggerAttack(t);
    },
    dispose: all(body, ring, snappy, hp, lp, out),
  };
}

export function clap909(): DrumVoice {
  const out = new Tone.Gain(1.6);
  const hp = new Tone.BiquadFilter({ type: "highpass", frequency: 600 }).connect(out);
  const band = new Tone.BiquadFilter({ type: "bandpass", frequency: 1300, Q: 1.4 }).connect(hp);
  const bursts = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.009, sustain: 0 },
  }).connect(band);
  const tail = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
    volume: -3,
  }).connect(band);
  return {
    output: out,
    // Three quick hands, then the room.
    trigger: (t) => {
      for (const d of [0, 0.009, 0.018]) bursts.triggerAttack(t + d);
      tail.triggerAttack(t + 0.026);
    },
    dispose: all(bursts, tail, band, hp, out),
  };
}

/** Metallic tones plus a little noise, high-passed: crisp hats. */
function hat909(decay: number, gainDb: number): DrumVoice {
  const out = new Tone.BiquadFilter({ type: "highpass", frequency: 8000 });
  const metal = new Tone.MetalSynth({
    harmonicity: 5.1,
    modulationIndex: 50,
    resonance: 9000,
    octaves: 1.2,
    envelope: { attack: 0.001, decay, release: 0.02 },
    volume: -14 + gainDb,
  }).connect(out);
  const air = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: decay * 0.7, sustain: 0 },
    volume: -16 + gainDb,
  }).connect(out);
  return {
    output: out,
    trigger: (t) => {
      metal.triggerAttack(330, t);
      air.triggerAttack(t);
    },
    choke: (t) => {
      metal.triggerRelease(t);
      air.triggerRelease(t);
    },
    dispose: all(metal, air, out),
  };
}

export const closedHat909 = () => hat909(0.045, 0);
export const openHat909 = () => hat909(0.35, 1.5);

export function tom909(): DrumVoice {
  const out = new Tone.Gain(1);
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.07,
    octaves: 1.8,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.05 },
    volume: -1.5,
  }).connect(out);
  const lp = new Tone.BiquadFilter({ type: "lowpass", frequency: 3000 }).connect(out);
  const skin = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    volume: -24,
  }).connect(lp);
  return {
    output: out,
    trigger: (t) => {
      body.triggerAttackRelease(123, 0.3, t);
      skin.triggerAttack(t);
    },
    dispose: all(body, skin, lp, out),
  };
}

export function rim909(): DrumVoice {
  const out = new Tone.BiquadFilter({ type: "highpass", frequency: 400 });
  const opts = { oscillator: { type: "triangle" as const }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 } };
  const high = new Tone.Synth({ ...opts, envelope: { ...opts.envelope, decay: 0.015 }, volume: -4.5 }).connect(out);
  const low = new Tone.Synth({ ...opts, volume: -6.5 }).connect(out);
  const click = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.008, sustain: 0 },
    volume: -16,
  }).connect(out);
  return {
    output: out,
    trigger: (t) => {
      high.triggerAttackRelease(1700, 0.015, t);
      low.triggerAttackRelease(500, 0.03, t);
      click.triggerAttack(t);
    },
    dispose: all(high, low, click, out),
  };
}

/** A splash of bright noise over a long metallic ring. */
export function crash909(): DrumVoice {
  const out = new Tone.BiquadFilter({ type: "highpass", frequency: 4500 });
  const wash = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.002, decay: 1.5, sustain: 0 },
    volume: -12,
  }).connect(out);
  const metal = new Tone.MetalSynth({
    harmonicity: 3.2,
    modulationIndex: 30,
    resonance: 6000,
    octaves: 1.5,
    envelope: { attack: 0.002, decay: 1.2, release: 0.3 },
    volume: -22,
  }).connect(out);
  return {
    output: out,
    trigger: (t) => {
      wash.triggerAttack(t);
      metal.triggerAttack(400, t);
    },
    dispose: all(wash, metal, out),
  };
}

/** A ride: a darker metallic ring with a bell ping on top. */
export function ride909(): DrumVoice {
  const out = new Tone.BiquadFilter({ type: "highpass", frequency: 3500 });
  const metal = new Tone.MetalSynth({
    harmonicity: 8,
    modulationIndex: 18,
    resonance: 5000,
    octaves: 0.8,
    envelope: { attack: 0.001, decay: 1.0, release: 0.3 },
    volume: -21,
  }).connect(out);
  const bell = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 },
    volume: -24,
  }).connect(out);
  const hiss = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.5, sustain: 0 },
    volume: -30,
  }).connect(out);
  return {
    output: out,
    trigger: (t) => {
      metal.triggerAttack(480, t);
      bell.triggerAttackRelease(3740, 0.2, t);
      hiss.triggerAttack(t);
    },
    dispose: all(metal, bell, hiss, out),
  };
}
