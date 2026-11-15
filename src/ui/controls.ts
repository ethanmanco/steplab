import { parsePercent, volumePercent } from "../core/mix";
import type { TrackMix } from "../core/types";
import { h, nextId, setAttr } from "./dom";

export interface Segmented<T extends string | number> {
  el: HTMLFieldSetElement;
  setValue(value: T): void;
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
  const inputs = new Map<T, HTMLInputElement>();
  const el = h(
    "fieldset",
    { class: `seg ${opts.className ?? ""}` },
    h("legend", { class: opts.hideLegend ? "sr-only" : "field-label" }, opts.legend),
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
    inputs.set(o.value, input);
    row.append(h("label", { class: "seg-opt", title: o.title }, input, h("span", {}, o.label)));
  }
  el.append(row);
  return {
    el,
    setValue(value) {
      inputs.forEach((input, v) => {
        input.checked = v === value;
      });
    },
  };
}

/** A labeled checkbox styled as a small switch. */
export function toggle(opts: { label: string; onChange: (on: boolean) => void; title?: string }) {
  const input = h("input", {
    type: "checkbox",
    class: "toggle-input",
    onchange: () => opts.onChange(input.checked),
  });
  const el = h("label", { class: "toggle", title: opts.title }, input, h("span", { class: "toggle-ui" }), opts.label);
  return {
    el,
    set(on: boolean) {
      input.checked = on;
    },
  };
}

/**
 * A number box that commits on Enter or when focus leaves, and puts the old
 * value back if the text is not usable.
 */
export function numberField(opts: {
  label: string;
  min: number;
  max: number;
  step?: number;
  className?: string;
  suffix?: string;
  parse?: (text: string) => number | null;
  onCommit: (value: number) => void;
}) {
  const id = nextId("num");
  let current = 0;
  const input = h("input", {
    id,
    type: "text",
    inputmode: "decimal",
    class: `num ${opts.className ?? ""}`,
    "aria-label": opts.label,
    autocomplete: "off",
    spellcheck: "false",
  });
  const parse =
    opts.parse ??
    ((t: string) => {
      const n = Number.parseFloat(t);
      return Number.isFinite(n) ? n : null;
    });
  const commit = () => {
    const v = parse(input.value);
    if (v === null) {
      input.value = String(current);
      return;
    }
    const clamped = Math.min(opts.max, Math.max(opts.min, v));
    if (clamped !== current) opts.onCommit(clamped);
    else input.value = String(current);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      commit();
      input.select();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = (opts.step ?? 1) * (e.shiftKey ? 10 : 1);
      const v = Math.min(opts.max, Math.max(opts.min, current + (e.key === "ArrowUp" ? step : -step)));
      if (v !== current) opts.onCommit(v);
    }
  });
  input.addEventListener("focus", () => input.select());
  const el = h(
    "span",
    { class: "num-wrap" },
    input,
    opts.suffix ? h("span", { class: "num-suffix", "aria-hidden": "true" }, opts.suffix) : null,
  );
  return {
    el,
    input,
    set(value: number) {
      current = value;
      if (document.activeElement !== input && input.value !== String(value)) input.value = String(value);
      else if (document.activeElement === input && parse(input.value) !== value) input.value = String(value);
    },
  };
}

export interface TrackHead {
  el: HTMLElement;
  update(mix: TrackMix, name?: string): void;
}

