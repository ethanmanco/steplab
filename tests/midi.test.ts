import { describe, expect, it } from "vitest";
import { parseMidi } from "../src/core/midi";

describe("parseMidi", () => {
  it("reads note on with velocity on any channel", () => {
    expect(parseMidi([0x90, 60, 127])).toEqual({ type: "on", pitch: 60, velocity: 1 });
    expect(parseMidi([0x93, 64, 0x40])).toEqual({ type: "on", pitch: 64, velocity: 64 / 127 });
  });

  it("reads note off, including note on with zero velocity", () => {
    expect(parseMidi([0x80, 60, 30])).toEqual({ type: "off", pitch: 60 });
    expect(parseMidi([0x9f, 60, 0])).toEqual({ type: "off", pitch: 60 });
  });

  it("ignores other messages and short data", () => {
    expect(parseMidi([0xb0, 64, 127])).toBeNull(); // sustain pedal
    expect(parseMidi([0xe0, 0, 64])).toBeNull(); // pitch bend
    expect(parseMidi([0xf8])).toBeNull(); // clock
    expect(parseMidi([0x90, 60])).toBeNull();
  });
});
