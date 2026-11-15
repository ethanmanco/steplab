/**
 * The oscillator math behind the light synth voices in voices.ts, kept free of
 * Tone so it can be unit tested. It mirrors what Tone's Synth, FatOscillator
 * and Oscillator build, so a light voice sounds the same as the Tone voice it
 * replaces.
 */

/** A basic wave, a stack of detuned saws, or a set of harmonics. */
export type LightOscillator =
  | { type: "sine" | "triangle" | "sawtooth" }
  | { type: "fatsawtooth"; count: number; spread: number }
  | { type: "custom"; partials: number[] };

/** One oscillator in a voice. Phase in radians, detune in cents. */
export interface Layer {
  type: "sine" | "triangle" | "sawtooth" | "custom";
  phase: number;
  detune: number;
  partials?: number[];
}

export interface LayerPlan {
  layers: Layer[];
  /** Level of each layer in dB, as Tone sets it. */
  levelDb: number;
}

export function oscillatorLayers(osc: LightOscillator): LayerPlan {
  if (osc.type === "fatsawtooth") {
    const count = Math.max(1, Math.round(osc.count));
    // FatOscillator: detunes spread evenly across the spread, phases spread
    // around the cycle, each layer turned down so the stack sums to a sane level.
    const start = count > 1 ? -osc.spread / 2 : 0;
    const step = count > 1 ? osc.spread / (count - 1) : 0;
    const layers: Layer[] = [];
    for (let i = 0; i < count; i++) {
      layers.push({
        type: "sawtooth",
        phase: ((i / count) * 360 * Math.PI) / 180,
        detune: start + step * i,
      });
    }
    return { layers, levelDb: -6 - count * 1.1 };
  }
  if (osc.type === "custom")
    return {
      layers: [{ type: "custom", phase: 0, detune: 0, partials: osc.partials }],
      levelDb: 0,
    };
  return { layers: [{ type: osc.type, phase: 0, detune: 0 }], levelDb: 0 };
}

/**
 * Fourier coefficients for a layer's PeriodicWave, exactly as Tone's
 * Oscillator computes them, or null when the browser's built-in wave of that
 * type is used (Tone does the same for a basic wave at phase 0).
 */
export function waveCoefficients(layer: Layer): [Float32Array, Float32Array] | null {
  if (layer.type !== "custom" && layer.phase === 0) return null;
  const size = layer.type === "custom" ? (layer.partials?.length ?? 0) + 1 : 2048;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  for (let n = 1; n < size; n++) {
    const piFactor = 2 / (n * Math.PI);
    let b = 0;
    switch (layer.type) {
      case "sine":
        b = n <= 1 ? 1 : 0;
        break;
      case "sawtooth":
        b = piFactor * (n & 1 ? 1 : -1);
        break;
      case "triangle":
        b = n & 1 ? 2 * piFactor * piFactor * (((n - 1) >> 1) & 1 ? -1 : 1) : 0;
        break;
      case "custom":
        b = layer.partials?.[n - 1] ?? 0;
        break;
    }
    if (b !== 0) {
      real[n] = -b * Math.sin(layer.phase * n);
      imag[n] = b * Math.cos(layer.phase * n);
    }
  }
  return [real, imag];
}
