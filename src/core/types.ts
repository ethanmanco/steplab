/** The first kit, kept in this order for older files. */
export const CLASSIC_DRUMS = ["kick", "snare", "chat", "ohat", "clap", "tom"] as const;
/** Sounds modeled on the Roland TR-808 drum machine, all synthesized. */
export const DRUMS_808 = ["kick808", "snare808", "hat808", "ohat808", "clap808", "tom808", "rim", "cowbell"] as const;
export const DRUM_IDS = [...CLASSIC_DRUMS, ...DRUMS_808] as const;
export type DrumId = (typeof DRUM_IDS)[number];

export const SYNTH_IDS = ["lead", "bass", "b808", "pluck", "pad"] as const;
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

/** One sound in the channel rack: a drum or a synth, with its own mixer strip. */
export type Channel = TrackMix & { id: string; name: string } & (
    | { kind: "drum"; sound: DrumId }
    | { kind: "synth"; sound: SynthId }
  );

export interface Note {
  /** Step the note starts on (a sixteenth note grid), from the pattern start. */
  step: number;
  /** MIDI note number, so 60 is middle C. */
  pitch: number;
  /** Length in steps, at least 1. */
  length: number;
  /** 0..1, from a MIDI keyboard or a default for clicked notes. */
  velocity: number;
}

/** A drum loop: steps for every drum channel. */
export interface DrumPattern {
  id: string;
  kind: "drums";
  name: string;
  bars: number;
  /** Sorted step numbers per drum channel id. */
  rows: Record<string, number[]>;
}

/** A melody: notes played by one synth channel. */
export interface MelodyPattern {
  id: string;
  kind: "melody";
  name: string;
  bars: number;
  channelId: string;
  /** Sorted by step, then pitch. */
  notes: Note[];
}

export type Pattern = DrumPattern | MelodyPattern;

/** A pattern placed on the playlist. Positions are in steps from the song start. */
export interface Clip {
  id: string;
  patternId: string;
  track: number;
  start: number;
  /** May be longer than the pattern (it repeats) or shorter (it is cut). */
  length: number;
}

export interface Project {
  version: 3;
  bpm: number;
  timeSig: TimeSignature;
  /** 0..1: how far every second sixteenth is pushed late. */
  swing: number;
  channels: Channel[];
  patterns: Pattern[];
  clips: Clip[];
  /** How many playlist tracks to show. */
  tracks: number;
}

export type PlayMode = "pattern" | "song";
