export type MidiEvent =
  | { type: "on"; pitch: number; velocity: number }
  | { type: "off"; pitch: number };

/**
 * Read one MIDI message. Only note on and note off matter here; a note on
 * with velocity 0 is a note off, as many keyboards send it that way.
 */
export function parseMidi(data: ArrayLike<number>): MidiEvent | null {
  if (data.length < 3) return null;
  const kind = data[0]! & 0xf0;
  const pitch = data[1]! & 0x7f;
  const velocity = data[2]! & 0x7f;
  if (kind === 0x90 && velocity > 0) return { type: "on", pitch, velocity: velocity / 127 };
  if (kind === 0x80 || (kind === 0x90 && velocity === 0)) return { type: "off", pitch };
  return null;
}
