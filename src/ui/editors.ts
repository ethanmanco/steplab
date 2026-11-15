import { ROLL_HIGH, ROLL_ROWS, SYNTHS, isBlackKey, midiToName, midiToSpoken } from "../core/notes";
import { drumStepOn, findChannel, findPattern, noteAt, patternSteps, playsAlongside } from "../core/project";
import { QUANTIZE_OPTIONS } from "../core/record";
import { audibleChannels } from "../core/schedule";
import { maxBarsFor, pulseSteps, stepPosition, stepsPerBar } from "../core/timing";
import type { Channel, DrumPattern, MelodyPattern, Project } from "../core/types";
import { numberField, segmented, toggle, trackHead, type TrackHead } from "./controls";
import { h, setAttr } from "./dom";
import { createFloatingWindow, type FloatingWindow } from "./floatingWindow";
import { createStepGrid, wherePhrase, type CellState, type StepGrid } from "./stepGrid";
import { sectionOpen, type AppState, type DrawLength } from "./store";

export interface CommonEditorActions {
  close(): void;
  rename(patternId: string, name: string): void;
  setBars(patternId: string, bars: number): void;
  clear(patternId: string): void;
  setZoom(px: number): void;
  toggleOptions(open: boolean): void;
}

/**
 * An Options button in the window's title bar that folds the editor's
 * settings away, leaving the grid. `compactOnly`: the button only shows on
 * phones (the drum editor, whose settings fit on a computer screen).
 */
function optionsToggle(win: FloatingWindow, actions: CommonEditorActions, compactOnly: boolean) {
  const btn = h(
    "button",
    {
      type: "button",
      class: `btn btn-small win-options${compactOnly ? " compact-only" : ""}`,
      "aria-expanded": "false",
      title: "Show or hide this editor's settings",
      onclick: () => actions.toggleOptions(btn.getAttribute("aria-expanded") !== "true"),
    },
    h("span", { class: "chevron", "aria-hidden": "true" }),
    "Options",
  );
  win.tools.append(btn);
  return (open: boolean) => {
    setAttr(btn, "aria-expanded", String(open));
    win.el.dataset.options = open ? "open" : "closed";
  };
}

/** Name box, length in bars, zoom and Clear: the same in both editors. */
function patternControls(actions: CommonEditorActions, getId: () => string | null) {
  const name = h("input", {
    type: "text",
    class: "text-input",
    "aria-label": "Pattern name",
    maxlength: 40,
    onchange: () => {
      const id = getId();
      if (id) actions.rename(id, name.value);
    },
  });
  const bars = numberField({
    label: "Pattern length in bars",
    min: 1,
    max: 16,
    className: "num-2",
    onCommit: (v) => {
      const id = getId();
      if (id) actions.setBars(id, Math.round(v));
    },
  });
  const zoom = h("input", {
    type: "range",
    min: 22,
    max: 60,
    step: 1,
    "aria-label": "Step width",
    oninput: () => actions.setZoom(Number(zoom.value)),
  });
  const clear = h(
    "button",
    {
      type: "button",
      class: "btn btn-small",
      onclick: () => {
        const id = getId();
        if (id) actions.clear(id);
      },
    },
    "Clear",
  );
  const el = h(
    "div",
    { class: "editor-controls" },
    h("label", { class: "field" }, h("span", { class: "field-label" }, "Name"), name),
    h("span", { class: "field" }, h("span", { class: "field-label", "aria-hidden": "true" }, "Bars"), bars.el),
    h("span", { class: "field" }, h("span", { class: "field-label", "aria-hidden": "true" }, "Zoom"), zoom),
    clear,
  );
  return {
    el,
    update(s: AppState, pat: { name: string; bars: number }) {
      if (document.activeElement !== name && name.value !== pat.name) name.value = pat.name;
      bars.set(pat.bars);
      setAttr(bars.input, "title", `1 to ${maxBarsFor(s.project.timeSig)} bars`);
      if (zoom.value !== String(s.prefs.zoom)) zoom.value = String(s.prefs.zoom);
      setAttr(clear, "aria-label", `Clear ${pat.name}`);
    },
  };
}

/** Where an editor's playhead goes: a step inside the pattern, or -1. */
export type LocalStep = number;

/* ---------- Drum loop editor ---------- */

export interface DrumEditorActions extends CommonEditorActions {
  setStep(patternId: string, channelId: string, step: number, on: boolean, group: string | null): void;
  setMute(channelId: string, muted: boolean): void;
  setSolo(channelId: string, solo: boolean): void;
  setVolume(channelId: string, volume: number): void;
}

