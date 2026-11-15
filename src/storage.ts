import { parseProject, serializeProject } from "./core/serialize";
import type { Project } from "./core/types";

export const STORAGE_KEY = "steplab:project";

type ReadStore = Pick<Storage, "getItem">;
type WriteStore = Pick<Storage, "setItem">;

/**
 * Browser storage can be missing or throw (private windows, blocked site
 * data, full quota). Every access is wrapped, and the app works without it.
 */
export function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAutosave(storage: ReadStore | null): Project | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return null;
    const result = parseProject(text);
    return result.ok ? result.project : null;
  } catch {
    return null;
  }
}

/** Returns false when the write failed, so the UI can say autosave is off. */
export function saveAutosave(storage: WriteStore | null, project: Project): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serializeProject(project));
    return true;
  } catch {
    return false;
  }
}

/** Collapse bursts of changes (dragging a fader) into one write. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}
