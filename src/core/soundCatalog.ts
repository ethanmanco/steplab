import { SYNTHS } from "./notes";
import { DRUM_NAMES } from "./project";
import { CLASSIC_DRUMS, DRUMS_808, DRUMS_909, SYNTH_IDS, type DrumId, type SynthId } from "./types";

/**
 * Everything you can add as a channel, in one list for the sound browser:
 * the synthesized drums and synths, and the recorded library. Each entry
 * knows how to be tried out before it is added.
 */

/** A recorded sound from public/samples/manifest.json. */
export interface LibraryEntry {
  id: string;
  name: string;
  url: string;
  root: number;
  group: string;
  /** "oneshot" suits drum channels, "melodic" suits synth channels. */
  kind?: "oneshot" | "melodic";
}

export type SoundCategory = "all" | "drums" | "synths" | "recorded";

export interface SoundItem {
  /** Unique: "drum:kick808", "synth:pad", "lib:grand-piano". */
  id: string;
  name: string;
  /** The heading it is listed under. */
  section: string;
  category: Exclude<SoundCategory, "all">;
  /** The channel kind it becomes: drums play one shots, synths play melodies. */
  kind: "drum" | "synth";
  /** The built-in sound, or the stand-in a sample channel starts from. */
  sound: DrumId | SynthId;
  /** Where its demo phrase starts. */
  home: number;
  library?: LibraryEntry;
}

export function soundCatalog(library: LibraryEntry[]): SoundItem[] {
  const drum = (d: DrumId, section: string): SoundItem => ({
    id: `drum:${d}`,
    name: DRUM_NAMES[d],
    section,
    category: "drums",
    kind: "drum",
    sound: d,
    home: 60,
  });
  return [
    ...DRUMS_808.map((d) => drum(d, "808 kit")),
    ...DRUMS_909.map((d) => drum(d, "909 kit")),
    ...CLASSIC_DRUMS.map((d) => drum(d, "Classic kit")),
    ...SYNTH_IDS.map(
      (s): SoundItem => ({ id: `synth:${s}`, name: SYNTHS[s].name, section: "Synths", category: "synths", kind: "synth", sound: s, home: SYNTHS[s].home }),
    ),
    ...library.map((x): SoundItem => {
      const oneShot = x.kind === "oneshot";
      return {
        id: `lib:${x.id}`,
        name: x.name,
        section: `Recorded: ${x.group}`,
        category: "recorded",
        kind: oneShot ? "drum" : "synth",
        sound: oneShot ? "kick808" : "piano",
        // Demo phrases start at the recorded note, kept to a comfortable middle range.
        home: oneShot ? 60 : Math.min(72, Math.max(48, x.root)),
        library: x,
      };
    }),
  ];
}

/** Sounds in a category whose name or section has every word typed in the search box. */
export function filterSounds(items: SoundItem[], query: string, category: SoundCategory): SoundItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((x) => {
    if (category !== "all" && x.category !== category) return false;
    const text = `${x.name} ${x.section}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
