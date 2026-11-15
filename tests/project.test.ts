import { describe, expect, it } from "vitest";
import {
  addChannel,
  addClip,
  addDrumPattern,
  addMelodyPattern,
  addNote,
  addTrack,
  clearPattern,
  deleteClip,
  deletePattern,
  demoProject,
  drumChannel,
  drumChannels,
  duplicateClip,
  duplicatePattern,
  emptyProject,
  findPattern,
  moveClip,
  nextName,
  noteAt,
  patternSteps,
  removeChannel,
  removeNoteAt,
  renameChannel,
  renamePattern,
  resizeClip,
  resizeNoteAt,
  setBpm,
  setChannelMix,
  setChannelSound,
  setDrumStep,
  setMelodyChannel,
  setPatternBars,
  setSwing,
  setTimeSig,
  songSteps,
  synthChannel,
  synthChannels,
} from "../src/core/project";
import type { DrumPattern, MelodyPattern, Note, Project } from "../src/core/types";

const n = (step: number, pitch: number, length = 1): Note => ({ step, pitch, length, velocity: 0.8 });
const shape = (notes: Note[]) => notes.map((x) => [x.step, x.pitch, x.length]);
const drums = (p: Project) => p.patterns.find((x) => x.kind === "drums") as DrumPattern;
const melody = (p: Project) => p.patterns.find((x) => x.kind === "melody") as MelodyPattern;
const kick = (p: Project) => drumChannels(p)[0]!.id;

describe("emptyProject", () => {
  it("has the standard channels, a drum loop and a melody placed at bar 1", () => {
    const p = emptyProject();
    expect(drumChannels(p).map((c) => c.sound)).toEqual(["kick", "snare", "chat", "ohat", "clap", "tom"]);
    expect(synthChannels(p).map((c) => c.sound)).toEqual(["lead", "bass"]);
    expect(p.patterns.map((x) => x.kind)).toEqual(["drums", "melody"]);
    expect(p.clips.map((c) => [c.track, c.start, c.length])).toEqual([[0, 0, 16], [1, 0, 16]]);
    expect(p).toMatchObject({ version: 3, timeSig: { beats: 4, unit: 4 }, swing: 0, tracks: 8 });
  });

  it("gives every channel, pattern and clip its own id", () => {
    const p = demoProject();
    const ids = [...p.channels, ...p.patterns, ...p.clips].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts the demo as a four bar song", () => {
    expect(songSteps(demoProject())).toBe(64);
  });
});

describe("channels", () => {
  it("adds, renames and changes the sound of channels", () => {
    let p = addChannel(emptyProject(), drumChannel("snare", "Snare 2", "x1"));
    expect(drumChannels(p)).toHaveLength(7);
    p = renameChannel(p, "x1", "  Rim  ");
    expect(p.channels.at(-1)!.name).toBe("Rim");
    expect(renameChannel(p, "x1", "   ")).toBe(p);
    p = setChannelSound(p, "x1", "clap");
    expect(p.channels.at(-1)).toMatchObject({ sound: "clap", name: "Rim" });
  });

  it("renames a channel that still had its sound's name", () => {
    const p = addChannel(emptyProject(), synthChannel("lead", undefined, "s1"));
    expect(setChannelSound(p, "s1", "pad").channels.at(-1)).toMatchObject({ sound: "pad", name: "Pad" });
    // A drum channel cannot take a synth sound.
    expect(setChannelSound(p, kick(p), "pad").channels[0]!.sound).toBe("kick");
  });

  it("sets volume, mute and solo, clamping volume", () => {
    const p = emptyProject();
    const q = setChannelMix(p, kick(p), { volume: 3, muted: true, solo: true });
    expect(q.channels[0]).toMatchObject({ volume: 1, muted: true, solo: true });
    expect(setChannelMix(q, kick(q), { volume: Number.NaN }).channels[0]!.volume).toBe(1);
  });

  it("removes a drum channel along with its steps", () => {
    let p = emptyProject();
    p = setDrumStep(p, drums(p).id, kick(p), 0, true);
    const k = kick(p);
    const q = removeChannel(p, k);
    expect(q.channels.find((c) => c.id === k)).toBeUndefined();
    expect(drums(q).rows[k]).toBeUndefined();
  });

  it("moves melodies to another synth when theirs is removed, and keeps the last synth", () => {
    const p = emptyProject();
    const [lead, bass] = synthChannels(p);
    const q = removeChannel(p, lead!.id);
    expect(melody(q).channelId).toBe(bass!.id);
    expect(removeChannel(q, bass!.id)).toBe(q);
  });
});

