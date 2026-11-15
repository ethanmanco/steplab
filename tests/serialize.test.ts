import { describe, expect, it } from "vitest";
import { defaultBeat } from "../src/core/presets";
import {
  addClip,
  addSample,
  setChannelFx,
  setChannelPan,
  setChannelSample,
  setChannelTone,
  setMaster,
  addNote,
  drumChannels,
  emptyProject,
  setChannelMix,
  setPatternBars,
  setSwing,
  setTimeSig,
  synthChannels,
} from "../src/core/project";
import { parseProject, serializeProject } from "../src/core/serialize";
import type { DrumPattern, MelodyPattern } from "../src/core/types";

function parseOk(text: string) {
  const r = parseProject(text);
  if (!r.ok) throw new Error(r.error);
  return r.project;
}

describe("version 3 files", () => {
  it("round trip a song exactly", () => {
    let p = defaultBeat();
    p = setTimeSig(p, { beats: 7, unit: 8 });
    p = setSwing(p, 0.35);
    p = setChannelMix(p, drumChannels(p)[3]!.id, { volume: 0.25, muted: true, solo: true });
    p = setPatternBars(p, p.patterns[2]!.id, 3);
    p = addNote(p, p.patterns[2]!.id, { step: 30, pitch: 83, length: 6, velocity: 0.33 });
    p = addClip(p, p.patterns[0]!.id, 6, 100, 7).project;
    p = { ...p, bpm: 93, tracks: 12 };
    expect(parseOk(serializeProject(p))).toEqual(p);
    expect(parseOk(serializeProject(p, true))).toEqual(p);
  });

  it("are tagged so other JSON is not mistaken for a project", () => {
    const data = JSON.parse(serializeProject(emptyProject()));
    expect(data).toMatchObject({ app: "steplab", version: 4 });
  });

  it("drop clips, rows and channels that do not add up", () => {
    const p = defaultBeat();
    const raw = JSON.parse(serializeProject(p));
    raw.channels.push({ id: "bad", kind: "drum", sound: "agogo" });
    raw.channels.push({ ...raw.channels[0] });
    raw.patterns[0].rows.ghost = [1, 2];
    raw.patterns[0].rows[raw.channels[0].id].push(-1, 9999, 2.5);
    raw.clips.push({ id: "z1", patternId: "nope", track: 0, start: 0, length: 4 });
    raw.clips.push({ id: "z2", patternId: raw.patterns[0].id, track: 99, start: 0, length: 4 });
    raw.clips.push({ id: "z3", patternId: raw.patterns[0].id, track: 0, start: 4, length: 0 });
    const q = parseOk(JSON.stringify(raw));
    expect(q.channels).toEqual(p.channels);
    expect((q.patterns[0] as DrumPattern).rows).toEqual((p.patterns[0] as DrumPattern).rows);
    expect(q.clips).toEqual(p.clips);
  });

  it("move melodies on unknown channels to the first synth", () => {
    const p = defaultBeat();
    const raw = JSON.parse(serializeProject(p));
    raw.patterns[1].channelId = "missing";
    const q = parseOk(JSON.stringify(raw));
    expect((q.patterns[1] as MelodyPattern).channelId).toBe(synthChannels(p)[0]!.id);
  });

  it("always keep at least one synth channel and grow tracks to fit clips", () => {
    const raw = JSON.parse(serializeProject(defaultBeat()));
    raw.channels = raw.channels.filter((c: { kind: string }) => c.kind === "drum");
    raw.tracks = 2;
    const q = parseOk(JSON.stringify(raw));
    expect(synthChannels(q)).toHaveLength(1);
    expect(q.tracks).toBe(8);
  });
});

describe("parseProject rejects", () => {
  it("text that is not JSON, other JSON, and newer files", () => {
    expect(parseProject("{nope")).toEqual({ ok: false, error: "That file is not valid JSON." });
    for (const text of ["[]", "null", "42", JSON.stringify({ app: "other" })]) expect(parseProject(text).ok).toBe(false);
    expect(parseProject(JSON.stringify({ app: "steplab", version: 5 })).ok).toBe(false);
  });
});

