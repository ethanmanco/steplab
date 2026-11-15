import { ROLL_HIGH, ROLL_LOW } from "./notes";

/**
 * Play notes from a computer keyboard, laid out like a piano the way FL
 * Studio does it: the Z row is the lower octave (S, D, G, H, J are the black
 * keys) and the Q row the upper (2, 3, 5, 6, 7). Physical key codes are used,
 * so the layout stays the same on any keyboard language.
 */
const OFFSETS: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6,
  KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18,
  KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24,
};

export const KEYS_LOW_BASE = ROLL_LOW;
/** Highest base that still leaves a full octave of the roll for the upper row. */
export const KEYS_HIGH_BASE = ROLL_HIGH + 1 - 24;
export const KEYS_DEFAULT_BASE = 48;

export function keyOffset(code: string): number | null {
  return code in OFFSETS ? OFFSETS[code]! : null;
}

/** The note a key plays with the Z key on `base`, or null if it is off the roll. */
export function keyToPitch(code: string, base: number): number | null {
  const off = keyOffset(code);
  if (off === null) return null;
  const pitch = base + off;
  return pitch >= ROLL_LOW && pitch <= ROLL_HIGH ? pitch : null;
}

/** Move the keyboard up or down an octave, staying on the roll. */
export function shiftOctave(base: number, dir: 1 | -1): number {
  return Math.min(KEYS_HIGH_BASE, Math.max(KEYS_LOW_BASE, base + dir * 12));
}
