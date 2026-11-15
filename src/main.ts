import "./styles/app.css";
import { Engine } from "./audio/engine";
import { createHistory, pushHistory, redo, resetHistory, undo, type History } from "./core/history";
import { KEYS_DEFAULT_BASE, keyToPitch, shiftOctave } from "./core/keymap";
import type { MidiEvent } from "./core/midi";
import { ROLL_HIGH, inRollRange, midiToName } from "./core/notes";
import {
  DEFAULT_VELOCITY,
  addNote,
  clearDrums,
  clearMelody,
  demoProject,
  emptyProject,
  noteAt,
  removeNoteAt,
  resizeNoteAt,
  setBpm,
  setDrumStep,
  setLoopBars,
  setSwing,
  setSynth,
  setTimeSig,
  setTrackMix,
} from "./core/project";
import { recordedNote } from "./core/record";
import { parseProject, serializeProject } from "./core/serialize";
import { loopSteps } from "./core/timing";
import type { Project } from "./core/types";
import { connectMidi } from "./midi";
import { debounce, getStorage, loadAutosave, loadPrefs, saveAutosave, savePrefs } from "./storage";
import { toggle } from "./ui/controls";
import { h } from "./ui/dom";
import { createDrumGrid } from "./ui/drumGrid";
import { createFileBar, createToast, dateStamp, downloadBlob } from "./ui/fileBar";
import { createMelodyPanel } from "./ui/melodyPanel";
import { paintStarfield } from "./ui/space";
import { showStartOverlay } from "./ui/startOverlay";
import { createStore, type Prefs } from "./ui/store";
import { createTransport } from "./ui/transport";

const storage = getStorage();
const DEFAULT_PREFS: Prefs = {
  metronome: false,
  countIn: true,
  quantize: 1,
  keys: true,
  keysBase: KEYS_DEFAULT_BASE,
  zoom: 36,
  follow: true,
};
const initialProject = loadAutosave(storage) ?? demoProject();
let history: History<Project> = createHistory(initialProject);

const store = createStore({
  project: initialProject,
  playState: "stopped",
  recordArmed: false,
  activeMelody: 0,
  drawLength: 2,
  prefs: loadPrefs(storage, DEFAULT_PREFS),
  canUndo: false,
  canRedo: false,
});
const engine = new Engine(initialProject);
engine.metronome = store.get().prefs.metronome;
const toast = createToast();

/* ---------- Editing with undo ---------- */

function syncHistory() {
  store.set({ project: history.present, canUndo: history.past.length > 0, canRedo: history.future.length > 0 });
}
/** Apply an edit. Edits sharing a `group` within a moment (a drag, a fader) undo together. */
function edit(fn: (p: Project) => Project, group: string | null = null, windowMs?: number) {
  history = pushHistory(history, fn(history.present), group, Date.now(), windowMs);
  syncHistory();
}
function doUndo() {
  history = undo(history);
  syncHistory();
}
function doRedo() {
  history = redo(history);
  syncHistory();
}
/** Load a whole new project (New or Open); undo starts fresh. */
function replaceProject(project: Project) {
  history = resetHistory(project);
  syncHistory();
}
function setPrefs(patch: Partial<Prefs>) {
  store.set((s) => ({ prefs: { ...s.prefs, ...patch } }));
  savePrefs(storage, store.get().prefs);
}

/* ---------- Transport ---------- */

const running = () => ["playing", "counting"].includes(store.get().playState);
let takeCount = 0;
let take = "";

function togglePlay() {
  if (running()) {
    releaseAllKeys();
    engine.pause();
  } else {
    const s = store.get();
    engine.play(s.recordArmed && s.prefs.countIn && s.playState === "stopped");
  }
}
function stop() {
  releaseAllKeys();
  engine.stop();
}
function toggleRecord() {
  const armed = !store.get().recordArmed;
  if (armed) take = `take-${++takeCount}`;
  store.set({ recordArmed: armed });
  if (armed) toast.show(running() ? "Recording." : "Record is on. Press Play, then play notes.");
}

engine.setStateListener((playState) => store.set({ playState }));

