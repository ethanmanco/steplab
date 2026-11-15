import {
  DEFAULT_FX,
  DEFAULT_MASTER,
  DEFAULT_TONE,
  DEFAULT_TRACKS,
  DEFAULT_VELOCITY,
  drumChannel,
  makeId,
  sortNotes,
  synthChannel,
} from "./project";
import { stepsPerBar } from "./timing";
import type { Channel, ChannelFx, Clip, DrumId, Note, Pattern, Project, SampleInfo, SynthId, ToneShape } from "./types";

/**
 * Example songs to load from the Examples window. Each is built fresh every
 * time (new ids), so loading one never clashes with what is already open.
 * They are short, written to show off different parts of the app, and every
 * sound in them ships with Steplab.
 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  build: () => Project;
}

type NoteSpec = [step: number, pitch: number, length: number, velocity?: number];

interface ChannelTweaks {
  volume?: number;
  pan?: number;
  tone?: Partial<ToneShape>;
  fx?: Partial<ChannelFx>;
  sample?: SampleInfo;
}

/** A small builder so each preset reads like a score. */
function song(bpm: number, swing = 0) {
  const p: Project = {
    version: 4,
    bpm,
    timeSig: { beats: 4, unit: 4 },
    swing,
    channels: [],
    patterns: [],
    clips: [],
    tracks: DEFAULT_TRACKS,
    master: { ...DEFAULT_MASTER },
    samples: [],
  };
  const bar = stepsPerBar(p.timeSig);

  function tweak(ch: Channel, t: ChannelTweaks): Channel {
    if (t.sample && !p.samples.some((s) => s.id === t.sample!.id)) p.samples.push(t.sample);
    return {
      ...ch,
      volume: t.volume ?? ch.volume,
      pan: t.pan ?? 0,
      tone: { ...DEFAULT_TONE, ...t.tone },
      fx: { ...DEFAULT_FX, ...t.fx },
      sample: t.sample?.id ?? null,
    };
  }

  return {
    project: p,
    drum(sound: DrumId, name?: string, t: ChannelTweaks = {}): string {
      const ch = tweak(drumChannel(sound, name), t);
      p.channels.push(ch);
      return ch.id;
    },
    synth(sound: SynthId, name?: string, t: ChannelTweaks = {}): string {
      const ch = tweak(synthChannel(sound, name), t);
      p.channels.push(ch);
      return ch.id;
    },
    /** A drum loop: steps per channel. One-bar rows repeat across `bars`; longer rows are used as written. */
    drums(name: string, bars: number, rows: Record<string, number[]>): string {
      const full: Record<string, number[]> = {};
      for (const [ch, steps] of Object.entries(rows)) {
        // Rows written as a single bar repeat across the pattern; longer rows are used as written.
        const oneBar = steps.every((x) => x < bar);
        const out = oneBar ? Array.from({ length: bars }, (_, k) => steps.map((x) => x + k * bar)).flat() : steps;
        full[ch] = [...new Set(out)].filter((x) => x < bars * bar).sort((x, y) => x - y);
      }
      const pat: Pattern = { id: makeId("p"), kind: "drums", name, bars, rows: full };
      p.patterns.push(pat);
      return pat.id;
    },
    melody(name: string, channelId: string, bars: number, notes: NoteSpec[]): string {
      const list: Note[] = notes.map(([step, pitch, length, velocity]) => ({ step, pitch, length, velocity: velocity ?? DEFAULT_VELOCITY }));
      const pat: Pattern = { id: makeId("p"), kind: "melody", name, bars, channelId, notes: sortNotes(list) };
      p.patterns.push(pat);
      return pat.id;
    },
    /** Place a pattern on a track from one bar to another (1-based, inclusive). */
    place(patternId: string, track: number, fromBar: number, toBar: number) {
      const clip: Clip = { id: makeId("k"), patternId, track, start: (fromBar - 1) * bar, length: (toBar - fromBar + 1) * bar };
      p.clips.push(clip);
    },
  };
}

/** A chord as a stack of notes that all start and end together. */
const chord = (step: number, pitches: number[], length: number, velocity?: number): NoteSpec[] =>
  pitches.map((pitch) => [step, pitch, length, velocity]);

/** A note per bar for each root, held for `length` steps. */
const roots = (pitches: number[], pattern: [offset: number, length: number][]): NoteSpec[] =>
  pitches.flatMap((pitch, b) => pattern.map(([o, l]): NoteSpec => [b * 16 + o, pitch, l]));

const lib = (id: string, name: string, url: string, root: number): SampleInfo => ({
  id: `lib-${id}`,
  name,
  source: "bundled",
  url,
  root,
});

/* ---------- Default beat ---------- */

