import * as Tone from "tone";
import type { DrumId } from "../core/types";
import { createDrumVoice, type DrumVoice } from "./drums";

/**
 * Baked drums. A synthesized drum rebuilds its sound from oscillators and
 * noise on every hit: an 808 hi-hat starts twelve oscillators each time,
 * which is too much work for a budget phone playing 16th notes. Nothing a
 * channel can change reaches inside a drum voice (cutoff, EQ and effects all
 * happen in the mixer strip after it), so each drum is rendered once, in the
 * background, and every hit plays that recording: the same sound for a small
 * fraction of the work.
 *
 * Drums built on noise get a few takes, played in turn, so a fast hat or
 * snare pattern does not sound like a stuck record. Until a drum is baked,
 * its live voice plays.
 */

/** How long each drum rings, in seconds, with room to spare. Silence at the end is trimmed. */
const LENGTH: Record<DrumId, number> = {
  kick: 0.7,
  snare: 0.4,
  chat: 0.2,
  ohat: 0.7,
  clap: 0.45,
  tom: 0.55,
  kick808: 1.5,
  snare808: 0.4,
  hat808: 0.15,
  ohat808: 0.8,
  clap808: 0.5,
  tom808: 0.75,
  rim: 0.15,
  cowbell: 0.55,
};

/** Takes per drum. Drums made of noise sound different on every hit, so they get several. */
const TAKES: Partial<Record<DrumId, number>> = { snare: 3, clap: 3, snare808: 3, clap808: 3 };

const baked = new Map<DrumId, AudioBuffer[]>();
const queued = new Set<DrumId>();
const listeners = new Set<() => void>();
let working = false;

/** Called whenever a drum finishes baking, so voices can be swapped. */
export function onBaked(fn: () => void): void {
  listeners.add(fn);
}

export function isBaked(id: DrumId): boolean {
  return baked.has(id);
}

/** Ask for a drum to be baked. It happens later, one at a time, never inside another render. */
export function requestBake(id: DrumId): void {
  if (baked.has(id) || queued.has(id)) return;
  queued.add(id);
  if (!working) window.setTimeout(work, 0);
}

async function work() {
  if (working) return;
  working = true;
  try {
    for (const id of queued) {
      try {
        const takes: AudioBuffer[] = [];
        for (let i = 0; i < (TAKES[id] ?? 1); i++) takes.push(await bakeOnce(id));
        baked.set(id, takes);
      } catch {
        // Leave it to the live voice.
      }
      queued.delete(id);
      listeners.forEach((fn) => fn());
    }
  } finally {
    working = false;
  }
}

async function bakeOnce(id: DrumId): Promise<AudioBuffer> {
  const live = Tone.getContext();
  const offline = new Tone.OfflineContext(1, LENGTH[id], live.sampleRate);
  // Build the voice in the offline context and switch straight back, with no
  // waiting in between, so the live engine never sees the offline context.
  Tone.setContext(offline);
  let voice: DrumVoice;
  try {
    voice = createDrumVoice(id);
    voice.output.toDestination();
    voice.trigger(0);
  } finally {
    Tone.setContext(live);
  }
  const rendered = (await offline.render(true)).get();
  voice.dispose();
  if (!rendered) throw new Error("The drum did not render.");
  return trim(rendered);
}

/** Cut the silent end off and fade the last few milliseconds, so the recording ends cleanly. */
function trim(buffer: AudioBuffer): AudioBuffer {
  const data = buffer.getChannelData(0);
  let end = data.length;
  while (end > 1 && Math.abs(data[end - 1]!) < 1e-4) end--;
  const fade = Math.min(end, Math.round(buffer.sampleRate * 0.004));
  const out = new AudioBuffer({ length: Math.max(1, end), numberOfChannels: 1, sampleRate: buffer.sampleRate });
  const dest = out.getChannelData(0);
  dest.set(data.subarray(0, end));
  for (let i = 0; i < fade; i++) dest[end - 1 - i]! *= i / fade;
  return out;
}

/**
 * A drum that plays its baked recording, or null while it is still baking.
 * Each hit is one buffer player and one gain, freed when it ends. A new hit
 * fades the last one out over a few milliseconds, like a drum machine voice,
 * and a closed hat can choke an open one the same way.
 */
export function bakedDrumVoice(id: DrumId): DrumVoice | null {
  const takes = baked.get(id);
  if (!takes) return null;
  const ctx = Tone.getContext().rawContext as BaseAudioContext;
  const out = new Tone.Gain(1);
  let last: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let turn = 0;
  const cut = (t: number) => {
    if (!last) return;
    const { src, gain } = last;
    last = null;
    gain.gain.setTargetAtTime(0, t, 0.003);
    try {
      src.stop(t + 0.03);
    } catch {
      // Already ended.
    }
  };
  return {
    output: out,
    trigger(t) {
      cut(t);
      const src = ctx.createBufferSource();
      src.buffer = takes[turn++ % takes.length]!;
      const gain = ctx.createGain();
      src.connect(gain);
      Tone.connect(gain, out);
      src.onended = () => gain.disconnect();
      src.start(t);
      last = { src, gain };
    },
    choke: cut,
    dispose() {
      cut(Tone.now());
      window.setTimeout(() => out.dispose(), 100);
    },
  };
}
