import { describe, expect, it } from "vitest";
import {
  addNote,
  clearDrums,
  clearMelody,
  demoProject,
  emptyProject,
  noteAt,
  removeNoteAt,
  resizeNoteAt,
  setBpm,
  setDrumStep,
  setLoopBars,
  setSwing,
  setSynth,
  setTimeSig,
  setTrackMix,
  toggleDrumStep,
} from "../src/core/project";
import { DRUM_IDS, type Note } from "../src/core/types";

const n = (step: number, pitch: number, length = 1): Note => ({ step, pitch, length, velocity: 0.8 });
const shape = (notes: Note[]) => notes.map((x) => [x.step, x.pitch, x.length]);

describe("emptyProject", () => {
  it("has six drum rows, two melody tracks, one bar of 4/4", () => {
    const p = emptyProject();
    expect(p.drums.map((d) => d.id)).toEqual([...DRUM_IDS]);
    expect(p.melodies.map((m) => m.synth)).toEqual(["lead", "bass"]);
    expect(p).toMatchObject({ bars: 1, timeSig: { beats: 4, unit: 4 }, swing: 0, version: 2 });
  });
});

describe("drum steps", () => {
  it("toggles a step without touching the original", () => {
    const p = emptyProject();
    const a = toggleDrumStep(p, 0, 4);
    expect(a.drums[0]!.steps).toEqual([4]);
    expect(p.drums[0]!.steps).toEqual([]);
    expect(toggleDrumStep(a, 0, 4).drums[0]!.steps).toEqual([]);
  });

  it("keeps steps sorted and sets on or off explicitly", () => {
    let p = setDrumStep(emptyProject(), 1, 9, true);
    p = setDrumStep(p, 1, 2, true);
    p = setDrumStep(p, 1, 2, true);
    expect(p.drums[1]!.steps).toEqual([2, 9]);
    expect(setDrumStep(p, 1, 9, false).drums[1]!.steps).toEqual([2]);
  });

  it("returns the same project when nothing changes", () => {
    const p = demoProject();
    expect(setDrumStep(p, 0, 0, true)).toBe(p);
    expect(setDrumStep(p, 0, -1, true)).toBe(p);
  });

  it("clears every row and keeps mix settings", () => {
    const p = clearDrums(setTrackMix(demoProject(), "drums", 0, { muted: true }));
    expect(p.drums.every((d) => d.steps.length === 0)).toBe(true);
    expect(p.drums[0]!.muted).toBe(true);
  });
});

describe("melody notes", () => {
  it("finds a note by any step it covers", () => {
    const p = addNote(emptyProject(), 0, n(4, 60, 3));
    const m = p.melodies[0]!;
    expect(noteAt(m, 4, 60)).toBeDefined();
    expect(noteAt(m, 6, 60)).toBeDefined();
    expect(noteAt(m, 7, 60)).toBeUndefined();
    expect(noteAt(m, 5, 61)).toBeUndefined();
  });

  it("stacks chords and keeps notes sorted", () => {
    let p = addNote(emptyProject(), 0, n(2, 67));
    p = addNote(p, 0, n(0, 64));
    p = addNote(p, 0, n(0, 60));
    expect(shape(p.melodies[0]!.notes)).toEqual([[0, 60, 1], [0, 64, 1], [2, 67, 1]]);
  });

  it("trims an earlier same-pitch note that a new one overlaps", () => {
    let p = addNote(emptyProject(), 0, n(0, 60, 8));
    p = addNote(p, 0, n(4, 60, 2));
    expect(shape(p.melodies[0]!.notes)).toEqual([[0, 60, 4], [4, 60, 2]]);
  });

  it("replaces same-pitch notes that start inside a new one", () => {
    let p = addNote(emptyProject(), 0, n(2, 60));
    p = addNote(p, 0, n(5, 60));
    p = addNote(p, 0, n(5, 62));
    p = addNote(p, 0, n(0, 60, 8));
    expect(shape(p.melodies[0]!.notes)).toEqual([[0, 60, 8], [5, 62, 1]]);
  });

  it("removes a note from any of its steps", () => {
    const p = addNote(emptyProject(), 1, n(3, 48, 4));
    expect(removeNoteAt(p, 1, 5, 48).melodies[1]!.notes).toEqual([]);
    expect(removeNoteAt(p, 1, 8, 48)).toBe(p);
  });

  it("resizes a note and never below one step", () => {
    const p = addNote(emptyProject(), 0, n(3, 60, 2));
    expect(shape(resizeNoteAt(p, 0, 4, 60, 5).melodies[0]!.notes)).toEqual([[3, 60, 5]]);
    expect(shape(resizeNoteAt(p, 0, 3, 60, 0).melodies[0]!.notes)).toEqual([[3, 60, 1]]);
  });

  it("clamps velocity and length", () => {
    const p = addNote(emptyProject(), 0, { step: 0, pitch: 60, length: 2.6, velocity: 4 });
    expect(p.melodies[0]!.notes[0]).toMatchObject({ length: 3, velocity: 1 });
  });

  it("changes sound without moving notes, and clears one track", () => {
    const d = demoProject();
    const p = setSynth(d, 0, "pad");
    expect(p.melodies[0]!.synth).toBe("pad");
    expect(p.melodies[0]!.notes).toBe(d.melodies[0]!.notes);
    const c = clearMelody(demoProject(), 0);
    expect(c.melodies[0]!.notes).toEqual([]);
    expect(c.melodies[1]!.notes.length).toBeGreaterThan(0);
  });
});