export function createDrumEditor(getState: () => AppState, actions: DrumEditorActions) {
  const win = createFloatingWindow({ className: "win-drums", x: 120, y: 150, onClose: actions.close });
  const setOptions = optionsToggle(win, actions, true);
  const id = () => getState().openDrums;
  const pattern = () => findPattern(getState().project, id()) as DrumPattern | undefined;
  const controls = patternControls(actions, id);
  const help = h("p", { id: "drum-help", class: "sr-only" }, "Arrow keys move between steps. Space or Enter turns a step on or off.");
  win.body.append(controls.el, help);

  let grid: StepGrid | null = null;
  let channels: Channel[] = [];
  let heads: TrackHead[] = [];
  let shownKey = "";
  let shownRows: unknown = null;
  let paintValue = true;
  let paintGroup = "";
  let paintCount = 0;

  function build(chs: Channel[]) {
    channels = chs;
    heads = chs.map((c) =>
      trackHead({
        name: c.name,
        onMute: (m) => actions.setMute(c.id, m),
        onSolo: (s) => actions.setSolo(c.id, s),
        onVolume: (v) => actions.setVolume(c.id, v),
      }),
    );
    const isOn = (row: number, col: number) => {
      const pat = pattern();
      return !!pat && drumStepOn(pat, channels[row]!.id, col);
    };
    const set = (row: number, col: number, on: boolean, group: string | null) => {
      const pid = id();
      if (pid) actions.setStep(pid, channels[row]!.id, col, on, group);
    };
    const next = createStepGrid({
      rows: chs.map((c, r) => ({ head: heads[r]!.el, attrs: { "data-sound": c.sound } })),
      label: "Drum steps",
      describedBy: "drum-help",
      handlers: {
        activate: (row, col) => set(row, col, !isOn(row, col), null),
        paintStart: (row, col) => {
          paintValue = !isOn(row, col);
          paintGroup = `paint-${++paintCount}`;
          set(row, col, paintValue, paintGroup);
        },
        paintMove: (row, col) => set(row, col, paintValue, paintGroup),
        erase: (row, col) => {
          if (isOn(row, col)) set(row, col, false, `erase-${paintCount}`);
        },
        paintEnd: () => {
          paintCount += 1;
        },
      },
    });
    if (grid) grid.scroller.replaceWith(next.scroller);
    else win.body.append(next.scroller);
    grid = next;
    shownKey = "";
  }

  return {
    win,
    update(s: AppState) {
      const p = s.project;
      const pat = pattern();
      if (!pat) {
        win.hide();
        return;
      }
      win.show();
      win.setTitle(`Drum loop: ${pat.name}`);
      setOptions(sectionOpen(s.prefs, "editorOptions"));
      controls.update(s, pat);
      const drums = p.channels.filter((c) => c.kind === "drum");
      if (!grid || drums.map((c) => c.id).join() !== channels.map((c) => c.id).join()) build(drums);
      const g = grid!;
      const total = patternSteps(pat, p.timeSig);
      g.setLayout({ total, stepsPerBar: stepsPerBar(p.timeSig), pulse: pulseSteps(p.timeSig) });
      const audible = audibleChannels(p);
      drums.forEach((c, r) => {
        heads[r]?.update(c, c.name);
        g.rows[r]?.classList.toggle("silent", !audible.has(c.id));
        g.rows[r]?.setAttribute("data-sound", c.sound);
      });
      const key = `${pat.id}|${total}|${drums.map((c) => c.name).join()}`;
      if (shownKey === key && shownRows === pat.rows) return;
      shownKey = key;
      shownRows = pat.rows;
      g.setLabel(`${pat.name} drum steps`);
      drums.forEach((c, r) => {
        const on = new Set(pat.rows[c.id] ?? []);
        for (let col = 0; col < total; col++) {
          const hit = on.has(col);
          const { bar, inBar } = stepPosition(col, p.timeSig);
          g.setCell(r, col, hit ? "on" : "off", `${c.name}, ${wherePhrase(pat.bars, bar, inBar)}, ${hit ? "on" : "off"}`);
        }
      });
    },
    setPlayhead(local: LocalStep) {
      grid?.setPlayhead(local);
    },
    reveal(local: LocalStep) {
      if (local >= 0) grid?.reveal(local, false);
    },
  };
}

/* ---------- Piano roll editor ---------- */

