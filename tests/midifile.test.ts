import { describe, expect, it } from "vitest";
import {
  GM_DRUM,
  PPQ,
  TICKS_PER_STEP,
  decodeMidi,
  drumForNote,
  encodeMidi,
  fitPitch,
  importMidi,
  projectToMidi,
  synthForProgram,
  type MidiSong,
} from "../src/core/midifile";
import { addNote, demoProject, emptyProject, findPattern, songSteps } from "../src/core/project";
import type { DrumPattern, MelodyPattern } from "../src/core/types";

const ascii = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4));

describe("encodeMidi", () => {
  const song: MidiSong = {
    ppq: PPQ,
    bpm: 120,
    beats: 3,
    unit: 4,
    tracks: [{ name: "Lead", channel: 0, program: 81, notes: [{ tick: 0, duration: 48, pitch: 60, velocity: 100, channel: 0 }] }],
  };
  const bytes = encodeMidi(song);

  it("writes a type 1 header with a conductor track", () => {
    expect(ascii(bytes, 0)).toBe("MThd");
    expect([...bytes.subarray(8, 14)]).toEqual([0, 1, 0, 2, 0, PPQ]);
    expect(ascii(bytes, 14)).toBe("MTrk");
  });

  it("round trips through the decoder", () => {
    const back = decodeMidi(bytes);
    expect(back).toMatchObject({ ppq: PPQ, bpm: 120, beats: 3, unit: 4 });
    expect(back.tracks).toEqual([{ name: "Lead", channel: 0, program: 81, notes: song.tracks[0]!.notes }]);
  });

  it("puts a note off before a note on at the same tick", () => {
    const two = encodeMidi({
      ...song,
      tracks: [{ name: "x", channel: 0, notes: [
        { tick: 0, duration: 24, pitch: 60, velocity: 90, channel: 0 },
        { tick: 24, duration: 24, pitch: 60, velocity: 90, channel: 0 },
      ] }],
    });
    expect(decodeMidi(two).tracks[0]!.notes.map((n) => [n.tick, n.duration])).toEqual([[0, 24], [24, 24]]);
  });
});

describe("decodeMidi", () => {
  /** A hand-built type 0 file using running status and note-on velocity 0 as note off. */
  function type0(): Uint8Array {
    const track = [
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // 120 BPM
      0x00, 0xc1, 0x21, // program 33 on channel 2
      0x00, 0x91, 0x40, 0x64, // note on ch2 E4
      0x30, 0x40, 0x00, // running status: note on velocity 0 = off, 48 ticks later
      0x00, 0x99, 0x24, 0x70, // drum kick on ch10
      0x10, 0x89, 0x24, 0x00,
      0x00, 0xff, 0x2f, 0x00,
    ];
    return new Uint8Array([
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
      ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
      ...track,
    ]);
  }

  it("reads running status, velocity 0 offs, tempo and programs, and splits channels", () => {
    const song = decodeMidi(type0());
    expect(song.bpm).toBe(120);
    expect(song.tracks.map((t) => t.channel).sort()).toEqual([1, 9]);
    const melodic = song.tracks.find((t) => t.channel === 1)!;
    expect(melodic.program).toBe(33);
    expect(melodic.notes).toEqual([{ tick: 0, duration: 48, pitch: 64, velocity: 100, channel: 1 }]);
    expect(song.tracks.find((t) => t.channel === 9)!.notes[0]).toMatchObject({ pitch: 36, duration: 16 });
  });

  it("refuses files that are not MIDI or are cut short", () => {
    expect(() => decodeMidi(new TextEncoder().encode("hello world, not midi"))).toThrow("not a MIDI file");
    expect(() => decodeMidi(type0().subarray(0, 30))).toThrow();
  });
});

