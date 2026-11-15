import type { SynthId } from "./types";

/** The piano roll spans five octaves, C1 up to B5, so 808 bass lines fit. */
export const ROLL_LOW = 24;
export const ROLL_HIGH = 83;
export const ROLL_ROWS = ROLL_HIGH - ROLL_LOW + 1;

export interface SynthInfo {
  name: string;
  /** A comfortable pitch to scroll the roll to when this sound is chosen. */
  home: number;
}

export const SYNTHS: Record<SynthId, SynthInfo> = {
  lead: { name: "Lead", home: 67 },
  bass: { name: "Bass", home: 43 },
  b808: { name: "808", home: 36 },
  pluck: { name: "Pluck", home: 67 },
  pad: { name: "Pad", home: 60 },
};

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function parts(midi: number): { pc: number; octave: number } {
  return { pc: ((midi % 12) + 12) % 12, octave: Math.floor(midi / 12) - 1 };
}

/** Scientific pitch name, so MIDI 60 is "C4". */
export function midiToName(midi: number): string {
  const { pc, octave } = parts(midi);
  return `${NAMES[pc]}${octave}`;
}

/** The same name the way a screen reader should say it: "C sharp 4". */
export function midiToSpoken(midi: number): string {
  return midiToName(midi).replace("#", " sharp ");
}

export function isBlackKey(midi: number): boolean {
  return NAMES[parts(midi).pc]!.includes("#");
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function inRollRange(pitch: number): boolean {
  return Number.isInteger(pitch) && pitch >= ROLL_LOW && pitch <= ROLL_HIGH;
}
