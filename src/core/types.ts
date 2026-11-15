export const DRUM_IDS = ["kick", "snare", "chat", "ohat", "clap", "tom"] as const;
export type DrumId = (typeof DRUM_IDS)[number];

export const SYNTH_IDS = ["lead", "bass", "pluck", "pad"] as const;
export type SynthId = (typeof SYNTH_IDS)[number];

/** Beats per bar over the note value that gets the beat: 4/4, 3/4, 6/8, 7/8... */
export interface TimeSignature {
  beats: number;
  unit: 4 | 8;
}

/** Volume is a linear 0..1 fader value; the engine maps it to decibels. */
export interface TrackMix {
  volume: number;
  muted: boolean;
  solo: boolean;
}

export interface DrumTrack extends TrackMix {
  id: DrumId;
  /** Sorted step numbers that have a hit. Steps past the loop end are kept but silent. */
  steps: number[];
}

export interface Note {
  /** Step the note starts on (a sixteenth note grid). */
  step: number;
  /** MIDI note number, so 60 is middle C. */
  pitch: number;
  /** Length in steps, at least 1. */
  length: number;
  /** 0..1, from a MIDI keyboard or a default for clicked notes. */
  velocity: number;
}

export interface MelodyTrack extends TrackMix {
  synth: SynthId;
  /** Sorted by step, then pitch. */
  notes: Note[];
}

export interface Project {
  version: 2;
  bpm: number;
  bars: number;
  timeSig: TimeSignature;
  /** 0..1: how far every second sixteenth is pushed late. */
  swing: number;
  drums: DrumTrack[];
  melodies: MelodyTrack[];
}
