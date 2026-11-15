import { MAX_BPM, MIN_BPM, clampBpm } from "../core/timing";
import { LOOP_BAR_OPTIONS, type LoopBars } from "../core/types";
import { segmented } from "./controls";
import { ICONS, h, setAttr, svgIcon } from "./dom";
import type { AppState } from "./store";

export interface TransportActions {
  play(): void;
  stop(): void;
  setBpm(bpm: number): void;
  setBars(bars: LoopBars): void;
}

export function createTransport(actions: TransportActions) {
  const play = h(
    "button",
    {
      type: "button",
      class: "btn btn-play",
      "aria-pressed": "false",
      "aria-keyshortcuts": "P",
      title: "Play (P)",
      onclick: () => actions.play(),
    },
    svgIcon(ICONS.play),
    h("span", {}, "Play"),
  );
  const stop = h(
    "button",
    {
      type: "button",
      class: "btn",
      "aria-keyshortcuts": "P",
      title: "Stop (P)",
      onclick: () => actions.stop(),
    },
    svgIcon(ICONS.stop),
    h("span", {}, "Stop"),
  );

  const range = h("input", {
    type: "range",
    id: "bpm-range",
    min: MIN_BPM,
    max: MAX_BPM,
    step: 1,
    "aria-label": "Tempo",
    oninput: () => actions.setBpm(Number(range.value)),
  });
  const num = h("input", {
    type: "number",
    id: "bpm-num",
    class: "bpm-num",
    min: MIN_BPM,
    max: MAX_BPM,
    step: 1,
    inputmode: "numeric",
    "aria-label": "Tempo in beats per minute",
    onchange: () => {
      const bpm = clampBpm(num.value);
      num.value = String(bpm);
      actions.setBpm(bpm);
    },
  });
  const tempo = h(
    "div",
    { class: "tempo" },
    h("label", { for: "bpm-range", class: "field-label" }, "Tempo"),
    range,
    num,
    h("span", { class: "unit", "aria-hidden": "true" }, "BPM"),
  );

  const bars = segmented<LoopBars>({
    legend: "Loop",
    options: LOOP_BAR_OPTIONS.map((b) => ({
      value: b,
      label: String(b),
      title: `${b} bar${b > 1 ? "s" : ""}`,
    })),
    value: 1,
    onChange: (b) => actions.setBars(b),
    className: "seg-bars",
  });
  bars.el.append(h("span", { class: "unit", "aria-hidden": "true" }, "bars"));

  const status = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });

  const el = h(
    "div",
    { class: "transport", role: "group", "aria-label": "Transport" },
    h("div", { class: "transport-buttons" }, play, stop),
    tempo,
    bars.el,
    status,
  );

  let wasPlaying: boolean | null = null;
  return {
    el,
    focusPlay: () => play.focus(),
    update(s: AppState) {
      setAttr(play, "aria-pressed", String(s.playing));
      play.classList.toggle("is-on", s.playing);
      if (wasPlaying !== null && wasPlaying !== s.playing) {
        status.textContent = s.playing ? "Playing" : "Stopped";
      }
      wasPlaying = s.playing;
      const bpm = String(s.project.bpm);
      if (range.value !== bpm) range.value = bpm;
      setAttr(range, "aria-valuetext", `${bpm} BPM`);
      if (document.activeElement !== num && num.value !== bpm) num.value = bpm;
      bars.setValue(s.project.bars);
    },
  };
}
