import { inRollRange } from "./notes";
import {
  DEFAULT_FX,
  DEFAULT_MASTER,
  DEFAULT_TONE,
  DEFAULT_TRACKS,
  DEFAULT_VELOCITY,
  DEFAULT_VOLUME,
  DRUM_NAMES,
  MAX_SONG_STEPS,
  MAX_TRACKS,
  drumChannel,
  emptyProject,
  makeId,
  sortNotes,
  synthChannel,
} from "./project";
import { MAX_STEPS, clampBars, clampBpm, clampSwing, clampTimeSig, stepsPerBar } from "./timing";
import {
  CLASSIC_DRUMS,
  DELAY_TIMES,
  DRUM_IDS,
  SYNTH_IDS,
  type Channel,
  type ChannelFx,
  type DelayTime,
  type Master,
  type SampleInfo,
  type ToneShape,
  type Clip,
  type DrumId,
  type Note,
  type Pattern,
  type Project,
  type SynthId,
  type TimeSignature,
} from "./types";

/** Marks a JSON file as a Steplab project. */
export const FILE_APP = "steplab";
export const FILE_VERSION = 4;

/** Audio for user samples, base64 encoded, keyed by sample id. Saved files carry it; autosave does not. */
export type SampleData = Record<string, string>;

export type ParseResult = { ok: true; project: Project; sampleData: SampleData } | { ok: false; error: string };

export function serializeProject(project: Project, pretty = false, sampleData?: SampleData): string {
  const file = { app: FILE_APP, ...project, version: FILE_VERSION, ...(sampleData && { sampleData }) };
  return JSON.stringify(file, null, pretty ? 2 : undefined);
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const isStep = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_STEPS;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40;
const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : fallback);
const isDrum = (v: unknown): v is DrumId => (DRUM_IDS as readonly unknown[]).includes(v);
const isSynth = (v: unknown): v is SynthId => (SYNTH_IDS as readonly unknown[]).includes(v);

const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function readTone(raw: unknown): ToneShape {
  const r = isObject(raw) ? raw : {};
  return {
    cutoff: num(r.cutoff, 0, 1, DEFAULT_TONE.cutoff),
    resonance: num(r.resonance, 0, 1, DEFAULT_TONE.resonance),
    attack: num(r.attack, 0, 1, DEFAULT_TONE.attack),
    release: num(r.release, 0, 1, DEFAULT_TONE.release),
    octave: Math.round(num(r.octave, -2, 2, DEFAULT_TONE.octave)),
    glide: num(r.glide, 0, 1, DEFAULT_TONE.glide),
  };
}

function readFx(raw: unknown): ChannelFx {
  const r = isObject(raw) ? raw : {};
  return {
    low: num(r.low, -12, 12, DEFAULT_FX.low),
    mid: num(r.mid, -12, 12, DEFAULT_FX.mid),
    high: num(r.high, -12, 12, DEFAULT_FX.high),
    comp: num(r.comp, 0, 1, DEFAULT_FX.comp),
    reverb: num(r.reverb, 0, 1, DEFAULT_FX.reverb),
    delay: num(r.delay, 0, 1, DEFAULT_FX.delay),
  };
}

function readMaster(raw: unknown): Master {
  const r = isObject(raw) ? raw : {};
  return {
    volume: num(r.volume, 0, 1, DEFAULT_MASTER.volume),
    reverbSize: num(r.reverbSize, 0, 1, DEFAULT_MASTER.reverbSize),
    delayTime: (DELAY_TIMES as readonly unknown[]).includes(r.delayTime) ? (r.delayTime as DelayTime) : DEFAULT_MASTER.delayTime,
    delayFeedback: num(r.delayFeedback, 0, 0.9, DEFAULT_MASTER.delayFeedback),
  };
}

function readSample(raw: unknown): SampleInfo | null {
  if (!isObject(raw) || !isId(raw.id)) return null;
  const source = raw.source === "bundled" ? "bundled" : "user";
  const url = typeof raw.url === "string" && /^samples\/[\w./-]+$/.test(raw.url) && !raw.url.includes("..") ? raw.url : undefined;
  if (source === "bundled" && !url) return null;
  return {
    id: raw.id,
    name: text(raw.name, "Sample").slice(0, 60),
    source,
    ...(url && { url }),
    root: Math.round(num(raw.root, 0, 127, 60)),
  };
}

function readMix(raw: Raw) {
  const v = Number(raw.volume);
  return {
    volume: raw.volume !== null && raw.volume !== "" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME,
    muted: raw.muted === true,
    solo: raw.solo === true,
  };
}

function readNote(raw: unknown): Note | null {
  if (!isObject(raw) || !isStep(raw.step) || !inRollRange(raw.pitch as number)) return null;
  const length = Number(raw.length);
  const velocity = Number(raw.velocity);
  return {
    step: raw.step,
    pitch: raw.pitch as number,
    length: Number.isFinite(length) ? Math.max(1, Math.min(Math.round(length), MAX_STEPS - raw.step)) : 1,
    velocity: Number.isFinite(velocity) ? Math.min(1, Math.max(0.05, velocity)) : DEFAULT_VELOCITY,
  };
}

