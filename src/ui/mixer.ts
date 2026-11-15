import { volumePercent } from "../core/mix";
import { audibleChannels } from "../core/schedule";
import { DELAY_TIMES, type ChannelFx, type DelayTime, type Master } from "../core/types";
import { slider } from "./controls";
import { h, setAttr } from "./dom";
import { createFloatingWindow } from "./floatingWindow";
import type { AppState } from "./store";

export interface MixerActions {
  close(): void;
  setFx(channelId: string, patch: Partial<ChannelFx>): void;
  setPan(channelId: string, pan: number): void;
  setVolume(channelId: string, volume: number): void;
  setMute(channelId: string, muted: boolean): void;
  setSolo(channelId: string, solo: boolean): void;
  setMaster(patch: Partial<Master>): void;
  openSettings(channelId: string): void;
}

const pct = (v: number) => `${Math.round(v)}%`;
const db = (v: number) => (v === 0 ? "0 dB" : `${v > 0 ? "+" : ""}${v} dB`);
const DELAY_LABELS: Record<DelayTime, string> = { "16n": "1/16", "8n": "1/8", "8n.": "Dotted 1/8", "4n": "1/4" };

interface Strip {
  el: HTMLElement;
  name: HTMLButtonElement;
  low: ReturnType<typeof slider>;
  mid: ReturnType<typeof slider>;
  high: ReturnType<typeof slider>;
  comp: ReturnType<typeof slider>;
  reverb: ReturnType<typeof slider>;
  delay: ReturnType<typeof slider>;
  pan: ReturnType<typeof slider>;
  volume: ReturnType<typeof slider>;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
}

/**
 * The mixer, like FL Studio's (F9): one insert strip per channel with a three
 * band EQ, compression, reverb and delay sends, pan and a fader, plus the
 * master strip that sets the shared reverb and delay.
 */