describe("General MIDI mapping", () => {
  it("maps drums both ways", () => {
    expect(GM_DRUM.kick808).toBe(36);
    expect(drumForNote(GM_DRUM.snare808)).toBe("snare");
    expect(drumForNote(GM_DRUM.ohat)).toBe("ohat");
    expect(drumForNote(49)).toBeNull(); // crash cymbal: no Steplab sound
  });

  it("picks the nearest sound for a program", () => {
    expect(synthForProgram(0)).toBe("piano");
    expect(synthForProgram(4)).toBe("keys");
    expect(synthForProgram(33)).toBe("bass");
    expect(synthForProgram(48)).toBe("strings");
    expect(synthForProgram(80)).toBe("chip");
    expect(synthForProgram(90)).toBe("pad");
  });

  it("folds pitches onto the piano roll by octaves", () => {
    expect(fitPitch(12)).toBe(24);
    expect(fitPitch(100)).toBe(76);
    expect(fitPitch(60)).toBe(60);
  });
});

describe("projectToMidi", () => {
  it("lays out the whole song with drums on channel 10", () => {
    const p = demoProject();
    const song = projectToMidi(p);
    const drums = song.tracks.find((t) => t.channel === 9)!;
    // The one-bar beat repeats across its four-bar clip: three kicks a bar.
    expect(drums.notes.filter((n) => n.pitch === 36)).toHaveLength(12);
    const hook = song.tracks.find((t) => t.name === "Lead")!;
    // The hook starts on bar 3, step 2.
    expect(hook.notes[0]!.tick).toBe((32 + 2) * TICKS_PER_STEP);
    expect(Math.max(...song.tracks.flatMap((t) => t.notes.map((n) => n.tick + n.duration)))).toBeLessThanOrEqual(songSteps(p) * TICKS_PER_STEP);
  });

  it("exports one pattern on its own from tick 0", () => {
    const p = demoProject();
    const hook = p.patterns.find((x) => x.name === "Hook")!;
    const song = projectToMidi(p, hook.id);
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0]!.notes[0]!.tick).toBe(2 * TICKS_PER_STEP);
  });
});

describe("importMidi", () => {
  it("brings melodies and drums back as placed patterns", () => {
    const src = demoProject();
    const bytes = encodeMidi(projectToMidi(src, src.patterns.find((x) => x.name === "Hook")!.id));
    const base = emptyProject();
    const { project, patternIds, skipped } = importMidi(base, decodeMidi(bytes), "clip");
    expect(skipped).toBe(0);
    expect(patternIds).toHaveLength(1);
    const mel = findPattern(project, patternIds[0]!) as MelodyPattern;
    const orig = src.patterns.find((x) => x.name === "Hook") as MelodyPattern;
    expect(mel.notes.map((n) => [n.step, n.pitch, n.length])).toEqual(orig.notes.map((n) => [n.step, n.pitch, n.length]));
    expect(project.channels.find((c) => c.id === mel.channelId)).toMatchObject({ kind: "synth", sound: "lead" });
    expect(project.clips.some((c) => c.patternId === mel.id && c.start === 0)).toBe(true);
  });

  it("maps General MIDI drums onto drum channels", () => {
    const base = emptyProject();
    const bytes = encodeMidi({
      ppq: PPQ,
      bpm: 100,
      beats: 4,
      unit: 4,
      tracks: [{ name: "Drums", channel: 9, notes: [
        { tick: 0, duration: 12, pitch: 36, velocity: 100, channel: 9 },
        { tick: 96, duration: 12, pitch: 38, velocity: 100, channel: 9 },
        { tick: 96, duration: 12, pitch: 49, velocity: 100, channel: 9 },
      ] }],
    });
    const { project, patternIds, skipped } = importMidi(base, decodeMidi(bytes), "beat");
    expect(skipped).toBe(1);
    const d = findPattern(project, patternIds[0]!) as DrumPattern;
    const kick = project.channels.find((c) => c.sound === "kick808")!;
    const snare = project.channels.find((c) => c.sound === "snare808")!;
    expect(d.rows[kick.id]).toEqual([0]);
    expect(d.rows[snare.id]).toEqual([4]);
  });

  it("exports only the notes inside a pattern's length, not hidden bars", () => {
    let p = emptyProject();
    const id = p.patterns[1]!.id;
    for (let s = 0; s < 32; s += 4) p = addNote(p, id, { step: s, pitch: 60, length: 2, velocity: 0.8 });
    // The melody is one bar long, so the notes from step 16 on are hidden.
    const song = projectToMidi(p, id);
    expect(song.tracks[0]!.notes.map((n) => n.tick / TICKS_PER_STEP)).toEqual([0, 4, 8, 12]);
  });
});
