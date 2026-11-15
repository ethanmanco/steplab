import { describe, expect, it } from "vitest";
import {
  DEFAULT_BPM,
  absoluteStep,
  barOfStep,
  clampBpm,
  isLoopBars,
  loopSeconds,
  loopSteps,
  secondsPerStep,
  stepFromTicks,
  stepInBar,
} from "../src/core/timing";

describe("clampBpm", () => {
  it("keeps values inside 60..180 and rounds them", () => {
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(97.6)).toBe(98);
    expect(clampBpm("140")).toBe(140);
  });

  it("clamps out of range values to the edges", () => {
    expect(clampBpm(10)).toBe(60);
    expect(clampBpm(999)).toBe(180);
    expect(clampBpm(-5)).toBe(60);
  });

  it("falls back to the default for junk", () => {
    expect(clampBpm("fast")).toBe(DEFAULT_BPM);
    expect(clampBpm(Number.NaN)).toBe(DEFAULT_BPM);
    expect(clampBpm(undefined)).toBe(DEFAULT_BPM);
    expect(clampBpm(null)).toBe(DEFAULT_BPM);
    expect(clampBpm("")).toBe(DEFAULT_BPM);
    expect(clampBpm(Infinity)).toBe(DEFAULT_BPM);
  });
});

describe("step durations", () => {
  it("makes a sixteenth note at 120 BPM last 125 ms", () => {
    expect(secondsPerStep(120)).toBeCloseTo(0.125);
  });

  it("makes one bar at 120 BPM last 2 seconds", () => {
    expect(loopSeconds(120, 1)).toBeCloseTo(2);
    expect(loopSeconds(120, 4)).toBeCloseTo(8);
    expect(loopSeconds(60, 1)).toBeCloseTo(4);
  });

  it("counts 16 steps per bar", () => {
    expect(loopSteps(1)).toBe(16);
    expect(loopSteps(2)).toBe(32);
    expect(loopSteps(4)).toBe(64);
  });
});

describe("bar and step conversions", () => {
  it("round trips between absolute steps and bar positions", () => {
    for (let s = 0; s < 64; s++) {
      expect(absoluteStep(barOfStep(s), stepInBar(s))).toBe(s);
    }
    expect(barOfStep(17)).toBe(1);
    expect(stepInBar(17)).toBe(1);
  });

  it("only accepts 1, 2 or 4 bars", () => {
    expect(isLoopBars(1)).toBe(true);
    expect(isLoopBars(2)).toBe(true);
    expect(isLoopBars(4)).toBe(true);
    expect(isLoopBars(3)).toBe(false);
    expect(isLoopBars("4")).toBe(false);
  });
});

describe("stepFromTicks", () => {
  const PPQ = 192; // Tone.js default: 48 ticks per sixteenth

  it("maps transport ticks onto loop steps", () => {
    expect(stepFromTicks(0, PPQ, 1)).toBe(0);
    expect(stepFromTicks(48, PPQ, 1)).toBe(1);
    expect(stepFromTicks(48 * 15, PPQ, 1)).toBe(15);
  });

  it("wraps around at the loop length", () => {
    expect(stepFromTicks(48 * 16, PPQ, 1)).toBe(0);
    expect(stepFromTicks(48 * 17, PPQ, 1)).toBe(1);
    expect(stepFromTicks(48 * 17, PPQ, 2)).toBe(17);
    expect(stepFromTicks(48 * 64, PPQ, 4)).toBe(0);
  });

  it("absorbs tiny clock jitter by rounding to the nearest step", () => {
    expect(stepFromTicks(48 * 3 - 0.4, PPQ, 1)).toBe(3);
    expect(stepFromTicks(48 * 3 + 0.4, PPQ, 1)).toBe(3);
  });

  it("follows the current loop length when it shrinks mid play", () => {
    // Playing step 40 of a 4 bar loop, then switching to 1 bar.
    expect(stepFromTicks(48 * 40, PPQ, 1)).toBe(8);
  });

  it("works with other PPQ settings", () => {
    expect(stepFromTicks(24 * 5, 96, 1)).toBe(5);
  });
});