/** Name, mute, solo, a volume fader and a typed volume percent for one track. */
export function trackHead(opts: {
  name: string;
  onMute: (muted: boolean) => void;
  onSolo: (solo: boolean) => void;
  onVolume: (volume: number) => void;
}): TrackHead {
  let mix: TrackMix = { volume: 0, muted: false, solo: false };
  const small = (text: string, label: string, cls: string, onclick: () => void) =>
    h("button", { type: "button", class: `mini ${cls}`, "aria-pressed": "false", "aria-label": label, title: label, onclick }, text);
  const mute = small("M", `Mute ${opts.name}`, "mute", () => opts.onMute(!mix.muted));
  const solo = small("S", `Solo ${opts.name}`, "solo", () => opts.onSolo(!mix.solo));
  const fader = h("input", {
    type: "range",
    class: "fader",
    min: 0,
    max: 100,
    step: 1,
    "aria-label": `${opts.name} volume`,
    oninput: () => opts.onVolume(Number(fader.value) / 100),
  });
  const percent = numberField({
    label: `${opts.name} volume, percent`,
    min: 0,
    max: 100,
    className: "num-vol",
    suffix: "%",
    parse: (t) => {
      const v = parsePercent(t);
      return v === null ? null : Math.round(v * 100);
    },
    onCommit: (v) => opts.onVolume(v / 100),
  });
  let shownName = opts.name;
  const nameEl = h("span", { class: "track-name" }, opts.name);
  const el = h(
    "div",
    { class: "track-head" },
    nameEl,
    h("div", { class: "track-mix" }, mute, solo, fader, percent.el),
  );
  return {
    el,
    update(next, name) {
      mix = next;
      if (name !== undefined && name !== shownName) {
        shownName = name;
        nameEl.textContent = name;
        setAttr(mute, "aria-label", `Mute ${name}`);
        setAttr(mute, "title", `Mute ${name}`);
        setAttr(solo, "aria-label", `Solo ${name}`);
        setAttr(solo, "title", `Solo ${name}`);
        setAttr(fader, "aria-label", `${name} volume`);
        setAttr(percent.input, "aria-label", `${name} volume, percent`);
      }
      setAttr(mute, "aria-pressed", String(next.muted));
      setAttr(solo, "aria-pressed", String(next.solo));
      el.classList.toggle("is-muted", next.muted);
      el.classList.toggle("is-solo", next.solo);
      const v = String(Math.round(next.volume * 100));
      if (fader.value !== v) fader.value = v;
      setAttr(fader, "aria-valuetext", volumePercent(next.volume));
      percent.set(Math.round(next.volume * 100));
    },
  };
}

/** A labeled slider with its value shown beside it, for knobs in the channel settings and mixer. */
export function slider(opts: {
  label: string;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onInput: (v: number) => void;
  vertical?: boolean;
  className?: string;
}) {
  const id = nextId("sl");
  const input = h("input", {
    id,
    type: "range",
    min: opts.min,
    max: opts.max,
    step: opts.step ?? 1,
    class: opts.vertical ? "vertical" : undefined,
    oninput: () => opts.onInput(Number(input.value)),
  });
  const out = h("output", { for: id, class: "slider-out" });
  const el = h(
    "label",
    { class: `slider ${opts.vertical ? "slider-v" : ""} ${opts.className ?? ""}` },
    h("span", { class: "slider-label" }, opts.label),
    input,
    out,
  );
  return {
    el,
    input,
    set(v: number) {
      if (Number(input.value) !== v && document.activeElement !== input) input.value = String(v);
      else if (document.activeElement === input && Number(input.value) !== v) input.value = String(v);
      const text = opts.format(v);
      if (out.textContent !== text) out.textContent = text;
      setAttr(input, "aria-valuetext", text);
    },
  };
}

/**
 * A heading that folds its section away. The button says whether the section
 * is open (aria-expanded), and a short summary shows what is inside while it
 * is folded.
 */
export function disclosure(opts: { title: string; onToggle: (open: boolean) => void }) {
  const bodyId = nextId("sec");
  const titleId = nextId("sec-title");
  const summary = h("span", { class: "disclosure-summary" });
  const button = h(
    "button",
    {
      type: "button",
      class: "disclosure",
      "aria-expanded": "true",
      "aria-controls": bodyId,
      onclick: () => opts.onToggle(button.getAttribute("aria-expanded") !== "true"),
    },
    h("span", { class: "chevron", "aria-hidden": "true" }),
    h("span", { id: titleId, class: "disclosure-title" }, opts.title),
    summary,
  );
  const body = h("div", { id: bodyId, class: "disclosure-body" });
  return {
    button,
    body,
    titleId,
    set(open: boolean, text = "") {
      setAttr(button, "aria-expanded", String(open));
      body.hidden = !open;
      if (summary.textContent !== text) summary.textContent = text;
    },
  };
}
