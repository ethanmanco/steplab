import type { Project } from "../core/types";

export interface AppState {
  project: Project;
  playing: boolean;
  /** Which bar of the loop the grids are showing (0-based). */
  editBar: number;
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
