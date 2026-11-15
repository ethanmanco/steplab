import {
  DRUM_IDS,
  type DrumId,
  type DrumTrack,
  type LoopBars,
  type MelodyTrack,
  type Project,
  type SynthId,
} from "./types";
import { DEFAULT_BPM, MAX_STEPS, STEPS_PER_BAR, clampBpm } from "./timing";

export const DRUM_NAMES: Record<DrumId, string> = {
  kick: "Kick",
  snare: "Snare",
  chat: "Closed hat",
  ohat: "Open hat",
  clap: "Clap",
  tom: "Tom",
};

export const DEFAULT_VOLUME = 0.8;

function emptySteps(): boolean[] {
  return Array.from({ length: MAX_STEPS }, () => false);
}

function emptyNotes(): number[][] {
  return Array.from({ length: MAX_STEPS }, () => []);
}

export function emptyDrumTrack(id: DrumId): DrumTrack {
  return { id, steps: emptySteps(), volume: DEFAULT_VOLUME, muted: false };
}

export function emptyMelodyTrack(synth: SynthId): MelodyTrack {
  return { synth, notes: emptyNotes(), volume: DEFAULT_VOLUME, muted: false };
}

export function emptyProject(): Project {
  return {
    version: 1,
    bpm: DEFAULT_BPM,
    bars: 1,
    drums: DRUM_IDS.map(emptyDrumTrack),
    melodies: [emptyMelodyTrack("lead"), emptyMelodyTrack("bass")],
  };
}

/** A small starter beat, so the first press of Play makes a sound. */
export function demoProject(): Project {
  const p = emptyProject();
  const on = (id: DrumId, steps: number[]) => {
    const track = p.drums.find((d) => d.id === id)!;
    for (const s of steps) track.steps[s] = true;
  };
  on("kick", [0, 6, 8]);
  on("snare", [4, 12]);
  on("chat", [0, 2, 4, 6, 8, 10, 12]);
  on("ohat", [14]);
  on("clap", [12]);
  return p;
}

export function toggleDrumStep(project: Project, track: number, step: number): Project {
  return {
    ...project,
    drums: project.drums.map((d, i) =>
      i === track ? { ...d, steps: d.steps.map((v, s) => (s === step ? !v : v)) } : d,
    ),
  };
}

export function clearDrums(project: Project): Project {
  return { ...project, drums: project.drums.map((d) => ({ ...d, steps: emptySteps() })) };
}

export function setBpm(project: Project, bpm: unknown): Project {
  return { ...project, bpm: clampBpm(bpm) };
}

export type TrackKind = "drums" | "melodies";

export function setTrackMix(
  project: Project,
  kind: TrackKind,
  index: number,
  mix: { volume?: number; muted?: boolean },
): Project {
  const volume = mix.volume === undefined ? undefined : Math.min(1, Math.max(0, mix.volume));
  const apply = <T extends DrumTrack | MelodyTrack>(t: T, i: number): T =>
    i === index
      ? {
          ...t,
          ...(volume !== undefined && { volume }),
          ...(mix.muted !== undefined && { muted: mix.muted }),
        }
      : t;
  return kind === "drums"
    ? { ...project, drums: project.drums.map(apply) }
    : { ...project, melodies: project.melodies.map(apply) };
}

/**
 * Fill the bars from `from` up to `to` by repeating the first `from` bars,
 * but only when those bars are empty. Shrinking a loop keeps hidden bars, so
 * growing it again brings them back; growing into empty bars repeats the beat
 * instead of leaving silence.
 */
function extend<T>(
  list: T[],
  from: number,
  to: number,
  isEmpty: (v: T) => boolean,
  copy: (v: T) => T,
): T[] {
  const start = from * STEPS_PER_BAR;
  const end = to * STEPS_PER_BAR;
  if (!list.slice(start, end).every(isEmpty)) return list;
  return list.map((v, s) => (s >= start && s < end ? copy(list[s % start]!) : v));
}

export function setLoopBars(project: Project, bars: LoopBars): Project {
  const from = project.bars;
  if (bars <= from) return { ...project, bars };
  return {
    ...project,
    bars,
    drums: project.drums.map((d) => ({
      ...d,
      steps: extend(d.steps, from, bars, (v) => !v, (v) => v),
    })),
    melodies: project.melodies.map((m) => ({
      ...m,
      notes: extend(m.notes, from, bars, (v) => v.length === 0, (v) => [...v]),
    })),
  };
}
