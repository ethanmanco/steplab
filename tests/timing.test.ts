import { describe, expect, it } from "vitest";
import {
  DEFAULT_BPM,
  MAX_STEPS,
  clampBars,
  clampBpm,
  clampSwing,
  clampTimeSig,
  exactStepFromTicks,
  loopSeconds,
  loopSteps,
  maxBarsFor,
  pulseSteps,
  secondsPerStep,
  stepFromTicks,
  stepPosition,
  stepsPerBar,
  swingDelay,
} from "../src/core/timing";

const sig = (beats: number, unit: 4 | 8) => ({ beats, unit });

describe("clampBpm", () => {
  it("keeps values inside 60..180 and rounds them", () => {
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(97.6)).toBe(98);
    expect(clampBpm("140")).toBe(140);
    expect(clampBpm(10)).toBe(60);
    expect(clampBpm(999)).toBe(180);
  });

  it("falls back to the default for junk", () => {
    for (const v of ["fast", Number.NaN, undefined, null, "", Infinity, true]) {
      expect(clampBpm(v)).toBe(DEFAULT_BPM);
    }
  });
});

describe("time signatures", () => {
  it("counts sixteenth steps per bar", () => {
    expect(stepsPerBar(sig(4, 4))).toBe(16);
    expect(stepsPerBar(sig(3, 4))).toBe(12);
    expect(stepsPerBar(sig(6, 8))).toBe(12);
    expect(stepsPerBar(sig(7, 8))).toBe(14);
    expect(stepsPerBar(sig(5, 4))).toBe(20);
  });

  it("pulses on the beat, or every dotted quarter in compound meters", () => {
    expect(pulseSteps(sig(4, 4))).toBe(4);
    expect(pulseSteps(sig(3, 4))).toBe(4);
    expect(pulseSteps(sig(6, 8))).toBe(6);
    expect(pulseSteps(sig(12, 8))).toBe(6);
    expect(pulseSteps(sig(7, 8))).toBe(2);
    expect(pulseSteps(sig(3, 8))).toBe(2);
  });

  it("clamps beats to 1..12 and the unit to 4 or 8", () => {
    expect(clampTimeSig({ beats: 0, unit: 8 })).toEqual(sig(1, 8));
    expect(clampTimeSig({ beats: 40, unit: 16 })).toEqual(sig(12, 4));
    expect(clampTimeSig({ beats: "6", unit: "8" })).toEqual(sig(6, 8));
    expect(clampTimeSig(null)).toEqual(sig(4, 4));
  });
});

describe("bars", () => {
  it("allows 1 to 16 bars of 4/4", () => {
    expect(clampBars(0)).toBe(1);
    expect(clampBars(7)).toBe(7);
    expect(clampBars("12")).toBe(12);
    expect(clampBars(99)).toBe(16);
    expect(clampBars("lots")).toBe(1);
  });

  it("caps long bars so a loop never passes the step limit", () => {
    expect(maxBarsFor(sig(4, 4))).toBe(16);
    expect(maxBarsFor(sig(12, 4))).toBe(5);
    expect(clampBars(16, sig(12, 4))).toBe(5);
    for (let beats = 1; beats <= 12; beats++) {
      for (const unit of [4, 8] as const) {
        const s = sig(beats, unit);
        expect(loopSteps(maxBarsFor(s), s)).toBeLessThanOrEqual(MAX_STEPS);
      }
    }
  });

  it("finds a step's bar and position inside it", () => {
    expect(stepPosition(17, sig(4, 4))).toEqual({ bar: 1, inBar: 1 });
    expect(stepPosition(17, sig(3, 4))).toEqual({ bar: 1, inBar: 5 });
    expect(stepPosition(0, sig(7, 8))).toEqual({ bar: 0, inBar: 0 });
  });
});

describe("durations", () => {
  it("makes a sixteenth at 120 BPM last 125 ms and a 4/4 bar 2 s", () => {
    expect(secondsPerStep(120)).toBeCloseTo(0.125);
    expect(loopSeconds(120, 1, sig(4, 4))).toBeCloseTo(2);
    expect(loopSeconds(120, 2, sig(3, 4))).toBeCloseTo(3);
    expect(loopSeconds(60, 1, sig(6, 8))).toBeCloseTo(3);
  });
});

describe("stepFromTicks", () => {
  const PPQ = 192; // Tone.js default: 48 ticks per sixteenth

  it("maps ticks onto loop steps and wraps at the loop length", () => {
    expect(stepFromTicks(0, PPQ, 16)).toBe(0);
    expect(stepFromTicks(48 * 15, PPQ, 16)).toBe(15);
    expect(stepFromTicks(48 * 16, PPQ, 16)).toBe(0);
    expect(stepFromTicks(48 * 13, PPQ, 12)).toBe(1);
  });

  it("absorbs tiny clock jitter", () => {
    expect(stepFromTicks(48 * 3 - 0.4, PPQ, 16)).toBe(3);
    expect(stepFromTicks(48 * 3 + 0.4, PPQ, 16)).toBe(3);
  });

  it("keeps the fraction when asked", () => {
    expect(exactStepFromTicks(48 * 2 + 24, PPQ, 16)).toBeCloseTo(2.5);
    expect(exactStepFromTicks(48 * 17 + 12, PPQ, 16)).toBeCloseTo(1.25);
  });
});

describe("swing", () => {
  it("only delays the off sixteenths", () => {
    expect(swingDelay(0, 1, 120)).toBe(0);
    expect(swingDelay(2, 1, 120)).toBe(0);
    expect(swingDelay(1, 0, 120)).toBe(0);
  });

  it("reaches a triplet feel (a third of a step) at full swing", () => {
    expect(swingDelay(1, 1, 120)).toBeCloseTo(0.125 / 3);
    expect(swingDelay(3, 0.5, 120)).toBeCloseTo(0.125 / 6);
  });

  it("clamps swing to 0..1", () => {
    expect(clampSwing(2)).toBe(1);
    expect(clampSwing(-1)).toBe(0);
    expect(clampSwing("0.3")).toBeCloseTo(0.3);
    expect(clampSwing("x")).toBe(0);
  });
});
