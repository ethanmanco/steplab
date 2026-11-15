import { SYNTHS } from "./notes";
import {
  DEFAULT_BPM,
  DEFAULT_TIME_SIG,
  MAX_STEPS,
  clampBars,
  clampBpm,
  clampSwing,
  clampTimeSig,
  stepsPerBar,
} from "./timing";
import {
  DRUM_IDS,
  type Channel,
  type Clip,
  type DrumId,
  type DrumPattern,
  type MelodyPattern,
  type Note,
  type Pattern,
  type Project,
  type SynthId,
  type TimeSignature,
} from "./types";

export const DRUM_NAMES: Record<DrumId, string> = {
  kick: "Kick",
  snare: "Snare",
  chat: "Closed hat",
  ohat: "Open hat",
  clap: "Clap",
  tom: "Tom",
  kick808: "808 Kick",
  snare808: "808 Snare",
  hat808: "808 Closed hat",
  ohat808: "808 Open hat",
  clap808: "808 Clap",
  tom808: "808 Tom",
  rim: "Rimshot",
  cowbell: "Cowbell",
};

/** The drum channels a new song starts with: an 808 kit. */
export const DEFAULT_KIT: readonly DrumId[] = ["kick808", "snare808", "hat808", "ohat808", "clap808", "rim"];

export const DEFAULT_VOLUME = 0.8;
export const DEFAULT_VELOCITY = 0.8;
export const DEFAULT_TRACKS = 8;
export const MAX_TRACKS = 32;
/** The playlist can reach 128 bars of 4/4. */
export const MAX_SONG_STEPS = 2048;

