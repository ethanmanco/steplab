import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redo, undo, HISTORY_LIMIT } from "../src/core/history";
import { KEYS_DEFAULT_BASE, keyOffset, keyToPitch, shiftOctave } from "../src/core/keymap";
import { quantizeStep, recordedNote } from "../src/core/record";

describe("quantizeStep", () => {
  it("snaps to the nearest grid line", () => {
    expect(quantizeStep(4.4, 1, 16)).toBe(4);
    expect(quantizeStep(4.6, 1, 16)).toBe(5);
    expect(quantizeStep(4.9, 2, 16)).toBe(4);
    expect(quantizeStep(5.1, 2, 16)).toBe(6);
    expect(quantizeStep(5.9, 4, 16)).toBe(4);
    expect(quantizeStep(6.1, 4, 16)).toBe(8);
  });

  it("wraps a late press at the loop end back to step 0", () => {
    expect(quantizeStep(15.7, 1, 16)).toBe(0);
    expect(quantizeStep(31.2, 1, 16)).toBe(15);
  });
});

describe("recordedNote", () => {
  const base = { pitch: 60, velocity: 0.7, grid: 1, totalSteps: 16 };

  it("measures how long the key was held", () => {
    expect(recordedNote({ ...base, downSteps: 2.1, upSteps: 5.2 })).toEqual({
      step: 2,
      pitch: 60,
      length: 3,
      velocity: 0.7,
    });
  });

  it("makes a quick tap at least one step long", () => {
    expect(recordedNote({ ...base, downSteps: 3, upSteps: 3.1 }).length).toBe(1);
  });

  it("keeps the real length of a note held across the loop end", () => {
    const note = recordedNote({ ...base, downSteps: 14, upSteps: 19 });
    expect(note).toMatchObject({ step: 14, length: 5 });
  });

  it("places notes from later passes of the loop", () => {
    expect(recordedNote({ ...base, downSteps: 35.2, upSteps: 36 }).step).toBe(3);
  });

  it("never makes a note longer than the loop and clamps velocity", () => {
    const note = recordedNote({ ...base, velocity: 0, downSteps: 0, upSteps: 100 });
    expect(note.length).toBe(16);
    expect(note.velocity).toBe(0.05);
  });
});

describe("computer keyboard piano", () => {
  it("lays the Z row and Q row out like piano keys", () => {
    expect(keyOffset("KeyZ")).toBe(0);
    expect(keyOffset("KeyS")).toBe(1);
    expect(keyOffset("KeyM")).toBe(11);
    expect(keyOffset("KeyQ")).toBe(12);
    expect(keyOffset("Digit2")).toBe(13);
    expect(keyOffset("KeyI")).toBe(24);
  });

  it("leaves the transport keys alone", () => {
    for (const code of ["KeyP", "Space", "Escape", "KeyA", "KeyF", "KeyO", "Digit1"]) {
      expect(keyOffset(code)).toBeNull();
    }
  });

  it("maps keys to pitches from the current octave", () => {
    expect(keyToPitch("KeyZ", KEYS_DEFAULT_BASE)).toBe(48);
    expect(keyToPitch("KeyQ", KEYS_DEFAULT_BASE)).toBe(60);
    expect(keyToPitch("KeyI", 60)).toBeNull(); // C6 is off the roll
  });

  it("shifts octaves without leaving the roll", () => {
    expect(shiftOctave(48, 1)).toBe(60);
    expect(shiftOctave(60, 1)).toBe(60);
    expect(shiftOctave(48, -1)).toBe(36);
    expect(shiftOctave(36, -1)).toBe(24);
    expect(shiftOctave(24, -1)).toBe(24);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b", null, 0);
    h = pushHistory(h, "c", null, 10);
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe("b");
  });

  it("drops the redo list after a new change", () => {
    let h = pushHistory(createHistory("a"), "b", null, 0);
    h = pushHistory(undo(h), "x", null, 5);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it("merges a burst of changes with the same key", () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, "fader", 0);
    h = pushHistory(h, 2, "fader", 300);
    h = pushHistory(h, 3, "fader", 600);
    expect(h.past).toEqual([0]);
    h = pushHistory(h, 4, "fader", 5000);
    expect(h.past).toEqual([0, 3]);
    h = pushHistory(h, 5, "other", 5100);
    expect(h.past).toEqual([0, 3, 4]);
  });

  it("can merge a whole recording take regardless of time", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b", "take-1", 0, Infinity);
    h = pushHistory(h, "c", "take-1", 60_000, Infinity);
    expect(h.past).toEqual(["a"]);
    expect(undo(h).present).toBe("a");
  });

  it("ignores no-op changes and caps its length", () => {
    const h = createHistory("a");
    expect(pushHistory(h, "a")).toBe(h);
    let big = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) big = pushHistory(big, i, null, i * 2000);
    expect(big.past).toHaveLength(HISTORY_LIMIT);
  });
});
