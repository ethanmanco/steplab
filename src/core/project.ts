import {
  DRUM_IDS,
  type DrumId,
  type DrumTrack,
  type MelodyTrack,
  type Note,
  type Project,
  type SynthId,
  type TimeSignature,
} from "./types";
import {
  DEFAULT_BPM,
  DEFAULT_TIME_SIG,
  MAX_STEPS,
  clampBars,
  clampBpm,
  clampSwing,
  clampTimeSig,
  loopSteps,
} from "./timing";

export const DRUM_NAMES: Record<DrumId, string> = {
  kick: "Kick",
  snare: "Snare",
  chat: "Closed hat",
  ohat: "Open hat",
  clap: "Clap",
  tom: "Tom",
};

export const DEFAULT_VOLUME = 0.8;
export const DEFAULT_VELOCITY = 0.8;

export function emptyDrumTrack(id: DrumId): DrumTrack {
  return { id, steps: [], volume: DEFAULT_VOLUME, muted: false, solo: false };
}

export function emptyMelodyTrack(synth: SynthId): MelodyTrack {
  return { synth, notes: [], volume: DEFAULT_VOLUME, muted: false, solo: false };
}

export function emptyProject(): Project {
  return {
    version: 2,
    bpm: DEFAULT_BPM,
    bars: 1,
    timeSig: { ...DEFAULT_TIME_SIG },
    swing: 0,
    drums: DRUM_IDS.map(emptyDrumTrack),
    melodies: [emptyMelodyTrack("lead"), emptyMelodyTrack("bass")],
  };
}

const note = (step: number, pitch: number, length: number): Note => ({
  step,
  pitch,
  length,
  velocity: DEFAULT_VELOCITY,
});

/** A small starter beat, so the first press of Play makes a sound. */
export function demoProject(): Project {
  const p = emptyProject();
  const hits: Partial<Record<DrumId, number[]>> = {
    kick: [0, 6, 8],
    snare: [4, 12],
    chat: [0, 2, 4, 6, 8, 10, 12],
    ohat: [14],
    clap: [12],
  };
  p.drums = p.drums.map((d) => ({ ...d, steps: hits[d.id] ?? [] }));
  // A short C minor hook on the lead and a bass line under it.
  p.melodies[0]!.notes = [note(2, 67, 2), note(4, 70, 2), note(7, 72, 3), note(10, 70, 2), note(12, 67, 4)];
  p.melodies[1]!.notes = [note(0, 48, 2), note(3, 48, 2), note(6, 51, 3), note(10, 55, 3), note(14, 53, 2)];
  return p;
}

const sortSteps = (steps: number[]) => [...new Set(steps)].sort((a, b) => a - b);

export const sortNotes = (notes: Note[]): Note[] =>
  [...notes].sort((a, b) => a.step - b.step || a.pitch - b.pitch);

function mapDrum(project: Project, track: number, fn: (d: DrumTrack) => DrumTrack): Project {
  return { ...project, drums: project.drums.map((d, i) => (i === track ? fn(d) : d)) };
}

function mapMelody(project: Project, track: number, fn: (m: MelodyTrack) => MelodyTrack): Project {
  return { ...project, melodies: project.melodies.map((m, i) => (i === track ? fn(m) : m)) };
}

/* ---------- Drums ---------- */

export function setDrumStep(project: Project, track: number, step: number, on: boolean): Project {
  const d = project.drums[track];
  if (!d || step < 0 || step >= MAX_STEPS || d.steps.includes(step) === on) return project;
  return mapDrum(project, track, (t) => ({
    ...t,
    steps: on ? sortSteps([...t.steps, step]) : t.steps.filter((s) => s !== step),
  }));
}

export function toggleDrumStep(project: Project, track: number, step: number): Project {
  const on = project.drums[track]?.steps.includes(step) ?? false;
  return setDrumStep(project, track, step, !on);
}

export function clearDrums(project: Project): Project {
  return { ...project, drums: project.drums.map((d) => ({ ...d, steps: [] })) };
}

/* ---------- Melody notes ---------- */

/** The note that sounds at a step and pitch, if any (its start or any held step). */
export function noteAt(track: MelodyTrack, step: number, pitch: number): Note | undefined {
  return track.notes.find((n) => n.pitch === pitch && step >= n.step && step < n.step + n.length);
}

/**
 * Add a note. Same-pitch notes it would overlap are trimmed (if they start
 * earlier) or removed (if they start inside it), like drawing in a piano roll.
 */
