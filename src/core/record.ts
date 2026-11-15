import type { Note } from "./types";

/** Quantize choices for recording, in steps: 1/16, 1/8 and 1/4 notes. */
export const QUANTIZE_OPTIONS = [
  { steps: 1, label: "1/16" },
  { steps: 2, label: "1/8" },
  { steps: 4, label: "1/4" },
] as const;

/** Snap a played position to the nearest grid line, wrapping at the loop end. */
export function quantizeStep(exactStep: number, grid: number, totalSteps: number): number {
  const snapped = Math.round(exactStep / grid) * grid;
  return ((snapped % totalSteps) + totalSteps) % totalSteps;
}

/**
 * Turn one key press into a note. `downSteps` and `upSteps` are positions in
 * steps since the transport started (not wrapped), so a note held across the
 * loop end keeps its true length. The start snaps to the quantize grid; the
 * length rounds to whole steps, at least one.
 */
export function recordedNote(opts: {
  downSteps: number;
  upSteps: number;
  pitch: number;
  velocity: number;
  grid: number;
  totalSteps: number;
}): Note {
  const step = quantizeStep(opts.downSteps, opts.grid, opts.totalSteps);
  const held = Math.max(0, opts.upSteps - opts.downSteps);
  return {
    step,
    pitch: opts.pitch,
    length: Math.min(opts.totalSteps, Math.max(1, Math.round(held))),
    velocity: Math.min(1, Math.max(0.05, opts.velocity)),
  };
}
