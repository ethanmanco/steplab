/** The first kit, kept in this order for older files. */
export const CLASSIC_DRUMS = ["kick", "snare", "chat", "ohat", "clap", "tom"] as const;
/** Sounds modeled on the Roland TR-808 drum machine, all synthesized. */
export const DRUMS_808 = ["kick808", "snare808", "hat808", "ohat808", "clap808", "tom808", "rim", "cowbell"] as const;
export const DRUM_IDS = [...CLASSIC_DRUMS, ...DRUMS_808] as const;
export type DrumId = (typeof DRUM_IDS)[number];

export const SYNTH_IDS = [
  "lead",
  "bass",
  "b808",
  "pluck",
  "pad",
  "keys",
  "piano",
  "strings",
  "brass",
  "bell",
  "organ",
  "supersaw",
  "marimba",
  "flute",
  "sub",
  "reese",
  "chip",
] as const;
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

/**
 * How a synth channel is shaped, like the knobs in FL Studio's channel
 * settings. All 0..1 except octave (-2..2). Attack and release scale the
 * preset's own envelope: 0.5 keeps it, lower is shorter, higher is longer.
 */
export interface ToneShape {
  cutoff: number;
  resonance: number;
  attack: number;
  release: number;
  octave: number;
  glide: number;
}

/** A channel's mixer insert: three band EQ in dB (-12..12), compression amount and effect sends (0..1). */
export interface ChannelFx {
  low: number;
  mid: number;
  high: number;
  comp: number;
  reverb: number;
  delay: number;
}

/**
 * One sound in the channel rack: a drum or a synth, with its own mixer strip.
 * When `sample` is set, the channel plays that audio file instead of its
 * built-in sound: one shot for drums, pitched across the keyboard for synths.
 */
export type Channel = TrackMix & {
  id: string;
  name: string;
  /** -1 (left) to 1 (right). */
  pan: number;
  tone: ToneShape;
  fx: ChannelFx;
  sample: string | null;
} & ({ kind: "drum"; sound: DrumId } | { kind: "synth"; sound: SynthId });

/** An audio file a channel can play. User files live in the browser; bundled ones ship with the app. */
export interface SampleInfo {
  id: string;
  name: string;
  /** "user" files are stored in the browser and embedded in saved files; "bundled" ones load from the app. */
  source: "user" | "bundled";
  /** For bundled samples, the path inside the app. */
  url?: string;
  /** MIDI note the recording plays at, for pitched use. */
  root: number;
}

export const DELAY_TIMES = ["16n", "8n", "8n.", "4n"] as const;
export type DelayTime = (typeof DELAY_TIMES)[number];

/** The master strip and the shared reverb and delay that channels send to. */
export interface Master {
  volume: number;
  /** 0..1: small room to large hall. */
  reverbSize: number;
  delayTime: DelayTime;
  /** 0..0.9. */
  delayFeedback: number;
}

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
  version: 4;
  bpm: number;
  timeSig: TimeSignature;
  /** 0..1: how far every second sixteenth is pushed late. */
  swing: number;
  channels: Channel[];
  patterns: Pattern[];
  clips: Clip[];
  /** How many playlist tracks to show. */
  tracks: number;
  master: Master;
  samples: SampleInfo[];
}

export type PlayMode = "pattern" | "song";
