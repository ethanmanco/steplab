import { SYNTHS } from "../core/notes";
import { DRUM_NAMES, findChannel, soundName } from "../core/project";
import { audibleChannels } from "../core/schedule";
import { DRUM_IDS, SYNTH_IDS, type Channel, type DrumId, type Project, type SynthId } from "../core/types";
import { trackHead, type TrackHead } from "./controls";
import { h, setAttr } from "./dom";
import type { AppState } from "./store";

export interface SidebarActions {
  addChannel(kind: "drum" | "synth", sound: DrumId | SynthId): void;
  removeChannel(id: string): void;
  renameChannel(id: string): void;
  setChannelSound(id: string, sound: DrumId | SynthId): void;
  setMute(id: string, muted: boolean): void;
  setSolo(id: string, solo: boolean): void;
  setVolume(id: string, volume: number): void;
  addKit808(): void;
  newDrums(): void;
  newMelody(): void;
  selectPattern(id: string): void;
  editPattern(id: string): void;
  placePattern(id: string): void;
  duplicatePattern(id: string): void;
  deletePattern(id: string): void;
}

interface ChannelRow {
  el: HTMLElement;
  name: HTMLButtonElement;
  sound: HTMLSelectElement;
  remove: HTMLButtonElement;
  head: TrackHead;
}

function soundOptions(kind: "drum" | "synth") {
  return kind === "drum"
    ? DRUM_IDS.map((d) => h("option", { value: d }, DRUM_NAMES[d]))
    : SYNTH_IDS.map((s) => h("option", { value: s }, SYNTHS[s].name));
}

