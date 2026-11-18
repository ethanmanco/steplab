import * as Tone from "tone";
import { oscillatorLayers, waveCoefficients, type LayerPlan, type LightOscillator } from "./layers";

export interface LightEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface LightPolyOptions {
  oscillator: LightOscillator;
  envelope: LightEnvelope;
  volume: number;
  /** Each note starts `cents` away from its pitch and slides into it, settling in about `time` seconds. */
  bend?: { cents: number; time: number };
  /** Play every note this many semitones away, for a sub-octave layer. */
  transpose?: number;
}

/** Tone's PolySynth stops at 32 voices and drops notes past that; this does the same. */
const MAX_VOICES = 32;

interface Voice {
  freq: number;
  start: number;
  /** When the oscillators stop; Infinity while a key is held. */
  stopAt: number;
  released: boolean;
  env: Tone.Gain;
  oscs: OscillatorNode[];
}

/** PeriodicWaves are made once per context and reused by every note. */
const waveCache = new WeakMap<object, Map<string, PeriodicWave>>();

/**
 * A polyphonic synth that sounds like Tone's PolySynth of Synth voices, at a
 * fraction of the cost. A Tone voice keeps a tree of always-running signal
 * nodes (frequency and detune for the voice and for every detuned layer, plus
 * the envelope), about eleven of them for a three-saw pad, and a chord of
 * long pad notes has many voices ringing at once. That was enough to overload
 * the audio thread and make playback stutter.
 *
 * Here each note gets bare oscillators started and stopped at exact times and
 * one gain for its envelope. The envelope uses Tone's own Param ramps with the
 * same calls Tone's Envelope makes, and the oscillators are built from the
 * same waves, detunes and levels (see layers.ts), so the output matches.
 */
export class LightPoly {
  readonly output: Tone.Volume;
  private readonly context = Tone.getContext();
  private readonly plan: LayerPlan;
  private readonly waves: (PeriodicWave | null)[];
  private readonly level: number;
  private envelope: LightEnvelope;
  private readonly bend?: { cents: number; time: number };
  private readonly ratio: number;
  private voices: Voice[] = [];
  private readonly sampleTime = 1 / this.context.sampleRate;

  constructor(options: LightPolyOptions) {
    this.output = new Tone.Volume({
      context: this.context,
      volume: options.volume,
    });
    this.envelope = { ...options.envelope };
    this.bend = options.bend;
    this.ratio = 2 ** ((options.transpose ?? 0) / 12);
    this.plan = oscillatorLayers(options.oscillator);
    this.level = Tone.dbToGain(this.plan.levelDb);
    let cache = waveCache.get(this.context.rawContext);
    if (!cache) waveCache.set(this.context.rawContext, (cache = new Map()));
    this.waves = this.plan.layers.map((layer) => {
      const coefficients = waveCoefficients(layer);
      if (!coefficients) return null;
      const key = `${layer.type}:${layer.phase}:${layer.partials?.join(",") ?? ""}`;
      let wave = cache.get(key);
      if (!wave) {
        wave = this.context.createPeriodicWave(coefficients[0], coefficients[1]);
        cache.set(key, wave);
      }
      return wave;
    });
  }

  connect(destination: Tone.InputNode): this {
    this.output.connect(destination);
    return this;
  }

  /** Envelope changes from the tone knobs apply to the next notes, as in Tone. Glide is accepted and ignored: a PolySynth only glides a voice that is still sounding, and it never reuses one. */
  set(options: { envelope?: Partial<LightEnvelope>; portamento?: number }): this {
    if (options.envelope) this.envelope = { ...this.envelope, ...options.envelope };
    return this;
  }

  triggerAttack(freq: number, time?: number, velocity = 1): this {
    this.startVoice(freq, time ?? this.context.now(), velocity);
    return this;
  }

