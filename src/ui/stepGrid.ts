import { h, setAttr } from "./dom";
import { moveInGrid } from "./gridKeys";

export interface StepGridRow {
  head: HTMLElement;
  attrs?: Record<string, string>;
}

export interface GridLayout {
  total: number;
  stepsPerBar: number;
  pulse: number;
}

/** What a cell shows: empty, a hit or note start, a held note, its last step, or the other track's note. */
export type CellState = "off" | "on" | "held" | "ghost";

export interface GridHandlers {
  /** Keyboard (Enter or Space) or a tap on a touch screen. */
  activate(row: number, col: number): void;
  /** Mouse press and drag across cells, for painting steps or drawing note lengths. */
  paintStart?(row: number, col: number): void;
  paintMove?(row: number, col: number): void;
  paintEnd?(): void;
  /** Shift with Left or Right, for changing a note's length. */
  nudge?(row: number, col: number, dir: 1 | -1): void;
}

/**
 * One long grid of step buttons with a sticky row header and ruler, covering
 * the whole loop. It scrolls sideways (and up and down for the piano roll)
 * instead of paging through bars. One Tab stop (roving tabindex), arrow keys
 * move, and a mouse can paint across cells.
 */
export function createStepGrid(opts: {
  rows: StepGridRow[];
  label: string;
  describedBy: string;
  className?: string;
  handlers: GridHandlers;
}) {
  const { handlers } = opts;
  let cells: HTMLButtonElement[][] = [];
  let cache: string[][] = [];
  let rulerNums: HTMLElement[] = [];
  let layout: GridLayout = { total: 0, stepsPerBar: 16, pulse: 4 };
  let focus = { row: 0, col: 0 };
  let nowCol = -1;

  const rulerCells = h("div", { class: "cells" });
  const ruler = h("div", { class: "ruler", "aria-hidden": "true" }, h("div", { class: "ruler-corner" }), rulerCells);
  const el = h("div", {
    class: `grid ${opts.className ?? ""}`,
    role: "group",
    "aria-label": opts.label,
    "aria-describedby": opts.describedBy,
  });
  el.append(ruler);
  const rowCells = opts.rows.map((spec) => {
    const c = h("div", { class: "cells" });
    el.append(h("div", { class: "row", ...spec.attrs }, spec.head, c));
    return c;
  });
  const rowEls = Array.from(el.querySelectorAll<HTMLElement>(":scope > .row"));
  const scroller = h("div", { class: "scroller" }, el);

  function colClass(c: number): string {
    const inBar = c % layout.stepsPerBar;
    let cls = "";
    if (inBar === 0) cls += " bar";
    else if (inBar % layout.pulse === 0) cls += " beat";
    if (Math.floor(inBar / layout.pulse) % 2 === 1) cls += " alt";
    return cls;
  }

  /** Rebuild the columns for a new loop length or time signature. */
  function setLayout(next: GridLayout) {
    if (next.total === layout.total && next.stepsPerBar === layout.stepsPerBar && next.pulse === layout.pulse) return;
    layout = next;
    nowCol = -1;
    rulerNums = [];
    const ruleFrag = document.createDocumentFragment();
    for (let c = 0; c < layout.total; c++) {
      const inBar = c % layout.stepsPerBar;
      const bar = Math.floor(c / layout.stepsPerBar) + 1;
      const text = inBar === 0 ? String(bar) : inBar % layout.pulse === 0 ? `.${inBar / layout.pulse + 1}` : "";
      const n = h("span", { class: `ruler-num${colClass(c)}` }, text);
      rulerNums.push(n);
      ruleFrag.append(n);
    }
    rulerCells.replaceChildren(ruleFrag);

    cells = rowCells.map((container, r) => {
      const frag = document.createDocumentFragment();
      const btns: HTMLButtonElement[] = [];
      for (let c = 0; c < layout.total; c++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `cell${colClass(c)}`;
        b.tabIndex = -1;
        b.dataset.row = String(r);
        b.dataset.col = String(c);
        btns.push(b);
        frag.append(b);
      }
      container.replaceChildren(frag);
      return btns;
    });
    cache = cells.map((r) => r.map(() => ""));
    focus = { row: Math.min(focus.row, cells.length - 1), col: Math.min(focus.col, layout.total - 1) };
    cells[focus.row]?.[focus.col]?.setAttribute("tabindex", "0");
  }

  function setFocus(row: number, col: number, move: boolean) {
    cells[focus.row]?.[focus.col]?.setAttribute("tabindex", "-1");
    focus = { row, col };
    const target = cells[row]?.[col];
    if (!target) return;
    target.setAttribute("tabindex", "0");
    if (move) target.focus();
  }

  const cellFrom = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLButtonElement>("button.cell") : null;
  const pos = (b: HTMLButtonElement) => ({ row: Number(b.dataset.row), col: Number(b.dataset.col) });

  // Mouse and pen paint by dragging. Touch keeps native scrolling and
  // toggles on tap through the click event instead.
  let painting = false;
  let lastPointer = "mouse";
  let lastKey = "";
  el.addEventListener("pointerdown", (e) => {
    lastPointer = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0 || !handlers.paintStart) return;
    const b = cellFrom(e.target);
    if (!b) return;
    e.preventDefault();
    const p = pos(b);
    setFocus(p.row, p.col, true);
    painting = true;
    lastKey = `${p.row}:${p.col}`;
    handlers.paintStart(p.row, p.col);
  });
  window.addEventListener("pointermove", (e) => {
    if (!painting) return;
    const b = cellFrom(document.elementFromPoint(e.clientX, e.clientY));
    if (!b || !el.contains(b)) return;
    const p = pos(b);
    const key = `${p.row}:${p.col}`;
    if (key === lastKey) return;
    lastKey = key;
    handlers.paintMove?.(p.row, p.col);
  });
  const endPaint = () => {
    if (!painting) return;
    painting = false;
    handlers.paintEnd?.();
  };
  window.addEventListener("pointerup", endPaint);
  window.addEventListener("pointercancel", endPaint);

  el.addEventListener("click", (e) => {
    const b = cellFrom(e.target);
    if (!b) return;
    // Mouse clicks were already handled as a one-cell paint.
    if (e.detail > 0 && lastPointer !== "touch" && handlers.paintStart) return;
    const p = pos(b);
    setFocus(p.row, p.col, false);
    handlers.activate(p.row, p.col);
  });

  el.addEventListener("keydown", (e) => {
    const b = cellFrom(e.target);
    if (!b) return;
    const p = pos(b);
    if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && handlers.nudge) {
      e.preventDefault();
      handlers.nudge(p.row, p.col, e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    const next = moveInGrid(p, e.key, cells.length, layout.total, e.ctrlKey || e.metaKey);
    if (!next) return;
    e.preventDefault();
    setFocus(next.row, next.col, true);
  });

  return {
    el,
    scroller,
    rows: rowEls,
    setLayout,
    setLabel: (label: string) => setAttr(el, "aria-label", label),
    /** Update one cell; skipped when nothing changed, so big grids stay fast. */
    setCell(row: number, col: number, state: CellState, label: string, end = false) {
      const key = `${state}${end ? "!" : ""}|${label}`;
      const rowCache = cache[row];
      if (!rowCache || rowCache[col] === key) return;
      rowCache[col] = key;
      const b = cells[row]?.[col];
      if (!b) return;
      b.classList.toggle("on", state === "on");
      b.classList.toggle("held", state === "held");
      b.classList.toggle("ghost", state === "ghost");
      b.classList.toggle("end", end);
      b.setAttribute("aria-label", label);
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
    /** Scroll sideways so a column is in view, leaving room before it. */
    reveal(col: number, smooth: boolean) {
      const n = rulerNums[col];
      if (!n) return;
      const head = (el.querySelector(".ruler-corner") as HTMLElement | null)?.offsetWidth ?? 0;
      const left = n.offsetLeft - head;
      const visible = scroller.clientWidth - head;
      const x = scroller.scrollLeft;
      if (left < x || left + n.offsetWidth > x + visible) {
        scroller.scrollTo({ left: Math.max(0, left - 8), behavior: smooth ? "smooth" : "auto" });
      }
    },
    focusCell: (row: number, col: number) => setFocus(row, col, false),
    get layout() {
      return layout;
    },
  };
}

export type StepGrid = ReturnType<typeof createStepGrid>;

/** "bar 2, step 5" when the loop has several bars, "step 5" otherwise. */
export function wherePhrase(bars: number, bar: number, inBar: number): string {
  return bars > 1 ? `bar ${bar + 1}, step ${inBar + 1}` : `step ${inBar + 1}`;
}
