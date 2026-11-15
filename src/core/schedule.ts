import { findPattern, patternSteps, songSteps } from "./project";
import type { Clip, DrumId, MelodyPattern, Note, Pattern, PlayMode, Project } from "./types";

export interface DrumHit {
  channelId: string;
  sound: DrumId;
}

export interface NoteHit {
  channelId: string;
  pitch: number;
  velocity: number;
  /** How many steps the note should ring. */
  steps: number;
}

export interface StepEvents {
  drums: DrumHit[];
  notes: NoteHit[];
}

/**
 * Which channels should be heard. Solo works like a mixer: once any channel
 * is soloed, only soloed channels play. Mute always wins.
 */
export function audibleChannels(p: Project): Set<string> {
  const anySolo = p.channels.some((c) => c.solo);
  return new Set(p.channels.filter((c) => !c.muted && (!anySolo || c.solo)).map((c) => c.id));
}

/**
 * How long a note actually rings inside its pattern: its own length, cut
 * short if the same pitch starts again sooner (looking around the pattern
 * end), so a repeated pitch never cuts itself off mid-attack.
 */
export function playLength(pat: MelodyPattern, n: Note, total: number): number {
  let length = n.length;
  for (const o of pat.notes) {
    if (o === n || o.pitch !== n.pitch || o.step >= total) continue;
    const gap = (o.step - n.step + total) % total;
    if (gap > 0 && gap < length) length = gap;
  }
  return length;
}

/** What one pattern plays at a step inside it. `limit` cuts notes at a clip's end. */
function patternEvents(p: Project, pat: Pattern, local: number, audible: Set<string>, limit: number, out: StepEvents) {
  const total = patternSteps(pat, p.timeSig);
  if (pat.kind === "drums") {
    for (const ch of p.channels) {
      if (ch.kind !== "drum" || !audible.has(ch.id)) continue;
      if (pat.rows[ch.id]?.includes(local)) out.drums.push({ channelId: ch.id, sound: ch.sound });
    }
    return;
  }
  if (!audible.has(pat.channelId)) return;
  for (const n of pat.notes) {
    if (n.step !== local) continue;
    out.notes.push({
      channelId: pat.channelId,
      pitch: n.pitch,
      velocity: n.velocity,
      steps: Math.min(playLength(pat, n, total), limit),
    });
  }
}

/** Pattern mode: loop one pattern on its own. */
export function patternEventsAtStep(p: Project, patternId: string, step: number): StepEvents {
  const out: StepEvents = { drums: [], notes: [] };
  const pat = findPattern(p, patternId);
  if (!pat) return out;
  patternEvents(p, pat, step % patternSteps(pat, p.timeSig), audibleChannels(p), Infinity, out);
  return out;
}

/** Song mode: everything the playlist plays at a song step. */
export function songEventsAtStep(p: Project, step: number): StepEvents {
  const out: StepEvents = { drums: [], notes: [] };
  const audible = audibleChannels(p);
  for (const c of p.clips) {
    if (step < c.start || step >= c.start + c.length) continue;
    const pat = findPattern(p, c.patternId);
    if (!pat) continue;
    patternEvents(p, pat, (step - c.start) % patternSteps(pat, p.timeSig), audible, c.start + c.length - step, out);
  }
  return out;
}

/** How many steps the transport loops over in a mode. */
export function loopLength(p: Project, mode: PlayMode, patternId: string | null): number {
  if (mode === "pattern") {
    const pat = findPattern(p, patternId);
    if (pat) return patternSteps(pat, p.timeSig);
  }
  return songSteps(p);
}

export function eventsAt(p: Project, mode: PlayMode, patternId: string | null, step: number): StepEvents {
  if (mode === "pattern" && findPattern(p, patternId)) return patternEventsAtStep(p, patternId!, step);
  return songEventsAtStep(p, step);
}

/**
 * Where a pattern is playing at a song step, for drawing its editor's
 * playhead in song mode. The topmost clip wins when several overlap.
 */
export function clipAt(p: Project, patternId: string, songStep: number): { clip: Clip; local: number } | null {
  const pat = findPattern(p, patternId);
  if (!pat) return null;
  const clip = p.clips
    .filter((c) => c.patternId === patternId && songStep >= c.start && songStep < c.start + c.length)
    .sort((a, b) => a.track - b.track)[0];
  return clip ? { clip, local: (songStep - clip.start) % patternSteps(pat, p.timeSig) } : null;
}
