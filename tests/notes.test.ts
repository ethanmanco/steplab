import { describe, expect, it } from "vitest";
import {
  PIANO_ROWS,
  SYNTHS,
  isBlackKey,
  midiToFreq,
  midiToName,
  midiToSpoken,
  rowToMidi,
} from "../src/core/notes";
import { clearMelody, demoProject, emptyProject, setSynth, toggleNote } from "../src/core/project";
import { SYNTH_IDS } from "../src/core/types";

describe("note names", () => {
  it("uses scientific pitch names", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(61)).toBe("C#4");
    expect(midiToName(36)).toBe("C2");
    expect(midiToName(71)).toBe("B4");
    expect(midiToName(69)).toBe("A4");
  });

  it("spells sharps out for screen readers", () => {
    expect(midiToSpoken(61)).toBe("C sharp 4");
    expect(midiToSpoken(60)).toBe("C4");
  });

  it("knows the black keys", () => {
    const black = Array.from({ length: 12 }, (_, i) => isBlackKey(60 + i));
    expect(black).toEqual([false, true, false, true, false, false, true, false, true, false, true, false]);
  });

  it("tunes A4 to 440 Hz and doubles per octave", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });
});

describe("synth ranges", () => {
  it("gives every synth two octaves starting on a C", () => {
    for (const id of SYNTH_IDS) {
      expect(midiToName(rowToMidi(id, 0))).toMatch(/^C\d$/);
      expect(rowToMidi(id, PIANO_ROWS - 1) - rowToMidi(id, 0)).toBe(23);
    }
  });

  it("puts the bass two octaves under the lead", () => {
    expect(rowToMidi("lead", 0) - rowToMidi("bass", 0)).toBe(24);
    expect(SYNTHS.bass.name).toBe("Bass");
  });
});

describe("toggleNote", () => {
  it("adds and removes a note without touching the original", () => {
    const p = emptyProject();
    const a = toggleNote(p, 0, 3, 7);
    expect(a.melodies[0]!.notes[3]).toEqual([7]);
    expect(p.melodies[0]!.notes[3]).toEqual([]);
    expect(toggleNote(a, 0, 3, 7).melodies[0]!.notes[3]).toEqual([]);
  });

  it("stacks notes into a sorted chord", () => {
    let p = emptyProject();
    p = toggleNote(p, 1, 0, 7);
    p = toggleNote(p, 1, 0, 0);
    p = toggleNote(p, 1, 0, 4);
    expect(p.melodies[1]!.notes[0]).toEqual([0, 4, 7]);
    expect(p.melodies[0]!.notes[0]).toEqual([]);
  });
});

describe("setSynth and clearMelody", () => {
  it("changes the sound but keeps the notes", () => {
    const p = setSynth(demoProject(), 0, "pad");
    expect(p.melodies[0]!.synth).toBe("pad");
    expect(p.melodies[0]!.notes).toEqual(demoProject().melodies[0]!.notes);
  });

  it("clears only one track", () => {
    const p = clearMelody(demoProject(), 0);
    expect(p.melodies[0]!.notes.every((n) => n.length === 0)).toBe(true);
    expect(p.melodies[1]!.notes.some((n) => n.length > 0)).toBe(true);
  });

  it("starts the demo with notes on both tracks inside the range", () => {
    for (const m of demoProject().melodies) {
      const rows = m.notes.flat();
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r).toBeGreaterThanOrEqual(0);
      for (const r of rows) expect(r).toBeLessThan(PIANO_ROWS);
    }
  });
});