/**
 * The song Steplab opens with: dark trap in C minor at 140 BPM. A piano hook
 * and a pad play for two bars, then the half-time drums and a sliding 808
 * drop in on bar 3. Built from the standard 808 kit, so every row in the
 * channel rack has something to do.
 */
export function defaultBeat(): Project {
  const s = song(140);
  const kick = s.drum("kick808");
  const snare = s.drum("snare808", "Snare", { volume: 0.6 });
  const hat = s.drum("hat808", "Hats", { volume: 0.6 });
  const ohat = s.drum("ohat808", "Open hat", { volume: 0.5 });
  const clap = s.drum("clap808", "Clap", { fx: { reverb: 0.2 } });
  const rim = s.drum("rim", "Rim", { volume: 0.45, pan: 0.3 });
  const piano = s.synth("piano", "Piano", {
    volume: 0.75,
    sample: lib("grand-piano", "Grand piano", "samples/keys/grand-piano.wav", 72),
    fx: { reverb: 0.35, delay: 0.15 },
  });
  const pad = s.synth("pad", "Pad", { volume: 0.5, tone: { cutoff: 0.6 }, fx: { reverb: 0.5 } });
  const bass = s.synth("b808", "808", { volume: 0.85, tone: { glide: 0.3 } });

  // Two bars of harmony: C minor, then A flat into G. The B natural in G is
  // what makes it sound dark rather than sad.
  const beat = s.drums("Beat", 2, {
    [kick]: [0, 7, 10, 16, 22, 26, 29],
    [snare]: [8, 24],
    [clap]: [8, 24],
    // Eighth notes with 16th note rolls into each clap and the turnaround.
    [hat]: [0, 2, 4, 6, 8, 10, 11, 12, 14, 15, 16, 18, 20, 24, 26, 27, 28, 29, 30, 31],
    [ohat]: [22],
    [rim]: [3, 19],
  });
  const low = s.melody("808", bass, 2, [
    [0, 36, 7], [7, 36, 3], [10, 36, 6],
    [16, 32, 6], [22, 32, 4], [26, 31, 3], [29, 43, 3],
  ]);
  const hook = s.melody("Hook", piano, 4, [
    [0, 72, 2], [2, 75, 2], [4, 79, 3], [7, 75, 1], [8, 74, 2], [10, 75, 2], [12, 72, 4],
    [16, 72, 2], [18, 75, 2], [20, 80, 3], [23, 79, 1], [24, 74, 2], [26, 71, 2], [28, 74, 4],
    [32, 72, 2], [34, 75, 2], [36, 79, 3], [39, 80, 1], [40, 79, 2], [42, 75, 2], [44, 77, 2], [46, 75, 2],
    [48, 72, 2], [50, 75, 2], [52, 80, 3], [55, 79, 1], [56, 79, 2], [58, 74, 2], [60, 71, 4],
  ]);
  const chords = s.melody("Pad", pad, 2, [
    ...chord(0, [60, 63, 67], 16, 0.55),
    ...chord(16, [56, 60, 63], 8, 0.55),
    ...chord(24, [55, 59, 62], 8, 0.55),
  ]);

  s.place(beat, 0, 3, 8);
  s.place(low, 1, 3, 8);
  s.place(hook, 2, 1, 8);
  s.place(chords, 3, 1, 8);
  return s.project;
}

/* ---------- K-pop chorus ---------- */

function kpop(): Project {
  const s = song(126);
  const kick = s.drum("kick808");
  const snare = s.drum("snare808");
  const clap = s.drum("clap808");
  const hat = s.drum("hat808");
  const ohat = s.drum("ohat808");
  const chords = s.synth("pluck", "Chords", { volume: 0.9, fx: { reverb: 0.35 } });
  const strings = s.synth("strings", "Strings", { volume: 0.95, fx: { reverb: 0.5 } });
  const bass = s.synth("b808", "808", { volume: 0.75, tone: { glide: 0.15 } });
  const lead = s.synth("supersaw", "Lead", { volume: 0.7, fx: { reverb: 0.35, delay: 0.25 } });

  // A minor: Am, F, C, G, the four chords behind half of all pop choruses.
  const prog = [
    [57, 60, 64],
    [53, 57, 60],
    [55, 60, 64],
    [55, 59, 62],
  ];
  const stabs = s.melody("Chord stabs", chords, 4, prog.flatMap((c, b) => [0, 3, 6, 10].flatMap((o) => chord(b * 16 + o, c, 2, 0.75))));
  const pads = s.melody("Strings", strings, 4, prog.flatMap((c, b) => chord(b * 16, c, 16, 0.6)));
  const low = s.melody("808 line", bass, 4, roots([33, 29, 36, 31], [[0, 6], [7, 3], [10, 6]]));
  const hook = s.melody("Hook", lead, 4, [
    [0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 69, 4], [10, 72, 2], [12, 74, 4],
    [16, 72, 2], [18, 69, 2], [20, 72, 2], [22, 74, 4], [26, 76, 6],
    [32, 79, 2], [34, 76, 2], [36, 74, 2], [38, 72, 4], [42, 74, 2], [44, 76, 4],
    [48, 74, 4], [52, 71, 2], [54, 74, 2], [56, 76, 8],
  ]);
  const verse = s.drums("Verse beat", 1, { [kick]: [0, 7, 10], [snare]: [4, 12], [hat]: [0, 2, 4, 6, 8, 10, 12, 14] });
  const chorus = s.drums("Chorus beat", 1, {
    [kick]: [0, 4, 8, 12],
    [clap]: [4, 12],
    [snare]: [4, 12],
    [hat]: [0, 2, 4, 6, 8, 10, 12, 14],
    [ohat]: [2, 6, 10, 14],
  });

  s.place(pads, 0, 1, 4);
  s.place(stabs, 1, 1, 12);
  s.place(verse, 2, 5, 8);
  s.place(chorus, 2, 9, 12);
  s.place(low, 3, 5, 12);
  s.place(pads, 4, 9, 12);
  s.place(hook, 5, 9, 12);
  return s.project;
}

