import { SYNTHS, midiToName } from "../core/notes";
import { DRUM_NAMES, findChannel } from "../core/project";
import { DRUM_IDS, SYNTH_IDS, type DrumId, type SynthId, type ToneShape } from "../core/types";
import { slider } from "./controls";
import { h, setAttr } from "./dom";
import { createFloatingWindow } from "./floatingWindow";
import type { AppState } from "./store";

export interface LibrarySample {
  id: string;
  name: string;
  url: string;
  root: number;
  group: string;
  /** "oneshot" suits drum channels, "melodic" suits synth channels. */
  kind?: "oneshot" | "melodic";
  source?: string;
}

export interface ChannelSettingsActions {
  close(): void;
  rename(id: string, name: string): void;
  setSound(id: string, sound: DrumId | SynthId): void;
  /** A project sample id, "lib:<library id>", or null for the built-in sound. */
  setSample(id: string, sample: string | null): void;
  loadFile(id: string, file: File): void;
  setRoot(sampleId: string, root: number): void;
  setTone(id: string, patch: Partial<ToneShape>): void;
  setPan(id: string, pan: number): void;
  reset(id: string): void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * FL Studio's channel settings: what a channel plays and how it is shaped.
 * Pick a built-in sound or an audio sample, then shape it with the filter,
 * envelope, octave, glide and pan.
 */
export function createChannelSettings(getState: () => AppState, actions: ChannelSettingsActions, library: () => LibrarySample[]) {
  const win = createFloatingWindow({ className: "win-channel", x: 360, y: 140, onClose: actions.close });
  const id = () => getState().openChannel;
  const channel = () => findChannel(getState().project, id() ?? "");
  const withId = (fn: (cid: string) => void) => () => {
    const cid = id();
    if (cid) fn(cid);
  };

  const name = h("input", { type: "text", class: "text-input", maxlength: 40, "aria-label": "Channel name" });
  name.addEventListener("change", withId((cid) => actions.rename(cid, name.value)));
  const sound = h("select", { class: "select", "aria-label": "Built-in sound" });
  sound.addEventListener("change", withId((cid) => actions.setSound(cid, sound.value as DrumId | SynthId)));
  const reset = h("button", { type: "button", class: "btn btn-small", title: "Back to the default tone, effects and pan" }, "Reset");
  reset.addEventListener("click", withId((cid) => actions.reset(cid)));

  const sample = h("select", { class: "select sample-select", "aria-label": "Sample" });
  sample.addEventListener("change", withId((cid) => actions.setSample(cid, sample.value || null)));
  const file = h("input", { type: "file", accept: "audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff", class: "sr-only", tabindex: -1, "aria-hidden": "true" });
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    const cid = id();
    if (f && cid) actions.loadFile(cid, f);
    file.value = "";
  });
  const loadBtn = h("button", { type: "button", class: "btn btn-small", onclick: () => file.click() }, "Load audio file");
  const root = h(
    "select",
    { class: "select", "aria-label": "Root note: the pitch the sample was recorded at" },
    ...Array.from({ length: 73 }, (_, i) => 24 + i).map((m) => h("option", { value: m }, midiToName(m))),
  );
  root.addEventListener("change", () => {
    const ch = channel();
    if (ch?.sample) actions.setRoot(ch.sample, Number(root.value));
  });
  const rootField = h("label", { class: "field", title: "The note the recording plays at. Notes above and below are pitched from it." }, h("span", { class: "field-label" }, "Root"), root);
  const sampleStatus = h("span", { class: "hear-note", role: "status" });

  const tone = (key: keyof ToneShape, label: string, min: number, max: number, step: number, format: (v: number) => string, scale = 100) =>
    slider({ label, min, max, step, format: (v) => format(v / scale), onInput: (v) => {
      const cid = id();
      if (cid) actions.setTone(cid, { [key]: v / scale });
    } });
  const knobs = {
    cutoff: tone("cutoff", "Cutoff", 0, 100, 1, pct),
    resonance: tone("resonance", "Resonance", 0, 100, 1, pct),
    attack: tone("attack", "Attack", 0, 100, 1, (v) => `${(4 ** ((v - 0.5) * 2)).toFixed(2)}x`),
    release: tone("release", "Release", 0, 100, 1, (v) => `${(4 ** ((v - 0.5) * 2)).toFixed(2)}x`),
    glide: tone("glide", "Glide", 0, 100, 1, (v) => (v === 0 ? "Off" : `${Math.round(v * 300)} ms`)),
    octave: tone("octave", "Octave", -2, 2, 1, (v) => (v > 0 ? `+${v}` : String(v)), 1),
  };
  const pan = slider({
    label: "Pan",
    min: -100,
    max: 100,
    format: (v) => (v === 0 ? "Center" : v < 0 ? `${-v}% left` : `${v}% right`),
    onInput: (v) => {
      const cid = id();
      if (cid) actions.setPan(cid, v / 100);
    },
  });
  const synthOnly = [knobs.attack.el, knobs.release.el, knobs.glide.el, knobs.octave.el];

  win.body.append(
    h(
      "div",
      { class: "settings-body" },
      h("div", { class: "editor-controls" }, h("label", { class: "field" }, h("span", { class: "field-label" }, "Name"), name), h("label", { class: "field" }, h("span", { class: "field-label" }, "Sound"), sound), reset),
      h(
        "section",
        { class: "settings-group", "aria-label": "Sample" },
        h("h3", {}, "Sample"),
        h("p", { class: "hear-note" }, "Play an audio file instead of the built-in sound. Drum channels play it once per step; synth channels pitch it across the keyboard."),
        h("div", { class: "editor-controls" }, sample, loadBtn, rootField, file),
        sampleStatus,
      ),
      h("section", { class: "settings-group", "aria-label": "Tone" }, h("h3", {}, "Tone"), h("div", { class: "knob-grid" }, knobs.cutoff.el, knobs.resonance.el, ...synthOnly, pan.el)),
    ),
  );

  let soundKey = "";
  let sampleKey = "";
  return {
    win,
    update(s: AppState) {
      const ch = channel();
      if (!ch) {
        win.hide();
        return;
      }
      win.show();
      win.setTitle(`Channel: ${ch.name}`);
      win.el.dataset.sound = ch.sound;
      if (document.activeElement !== name && name.value !== ch.name) name.value = ch.name;

      if (soundKey !== ch.kind) {
        soundKey = ch.kind;
        sound.replaceChildren(
          ...(ch.kind === "drum"
            ? DRUM_IDS.map((d) => h("option", { value: d }, DRUM_NAMES[d]))
            : SYNTH_IDS.map((x) => h("option", { value: x }, SYNTHS[x].name))),
        );
      }
      if (sound.value !== ch.sound) sound.value = ch.sound;

      const lib = library();
      const key = `${ch.kind}|${s.project.samples.map((x) => `${x.id}:${x.name}`).join()}|${lib.length}`;
      if (sampleKey !== key) {
        sampleKey = key;
        // Show the sounds that suit this channel first: hits for drums, instruments for synths.
        const suits = (x: LibrarySample) => (ch.kind === "drum" ? x.kind === "oneshot" : x.kind !== "oneshot");
        const groups = [...new Set([...lib.filter(suits), ...lib.filter((x) => !suits(x))].map((x) => x.group))];
        sample.replaceChildren(
          h("option", { value: "" }, "None: built-in sound"),
          ...(s.project.samples.length
            ? [h("optgroup", { label: "In this song" }, ...s.project.samples.map((x) => h("option", { value: x.id }, x.name)))]
            : []),
          ...groups.map((g) => h("optgroup", { label: `Library: ${g}` }, ...lib.filter((x) => x.group === g).map((x) => h("option", { value: `lib:${x.id}` }, x.name)))),
        );
      }
      if (sample.value !== (ch.sample ?? "")) sample.value = ch.sample ?? "";
      const info = ch.sample ? s.project.samples.find((x) => x.id === ch.sample) : undefined;
      rootField.hidden = !info || ch.kind !== "synth";
      if (info && root.value !== String(info.root)) root.value = String(info.root);
      sampleStatus.textContent = s.sampleStatus[ch.sample ?? ""] ?? "";

      const isSynth = ch.kind === "synth";
      for (const el of synthOnly) el.hidden = !isSynth;
      knobs.cutoff.set(Math.round(ch.tone.cutoff * 100));
      knobs.resonance.set(Math.round(ch.tone.resonance * 100));
      knobs.attack.set(Math.round(ch.tone.attack * 100));
      knobs.release.set(Math.round(ch.tone.release * 100));
      knobs.glide.set(Math.round(ch.tone.glide * 100));
      knobs.octave.set(ch.tone.octave);
      pan.set(Math.round(ch.pan * 100));
      setAttr(reset, "aria-label", `Reset ${ch.name} tone, effects and pan`);
    },
  };
}
