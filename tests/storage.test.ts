import { describe, expect, it, vi } from "vitest";
import { defaultBeat } from "../src/core/presets";
import { PREFS_KEY, STORAGE_KEY, debounce, loadAutosave, loadPrefs, saveAutosave, savePrefs } from "../src/storage";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("autosave", () => {
  it("saves and loads a project", () => {
    const store = memoryStore();
    const p = defaultBeat();
    expect(saveAutosave(store, p)).toBe(true);
    expect(store.data.has(STORAGE_KEY)).toBe(true);
    expect(loadAutosave(store)).toEqual(p);
  });

  it("returns null when nothing is saved or the data is corrupt", () => {
    const store = memoryStore();
    expect(loadAutosave(store)).toBeNull();
    store.setItem(STORAGE_KEY, "{broken");
    expect(loadAutosave(store)).toBeNull();
  });

  it("survives storage that throws or is missing", () => {
    expect(loadAutosave(throwing)).toBeNull();
    expect(saveAutosave(throwing, defaultBeat())).toBe(false);
    expect(loadAutosave(null)).toBeNull();
    expect(saveAutosave(null, defaultBeat())).toBe(false);
  });
});

describe("settings", () => {
  const defaults = { metronome: false, zoom: 36 };

  it("keeps only known settings of the right type", () => {
    const store = memoryStore();
    store.setItem(PREFS_KEY, JSON.stringify({ metronome: true, zoom: "big", extra: 1 }));
    expect(loadPrefs(store, defaults)).toEqual({ metronome: true, zoom: 36 });
  });

  it("round trips and survives broken storage", () => {
    const store = memoryStore();
    savePrefs(store, { metronome: true, zoom: 50 });
    expect(loadPrefs(store, defaults)).toEqual({ metronome: true, zoom: 50 });
    expect(loadPrefs(throwing, defaults)).toEqual(defaults);
    expect(() => savePrefs(throwing, defaults)).not.toThrow();
  });
});

describe("debounce", () => {
  it("runs once with the last arguments after a pause, and can flush", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d(1);
    d(2);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledWith(2);
    d(3);
    d.flush(4);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(4);
    vi.useRealTimers();
  });
});
