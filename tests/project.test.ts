import { describe, expect, it } from "vitest";
import {
  clearDrums,
  demoProject,
  emptyProject,
  setBpm,
  setLoopBars,
  setTrackMix,
  toggleDrumStep,
} from "../src/core/project";
import { MAX_STEPS } from "../src/core/timing";
import { DRUM_IDS } from "../src/core/types";

const onSteps = (steps: boolean[]) => steps.flatMap((v, i) => (v ? [i] : []));

describe("emptyProject", () => {
  it("has six drum rows and two melody tracks, all full length", () => {
    const p = emptyProject();
    expect(p.drums.map((d) => d.id)).toEqual([...DRUM_IDS]);
    expect(p.melodies).toHaveLength(2);
    for (const d of p.drums) expect(d.steps).toHaveLength(MAX_STEPS);
    for (const m of p.melodies) expect(m.notes).toHaveLength(MAX_STEPS);
    expect(p.bars).toBe(1);
  });

  it("does not share note arrays between steps", () => {
    const p = emptyProject();
    p.melodies[0]!.notes[0]!.push(3);
    expect(p.melodies[0]!.notes[1]).toEqual([]);
  });
});

describe("toggleDrumStep", () => {
  it("turns a step on and back off without touching the original", () => {
    const p = emptyProject();
    const a = toggleDrumStep(p, 0, 4);
    expect(a.drums[0]!.steps[4]).toBe(true);
    expect(p.drums[0]!.steps[4]).toBe(false);
    const b = toggleDrumStep(a, 0, 4);
    expect(b.drums[0]!.steps[4]).toBe(false);
  });

  it("only changes the chosen row", () => {
    const a = toggleDrumStep(emptyProject(), 2, 7);
    a.drums.forEach((d, i) => expect(onSteps(d.steps)).toEqual(i === 2 ? [7] : []));
  });
});

describe("clearDrums", () => {
  it("empties every drum row and keeps mix settings", () => {
    const p = setTrackMix(demoProject(), "drums", 0, { muted: true });
    const c = clearDrums(p);
    for (const d of c.drums) expect(onSteps(d.steps)).toEqual([]);
    expect(c.drums[0]!.muted).toBe(true);
  });
});

describe("setBpm", () => {
  it("clamps tempo", () => {
    expect(setBpm(emptyProject(), 300).bpm).toBe(180);
    expect(setBpm(emptyProject(), "75").bpm).toBe(75);
  });
});

describe("setTrackMix", () => {
  it("sets volume and mute on one track", () => {
    const p = setTrackMix(emptyProject(), "drums", 1, { volume: 0.3, muted: true });
    expect(p.drums[1]).toMatchObject({ volume: 0.3, muted: true });
    expect(p.drums[0]).toMatchObject({ volume: 0.8, muted: false });
  });

  it("clamps volume to 0..1", () => {
    expect(setTrackMix(emptyProject(), "melodies", 0, { volume: 2 }).melodies[0]!.volume).toBe(1);
    expect(setTrackMix(emptyProject(), "melodies", 0, { volume: -1 }).melodies[0]!.volume).toBe(0);
  });

  it("leaves the other field alone when only one is given", () => {
    const p = setTrackMix(emptyProject(), "drums", 0, { volume: 0.5 });
    const q = setTrackMix(p, "drums", 0, { muted: true });
    expect(q.drums[0]).toMatchObject({ volume: 0.5, muted: true });
  });
});

describe("setLoopBars", () => {
  it("repeats bar 1 into empty new bars when the loop grows", () => {
    const p = toggleDrumStep(toggleDrumStep(emptyProject(), 0, 0), 0, 5);
    const g = setLoopBars(p, 4);
    expect(g.bars).toBe(4);
    expect(onSteps(g.drums[0]!.steps)).toEqual([0, 5, 16, 21, 32, 37, 48, 53]);
  });

  it("repeats a 2 bar loop when growing to 4", () => {
    let p = setLoopBars(emptyProject(), 2);
    p = toggleDrumStep(p, 1, 3);
    p = toggleDrumStep(p, 1, 20);
    const g = setLoopBars(p, 4);
    expect(onSteps(g.drums[1]!.steps)).toEqual([3, 20, 35, 52]);
  });

  it("keeps hidden bars when shrinking, and brings them back when growing again", () => {
    let p = setLoopBars(emptyProject(), 2);
    p = toggleDrumStep(p, 0, 0);
    p = toggleDrumStep(p, 0, 20); // something only in bar 2
    const shrunk = setLoopBars(p, 1);
    expect(shrunk.drums[0]!.steps[20]).toBe(true);
    const regrown = setLoopBars(shrunk, 2);
    expect(onSteps(regrown.drums[0]!.steps)).toEqual([0, 20]);
  });

  it("decides per track whether to repeat", () => {
    let p = setLoopBars(emptyProject(), 2);
    p = toggleDrumStep(p, 0, 0);
    p = toggleDrumStep(p, 1, 2);
    p = toggleDrumStep(p, 1, 18); // snare has its own bar 2
    p = setLoopBars(p, 1);
    const g = setLoopBars(p, 2);
    expect(onSteps(g.drums[0]!.steps)).toEqual([0, 16]);
    expect(onSteps(g.drums[1]!.steps)).toEqual([2, 18]);
  });

  it("copies melody notes without sharing arrays", () => {
    const p = emptyProject();
    p.melodies[0]!.notes[2] = [0, 4, 7];
    const g = setLoopBars(p, 2);
    expect(g.melodies[0]!.notes[18]).toEqual([0, 4, 7]);
    expect(g.melodies[0]!.notes[18]).not.toBe(g.melodies[0]!.notes[2]);
  });

  it("does nothing to steps when the length is unchanged", () => {
    const p = demoProject();
    expect(setLoopBars(p, 1).drums).toEqual(p.drums);
  });
});
