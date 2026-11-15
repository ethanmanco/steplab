import * as Tone from "tone";
import { volumeToDb } from "../core/mix";
import { audibleChannels, type StepEvents } from "../core/schedule";
import { secondsPerStep, swingDelay } from "../core/timing";
import type { Channel, Project } from "../core/types";
import { createDrumVoice, type DrumVoice } from "./drums";
import { createInstrument, type Instrument } from "./instruments";

/**
 * The sound-making part of the app: one voice and one channel strip per
 * channel in the rack, into a master limiter. It knows nothing about the
 * transport, so the live engine and the offline WAV render build the exact
 * same graph and feed it the same step events.
 */
export interface Graph {
  play(project: Project, events: StepEvents, step: number, time: number): void;
  previewDrum(channelId: string, time: number): void;
  noteOn(channelId: string, pitch: number, velocity: number, time: number): void;
  noteOff(channelId: string, pitch: number, time: number): void;
  sync(project: Project): void;
  silence(time?: number): void;
  dispose(): void;
}

const CHOKES: Partial<Record<string, string>> = { chat: "ohat", hat808: "ohat808" };

/** Notes end a hair before their last step so repeated notes stay distinct. */
const NOTE_FILL = 0.92;

interface Slot {
  sound: Channel["sound"];
  strip: Tone.Channel;
  drum?: DrumVoice;
  synth?: Instrument;
}

function setStrip(strip: Tone.Channel, volume: number, open: boolean): void {
  strip.mute = !open;
  const db = volumeToDb(volume);
  if (Number.isFinite(db)) strip.volume.rampTo(db, 0.02);
  else strip.volume.value = -Infinity;
}

function disposeVoice(slot: Slot, later: boolean) {
  const free = () => {
    slot.drum?.dispose();
    slot.synth?.dispose();
  };
  slot.synth?.releaseAll();
  // Let release tails finish before freeing a voice that was swapped out.
  if (later) setTimeout(free, 1500);
  else free();
}

export function createGraph(project: Project): Graph {
  const limiter = new Tone.Limiter(-1).toDestination();
  const master = new Tone.Gain(0.85).connect(limiter);
  const slots = new Map<string, Slot>();

  function makeVoice(ch: Channel, strip: Tone.Channel): Slot {
    if (ch.kind === "drum") {
      const drum = createDrumVoice(ch.sound);
      drum.output.connect(strip);
      return { sound: ch.sound, strip, drum };
    }
    const synth = createInstrument(ch.sound);
    synth.output.connect(strip);
    return { sound: ch.sound, strip, synth };
  }

  const graph: Graph = {
    play(p, events, step, time) {
      const at = time + swingDelay(step, p.swing, p.bpm);
      for (const hit of events.drums) {
        // A closed hat chokes every ringing open hat of its kit, like on a real machine.
        const choked = CHOKES[hit.sound];
        if (choked) slots.forEach((s) => s.sound === choked && s.drum?.choke?.(at));
        slots.get(hit.channelId)?.drum?.trigger(at);
      }
      const stepSec = secondsPerStep(p.bpm);
      for (const n of events.notes) {
        slots.get(n.channelId)?.synth?.play(n.pitch, n.steps * stepSec * NOTE_FILL, at, n.velocity);
      }
    },
    previewDrum(channelId, time) {
      slots.get(channelId)?.drum?.trigger(time);
    },
    noteOn(channelId, pitch, velocity, time) {
      slots.get(channelId)?.synth?.attack(pitch, time, velocity);
    },
    noteOff(channelId, pitch, time) {
      slots.get(channelId)?.synth?.release(pitch, time);
    },
    sync(p) {
      const audible = audibleChannels(p);
      const keep = new Set<string>();
      for (const ch of p.channels) {
        keep.add(ch.id);
        let slot = slots.get(ch.id);
        if (!slot) {
          const strip = new Tone.Channel().connect(master);
          slot = makeVoice(ch, strip);
          slots.set(ch.id, slot);
        } else if (slot.sound !== ch.sound) {
          disposeVoice(slot, true);
          slot = makeVoice(ch, slot.strip);
          slots.set(ch.id, slot);
        }
        // Synth strips stay open for live playing even when another channel is
        // soloed; the sequencer itself skips channels that are not audible.
        setStrip(slot.strip, ch.volume, ch.kind === "synth" ? !ch.muted : audible.has(ch.id));
      }
      for (const [id, slot] of slots) {
        if (keep.has(id)) continue;
        disposeVoice(slot, false);
        slot.strip.dispose();
        slots.delete(id);
      }
    },
    silence(time) {
      slots.forEach((s) => s.synth?.releaseAll(time));
    },
    dispose() {
      slots.forEach((s) => {
        disposeVoice(s, false);
        s.strip.dispose();
      });
      slots.clear();
      master.dispose();
      limiter.dispose();
    },
  };
  graph.sync(project);
  return graph;
}