function readNotes(raw: unknown): Note[] {
  const seen = new Set<string>();
  const notes = list(raw)
    .map(readNote)
    .filter((n): n is Note => {
      if (!n) return false;
      const key = `${n.step}:${n.pitch}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return sortNotes(notes);
}

const readSteps = (raw: unknown) => [...new Set(list(raw).filter(isStep))].sort((a, b) => a - b);

/* ---------- Older versions: one fixed loop with six drums and two melody tracks ---------- */

interface OldSong {
  bpm: number;
  bars: number;
  timeSig: TimeSignature;
  swing: number;
  drums: { id: DrumId; steps: number[]; volume: number; muted: boolean; solo: boolean }[];
  melodies: { synth: SynthId; notes: Note[]; volume: number; muted: boolean; solo: boolean }[];
}

/** Version 1 stored one on/off flag per step and piano rows relative to each sound. */
const V1_SYNTHS: Partial<Record<SynthId, { base: number; gate: number }>> = {
  lead: { base: 60, gate: 1 },
  bass: { base: 36, gate: 1 },
  pluck: { base: 60, gate: 2 },
  pad: { base: 48, gate: 4 },
  b808: { base: 36, gate: 1 },
};

function readOld(data: Raw): OldSong {
  const v1 = data.version === 1;
  const rawDrums = list(data.drums).filter(isObject);
  const drums = CLASSIC_DRUMS.map((id) => {
    const raw = rawDrums.find((d) => d.id === id) ?? {};
    const steps = v1
      ? list(raw.steps).flatMap((v, i) => (v === true || v === 1 ? [i] : [])).filter(isStep)
      : readSteps(raw.steps);
    return { id, steps, ...readMix(raw) };
  });
  const rawMelodies = list(data.melodies).filter(isObject);
  const melodies = (["lead", "bass"] as const).map((fallback, i) => {
    const raw = rawMelodies[i] ?? {};
    const synth = isSynth(raw.synth) ? raw.synth : fallback;
    let notes: Note[];
    if (v1) {
      const { base, gate } = V1_SYNTHS[synth] ?? { base: 60, gate: 1 };
      notes = [];
      list(raw.notes).forEach((rows, step) => {
        for (const row of list(rows)) {
          if (!Number.isInteger(row) || !isStep(step)) continue;
          const pitch = base + (row as number);
          if (inRollRange(pitch)) notes.push({ step, pitch, length: gate, velocity: DEFAULT_VELOCITY });
        }
      });
      notes = sortNotes(notes);
    } else notes = readNotes(raw.notes);
    return { synth, notes, ...readMix(raw) };
  });
  const timeSig = v1 ? { beats: 4, unit: 4 as const } : clampTimeSig(data.timeSig);
  const bars = v1 ? ([1, 2, 4].includes(data.bars as number) ? (data.bars as number) : 1) : clampBars(data.bars, timeSig);
  return { bpm: clampBpm(data.bpm), bars, timeSig, swing: v1 ? 0 : clampSwing(data.swing), drums, melodies };
}

/** Turn an old single loop into a song: one drum loop and two melodies, all placed at bar 1. */
function upgrade(old: OldSong): Project {
  const drumChs = old.drums.map((d) => ({ ...drumChannel(d.id, DRUM_NAMES[d.id]), volume: d.volume, muted: d.muted, solo: d.solo }));
  const synthChs = old.melodies.map((m, i) => ({
    ...synthChannel(m.synth, `Melody ${i + 1}`),
    volume: m.volume,
    muted: m.muted,
    solo: m.solo,
  }));
  const rows: Record<string, number[]> = {};
  old.drums.forEach((d, i) => {
    if (d.steps.length) rows[drumChs[i]!.id] = d.steps;
  });
  const patterns: Pattern[] = [
    { id: makeId("p"), kind: "drums", name: "Drums 1", bars: old.bars, rows },
    ...old.melodies.map(
      (m, i): Pattern => ({ id: makeId("p"), kind: "melody", name: `Melody ${i + 1}`, bars: old.bars, channelId: synthChs[i]!.id, notes: m.notes }),
    ),
  ];
  const length = old.bars * stepsPerBar(old.timeSig);
  return {
    version: 4,
    bpm: old.bpm,
    timeSig: old.timeSig,
    swing: old.swing,
    channels: [...drumChs, ...synthChs],
    patterns,
    clips: patterns.map((pat, i) => ({ id: makeId("k"), patternId: pat.id, track: i, start: 0, length })),
    tracks: DEFAULT_TRACKS,
    master: { ...DEFAULT_MASTER },
    samples: [],
  };
}

/* ---------- Versions 3 and 4 (4 adds pan, tone, effects, master and samples) ---------- */

function readChannel(raw: unknown, sampleIds: Set<string>): Channel | null {
  if (!isObject(raw) || !isId(raw.id)) return null;
  const extra = {
    pan: num(raw.pan, -1, 1, 0),
    tone: readTone(raw.tone),
    fx: readFx(raw.fx),
    sample: isId(raw.sample) && sampleIds.has(raw.sample) ? raw.sample : null,
  };
  if (raw.kind === "drum" && isDrum(raw.sound)) {
    return { ...drumChannel(raw.sound, text(raw.name, DRUM_NAMES[raw.sound]), raw.id), ...readMix(raw), ...extra };
  }
  if (raw.kind === "synth" && isSynth(raw.sound)) {
    const ch = synthChannel(raw.sound, undefined, raw.id);
    return { ...ch, name: text(raw.name, ch.name), ...readMix(raw), ...extra };
  }
  return null;
}

function readV3(data: Raw): Project {
  const sampleIdSet = new Set<string>();
  const samples = list(data.samples)
    .map(readSample)
    .filter((x): x is SampleInfo => !!x && !sampleIdSet.has(x.id) && !!sampleIdSet.add(x.id));
  const timeSig = clampTimeSig(data.timeSig);
  const ids = new Set<string>();
  const channels = list(data.channels)
    .map((c) => readChannel(c, sampleIdSet))
    .filter((c): c is Channel => !!c && !ids.has(c.id) && !!ids.add(c.id));
  if (!channels.some((c) => c.kind === "synth")) channels.push(synthChannel("lead"));
  const drumIds = new Set(channels.filter((c) => c.kind === "drum").map((c) => c.id));
  const firstSynth = channels.find((c) => c.kind === "synth")!.id;
  const synthIds = new Set(channels.filter((c) => c.kind === "synth").map((c) => c.id));

  const patIds = new Set<string>();
  const patterns: Pattern[] = [];
  for (const raw of list(data.patterns)) {
    if (!isObject(raw) || !isId(raw.id) || patIds.has(raw.id)) continue;
    const bars = clampBars(raw.bars, timeSig);
    if (raw.kind === "drums") {
      const rows: Record<string, number[]> = {};
      if (isObject(raw.rows)) {
        for (const [ch, steps] of Object.entries(raw.rows)) {
          const clean = readSteps(steps);
          if (drumIds.has(ch) && clean.length) rows[ch] = clean;
        }
      }
      patterns.push({ id: raw.id, kind: "drums", name: text(raw.name, "Drums"), bars, rows });
    } else if (raw.kind === "melody") {
      const channelId = isId(raw.channelId) && synthIds.has(raw.channelId) ? raw.channelId : firstSynth;
      patterns.push({ id: raw.id, kind: "melody", name: text(raw.name, "Melody"), bars, channelId, notes: readNotes(raw.notes) });
    } else continue;
    patIds.add(raw.id);
  }

  const clips: Clip[] = [];
  const clipIds = new Set<string>();
  for (const raw of list(data.clips)) {
    if (!isObject(raw) || !isId(raw.id) || clipIds.has(raw.id) || !isId(raw.patternId) || !patIds.has(raw.patternId)) continue;
    const track = Number(raw.track);
    const start = Number(raw.start);
    const length = Number(raw.length);
    if (!Number.isInteger(track) || track < 0 || track >= MAX_TRACKS) continue;
    if (!Number.isInteger(start) || start < 0 || start >= MAX_SONG_STEPS) continue;
    if (!Number.isFinite(length) || length < 1) continue;
    clipIds.add(raw.id);
    clips.push({ id: raw.id, patternId: raw.patternId, track, start, length: Math.min(Math.round(length), MAX_SONG_STEPS - start) });
  }

  const usedTracks = clips.reduce((m, c) => Math.max(m, c.track + 1), 0);
  const tracks = Math.min(MAX_TRACKS, Math.max(DEFAULT_TRACKS, usedTracks, Number.isInteger(data.tracks) ? (data.tracks as number) : 0));
  return {
    version: 4,
    bpm: clampBpm(data.bpm),
    timeSig,
    swing: clampSwing(data.swing),
    channels,
    patterns,
    clips,
    tracks,
    master: readMaster(data.master),
    samples,
  };
}

/**
 * Read a project from JSON text. Small problems are repaired rather than
 * rejected, and files from earlier versions are upgraded into a song. Anything
 * that is not a Steplab project at all is refused with a message a person can
 * act on.
 */
export function parseProject(textIn: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(textIn);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isObject(data) || data.app !== FILE_APP) {
    return { ok: false, error: "That file is not a Steplab project." };
  }
  if (typeof data.version !== "number" || data.version > FILE_VERSION) {
    return { ok: false, error: "That project was made by a newer version of Steplab." };
  }
  if (data.version < 3) return { ok: true, project: upgrade(readOld(data)), sampleData: {} };
  if (!Array.isArray(data.channels)) return { ok: true, project: { ...emptyProject(), bpm: clampBpm(data.bpm) }, sampleData: {} };
  const project = readV3(data);
  // Embedded audio for the project's own user samples, kept as base64 text.
  const sampleData: SampleData = {};
  if (isObject(data.sampleData)) {
    for (const s of project.samples) {
      const b64 = data.sampleData[s.id];
      if (s.source === "user" && typeof b64 === "string" && /^[A-Za-z0-9+/=]+$/.test(b64)) sampleData[s.id] = b64;
    }
  }
  return { ok: true, project, sampleData };
}