let idCount = 0;
/** Short ids that are unique within a session and very unlikely to clash across files. */
export function makeId(prefix: string): string {
  idCount += 1;
  return `${prefix}${idCount.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type SoundRef = { kind: "drum"; sound: DrumId } | { kind: "synth"; sound: SynthId };

export const soundName = (c: SoundRef) => (c.kind === "drum" ? DRUM_NAMES[c.sound] : SYNTHS[c.sound].name);

const mix = { volume: DEFAULT_VOLUME, muted: false, solo: false };

export function drumChannel(sound: DrumId, name = DRUM_NAMES[sound], id = makeId("c")): Channel {
  return { id, kind: "drum", sound, name, ...mix };
}

export function synthChannel(sound: SynthId, name = SYNTHS[sound].name, id = makeId("c")): Channel {
  return { id, kind: "synth", sound, name, ...mix };
}

export const patternSteps = (pattern: Pattern, sig: TimeSignature) => pattern.bars * stepsPerBar(sig);

export const drumChannels = (p: Project) => p.channels.filter((c) => c.kind === "drum");
export const synthChannels = (p: Project) => p.channels.filter((c) => c.kind === "synth");
export const findPattern = (p: Project, id: string | null) => p.patterns.find((x) => x.id === id);
export const findChannel = (p: Project, id: string) => p.channels.find((c) => c.id === id);

/** The next free name like "Drums 3". */
export function nextName(p: Project, base: string): string {
  const taken = new Set(p.patterns.map((x) => x.name));
  for (let i = 1; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

function newDrumPattern(name: string, bars = 1): DrumPattern {
  return { id: makeId("p"), kind: "drums", name, bars, rows: {} };
}

function newMelodyPattern(name: string, channelId: string, bars = 1): MelodyPattern {
  return { id: makeId("p"), kind: "melody", name, bars, channelId, notes: [] };
}

function defaultChannels(): Channel[] {
  return [...DEFAULT_KIT.map((d) => drumChannel(d)), synthChannel("lead"), synthChannel("b808")];
}

/** A fresh song: the standard channels, one drum loop and one melody, both placed at bar 1. */
export function emptyProject(): Project {
  const channels = defaultChannels();
  const drums = newDrumPattern("Drums 1");
  const melody = newMelodyPattern("Melody 1", channels.find((c) => c.kind === "synth")!.id);
  const bar = stepsPerBar(DEFAULT_TIME_SIG);
  return {
    version: 3,
    bpm: DEFAULT_BPM,
    timeSig: { ...DEFAULT_TIME_SIG },
    swing: 0,
    channels,
    patterns: [drums, melody],
    clips: [
      { id: makeId("k"), patternId: drums.id, track: 0, start: 0, length: bar },
      { id: makeId("k"), patternId: melody.id, track: 1, start: 0, length: bar },
    ],
    tracks: DEFAULT_TRACKS,
  };
}

const note = (step: number, pitch: number, length: number): Note => ({ step, pitch, length, velocity: DEFAULT_VELOCITY });

/** A short starter song: a beat and a bass line for four bars, with a hook coming in on bar 3. */
export function demoProject(): Project {
  const channels = defaultChannels();
  const byDrum = (d: DrumId) => channels.find((c) => c.kind === "drum" && c.sound === d)!.id;
  const lead = channels.find((c) => c.kind === "synth" && c.sound === "lead")!.id;
  const bassCh = channels.find((c) => c.kind === "synth" && c.sound === "b808")!.id;
  const beat: DrumPattern = {
    ...newDrumPattern("Beat"),
    rows: {
      [byDrum("kick808")]: [0, 6, 8],
      [byDrum("snare808")]: [4, 12],
      [byDrum("hat808")]: [0, 2, 4, 6, 8, 10, 12],
      [byDrum("ohat808")]: [14],
      [byDrum("clap808")]: [12],
    },
  };
  const hook: MelodyPattern = {
    ...newMelodyPattern("Hook", lead),
    notes: [note(2, 67, 2), note(4, 70, 2), note(7, 72, 3), note(10, 70, 2), note(12, 67, 4)],
  };
  const bass: MelodyPattern = {
    ...newMelodyPattern("Bassline", bassCh),
    notes: [note(0, 36, 3), note(3, 36, 2), note(6, 39, 3), note(10, 43, 3), note(14, 41, 2)],
  };
  return {
    version: 3,
    bpm: DEFAULT_BPM,
    timeSig: { ...DEFAULT_TIME_SIG },
    swing: 0,
    channels,
    patterns: [beat, bass, hook],
    clips: [
      { id: makeId("k"), patternId: beat.id, track: 0, start: 0, length: 64 },
      { id: makeId("k"), patternId: bass.id, track: 1, start: 0, length: 64 },
      { id: makeId("k"), patternId: hook.id, track: 2, start: 32, length: 32 },
    ],
    tracks: DEFAULT_TRACKS,
  };
}

const sortSteps = (steps: number[]) => [...new Set(steps)].sort((a, b) => a - b);

export const sortNotes = (notes: Note[]): Note[] =>
  [...notes].sort((a, b) => a.step - b.step || a.pitch - b.pitch);

function mapPattern(p: Project, id: string, fn: (x: Pattern) => Pattern): Project {
  return { ...p, patterns: p.patterns.map((x) => (x.id === id ? fn(x) : x)) };
}

function mapDrums(p: Project, id: string, fn: (x: DrumPattern) => DrumPattern): Project {
  return mapPattern(p, id, (x) => (x.kind === "drums" ? fn(x) : x));
}

function mapMelody(p: Project, id: string, fn: (x: MelodyPattern) => MelodyPattern): Project {
  return mapPattern(p, id, (x) => (x.kind === "melody" ? fn(x) : x));
}

/* ---------- Channels ---------- */

export function addChannel(p: Project, ch: Channel): Project {
  return { ...p, channels: [...p.channels, ch] };
}

/**
 * Remove a channel and everything it plays. Melodies on a removed synth move
 * to another synth channel; the last synth channel cannot be removed.
 */
export function removeChannel(p: Project, id: string): Project {
  const ch = findChannel(p, id);
  if (!ch) return p;
  if (ch.kind === "synth") {
    const other = p.channels.find((c) => c.kind === "synth" && c.id !== id);
    if (!other) return p;
    return {
      ...p,
      channels: p.channels.filter((c) => c.id !== id),
      patterns: p.patterns.map((x) => (x.kind === "melody" && x.channelId === id ? { ...x, channelId: other.id } : x)),
    };
  }
  return {
    ...p,
    channels: p.channels.filter((c) => c.id !== id),
    patterns: p.patterns.map((x) => {
      if (x.kind !== "drums" || !(id in x.rows)) return x;
      const rows = { ...x.rows };
      delete rows[id];
      return { ...x, rows };
    }),
  };
}

export function renameChannel(p: Project, id: string, name: string): Project {
  const clean = name.trim().slice(0, 40);
  if (!clean) return p;
  return { ...p, channels: p.channels.map((c) => (c.id === id ? { ...c, name: clean } : c)) };
}

/** Change a channel's sound, keeping its kind. A name that matched the old sound follows the new one. */
export function setChannelSound(p: Project, id: string, sound: DrumId | SynthId): Project {
  return {
    ...p,
    channels: p.channels.map((c) => {
      if (c.id !== id) return c;
      const renamed = c.name === soundName(c);
      if (c.kind === "drum" && (DRUM_IDS as readonly string[]).includes(sound)) {
        const next = { ...c, sound: sound as DrumId };
        return renamed ? { ...next, name: soundName(next) } : next;
      }
      if (c.kind === "synth" && sound in SYNTHS) {
        const next = { ...c, sound: sound as SynthId };
        return renamed ? { ...next, name: soundName(next) } : next;
      }
      return c;
    }),
  };
}

export function setChannelMix(
  p: Project,
  id: string,
  m: { volume?: number; muted?: boolean; solo?: boolean },
): Project {
  const patch: Partial<Channel> = {};
  if (m.volume !== undefined && Number.isFinite(m.volume)) patch.volume = Math.min(1, Math.max(0, m.volume));
  if (m.muted !== undefined) patch.muted = m.muted;
  if (m.solo !== undefined) patch.solo = m.solo;
  return { ...p, channels: p.channels.map((c) => (c.id === id ? ({ ...c, ...patch } as Channel) : c)) };
}

/* ---------- Patterns ---------- */

export function addDrumPattern(p: Project): { project: Project; id: string } {
  const pat = newDrumPattern(nextName(p, "Drums"));
  return { project: { ...p, patterns: [...p.patterns, pat] }, id: pat.id };
}

export function addMelodyPattern(p: Project, channelId?: string): { project: Project; id: string } {
  const ch = (channelId && findChannel(p, channelId)?.kind === "synth" ? channelId : null) ?? synthChannels(p)[0]?.id;
  if (!ch) return { project: p, id: "" };
  const pat = newMelodyPattern(nextName(p, "Melody"), ch);
  return { project: { ...p, patterns: [...p.patterns, pat] }, id: pat.id };
}

/** Copy a pattern under a new name, ready for a variation. */
export function duplicatePattern(p: Project, id: string): { project: Project; id: string } {
  const src = findPattern(p, id);
  if (!src) return { project: p, id: "" };
  const base = src.name.replace(/\s+\d+$/, "");
  const copy: Pattern = { ...structuredClone(src), id: makeId("p"), name: nextName(p, base) };
  return { project: { ...p, patterns: [...p.patterns, copy] }, id: copy.id };
}

/** Delete a pattern and every clip that plays it. */
export function deletePattern(p: Project, id: string): Project {
  return { ...p, patterns: p.patterns.filter((x) => x.id !== id), clips: p.clips.filter((c) => c.patternId !== id) };
}

export function renamePattern(p: Project, id: string, name: string): Project {
  const clean = name.trim().slice(0, 40);
  return clean ? mapPattern(p, id, (x) => ({ ...x, name: clean })) : p;
}

export function setMelodyChannel(p: Project, id: string, channelId: string): Project {
  if (findChannel(p, channelId)?.kind !== "synth") return p;
  return mapMelody(p, id, (x) => ({ ...x, channelId }));
}

/**
 * Change a pattern's length. Growing into empty bars repeats what is there,
 * so the loop keeps going; shrinking keeps hidden bars for later. Clips that
 * showed exactly one pass of the pattern grow or shrink with it.
 */
export function setPatternBars(p: Project, id: string, value: unknown): Project {
  const pat = findPattern(p, id);
  if (!pat) return p;
  const bars = clampBars(value, p.timeSig);
  const oldLen = patternSteps(pat, p.timeSig);
  const newLen = bars * stepsPerBar(p.timeSig);
  const clips = p.clips.map((c) => (c.patternId === id && c.length === oldLen ? { ...c, length: newLen } : c));
  if (newLen <= oldLen) return { ...mapPattern(p, id, (x) => ({ ...x, bars })), clips };
  const inNew = (s: number) => s >= oldLen && s < newLen;
  const repeats = Math.ceil((newLen - oldLen) / oldLen);
  const repeat = <T>(items: T[], stepOf: (t: T) => number, move: (t: T, by: number) => T): T[] => {
    if (items.some((t) => inNew(stepOf(t)))) return items;
    const base = items.filter((t) => stepOf(t) < oldLen);
    const extra = Array.from({ length: repeats }, (_, r) => base.map((t) => move(t, oldLen * (r + 1)))).flat();
    return [...items, ...extra.filter((t) => inNew(stepOf(t)))];
  };
  const next = mapPattern(p, id, (x) => {
    if (x.kind === "drums") {
      const rows: Record<string, number[]> = {};
      for (const [ch, steps] of Object.entries(x.rows)) {
        rows[ch] = sortSteps(repeat(steps, (s) => s, (s, by) => s + by));
      }
      return { ...x, bars, rows };
    }
    return { ...x, bars, notes: sortNotes(repeat(x.notes, (n) => n.step, (n, by) => ({ ...n, step: n.step + by }))) };
  });
  return { ...next, clips };
}

/* ---------- Drum steps ---------- */

export function drumStepOn(pat: DrumPattern, channelId: string, step: number): boolean {
  return pat.rows[channelId]?.includes(step) ?? false;
}

export function setDrumStep(p: Project, patternId: string, channelId: string, step: number, on: boolean): Project {
  const pat = findPattern(p, patternId);
  if (!pat || pat.kind !== "drums" || step < 0 || step >= MAX_STEPS) return p;
  if (drumStepOn(pat, channelId, step) === on) return p;
  return mapDrums(p, patternId, (x) => {
    const cur = x.rows[channelId] ?? [];
    return { ...x, rows: { ...x.rows, [channelId]: on ? sortSteps([...cur, step]) : cur.filter((s) => s !== step) } };
  });
}

export function clearPattern(p: Project, id: string): Project {
  return mapPattern(p, id, (x) => (x.kind === "drums" ? { ...x, rows: {} } : { ...x, notes: [] }));
}

/* ---------- Melody notes ---------- */

/** The note that sounds at a step and pitch, if any (its start or any held step). */
export function noteAt(pat: MelodyPattern, step: number, pitch: number): Note | undefined {
  return pat.notes.find((n) => n.pitch === pitch && step >= n.step && step < n.step + n.length);
}

/**
 * Add a note. Same-pitch notes it would overlap are trimmed (if they start
 * earlier) or removed (if they start inside it), like drawing in a piano roll.
 */
export function addNote(p: Project, patternId: string, n: Note): Project {
  if (n.step < 0 || n.step >= MAX_STEPS) return p;
  const clean: Note = {
    step: n.step,
    pitch: n.pitch,
    length: Math.max(1, Math.min(Math.round(n.length), MAX_STEPS - n.step)),
    velocity: Math.min(1, Math.max(0.05, n.velocity)),
  };
  const end = clean.step + clean.length;
  return mapMelody(p, patternId, (m) => {
    const kept: Note[] = [];
    for (const o of m.notes) {
      if (o.pitch !== clean.pitch) kept.push(o);
      else if (o.step >= clean.step && o.step < end) continue;
      else if (o.step < clean.step && o.step + o.length > clean.step) kept.push({ ...o, length: clean.step - o.step });
      else kept.push(o);
    }
    return { ...m, notes: sortNotes([...kept, clean]) };
  });
}

export function removeNoteAt(p: Project, patternId: string, step: number, pitch: number): Project {
  const pat = findPattern(p, patternId);
  const hit = pat?.kind === "melody" ? noteAt(pat, step, pitch) : undefined;
  if (!hit) return p;
  return mapMelody(p, patternId, (m) => ({ ...m, notes: m.notes.filter((x) => x !== hit) }));
}

export function resizeNoteAt(p: Project, patternId: string, step: number, pitch: number, length: number): Project {
  const pat = findPattern(p, patternId);
  const hit = pat?.kind === "melody" ? noteAt(pat, step, pitch) : undefined;
  if (!hit) return p;
  const without = mapMelody(p, patternId, (m) => ({ ...m, notes: m.notes.filter((x) => x !== hit) }));
  return addNote(without, patternId, { ...hit, length });
}

/* ---------- Playlist clips ---------- */

const clampTrack = (p: Project, t: number) => Math.min(p.tracks - 1, Math.max(0, Math.round(t)));
const clampStart = (s: number) => Math.min(MAX_SONG_STEPS - 1, Math.max(0, Math.round(s)));

export function addClip(p: Project, patternId: string, track: number, start: number, length?: number): { project: Project; id: string } {
  const pat = findPattern(p, patternId);
  if (!pat) return { project: p, id: "" };
  const s = clampStart(start);
  const clip: Clip = {
    id: makeId("k"),
    patternId,
    track: clampTrack(p, track),
    start: s,
    length: Math.max(1, Math.min(length ?? patternSteps(pat, p.timeSig), MAX_SONG_STEPS - s)),
  };
  return { project: { ...p, clips: [...p.clips, clip] }, id: clip.id };
}

export function moveClip(p: Project, id: string, track: number, start: number): Project {
  return {
    ...p,
    clips: p.clips.map((c) => {
      if (c.id !== id) return c;
      const s = clampStart(start);
      return { ...c, track: clampTrack(p, track), start: s, length: Math.min(c.length, MAX_SONG_STEPS - s) };
    }),
  };
}

export function resizeClip(p: Project, id: string, length: number): Project {
  return {
    ...p,
    clips: p.clips.map((c) =>
      c.id === id ? { ...c, length: Math.max(1, Math.min(Math.round(length), MAX_SONG_STEPS - c.start)) } : c,
    ),
  };
}

export function deleteClip(p: Project, id: string): Project {
  return { ...p, clips: p.clips.filter((c) => c.id !== id) };
}

/** Put a copy of a clip straight after it on the same track. */
export function duplicateClip(p: Project, id: string): { project: Project; id: string } {
  const c = p.clips.find((x) => x.id === id);
  if (!c || c.start + c.length >= MAX_SONG_STEPS) return { project: p, id: "" };
  return addClip(p, c.patternId, c.track, c.start + c.length, c.length);
}

export function addTrack(p: Project): Project {
  return { ...p, tracks: Math.min(MAX_TRACKS, p.tracks + 1) };
}

/**
 * The patterns that play alongside a pattern in the song: everything playing
 * at the moment its first clip starts. Used as the default backing when you
 * record, so you hear what the melody will sit with. Falls back to the first
 * drum loop when the pattern is not placed or plays alone.
 */
export function playsAlongside(p: Project, patternId: string): string[] {
  const first = p.clips.filter((c) => c.patternId === patternId).sort((a, b) => a.start - b.start)[0];
  const ids = first
    ? p.clips
        .filter((c) => c.patternId !== patternId && c.start <= first.start && first.start < c.start + c.length)
        .map((c) => c.patternId)
    : [];
  const unique = [...new Set(ids)];
  if (unique.length) return unique;
  const drums = p.patterns.find((x) => x.kind === "drums");
  return drums ? [drums.id] : [];
}

/** Song length: the end of the last clip, rounded up to a whole bar, at least one bar. */
export function songSteps(p: Project): number {
  const bar = stepsPerBar(p.timeSig);
  const end = p.clips.reduce((m, c) => Math.max(m, c.start + c.length), 0);
  return Math.max(bar, Math.ceil(end / bar) * bar);
}

/* ---------- Song settings ---------- */

export function setBpm(p: Project, bpm: unknown): Project {
  return { ...p, bpm: clampBpm(bpm) };
}

export function setSwing(p: Project, swing: unknown): Project {
  return { ...p, swing: clampSwing(swing) };
}

/**
 * Change the time signature. Notes and clips keep their place in time; bar
 * lines move around them. Pattern lengths are trimmed if they no longer fit.
 */
export function setTimeSig(p: Project, sig: TimeSignature): Project {
  const timeSig = clampTimeSig(sig);
  return { ...p, timeSig, patterns: p.patterns.map((x) => ({ ...x, bars: clampBars(x.bars, timeSig) })) };
}
