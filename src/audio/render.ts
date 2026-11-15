import * as Tone from "tone";
import { eventsAt, loopLength } from "../core/schedule";
import { secondsPerStep, stepFromTicks } from "../core/timing";
import type { PlayMode, Project } from "../core/types";
import { encodeWav, loopSlice } from "../core/wav";
import { createGraph, type SampleSource } from "./graph";

const SAMPLE_RATE = 44100;

/**
 * Render the song (or one pattern in Pattern mode) faster than real time with
 * Tone's offline context. It builds the same graph and feeds it the same step
 * events as live playback, so the file sounds like what you hear. It plays
 * twice and the second pass is kept, so tails wrap around and the WAV loops
 * seamlessly in other apps.
 */
export async function renderWav(
  project: Project,
  mode: PlayMode,
  patternId: string | null,
  samples: SampleSource = () => undefined,
): Promise<Blob> {
  const total = loopLength(project, mode, patternId);
  const seconds = total * secondsPerStep(project.bpm);
  const buffer = await Tone.Offline(({ transport }) => {
    const graph = createGraph(project, samples);
    transport.bpm.value = project.bpm;
    new Tone.Loop((time) => {
      const step = stepFromTicks(transport.getTicksAtTime(time), transport.PPQ, total);
      graph.play(project, eventsAt(project, mode, patternId, step), step, time);
    }, "16n").start(0);
    transport.start(0);
  }, seconds * 2, 2, SAMPLE_RATE);

  const { start, end } = loopSlice(seconds, SAMPLE_RATE);
  const raw = buffer.get();
  if (!raw) throw new Error("The render produced no audio.");
  const channels = Array.from({ length: raw.numberOfChannels }, (_, c) => raw.getChannelData(c).slice(start, end));
  return new Blob([encodeWav(channels, SAMPLE_RATE)], { type: "audio/wav" });
}
