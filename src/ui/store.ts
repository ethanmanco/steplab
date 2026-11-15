import type { PlayState } from "../audio/engine";
import type { PlayMode, Project } from "../core/types";

/** Note lengths for clicked notes: steps, or a whole bar. */
export type DrawLength = 1 | 2 | 4 | 8 | "bar";

/** Settings that belong to the person, not the song. Kept between visits. */
export interface Prefs {
  metronome: boolean;
  countIn: boolean;
  /** Recording snap grid, in steps. */
  quantize: number;
  /** Play notes with the computer keyboard. */
  keys: boolean;
  /** MIDI note of the Z key. */
  keysBase: number;
  /** Step width in the editors, in pixels. */
  zoom: number;
  /** Bar width in the playlist, in pixels. */
  barWidth: number;
  /** Scroll along with the playhead. */
  follow: boolean;
  /** Auto sizes panels and windows to fit; Manual lets you drag their sizes. */
  layout: "auto" | "manual";
  /** Sidebar width in Manual layout, in pixels. */
  sidebarWidth: number;
  /** What clips snap to in the playlist. Alt bypasses it, like FL Studio. */
  snap: "bar" | "beat" | "step";
  /** What plays while recording: the melody alone, it with backing patterns, or the whole song. */
  recordWith: "alone" | "backing" | "song";
  /** Volume of everything except the recorded channel while recording, 0..1. */
  backingLevel: number;
  /** Which collapsible sections you opened or closed. Missing ones use the default for the screen. */
  sections: Partial<Record<SectionId, boolean>>;
}

/** Phones: one column, and everything that can fold away starts folded. */
export const COMPACT_QUERY = "(max-width: 720px)";
/** Phones and tablets: the play and record dock with the on-screen keyboard. */
export const TOUCH_QUERY = "(max-width: 720px), (pointer: coarse)";

export type SectionId = "patterns" | "channels" | "editorOptions" | "keyboard";

const matches = (query: string) => typeof window !== "undefined" && window.matchMedia(query).matches;
export const isCompact = () => matches(COMPACT_QUERY);
export const isTouch = () => matches(TOUCH_QUERY);

/**
 * Whether a collapsible section is open. On phones everything starts folded,
 * so the playlist and the play and record dock get the screen. On a computer
 * the sidebar starts open; editor options and the on-screen keyboard start
 * folded everywhere.
 */
export function sectionOpen(prefs: Prefs, id: SectionId): boolean {
  const chosen = prefs.sections[id];
  if (typeof chosen === "boolean") return chosen;
  return (id === "patterns" || id === "channels") && !isCompact();
}

export interface AppState {
  project: Project;
  playState: PlayState;
  recordArmed: boolean;
  mode: PlayMode;
  /** The pattern Pattern mode plays and new clips are drawn with. */
  current: string | null;
  /** Patterns open in the editor windows. */
  openDrums: string | null;
  openRoll: string | null;
  selectedClip: string | null;
  /** The channel open in the channel settings window. */
  openChannel: string | null;
  mixerOpen: boolean;
  /** The sound browser, for adding channels. */
  soundsOpen: boolean;
  /** Loading or error text per sample id. */
  sampleStatus: Record<string, string>;
  /** Patterns that play along while recording with backing. Null means automatic: what plays alongside in the song. */
  backing: string[] | null;
  drawLength: DrawLength;
  prefs: Prefs;
  canUndo: boolean;
  canRedo: boolean;
}

type Listener = (state: AppState, prev: AppState) => void;

/** The whole state layer: one value, replaced on change, with listeners. */
export function createStore(initial: AppState) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(update: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
      const prev = state;
      const patch = typeof update === "function" ? update(state) : update;
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state, prev));
    },
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
