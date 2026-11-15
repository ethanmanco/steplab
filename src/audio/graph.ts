import * as Tone from "tone";
import { volumeToDb } from "../core/mix";
import { eventsAtStep } from "../core/schedule";
import type { Project, TrackMix } from "../core/types";
import { createDrumKit } from "./drums";

/**
 * The sound-making part of the app: instruments, one channel strip per track,
 * and a master limiter. It knows nothing about the transport, so the live
 * engine and the offline WAV render build the exact same graph.
 */
export interface Graph {
  playStep(project: Project, step: number, time: number): void;
  previewDrum(project: Project, track: number, time: number): void;
  applyMix(project: Project): void;
  dispose(): void;
}

function setChannel(ch: Tone.Channel, mix: TrackMix): void {
  ch.mute = mix.muted;
  const db = volumeToDb(mix.volume);
  if (Number.isFinite(db)) ch.volume.rampTo(db, 0.02);
  else ch.volume.value = -Infinity;
}

export function createGraph(project: Project): Graph {
  const limiter = new Tone.Limiter(-1).toDestination();
  const master = new Tone.Gain(0.85).connect(limiter);

  const kit = createDrumKit();
  const drumChannels = project.drums.map((d) => {
    const ch = new Tone.Channel().connect(master);
    kit[d.id].output.connect(ch);
    return ch;
  });

  const graph: Graph = {
    playStep(p, step, time) {
      const events = eventsAtStep(p, step);
      for (const hit of events.drums) kit[hit.id].trigger(time);
    },
    previewDrum(p, track, time) {
      const d = p.drums[track];
      if (d && !d.muted) kit[d.id].trigger(time);
    },
    applyMix(p) {
      p.drums.forEach((d, i) => {
        const ch = drumChannels[i];
        if (ch) setChannel(ch, d);
      });
    },
    dispose() {
      Object.values(kit).forEach((v) => v.dispose());
      drumChannels.forEach((c) => c.dispose());
      master.dispose();
      limiter.dispose();
    },
  };
  graph.applyMix(project);
  return graph;
}