export function addNote(project: Project, track: number, n: Note): Project {
  if (n.step < 0 || n.step >= MAX_STEPS) return project;
  const clean: Note = {
    step: n.step,
    pitch: n.pitch,
    length: Math.max(1, Math.min(Math.round(n.length), MAX_STEPS - n.step)),
    velocity: Math.min(1, Math.max(0.05, n.velocity)),
  };
  const end = clean.step + clean.length;
  return mapMelody(project, track, (m) => {
    const kept: Note[] = [];
    for (const o of m.notes) {
      if (o.pitch !== clean.pitch) kept.push(o);
      else if (o.step >= clean.step && o.step < end) continue;
      else if (o.step < clean.step && o.step + o.length > clean.step) {
        kept.push({ ...o, length: clean.step - o.step });
      } else kept.push(o);
    }
    return { ...m, notes: sortNotes([...kept, clean]) };
  });
}

/** Remove whichever note covers this step and pitch. */
export function removeNoteAt(project: Project, track: number, step: number, pitch: number): Project {
  const m = project.melodies[track];
  const hit = m && noteAt(m, step, pitch);
  if (!hit) return project;
  return mapMelody(project, track, (t) => ({ ...t, notes: t.notes.filter((n) => n !== hit) }));
}

/** Change the length of the note covering this step and pitch. */
export function resizeNoteAt(
  project: Project,
  track: number,
  step: number,
  pitch: number,
  length: number,
): Project {
  const m = project.melodies[track];
  const hit = m && noteAt(m, step, pitch);
  if (!hit) return project;
  const without = mapMelody(project, track, (t) => ({ ...t, notes: t.notes.filter((n) => n !== hit) }));
  return addNote(without, track, { ...hit, length });
}

export function setSynth(project: Project, track: number, synth: SynthId): Project {
  return mapMelody(project, track, (m) => ({ ...m, synth }));
}

export function clearMelody(project: Project, track: number): Project {
  return mapMelody(project, track, (m) => ({ ...m, notes: [] }));
}

/* ---------- Song settings ---------- */

export function setBpm(project: Project, bpm: unknown): Project {
  return { ...project, bpm: clampBpm(bpm) };
}

export function setSwing(project: Project, swing: unknown): Project {
  return { ...project, swing: clampSwing(swing) };
}

export type TrackKind = "drums" | "melodies";

export function setTrackMix(
  project: Project,
  kind: TrackKind,
  index: number,
  mix: { volume?: number; muted?: boolean; solo?: boolean },
): Project {
  const patch: Partial<DrumTrack & MelodyTrack> = {};
  if (mix.volume !== undefined && Number.isFinite(mix.volume)) {
    patch.volume = Math.min(1, Math.max(0, mix.volume));
  }
  if (mix.muted !== undefined) patch.muted = mix.muted;
  if (mix.solo !== undefined) patch.solo = mix.solo;
  return kind === "drums"
    ? mapDrum(project, index, (t) => ({ ...t, ...patch }))
    : mapMelody(project, index, (t) => ({ ...t, ...patch }));
}

/**
 * Change the loop length. Growing into bars that are empty for a track
 * repeats that track's current loop, so the beat keeps going. Shrinking
 * keeps everything past the end, so growing again brings it back.
 */
export function setLoopBars(project: Project, value: unknown): Project {
  const bars = clampBars(value, project.timeSig);
  const oldLen = loopSteps(project.bars, project.timeSig);
  const newLen = loopSteps(bars, project.timeSig);
  if (newLen <= oldLen) return { ...project, bars };
  const inNew = (s: number) => s >= oldLen && s < newLen;
  const repeats = Math.ceil((newLen - oldLen) / oldLen);
  return {
    ...project,
    bars,
    drums: project.drums.map((d) => {
      if (d.steps.some(inNew)) return d;
      const base = d.steps.filter((s) => s < oldLen);
      const extra = Array.from({ length: repeats }, (_, r) => base.map((s) => s + oldLen * (r + 1))).flat();
      return { ...d, steps: sortSteps([...d.steps, ...extra.filter(inNew)]) };
    }),
    melodies: project.melodies.map((m) => {
      if (m.notes.some((n) => inNew(n.step))) return m;
      const base = m.notes.filter((n) => n.step < oldLen);
      const extra = Array.from({ length: repeats }, (_, r) =>
        base.map((n) => ({ ...n, step: n.step + oldLen * (r + 1) })),
      ).flat();
      return { ...m, notes: sortNotes([...m.notes, ...extra.filter((n) => inNew(n.step))]) };
    }),
  };
}

/**
 * Change the time signature. Notes keep their place in time; bar lines move
 * around them. The bar count is trimmed if the new bars are too long to fit.
 */
export function setTimeSig(project: Project, sig: TimeSignature): Project {
  const timeSig = clampTimeSig(sig);
  return { ...project, timeSig, bars: clampBars(project.bars, timeSig) };
}
