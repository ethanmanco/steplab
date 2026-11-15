import { describe, expect, it } from "vitest";
import { oscillatorLayers, waveCoefficients } from "../src/audio/layers";

describe("oscillatorLayers", () => {
  it("spreads detuned saws like Tone's FatOscillator", () => {
    const { layers, levelDb } = oscillatorLayers({ type: "fatsawtooth", count: 3, spread: 30 });
    expect(layers.map((l) => l.detune)).toEqual([-15, 0, 15]);
    expect(layers.map((l) => l.phase)).toEqual([0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]);
    expect(layers.every((l) => l.type === "sawtooth")).toBe(true);
    expect(levelDb).toBeCloseTo(-9.3);
  });

  it("covers the full spread for a supersaw", () => {
    const { layers, levelDb } = oscillatorLayers({ type: "fatsawtooth", count: 7, spread: 45 });
    expect(layers).toHaveLength(7);
    expect(layers[0]!.detune).toBe(-22.5);
    expect(layers[6]!.detune).toBe(22.5);
    expect(levelDb).toBeCloseTo(-13.7);
  });

  it("uses one layer at full level for plain and custom waves", () => {
    expect(oscillatorLayers({ type: "sine" })).toEqual({ layers: [{ type: "sine", phase: 0, detune: 0 }], levelDb: 0 });
    const custom = oscillatorLayers({ type: "custom", partials: [1, 0.5] });
    expect(custom.layers).toEqual([{ type: "custom", phase: 0, detune: 0, partials: [1, 0.5] }]);
  });
});

describe("waveCoefficients", () => {
  it("leaves basic waves at phase 0 to the browser", () => {
    expect(waveCoefficients({ type: "sawtooth", phase: 0, detune: 0 })).toBeNull();
    expect(waveCoefficients({ type: "triangle", phase: 0, detune: 0 })).toBeNull();
  });

  it("rotates a sawtooth's harmonics by the phase", () => {
    const [real, imag] = waveCoefficients({ type: "sawtooth", phase: Math.PI / 2, detune: 0 })!;
    expect(real).toHaveLength(2048);
    // Harmonic 1: b = 2 / pi, turned a quarter cycle.
    expect(real[1]).toBeCloseTo(-2 / Math.PI);
    expect(imag[1]).toBeCloseTo(0);
    // Harmonic 2: b = -1 / pi, turned half a cycle.
    expect(real[2]).toBeCloseTo(0);
    expect(imag[2]).toBeCloseTo(1 / Math.PI);
    expect(real[0]).toBe(0);
    expect(imag[0]).toBe(0);
  });

  it("writes custom partials as sine terms", () => {
    const [real, imag] = waveCoefficients({ type: "custom", phase: 0, detune: 0, partials: [1, 0, 0.25] })!;
    expect(Array.from(imag)).toEqual([0, 1, 0, 0.25]);
    expect(Array.from(real).every((x) => x === 0)).toBe(true);
  });
});