describe("song settings", () => {
  it("clamps tempo and swing", () => {
    expect(setBpm(emptyProject(), 300).bpm).toBe(180);
    expect(setSwing(emptyProject(), 0.4).swing).toBeCloseTo(0.4);
    expect(setSwing(emptyProject(), 9).swing).toBe(1);
  });

  it("sets volume, mute and solo on one track", () => {
    const p = setTrackMix(emptyProject(), "drums", 1, { volume: 0.3, muted: true, solo: true });
    expect(p.drums[1]).toMatchObject({ volume: 0.3, muted: true, solo: true });
    expect(p.drums[0]).toMatchObject({ volume: 0.8, muted: false, solo: false });
    expect(setTrackMix(p, "drums", 1, { volume: 5 }).drums[1]!.volume).toBe(1);
    expect(setTrackMix(p, "drums", 1, { volume: Number.NaN }).drums[1]!.volume).toBe(0.3);
  });
});

describe("setLoopBars", () => {
  it("repeats the loop into empty new bars", () => {
    const p = setLoopBars(toggleDrumStep(toggleDrumStep(emptyProject(), 0, 0), 0, 5), 3);
    expect(p.bars).toBe(3);
    expect(p.drums[0]!.steps).toEqual([0, 5, 16, 21, 32, 37]);
  });

  it("repeats notes too, with their lengths", () => {
    const p = setLoopBars(addNote(emptyProject(), 0, n(2, 60, 3)), 2);
    expect(shape(p.melodies[0]!.notes)).toEqual([[2, 60, 3], [18, 60, 3]]);
  });

  it("keeps hidden bars when shrinking and brings them back when growing", () => {
    let p = setLoopBars(emptyProject(), 2);
    p = toggleDrumStep(p, 0, 0);
    p = toggleDrumStep(p, 0, 20);
    const regrown = setLoopBars(setLoopBars(p, 1), 2);
    expect(regrown.drums[0]!.steps).toEqual([0, 20]);
  });

  it("decides per track whether to repeat", () => {
    let p = setLoopBars(emptyProject(), 2);
    p = toggleDrumStep(p, 0, 0);
    p = toggleDrumStep(p, 1, 2);
    p = toggleDrumStep(p, 1, 18);
    const g = setLoopBars(setLoopBars(p, 1), 2);
    expect(g.drums[0]!.steps).toEqual([0, 16]);
    expect(g.drums[1]!.steps).toEqual([2, 18]);
  });

  it("accepts typed numbers and clamps them", () => {
    expect(setLoopBars(emptyProject(), "5").bars).toBe(5);
    expect(setLoopBars(emptyProject(), 40).bars).toBe(16);
    expect(setLoopBars(emptyProject(), 0).bars).toBe(1);
  });

  it("uses the time signature for bar length", () => {
    let p = setTimeSig(emptyProject(), { beats: 3, unit: 4 });
    p = toggleDrumStep(p, 0, 0);
    expect(setLoopBars(p, 2).drums[0]!.steps).toEqual([0, 12]);
  });
});

describe("setTimeSig", () => {
  it("keeps notes in place and trims bars that no longer fit", () => {
    const p = setLoopBars(demoProject(), 16);
    const q = setTimeSig(p, { beats: 12, unit: 4 });
    expect(q.timeSig).toEqual({ beats: 12, unit: 4 });
    expect(q.bars).toBe(5);
    expect(q.drums).toBe(p.drums);
  });
});
