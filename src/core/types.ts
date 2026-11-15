export const DRUM_IDS = ["kick", "snare", "chat", "ohat", "clap", "tom"] as const;
export type DrumId = (typeof DRUM_IDS)[number];

export const SYNTH_IDS = ["lead", "bass", "pluck", "pad"] as const;
export type SynthId = (typeof SYNTH_IDS)[number];

export const LOOP_BAR_OPTIONS = [1, 2, 4] as const;
export type LoopBars = (typeof LOOP_BAR_OPTIONS)[number];

/** Volume is a linear 0..1 fader value; the engine maps it to decibels. */
export interface TrackMix {
  volume: number;
  muted: boolean;
}

export interface DrumTrack extends TrackMix {
  id: DrumId;
  /** One flag per step, always MAX_STEPS long so hidden bars survive a shorter loop. */
  steps: boolean[];
}

export interface MelodyTrack extends TrackMix {
  synth: SynthId;
  /** One sorted list of piano-roll rows (0 = lowest) per step, always MAX_STEPS long. */
  notes: number[][];
}

export interface Project {
  version: 1;
  bpm: number;
  bars: LoopBars;
  drums: DrumTrack[];
  melodies: MelodyTrack[];
}
