import { ROLL_HIGH, ROLL_LOW } from "../core/notes";
import { MAX_SONG_STEPS, findChannel, findPattern, patternSteps, songSteps } from "../core/project";
import { pulseSteps, stepsPerBar } from "../core/timing";
import type { Clip, Pattern, Project } from "../core/types";
import { segmented, toggle } from "./controls";
import { h, setAttr } from "./dom";
import type { AppState, Prefs } from "./store";

export interface PlaylistActions {
  select(clipId: string | null): void;
  placeAt(track: number, start: number): void;
  move(clipId: string, track: number, start: number, group: string | null): void;
  resize(clipId: string, length: number, group: string | null): void;
  remove(clipId: string): void;
  duplicate(clipId: string): void;
  open(clipId: string): void;
  seek(step: number): void;
  addTrack(): void;
  setBarWidth(px: number): void;
  setFollow(on: boolean): void;
  setSnap(snap: Prefs["snap"]): void;
  copy(clipId: string): void;
  paste(): void;
}

const LANE_H = 48;
const LABEL_W = 84;

/** A tiny picture of a pattern, drawn once and tiled across its clips. */
function previewSvg(p: Project, pat: Pattern, stepW: number): string {
  const steps = patternSteps(pat, p.timeSig);
  const w = Math.max(1, steps * stepW);
  const H = 30;
  let rects = "";
  if (pat.kind === "drums") {
    const chans = p.channels.filter((c) => c.kind === "drum");
    const rowH = H / Math.max(1, chans.length);
    chans.forEach((c, r) => {
      for (const s of pat.rows[c.id] ?? []) {
        if (s >= steps) continue;
        rects += `<rect x="${(s * stepW).toFixed(1)}" y="${(r * rowH + rowH * 0.15).toFixed(1)}" width="${Math.max(1.5, stepW * 0.7).toFixed(1)}" height="${Math.max(1.5, rowH * 0.7).toFixed(1)}" rx="1"/>`;
      }
    });
  } else if (pat.notes.length) {
    const pitches = pat.notes.map((n) => n.pitch);
    const lo = Math.max(ROLL_LOW, Math.min(...pitches) - 2);
    const hi = Math.min(ROLL_HIGH, Math.max(...pitches) + 2);
    const span = Math.max(8, hi - lo + 1);
    const rowH = H / span;
    for (const n of pat.notes) {
      if (n.step >= steps) continue;
      const y = (hi - n.pitch) * rowH;
      const len = Math.min(n.length, steps - n.step) * stepW;
      rects += `<rect x="${(n.step * stepW).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1.5, len - 1).toFixed(1)}" height="${Math.max(2, rowH).toFixed(1)}" rx="1"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" fill="rgba(255,255,255,0.75)">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function createPlaylist(getState: () => AppState, actions: PlaylistActions) {
  const zoom = h("input", {
    type: "range",
    min: 32,
    max: 240,
    step: 4,
    "aria-label": "Playlist zoom",
    oninput: () => actions.setBarWidth(Number(zoom.value)),
  });
  const follow = toggle({ label: "Follow", title: "Scroll along with the playhead", onChange: actions.setFollow });
  const snapSeg = segmented<Prefs["snap"]>({
    legend: "Snap",
    options: [
      { value: "bar", label: "Bar", title: "Clips snap to bars" },
      { value: "beat", label: "Beat", title: "Clips snap to beats" },
      { value: "step", label: "Step", title: "Clips snap to sixteenth steps" },
    ],
    value: "bar",
    onChange: actions.setSnap,
  });
  const addTrackBtn = h("button", { type: "button", class: "btn btn-small", onclick: () => actions.addTrack() }, "Add track");

  // Buttons for the selected clip: the touch and screen reader way to edit.
  const sel = () => getState().selectedClip;
  const clipOf = () => getState().project.clips.find((c) => c.id === sel());
  /** The snap size in steps. Holding Alt bypasses snapping, as in FL Studio. */
  const unit = (noSnap = false) => {
    const { project, prefs } = getState();
    if (noSnap || prefs.snap === "step") return 1;
    return prefs.snap === "beat" ? pulseSteps(project.timeSig) : stepsPerBar(project.timeSig);
  };
  const tool = (text: string, label: string, fn: (c: Clip) => void) => {
    const b = h("button", { type: "button", class: "mini tool", "aria-label": label, title: label }, text);
    b.addEventListener("click", () => {
      const c = clipOf();
      if (c) fn(c);
    });
    return b;
  };
  const tools = [
    tool("Edit", "Edit the pattern", (c) => actions.open(c.id)),
    tool("Copy", "Duplicate the clip (Ctrl+B)", (c) => actions.duplicate(c.id)),
    tool("Delete", "Delete the clip (Delete)", (c) => actions.remove(c.id)),
    tool("◀", "Move earlier by the snap size (Left)", (c) => actions.move(c.id, c.track, Math.max(0, c.start - unit()), null)),
    tool("▶", "Move later by the snap size (Right)", (c) => actions.move(c.id, c.track, c.start + unit(), null)),
    tool("▲", "Move up a track (Up)", (c) => actions.move(c.id, c.track - 1, c.start, null)),
    tool("▼", "Move down a track (Down)", (c) => actions.move(c.id, c.track + 1, c.start, null)),
    tool("Shorter", "Shorter by the snap size ([)", (c) => actions.resize(c.id, Math.max(1, c.length - unit()), null)),
    tool("Longer", "Longer by the snap size (])", (c) => actions.resize(c.id, c.length + unit(), null)),
  ];
  const selLabel = h("span", { class: "sel-label", "aria-live": "polite" });
  const toolbar = h("div", { class: "clip-toolbar", role: "toolbar", "aria-label": "Selected clip" }, selLabel, ...tools);

  const ruler = h("div", { class: "pl-ruler", title: "Click to move the playhead" });
  const lanes = h("div", { class: "pl-lanes" });
  const playhead = h("div", { class: "pl-playhead", "aria-hidden": "true" });
  const endMark = h("div", { class: "pl-end", "aria-hidden": "true" });
  const canvas = h("div", { class: "pl-canvas" }, ruler, lanes, endMark, playhead);
  const scroller = h("div", { class: "pl-scroller" }, canvas);

  const el = h(
    "section",
    { class: "panel playlist", "aria-labelledby": "playlist-title" },
    h(
      "div",
      { class: "panel-head" },
      h("h2", { id: "playlist-title" }, "Playlist"),
      snapSeg.el,
      h("span", { class: "view-controls" }, h("span", { class: "field-label", "aria-hidden": "true" }, "Zoom"), zoom, follow.el),
      addTrackBtn,
    ),
    h(
      "p",
      { id: "playlist-help", class: "pl-help" },
      "Click an empty spot to place the selected pattern. Drag clips to move them (hold Alt to skip snapping), drag their right edge to stretch them, double-click to edit, right-click to delete. Ctrl+wheel zooms.",
    ),
    toolbar,
    scroller,
  );

  let geo = { stepW: 6, barW: 96, bar: 16, totalSteps: 512, tracks: 0 };
  const areas: HTMLElement[] = [];
  const clipEls = new Map<string, HTMLButtonElement>();
  const previews = new WeakMap<Pattern, { key: string; url: string }>();

  function rebuildLanes(p: Project, s: AppState) {
    const bar = stepsPerBar(p.timeSig);
    const barW = s.prefs.barWidth;
    const stepW = barW / bar;
    const songBars = Math.ceil(songSteps(p) / bar);
    const totalBars = Math.min(Math.floor(MAX_SONG_STEPS / bar), Math.max(32, songBars + 16));
    const next = { stepW, barW, bar, totalSteps: totalBars * bar, tracks: p.tracks };
    if (JSON.stringify(next) === JSON.stringify(geo) && areas.length) return false;
    geo = next;
    canvas.style.width = `${LABEL_W + geo.totalSteps * stepW}px`;
    const marks = document.createDocumentFragment();
    for (let b = 0; b < totalBars; b++) {
      marks.append(h("span", { class: "pl-bar", style: `left:${LABEL_W + b * barW}px` }, String(b + 1)));
    }
    ruler.replaceChildren(marks);
    areas.length = 0;
    lanes.replaceChildren(
      ...Array.from({ length: p.tracks }, (_, t) => {
        const area = h("div", { class: "pl-area", "data-track": t });
        area.style.backgroundSize = `${barW}px 100%`;
        areas.push(area);
        return h("div", { class: "pl-lane" }, h("span", { class: "pl-label" }, `Track ${t + 1}`), area);
      }),
    );
    clipEls.clear();
    return true;
  }

  function preview(p: Project, pat: Pattern): string {
    const key = `${geo.stepW}|${p.timeSig.beats}/${p.timeSig.unit}|${pat.kind === "drums" ? p.channels.map((c) => c.id).join() : ""}`;
    const hit = previews.get(pat);
    if (hit && hit.key === key) return hit.url;
    const url = previewSvg(p, pat, geo.stepW);
    previews.set(pat, { key, url });
    return url;
  }

  function clipLabel(c: Clip, pat: Pattern): string {
    const bar = Math.floor(c.start / geo.bar) + 1;
    const into = c.start % geo.bar;
    const len = c.length / geo.bar;
    const where = into ? `bar ${bar}, step ${into + 1}` : `bar ${bar}`;
    return `${pat.name}, track ${c.track + 1}, ${where}, ${Number.isInteger(len) ? len : len.toFixed(2)} bar${len === 1 ? "" : "s"}`;
  }

  function renderClips(s: AppState) {
    const p = s.project;
    const live = new Set<string>();
    for (const c of p.clips) {
      const pat = findPattern(p, c.patternId);
      const area = areas[c.track];
      if (!pat || !area) continue;
      live.add(c.id);
      let b = clipEls.get(c.id);
      if (!b) {
        b = h(
          "button",
          { type: "button", class: "clip", "data-id": c.id, "aria-describedby": "playlist-help" },
          h("span", { class: "clip-name" }),
          h("span", { class: "clip-handle", "aria-hidden": "true" }),
        );
        clipEls.set(c.id, b);
      }
      if (b.parentElement !== area) {
        const focused = document.activeElement === b;
        area.append(b);
        if (focused) b.focus();
      }
      const ch = pat.kind === "melody" ? findChannel(p, pat.channelId) : undefined;
      b.dataset.sound = ch?.sound ?? "drums";
      b.style.left = `${c.start * geo.stepW}px`;
      b.style.width = `${Math.max(6, c.length * geo.stepW - 2)}px`;
      const patW = patternSteps(pat, p.timeSig) * geo.stepW;
      b.style.backgroundImage = preview(p, pat);
      b.style.backgroundSize = `${patW}px 30px`;
      const name = b.firstChild as HTMLElement;
      if (name.textContent !== pat.name) name.textContent = pat.name;
      setAttr(b, "aria-label", clipLabel(c, pat));
      setAttr(b, "aria-pressed", String(c.id === s.selectedClip));
    }
    for (const [id, b] of clipEls) {
      if (!live.has(id)) {
        b.remove();
        clipEls.delete(id);
      }
    }
    endMark.style.left = `${LABEL_W + songSteps(p) * geo.stepW}px`;
  }

  /* ---------- Mouse: select, drag to move, drag the edge to stretch ---------- */
  let drag: {
    id: string;
    mode: "move" | "resize";
    x: number;
    y: number;
    start: number;
    track: number;
    length: number;
    group: string;
    moved: boolean;
  } | null = null;
  let dragCount = 0;

  lanes.addEventListener("pointerdown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".clip");
    if (!b || e.button !== 0 || e.pointerType === "touch") return;
    const c = getState().project.clips.find((x) => x.id === b.dataset.id);
    if (!c) return;
    e.preventDefault();
    b.focus();
    actions.select(c.id);
    drag = {
      id: c.id,
      mode: (e.target as HTMLElement).classList.contains("clip-handle") ? "resize" : "move",
      x: e.clientX,
      y: e.clientY,
      start: c.start,
      track: c.track,
      length: c.length,
      group: `clip-${++dragCount}`,
      moved: false,
    };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const u = unit(e.altKey);
    const dx = (e.clientX - drag.x) / geo.stepW;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 4 && Math.abs(e.clientY - drag.y) < 4) return;
    drag.moved = true;
    if (drag.mode === "move") {
      const start = Math.max(0, Math.round((drag.start + dx) / u) * u);
      const track = drag.track + Math.round((e.clientY - drag.y) / LANE_H);
      actions.move(drag.id, track, start, drag.group);
    } else {
      const end = Math.round((drag.start + drag.length + dx) / u) * u;
      actions.resize(drag.id, Math.max(u, end - drag.start), drag.group);
    }
  });
  // A drag that ends over empty space must not also place a pattern there.
  let justDragged = false;
  const endDrag = () => {
    if (drag?.moved) {
      justDragged = true;
      setTimeout(() => {
        justDragged = false;
      }, 0);
    }
    drag = null;
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  lanes.addEventListener("dblclick", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".clip");
    if (b?.dataset.id) actions.open(b.dataset.id);
  });
  lanes.addEventListener("contextmenu", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".clip");
    if (!b?.dataset.id) return;
    e.preventDefault();
    actions.remove(b.dataset.id);
  });
  lanes.addEventListener("click", (e) => {
    if (justDragged) {
      justDragged = false;
      return;
    }
    const target = e.target as HTMLElement;
    const b = target.closest<HTMLButtonElement>(".clip");
    if (b?.dataset.id) {
      // Taps on touch screens select; mouse presses already did.
      actions.select(b.dataset.id);
      return;
    }
    const area = target.closest<HTMLElement>(".pl-area");
    if (!area) return;
    const x = e.clientX - area.getBoundingClientRect().left;
    const u = unit(e.altKey);
    actions.placeAt(Number(area.dataset.track), Math.max(0, Math.floor(x / geo.stepW / u) * u));
  });

  /* ---------- Keyboard on a focused clip ---------- */
  lanes.addEventListener("keydown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".clip");
    const c = getState().project.clips.find((x) => x.id === b?.dataset.id);
    if (!b || !c) return;
    // Shift moves by single steps from the keyboard.
    const u = unit(e.shiftKey);
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let handled = true;
    if (e.key === "Enter") actions.open(c.id);
    else if (e.key === "Delete" || e.key === "Backspace") actions.remove(c.id);
    else if (mod && k === "b") actions.duplicate(c.id);
    else if (mod && k === "d") {
      actions.select(null);
      b.blur();
    } else if (mod && k === "c") actions.copy(c.id);
    else if (mod && k === "v") actions.paste();
    else if (e.key === "ArrowLeft") actions.move(c.id, c.track, Math.max(0, c.start - u), null);
    else if (e.key === "ArrowRight") actions.move(c.id, c.track, c.start + u, null);
    else if (e.key === "ArrowUp") actions.move(c.id, c.track - 1, c.start, null);
    else if (e.key === "ArrowDown") actions.move(c.id, c.track + 1, c.start, null);
    else if (e.key === "[") actions.resize(c.id, Math.max(1, c.length - u), null);
    else if (e.key === "]") actions.resize(c.id, c.length + u, null);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  lanes.addEventListener("focusin", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".clip");
    if (b?.dataset.id && b.dataset.id !== getState().selectedClip) actions.select(b.dataset.id);
  });

  ruler.addEventListener("click", (e) => {
    const x = e.clientX - ruler.getBoundingClientRect().left - LABEL_W;
    if (x < 0) return;
    actions.seek(Math.floor(x / geo.stepW / geo.bar) * geo.bar);
  });

  // Ctrl + mouse wheel zooms the playlist sideways, as in FL Studio.
  scroller.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = Math.min(240, Math.max(32, getState().prefs.barWidth * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      actions.setBarWidth(Math.round(next));
    },
    { passive: false },
  );

  let lastStep = -1;
  return {
    el,
    scroller,
    /** F5: put focus on the selected clip, or the first one. */
    focus() {
      const sel = clipEls.get(getState().selectedClip ?? "") ?? clipEls.values().next().value;
      if (sel) sel.focus();
      else addTrackBtn.focus();
      el.scrollIntoView({ block: "nearest" });
    },
    update(s: AppState) {
      const p = s.project;
      rebuildLanes(p, s);
      renderClips(s);
      if (zoom.value !== String(s.prefs.barWidth)) zoom.value = String(s.prefs.barWidth);
      follow.set(s.prefs.follow);
      snapSeg.setValue(s.prefs.snap);
      scroller.dataset.layout = s.prefs.layout;
      const c = p.clips.find((x) => x.id === s.selectedClip);
      const pat = c && findPattern(p, c.patternId);
      selLabel.textContent = c && pat ? clipLabel(c, pat) : "No clip selected";
      for (const t of tools) setAttr(t, "aria-disabled", String(!c));
      addTrackBtn.hidden = p.tracks >= 32;
      playhead.hidden = s.mode !== "song" || lastStep < 0;
    },
    /** Song position as the playhead, or -1 to hide it. */
    setPlayhead(step: number, follow: boolean) {
      lastStep = step;
      playhead.hidden = step < 0 || getState().mode !== "song";
      if (playhead.hidden) return;
      const x = LABEL_W + step * geo.stepW;
      playhead.style.transform = `translateX(${x}px)`;
      if (follow) {
        const view = scroller.scrollLeft;
        if (x < view + LABEL_W || x > view + scroller.clientWidth - 40) scroller.scrollLeft = Math.max(0, x - LABEL_W - 20);
      }
    },
  };
}
