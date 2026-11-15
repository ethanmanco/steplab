import { describe, expect, it } from "vitest";
import { addNote, demoProject, emptyProject, setLoopBars, setSwing, setSynth, setTimeSig, setTrackMix } from "../src/core/project";
import { parseProject, serializeProject } from "../src/core/serialize";

function parseOk(text: string) {
  const r = parseProject(text);
  if (!r.ok) throw new Error(r.error);
  return r.project;
}

const file = (extra: Record<string, unknown>) => JSON.stringify({ app: "steplab", version: 2, ...extra });

describe("serializeProject and parseProject", () => {
  it("round trips a project exactly", () => {
    let p = setLoopBars(demoProject(), 5);
    p = setTimeSig(p, { beats: 7, unit: 8 });
    p = setSynth(p, 1, "pad");
    p = setSwing(p, 0.35);
    p = setTrackMix(p, "drums", 3, { volume: 0.25, muted: true, solo: true });
    p = addNote(p, 0, { step: 40, pitch: 83, length: 6, velocity: 0.33 });
    p = { ...p, bpm: 93 };
    expect(parseOk(serializeProject(p))).toEqual(p);
    expect(parseOk(serializeProject(p, true))).toEqual(p);
  });

  it("tags files so other JSON is not mistaken for a project", () => {
    const data = JSON.parse(serializeProject(emptyProject()));
    expect(data.app).toBe("steplab");
    expect(data.version).toBe(2);
  });
});

describe("parseProject rejects", () => {
  it("text that is not JSON", () => {
    expect(parseProject("{nope")).toEqual({ ok: false, error: "That file is not valid JSON." });
  });

  it("JSON from somewhere else", () => {
    for (const text of ["[]", "null", "42", JSON.stringify({ bpm: 120 }), JSON.stringify({ app: "other" })]) {
      const r = parseProject(text);
      expect(r.ok).toBe(false);
    }
  });

  it("files from a newer version", () => {
    expect(parseProject(JSON.stringify({ app: "steplab", version: 3 })).ok).toBe(false);
  });
});

describe("parseProject repairs", () => {
  it("fills a bare file with defaults", () => {
    expect(parseOk(file({}))).toEqual(emptyProject());
  });

  it("clamps tempo, bars, swing and time signature", () => {
    const p = parseOk(file({ bpm: 400, bars: 99, swing: 3, timeSig: { beats: 12, unit: 4 } }));
    expect(p).toMatchObject({ bpm: 180, bars: 5, swing: 1, timeSig: { beats: 12, unit: 4 } });
  });

  it("drops bad drum steps and sorts the rest", () => {
    const p = parseOk(file({ drums: [{ id: "kick", steps: [9, 2, 2, -1, 1.5, "x", 9999] }] }));
    expect(p.drums[0]!.steps).toEqual([2, 9]);
  });

  it("keeps drum rows in the standard order and ignores unknown drums", () => {
    const p = parseOk(file({ drums: [{ id: "tom", steps: [0] }, { id: "cowbell", steps: [1] }] }));
    expect(p.drums.map((d) => d.id)).toEqual(["kick", "snare", "chat", "ohat", "clap", "tom"]);
    expect(p.drums[5]!.steps).toEqual([0]);
  });

  it("cleans notes: range, duplicates, lengths, velocity", () => {
    const p = parseOk(
      file({
        melodies: [
          {
            synth: "pluck",
            notes: [
              { step: 4, pitch: 60, length: 2, velocity: 0.5 },
              { step: 4, pitch: 60, length: 9 },
              { step: 0, pitch: 20 },
              { step: 1, pitch: 62, length: -3, velocity: 7 },
              "junk",
            ],
          },
        ],
      }),
    );
    expect(p.melodies[0]!.synth).toBe("pluck");
    expect(p.melodies[0]!.notes).toEqual([
      { step: 1, pitch: 62, length: 1, velocity: 1 },
      { step: 4, pitch: 60, length: 2, velocity: 0.5 },
    ]);
  });

  it("falls back to default sounds and mix values", () => {
    const p = parseOk(file({ melodies: [{ synth: "theremin" }], drums: [{ id: "kick", volume: "loud", muted: "yes" }] }));
    expect(p.melodies[0]!.synth).toBe("lead");
    expect(p.drums[0]).toMatchObject({ volume: 0.8, muted: false, solo: false });
  });
});

describe("version 1 files", () => {
  it("upgrades on/off steps and relative piano rows", () => {
    const steps = Array(64).fill(false);
    steps[0] = true;
    steps[20] = true;
    const notes: number[][] = Array.from({ length: 64 }, () => []);
    notes[2] = [0, 7];
    const v1 = JSON.stringify({
      app: "steplab",
      version: 1,
      bpm: 100,
      bars: 2,
      drums: [{ id: "kick", steps, volume: 0.5, muted: true }],
      melodies: [{ synth: "pad", notes, volume: 0.6, muted: false }, { synth: "bass", notes: [[12]] }],
    });
    const p = parseOk(v1);
    expect(p).toMatchObject({ version: 2, bpm: 100, bars: 2, timeSig: { beats: 4, unit: 4 } });
    expect(p.drums[0]).toMatchObject({ steps: [0, 20], volume: 0.5, muted: true, solo: false });
    // Pad rows started at C3 (48) and rang for four steps.
    expect(p.melodies[0]!.notes.map((x) => [x.step, x.pitch, x.length])).toEqual([[2, 48, 4], [2, 55, 4]]);
    // Bass rows started at C2 (36).
    expect(p.melodies[1]!.notes.map((x) => [x.step, x.pitch, x.length])).toEqual([[0, 48, 1]]);
  });
});