export function createMixer(actions: MixerActions) {
  const win = createFloatingWindow({ className: "win-mixer", x: 140, y: 120, onClose: actions.close });
  win.setTitle("Mixer");
  const strips = new Map<string, Strip>();
  const row = h("div", { class: "mixer-strips", role: "list" });

  function makeStrip(cid: string): Strip {
    const fx = (key: keyof ChannelFx, label: string, min: number, max: number, format: (v: number) => string, scale = 1) =>
      slider({ label, min, max, format, onInput: (v) => actions.setFx(cid, { [key]: v / scale }) });
    const name = h("button", { type: "button", class: "strip-name", title: "Channel settings", onclick: () => actions.openSettings(cid) });
    const mute = h("button", { type: "button", class: "mini mute", "aria-pressed": "false", onclick: () => actions.setMute(cid, mute.getAttribute("aria-pressed") !== "true") }, "M");
    const solo = h("button", { type: "button", class: "mini solo", "aria-pressed": "false", onclick: () => actions.setSolo(cid, solo.getAttribute("aria-pressed") !== "true") }, "S");
    const s: Strip = {
      el: h("div", { class: "strip", role: "listitem" }),
      name,
      low: fx("low", "Low", -12, 12, db),
      mid: fx("mid", "Mid", -12, 12, db),
      high: fx("high", "High", -12, 12, db),
      comp: fx("comp", "Comp", 0, 100, pct, 100),
      reverb: fx("reverb", "Reverb", 0, 100, pct, 100),
      delay: fx("delay", "Delay", 0, 100, pct, 100),
      pan: slider({ label: "Pan", min: -100, max: 100, format: (v) => (v === 0 ? "C" : v < 0 ? `L${-v}` : `R${v}`), onInput: (v) => actions.setPan(cid, v / 100) }),
      volume: slider({ label: "Volume", min: 0, max: 100, vertical: true, format: (v) => volumePercent(v / 100), onInput: (v) => actions.setVolume(cid, v / 100) }),
      mute,
      solo,
    };
    s.el.append(
      name,
      h("div", { class: "strip-group", role: "group", "aria-label": "EQ" }, s.low.el, s.mid.el, s.high.el),
      h("div", { class: "strip-group", role: "group", "aria-label": "Dynamics and sends" }, s.comp.el, s.reverb.el, s.delay.el),
      s.pan.el,
      s.volume.el,
      h("div", { class: "strip-buttons" }, mute, solo),
    );
    return s;
  }

  // The master strip.
  const mVol = slider({ label: "Volume", min: 0, max: 100, vertical: true, format: (v) => volumePercent(v / 100), onInput: (v) => actions.setMaster({ volume: v / 100 }) });
  const mSize = slider({ label: "Reverb size", min: 0, max: 100, format: pct, onInput: (v) => actions.setMaster({ reverbSize: v / 100 }) });
  const mFeedback = slider({ label: "Delay feedback", min: 0, max: 90, format: pct, onInput: (v) => actions.setMaster({ delayFeedback: v / 100 }) });
  const mTime = h(
    "select",
    { class: "select", "aria-label": "Delay time", onchange: () => actions.setMaster({ delayTime: mTime.value as DelayTime }) },
    ...DELAY_TIMES.map((t) => h("option", { value: t }, DELAY_LABELS[t])),
  );
  const masterStrip = h(
    "div",
    { class: "strip strip-master", "aria-label": "Master" },
    h("span", { class: "strip-name" }, "Master"),
    h("div", { class: "strip-group" }, mSize.el, h("label", { class: "slider" }, h("span", { class: "slider-label" }, "Delay time"), mTime), mFeedback.el),
    mVol.el,
  );

  win.body.append(h("div", { class: "mixer-body" }, row, masterStrip));

  return {
    win,
    update(s: AppState) {
      if (!s.mixerOpen) {
        win.hide();
        return;
      }
      win.show();
      const p = s.project;
      const audible = audibleChannels(p);
      const ids = new Set(p.channels.map((c) => c.id));
      for (const [cid, st] of strips) {
        if (!ids.has(cid)) {
          st.el.remove();
          strips.delete(cid);
        }
      }
      p.channels.forEach((c, i) => {
        let st = strips.get(c.id);
        if (!st) {
          st = makeStrip(c.id);
          strips.set(c.id, st);
        }
        if (row.children[i] !== st.el) row.insertBefore(st.el, row.children[i] ?? null);
        st.el.dataset.sound = c.sound;
        st.el.classList.toggle("silent", !audible.has(c.id));
        if (st.name.textContent !== c.name) st.name.textContent = c.name;
        setAttr(st.name, "aria-label", `${c.name} channel settings`);
        for (const [key, label] of [["low", "low EQ"], ["mid", "mid EQ"], ["high", "high EQ"], ["comp", "compression"], ["reverb", "reverb send"], ["delay", "delay send"]] as const) {
          setAttr(st[key].input, "aria-label", `${c.name} ${label}`);
        }
        setAttr(st.pan.input, "aria-label", `${c.name} pan`);
        setAttr(st.volume.input, "aria-label", `${c.name} volume`);
        setAttr(st.mute, "aria-label", `Mute ${c.name}`);
        setAttr(st.solo, "aria-label", `Solo ${c.name}`);
        st.low.set(c.fx.low);
        st.mid.set(c.fx.mid);
        st.high.set(c.fx.high);
        st.comp.set(Math.round(c.fx.comp * 100));
        st.reverb.set(Math.round(c.fx.reverb * 100));
        st.delay.set(Math.round(c.fx.delay * 100));
        st.pan.set(Math.round(c.pan * 100));
        st.volume.set(Math.round(c.volume * 100));
        setAttr(st.mute, "aria-pressed", String(c.muted));
        setAttr(st.solo, "aria-pressed", String(c.solo));
      });
      mVol.set(Math.round(p.master.volume * 100));
      mSize.set(Math.round(p.master.reverbSize * 100));
      mFeedback.set(Math.round(p.master.delayFeedback * 100));
      if (mTime.value !== p.master.delayTime) mTime.value = p.master.delayTime;
    },
  };
}
