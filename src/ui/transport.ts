import { MAX_BEATS, MAX_BPM, MIN_BPM } from "../core/timing";
import type { PlayMode, TimeSignature } from "../core/types";
import { numberField, segmented } from "./controls";
import { ICONS, h, setAttr, svgIcon } from "./dom";
import type { AppState } from "./store";

export interface TransportActions {
  togglePlay(): void;
  stop(): void;
  toggleRecord(): void;
  toggleMetronome(): void;
  setBpm(bpm: number): void;
  setMode(mode: PlayMode): void;
  setTimeSig(sig: TimeSignature): void;
  setSwing(swing: number): void;
}

export function createTransport(actions: TransportActions) {
  const playIcon = svgIcon(ICONS.play);
  const playText = h("span", {}, "Play");
  const play = h(
    "button",
    { type: "button", class: "btn btn-play", "aria-keyshortcuts": "P", title: "Play or pause (P)", onclick: () => actions.togglePlay() },
    playIcon,
    playText,
  );
  const stop = h(
    "button",
    { type: "button", class: "btn", "aria-keyshortcuts": "Escape", title: "Stop and go back to the start (Esc)", onclick: () => actions.stop() },
    svgIcon(ICONS.stop),
    h("span", {}, "Stop"),
  );
  const record = h(
    "button",
    {
      type: "button",
      class: "btn btn-rec",
      "aria-pressed": "false",
      "aria-keyshortcuts": "Shift+R",
      title: "Record notes into the melody track (Shift+R)",
      onclick: () => actions.toggleRecord(),
    },
    svgIcon(ICONS.record),
    h("span", {}, "Rec"),
  );
  const metro = h(
    "button",
    {
      type: "button",
      class: "btn btn-icon",
      "aria-pressed": "false",
      "aria-label": "Metronome",
      title: "Metronome",
      onclick: () => actions.toggleMetronome(),
    },
    svgIcon(ICONS.metronome),
  );

  const range = h("input", {
    type: "range",
    min: MIN_BPM,
    max: MAX_BPM,
    step: 1,
    "aria-label": "Tempo",
    oninput: () => actions.setBpm(Number(range.value)),
  });
  const bpm = numberField({ label: "Tempo in beats per minute", min: MIN_BPM, max: MAX_BPM, className: "num-3", onCommit: actions.setBpm });
  const tempo = h("div", { class: "field" }, h("span", { class: "field-label", "aria-hidden": "true" }, "Tempo"), range, bpm.el, h("span", { class: "unit", "aria-hidden": "true" }, "BPM"));

  let sig: TimeSignature = { beats: 4, unit: 4 };
  const beats = numberField({
    label: "Beats per bar",
    min: 1,
    max: MAX_BEATS,
    className: "num-2",
    onCommit: (b) => actions.setTimeSig({ ...sig, beats: Math.round(b) }),
  });
  const unit = h(
    "select",
    { class: "select", "aria-label": "Beat note value", onchange: () => actions.setTimeSig({ ...sig, unit: unit.value === "8" ? 8 : 4 }) },
    h("option", { value: "4" }, "4"),
    h("option", { value: "8" }, "8"),
  );
  const meter = h("div", { class: "field", role: "group", "aria-label": "Time signature" }, h("span", { class: "field-label", "aria-hidden": "true" }, "Time"), beats.el, h("span", { class: "slash", "aria-hidden": "true" }, "/"), unit);

  // Pattern mode loops the pattern being edited; Song mode plays the playlist.
  const mode = segmented<PlayMode>({
    legend: "Play mode",
    hideLegend: true,
    options: [
      { value: "pattern", label: "PAT", title: "Pattern mode: loop the selected pattern" },
      { value: "song", label: "SONG", title: "Song mode: play the whole playlist" },
    ],
    value: "song",
    onChange: actions.setMode,
    className: "seg-mode",
  });

  const swing = h("input", {
    type: "range",
    class: "swing",
    min: 0,
    max: 100,
    step: 1,
    "aria-label": "Swing",
    oninput: () => actions.setSwing(Number(swing.value) / 100),
  });
  const swingOut = h("span", { class: "unit swing-out", "aria-hidden": "true" });
  const swingField = h("div", { class: "field" }, h("span", { class: "field-label", "aria-hidden": "true" }, "Swing"), swing, swingOut);

  const status = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });

  const el = h(
    "div",
    { class: "transport", role: "group", "aria-label": "Transport" },
    h("div", { class: "transport-buttons" }, play, stop, record, metro),
    mode.el,
    tempo,
    meter,
    swingField,
    status,
  );

  const STATUS: Record<AppState["playState"], string> = {
    stopped: "Stopped",
    paused: "Paused",
    playing: "Playing",
    counting: "Counting in",
  };
  let lastState: string | null = null;

  return {
    el,
    focusPlay: () => play.focus(),
    update(s: AppState) {
      const { project } = s;
      const running = s.playState === "playing" || s.playState === "counting";
      play.classList.toggle("is-on", running);
      (playIcon.firstChild as SVGPathElement).setAttribute("d", running ? ICONS.pause : ICONS.play);
      playText.textContent = running ? "Pause" : "Play";
      record.classList.toggle("is-on", s.recordArmed);
      record.classList.toggle("is-live", s.recordArmed && running);
      setAttr(record, "aria-pressed", String(s.recordArmed));
      setAttr(metro, "aria-pressed", String(s.prefs.metronome));
      if (lastState !== null && lastState !== s.playState) status.textContent = STATUS[s.playState];
      lastState = s.playState;

      if (range.value !== String(project.bpm)) range.value = String(project.bpm);
      setAttr(range, "aria-valuetext", `${project.bpm} BPM`);
      bpm.set(project.bpm);
      sig = project.timeSig;
      beats.set(sig.beats);
      unit.value = String(sig.unit);
      mode.setValue(s.mode);
      const sw = Math.round(project.swing * 100);
      if (swing.value !== String(sw)) swing.value = String(sw);
      setAttr(swing, "aria-valuetext", `${sw}%`);
      swingOut.textContent = `${sw}%`;
    },
  };
}
