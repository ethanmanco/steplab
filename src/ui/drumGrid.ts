import { DRUM_NAMES } from "../core/project";
import { audibleTracks } from "../core/schedule";
import { loopSteps, pulseSteps, stepPosition, stepsPerBar } from "../core/timing";
import type { DrumTrack, Project } from "../core/types";
import { trackHead } from "./controls";
import { h } from "./dom";
import { createStepGrid, wherePhrase } from "./stepGrid";

export interface DrumActions {
  /** Set one step on or off. `group` merges a drag into one undo step. */
  setStep(track: number, step: number, on: boolean, group: string | null): void;
  setMute(track: number, muted: boolean): void;
  setSolo(track: number, solo: boolean): void;
  setVolume(track: number, volume: number): void;
  clear(): void;
}

export function createDrumGrid(initial: DrumTrack[], getProject: () => Project, actions: DrumActions) {
  let paintValue = true;
  let paintGroup = "";
  let paintCount = 0;

  const heads = initial.map((track, r) =>
    trackHead({
      name: DRUM_NAMES[track.id],
      onMute: (m) => actions.setMute(r, m),
      onSolo: (s) => actions.setSolo(r, s),
      onVolume: (v) => actions.setVolume(r, v),
    }),
  );

  const isOn = (row: number, col: number) => getProject().drums[row]?.steps.includes(col) ?? false;

  const grid = createStepGrid({
    rows: initial.map((track, r) => ({ head: heads[r]!.el, attrs: { "data-id": track.id } })),
    label: "Drum steps",
    describedBy: "grid-help",
    handlers: {
      activate: (row, col) => actions.setStep(row, col, !isOn(row, col), null),
      // Dragging paints: the first cell decides whether the drag adds or erases.
      paintStart: (row, col) => {
        paintValue = !isOn(row, col);
        paintGroup = `paint-${++paintCount}`;
        actions.setStep(row, col, paintValue, paintGroup);
      },
      paintMove: (row, col) => actions.setStep(row, col, paintValue, paintGroup),
    },
  });

  const clearBtn = h(
    "button",
    { type: "button", class: "btn btn-small", onclick: () => actions.clear() },
    "Clear",
    h("span", { class: "sr-only" }, " drums"),
  );

  const el = h(
    "section",
    { class: "panel", "aria-labelledby": "drums-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "drums-title" }, "Drums"), clearBtn),
    grid.scroller,
  );

  let shown: { drums: DrumTrack[]; bars: number; sig: string } | null = null;

  return {
    el,
    grid,
    update(project: Project) {
      const total = loopSteps(project.bars, project.timeSig);
      grid.setLayout({ total, stepsPerBar: stepsPerBar(project.timeSig), pulse: pulseSteps(project.timeSig) });
      const audible = audibleTracks(project);
      project.drums.forEach((track, r) => {
        heads[r]?.update(track);
        grid.rows[r]?.classList.toggle("silent", !audible.drums[r]);
      });
      const sig = `${project.timeSig.beats}/${project.timeSig.unit}`;
      if (shown && shown.drums === project.drums && shown.bars === project.bars && shown.sig === sig) return;
      shown = { drums: project.drums, bars: project.bars, sig };
      project.drums.forEach((track, r) => {
        const name = DRUM_NAMES[track.id];
        const on = new Set(track.steps);
        for (let c = 0; c < total; c++) {
          const hit = on.has(c);
          const { bar, inBar } = stepPosition(c, project.timeSig);
          grid.setCell(r, c, hit ? "on" : "off", `${name}, ${wherePhrase(project.bars, bar, inBar)}, ${hit ? "on" : "off"}`);
        }
      });
    },
  };
}
