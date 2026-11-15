import * as Tone from "tone";
import { eventsAt, loopLength } from "../core/schedule";
import { pulseSteps, secondsPerStep, stepFromTicks, stepsPerBar } from "../core/timing";
import type { PlayMode, Project } from "../core/types";
import { createGraph, type Graph } from "./graph";

export type PlayState = "stopped" | "counting" | "playing" | "paused";

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
  private mode: PlayMode = "song";
  private patternId: string | null = null;
  private layers: string[] = [];
  private graph?: Graph;
  private click?: Tone.Synth;
  private onStep: (step: number) => void = () => {};
  private onState: (state: PlayState) => void = () => {};
  private countInEnd = 0;
  private countInTimer?: number;
  state: PlayState = "stopped";
  metronome = false;

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
    this.click = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
      volume: -10,
    }).toDestination();

    new Tone.Loop((time) => {
      const p = this.project;
      const total = loopLength(p, this.mode, this.patternId, this.layers);
      const step = stepFromTicks(transport.getTicksAtTime(time), transport.PPQ, total);
      this.graph?.play(p, eventsAt(p, this.mode, this.patternId, step, this.layers), step, time);
      if (this.metronome) this.tick(step, time);
      // Stop and pause land a look-ahead after they are pressed, so a step
      // can still be queued; only draw it while actually playing.
      Tone.getDraw().schedule(() => {
        if (this.state === "playing") this.onStep(step);
      }, time);
    }, "16n").start(0);
  }

  /** A metronome click on each pulse, higher on the first beat of the bar. */
  private tick(step: number, time: number) {
    const sig = this.project.timeSig;
    const inBar = step % stepsPerBar(sig);
    if (inBar % pulseSteps(sig) !== 0) return;
    this.click?.triggerAttackRelease(inBar === 0 ? "C6" : "G5", 0.03, time, inBar === 0 ? 1 : 0.6);
  }

  setProject(project: Project): void {
    const prev = this.project;
    this.project = project;
    if (prev.bpm !== project.bpm) Tone.getTransport().bpm.value = project.bpm;
    this.graph?.sync(project);
  }

  /**
   * Pattern mode loops one pattern (plus any backing layers); Song mode plays
   * the playlist.
   */
  setSource(mode: PlayMode, patternId: string | null, layers: string[] = []): void {
    this.mode = mode;
    this.patternId = patternId;
    this.layers = layers;
  }

  /** How long the transport loops right now, in steps. */
  loopSteps(): number {
    return loopLength(this.project, this.mode, this.patternId, this.layers);
  }

  /**
   * While recording, turn every channel except the one being played down to
   * `level` (0..1), so the backing sits under your playing. Null restores it.
   */
  setBacking(keepChannelId: string | null, level = 1): void {
    this.graph?.setBacking(keepChannelId, level);
    this.graph?.sync(this.project);
  }

  /** Jump to a step (used by clicking the playlist ruler). */
  seek(step: number): void {
    const transport = Tone.getTransport();
    transport.ticks = Math.max(0, step) * (transport.PPQ / 4);
    if (this.state !== "playing") this.onStep(step);
  }

  setStepListener(fn: (step: number) => void): void {
    this.onStep = fn;
  }

  setStateListener(fn: (state: PlayState) => void): void {
    this.onState = fn;
  }

  private setState(state: PlayState) {
    this.state = state;
    this.onState(state);
  }

  /**
   * Start or resume. With a count-in, one bar of clicks plays first and the
   * loop starts on the next downbeat.
   */
  play(countIn = false): void {
    if (!this.graph || this.state === "playing" || this.state === "counting") return;
    const transport = Tone.getTransport();
    const startAt = Tone.now() + 0.05;
    let begin = startAt;
    if (countIn) {
      const sig = this.project.timeSig;
      const pulse = pulseSteps(sig) * secondsPerStep(this.project.bpm);
      const pulses = Math.max(1, Math.round(stepsPerBar(sig) / pulseSteps(sig)));
      for (let i = 0; i < pulses; i++) {
        this.click?.triggerAttackRelease(i === 0 ? "C6" : "G5", 0.03, startAt + i * pulse, i === 0 ? 1 : 0.6);
      }
      begin = startAt + pulses * pulse;
      this.countInEnd = begin;
      this.setState("counting");
      const wait = (begin - Tone.immediate()) * 1000;
      this.countInTimer = window.setTimeout(() => {
        if (this.state === "counting") this.setState("playing");
      }, Math.max(0, wait));
    } else {
      this.countInEnd = 0;
      this.setState("playing");
    }
    // After a pause the transport carries on from where it stopped.
    transport.start(begin);
  }

  pause(): void {
    if (this.state !== "playing" && this.state !== "counting") return;
    window.clearTimeout(this.countInTimer);
    Tone.getTransport().pause();
    Tone.getDraw().cancel(0);
    this.graph?.silence();
    this.setState("paused");
  }

  stop(): void {
    if (this.state === "stopped") return;
    window.clearTimeout(this.countInTimer);
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    Tone.getDraw().cancel(0);
    this.graph?.silence();
    this.setState("stopped");
    this.onStep(-1);
  }

  /**
   * Where the music is right now, in steps since the transport started (not
   * wrapped around the loop), as the listener hears it. Negative during a
   * count-in. Null when stopped or paused.
   */
  heardSteps(): number | null {
    if (this.state !== "playing" && this.state !== "counting") return null;
    const raw = Tone.getContext().rawContext as AudioContext;
    const now = Tone.immediate() - (raw.outputLatency || 0);
    if (now < this.countInEnd) return (now - this.countInEnd) / secondsPerStep(this.project.bpm);
    const transport = Tone.getTransport();
    return transport.getTicksAtTime(now) / (transport.PPQ / 4);
  }

  /** Let people hear a drum as they place it while stopped. */
  previewDrum(channelId: string): void {
    if (!this.graph || this.state === "playing") return;
    this.graph.previewDrum(channelId, Tone.now() + 0.01);
  }

  /** Let people hear a note as they place it while stopped. */
  previewNote(channelId: string, pitch: number): void {
    if (!this.graph || this.state === "playing") return;
    const at = Tone.now() + 0.01;
    this.graph.noteOn(channelId, pitch, 0.8, at);
    this.graph.noteOff(channelId, pitch, at + secondsPerStep(this.project.bpm) * 2);
  }

  /** Live keys: start and end a held note right away. */
  noteOn(channelId: string, pitch: number, velocity: number): void {
    if (this.project.channels.find((c) => c.id === channelId)?.muted) return;
    this.graph?.noteOn(channelId, pitch, velocity, Tone.immediate());
  }

  noteOff(channelId: string, pitch: number): void {
    this.graph?.noteOff(channelId, pitch, Tone.immediate());
  }
}