export interface RollEditorActions extends CommonEditorActions {
  setChannel(patternId: string, channelId: string): void;
  drawNote(patternId: string, step: number, pitch: number, length: number, group: string | null): void;
  removeNote(patternId: string, step: number, pitch: number, group: string | null): void;
  nudgeNote(patternId: string, step: number, pitch: number, dir: 1 | -1): void;
  preview(channelId: string, pitch: number): void;
  setDrawLength(value: DrawLength): void;
  setCountIn(on: boolean): void;
  setQuantize(steps: number): void;
  setKeys(on: boolean): void;
  shiftOctave(dir: 1 | -1): void;
  connectMidi(): void;
  setRecordWith(value: "alone" | "backing" | "song"): void;
  toggleBacking(patternId: string, on: boolean): void;
  setBackingLevel(level: number): void;
}

const DRAW_OPTIONS: { value: DrawLength; label: string; title: string }[] = [
  { value: 1, label: "1/16", title: "Sixteenth note" },
  { value: 2, label: "1/8", title: "Eighth note" },
  { value: 4, label: "1/4", title: "Quarter note" },
  { value: 8, label: "1/2", title: "Half note" },
  { value: "bar", label: "Bar", title: "One whole bar" },
];

/** Grid rows run top to bottom, high notes first. */
const pitchOf = (row: number) => ROLL_HIGH - row;
const rowOf = (pitch: number) => ROLL_HIGH - pitch;

export function drawSteps(value: DrawLength, project: Project): number {
  return value === "bar" ? stepsPerBar(project.timeSig) : value;
}

