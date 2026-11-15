import { describe, expect, it } from "vitest";
import { ROLL_HIGH } from "../src/core/notes";
import { KEYS_HIGH_BASE, KEYS_LOW_BASE } from "../src/core/keymap";
import { keyboardLayout, pianoKeys } from "../src/core/pianoKeys";

describe("pianoKeys", () => {
  it("lays out one octave from C with the black keys between", () => {
    const keys = pianoKeys(60, 7);
    expect(keys.map((k) => k.pitch)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);
    expect(keys.filter((k) => !k.black).map((k) => k.white)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // C sharp sits after the first white key, A sharp after the sixth.
    expect(keys.find((k) => k.pitch === 61)).toEqual({ pitch: 61, black: true, white: 0 });
    expect(keys.find((k) => k.pitch === 70)).toEqual({ pitch: 70, black: true, white: 5 });
  });

  it("never ends on a black key hanging off the edge", () => {
    // Eight white keys from C end on the next C; its C sharp is dropped.
    const keys = pianoKeys(48, 8);
    expect(keys.at(-1)).toEqual({ pitch: 60, black: false, white: 7 });
  });

  it("stops at the top of the piano roll", () => {
    const keys = pianoKeys(72, 20);
    expect(keys.at(-1)!.pitch).toBe(ROLL_HIGH);
    expect(keys.every((k) => k.pitch <= ROLL_HIGH)).toBe(true);
  });
});

describe("keyboardLayout", () => {
  it("stacks two octaves on a phone, the upper one on top, like the Q and Z rows", () => {
    const rows = keyboardLayout(48, 360);
    expect(rows.map((r) => r.low)).toEqual([60, 48]);
    expect(rows.map((r) => r.whites)).toEqual([7, 7]);
  });

  it("keeps both rows on the roll at every octave the buttons reach", () => {
    for (const base of [KEYS_LOW_BASE, 36, 48, KEYS_HIGH_BASE]) {
      const rows = keyboardLayout(base, 360);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.whites === 7)).toBe(true);
    }
  });

  it("uses one long row on wider screens, as many keys as fit", () => {
    const rows = keyboardLayout(48, 800);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.low).toBe(48);
    expect(rows[0]!.whites).toBe(20);
  });
});
