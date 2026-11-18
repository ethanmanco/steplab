import { ROLL_HIGH, ROLL_LOW } from "./notes";
import {
  DEFAULT_VELOCITY,
  addClip,
  addDrumPattern,
  addMelodyPattern,
  addChannel,
  drumChannel,
  findPattern,
  patternSteps,
  renamePattern,
  setDrumStep,
  addNote,
  setPatternBars,
  songSteps,
  synthChannel,
} from "./project";
import { MAX_STEPS, clampBars, stepsPerBar } from "./timing";
import type { DrumId, Pattern, Project, SynthId } from "./types";

/**
 * Standard MIDI Files, the format every DAW reads. Steplab writes type 1
 * files (one track per channel, drums on MIDI channel 10 with General MIDI
 * note numbers) so a song opens in FL Studio with its parts laid out, and it
 * reads melodies and drums back from MIDI files made elsewhere.
 */

export const PPQ = 96;
/** A sixteenth-note step in MIDI ticks. */
export const TICKS_PER_STEP = PPQ / 4;
const DRUM_CHANNEL = 9;

export interface MidiNote {
  tick: number;
  duration: number;
  pitch: number;
  velocity: number;
  channel: number;
}

export interface MidiTrack {
  name: string;
  /** 0..15; 9 is percussion. */
  channel: number;
  /** General MIDI program (0..127), ignored on the drum channel. */
  program?: number;
  notes: MidiNote[];
}

export interface MidiSong {
  ppq: number;
  bpm: number;
  beats: number;
  unit: number;
  tracks: MidiTrack[];
}

/** General MIDI drum notes for each built-in drum sound. */
export const GM_DRUM: Record<DrumId, number> = {
  kick: 36,
  kick808: 36,
  snare: 38,
  snare808: 40,
  chat: 42,
  hat808: 42,
  ohat: 46,
  ohat808: 46,
  clap: 39,
  clap808: 39,
  tom: 45,
  tom808: 47,
  rim: 37,
  cowbell: 56,
  kick909: 36,
  snare909: 38,
  hat909: 42,
  ohat909: 46,
  clap909: 39,
  tom909: 48,
  rim909: 37,
  crash909: 49,
  ride909: 51,
};

/** General MIDI programs closest to each synth sound. */
export const GM_PROGRAM: Record<SynthId, number> = {
  lead: 81,
  bass: 38,
  b808: 38,
  pluck: 45,
  pad: 89,
  keys: 4,
  piano: 0,
  strings: 48,
  brass: 61,
  bell: 14,
  organ: 16,
  supersaw: 81,
  marimba: 12,
  flute: 73,
  sub: 38,
  reese: 39,
  chip: 80,
  hoover: 87,
};

/** The Steplab sound nearest a General MIDI program, for imports. */
export function synthForProgram(program: number): SynthId {
  if (program < 4) return "piano";
  if (program < 8) return "keys";
  if (program === 12 || program === 13 || program >= 112 && program < 120) return "marimba";
  if (program < 16) return "bell";
  if (program < 24) return "organ";
  if (program < 32) return "pluck";
  if (program === 39) return "reese";
  if (program < 40) return "bass";
  if (program === 45) return "pluck";
  if (program < 56) return "strings";
  if (program < 64) return "brass";
  if (program < 80) return "flute";
  if (program === 80) return "chip";
  if (program < 88) return "lead";
  if (program < 104) return "pad";
  if (program < 112) return "pluck";
  return "lead";
}

/** The drum sound family for a General MIDI drum note, or null if Steplab has nothing like it. */
export function drumForNote(note: number): "kick" | "snare" | "chat" | "ohat" | "clap" | "tom" | "rim" | "cowbell" | null {
  if (note === 35 || note === 36) return "kick";
  if (note === 38 || note === 40) return "snare";
  if (note === 37) return "rim";
  if (note === 39) return "clap";
  if (note === 42 || note === 44) return "chat";
  if (note === 46) return "ohat";
  if ([41, 43, 45, 47, 48, 50].includes(note)) return "tom";
  if (note === 56) return "cowbell";
  return null;
}

/* ---------- Writing ---------- */

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  let v = n >> 7;
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return out;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0x7f);

function chunk(type: string, data: number[]): number[] {
  return [...ascii(type), ...u32(data.length), ...data];
}