describe("older files become a song", () => {
  it("upgrades a version 2 loop into one drum loop and two melodies at bar 1", () => {
    const v2 = JSON.stringify({
      app: "steplab",
      version: 2,
      bpm: 100,
      bars: 2,
      timeSig: { beats: 3, unit: 4 },
      swing: 0.2,
      drums: [{ id: "kick", steps: [0, 12], volume: 0.5, muted: true, solo: false }],
      melodies: [
        { synth: "pad", notes: [{ step: 2, pitch: 60, length: 4, velocity: 0.6 }], volume: 0.7 },
        { synth: "bass", notes: [] },
      ],
    });
    const p = parseOk(v2);
    expect(p).toMatchObject({ version: 4, bpm: 100, timeSig: { beats: 3, unit: 4 }, swing: 0.2 });
    expect(p.channels.map((c) => c.name)).toEqual(["Kick", "Snare", "Closed hat", "Open hat", "Clap", "Tom", "Melody 1", "Melody 2"]);
    expect(p.channels[0]).toMatchObject({ volume: 0.5, muted: true });
    expect(p.channels[6]).toMatchObject({ kind: "synth", sound: "pad", volume: 0.7 });
    const [d, m1, m2] = p.patterns;
    expect(d).toMatchObject({ kind: "drums", bars: 2 });
    expect((d as DrumPattern).rows[p.channels[0]!.id]).toEqual([0, 12]);
    expect((m1 as MelodyPattern).notes).toEqual([{ step: 2, pitch: 60, length: 4, velocity: 0.6 }]);
    expect((m2 as MelodyPattern).channelId).toBe(p.channels[7]!.id);
    expect(p.clips.map((c) => [c.track, c.start, c.length])).toEqual([[0, 0, 24], [1, 0, 24], [2, 0, 24]]);
  });

  it("upgrades a version 1 file with relative piano rows", () => {
    const steps = Array(64).fill(false);
    steps[0] = true;
    const notes: number[][] = Array.from({ length: 64 }, () => []);
    notes[2] = [0, 7];
    const p = parseOk(
      JSON.stringify({
        app: "steplab",
        version: 1,
        bpm: 90,
        bars: 4,
        drums: [{ id: "kick", steps }],
        melodies: [{ synth: "pad", notes }, { synth: "bass", notes: [[12]] }],
      }),
    );
    expect(p.patterns[0]).toMatchObject({ bars: 4 });
    expect((p.patterns[1] as MelodyPattern).notes.map((x) => [x.step, x.pitch, x.length])).toEqual([[2, 48, 4], [2, 55, 4]]);
    expect((p.patterns[2] as MelodyPattern).notes.map((x) => [x.step, x.pitch])).toEqual([[0, 48]]);
    expect(p.clips[0]!.length).toBe(64);
  });
});

describe("version 4 sound settings and samples", () => {
  it("round trip tone, effects, pan, master and samples, with embedded audio", () => {
    let p = defaultBeat();
    const lead = synthChannels(p)[0]!.id;
    p = setChannelTone(p, lead, { cutoff: 0.4, resonance: 0.3, octave: -1, glide: 0.2 });
    p = setChannelFx(p, lead, { low: -3, high: 4.5, comp: 0.5, reverb: 0.3, delay: 0.2 });
    p = setChannelPan(p, lead, -0.25);
    p = setMaster(p, { volume: 0.7, delayTime: "4n", delayFeedback: 0.5, reverbSize: 0.8 });
    p = addSample(p, { id: "s1", name: "Chop", source: "user", root: 62 });
    p = addSample(p, { id: "b1", name: "Piano C4", source: "bundled", url: "samples/piano/C4.mp3", root: 60 });
    p = setChannelSample(p, lead, "s1");
    const r = parseProject(serializeProject(p, false, { s1: "AAAA" }));
    if (!r.ok) throw new Error(r.error);
    expect(r.project).toEqual(p);
    expect(r.sampleData).toEqual({ s1: "AAAA" });
  });

  it("fill missing version 3 fields with defaults", () => {
    const raw = JSON.parse(serializeProject(defaultBeat()));
    raw.version = 3;
    delete raw.master;
    delete raw.samples;
    for (const c of raw.channels) {
      delete c.pan;
      delete c.tone;
      delete c.fx;
      delete c.sample;
    }
    const q = parseOk(JSON.stringify(raw));
    expect(q.master).toMatchObject({ volume: 0.85, delayTime: "8n." });
    expect(q.channels[0]).toMatchObject({ pan: 0, sample: null, tone: { cutoff: 1 }, fx: { reverb: 0 } });
  });

  it("refuse unsafe bundled paths, unknown sample references and junk audio", () => {
    const raw = JSON.parse(serializeProject(defaultBeat()));
    raw.samples = [
      { id: "x", name: "Bad", source: "bundled", url: "../secret" },
      { id: "y", name: "Ok", source: "user", root: 999 },
    ];
    raw.channels[0].sample = "x";
    raw.sampleData = { y: "not base64!", x: "AAAA" };
    const r = parseProject(JSON.stringify(raw));
    if (!r.ok) throw new Error(r.error);
    expect(r.project.samples).toEqual([{ id: "y", name: "Ok", source: "user", root: 127 }]);
    expect(r.project.channels[0]!.sample).toBeNull();
    expect(r.sampleData).toEqual({});
  });
});
