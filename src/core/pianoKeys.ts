import { ROLL_HIGH, ROLL_LOW, isBlackKey } from "./notes";

/**
 * The on-screen keyboard for phones and tablets. Like the computer keyboard
 * layout, it starts at the same base note, so the octave buttons move both.
 */

export interface PianoKey {
  pitch: number;
  black: boolean;
  /** The white key this key is, or the white key a black key sits after. Counted from 0. */
  white: number;
}

export interface KeyboardRow {
  /** Lowest note in the row. */
  low: number;
  keys: PianoKey[];
  /** White keys in the row, for sizing. */
  whites: number;
}

/** Narrower than this, the keyboard stacks two one-octave rows so keys stay big enough for a finger. */
export const TWO_ROW_BELOW = 560;
/** The narrowest a white key gets in a single row, in pixels. */
export const MIN_WHITE_KEY = 40;

/**
 * Keys from `low` across `whiteCount` white keys, with the black keys in
 * between. Notes off the piano roll are left out, since they could not be
 * recorded, and so is a black key hanging off the right edge.
 */
export function pianoKeys(low: number, whiteCount: number): PianoKey[] {
  const keys: PianoKey[] = [];
  let white = -1;
  for (let pitch = low; pitch <= ROLL_HIGH; pitch++) {
    const black = isBlackKey(pitch);
    if (!black && ++white >= whiteCount) break;
    if (pitch < ROLL_LOW || white < 0) continue;
    keys.push({ pitch, black, white });
  }
  while (keys.length && keys[keys.length - 1]!.black) keys.pop();
  return keys;
}

/**
 * Rows for a keyboard `width` pixels wide, top row first. Phones in portrait
 * get two rows, an octave each, matching the Z and Q rows of the computer
 * keyboard. Wider screens get one long row starting at the same note.
 */
export function keyboardLayout(base: number, width: number): KeyboardRow[] {
  const row = (low: number, count: number): KeyboardRow => {
    const keys = pianoKeys(low, count);
    return { low, keys, whites: keys.filter((k) => !k.black).length };
  };
  if (width < TWO_ROW_BELOW) return [row(base + 12, 7), row(base, 7)].filter((r) => r.keys.length);
  const count = Math.max(8, Math.floor(width / MIN_WHITE_KEY));
  return [row(base, count)];
}
