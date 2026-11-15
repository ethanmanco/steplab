import { describe, expect, it } from "vitest";
import { volumePercent, volumeToDb } from "../src/core/mix";

describe("volumeToDb", () => {
  it("is 0 dB at full volume and silent at zero", () => {
    expect(volumeToDb(1)).toBeCloseTo(0);
    expect(volumeToDb(0)).toBe(-Infinity);
  });

  it("uses a squared curve", () => {
    expect(volumeToDb(0.5)).toBeCloseTo(-12.04, 1);
    expect(volumeToDb(0.1)).toBeCloseTo(-40);
  });

  it("rises steadily", () => {
    let last = -Infinity;
    for (let v = 0.05; v <= 1; v += 0.05) {
      const db = volumeToDb(v);
      expect(db).toBeGreaterThan(last);
      last = db;
    }
  });

  it("clamps junk", () => {
    expect(volumeToDb(2)).toBeCloseTo(0);
    expect(volumeToDb(-1)).toBe(-Infinity);
    expect(volumeToDb(Number.NaN)).toBe(-Infinity);
  });
});

describe("volumePercent", () => {
  it("formats faders as whole percents", () => {
    expect(volumePercent(0.8)).toBe("80%");
    expect(volumePercent(0.333)).toBe("33%");
    expect(volumePercent(5)).toBe("100%");
  });
});
