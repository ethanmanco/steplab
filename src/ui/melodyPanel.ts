import { ROLL_HIGH, ROLL_ROWS, SYNTHS, isBlackKey, midiToName, midiToSpoken } from "../core/notes";
import { noteAt } from "../core/project";
import { QUANTIZE_OPTIONS } from "../core/record";
import { audibleTracks } from "../core/schedule";
import { loopSteps, pulseSteps, stepPosition, stepsPerBar } from "../core/timing";
import { SYNTH_IDS, type MelodyTrack, type Project, type SynthId } from "../core/types";
import { segmented, toggle, trackHead } from "./controls";
import { h, setAttr } from "./dom";
import type { CellState } from "./stepGrid";
import { createStepGrid, wherePhrase } from "./stepGrid";
import type { AppState } from "./store";

export interface MelodyActions {
  setActive(track: number): void;
  setSynth(track: number, synth: SynthId): void;
  setMute(track: number, muted: boolean): void;
  setSolo(track: number, solo: boolean): void;
  setVolume(track: number, volume: number): void;
  clear(track: number): void;
  /** Add a note, or change the length of the one starting here (same `group` = one undo step). */
  drawNote(track: number, step: number, pitch: number, length: number, group: string | null): void;
  removeNote(track: number, step: number, pitch: number, group: string | null): void;
  nudgeNote(track: number, step: number, pitch: number, dir: 1 | -1): void;
  preview(track: number, pitch: number): void;
  setDrawLength(value: DrawLength): void;
  setCountIn(on: boolean): void;
  setQuantize(steps: number): void;
  setKeys(on: boolean): void;
  shiftOctave(dir: 1 | -1): void;
  connectMidi(): void;
}

/** Note lengths for clicked notes: steps, or a whole bar. */
export type DrawLength = 1 | 2 | 4 | 8 | "bar";
const DRAW_OPTIONS: { value: DrawLength; label: string; title: string }[] = [
  { value: 1, label: "1/16", title: "Sixteenth note" },
  { value: 2, label: "1/8", title: "Eighth note" },
  { value: 4, label: "1/4", title: "Quarter note" },
  { value: 8, label: "1/2", title: "Half note" },
  { value: "bar", label: "Bar", title: "One whole bar" },
];

const TRACKS = [0, 1] as const;
const trackName = (t: number) => `Melody ${t + 1}`;
/** Grid rows run top to bottom, high notes first. */
const pitchOf = (row: number) => ROLL_HIGH - row;
const rowOf = (pitch: number) => ROLL_HIGH - pitch;

export function drawSteps(value: DrawLength, project: Project): number {
  return value === "bar" ? stepsPerBar(project.timeSig) : value;
}

