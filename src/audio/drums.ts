import * as Tone from "tone";
import type { DrumId } from "../core/types";

/**
 * Every drum is synthesized here: no samples, so nothing to license and
 * nothing to download. Each voice exposes one output node (the mixer hooks a
 * channel strip onto it) and a trigger that takes an exact audio time.
 */
export interface DrumVoice {
  output: Tone.ToneAudioNode;
  trigger(time: number): void;
  /** Cut a ringing sound short (a closed hat chokes an open hat). */
  choke?(time: number): void;
  dispose(): void;
}

function kick(): DrumVoice {
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.045,
    octaves: 7,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.05 },
  });
  // A tiny click on top so the kick still reads on phone speakers.
  const click = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.008, sustain: 0 },
    volume: -22,
  });
  const out = new Tone.Gain(1);
  body.connect(out);
  click.connect(out);
  return {
    output: out,
    trigger: (t) => {
      body.triggerAttackRelease("C1", 0.3, t);
      click.triggerAttack(t);
    },
    dispose: () => [body, click, out].forEach((n) => n.dispose()),
  };
}

function snare(): DrumVoice {
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 1.5,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
    volume: -6,
  });
  const filter = new Tone.Filter({ type: "highpass", frequency: 1800 });
  const noise = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.17, sustain: 0 },
    volume: -4,
  }).connect(filter);
  const out = new Tone.Gain(1);
  body.connect(out);
  filter.connect(out);
  return {
    output: out,
    trigger: (t) => {
      body.triggerAttackRelease("F#3", 0.1, t);
      noise.triggerAttack(t);
    },
    dispose: () => [body, filter, noise, out].forEach((n) => n.dispose()),
  };
}

function hat(decay: number): { voice: DrumVoice; synth: Tone.MetalSynth } {
  const filter = new Tone.Filter({ type: "highpass", frequency: 7000 });
  const synth = new Tone.MetalSynth({
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 6500,
    octaves: 1.5,
    envelope: { attack: 0.001, decay, release: 0.03 },
    volume: -14,
  }).connect(filter);
  return {
    synth,
    voice: {
      output: filter,
      trigger: (t) => synth.triggerAttack(220, t),
      choke: (t) => synth.triggerRelease(t),
      dispose: () => [synth, filter].forEach((n) => n.dispose()),
    },
  };
}

function clap(): DrumVoice {
  const filter = new Tone.Filter({ type: "bandpass", frequency: 1300, Q: 1.2 });
  const bursts = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.012, sustain: 0 },
  }).connect(filter);
  const tail = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
    volume: -3,
  }).connect(filter);
  const out = new Tone.Gain(1.4);
  filter.connect(out);
  return {
    output: out,
    // A clap is a few hands slightly out of sync, then the room.
    trigger: (t) => {
      bursts.triggerAttack(t);
      bursts.triggerAttack(t + 0.011);
      bursts.triggerAttack(t + 0.023);
      tail.triggerAttack(t + 0.031);
    },
    dispose: () => [filter, bursts, tail, out].forEach((n) => n.dispose()),
  };
}

function tom(): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 2.2,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.05 },
    volume: -2,
  });
  return {
    output: synth,
    trigger: (t) => synth.triggerAttackRelease("G2", 0.25, t),
    dispose: () => synth.dispose(),
  };
}

/** Build one drum sound. Every drum channel gets its own voice. */
export function createDrumVoice(id: DrumId): DrumVoice {
  switch (id) {
    case "kick":
      return kick();
    case "snare":
      return snare();
    case "chat":
      return hat(0.05).voice;
    case "ohat":
      return hat(0.38).voice;
    case "clap":
      return clap();
    case "tom":
      return tom();
  }
}