  triggerRelease(freq: number, time?: number): this {
    const voice = this.voices.find((v) => v.freq === freq && !v.released);
    if (voice) this.releaseVoice(voice, time ?? this.context.now());
    return this;
  }

  triggerAttackRelease(freq: number, duration: number, time?: number, velocity = 1): this {
    const at = time ?? this.context.now();
    const voice = this.startVoice(freq, at, velocity);
    if (voice) this.releaseVoice(voice, at + duration);
    return this;
  }

  releaseAll(time?: number): this {
    const at = time ?? this.context.now();
    for (const voice of this.voices) if (voice.stopAt > at) this.releaseVoice(voice, at);
    return this;
  }

  dispose(): this {
    for (const voice of this.voices) this.freeVoice(voice);
    this.voices = [];
    this.output.dispose();
    return this;
  }

  private startVoice(freq: number, time: number, velocity: number): Voice | null {
    this.voices = this.voices.filter((v) => v.stopAt > time);
    if (this.voices.length >= MAX_VOICES) return null;
    const { attack, decay, sustain } = this.envelope;
    const env = new Tone.Gain({ context: this.context, gain: 0 }).connect(this.output);
    // Tone's Envelope.triggerAttack, step for step, on a voice that starts silent.
    const peak = velocity * this.level;
    if (attack < this.sampleTime) {
      env.gain.cancelScheduledValues(time);
      env.gain.setValueAtTime(peak, time);
    } else {
      env.gain.linearRampTo(peak, attack, time);
    }
    if (decay && sustain < 1) env.gain.exponentialApproachValueAtTime(peak * sustain, time + attack, decay);
    const raw = this.context.rawContext as unknown as BaseAudioContext;
    const oscs = this.plan.layers.map((layer, i) => {
      const osc = raw.createOscillator();
      const wave = this.waves[i];
      if (wave) osc.setPeriodicWave(wave);
      else osc.type = layer.type as OscillatorType;
      osc.frequency.value = freq * this.ratio;
      if (this.bend) {
        // The swoop: start off pitch and glide in, about 95% there after `time`.
        osc.detune.setValueAtTime(layer.detune + this.bend.cents, time);
        osc.detune.setTargetAtTime(layer.detune, time, this.bend.time / 3);
      } else {
        osc.detune.value = layer.detune;
      }
      Tone.connect(osc, env);
      osc.start(time);
      return osc;
    });
    // Like Tone's Synth, a sound with no sustain stops once its decay is done.
    const stopAt = sustain === 0 ? time + attack + decay : Infinity;
    if (stopAt < Infinity) oscs.forEach((o) => o.stop(stopAt));
    const voice: Voice = {
      freq,
      start: time,
      stopAt,
      released: false,
      env,
      oscs,
    };
    oscs[0]!.onended = () => {
      this.freeVoice(voice);
      this.voices = this.voices.filter((v) => v !== voice);
    };
    this.voices.push(voice);
    return voice;
  }

  private releaseVoice(voice: Voice, time: number) {
    voice.released = true;
    if (time <= voice.start) {
      // Released before it began, as when playback stops: it never sounds.
      voice.stopAt = voice.start;
      voice.oscs.forEach((o) => o.stop(voice.start));
      return;
    }
    // Tone's Envelope.triggerRelease and Synth's oscillator stop.
    const release = this.envelope.release;
    if (voice.env.gain.getValueAtTime(time) > 0) {
      if (release < this.sampleTime) voice.env.gain.setValueAtTime(0, time);
      else voice.env.gain.targetRampTo(0, release, time);
    }
    voice.stopAt = Math.min(voice.stopAt, time + release);
    voice.oscs.forEach((o) => o.stop(voice.stopAt));
  }

  private freeVoice(voice: Voice) {
    voice.oscs.forEach((o) => {
      o.onended = null;
      try {
        o.stop();
      } catch {
        // Already stopped.
      }
      o.disconnect();
    });
    voice.env.dispose();
  }
}