function trackChunk(events: { tick: number; order: number; bytes: number[] }[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let last = 0;
  for (const e of events) {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(...vlq(0), 0xff, 0x2f, 0x00);
  return chunk("MTrk", data);
}

const nameEvent = (name: string) => {
  const text = ascii(name.slice(0, 60));
  return [0xff, 0x03, ...vlq(text.length), ...text];
};

export function encodeMidi(song: MidiSong): Uint8Array<ArrayBuffer> {
  const conductor = trackChunk([
    { tick: 0, order: 0, bytes: nameEvent("Steplab") },
    { tick: 0, order: 1, bytes: [0xff, 0x51, 0x03, ...u32(Math.round(60_000_000 / song.bpm)).slice(1)] },
    { tick: 0, order: 2, bytes: [0xff, 0x58, 0x04, song.beats, Math.round(Math.log2(song.unit)), 24, 8] },
  ]);
  const tracks = song.tracks.map((t) => {
    const ch = t.channel & 0x0f;
    const events: { tick: number; order: number; bytes: number[] }[] = [{ tick: 0, order: 0, bytes: nameEvent(t.name) }];
    if (t.program !== undefined && ch !== DRUM_CHANNEL) events.push({ tick: 0, order: 1, bytes: [0xc0 | ch, t.program & 0x7f] });
    for (const n of t.notes) {
      // Note offs sort before note ons at the same tick, so repeated notes retrigger cleanly.
      events.push({ tick: n.tick, order: 3, bytes: [0x90 | ch, n.pitch & 0x7f, Math.max(1, Math.min(127, n.velocity))] });
      events.push({ tick: n.tick + Math.max(1, n.duration), order: 2, bytes: [0x80 | ch, n.pitch & 0x7f, 0] });
    }
    return trackChunk(events);
  });
  const header = chunk("MThd", [...u16(1), ...u16(tracks.length + 1), ...u16(song.ppq)]);
  return new Uint8Array([...header, ...conductor, ...tracks.flat()]);
}

/* ---------- Reading ---------- */

export function decodeMidi(bytes: Uint8Array): MidiSong {
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > bytes.length) throw new Error("The MIDI file ends too early.");
  };
  const read32 = () => {
    need(4);
    const v = ((bytes[pos]! << 24) | (bytes[pos + 1]! << 16) | (bytes[pos + 2]! << 8) | bytes[pos + 3]!) >>> 0;
    pos += 4;
    return v;
  };
  const read16 = () => {
    need(2);
    const v = (bytes[pos]! << 8) | bytes[pos + 1]!;
    pos += 2;
    return v;
  };
  const tag = () => {
    need(4);
    const s = String.fromCharCode(...bytes.subarray(pos, pos + 4));
    pos += 4;
    return s;
  };
  const readVlq = (end: number) => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      if (pos >= end) throw new Error("The MIDI file has a broken event.");
      const b = bytes[pos++]!;
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error("The MIDI file has a broken event.");
  };

  if (tag() !== "MThd") throw new Error("That is not a MIDI file.");
  const headerLen = read32();
  const start = pos;
  read16(); // format: 0 and 1 read the same way here
  const count = read16();
  const division = read16();
  if (division & 0x8000) throw new Error("MIDI files timed in SMPTE frames are not supported.");
  pos = start + headerLen;

  const song: MidiSong = { ppq: division || PPQ, bpm: 120, beats: 4, unit: 4, tracks: [] };
  let tempoSet = false;
  for (let t = 0; t < count && pos < bytes.length; t++) {
    const id = tag();
    const len = read32();
    const end = pos + len;
    if (end > bytes.length) throw new Error("The MIDI file ends too early.");
    if (id !== "MTrk") {
      pos = end;
      continue;
    }
    let tick = 0;
    let status = 0;
    let name = "";
    const programs = new Map<number, number>();
    const open = new Map<string, { tick: number; velocity: number }[]>();
    const notes: MidiNote[] = [];
    while (pos < end) {
      tick += readVlq(end);
      let b = bytes[pos]!;
      if (b === 0xff) {
        const type = bytes[pos + 1]!;
        pos += 2;
        const l = readVlq(end);
        const data = bytes.subarray(pos, pos + l);
        pos += l;
        if (type === 0x03 && !name) name = String.fromCharCode(...data).trim();
        if (type === 0x51 && l === 3 && !tempoSet) {
          song.bpm = Math.round(60_000_000 / ((data[0]! << 16) | (data[1]! << 8) | data[2]!));
          tempoSet = true;
        }
        if (type === 0x58 && l >= 2) {
          song.beats = data[0]!;
          song.unit = 2 ** data[1]!;
        }
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        pos += 1;
        pos += readVlq(end);
        continue;
      }
      if (b & 0x80) {
        status = b;
        pos += 1;
      } else if (!status) {
        throw new Error("The MIDI file has a broken event.");
      }
      b = status;
      const kind = b & 0xf0;
      const ch = b & 0x0f;
      const d1 = bytes[pos]!;
      const two = kind !== 0xc0 && kind !== 0xd0;
      const d2 = two ? bytes[pos + 1]! : 0;
      pos += two ? 2 : 1;
      if (kind === 0xc0) programs.set(ch, d1);
      const key = `${ch}:${d1}`;
      if (kind === 0x90 && d2 > 0) {
        if (!open.has(key)) open.set(key, []);
        open.get(key)!.push({ tick, velocity: d2 });
      } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
        const on = open.get(key)?.shift();
        if (on) notes.push({ tick: on.tick, duration: Math.max(1, tick - on.tick), pitch: d1, velocity: on.velocity, channel: ch });
      }
    }
    pos = end;
    // A type 0 file keeps every channel in one track: split them apart.
    const channels = [...new Set(notes.map((n) => n.channel))];
    for (const ch of channels) {
      song.tracks.push({
        name: channels.length > 1 ? `${name || "Track"} ch ${ch + 1}` : name,
        channel: ch,
        program: programs.get(ch),
        notes: notes.filter((n) => n.channel === ch).sort((a, b) => a.tick - b.tick || a.pitch - b.pitch),
      });
    }
  }
  return song;
}