const transport = createTransport({
  togglePlay,
  stop,
  toggleRecord,
  toggleMetronome() {
    const metronome = !store.get().prefs.metronome;
    engine.metronome = metronome;
    setPrefs({ metronome });
  },
  setBpm: (bpm) => edit((p) => setBpm(p, bpm), "bpm"),
  setBars: (bars) => edit((p) => setLoopBars(p, bars)),
  setTimeSig: (sig) => edit((p) => setTimeSig(p, sig)),
  setSwing: (swing) => edit((p) => setSwing(p, swing), "swing"),
});

/* ---------- Drums ---------- */

const drums = createDrumGrid(initialProject.drums, () => store.get().project, {
  setStep(track, step, on, group) {
    edit((p) => setDrumStep(p, track, step, on), group);
    if (on) engine.previewDrum(track);
  },
  setMute: (t, muted) => edit((p) => setTrackMix(p, "drums", t, { muted })),
  setSolo: (t, solo) => edit((p) => setTrackMix(p, "drums", t, { solo })),
  setVolume: (t, volume) => edit((p) => setTrackMix(p, "drums", t, { volume }), `vol-d${t}`),
  clear: () => edit(clearDrums),
});

/* ---------- Melody ---------- */

const melody = createMelodyPanel(() => store.get(), {
  setActive: (activeMelody) => {
    releaseAllKeys();
    store.set({ activeMelody });
  },
  setSynth: (t, synth) => edit((p) => setSynth(p, t, synth)),
  setMute: (t, muted) => edit((p) => setTrackMix(p, "melodies", t, { muted })),
  setSolo: (t, solo) => edit((p) => setTrackMix(p, "melodies", t, { solo })),
  setVolume: (t, volume) => edit((p) => setTrackMix(p, "melodies", t, { volume }), `vol-m${t}`),
  clear: (t) => edit((p) => clearMelody(p, t)),
  drawNote(t, step, pitch, length, group) {
    edit((p) => {
      const existing = p.melodies[t]?.notes.find((n) => n.step === step && n.pitch === pitch);
      const base = existing ? removeNoteAt(p, t, step, pitch) : p;
      return addNote(base, t, { step, pitch, length, velocity: existing?.velocity ?? DEFAULT_VELOCITY });
    }, group);
  },
  removeNote: (t, step, pitch, group) => edit((p) => removeNoteAt(p, t, step, pitch), group),
  nudgeNote(t, step, pitch, dir) {
    const n = noteAt(store.get().project.melodies[t]!, step, pitch);
    if (n) edit((p) => resizeNoteAt(p, t, step, pitch, n.length + dir));
  },
  preview: (t, pitch) => engine.previewNote(t, pitch),
  setDrawLength: (drawLength) => store.set({ drawLength }),
  setCountIn: (countIn) => setPrefs({ countIn }),
  setQuantize: (quantize) => setPrefs({ quantize }),
  setKeys: (keys) => setPrefs({ keys }),
  shiftOctave: (dir) => setPrefs({ keysBase: shiftOctave(store.get().prefs.keysBase, dir) }),
  async connectMidi() {
    try {
      await connectMidi(onMidi, (names) =>
        melody.setMidiStatus(names.length ? `MIDI: ${names.join(", ")}` : "MIDI: plug in a keyboard", true),
      );
    } catch (err) {
      const msg = err instanceof Error && err.message.includes("support") ? err.message : "MIDI access was not allowed.";
      melody.setMidiStatus(msg, false);
      toast.show(msg, "error");
    }
  },
});
melody.setMidiStatus("", false);

/* ---------- Live notes and recording ---------- */

interface Held {
  track: number;
  pitch: number;
  velocity: number;
  /** Position when the key went down, or null when not recording. */
  down: number | null;
}
const held = new Map<string, Held>();

function isRecording() {
  return store.get().recordArmed && running();
}

function noteDown(id: string, pitch: number, velocity: number) {
  if (held.has(id)) return;
  const track = store.get().activeMelody;
  engine.noteOn(track, pitch, velocity);
  held.set(id, { track, pitch, velocity, down: isRecording() ? engine.heardSteps() : null });
  melody.grid.rows[ROLL_HIGH - pitch]?.classList.add("pressed");
}

