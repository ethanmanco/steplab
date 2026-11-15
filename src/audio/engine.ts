import * as Tone from "tone";
import { stepFromTicks } from "../core/timing";
import type { Project } from "../core/types";
import { createGraph, type Graph } from "./graph";

/**
 * Live playback. Tone's transport runs on the audio clock and schedules a
 * little ahead of time (its look-ahead), so every callback receives the exact
 * future `time` the sound must start at. Sounds are triggered at that time,
 * never "now", which keeps the groove tight even if the page is busy.
 *
 * The playhead is drawn with Tone's Draw queue, which fires the visual
 * callback when that same `time` is actually heard.
 */
export class Engine {
  private project: Project;
  private graph?: Graph;
  private onStep: (step: number) => void = () => {};
  playing = false;

  constructor(project: Project) {
    this.project = project;
  }

  /** Must run inside a user gesture: browsers keep audio locked until then. */
  async start(): Promise<void> {
    await Tone.start();
    if (this.graph) return;
    const transport = Tone.getTransport();
    transport.bpm.value = this.project.bpm;
    this.graph = createGraph(this.project);
    new Tone.Loop((time) => {
      const p = this.project;
      const step = stepFromTicks(transport.getTicksAtTime(time), transport.PPQ, p.bars);
      this.graph?.playStep(p, step, time);
      Tone.getDraw().schedule(() => this.onStep(step), time);
    }, "16n").start(0);
  }

  setProject(project: Project): void {
    const prev = this.project;
    this.project = project;
    if (prev.bpm !== project.bpm) Tone.getTransport().bpm.value = project.bpm;
    this.graph?.applyMix(project);
  }

  setStepListener(fn: (step: number) => void): void {
    this.onStep = fn;
  }

  play(): void {
    if (!this.graph || this.playing) return;
    this.playing = true;
    // A small offset gives the first step the same look-ahead as the rest.
    Tone.getTransport().start("+0.05", 0);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    Tone.getDraw().cancel(0);
    this.graph?.silence();
    this.onStep(-1);
  }

  /** Let people hear a note as they place it while stopped. */
  previewNote(track: number, row: number): void {
    if (!this.graph || this.playing) return;
    this.graph.previewNote(this.project, track, row, Tone.now() + 0.01);
  }

  /** Let people hear a drum as they place it while stopped. */
  previewDrum(track: number): void {
    if (!this.graph || this.playing) return;
    this.graph.previewDrum(this.project, track, Tone.now() + 0.01);
  }
}
