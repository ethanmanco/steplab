import { describe, expect, it, vi } from "vitest";
import { demoProject } from "../src/core/project";
import { STORAGE_KEY, debounce, loadAutosave, saveAutosave } from "../src/storage";

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
    expect(saveAutosave(store, demoProject())).toBe(true);
    expect(store.data.has(STORAGE_KEY)).toBe(true);
    expect(loadAutosave(store)).toEqual(demoProject());
  });

  it("returns null when nothing is saved", () => {
    expect(loadAutosave(memoryStore())).toBeNull();
  });

  it("survives storage that throws or is missing", () => {
    expect(loadAutosave(throwing)).toBeNull();
    expect(saveAutosave(throwing, demoProject())).toBe(false);
    expect(loadAutosave(null)).toBeNull();
    expect(saveAutosave(null, demoProject())).toBe(false);
  });

  it("ignores corrupt saved data", () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, "{broken");
    expect(loadAutosave(store)).toBeNull();
  });
});

describe("debounce", () => {
  it("runs once with the last arguments after a pause", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });

  it("can flush right away", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d(1);
    d.flush(2);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
    vi.useRealTimers();
  });
});