/** The channel rack and pattern list, side by side with the playlist. */
export function createSidebar(actions: SidebarActions) {
  /* ---------- Channel rack ---------- */
  const rows = new Map<string, ChannelRow>();
  const list = h("ul", { class: "channel-list", role: "list" });

  function makeRow(ch: Channel): ChannelRow {
    const name = h("button", {
      type: "button",
      class: "channel-name",
      title: "Rename",
      onclick: () => actions.renameChannel(ch.id),
    });
    const sound = h(
      "select",
      { class: "select select-small", onchange: () => actions.setChannelSound(ch.id, sound.value as DrumId | SynthId) },
      ...soundOptions(ch.kind),
    );
    const remove = h("button", { type: "button", class: "mini", onclick: () => actions.removeChannel(ch.id) }, "×");
    const head = trackHead({
      name: ch.name,
      onMute: (m) => actions.setMute(ch.id, m),
      onSolo: (s) => actions.setSolo(ch.id, s),
      onVolume: (v) => actions.setVolume(ch.id, v),
    });
    const el = h(
      "li",
      { class: "channel", "data-sound": ch.sound, "data-kind": ch.kind },
      h("div", { class: "channel-top" }, h("span", { class: "swatch", "aria-hidden": "true" }), name, sound, remove),
      head.el,
    );
    return { el, name, sound, remove, head };
  }

  const addSelect = h(
    "select",
    { class: "select", "aria-label": "Sound for the new channel" },
    h("optgroup", { label: "Drums" }, ...DRUM_IDS.map((d) => h("option", { value: `drum:${d}` }, DRUM_NAMES[d]))),
    h("optgroup", { label: "Synths" }, ...SYNTH_IDS.map((s) => h("option", { value: `synth:${s}` }, SYNTHS[s].name))),
  );
  const addBtn = h(
    "button",
    {
      type: "button",
      class: "btn btn-small",
      onclick: () => {
        const [kind, sound] = addSelect.value.split(":") as ["drum" | "synth", DrumId | SynthId];
        actions.addChannel(kind, sound);
      },
    },
    "Add channel",
  );

  const rack = h(
    "section",
    { class: "panel side-panel", "aria-labelledby": "rack-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "rack-title" }, "Channels")),
    list,
    h(
      "div",
      { class: "side-add" },
      addSelect,
      addBtn,
      h("button", { type: "button", class: "btn btn-small", title: "Add any 808 kit sounds this song does not have yet", onclick: () => actions.addKit808() }, "Add 808 kit"),
    ),
  );

  /* ---------- Pattern list ---------- */
  const patList = h("ul", { class: "pattern-list", role: "list" });
  const patterns = h(
    "section",
    { class: "panel side-panel", "aria-labelledby": "patterns-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "patterns-title" }, "Patterns")),
    patList,
    h(
      "div",
      { class: "side-add" },
      h("button", { type: "button", class: "btn btn-small", onclick: () => actions.newDrums() }, "New drum loop"),
      h("button", { type: "button", class: "btn btn-small", onclick: () => actions.newMelody() }, "New melody"),
    ),
  );

  let shownPatterns: unknown = null;
  let shownCurrent: string | null = null;

  function renderPatterns(p: Project, current: string | null) {
    if (shownPatterns === p.patterns && shownCurrent === current && patList.childElementCount) return;
    shownPatterns = p.patterns;
    shownCurrent = current;
    const hadFocus = patList.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.focusKey
      : undefined;
    patList.replaceChildren(
      ...p.patterns.map((pat) => {
        const ch = pat.kind === "melody" ? findChannel(p, pat.channelId) : undefined;
        const sub = pat.kind === "drums" ? "Drum loop" : `Melody, ${ch?.name ?? "no channel"}`;
        const small = (text: string, label: string, key: string, fn: () => void) =>
          h("button", { type: "button", class: "mini", "aria-label": label, title: label, "data-focus-key": `${pat.id}:${key}`, onclick: fn }, text);
        return h(
          "li",
          {
            class: `pattern${pat.id === current ? " is-current" : ""}`,
            "data-kind": pat.kind,
            "data-sound": ch?.sound ?? "drums",
          },
          h(
            "button",
            {
              type: "button",
              class: "pattern-main",
              "aria-pressed": String(pat.id === current),
              "data-focus-key": `${pat.id}:main`,
              title: "Select. Double-click to edit.",
              onclick: () => actions.selectPattern(pat.id),
              ondblclick: () => actions.editPattern(pat.id),
            },
            h("span", { class: "swatch", "aria-hidden": "true" }),
            h("span", { class: "pattern-name" }, pat.name),
            h("span", { class: "pattern-sub" }, `${sub}, ${pat.bars} bar${pat.bars === 1 ? "" : "s"}`),
          ),
          h(
            "span",
            { class: "pattern-tools" },
            small("Edit", `Edit ${pat.name}`, "edit", () => actions.editPattern(pat.id)),
            small("+", `Add ${pat.name} to the playlist`, "place", () => actions.placePattern(pat.id)),
            small("Copy", `Make a copy of ${pat.name}`, "copy", () => actions.duplicatePattern(pat.id)),
            small("×", `Delete ${pat.name}`, "delete", () => actions.deletePattern(pat.id)),
          ),
        );
      }),
    );
    if (hadFocus) patList.querySelector<HTMLElement>(`[data-focus-key="${hadFocus}"]`)?.focus();
  }

  return {
    el: h("div", { class: "sidebar" }, patterns, rack),
    /** F6: put focus in the channel rack. */
    focusRack() {
      (list.querySelector(".channel-name") as HTMLElement | null)?.focus();
      rack.scrollIntoView({ block: "nearest" });
    },
    update(s: AppState) {
      const p = s.project;
      const audible = audibleChannels(p);
      const synthCount = p.channels.filter((c) => c.kind === "synth").length;
      // Keep row elements per channel id, so focus survives updates.
      const ids = new Set(p.channels.map((c) => c.id));
      for (const [id, row] of rows) {
        if (!ids.has(id)) {
          row.el.remove();
          rows.delete(id);
        }
      }
      p.channels.forEach((ch, i) => {
        let row = rows.get(ch.id);
        if (!row) {
          row = makeRow(ch);
          rows.set(ch.id, row);
        }
        if (list.children[i] !== row.el) list.insertBefore(row.el, list.children[i] ?? null);
        if (row.name.textContent !== ch.name) row.name.textContent = ch.name;
        setAttr(row.name, "aria-label", `${ch.name}, rename`);
        setAttr(row.sound, "aria-label", `${ch.name} sound`);
        if (row.sound.value !== ch.sound) row.sound.value = ch.sound;
        setAttr(row.remove, "aria-label", `Remove ${ch.name}`);
        setAttr(row.remove, "title", ch.kind === "synth" && synthCount === 1 ? "The last synth channel stays" : `Remove ${ch.name}`);
        row.remove.disabled = ch.kind === "synth" && synthCount === 1;
        row.el.dataset.sound = ch.sound;
        row.el.classList.toggle("silent", !audible.has(ch.id));
        row.head.update(ch, ch.name);
        if (soundName(ch) !== ch.name) row.el.title = `${ch.name} (${soundName(ch)})`;
      });
      renderPatterns(p, s.current);
    },
  };
}