/* ---------- Lo-fi ---------- */

function lofi(): Project {
  const s = song(82, 0.55);
  const kick = s.drum("kick", "Kick", { sample: lib("ac-kick", "Kick, acoustic", "samples/drums/ac-kick.wav", 60), tone: { cutoff: 0.75 } });
  const snare = s.drum("snare", "Snare", { sample: lib("ac-snare", "Snare, acoustic", "samples/drums/ac-snare.wav", 60), tone: { cutoff: 0.7 }, fx: { reverb: 0.25 } });
  const hat = s.drum("chat", "Hat", { volume: 0.55, sample: lib("ac-hat", "Hi-hat, closed", "samples/drums/ac-hat.wav", 60), tone: { cutoff: 0.8 } });
  const shaker = s.drum("chat", "Shaker", { volume: 0.5, pan: 0.3, sample: lib("shaker", "Shaker", "samples/percussion/shaker.wav", 60) });
  const piano = s.synth("piano", "Piano", {
    volume: 0.75,
    sample: lib("grand-piano", "Grand piano", "samples/keys/grand-piano.wav", 72),
    tone: { cutoff: 0.72 },
    fx: { reverb: 0.4, comp: 0.3 },
  });
  const keys = s.synth("keys", "Rhodes", { volume: 0.55, pan: -0.25, fx: { reverb: 0.3, delay: 0.2 } });
  const sub = s.synth("sub", "Sub", { volume: 0.7 });

  // Dm9, G13, Cmaj9, Am9: the jazzy ii-V-I loop lo-fi lives on.
  const prog = [
    [50, 57, 60, 64],
    [55, 59, 64, 65],
    [48, 55, 59, 62],
    [45, 52, 55, 60],
  ];
  const chords = s.melody("Piano chords", piano, 4, prog.flatMap((c, b) => [...chord(b * 16, c, 7, 0.7), ...chord(b * 16 + 10, c, 4, 0.55)]));
  const tune = s.melody("Rhodes melody", keys, 4, [
    [2, 69, 2], [4, 72, 4], [10, 74, 2], [12, 72, 3],
    [18, 71, 2], [20, 74, 4], [26, 76, 4],
    [34, 76, 2], [36, 74, 2], [38, 71, 4], [44, 67, 3],
    [50, 69, 2], [52, 72, 6], [60, 67, 2],
  ]);
  const bass = s.melody("Sub bass", sub, 4, roots([38, 43, 36, 33], [[0, 8], [10, 4]]));
  const beat = s.drums("Lazy beat", 1, {
    [kick]: [0, 7, 10],
    [snare]: [4, 12],
    [hat]: [0, 2, 4, 6, 8, 10, 12, 14],
    [shaker]: [3, 7, 11, 15],
  });

  s.place(chords, 0, 1, 8);
  s.place(beat, 1, 3, 8);
  s.place(bass, 2, 3, 8);
  s.place(tune, 3, 5, 8);
  return s.project;
}

/* ---------- Trap ---------- */

