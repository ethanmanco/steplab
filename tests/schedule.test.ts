import { describe, expect, it } from "vitest";
import { defaultBeat } from "../src/core/presets";
import {
  addClip,
  addNote,
  drumChannels,
  emptyProject,
  setChannelMix,
  setDrumStep,
  setPatternBars,
  synthChannels,
} from "../src/core/project";
import {
  audibleChannels,
  clipAt,
  eventsAt,
  loopLength,
  patternEventsAtStep,
  playLength,
  songEventsAtStep,
} from "../src/core/schedule";
import type { MelodyPattern, Note, Project } from "../src/core/types";

const n = (step: number, pitch: number, length = 1, velocity = 0.8): Note => ({ step, pitch, length, velocity });
const pat = (p: Project, name: string) => p.patterns.find((x) => x.name === name)!;

describe("pattern mode", () => {
  it("loops one pattern", () => {
    const p = defaultBeat();
    const beat = pat(p, "Beat").id;
    expect(patternEventsAtStep(p, beat, 8).drums.map((d) => d.sound)).toEqual(["snare808", "hat808", "clap808"]);
    expect(patternEventsAtStep(p, beat, 40).drums.map((d) => d.sound)).toEqual(["snare808", "hat808", "clap808"]);
    expect(loopLength(p, "pattern", beat)).toBe(32);
  });

  it("plays a melody through its channel with pitch, velocity and length", () => {
    const p = defaultBeat();
    const hook = pat(p, "Hook") as MelodyPattern;
    expect(patternEventsAtStep(p, hook.id, 4).notes).toEqual([
      { channelId: hook.channelId, pitch: 79, velocity: 0.8, steps: 3 },
    ]);
    expect(patternEventsAtStep(p, hook.id, 5).notes).toEqual([]);
  });

  it("falls back to the song when no pattern is chosen", () => {
    const p = defaultBeat();
    expect(loopLength(p, "pattern", null)).toBe(128);
    expect(eventsAt(p, "pattern", "missing", 0)).toEqual(songEventsAtStep(p, 0));
  });
});

describe("song mode", () => {
  it("plays every clip under the playhead", () => {
    const p = defaultBeat();
    // Bars 1 and 2 are the electric piano hook and the pad on their own.
    const at0 = songEventsAtStep(p, 0);
    expect(at0.drums).toEqual([]);
    expect(at0.notes.map((x) => x.pitch).sort()).toEqual([60, 63, 67, 72]);
    // The drums and the 808 drop in on bar 3 (step 32).
    const drop = songEventsAtStep(p, 32);
    expect(drop.drums.map((d) => d.sound)).toEqual(["kick808", "hat808"]);
    expect(drop.notes.map((x) => x.pitch).sort()).toEqual([36, 60, 63, 67, 72]);
  });

  it("repeats a pattern across a long clip and cuts notes at the clip end", () => {
    let p = emptyProject();
    const mel = p.patterns[1]!.id;
    p = { ...p, clips: [] };
    p = addNote(p, mel, n(14, 60, 6));
    p = addClip(p, mel, 0, 0, 31).project;
    expect(songEventsAtStep(p, 14).notes[0]!.steps).toBe(6);
    expect(songEventsAtStep(p, 30).notes[0]!.steps).toBe(1);
  });

  it("is silent past the clips and loops over whole bars", () => {
    const p = defaultBeat();
    expect(songEventsAtStep(p, 140)).toEqual({ drums: [], notes: [] });
    expect(loopLength(p, "song", null)).toBe(128);
  });

  it("finds where a pattern plays at a song step", () => {
    const p = defaultBeat();
    const beat = pat(p, "Beat").id;
    expect(clipAt(p, beat, 10)).toBeNull();
    expect(clipAt(p, beat, 37)?.local).toBe(5);
    // Past the end of the two bar pattern, the clip loops it.
    expect(clipAt(p, beat, 70)?.local).toBe(6);
  });
});

describe("mute and solo", () => {
  it("skips muted channels", () => {
    let p = defaultBeat();
    const snare = drumChannels(p)[1]!.id;
    p = setChannelMix(p, snare, { muted: true });
    expect(songEventsAtStep(p, 40).drums.map((d) => d.sound)).toEqual(["hat808", "clap808"]);
  });

  it("plays only soloed channels once any is soloed, and mute beats solo", () => {
    let p = defaultBeat();
    const kick = drumChannels(p)[0]!.id;
    const bass = synthChannels(p).find((c) => c.sound === "b808")!.id;
    p = setChannelMix(p, kick, { solo: true });
    p = setChannelMix(p, bass, { solo: true });
    expect([...audibleChannels(p)].sort()).toEqual([kick, bass].sort());
    expect(songEventsAtStep(p, 32).drums.map((d) => d.sound)).toEqual(["kick808"]);
    expect(songEventsAtStep(p, 32).notes.map((x) => x.pitch)).toEqual([36]);
    p = setChannelMix(p, kick, { muted: true });
    expect(audibleChannels(p).has(kick)).toBe(false);
  });
});

describe("playLength", () => {
  it("stops before the same pitch starts again, across the pattern end", () => {
    let p = emptyProject();
    const id = p.patterns[1]!.id;
    p = addNote(p, id, n(14, 60, 4));
    p = addNote(p, id, n(0, 60, 1));
    const m = p.patterns[1] as MelodyPattern;
    expect(playLength(m, m.notes.find((x) => x.step === 14)!, 16)).toBe(2);
    const longer = setPatternBars(p, id, 2).patterns[1] as MelodyPattern;
    expect(playLength(longer, longer.notes.find((x) => x.step === 14)!, 32)).toBe(2);
  });
});

describe("drum rows follow channels", () => {
  it("plays a step only for channels that have it", () => {
    let p = emptyProject();
    const id = p.patterns[0]!.id;
    const tom = drumChannels(p)[5]!.id;
    p = setDrumStep(p, id, tom, 3, true);
    expect(patternEventsAtStep(p, id, 3).drums).toEqual([{ channelId: tom, sound: "rim" }]);
  });
});

describe("backing layers in pattern mode", () => {
  it("plays the selected pattern together with its backing", () => {
    const p = defaultBeat();
    const hook = pat(p, "Hook").id;
    const beat = pat(p, "Beat").id;
    const e = eventsAt(p, "pattern", hook, 8, [beat]);
    expect(e.notes.map((x) => x.pitch)).toEqual([74]);
    expect(e.drums.map((d) => d.sound)).toEqual(["snare808", "hat808", "clap808"]);
  });

  it("loops over the longest pattern, repeating shorter ones inside it", () => {
    let p = defaultBeat();
    const hook = pat(p, "Hook").id;
    const beat = pat(p, "Beat").id;
    p = setPatternBars(p, hook, 1);
    expect(loopLength(p, "pattern", hook, [beat])).toBe(32);
    // Step 18 is step 2 of the now one-bar hook on its second pass.
    expect(eventsAt(p, "pattern", hook, 18, [beat]).notes.map((x) => x.pitch)).toEqual([75]);
  });

  it("ignores missing layers and does not double the selected pattern", () => {
    const p = defaultBeat();
    const hook = pat(p, "Hook").id;
    expect(eventsAt(p, "pattern", hook, 2, [hook, "gone"])).toEqual(eventsAt(p, "pattern", hook, 2));
    expect(loopLength(p, "pattern", hook, ["gone"])).toBe(64);
  });

  it("leaves song mode alone", () => {
    const p = defaultBeat();
    expect(eventsAt(p, "song", null, 0, [pat(p, "Hook").id])).toEqual(songEventsAtStep(p, 0));
  });
});
