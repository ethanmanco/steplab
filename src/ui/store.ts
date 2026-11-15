import type { PlayState } from "../audio/engine";
import type { Project } from "../core/types";
import type { DrawLength } from "./melodyPanel";

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
  /** Step width in pixels. */
  zoom: number;
  /** Scroll the grids along with the playhead. */
  follow: boolean;
}

export interface AppState {
  project: Project;
  playState: PlayState;
  recordArmed: boolean;
  /** Which melody track the piano roll is showing. */
  activeMelody: number;
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
