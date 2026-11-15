import { volumePercent } from "../core/mix";
import type { TrackMix } from "../core/types";
import { h, nextId, setAttr } from "./dom";

export interface Segmented<T extends string | number> {
  el: HTMLFieldSetElement;
  setValue(value: T): void;
  /** Hide options that do not apply right now (bars past the loop end). */
  setAvailable(values: readonly T[]): void;
  /** Put a small dot on one option, for example the bar that is playing. */
  setMarked(value: T | null): void;
}

/**
 * A row of real radio buttons styled as a segmented switch. Native radios give
 * arrow key movement and screen reader support for free.
 */
export function segmented<T extends string | number>(opts: {
  legend: string;
  hideLegend?: boolean;
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}): Segmented<T> {
  const name = nextId("seg");
  const inputs = new Map<T, { input: HTMLInputElement; label: HTMLLabelElement }>();
  const el = h(
    "fieldset",
    { class: `seg ${opts.className ?? ""}` },
    h("legend", { class: opts.hideLegend ? "sr-only" : "seg-legend" }, opts.legend),
  );
  const row = h("div", { class: "seg-row" });
  for (const o of opts.options) {
    const input = h("input", {
      type: "radio",
      name,
      value: String(o.value),
      class: "sr-only",
      onchange: () => opts.onChange(o.value),
    });
    input.checked = o.value === opts.value;
    const label = h("label", { class: "seg-opt", title: o.title }, input, h("span", {}, o.label));
    inputs.set(o.value, { input, label });
    row.append(label);
  }
  el.append(row);
  return {
    el,
    setValue(value) {
      inputs.forEach(({ input }, v) => {
        input.checked = v === value;
      });
    },
    setAvailable(values) {
      inputs.forEach(({ label }, v) => {
        label.hidden = !values.includes(v);
      });
    },
    setMarked(value) {
      inputs.forEach(({ label }, v) => label.classList.toggle("marked", v === value));
    },
  };
}

export interface TrackHead {
  el: HTMLElement;
  update(mix: TrackMix): void;
}

/** Name, mute button and volume fader for one track. */
export function trackHead(opts: {
  name: string;
  extra?: HTMLElement;
  onMute: (muted: boolean) => void;
  onVolume: (volume: number) => void;
}): TrackHead {
  let muted = false;
  const mute = h(
    "button",
    {
      type: "button",
      class: "mute",
      "aria-pressed": "false",
      "aria-label": `Mute ${opts.name}`,
      title: `Mute ${opts.name}`,
      onclick: () => opts.onMute(!muted),
    },
    "M",
  );
  const fader = h("input", {
    type: "range",
    class: "fader",
    min: 0,
    max: 100,
    step: 1,
    "aria-label": `${opts.name} volume`,
    oninput: () => opts.onVolume(Number(fader.value) / 100),
  });
  const el = h(
    "div",
    { class: "track-head" },
    h("span", { class: "track-name" }, opts.name),
    opts.extra,
    h("div", { class: "track-mix" }, mute, fader),
  );
  return {
    el,
    update(mix) {
      muted = mix.muted;
      setAttr(mute, "aria-pressed", String(mix.muted));
      el.classList.toggle("is-muted", mix.muted);
      const v = String(Math.round(mix.volume * 100));
      if (fader.value !== v) fader.value = v;
      setAttr(fader, "aria-valuetext", volumePercent(mix.volume));
    },
  };
}
