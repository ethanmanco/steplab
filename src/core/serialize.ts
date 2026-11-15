import { inRollRange } from "./notes";
import { DEFAULT_VELOCITY, DEFAULT_VOLUME, emptyProject, sortNotes } from "./project";
import { MAX_STEPS, clampBars, clampBpm, clampSwing, clampTimeSig } from "./timing";
import { DRUM_IDS, SYNTH_IDS, type DrumTrack, type MelodyTrack, type Note, type Project, type SynthId } from "./types";

/** Marks a JSON file as a Steplab project. */
export const FILE_APP = "steplab";
export const FILE_VERSION = 2;

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

export function serializeProject(project: Project, pretty = false): string {
  const file = { app: FILE_APP, ...project, version: FILE_VERSION };
  return JSON.stringify(file, null, pretty ? 2 : undefined);
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const isStep = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_STEPS;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function readMix(raw: Raw) {
  const v = Number(raw.volume);
  return {
    volume: raw.volume !== null && raw.volume !== "" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME,
    muted: raw.muted === true,
    solo: raw.solo === true,
  };
}

const readSynth = (raw: unknown, fallback: SynthId): SynthId =>
  (SYNTH_IDS as readonly unknown[]).includes(raw) ? (raw as SynthId) : fallback;

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

/** Version 1 stored one on/off flag per step and piano rows relative to each sound. */
const V1_SYNTHS: Record<SynthId, { base: number; gate: number }> = {
  lead: { base: 60, gate: 1 },
  bass: { base: 36, gate: 1 },
  pluck: { base: 60, gate: 2 },
  pad: { base: 48, gate: 4 },
};

function readV1(data: Raw, base: Project): Project {
  const rawDrums = list(data.drums).filter(isObject);
  const drums: DrumTrack[] = DRUM_IDS.map((id) => {
    const raw = rawDrums.find((d) => d.id === id);
    if (!raw) return base.drums.find((d) => d.id === id)!;
    const steps = list(raw.steps).flatMap((v, i) => (v === true || v === 1 ? [i] : [])).filter(isStep);
    return { id, steps, ...readMix(raw) };
  });
  const rawMelodies = list(data.melodies).filter(isObject);
  const melodies: MelodyTrack[] = base.melodies.map((fallback, i) => {
    const raw = rawMelodies[i];
    if (!raw) return fallback;
    const synth = readSynth(raw.synth, fallback.synth);
    const v1 = V1_SYNTHS[synth];
    const notes: Note[] = [];
    list(raw.notes).forEach((rows, step) => {
      for (const row of list(rows)) {
        if (!Number.isInteger(row) || !isStep(step)) continue;
        const pitch = v1.base + (row as number);
        if (inRollRange(pitch)) notes.push({ step, pitch, length: v1.gate, velocity: DEFAULT_VELOCITY });
      }
    });
    return { synth, notes: sortNotes(notes), ...readMix(raw) };
  });
  const bars = [1, 2, 4].includes(data.bars as number) ? (data.bars as number) : 1;
  return { ...base, bpm: clampBpm(data.bpm), bars, drums, melodies };
}

/**
 * Read a project from JSON text. Small problems are repaired (out of range
 * tempo, unknown sounds, notes off the roll) rather than rejected. Files from
 * the first version are upgraded. Anything that is not a Steplab project at
 * all is refused with a message a person can act on.
 */
export function parseProject(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isObject(data) || data.app !== FILE_APP) {
    return { ok: false, error: "That file is not a Steplab project." };
  }
  if (typeof data.version !== "number" || data.version > FILE_VERSION) {
    return { ok: false, error: "That project was made by a newer version of Steplab." };
  }

  const base = emptyProject();
  if (data.version < 2) return { ok: true, project: readV1(data, base) };

  const rawDrums = list(data.drums).filter(isObject);
  const drums: DrumTrack[] = DRUM_IDS.map((id) => {
    const raw = rawDrums.find((d) => d.id === id);
    if (!raw) return base.drums.find((d) => d.id === id)!;
    const steps = [...new Set(list(raw.steps).filter(isStep))].sort((a, b) => a - b);
    return { id, steps, ...readMix(raw) };
  });

  const rawMelodies = list(data.melodies).filter(isObject);
  const melodies: MelodyTrack[] = base.melodies.map((fallback, i) => {
    const raw = rawMelodies[i];
    if (!raw) return fallback;
    const seen = new Set<string>();
    const notes = list(raw.notes)
      .map(readNote)
      .filter((n): n is Note => {
        if (!n) return false;
        const key = `${n.step}:${n.pitch}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { synth: readSynth(raw.synth, fallback.synth), notes: sortNotes(notes), ...readMix(raw) };
  });

  const timeSig = clampTimeSig(data.timeSig);
  return {
    ok: true,
    project: {
      version: 2,
      bpm: clampBpm(data.bpm),
      bars: clampBars(data.bars, timeSig),
      timeSig,
      swing: clampSwing(data.swing),
      drums,
      melodies,
    },
  };
}
