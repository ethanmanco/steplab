import { PIANO_ROWS } from "./notes";
import { DEFAULT_VOLUME, emptyProject } from "./project";
import { MAX_STEPS, clampBpm, isLoopBars } from "./timing";
import { DRUM_IDS, SYNTH_IDS, type DrumTrack, type MelodyTrack, type Project, type SynthId } from "./types";

/** Marks a JSON file as a Steplab project. */
export const FILE_APP = "steplab";
export const FILE_VERSION = 1;

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

export function serializeProject(project: Project, pretty = false): string {
  const file = { app: FILE_APP, ...project, version: FILE_VERSION };
  return JSON.stringify(file, null, pretty ? 2 : undefined);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readMix(raw: Record<string, unknown>): { volume: number; muted: boolean } {
  const v = Number(raw.volume);
  return {
    volume: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME,
    muted: raw.muted === true,
  };
}

function readSteps(raw: unknown): boolean[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: MAX_STEPS }, (_, i) => list[i] === true || list[i] === 1);
}

function readNotes(raw: unknown): number[][] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: MAX_STEPS }, (_, i) => {
    const step = list[i];
    if (!Array.isArray(step)) return [];
    const rows = step.filter((r): r is number => Number.isInteger(r) && r >= 0 && r < PIANO_ROWS);
    return [...new Set(rows)].sort((a, b) => a - b);
  });
}

/**
 * Read a project from JSON text. Files from this app are trusted to be
 * roughly right, so small problems are repaired (out of range tempo, short
 * step lists, unknown sounds) rather than rejected. Anything that is not a
 * Steplab project at all is refused with a message a person can act on.
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
  const rawDrums = Array.isArray(data.drums) ? data.drums.filter(isObject) : [];
  const drums: DrumTrack[] = DRUM_IDS.map((id) => {
    const raw = rawDrums.find((d) => d.id === id);
    return raw ? { id, steps: readSteps(raw.steps), ...readMix(raw) } : base.drums.find((d) => d.id === id)!;
  });

  const rawMelodies = Array.isArray(data.melodies) ? data.melodies.filter(isObject) : [];
  const melodies: MelodyTrack[] = base.melodies.map((fallback, i) => {
    const raw = rawMelodies[i];
    if (!raw) return fallback;
    const synth = (SYNTH_IDS as readonly unknown[]).includes(raw.synth) ? (raw.synth as SynthId) : fallback.synth;
    return { synth, notes: readNotes(raw.notes), ...readMix(raw) };
  });

  return {
    ok: true,
    project: {
      version: 1,
      bpm: clampBpm(data.bpm),
      bars: isLoopBars(data.bars) ? data.bars : 1,
      drums,
      melodies,
    },
  };
}