describe("patterns", () => {
  it("adds drum loops and melodies with the next free name", () => {
    let p = emptyProject();
    expect(nextName(p, "Drums")).toBe("Drums 2");
    const a = addDrumPattern(p);
    p = a.project;
    expect(findPattern(p, a.id)).toMatchObject({ kind: "drums", name: "Drums 2", bars: 1 });
    const b = addMelodyPattern(p, synthChannels(p)[1]!.id);
    expect(findPattern(b.project, b.id)).toMatchObject({ kind: "melody", name: "Melody 2", channelId: synthChannels(p)[1]!.id });
  });

  it("duplicates a pattern as an independent copy", () => {
    let p = emptyProject();
    p = addNote(p, melody(p).id, n(0, 60));
    const d = duplicatePattern(p, melody(p).id);
    const copy = findPattern(d.project, d.id) as MelodyPattern;
    expect(copy.name).toBe("Melody 2");
    const changed = addNote(d.project, d.id, n(4, 62));
    expect(melody(changed).notes).toHaveLength(1);
    expect((findPattern(changed, d.id) as MelodyPattern).notes).toHaveLength(2);
  });

  it("deletes a pattern and its clips", () => {
    const p = emptyProject();
    const q = deletePattern(p, drums(p).id);
    expect(q.patterns).toHaveLength(1);
    expect(q.clips.every((c) => c.patternId !== drums(p).id)).toBe(true);
  });

  it("renames, re-channels and clears patterns", () => {
    let p = emptyProject();
    p = renamePattern(p, melody(p).id, "Hook");
    expect(melody(p).name).toBe("Hook");
    const bass = synthChannels(p)[1]!.id;
    p = setMelodyChannel(p, melody(p).id, bass);
    expect(melody(p).channelId).toBe(bass);
    expect(setMelodyChannel(p, melody(p).id, kick(p))).toBe(p);
    p = addNote(p, melody(p).id, n(0, 60));
    expect(clearPattern(p, melody(p).id).patterns[1]).toMatchObject({ notes: [] });
  });
});

describe("setPatternBars", () => {
  it("repeats the pattern into empty new bars", () => {
    let p = emptyProject();
    p = setDrumStep(p, drums(p).id, kick(p), 0, true);
    p = setDrumStep(p, drums(p).id, kick(p), 5, true);
    p = setPatternBars(p, drums(p).id, 3);
    expect(drums(p).rows[kick(p)]).toEqual([0, 5, 16, 21, 32, 37]);
  });

  it("repeats notes too, and keeps hidden bars when shrinking", () => {
    const p0 = emptyProject();
    const id = melody(p0).id;
    let p = addNote(p0, id, n(2, 60, 3));
    p = setPatternBars(p, id, 2);
    expect(shape(melody(p).notes)).toEqual([[2, 60, 3], [18, 60, 3]]);
    p = addNote(p, id, n(20, 64));
    const regrown = setPatternBars(setPatternBars(p, id, 1), id, 2);
    expect(shape(melody(regrown).notes)).toEqual([[2, 60, 3], [18, 60, 3], [20, 64, 1]]);
  });

  it("grows clips that showed exactly one pass", () => {
    let p = emptyProject();
    const id = drums(p).id;
    p = addClip(p, id, 3, 32, 8).project;
    p = setPatternBars(p, id, 2);
    expect(p.clips.filter((c) => c.patternId === id).map((c) => c.length)).toEqual([32, 8]);
  });

  it("clamps typed bar counts", () => {
    const p = emptyProject();
    expect(findPattern(setPatternBars(p, drums(p).id, "40"), drums(p).id)!.bars).toBe(16);
    expect(findPattern(setPatternBars(p, drums(p).id, 0), drums(p).id)!.bars).toBe(1);
  });
});

