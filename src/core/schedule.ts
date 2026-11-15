import type { DrumId, Project, SynthId } from "./types";

export interface DrumHit {
  track: number;
  id: DrumId;
}

export interface MelodyHit {
  track: number;
  synth: SynthId;
  rows: number[];
}

export interface StepEvents {
  drums: DrumHit[];
  melodies: MelodyHit[];
}

/**
 * Everything that should sound on one loop step. Pure, so the audio
 * callback stays tiny and the logic can be tested without an AudioContext.
 * Muted tracks are skipped here as well as silenced in the mixer.
 */
export function eventsAtStep(project: Project, step: number): StepEvents {
  const drums: DrumHit[] = [];
  project.drums.forEach((d, track) => {
    if (!d.muted && d.steps[step]) drums.push({ track, id: d.id });
  });
  const melodies: MelodyHit[] = [];
  project.melodies.forEach((m, track) => {
    const rows = m.notes[step];
    if (!m.muted && rows && rows.length > 0) {
      melodies.push({ track, synth: m.synth, rows: [...rows] });
    }
  });
  return { drums, melodies };
}
