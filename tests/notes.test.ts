import { describe, expect, it } from "vitest";
import {
  ROLL_HIGH,
  ROLL_LOW,
  ROLL_ROWS,
  SYNTHS,
  inRollRange,
  isBlackKey,
  midiToFreq,
  midiToName,
  midiToSpoken,
} from "../src/core/notes";
import { demoProject } from "../src/core/project";
import { SYNTH_IDS } from "../src/core/types";

describe("note names", () => {
  it("uses scientific pitch names", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(61)).toBe("C#4");
    expect(midiToName(36)).toBe("C2");
    expect(midiToName(83)).toBe("B5");
  });

  it("spells sharps out for screen readers", () => {
    expect(midiToSpoken(61)).toBe("C sharp 4");
    expect(midiToSpoken(60)).toBe("C4");
  });

  it("knows the black keys", () => {
    const black = Array.from({ length: 12 }, (_, i) => isBlackKey(60 + i));
    expect(black).toEqual([false, true, false, true, false, false, true, false, true, false, true, false]);
  });

  it("tunes A4 to 440 Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe("piano roll range", () => {
  it("spans four octaves from C2 to B5", () => {
    expect(ROLL_ROWS).toBe(48);
    expect(midiToName(ROLL_LOW)).toBe("C2");
    expect(midiToName(ROLL_HIGH)).toBe("B5");
    expect(inRollRange(36)).toBe(true);
    expect(inRollRange(84)).toBe(false);
    expect(inRollRange(60.5)).toBe(false);
  });

  it("gives every sound a home pitch on the roll", () => {
    for (const id of SYNTH_IDS) expect(inRollRange(SYNTHS[id].home)).toBe(true);
  });

  it("keeps the demo melodies on the roll", () => {
    for (const m of demoProject().patterns.flatMap((x) => (x.kind === "melody" ? [x] : []))) {
      expect(m.notes.length).toBeGreaterThan(0);
      for (const n of m.notes) expect(inRollRange(n.pitch)).toBe(true);
    }
  });
});
