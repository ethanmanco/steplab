import { loopSteps } from "./timing";
import type { DrumId, MelodyTrack, Note, Project, SynthId, TrackMix } from "./types";

export interface DrumHit {
  track: number;
  id: DrumId;
}

export interface NoteHit {
  pitch: number;
  velocity: number;
  /** How many steps the note should ring. */
  steps: number;
}

export interface MelodyHit {
  track: number;
  synth: SynthId;
  notes: NoteHit[];
}

export interface StepEvents {
  drums: DrumHit[];
  melodies: MelodyHit[];
}

/**
 * Whether a track should be heard. Solo works like a mixer: once any track
 * is soloed, only soloed tracks play. Mute always wins.
 */
export function audibleTracks(project: Project): { drums: boolean[]; melodies: boolean[] } {
  const all: TrackMix[] = [...project.drums, ...project.melodies];
  const anySolo = all.some((t) => t.solo);
  const audible = (t: TrackMix) => !t.muted && (!anySolo || t.solo);
  return { drums: project.drums.map(audible), melodies: project.melodies.map(audible) };
}

/**
 * How long a note actually rings: its own length, cut short if the same
 * pitch starts again sooner (looking around the loop end), so a repeated
 * pitch never cuts itself off mid-attack.
 */
export function playLength(track: MelodyTrack, n: Note, totalSteps: number): number {
  let length = n.length;
  for (const o of track.notes) {
    if (o === n || o.pitch !== n.pitch || o.step >= totalSteps) continue;
    const gap = (o.step - n.step + totalSteps) % totalSteps;
    if (gap > 0 && gap < length) length = gap;
  }
  return length;
}

/**
 * Everything that should sound on one loop step. Pure, so the audio
 * callback stays tiny and the logic can be tested without an AudioContext.
 */
export function eventsAtStep(project: Project, step: number): StepEvents {
  const audible = audibleTracks(project);
  const total = loopSteps(project.bars, project.timeSig);
  const drums: DrumHit[] = [];
  project.drums.forEach((d, track) => {
    if (audible.drums[track] && d.steps.includes(step)) drums.push({ track, id: d.id });
  });
  const melodies: MelodyHit[] = [];
  project.melodies.forEach((m, track) => {
    if (!audible.melodies[track]) return;
    const starting = m.notes.filter((n) => n.step === step);
    if (starting.length === 0) return;
    melodies.push({
      track,
      synth: m.synth,
      notes: starting.map((n) => ({ pitch: n.pitch, velocity: n.velocity, steps: playLength(m, n, total) })),
    });
  });
  return { drums, melodies };
}
