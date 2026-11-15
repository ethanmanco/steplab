import { PIANO_ROWS, SYNTHS, isBlackKey, midiToName, midiToSpoken, rowToMidi } from "../core/notes";
import { absoluteStep, barOfStep, stepInBar } from "../core/timing";
import { SYNTH_IDS, type SynthId } from "../core/types";
import { createBarSwitch } from "./barSwitch";
import { segmented, trackHead } from "./controls";
import { h, setAttr } from "./dom";
import type { AppState } from "./store";
import { createStepGrid, wherePhrase } from "./stepGrid";

export interface MelodyActions {
  toggle(track: number, step: number, row: number): void;
  setSynth(track: number, synth: SynthId): void;
  setMute(track: number, muted: boolean): void;
  setVolume(track: number, volume: number): void;
  setEditBar(bar: number): void;
  setActive(track: number): void;
  clear(track: number): void;
}

const TRACKS = [0, 1] as const;
const trackName = (t: number) => `Melody ${t + 1}`;
/** Grid rows run top to bottom, piano-roll rows bottom to top. */
const pitchRow = (gridRow: number) => PIANO_ROWS - 1 - gridRow;

export function createMelodyPanel(actions: MelodyActions) {
  let active = 0;
  let editBar = 0;
  let lastStep = -1;

  // Tabs: one per melody track. Left and Right switch between them.
  const tabs = TRACKS.map((t) => {
    const sub = h("span", { class: "tab-sub" });
    const tab = h(
      "button",
      {
        type: "button",
        role: "tab",
        id: `melody-tab-${t}`,
        class: "tab",
        "data-track": t,
        "aria-controls": "melody-tabpanel",
        onclick: () => actions.setActive(t),
      },
      h("span", { class: "tab-name" }, trackName(t)),
      sub,
    );
    return { tab, sub };
  });
  const tablist = h("div", { class: "tabs", role: "tablist", "aria-label": "Melody tracks" });
  tabs.forEach(({ tab }) => tablist.append(tab));
  tablist.addEventListener("keydown", (e) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (active + dir + TRACKS.length) % TRACKS.length;
    actions.setActive(next);
    tabs[next]?.tab.focus();
  });

  // Per-track controls; only the active track's set is shown.
  const sounds = TRACKS.map((t) =>
    segmented<SynthId>({
      legend: "Sound",
      options: SYNTH_IDS.map((id) => ({ value: id, label: SYNTHS[id].name })),
      value: "lead",
      onChange: (id) => actions.setSynth(t, id),
      className: "seg-sound",
    }),
  );
  const heads = TRACKS.map((t) =>
    trackHead({
      name: trackName(t),
      onMute: (m) => actions.setMute(t, m),
      onVolume: (v) => actions.setVolume(t, v),
    }),
  );
  const clears = TRACKS.map((t) =>
    h(
      "button",
      { type: "button", class: "btn btn-small", onclick: () => actions.clear(t) },
      "Clear",
      h("span", { class: "sr-only" }, ` ${trackName(t)}`),
    ),
  );
  const controlSets = TRACKS.map((t) =>
    h("div", { class: "melody-controls" }, sounds[t]!.el, heads[t]!.el, clears[t]!),
  );

  // The piano roll: one key label per row, high notes on top.
  const keys = Array.from({ length: PIANO_ROWS }, () => h("div", { class: "key" }));
  const grid = createStepGrid({
    rows: keys.map((key) => ({ head: key })),
    label: "Piano roll",
    describedBy: "grid-help",
    className: "roll",
    onToggle: (row, col) => actions.toggle(active, absoluteStep(editBar, col), pitchRow(row)),
  });

  const barSwitch = createBarSwitch(actions.setEditBar);

  const tabpanel = h(
    "div",
    { id: "melody-tabpanel", role: "tabpanel", class: "melody-tabpanel" },
    ...controlSets,
    h("div", { class: "scroller roll-scroller" }, grid.el),
  );

  const el = h(
    "section",
    { class: "panel melody-panel", "aria-labelledby": "melody-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "melody-title" }, "Melody"), tablist, barSwitch.el),
    tabpanel,
  );

  function setPlayhead(step: number) {
    lastStep = step;
    barSwitch.setPlayhead(step);
    grid.setPlayhead(step >= 0 && barOfStep(step) === editBar ? stepInBar(step) : -1);
  }

  let shownSynth: SynthId | null = null;

  return {
    el,
    setPlayhead,
    update(s: AppState) {
      const { project } = s;
      active = s.activeMelody;
      editBar = s.editBar;
      barSwitch.update(s);
      el.dataset.track = String(active);

      TRACKS.forEach((t) => {
        const m = project.melodies[t]!;
        const selected = t === active;
        const tab = tabs[t]!;
        setAttr(tab.tab, "aria-selected", String(selected));
        setAttr(tab.tab, "tabindex", selected ? "0" : "-1");
        tab.sub.textContent = SYNTHS[m.synth].name;
        tab.tab.classList.toggle("is-muted", m.muted);
        controlSets[t]!.hidden = !selected;
        sounds[t]!.setValue(m.synth);
        heads[t]!.update(m);
      });
      setAttr(tabpanel, "aria-labelledby", `melody-tab-${active}`);

      const track = project.melodies[active]!;
      const name = trackName(active);
      el.classList.toggle("track-muted", track.muted);
      grid.setLabel(
        `${name} piano roll, ${SYNTHS[track.synth].name}${project.bars > 1 ? `, bar ${editBar + 1} of ${project.bars}` : ""}`,
      );

      if (shownSynth !== track.synth) {
        shownSynth = track.synth;
        keys.forEach((key, r) => {
          const midi = rowToMidi(track.synth, pitchRow(r));
          key.textContent = midiToName(midi);
          const row = grid.rows[r]!;
          row.dataset.black = String(isBlackKey(midi));
          row.dataset.c = String(midi % 12 === 0);
        });
      }

      for (let r = 0; r < PIANO_ROWS; r++) {
        const pr = pitchRow(r);
        const spoken = midiToSpoken(rowToMidi(track.synth, pr));
        for (let c = 0; c < 16; c++) {
          const on = track.notes[absoluteStep(editBar, c)]?.includes(pr) === true;
          grid.setCell(r, c, on, `${name}, ${spoken}, ${wherePhrase(project.bars, editBar, c)}, ${on ? "on" : "off"}`);
        }
      }
      setPlayhead(lastStep);
    },
  };
}