export function createMelodyPanel(getState: () => AppState, actions: MelodyActions) {
  const active = () => getState().activeMelody;
  const track = (): MelodyTrack => getState().project.melodies[active()]!;

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
    const next = (active() + dir + TRACKS.length) % TRACKS.length;
    actions.setActive(next);
    tabs[next]?.tab.focus();
  });

  // Per-track sound and mix; only the active track's set is shown.
  const sounds = TRACKS.map((t) =>
    segmented<SynthId>({
      legend: "Sound",
      options: SYNTH_IDS.map((id) => ({ value: id, label: SYNTHS[id].name })),
      value: "lead",
      onChange: (id) => actions.setSynth(t, id),
    }),
  );
  const heads = TRACKS.map((t) =>
    trackHead({
      name: trackName(t),
      onMute: (m) => actions.setMute(t, m),
      onSolo: (s) => actions.setSolo(t, s),
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
  const trackSets = TRACKS.map((t) =>
    h("div", { class: "melody-track-controls" }, sounds[t]!.el, heads[t]!.el, clears[t]!),
  );

  const drawLength = segmented<DrawLength>({
    legend: "Note length",
    options: DRAW_OPTIONS,
    value: 2,
    onChange: (v) => actions.setDrawLength(v),
  });

  // Recording settings.
  const countIn = toggle({ label: "Count-in", title: "One bar of clicks before recording starts", onChange: actions.setCountIn });
  const quantize = segmented<number>({
    legend: "Snap",
    options: QUANTIZE_OPTIONS.map((q) => ({ value: q.steps, label: q.label, title: `Snap recorded notes to ${q.label} notes` })),
    value: 1,
    onChange: actions.setQuantize,
  });
  const keys = toggle({ label: "Computer keys", title: "Play notes with Z to M and Q to U", onChange: actions.setKeys });
  const octaveLabel = h("span", { class: "octave-label", "aria-live": "polite" });
  const octave = h(
    "span",
    { class: "octave", role: "group", "aria-label": "Keyboard octave" },
    h("button", { type: "button", class: "mini", "aria-label": "Octave down", title: "Octave down (-)", onclick: () => actions.shiftOctave(-1) }, "-"),
    octaveLabel,
    h("button", { type: "button", class: "mini", "aria-label": "Octave up", title: "Octave up (=)", onclick: () => actions.shiftOctave(1) }, "+"),
  );
  const midiStatus = h("span", { class: "midi-status", role: "status" });
  const midiBtn = h("button", { type: "button", class: "btn btn-small", onclick: () => actions.connectMidi() }, "Connect MIDI");

  const recordRow = h(
    "div",
    { class: "record-row", role: "group", "aria-label": "Recording" },
    h("span", { class: "field-label" }, "Record"),
    countIn.el,
    quantize.el,
    keys.el,
    octave,
    midiBtn,
    midiStatus,
  );

  // The piano roll: note names down the side, high notes on top.
  const keyHeads = Array.from({ length: ROLL_ROWS }, (_, r) => {
    const pitch = pitchOf(r);
    const key = h(
      "button",
      { type: "button", class: "key", tabindex: -1, "aria-label": `Play ${midiToSpoken(pitch)}` },
      midiToName(pitch),
    );
    key.addEventListener("pointerdown", () => actions.preview(active(), pitch));
    return key;
  });

  // Mouse drawing: press on an empty cell to place a note and drag right to
  // stretch it. Press on a note to delete it, and keep dragging to erase more.
  let mode: "draw" | "erase" = "draw";
  let start = { row: 0, col: 0 };
  let group = "";
  let groupCount = 0;
  const lengthFor = () => drawSteps(getState().drawLength, getState().project);

  const grid = createStepGrid({
    rows: keyHeads.map((key, r) => ({
      head: key,
      attrs: { "data-black": String(isBlackKey(pitchOf(r))), "data-c": String(pitchOf(r) % 12 === 0) },
    })),
    label: "Piano roll",
    describedBy: "roll-help",
    className: "roll",
    handlers: {
      activate(row, col) {
        const pitch = pitchOf(row);
        if (noteAt(track(), col, pitch)) actions.removeNote(active(), col, pitch, null);
        else {
          actions.drawNote(active(), col, pitch, lengthFor(), null);
          actions.preview(active(), pitch);
        }
      },
      paintStart(row, col) {
        const pitch = pitchOf(row);
        group = `draw-${++groupCount}`;
        start = { row, col };
        if (noteAt(track(), col, pitch)) {
          mode = "erase";
          actions.removeNote(active(), col, pitch, group);
        } else {
          mode = "draw";
          actions.drawNote(active(), col, pitch, lengthFor(), group);
          actions.preview(active(), pitch);
        }
      },
      paintMove(row, col) {
        if (mode === "erase") {
          if (noteAt(track(), col, pitchOf(row))) actions.removeNote(active(), col, pitchOf(row), group);
          return;
        }
        if (col <= start.col) return;
        actions.drawNote(active(), start.col, pitchOf(start.row), col - start.col + 1, group);
      },
      nudge(row, col, dir) {
        actions.nudgeNote(active(), col, pitchOf(row), dir);
      },
    },
  });
  grid.scroller.classList.add("roll-scroller");

  const help = h(
    "p",
    { id: "roll-help", class: "sr-only" },
    "Arrow keys move. Space or Enter adds or removes a note. Shift with Left or Right makes the note shorter or longer.",
  );

  const tabpanel = h(
    "div",
    { id: "melody-tabpanel", role: "tabpanel", class: "melody-tabpanel" },
    h("div", { class: "melody-controls" }, ...trackSets, drawLength.el),
    recordRow,
    help,
    grid.scroller,
  );

  const el = h(
    "section",
    { class: "panel melody-panel", "aria-labelledby": "melody-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "melody-title" }, "Melody"), tablist),
    tabpanel,
  );

  /** Scroll the roll up or down so a pitch sits in the middle. */
  function centerPitch(pitch: number) {
    const row = grid.rows[rowOf(pitch)];
    if (!row) return;
    grid.scroller.scrollTop = row.offsetTop - grid.scroller.clientHeight / 2 + row.offsetHeight / 2;
  }

  let shown: { notes: MelodyTrack["notes"]; ghost: MelodyTrack["notes"]; active: number; bars: number; sig: string } | null = null;
  let centeredFor = "";

  return {
    el,
    grid,
    setMidiStatus(text: string, connected: boolean) {
      midiStatus.textContent = text;
      midiBtn.hidden = connected;
    },
    update(s: AppState) {
      const { project } = s;
      const a = s.activeMelody;
      el.dataset.track = String(a);
      const audible = audibleTracks(project);

      TRACKS.forEach((t) => {
        const m = project.melodies[t]!;
        const selected = t === a;
        const tab = tabs[t]!;
        setAttr(tab.tab, "aria-selected", String(selected));
        setAttr(tab.tab, "tabindex", selected ? "0" : "-1");
        tab.sub.textContent = SYNTHS[m.synth].name;
        tab.tab.classList.toggle("is-muted", !audible.melodies[t]);
        trackSets[t]!.hidden = !selected;
        sounds[t]!.setValue(m.synth);
        heads[t]!.update(m);
      });
      setAttr(tabpanel, "aria-labelledby", `melody-tab-${a}`);
      el.classList.toggle("track-silent", !audible.melodies[a]);

      drawLength.setValue(s.drawLength);
      countIn.set(s.prefs.countIn);
      quantize.setValue(s.prefs.quantize);
      keys.set(s.prefs.keys);
      octave.hidden = !s.prefs.keys;
      octaveLabel.textContent = `Z = ${midiToName(s.prefs.keysBase)}`;

      const total = loopSteps(project.bars, project.timeSig);
      grid.setLayout({ total, stepsPerBar: stepsPerBar(project.timeSig), pulse: pulseSteps(project.timeSig) });

      const m = project.melodies[a]!;
      const other = project.melodies[1 - a]!;
      const sig = `${project.timeSig.beats}/${project.timeSig.unit}`;
      const center = `${a}:${m.synth}`;
      if (centeredFor !== center) {
        centeredFor = center;
        requestAnimationFrame(() => centerPitch(SYNTHS[m.synth].home));
      }
      if (
        shown &&
        shown.notes === m.notes &&
        shown.ghost === other.notes &&
        shown.active === a &&
        shown.bars === project.bars &&
        shown.sig === sig
      ) {
        return;
      }
      shown = { notes: m.notes, ghost: other.notes, active: a, bars: project.bars, sig };
      grid.setLabel(`${trackName(a)} piano roll, ${SYNTHS[m.synth].name}`);

      // Work out every cell's state, then push only the changes to the DOM.
      const states: CellState[][] = Array.from({ length: ROLL_ROWS }, () => new Array<CellState>(total).fill("off"));
      const ends: boolean[][] = Array.from({ length: ROLL_ROWS }, () => new Array<boolean>(total).fill(false));
      const lengths = new Map<string, number>();
      for (const n of other.notes) {
        const row = states[rowOf(n.pitch)];
        if (!row) continue;
        for (let c = n.step; c < Math.min(total, n.step + n.length); c++) row[c] = "ghost";
      }
      for (const n of m.notes) {
        const r = rowOf(n.pitch);
        const row = states[r];
        if (!row || n.step >= total) continue;
        const last = Math.min(total, n.step + n.length) - 1;
        for (let c = n.step; c <= last; c++) row[c] = c === n.step ? "on" : "held";
        ends[r]![last] = true;
        lengths.set(`${r}:${n.step}`, n.length);
      }
      const name = trackName(a);
      for (let r = 0; r < ROLL_ROWS; r++) {
        const spoken = midiToSpoken(pitchOf(r));
        for (let c = 0; c < total; c++) {
          const state = states[r]![c]!;
          const { bar, inBar } = stepPosition(c, project.timeSig);
          const where = wherePhrase(project.bars, bar, inBar);
          let label: string;
          if (state === "on") {
            const len = lengths.get(`${r}:${c}`) ?? 1;
            label = `${name}, ${spoken}, ${where}, note, ${len} step${len === 1 ? "" : "s"} long`;
          } else if (state === "held") label = `${name}, ${spoken}, ${where}, held`;
          else label = `${name}, ${spoken}, ${where}, off`;
          grid.setCell(r, c, state, label, ends[r]![c]);
        }
      }
    },
  };
}
