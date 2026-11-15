import { describe, expect, it } from "vitest";
import { parsePercent, volumePercent, volumeToDb } from "../src/core/mix";

describe("parsePercent", () => {
  it("reads typed percentages", () => {
    expect(parsePercent("75")).toBe(0.75);
    expect(parsePercent("75%")).toBe(0.75);
    expect(parsePercent(" 42.5 % ")).toBeCloseTo(0.425);
    expect(parsePercent("0")).toBe(0);
  });

  it("clamps to 0..100", () => {
    expect(parsePercent("150")).toBe(1);
    expect(parsePercent("-20")).toBe(0);
  });

  it("refuses anything that is not a number", () => {
    for (const t of ["", "loud", "5x", "%", "1.2.3"]) expect(parsePercent(t)).toBeNull();
  });
});

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