function noteUp(id: string) {
  const note = held.get(id);
  if (!note) return;
  held.delete(id);
  engine.noteOff(note.track, note.pitch);
  melody.grid.rows[ROLL_HIGH - note.pitch]?.classList.remove("pressed");
  const up = engine.heardSteps();
  // Notes played during most of the count-in are ignored; ones just before
  // the downbeat snap onto it.
  if (note.down === null || up === null || note.down < -0.5 || !inRollRange(note.pitch)) return;
  const p = store.get().project;
  const n = recordedNote({
    downSteps: Math.max(0, note.down),
    upSteps: up,
    pitch: note.pitch,
    velocity: note.velocity,
    grid: store.get().prefs.quantize,
    totalSteps: loopSteps(p.bars, p.timeSig),
  });
  edit((proj) => addNote(proj, note.track, n), take, Infinity);
}

function releaseAllKeys() {
  for (const id of [...held.keys()]) noteUp(id);
}

function onMidi(e: MidiEvent) {
  if (e.type === "on") noteDown(`m${e.pitch}`, e.pitch, e.velocity);
  else noteUp(`m${e.pitch}`);
}

/* ---------- Project files ---------- */

const files = createFileBar({
  undo: doUndo,
  redo: doRedo,
  newProject() {
    const ok = window.confirm(
      "Start a new empty project? This replaces the current beat. Save it first if you want to keep it.",
    );
    if (!ok) return;
    stop();
    replaceProject(emptyProject());
    toast.show("New empty project.");
  },
  async openFile(file) {
    if (file.size > 2_000_000) {
      toast.show("That file is too big to be a Steplab project.", "error");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.show("That file could not be read.", "error");
      return;
    }
    const result = parseProject(text);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    stop();
    replaceProject(result.project);
    toast.show(`Opened ${file.name}.`);
  },
  saveFile() {
    const name = `steplab-${dateStamp()}.json`;
    const blob = new Blob([serializeProject(store.get().project, true)], { type: "application/json" });
    downloadBlob(blob, name);
    toast.show(`Saved ${name}.`);
  },
  async exportWav() {
    const p = store.get().project;
    toast.show("Rendering the loop. Long, slow loops take a few seconds.");
    try {
      // Loaded on first use so the main bundle stays small.
      const { renderLoopWav } = await import("./audio/render");
      const blob = await renderLoopWav(p);
      const name = `steplab-${p.bpm}bpm-${p.bars}bar${p.bars > 1 ? "s" : ""}.wav`;
      downloadBlob(blob, name);
      toast.show(`Exported ${name}.`);
    } catch {
      toast.show("The WAV export failed in this browser.", "error");
    }
  },
});

/* ---------- View controls: zoom and follow ---------- */

const zoom = h("input", {
  type: "range",
  min: 22,
  max: 60,
  step: 1,
  "aria-label": "Step width",
  oninput: () => setPrefs({ zoom: Number(zoom.value) }),
});
const follow = toggle({ label: "Follow", title: "Scroll along with the playhead", onChange: (on) => setPrefs({ follow: on }) });
const view = h(
  "div",
  { class: "view-controls", role: "group", "aria-label": "View" },
  h("span", { class: "field-label", "aria-hidden": "true" }, "Zoom"),
  zoom,
  follow.el,
);
drums.el.querySelector(".panel-head h2")?.after(view);

// Keep the drum grid and piano roll scrolled to the same steps.
let syncing = false;
function linkScroll(a: HTMLElement, b: HTMLElement) {
  a.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    b.scrollLeft = a.scrollLeft;
    requestAnimationFrame(() => {
      syncing = false;
    });
  });
}
linkScroll(drums.grid.scroller, melody.grid.scroller);
linkScroll(melody.grid.scroller, drums.grid.scroller);

engine.setStepListener((step) => {
  drums.grid.setPlayhead(step);
  melody.grid.setPlayhead(step);
  if (step >= 0 && store.get().prefs.follow) drums.grid.reveal(step, false);
});

/* ---------- Page ---------- */

