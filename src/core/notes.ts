import type { SynthId } from "./types";

/** Two octaves of piano roll: row 0 is the lowest C, row 23 the B two octaves up. */
export const PIANO_ROWS = 24;

export interface SynthInfo {
  name: string;
  /** MIDI note of piano-roll row 0. */
  baseMidi: number;
  /** How many steps a note rings for when nothing cuts it short. */
  gate: number;
}

export const SYNTHS: Record<SynthId, SynthInfo> = {
  lead: { name: "Lead", baseMidi: 60, gate: 1 },
  bass: { name: "Bass", baseMidi: 36, gate: 1 },
  pluck: { name: "Pluck", baseMidi: 60, gate: 2 },
  pad: { name: "Pad", baseMidi: 48, gate: 4 },
};

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function rowToMidi(synth: SynthId, row: number): number {
  return SYNTHS[synth].baseMidi + row;
}

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
