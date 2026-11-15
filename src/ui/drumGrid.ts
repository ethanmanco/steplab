import { DRUM_NAMES } from "../core/project";
import { STEPS_PER_BAR, absoluteStep, barOfStep, stepInBar } from "../core/timing";
import type { DrumTrack, LoopBars } from "../core/types";
import { segmented, trackHead, type TrackHead } from "./controls";
import { h, setAttr } from "./dom";
import { moveInGrid } from "./gridKeys";
import type { AppState } from "./store";

export interface DrumActions {
  toggle(track: number, step: number): void;
  setMute(track: number, muted: boolean): void;
  setVolume(track: number, volume: number): void;
  setEditBar(bar: number): void;
  clear(): void;
}

export function stepLabel(name: string, bars: LoopBars, bar: number, col: number, on: boolean): string {
  const where = bars > 1 ? `bar ${bar + 1}, step ${col + 1}` : `step ${col + 1}`;
  return `${name}, ${where}, ${on ? "on" : "off"}`;
}

export function createDrumGrid(initial: DrumTrack[], actions: DrumActions) {
  const rows = initial.length;
  const cells: HTMLButtonElement[][] = [];
  const heads: TrackHead[] = [];
  let focus = { row: 0, col: 0 };
  let editBar = 0;
  let lastStep = -1;
  let nowCol = -1;

  const barSwitch = segmented<number>({
    legend: "Bar",
    options: [0, 1, 2, 3].map((b) => ({ value: b, label: String(b + 1), title: `Edit bar ${b + 1}` })),
    value: 0,
    onChange: (b) => actions.setEditBar(b),
    className: "seg-editbar",
  });

  const ruler = h("div", { class: "ruler", "aria-hidden": "true" }, h("div", { class: "ruler-corner" }));
  const rulerNums: HTMLElement[] = [];
  const rulerCells = h("div", { class: "cells" });
  for (let c = 0; c < STEPS_PER_BAR; c++) {
    const n = h("span", { class: `ruler-num${c % 4 === 0 ? " beat" : ""}` }, String(c + 1));
    rulerNums.push(n);
    rulerCells.append(n);
  }
  ruler.append(rulerCells);

  const grid = h("div", {
    class: "grid",
    role: "group",
    "aria-label": "Drum steps",
    "aria-describedby": "grid-help",
  });
  grid.append(ruler);

  initial.forEach((track, r) => {
    const name = DRUM_NAMES[track.id];
    const head = trackHead({
      name,
      onMute: (m) => actions.setMute(r, m),
      onVolume: (v) => actions.setVolume(r, v),
    });
    heads.push(head);
    const rowCells = h("div", { class: "cells" });
    const btns: HTMLButtonElement[] = [];
    for (let c = 0; c < STEPS_PER_BAR; c++) {
      const b = h("button", {
        type: "button",
        class: `cell${c % 4 === 0 ? " beat" : ""}${Math.floor(c / 4) % 2 === 1 ? " alt" : ""}`,
        tabindex: r === 0 && c === 0 ? 0 : -1,
        "data-row": r,
        "data-col": c,
      });
      btns.push(b);
      rowCells.append(b);
    }
    cells.push(btns);
    grid.append(h("div", { class: "row", "data-id": track.id }, head.el, rowCells));
  });

  grid.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.cell");
    if (!b) return;
    const row = Number(b.dataset.row);
    const col = Number(b.dataset.col);
    setFocus(row, col, false);
    actions.toggle(row, absoluteStep(editBar, col));
  });

  grid.addEventListener("keydown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.cell");
    if (!b) return;
    const next = moveInGrid(
      { row: Number(b.dataset.row), col: Number(b.dataset.col) },
      e.key,
      rows,
      STEPS_PER_BAR,
      e.ctrlKey || e.metaKey,
    );
    if (!next) return;
    e.preventDefault();
    setFocus(next.row, next.col, true);
  });

  function setFocus(row: number, col: number, move: boolean) {
    cells[focus.row]?.[focus.col]?.setAttribute("tabindex", "-1");
    focus = { row, col };
    const target = cells[row]?.[col];
    if (!target) return;
    target.setAttribute("tabindex", "0");
    if (move) target.focus();
  }

  function markColumn(col: number) {
    if (col === nowCol) return;
    if (nowCol >= 0) {
      rulerNums[nowCol]?.classList.remove("now");
      cells.forEach((r) => r[nowCol]?.classList.remove("now"));
    }
    nowCol = col;
    if (col >= 0) {
      rulerNums[col]?.classList.add("now");
      cells.forEach((r) => r[col]?.classList.add("now"));
    }
  }

  function setPlayhead(step: number) {
    lastStep = step;
    barSwitch.setMarked(step < 0 ? null : barOfStep(step));
    markColumn(step >= 0 && barOfStep(step) === editBar ? stepInBar(step) : -1);
  }

  const help = h(
    "p",
    { id: "grid-help", class: "sr-only" },
    "Arrow keys move between steps. Space or Enter turns a step on or off.",
  );

  const clearBtn = h("button", { type: "button", class: "btn btn-small", onclick: () => actions.clear() }, "Clear");

  const el = h(
    "section",
    { class: "panel", "aria-labelledby": "drums-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "drums-title" }, "Drums"), barSwitch.el, clearBtn),
    help,
    h("div", { class: "scroller" }, grid),
  );

  return {
    el,
    setPlayhead,
    update(s: AppState) {
      const { project } = s;
      editBar = s.editBar;
      const avail = [0, 1, 2, 3].filter((b) => b < project.bars);
      barSwitch.setAvailable(avail);
      barSwitch.setValue(editBar);
      barSwitch.el.hidden = project.bars === 1;
      setAttr(
        grid,
        "aria-label",
        project.bars > 1 ? `Drum steps, bar ${editBar + 1} of ${project.bars}` : "Drum steps",
      );
      project.drums.forEach((track, r) => {
        heads[r]?.update(track);
        const name = DRUM_NAMES[track.id];
        cells[r]?.forEach((b, c) => {
          const on = track.steps[absoluteStep(editBar, c)] === true;
          b.classList.toggle("on", on);
          setAttr(b, "aria-label", stepLabel(name, project.bars, editBar, c, on));
        });
      });
      setPlayhead(lastStep);
    },
  };
}