/* ---------- Songs to MIDI ---------- */

/**
 * The song (or one pattern) as MIDI tracks: every clip's notes laid out in
 * time, patterns repeating to fill their clips, notes cut at clip ends.
 */
export function projectToMidi(p: Project, patternId: string | null = null): MidiSong {
  const tick = (step: number) => step * TICKS_PER_STEP;
  const placed: { pattern: Pattern; start: number; length: number }[] = [];
  const only = patternId ? findPattern(p, patternId) : undefined;
  if (only) placed.push({ pattern: only, start: 0, length: patternSteps(only, p.timeSig) });
  else {
    for (const c of p.clips) {
      const pattern = findPattern(p, c.patternId);
      if (pattern) placed.push({ pattern, start: c.start, length: c.length });
    }
  }

  const drumNotes: MidiNote[] = [];
  const byChannel = new Map<string, MidiNote[]>();
  for (const { pattern, start, length } of placed) {
    const patLen = patternSteps(pattern, p.timeSig);
    const end = start + length;
    for (let offset = start; offset < end; offset += patLen) {
      if (pattern.kind === "drums") {
        for (const ch of p.channels) {
          if (ch.kind !== "drum") continue;
          for (const s of pattern.rows[ch.id] ?? []) {
            if (s >= patLen || offset + s >= end) continue;
            drumNotes.push({ tick: tick(offset + s), duration: TICKS_PER_STEP / 2, pitch: GM_DRUM[ch.sound], velocity: 100, channel: DRUM_CHANNEL });
          }
        }
      } else {
        const list = byChannel.get(pattern.channelId) ?? [];
        for (const n of pattern.notes) {
          const at = offset + n.step;
          if (n.step >= patLen || at >= end) continue;
          list.push({
            tick: tick(at),
            duration: tick(Math.min(n.length, end - at)),
            pitch: n.pitch,
            velocity: Math.round(n.velocity * 127),
            channel: 0,
          });
        }
        byChannel.set(pattern.channelId, list);
      }
    }
  }

  const tracks: MidiTrack[] = [];
  if (drumNotes.length) tracks.push({ name: "Drums", channel: DRUM_CHANNEL, notes: drumNotes });
  let midiCh = 0;
  for (const ch of p.channels) {
    const notes = byChannel.get(ch.id);
    if (ch.kind !== "synth" || !notes?.length) continue;
    if (midiCh === DRUM_CHANNEL) midiCh++;
    const channel = midiCh % 16;
    midiCh++;
    tracks.push({ name: ch.name, channel, program: GM_PROGRAM[ch.sound], notes: notes.map((n) => ({ ...n, channel })) });
  }
  return { ppq: PPQ, bpm: p.bpm, beats: p.timeSig.beats, unit: p.timeSig.unit, tracks };
}

