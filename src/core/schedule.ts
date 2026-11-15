import { SYNTHS, rowToMidi } from "./notes";
import { loopSteps } from "./timing";
import type { DrumId, LoopBars, MelodyTrack, Project, SynthId } from "./types";

export interface DrumHit {
  track: number;
  id: DrumId;
}

export interface NoteHit {
  row: number;
  midi: number;
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
 * How long a note rings: the synth's gate length, cut short if the same
 * pitch starts again sooner (looking around the loop end). Retriggering a
 * pitch that is still ringing would otherwise make it stutter.
 */
export function noteSteps(track: MelodyTrack, step: number, row: number, bars: LoopBars): number {
  const gate = SYNTHS[track.synth].gate;
  const n = loopSteps(bars);
  for (let d = 1; d < gate; d++) {
    if (track.notes[(step + d) % n]?.includes(row)) return d;
  }
  return gate;
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
    if (m.muted || !rows || rows.length === 0) return;
    melodies.push({
      track,
      synth: m.synth,
      notes: rows.map((row) => ({
        row,
        midi: rowToMidi(m.synth, row),
        steps: noteSteps(m, step, row, project.bars),
      })),
    });
  });
  return { drums, melodies };
}