export function createRollEditor(getState: () => AppState, actions: RollEditorActions) {
  const win = createFloatingWindow({ className: "win-roll", x: 170, y: 190, onClose: actions.close });
  const setOptions = optionsToggle(win, actions, false);
  const id = () => getState().openRoll;
  const pattern = () => findPattern(getState().project, id()) as MelodyPattern | undefined;
  const controls = patternControls(actions, id);

  const channelSelect = h("select", {
    class: "select",
    "aria-label": "Channel that plays this melody",
    onchange: () => {
      const pid = id();
      if (pid) actions.setChannel(pid, channelSelect.value);
    },
  });
  controls.el.insertBefore(
    h("span", { class: "field" }, h("span", { class: "field-label", "aria-hidden": "true" }, "Channel"), channelSelect),
    controls.el.children[2] ?? null,
  );

  const drawLength = segmented<DrawLength>({ legend: "Note length", options: DRAW_OPTIONS, value: 2, onChange: actions.setDrawLength });
  controls.el.insertBefore(drawLength.el, controls.el.lastChild);

  const countIn = toggle({ label: "Count-in", title: "One bar of clicks before recording starts", onChange: actions.setCountIn });
  const quantize = segmented<number>({
    legend: "Snap",
    options: QUANTIZE_OPTIONS.map((q) => ({ value: q.steps, label: q.label, title: `Snap recorded notes to ${q.label} notes` })),
    value: 1,
    onChange: actions.setQuantize,
  });
  const keys = toggle({ label: "Computer keys", title: "Play notes with Z to M and Q to U", onChange: actions.setKeys });
  keys.el.classList.add("touch-hide");
  const octaveLabel = h("span", { class: "octave-label", "aria-live": "polite" });
  const octave = h(
    "span",
    { class: "octave touch-hide", role: "group", "aria-label": "Keyboard octave" },
    h("button", { type: "button", class: "mini", "aria-label": "Octave down", title: "Octave down (-)", onclick: () => actions.shiftOctave(-1) }, "-"),
    octaveLabel,
    h("button", { type: "button", class: "mini", "aria-label": "Octave up", title: "Octave up (=)", onclick: () => actions.shiftOctave(1) }, "+"),
  );
  const midiStatus = h("span", { class: "midi-status", role: "status" });
  const midiBtn = h("button", { type: "button", class: "btn btn-small", onclick: () => actions.connectMidi() }, "Connect MIDI");
  // What you hear while recording, so you can play along with the beat.
  const hear = segmented<"alone" | "backing" | "song">({
    legend: "Hear while recording",
    options: [
      { value: "alone", label: "Just this", title: "Only this melody loops while you record" },
      { value: "backing", label: "Backing", title: "This melody loops with the patterns you pick below" },
      { value: "song", label: "Song", title: "The whole song plays; notes go wherever this melody's clips are" },
    ],
    value: "backing",
    onChange: actions.setRecordWith,
    className: "seg-hear",
  });
  const level = h("input", {
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    "aria-label": "Backing volume while recording",
    oninput: () => actions.setBackingLevel(Number(level.value) / 100),
  });
  const levelOut = h("span", { class: "unit", "aria-hidden": "true" });
  const levelField = h(
    "span",
    { class: "field", title: "How loud everything else is while you record" },
    h("span", { class: "field-label", "aria-hidden": "true" }, "Backing volume"),
    level,
    levelOut,
  );
  const chips = h("div", { class: "backing-chips", role: "group", "aria-label": "Backing patterns" });
  const songNote = h("span", { class: "hear-note" });
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
    h("div", { class: "record-row-2" }, hear.el, levelField, songNote, chips),
  );

  const keyHeads = Array.from({ length: ROLL_ROWS }, (_, r) => {
    const pitch = pitchOf(r);
    const key = h("button", { type: "button", class: "key", tabindex: -1, "aria-label": `Play ${midiToSpoken(pitch)}` }, midiToName(pitch));
    key.addEventListener("pointerdown", () => {
      const pat = pattern();
      if (pat) actions.preview(pat.channelId, pitch);
    });
    return key;
  });

  // Mouse drawing: press on an empty cell to place a note and drag right to
  // stretch it. Press on a note to delete it, and keep dragging to erase more.
  let mode: "draw" | "erase" = "draw";
  let start = { row: 0, col: 0 };
  let group = "";
  let groupCount = 0;
  const lengthFor = () => drawSteps(getState().drawLength, getState().project);
  const add = (col: number, pitch: number, length: number, g: string | null) => {
    const pat = pattern();
    if (!pat) return;
    actions.drawNote(pat.id, col, pitch, length, g);
  };

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
        const pat = pattern();
        if (!pat) return;
        const pitch = pitchOf(row);
        if (noteAt(pat, col, pitch)) actions.removeNote(pat.id, col, pitch, null);
        else {
          add(col, pitch, lengthFor(), null);
          actions.preview(pat.channelId, pitch);
        }
      },
      paintStart(row, col) {
        const pat = pattern();
        if (!pat) return;
        const pitch = pitchOf(row);
        group = `draw-${++groupCount}`;
        start = { row, col };
        if (noteAt(pat, col, pitch)) {
          mode = "erase";
          actions.removeNote(pat.id, col, pitch, group);
        } else {
          mode = "draw";
          add(col, pitch, lengthFor(), group);
          actions.preview(pat.channelId, pitch);
        }
      },
      paintMove(row, col) {
        const pat = pattern();
        if (!pat) return;
        if (mode === "erase") {
          if (noteAt(pat, col, pitchOf(row))) actions.removeNote(pat.id, col, pitchOf(row), group);
          return;
        }
        if (col > start.col) add(start.col, pitchOf(start.row), col - start.col + 1, group);
      },
      nudge(row, col, dir) {
        const pat = pattern();
        if (pat) actions.nudgeNote(pat.id, col, pitchOf(row), dir);
      },
      erase(row, col) {
        const pat = pattern();
        if (pat && noteAt(pat, col, pitchOf(row))) actions.removeNote(pat.id, col, pitchOf(row), `erase-${groupCount}`);
      },
      paintEnd() {
        groupCount += 1;
      },
    },
  });
  grid.scroller.classList.add("roll-scroller");

  win.body.append(
    controls.el,
    recordRow,
    h("p", { id: "roll-help", class: "sr-only" }, "Arrow keys move. Space or Enter adds or removes a note. Shift with Left or Right makes the note shorter or longer."),
    grid.scroller,
  );

  function centerPitch(pitch: number) {
    const row = grid.rows[rowOf(pitch)];
    if (row) grid.scroller.scrollTop = row.offsetTop - grid.scroller.clientHeight / 2 + row.offsetHeight / 2;
  }

  let shown: { notes: unknown; total: number; id: string } | null = null;
  let centeredFor = "";

  return {
    win,
    grid,
    setMidiStatus(text: string, connected: boolean) {
      midiStatus.textContent = text;
      midiBtn.hidden = connected;
    },
    update(s: AppState) {
      const p = s.project;
      const pat = pattern();
      if (!pat) {
        win.hide();
        centeredFor = "";
        return;
      }
      win.show();
      const ch = findChannel(p, pat.channelId);
      win.setTitle(`Piano roll: ${pat.name}`);
      setOptions(sectionOpen(s.prefs, "editorOptions"));
      win.el.dataset.sound = ch?.sound ?? "lead";
      controls.update(s, pat);

      const synths = p.channels.filter((c) => c.kind === "synth");
      const optKey = synths.map((c) => `${c.id}:${c.name}`).join("|");
      if (channelSelect.dataset.key !== optKey) {
        channelSelect.dataset.key = optKey;
        channelSelect.replaceChildren(...synths.map((c) => h("option", { value: c.id }, c.name)));
      }
      if (channelSelect.value !== pat.channelId) channelSelect.value = pat.channelId;

      drawLength.setValue(s.drawLength);
      countIn.set(s.prefs.countIn);
      quantize.setValue(s.prefs.quantize);
      keys.set(s.prefs.keys);
      octave.hidden = !s.prefs.keys;
      octaveLabel.textContent = `Z = ${midiToName(s.prefs.keysBase)}`;

      hear.setValue(s.prefs.recordWith);
      const pct = String(Math.round(s.prefs.backingLevel * 100));
      if (level.value !== pct) level.value = pct;
      level.setAttribute("aria-valuetext", `${pct}%`);
      levelOut.textContent = `${pct}%`;
      levelField.hidden = s.prefs.recordWith === "alone";
      chips.hidden = s.prefs.recordWith !== "backing";
      const placed = p.clips.some((c) => c.patternId === pat.id);
      songNote.textContent =
        s.prefs.recordWith === "song" && !placed ? `Place ${pat.name} on the playlist to record over the song.` : "";
      const backing = s.backing ?? playsAlongside(p, pat.id);
      const chipKey = `${pat.id}|${backing.join()}|${p.patterns.map((x) => `${x.id}:${x.name}`).join()}`;
      if (chips.dataset.key !== chipKey) {
        chips.dataset.key = chipKey;
        const others = p.patterns.filter((x) => x.id !== pat.id);
        chips.replaceChildren(
          ...(others.length
            ? others.map((x) => {
                const box = h("input", {
                  type: "checkbox",
                  class: "chip-input",
                  onchange: () => actions.toggleBacking(x.id, box.checked),
                });
                box.checked = backing.includes(x.id);
                const sound = x.kind === "melody" ? findChannel(p, x.channelId)?.sound ?? "lead" : "drums";
                return h("label", { class: "chip", "data-sound": sound }, box, h("span", { class: "swatch", "aria-hidden": "true" }), x.name);
              })
            : [h("span", { class: "hear-note" }, "Make another pattern to play along with.")]),
        );
      }
      win.el.classList.toggle("track-silent", !audibleChannels(p).has(pat.channelId));

      const total = patternSteps(pat, p.timeSig);
      grid.setLayout({ total, stepsPerBar: stepsPerBar(p.timeSig), pulse: pulseSteps(p.timeSig) });
      const center = `${pat.id}:${ch?.sound}`;
      if (centeredFor !== center) {
        centeredFor = center;
        const home = ch?.kind === "synth" ? SYNTHS[ch.sound].home : 60;
        const mid = pat.notes.length ? Math.round(pat.notes.reduce((a, n) => a + n.pitch, 0) / pat.notes.length) : home;
        centerPitch(mid);
      }
      if (shown && shown.notes === pat.notes && shown.total === total && shown.id === pat.id) return;
      shown = { notes: pat.notes, total, id: pat.id };
      grid.setLabel(`${pat.name} piano roll`);

      const states: CellState[][] = Array.from({ length: ROLL_ROWS }, () => new Array<CellState>(total).fill("off"));
      const ends: boolean[][] = Array.from({ length: ROLL_ROWS }, () => new Array<boolean>(total).fill(false));
      const lengths = new Map<string, number>();
      for (const n of pat.notes) {
        const r = rowOf(n.pitch);
        const row = states[r];
        if (!row || n.step >= total) continue;
        const last = Math.min(total, n.step + n.length) - 1;
        for (let c = n.step; c <= last; c++) row[c] = c === n.step ? "on" : "held";
        ends[r]![last] = true;
        lengths.set(`${r}:${n.step}`, n.length);
      }
      for (let r = 0; r < ROLL_ROWS; r++) {
        const spoken = midiToSpoken(pitchOf(r));
        for (let c = 0; c < total; c++) {
          const state = states[r]![c]!;
          const { bar, inBar } = stepPosition(c, p.timeSig);
          const where = wherePhrase(pat.bars, bar, inBar);
          let label: string;
          if (state === "on") {
            const len = lengths.get(`${r}:${c}`) ?? 1;
            label = `${spoken}, ${where}, note, ${len} step${len === 1 ? "" : "s"} long`;
          } else if (state === "held") label = `${spoken}, ${where}, held`;
          else label = `${spoken}, ${where}, off`;
          grid.setCell(r, c, state, label, ends[r]![c]);
        }
      }
    },
    setPlayhead(local: LocalStep) {
      grid.setPlayhead(local);
    },
    reveal(local: LocalStep) {
      if (local >= 0) grid.reveal(local, false);
    },
    /** Light up a key while it is held on a keyboard. */
    press(pitch: number, on: boolean) {
      grid.rows[rowOf(pitch)]?.classList.toggle("pressed", on);
    },
  };
}