const app = document.getElementById("app")!;
app.append(
  h(
    "header",
    { class: "top" },
    h("div", { class: "brand" }, h("span", { class: "logo", "aria-hidden": "true" }, "Steplab"), files.el),
    transport.el,
  ),
  h(
    "main",
    { class: "main" },
    h("h1", { class: "sr-only" }, "Steplab beat maker"),
    h(
      "p",
      { id: "grid-help", class: "sr-only" },
      "Arrow keys move between steps. Space or Enter turns a step on or off.",
    ),
    drums.el,
    melody.el,
  ),
  h(
    "footer",
    { class: "foot" },
    h("p", {}, h("kbd", {}, "P"), " or ", h("kbd", {}, "Space"), " play or pause"),
    h("p", {}, h("kbd", {}, "Esc"), " stop"),
    h("p", {}, h("kbd", {}, "Shift"), "+", h("kbd", {}, "R"), " record"),
    h("p", {}, h("kbd", {}, "Z"), " to ", h("kbd", {}, "M"), " and ", h("kbd", {}, "Q"), " to ", h("kbd", {}, "U"), " play notes, ", h("kbd", {}, "-"), " ", h("kbd", {}, "="), " octave"),
    h("p", {}, h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "Z"), " undo"),
    h("p", { class: "foot-save" }, "Your beat autosaves in this browser."),
  ),
  toast.el,
);
paintStarfield();

function render() {
  const s = store.get();
  transport.update(s);
  drums.update(s.project);
  melody.update(s);
  files.setHistory(s.canUndo, s.canRedo);
  if (zoom.value !== String(s.prefs.zoom)) zoom.value = String(s.prefs.zoom);
  zoom.setAttribute("aria-valuetext", `${s.prefs.zoom} pixels`);
  follow.set(s.prefs.follow);
  document.documentElement.style.setProperty("--step-w", `${s.prefs.zoom}px`);
}

// Autosave: quietly after each pause in editing, and right away when the tab is hidden.
let autosaveWarned = false;
function autosaveNow(project: Project) {
  if (saveAutosave(storage, project) || autosaveWarned) return;
  autosaveWarned = true;
  document.querySelector(".foot-save")?.replaceChildren("Autosave is off in this browser. Use Save to keep your beat.");
  toast.show("Autosave is off in this browser. Use Save to keep your beat.", "error");
}
const autosave = debounce(autosaveNow, 400);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") autosave.flush(store.get().project);
});

store.subscribe((s, prev) => {
  if (s.project !== prev.project) {
    engine.setProject(s.project);
    autosave(s.project);
  }
  if (s.playState !== prev.playState && s.playState === "stopped") take = `take-${++takeCount}`;
  render();
});
render();

/* ---------- Keyboard ---------- */

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    return !["range", "radio", "checkbox", "button"].includes(target.type);
  }
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Space plays only when it would not press a focused control. */
function spaceIsFree(target: EventTarget | null): boolean {
  return !(target instanceof HTMLElement) || !target.closest("button, input, select, label, a, [role=tab]");
}

document.addEventListener("keydown", (e) => {
  if (app.inert || isTyping(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "z") {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    } else if (k === "y") {
      e.preventDefault();
      doRedo();
    }
    return;
  }
  if (e.altKey) return;
  if (e.code === "KeyR" && e.shiftKey) {
    e.preventDefault();
    if (!e.repeat) toggleRecord();
    return;
  }
  if (e.key === "Escape") {
    stop();
    return;
  }
  if ((e.key === "p" || e.key === "P") && !e.shiftKey) {
    e.preventDefault();
    if (!e.repeat) togglePlay();
    return;
  }
  if (e.key === " " && spaceIsFree(e.target)) {
    e.preventDefault();
    if (!e.repeat) togglePlay();
    return;
  }
  const { prefs } = store.get();
  if (!prefs.keys || e.shiftKey) return;
  if (e.code === "Minus" || e.code === "Equal") {
    e.preventDefault();
    const base = shiftOctave(prefs.keysBase, e.code === "Equal" ? 1 : -1);
    setPrefs({ keysBase: base });
    toast.show(`Keyboard octave: Z plays ${midiToName(base)}.`);
    return;
  }
  const pitch = keyToPitch(e.code, prefs.keysBase);
  if (pitch === null) return;
  e.preventDefault();
  if (!e.repeat) noteDown(`k${e.code}`, pitch, DEFAULT_VELOCITY);
});

document.addEventListener("keyup", (e) => noteUp(`k${e.code}`));
window.addEventListener("blur", releaseAllKeys);

showStartOverlay(app, async () => {
  await engine.start();
  transport.focusPlay();
});
