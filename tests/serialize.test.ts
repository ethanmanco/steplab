import { describe, expect, it } from "vitest";
import { demoProject, emptyProject, setLoopBars, setSynth, setTrackMix } from "../src/core/project";
import { parseProject, serializeProject } from "../src/core/serialize";
import { MAX_STEPS } from "../src/core/timing";

function parseOk(text: string) {
  const r = parseProject(text);
  if (!r.ok) throw new Error(r.error);
  return r.project;
}

const file = (extra: Record<string, unknown>) => JSON.stringify({ app: "steplab", version: 1, ...extra });

describe("serializeProject and parseProject", () => {
  it("round trips a project exactly", () => {
    let p = setLoopBars(demoProject(), 4);
    p = setSynth(p, 1, "pad");
    p = setTrackMix(p, "drums", 3, { volume: 0.25, muted: true });
    p = { ...p, bpm: 93 };
    expect(parseOk(serializeProject(p))).toEqual(p);
    expect(parseOk(serializeProject(p, true))).toEqual(p);
  });

  it("tags files so other JSON is not mistaken for a project", () => {
    const data = JSON.parse(serializeProject(emptyProject()));
    expect(data.app).toBe("steplab");
    expect(data.version).toBe(1);
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
      if (!r.ok) expect(r.error).toMatch(/not a Steplab project/);
    }
  });

  it("files from a newer version", () => {
    const r = parseProject(JSON.stringify({ app: "steplab", version: 2 }));
    expect(r.ok).toBe(false);
  });
});

describe("parseProject repairs", () => {
  it("fills a bare file with defaults", () => {
    expect(parseOk(file({}))).toEqual(emptyProject());
  });

  it("clamps tempo and fixes a bad loop length", () => {
    const p = parseOk(file({ bpm: 400, bars: 3 }));
    expect(p.bpm).toBe(180);
    expect(p.bars).toBe(1);
  });

  it("pads short step lists and drops extra steps", () => {
    const p = parseOk(file({ drums: [{ id: "kick", steps: [true, false, true] }] }));
    const kick = p.drums[0]!;
    expect(kick.steps).toHaveLength(MAX_STEPS);
    expect(kick.steps.slice(0, 4)).toEqual([true, false, true, false]);
    const long = parseOk(file({ drums: [{ id: "kick", steps: Array(200).fill(true) }] }));
    expect(long.drums[0]!.steps).toHaveLength(MAX_STEPS);
  });

  it("keeps drum rows in the standard order whatever the file order", () => {
    const p = parseOk(file({ drums: [{ id: "tom", steps: [true] }, { id: "kick", steps: [] }] }));
    expect(p.drums.map((d) => d.id)).toEqual(["kick", "snare", "chat", "ohat", "clap", "tom"]);
    expect(p.drums[5]!.steps[0]).toBe(true);
  });

  it("ignores unknown drums", () => {
    const p = parseOk(file({ drums: [{ id: "cowbell", steps: [true] }] }));
    expect(p.drums.every((d) => d.steps.every((s) => !s))).toBe(true);
  });

  it("cleans melody notes: range, whole numbers, duplicates, order", () => {
    const p = parseOk(file({ melodies: [{ synth: "pluck", notes: [[7, 3, 3, 99, -1, 2.5, "x"], "junk"] }] }));
    expect(p.melodies[0]!.synth).toBe("pluck");
    expect(p.melodies[0]!.notes[0]).toEqual([3, 7]);
    expect(p.melodies[0]!.notes[1]).toEqual([]);
    expect(p.melodies[0]!.notes).toHaveLength(MAX_STEPS);
  });

  it("falls back to the default sound for unknown synths", () => {
    const p = parseOk(file({ melodies: [{ synth: "theremin" }, { synth: "kazoo" }] }));
    expect(p.melodies.map((m) => m.synth)).toEqual(["lead", "bass"]);
  });

  it("clamps volume and only accepts true for muted", () => {
    const p = parseOk(file({ drums: [{ id: "kick", volume: 7, muted: "yes" }] }));
    expect(p.drums[0]).toMatchObject({ volume: 1, muted: false });
    const q = parseOk(file({ drums: [{ id: "kick", volume: "loud" }] }));
    expect(q.drums[0]!.volume).toBe(0.8);
  });
});