/* ---------- MIDI to patterns ---------- */

/** Bring a pitch onto the piano roll by whole octaves. */
export function fitPitch(pitch: number): number {
  let p = pitch;
  while (p < ROLL_LOW) p += 12;
  while (p > ROLL_HIGH) p -= 12;
  return p;
}

export interface ImportResult {
  project: Project;
  patternIds: string[];
  /** Notes that did not fit (past the longest pattern, or drums Steplab has no sound for). */
  skipped: number;
}

/**
 * Add the contents of a MIDI file to a song: each melodic track becomes a
 * melody on a new channel with the nearest sound, drums on channel 10 become
 * a drum loop, and everything is placed on the playlist at bar 1 on free
 * tracks. Timing snaps to the sixteenth-note grid.
 */
export function importMidi(p0: Project, song: MidiSong, baseName: string): ImportResult {
  let p = p0;
  const ticksPerStep = song.ppq / 4;
  const toStep = (t: number) => Math.round(t / ticksPerStep);
  const barLen = stepsPerBar(p.timeSig);
  const patternIds: string[] = [];
  let skipped = 0;
  let track = p.clips.reduce((m, c) => Math.max(m, c.track + 1), 0);

  const place = (id: string) => {
    const pat = findPattern(p, id)!;
    if (track >= p.tracks) p = { ...p, tracks: Math.min(32, track + 1) };
    p = addClip(p, id, Math.min(track, p.tracks - 1), 0, patternSteps(pat, p.timeSig)).project;
    track++;
  };
  const barsFor = (lastStep: number) => clampBars(Math.ceil((lastStep + 1) / barLen), p.timeSig);

  for (const t of song.tracks) {
    if (!t.notes.length) continue;
    if (t.channel === DRUM_CHANNEL) {
      const made = addDrumPattern(p);
      p = renamePattern(made.project, made.id, t.name || `${baseName} drums`);
      const limit = barsFor(Math.max(...t.notes.map((n) => toStep(n.tick)))) * barLen;
      p = setPatternBars(p, made.id, limit / barLen);
      for (const n of t.notes) {
        const family = drumForNote(n.pitch);
        const step = toStep(n.tick);
        if (!family || step >= Math.min(limit, MAX_STEPS)) {
          skipped++;
          continue;
        }
        // Use a channel with that sound, preferring the 808 kit; add one if the song has none.
        const want = (family + "808") as DrumId;
        let ch = p.channels.find((c) => c.kind === "drum" && (c.sound === family || c.sound === want || (family === "chat" && c.sound === "hat808")));
        if (!ch) {
          const sound: DrumId = family === "chat" ? "hat808" : family === "rim" || family === "cowbell" ? family : want;
          const made2 = drumChannel(sound);
          p = addChannel(p, made2);
          ch = made2;
        }
        p = setDrumStep(p, made.id, ch.id, step, true);
      }
      patternIds.push(made.id);
      place(made.id);
      continue;
    }
    const sound = synthForProgram(t.program ?? 0);
    const chan = synthChannel(sound, t.name || `${baseName} ${patternIds.length + 1}`);
    p = addChannel(p, chan);
    const made = addMelodyPattern(p, chan.id);
    p = renamePattern(made.project, made.id, t.name || `${baseName} ${patternIds.length + 1}`);
    const lastStep = Math.max(...t.notes.map((n) => toStep(n.tick)));
    const bars = barsFor(lastStep);
    p = setPatternBars(p, made.id, bars);
    const limit = Math.min(bars * barLen, MAX_STEPS);
    for (const n of t.notes) {
      const step = toStep(n.tick);
      if (step >= limit) {
        skipped++;
        continue;
      }
      p = addNote(p, made.id, {
        step,
        pitch: fitPitch(n.pitch),
        length: Math.max(1, Math.min(limit - step, toStep(n.duration))),
        velocity: n.velocity / 127 || DEFAULT_VELOCITY,
      });
    }
    patternIds.push(made.id);
    place(made.id);
  }
  return { project: p, patternIds, skipped };
}

/** Song length in MIDI ticks, handy for tests and file names. */
export const songTicks = (p: Project) => songSteps(p) * TICKS_PER_STEP;
