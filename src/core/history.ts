/**
 * Undo and redo over immutable values. Changes that arrive in a burst with
 * the same key (dragging one fader, painting one row) merge into a single
 * undo step.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  lastKey: string | null;
  lastTime: number;
}

export const HISTORY_LIMIT = 100;
export const MERGE_WINDOW_MS = 1000;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastTime: 0 };
}

/**
 * Record a change. `windowMs` is how long a key keeps merging; a recording
 * take passes Infinity so the whole take undoes in one step.
 */
export function pushHistory<T>(
  h: History<T>,
  next: T,
  key: string | null = null,
  now = Date.now(),
  windowMs = MERGE_WINDOW_MS,
): History<T> {
  if (next === h.present) return h;
  if (key !== null && key === h.lastKey && now - h.lastTime < windowMs) {
    return { ...h, present: next, future: [], lastTime: now };
  }
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastKey: key,
    lastTime: now,
  };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastKey: null, lastTime: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastKey: null, lastTime: 0 };
}

/** Replace the present without making an undo step (loading a file starts fresh). */
export function resetHistory<T>(present: T): History<T> {
  return createHistory(present);
}
