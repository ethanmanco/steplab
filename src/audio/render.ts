import * as Tone from "tone";
import { loopSeconds, stepFromTicks } from "../core/timing";
import type { Project } from "../core/types";
import { encodeWav, loopSlice } from "../core/wav";
import { createGraph } from "./graph";

const SAMPLE_RATE = 44100;

/**
 * Render the loop faster than real time with Tone's offline context. It
 * builds the same graph and step callback as live playback, so the file
 * sounds like what you hear. The loop plays twice and the second pass is
 * kept, so tails wrap around and the WAV loops seamlessly in other apps.
 */
export async function renderLoopWav(project: Project): Promise<Blob> {
  const seconds = loopSeconds(project.bpm, project.bars);
  const buffer = await Tone.Offline(({ transport }) => {
    const graph = createGraph(project);
    transport.bpm.value = project.bpm;
    new Tone.Loop((time) => {
      const step = stepFromTicks(transport.getTicksAtTime(time), transport.PPQ, project.bars);
      graph.playStep(project, step, time);
    }, "16n").start(0);
    transport.start(0);
  }, seconds * 2, 2, SAMPLE_RATE);

  const { start, end } = loopSlice(seconds, SAMPLE_RATE);
  const raw = buffer.get();
  if (!raw) throw new Error("The render produced no audio.");
  const channels = Array.from({ length: raw.numberOfChannels }, (_, c) =>
    raw.getChannelData(c).slice(start, end),
  );
  return new Blob([encodeWav(channels, SAMPLE_RATE)], { type: "audio/wav" });
}
