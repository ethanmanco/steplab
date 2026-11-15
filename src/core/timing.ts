import type { TimeSignature } from "./types";

export const MIN_BPM = 60;
export const MAX_BPM = 180;
export const DEFAULT_BPM = 120;
export const MIN_BARS = 1;
export const MAX_BARS = 16;
export const MIN_BEATS = 1;
export const MAX_BEATS = 12;
/** Every step is a sixteenth note, so a quarter note beat is 4 steps and an eighth is 2. */
export const STEPS_PER_QUARTER = 4;
export const DEFAULT_TIME_SIG: TimeSignature = { beats: 4, unit: 4 };

function toNumber(value: unknown): number {
  if (value === null || value === "" || typeof value === "boolean") return Number.NaN;
  return typeof value === "string" ? Number.parseFloat(value) : Number(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Round to a whole BPM inside 60..180; anything unreadable falls back to the default. */
export function clampBpm(value: unknown): number {
  return clampInt(value, MIN_BPM, MAX_BPM, DEFAULT_BPM);
}

/** Loops are capped at 256 sixteenths (16 bars of 4/4) to keep the grids quick. */
export const MAX_STEPS = 256;

/** How many bars fit under the step cap for a time signature. */
export function maxBarsFor(sig: TimeSignature): number {
  return Math.max(MIN_BARS, Math.min(MAX_BARS, Math.floor(MAX_STEPS / stepsPerBar(sig))));
}

export function clampBars(value: unknown, sig: TimeSignature = DEFAULT_TIME_SIG): number {
  return clampInt(value, MIN_BARS, maxBarsFor(sig), 1);
}

export function clampTimeSig(value: unknown): TimeSignature {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    beats: clampInt(raw.beats, MIN_BEATS, MAX_BEATS, 4),
    unit: toNumber(raw.unit) === 8 ? 8 : 4,
  };
}

/** Swing is stored 0..1; anything else is clamped. */
export function clampSwing(value: unknown): number {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function stepsPerBeat(sig: TimeSignature): number {
  return sig.unit === 4 ? STEPS_PER_QUARTER : STEPS_PER_QUARTER / 2;
}

export function stepsPerBar(sig: TimeSignature): number {
  return sig.beats * stepsPerBeat(sig);
}

/**
 * How many steps make one felt pulse, used for shading the grid and for the
 * metronome. Quarter-note meters pulse on the beat. Compound eighth meters
 * (6/8, 9/8, 12/8) pulse every three eighths; other eighth meters on each eighth.
 */
export function pulseSteps(sig: TimeSignature): number {
  if (sig.unit === 4) return STEPS_PER_QUARTER;
  return sig.beats % 3 === 0 && sig.beats > 3 ? 6 : 2;
}

export function loopSteps(bars: number, sig: TimeSignature): number {
  return bars * stepsPerBar(sig);
}

/** A step is a sixteenth note: a quarter of a quarter-note beat. */
export function secondsPerStep(bpm: number): number {
  return 60 / bpm / 4;
}

export function loopSeconds(bpm: number, bars: number, sig: TimeSignature): number {
  return secondsPerStep(bpm) * loopSteps(bars, sig);
}

/** Where a step sits: 0-based bar, 0-based step inside that bar. */
export function stepPosition(step: number, sig: TimeSignature): { bar: number; inBar: number } {
  const per = stepsPerBar(sig);
  return { bar: Math.floor(step / per), inBar: step % per };
}

/**
 * Which loop step a transport position lands on. The scheduler asks the
 * transport for its tick count at each callback's exact audio time, so the
 * step comes from the clock itself instead of a counter that could drift.
 */
export function stepFromTicks(ticks: number, ppq: number, totalSteps: number): number {
  const total = Math.round(ticks / (ppq / 4));
  return ((total % totalSteps) + totalSteps) % totalSteps;
}

/** Same as stepFromTicks but keeps the fraction, for placing recorded notes. */
export function exactStepFromTicks(ticks: number, ppq: number, totalSteps: number): number {
  const total = ticks / (ppq / 4);
  return ((total % totalSteps) + totalSteps) % totalSteps;
}

/**
 * Swing delays every second sixteenth. At full swing the off step lands a
 * third of a step late, which is a triplet shuffle feel.
 */
export function swingDelay(step: number, swing: number, bpm: number): number {
  if (step % 2 === 0 || swing <= 0) return 0;
  return (Math.min(1, swing) * secondsPerStep(bpm)) / 3;
}
