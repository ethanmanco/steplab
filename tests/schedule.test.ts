import { describe, expect, it } from "vitest";
import { addNote, demoProject, emptyProject, setTrackMix, toggleDrumStep } from "../src/core/project";
import { audibleTracks, eventsAtStep, playLength } from "../src/core/schedule";
import type { Note } from "../src/core/types";

const n = (step: number, pitch: number, length = 1, velocity = 0.8): Note => ({ step, pitch, length, velocity });

describe("eventsAtStep", () => {
  it("returns nothing for an empty project", () => {
    expect(eventsAtStep(emptyProject(), 0)).toEqual({ drums: [], melodies: [] });
  });

  it("lists every drum that hits on a step, in row order", () => {
    const e = eventsAtStep(demoProject(), 12);
    expect(e.drums.map((d) => d.id)).toEqual(["snare", "chat", "clap"]);
  });

  it("skips muted rows", () => {
    const p = setTrackMix(demoProject(), "drums", 1, { muted: true });
    expect(eventsAtStep(p, 12).drums.map((d) => d.id)).toEqual(["chat", "clap"]);
  });

  it("reads hits far into a long loop", () => {
    const p = toggleDrumStep({ ...emptyProject(), bars: 8 }, 5, 120);
    expect(eventsAtStep(p, 120).drums).toEqual([{ track: 5, id: "tom" }]);
  });

  it("starts notes with their pitch, velocity and length", () => {
    let p = addNote(emptyProject(), 1, n(3, 48, 4, 0.5));
    p = addNote(p, 1, n(3, 55, 2));
    expect(eventsAtStep(p, 3).melodies).toEqual([
      {
        track: 1,
        synth: "bass",
        notes: [
          { pitch: 48, velocity: 0.5, steps: 4 },
          { pitch: 55, velocity: 0.8, steps: 2 },
        ],
      },
    ]);
    // Held steps do not retrigger.
    expect(eventsAtStep(p, 4).melodies).toEqual([]);
  });
});

describe("solo", () => {
  it("plays only soloed tracks once any track is soloed", () => {
    const p = setTrackMix(demoProject(), "drums", 0, { solo: true });
    const a = audibleTracks(p);
    expect(a.drums).toEqual([true, false, false, false, false, false]);
    expect(a.melodies).toEqual([false, false]);
    expect(eventsAtStep(p, 0).drums.map((d) => d.id)).toEqual(["kick"]);
  });

  it("lets mute beat solo and allows several solos", () => {
    let p = setTrackMix(demoProject(), "drums", 0, { solo: true, muted: true });
    p = setTrackMix(p, "melodies", 1, { solo: true });
    const a = audibleTracks(p);
    expect(a.drums[0]).toBe(false);
    expect(a.melodies).toEqual([false, true]);
  });
});

describe("playLength", () => {
  it("uses the note's own length when nothing cuts it", () => {
    const p = addNote(emptyProject(), 0, n(0, 60, 4));
    const m = p.melodies[0]!;
    expect(playLength(m, m.notes[0]!, 16)).toBe(4);
  });

  it("stops before the same pitch starts again, across the loop end", () => {
    let p = addNote(emptyProject(), 0, n(14, 60, 4));
    p = addNote(p, 0, n(0, 60, 1));
    const m = p.melodies[0]!;
    const late = m.notes.find((x) => x.step === 14)!;
    expect(playLength(m, late, 16)).toBe(2);
    // A different pitch does not cut it.
    const q = addNote(addNote(emptyProject(), 0, n(14, 60, 4)), 0, n(0, 62));
    const lm = q.melodies[0]!;
    expect(playLength(lm, lm.notes.find((x) => x.step === 14)!, 16)).toBe(4);
  });
});