function trap(): Project {
  const s = song(140);
  const kick = s.drum("kick808");
  const clap = s.drum("clap808", "Clap", { fx: { reverb: 0.2 } });
  const hat = s.drum("hat808", "Hats", { volume: 0.65 });
  const ohat = s.drum("ohat808", "Open hat", { volume: 0.55 });
  const bell = s.synth("bell", "Bell", { volume: 1, fx: { reverb: 0.45, delay: 0.3 } });
  const bass = s.synth("b808", "808", { volume: 0.8, tone: { glide: 0.35 } });
  const pad = s.synth("pad", "Dark pad", { volume: 0.85, tone: { cutoff: 0.7 }, fx: { reverb: 0.5 } });

  // F minor, half-time drums: the clap lands on beat 3.
  const beat = s.drums("Half-time beat", 2, {
    [kick]: [0, 10, 16, 23, 26],
    [clap]: [8, 24],
    [hat]: [0, 2, 4, 6, 8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 27, 28, 29, 30, 31],
    [ohat]: [14],
  });
  const melody = s.melody("Bell melody", bell, 2, [
    [0, 77, 2], [3, 72, 2], [6, 68, 2], [8, 70, 2], [10, 72, 4], [14, 68, 2],
    [16, 77, 2], [19, 75, 2], [22, 72, 2], [24, 70, 4], [28, 68, 4],
  ]);
  const low = s.melody("808 slides", bass, 2, [
    [0, 29, 10], [10, 29, 4], [14, 32, 2], [16, 27, 10], [26, 29, 3], [29, 32, 3],
  ]);
  const atmos = s.melody("Pad", pad, 2, [...chord(0, [53, 56, 60], 16, 0.5), ...chord(16, [51, 56, 60], 16, 0.5)]);

  s.place(melody, 0, 1, 8);
  s.place(atmos, 1, 1, 8);
  s.place(beat, 2, 3, 8);
  s.place(low, 3, 3, 8);
  return s.project;
}

/* ---------- House ---------- */

function house(): Project {
  const s = song(124);
  const kick = s.drum("kick808", "Kick", { tone: { cutoff: 0.85 } });
  const clap = s.drum("clap808", "Clap", { fx: { reverb: 0.3 } });
  const ohat = s.drum("ohat808", "Open hat", { volume: 0.6 });
  const shaker = s.drum("chat", "Shaker", { volume: 0.5, pan: -0.2, sample: lib("shaker", "Shaker", "samples/percussion/shaker.wav", 60) });
  const organ = s.synth("organ", "Organ stabs", { volume: 0.6, fx: { reverb: 0.3, comp: 0.4 } });
  const bass = s.synth("bass", "Bass", { volume: 0.75, tone: { cutoff: 0.6, resonance: 0.3 } });
  const lead = s.synth("marimba", "Marimba", { volume: 0.6, pan: 0.25, fx: { delay: 0.35, reverb: 0.25 } });

  // C minor: Cm7, Abmaj7, Bb, Gm.
  const prog = [
    [60, 63, 67, 70],
    [56, 60, 63, 67],
    [58, 62, 65],
    [55, 58, 62],
  ];
  const beat = s.drums("Four on the floor", 1, {
    [kick]: [0, 4, 8, 12],
    [clap]: [4, 12],
    [ohat]: [2, 6, 10, 14],
    [shaker]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  });
  const stabs = s.melody("Organ stabs", organ, 4, prog.flatMap((c, b) => [3, 6, 11].flatMap((o) => chord(b * 16 + o, c, 2, 0.75))));
  const line = s.melody("Offbeat bass", bass, 4, roots([36, 32, 34, 31], [[2, 2], [6, 2], [10, 2], [14, 2]]));
  const riff = s.melody("Marimba riff", lead, 2, [
    [0, 72, 1], [3, 75, 1], [6, 79, 2], [10, 77, 1], [12, 75, 2],
    [16, 72, 1], [19, 74, 1], [22, 75, 2], [26, 70, 1], [28, 67, 2],
  ]);

  s.place(beat, 0, 1, 12);
  s.place(line, 1, 5, 12);
  s.place(stabs, 2, 5, 12);
  s.place(riff, 3, 9, 12);
  return s.project;
}

export const PRESETS: Preset[] = [
  {
    id: "default",
    name: "Default beat",
    description: "The beat Steplab opens with. 140 BPM dark trap in C minor: a piano hook, then half-time 808 drums and a sliding 808 from bar 3.",
    build: defaultBeat,
  },
  {
    id: "kpop",
    name: "K-pop chorus",
    description: "126 BPM. Strings intro, a verse with chord stabs and 808, then a supersaw chorus over four on the floor.",
    build: kpop,
  },
  {
    id: "lofi",
    name: "Lo-fi study",
    description: "82 BPM with heavy swing. Recorded grand piano and acoustic drums, a Rhodes melody and a sub bass.",
    build: lofi,
  },
  {
    id: "trap",
    name: "Trap",
    description: "140 BPM half-time. Rolling hats, a gliding 808 and a bell melody in F minor.",
    build: trap,
  },
  {
    id: "house",
    name: "House",
    description: "124 BPM four on the floor. Organ stabs, an offbeat bass, a shaker and a marimba riff.",
    build: house,
  },
];
