import { describe, expect, it } from "vitest";
import { demoProject, emptyProject, setSynth, setTrackMix, toggleDrumStep } from "../src/core/project";
import { eventsAtStep, noteSteps } from "../src/core/schedule";

describe("eventsAtStep", () => {
  it("returns nothing for an empty project", () => {
    expect(eventsAtStep(emptyProject(), 0)).toEqual({ drums: [], melodies: [] });
  });

  it("lists every drum that hits on a step, in row order", () => {
    const e = eventsAtStep(demoProject(), 12);
    expect(e.drums.map((d) => d.id)).toEqual(["snare", "chat", "clap"]);
    expect(e.drums.map((d) => d.track)).toEqual([1, 2, 4]);
  });

  it("skips muted drum rows", () => {
    const p = setTrackMix(demoProject(), "drums", 1, { muted: true });
    expect(eventsAtStep(p, 12).drums.map((d) => d.id)).toEqual(["chat", "clap"]);
  });

  it("reads hits beyond bar 1", () => {
    const p = toggleDrumStep(emptyProject(), 5, 50);
    expect(eventsAtStep(p, 50).drums).toEqual([{ track: 5, id: "tom" }]);
  });

  it("returns melody chords with their synth and real pitches", () => {
    const p = emptyProject();
    p.melodies[1]!.notes[3] = [0, 7];
    expect(eventsAtStep(p, 3).melodies).toEqual([
      {
        track: 1,
        synth: "bass",
        notes: [
          { row: 0, midi: 36, steps: 1 },
          { row: 7, midi: 43, steps: 1 },
        ],
      },
    ]);
  });

  it("skips muted melody tracks", () => {
    const p = emptyProject();
    p.melodies[0]!.notes[0] = [5];
    expect(eventsAtStep(p, 0).melodies).toHaveLength(1);
    const muted = setTrackMix(p, "melodies", 0, { muted: true });
    expect(eventsAtStep(muted, 0).melodies).toEqual([]);
  });
});

describe("noteSteps", () => {
  const pad = () => {
    const p = setSynth(emptyProject(), 0, "pad");
    return p;
  };

  it("uses the synth's gate length when nothing follows", () => {
    const p = pad();
    p.melodies[0]!.notes[0] = [4];
    expect(noteSteps(p.melodies[0]!, 0, 4, 1)).toBe(4);
    expect(noteSteps(p.melodies[1]!, 0, 4, 1)).toBe(1); // bass
  });

  it("stops before the same pitch starts again", () => {
    const p = pad();
    p.melodies[0]!.notes[0] = [4];
    p.melodies[0]!.notes[2] = [4];
    expect(noteSteps(p.melodies[0]!, 0, 4, 1)).toBe(2);
  });

  it("is not cut short by a different pitch", () => {
    const p = pad();
    p.melodies[0]!.notes[0] = [4];
    p.melodies[0]!.notes[1] = [7];
    expect(noteSteps(p.melodies[0]!, 0, 4, 1)).toBe(4);
  });

  it("looks across the loop end", () => {
    const p = pad();
    p.melodies[0]!.notes[15] = [4];
    p.melodies[0]!.notes[0] = [4];
    expect(noteSteps(p.melodies[0]!, 15, 4, 1)).toBe(1);
    // In a 2 bar loop step 16 comes next instead, which is empty.
    expect(noteSteps(p.melodies[0]!, 15, 4, 2)).toBe(4);
  });
});