describe("drum steps and notes", () => {
  it("sets drum steps on and off, sorted", () => {
    let p = emptyProject();
    const id = drums(p).id;
    p = setDrumStep(p, id, kick(p), 9, true);
    p = setDrumStep(p, id, kick(p), 2, true);
    expect(drums(p).rows[kick(p)]).toEqual([2, 9]);
    expect(setDrumStep(p, id, kick(p), 2, true)).toBe(p);
    expect(drums(setDrumStep(p, id, kick(p), 9, false)).rows[kick(p)]).toEqual([2]);
    // Steps cannot go into a melody pattern.
    expect(setDrumStep(p, melody(p).id, kick(p), 0, true)).toBe(p);
  });

  it("finds a note by any step it covers", () => {
    const p = emptyProject();
    const q = addNote(p, melody(p).id, n(4, 60, 3));
    expect(noteAt(melody(q), 6, 60)).toBeDefined();
    expect(noteAt(melody(q), 7, 60)).toBeUndefined();
  });

  it("trims or replaces overlapped same-pitch notes and stacks chords", () => {
    const p0 = emptyProject();
    const id = melody(p0).id;
    let p = addNote(p0, id, n(0, 60, 8));
    p = addNote(p, id, n(4, 60, 2));
    p = addNote(p, id, n(4, 64));
    expect(shape(melody(p).notes)).toEqual([[0, 60, 4], [4, 60, 2], [4, 64, 1]]);
    p = addNote(p, id, n(0, 60, 8));
    expect(shape(melody(p).notes)).toEqual([[0, 60, 8], [4, 64, 1]]);
  });

  it("removes and resizes notes from any of their steps", () => {
    const p0 = emptyProject();
    const id = melody(p0).id;
    const p = addNote(p0, id, n(3, 60, 4));
    expect(melody(removeNoteAt(p, id, 5, 60)).notes).toEqual([]);
    expect(shape(melody(resizeNoteAt(p, id, 4, 60, 6)).notes)).toEqual([[3, 60, 6]]);
    expect(shape(melody(resizeNoteAt(p, id, 4, 60, 0)).notes)).toEqual([[3, 60, 1]]);
  });
});

describe("playlist clips", () => {
  it("adds a clip one pattern long, inside the tracks", () => {
    const p = emptyProject();
    const { project, id } = addClip(p, drums(p).id, 99, -5);
    expect(project.clips.find((c) => c.id === id)).toMatchObject({ track: 7, start: 0, length: 16 });
  });

  it("moves, resizes, duplicates and deletes clips", () => {
    let p = emptyProject();
    const clip = p.clips[0]!;
    p = moveClip(p, clip.id, 2, 32);
    expect(p.clips[0]).toMatchObject({ track: 2, start: 32 });
    p = resizeClip(p, clip.id, 40);
    expect(p.clips[0]!.length).toBe(40);
    expect(resizeClip(p, clip.id, 0).clips[0]!.length).toBe(1);
    const d = duplicateClip(p, clip.id);
    expect(d.project.clips.find((c) => c.id === d.id)).toMatchObject({ track: 2, start: 72, length: 40 });
    expect(deleteClip(d.project, clip.id).clips.some((c) => c.id === clip.id)).toBe(false);
  });

  it("measures the song in whole bars from the last clip", () => {
    let p = emptyProject();
    expect(songSteps(p)).toBe(16);
    p = addClip(p, drums(p).id, 0, 40, 3).project;
    expect(songSteps(p)).toBe(48);
    expect(songSteps({ ...p, clips: [] })).toBe(16);
  });

  it("adds tracks up to the limit", () => {
    let p = emptyProject();
    for (let i = 0; i < 40; i++) p = addTrack(p);
    expect(p.tracks).toBe(32);
  });
});

describe("song settings", () => {
  it("clamps tempo and swing", () => {
    expect(setBpm(emptyProject(), 300).bpm).toBe(180);
    expect(setSwing(emptyProject(), 9).swing).toBe(1);
  });

  it("changes the time signature and trims patterns that no longer fit", () => {
    let p = emptyProject();
    p = setPatternBars(p, drums(p).id, 16);
    const q = setTimeSig(p, { beats: 12, unit: 4 });
    expect(q.timeSig).toEqual({ beats: 12, unit: 4 });
    expect(drums(q).bars).toBe(5);
    expect(patternSteps(drums(q), q.timeSig)).toBe(240);
  });
});
