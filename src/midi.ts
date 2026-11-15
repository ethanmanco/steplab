import { parseMidi, type MidiEvent } from "./core/midi";

export interface MidiConnection {
  /** Names of the connected keyboards. */
  inputs(): string[];
}

/**
 * Ask the browser for MIDI keyboards and forward their notes. Works in
 * Chrome, Edge and Firefox; Safari has no Web MIDI. The browser shows its own
 * permission prompt the first time.
 */
export async function connectMidi(
  onEvent: (e: MidiEvent) => void,
  onChange: (names: string[]) => void,
): Promise<MidiConnection> {
  if (!("requestMIDIAccess" in navigator)) {
    throw new Error("This browser does not support MIDI keyboards. Try Chrome, Edge or Firefox.");
  }
  const access = await navigator.requestMIDIAccess({ sysex: false });
  const names = () =>
    Array.from(access.inputs.values())
      .filter((i) => i.state === "connected")
      .map((i) => i.name ?? "MIDI keyboard");
  const listen = () => {
    access.inputs.forEach((input) => {
      input.onmidimessage = (msg) => {
        if (!msg.data) return;
        const e = parseMidi(msg.data);
        if (e) onEvent(e);
      };
    });
  };
  listen();
  access.onstatechange = () => {
    listen();
    onChange(names());
  };
  onChange(names());
  return { inputs: names };
}
