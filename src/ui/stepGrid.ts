import { STEPS_PER_BAR } from "../core/timing";
import { h, setAttr } from "./dom";
import { moveInGrid } from "./gridKeys";

export interface StepGridRow {
  head: HTMLElement;
  attrs?: Record<string, string>;
}

/**
 * A grid of 16 step buttons per row with a sticky row header, a step ruler,
 * one Tab stop (roving tabindex), arrow key movement and a playhead column.
 * Both the drum sequencer and the piano roll are built from it.
 */
export function createStepGrid(opts: {
  rows: StepGridRow[];
  label: string;
  describedBy: string;
  className?: string;
  onToggle: (row: number, col: number) => void;
}) {
  const cells: HTMLButtonElement[][] = [];
  const rowEls: HTMLElement[] = [];
  let focus = { row: 0, col: 0 };
  let nowCol = -1;

  const rulerNums: HTMLElement[] = [];
  const rulerCells = h("div", { class: "cells" });
  for (let c = 0; c < STEPS_PER_BAR; c++) {
    const n = h("span", { class: `ruler-num${c % 4 === 0 ? " beat" : ""}` }, String(c + 1));
    rulerNums.push(n);
    rulerCells.append(n);
  }
  const ruler = h("div", { class: "ruler", "aria-hidden": "true" }, h("div", { class: "ruler-corner" }), rulerCells);

  const el = h("div", {
    class: `grid ${opts.className ?? ""}`,
    role: "group",
    "aria-label": opts.label,
    "aria-describedby": opts.describedBy,
  });
  el.append(ruler);

  opts.rows.forEach((spec, r) => {
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
    const row = h("div", { class: "row", ...spec.attrs }, spec.head, rowCells);
    rowEls.push(row);
    el.append(row);
  });

  function setFocus(row: number, col: number, move: boolean) {
    cells[focus.row]?.[focus.col]?.setAttribute("tabindex", "-1");
    focus = { row, col };
    const target = cells[row]?.[col];
    if (!target) return;
    target.setAttribute("tabindex", "0");
    if (move) target.focus();
  }

  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.cell");
    if (!b) return;
    const row = Number(b.dataset.row);
    const col = Number(b.dataset.col);
    setFocus(row, col, false);
    opts.onToggle(row, col);
  });

  el.addEventListener("keydown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.cell");
    if (!b) return;
    const next = moveInGrid(
      { row: Number(b.dataset.row), col: Number(b.dataset.col) },
      e.key,
      cells.length,
      STEPS_PER_BAR,
      e.ctrlKey || e.metaKey,
    );
    if (!next) return;
    e.preventDefault();
    setFocus(next.row, next.col, true);
  });

  return {
    el,
    rows: rowEls,
    setLabel: (label: string) => setAttr(el, "aria-label", label),
    setCell(row: number, col: number, on: boolean, label: string) {
      const b = cells[row]?.[col];
      if (!b) return;
      b.classList.toggle("on", on);
      setAttr(b, "aria-label", label);
    },
    /** Highlight one column as the playhead, or none with -1. */
    setPlayhead(col: number) {
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
    },
  };
}

export type StepGrid = ReturnType<typeof createStepGrid>;

/** "bar 2, step 5" when the loop has several bars, "step 5" otherwise. */
export function wherePhrase(bars: number, bar: number, col: number): string {
  return bars > 1 ? `bar ${bar + 1}, step ${col + 1}` : `step ${col + 1}`;
}
