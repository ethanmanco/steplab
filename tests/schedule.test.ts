import { describe, expect, it } from "vitest";
import { demoProject, emptyProject, setTrackMix, toggleDrumStep } from "../src/core/project";
import { eventsAtStep } from "../src/core/schedule";

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

  it("returns melody chords with their synth", () => {
    const p = emptyProject();
    p.melodies[1]!.notes[3] = [0, 7];
    expect(eventsAtStep(p, 3).melodies).toEqual([{ track: 1, synth: "bass", rows: [0, 7] }]);
  });

  it("skips muted melody tracks and copies note arrays", () => {
    const p = emptyProject();
    p.melodies[0]!.notes[0] = [5];
    const e = eventsAtStep(p, 0);
    e.melodies[0]!.rows.push(9);
    expect(p.melodies[0]!.notes[0]).toEqual([5]);
    const muted = setTrackMix(p, "melodies", 0, { muted: true });
    expect(eventsAtStep(muted, 0).melodies).toEqual([]);
  });
});
