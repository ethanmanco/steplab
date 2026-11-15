import { LOOP_BAR_OPTIONS, type LoopBars } from "./types";

export const STEPS_PER_BAR = 16;
export const MAX_BARS = 4;
export const MAX_STEPS = STEPS_PER_BAR * MAX_BARS;
export const MIN_BPM = 60;
export const MAX_BPM = 180;
export const DEFAULT_BPM = 120;

/** Round to a whole BPM inside 60..180; anything unreadable falls back to the default. */
export function clampBpm(value: unknown): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (value === null || value === "" || !Number.isFinite(n)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));
}

export function isLoopBars(value: unknown): value is LoopBars {
  return (LOOP_BAR_OPTIONS as readonly unknown[]).includes(value);
}

/** A step is a sixteenth note: a quarter of a beat. */
export function secondsPerStep(bpm: number): number {
  return 60 / bpm / 4;
}

export function loopSteps(bars: LoopBars): number {
  return bars * STEPS_PER_BAR;
}

export function loopSeconds(bpm: number, bars: LoopBars): number {
  return secondsPerStep(bpm) * loopSteps(bars);
}

export function barOfStep(step: number): number {
  return Math.floor(step / STEPS_PER_BAR);
}

export function stepInBar(step: number): number {
  return step % STEPS_PER_BAR;
}

export function absoluteStep(bar: number, step: number): number {
  return bar * STEPS_PER_BAR + step;
}

/**
 * Which loop step a transport position lands on. The scheduler asks the
 * transport for its tick count at each callback's exact audio time, so the
 * step comes from the clock itself instead of a counter that could drift.
 */
export function stepFromTicks(ticks: number, ppq: number, bars: LoopBars): number {
  const ticksPerStep = ppq / 4;
  const total = Math.round(ticks / ticksPerStep);
  const n = loopSteps(bars);
  return ((total % n) + n) % n;
}
