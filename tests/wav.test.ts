import { describe, expect, it } from "vitest";
import { loopSeconds } from "../src/core/timing";
import { encodeWav, loopSlice } from "../src/core/wav";

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

describe("encodeWav", () => {
  const left = new Float32Array([0, 0.5, -0.5, 1]);
  const right = new Float32Array([0, -1, 2, -2]);
  const buf = encodeWav([left, right], 44100);
  const view = new DataView(buf);

  it("writes a standard 44 byte RIFF/WAVE header", () => {
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it("sizes the file from the sample count", () => {
    expect(buf.byteLength).toBe(44 + 4 * 2 * 2);
    expect(view.getUint32(40, true)).toBe(16);
    expect(view.getUint32(4, true)).toBe(36 + 16);
  });

  it("interleaves channels and converts to 16-bit", () => {
    const s = (i: number) => view.getInt16(44 + i * 2, true);
    expect([s(0), s(1)]).toEqual([0, 0]);
    expect([s(2), s(3)]).toEqual([16384, -32768]);
    expect([s(4), s(5)]).toEqual([-16384, 32767]); // 2 is clamped to 1
    expect([s(6), s(7)]).toEqual([32767, -32768]); // -2 is clamped to -1
  });

  it("handles mono and refuses no channels", () => {
    const mono = new DataView(encodeWav([new Float32Array(10)], 22050));
    expect(mono.getUint16(22, true)).toBe(1);
    expect(mono.byteLength).toBe(44 + 20);
    expect(() => encodeWav([], 44100)).toThrow();
  });
});

describe("loopSlice", () => {
  it("keeps the second pass of a double-length render", () => {
    expect(loopSlice(2, 44100)).toEqual({ start: 88200, end: 176400 });
  });

  it("gives exactly one loop of frames for any tempo", () => {
    for (const bpm of [60, 97, 120, 180]) {
      const secs = loopSeconds(bpm, 2, { beats: 7, unit: 8 });
      const { start, end } = loopSlice(secs, 48000);
      expect(end - start).toBe(Math.round(secs * 48000));
    }
  });
});
