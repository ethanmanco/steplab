import { DRUM_NAMES } from "../core/project";
import { absoluteStep, barOfStep, stepInBar } from "../core/timing";
import type { DrumTrack } from "../core/types";
import { createBarSwitch } from "./barSwitch";
import { trackHead } from "./controls";
import { h } from "./dom";
import type { AppState } from "./store";
import { createStepGrid, wherePhrase } from "./stepGrid";

export interface DrumActions {
  toggle(track: number, step: number): void;
  setMute(track: number, muted: boolean): void;
  setVolume(track: number, volume: number): void;
  setEditBar(bar: number): void;
  clear(): void;
}

export function createDrumGrid(initial: DrumTrack[], actions: DrumActions) {
  let editBar = 0;
  let lastStep = -1;

  const heads = initial.map((track, r) =>
    trackHead({
      name: DRUM_NAMES[track.id],
      onMute: (m) => actions.setMute(r, m),
      onVolume: (v) => actions.setVolume(r, v),
    }),
  );

  const grid = createStepGrid({
    rows: initial.map((track, r) => ({ head: heads[r]!.el, attrs: { "data-id": track.id } })),
    label: "Drum steps",
    describedBy: "grid-help",
    onToggle: (row, col) => actions.toggle(row, absoluteStep(editBar, col)),
  });

  const barSwitch = createBarSwitch(actions.setEditBar);
  const clearBtn = h(
    "button",
    { type: "button", class: "btn btn-small", onclick: () => actions.clear() },
    "Clear",
    h("span", { class: "sr-only" }, " drums"),
  );

  const el = h(
    "section",
    { class: "panel", "aria-labelledby": "drums-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "drums-title" }, "Drums"), barSwitch.el, clearBtn),
    h("div", { class: "scroller" }, grid.el),
  );

  function setPlayhead(step: number) {
    lastStep = step;
    barSwitch.setPlayhead(step);
    grid.setPlayhead(step >= 0 && barOfStep(step) === editBar ? stepInBar(step) : -1);
  }

  return {
    el,
    setPlayhead,
    update(s: AppState) {
      const { project } = s;
      editBar = s.editBar;
      barSwitch.update(s);
      grid.setLabel(project.bars > 1 ? `Drum steps, bar ${editBar + 1} of ${project.bars}` : "Drum steps");
      project.drums.forEach((track, r) => {
        heads[r]?.update(track);
        const name = DRUM_NAMES[track.id];
        for (let c = 0; c < 16; c++) {
          const on = track.steps[absoluteStep(editBar, c)] === true;
          grid.setCell(r, c, on, `${name}, ${wherePhrase(project.bars, editBar, c)}, ${on ? "on" : "off"}`);
        }
      });
      setPlayhead(lastStep);
    },
  };
}
