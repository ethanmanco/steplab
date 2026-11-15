import "./styles/app.css";
import { Engine } from "./audio/engine";
import { createHistory, pushHistory, redo, resetHistory, undo, type History } from "./core/history";
import { KEYS_DEFAULT_BASE, keyToPitch, shiftOctave } from "./core/keymap";
import type { MidiEvent } from "./core/midi";
import { inRollRange, midiToName } from "./core/notes";
import {
  DEFAULT_VELOCITY,
  addChannel,
  addClip,
  addDrumPattern,
  addMelodyPattern,
  addNote,
  addTrack,
  clearPattern,
  deleteClip,
  deletePattern,
  demoProject,
  drumChannel,
  duplicateClip,
  duplicatePattern,
  emptyProject,
  findChannel,
  findPattern,
  moveClip,
  noteAt,
  patternSteps,
  removeChannel,
  removeNoteAt,
  renameChannel,
  renamePattern,
  resizeClip,
  resizeNoteAt,
  setBpm,
  setChannelMix,
  setChannelSound,
  setDrumStep,
  setMelodyChannel,
  setPatternBars,
  setSwing,
  setTimeSig,
  songSteps,
  synthChannel,
  synthChannels,
} from "./core/project";
import { recordedNote } from "./core/record";
import { clipAt } from "./core/schedule";
import { parseProject, serializeProject } from "./core/serialize";
import { DRUMS_808, type Channel, type DrumId, type MelodyPattern, type Project, type SynthId } from "./core/types";
import { connectMidi } from "./midi";
import { debounce, getStorage, loadAutosave, loadPrefs, saveAutosave, savePrefs } from "./storage";
import { h } from "./ui/dom";
import { createDrumEditor, createRollEditor } from "./ui/editors";
import { createFileBar, createToast, dateStamp, downloadBlob, type FileActions } from "./ui/fileBar";
import { segmented } from "./ui/controls";
import { createShortcutsWindow } from "./ui/shortcuts";
import { createPlaylist } from "./ui/playlist";
import { createSidebar } from "./ui/sidebar";
import { paintStarfield } from "./ui/space";
import { showStartOverlay } from "./ui/startOverlay";
import { createStore, type AppState, type Prefs } from "./ui/store";
import { createTransport } from "./ui/transport";

const storage = getStorage();
const DEFAULT_PREFS: Prefs = {
  metronome: false,
  countIn: true,
  quantize: 1,
  keys: true,
  keysBase: KEYS_DEFAULT_BASE,
  zoom: 36,
  barWidth: 96,
  follow: true,
  layout: "auto",
  sidebarWidth: 320,
  snap: "bar",
};
/** Settings come from storage, so make sure the choice-type ones hold a real choice. */
function cleanPrefs(p: Prefs): Prefs {
  return {
    ...p,
    layout: p.layout === "manual" ? "manual" : "auto",
    snap: ["bar", "beat", "step"].includes(p.snap) ? p.snap : "bar",
    sidebarWidth: Math.min(640, Math.max(240, p.sidebarWidth || 320)),
  };
}
const initialProject = loadAutosave(storage) ?? demoProject();
let history: History<Project> = createHistory(initialProject);

const store = createStore({
  project: initialProject,
  playState: "stopped",
  recordArmed: false,
  mode: "song",
  current: initialProject.patterns[0]?.id ?? null,
  openDrums: null,
  openRoll: null,
  selectedClip: null,
  drawLength: 2,
  prefs: cleanPrefs(loadPrefs(storage, DEFAULT_PREFS)),
  canUndo: false,
  canRedo: false,
});
const engine = new Engine(initialProject);
engine.metronome = store.get().prefs.metronome;
engine.setSource("song", store.get().current);
const toast = createToast();
const project = () => store.get().project;

/* ---------- Editing with undo ---------- */

/** Keep selections pointing at things that still exist after an edit or undo. */
function tidy(p: Project, s: AppState): Partial<AppState> {
  const has = (id: string | null) => !!id && p.patterns.some((x) => x.id === id);
  return {
    current: has(s.current) ? s.current : (p.patterns[0]?.id ?? null),
    openDrums: has(s.openDrums) ? s.openDrums : null,
    openRoll: has(s.openRoll) ? s.openRoll : null,
    selectedClip: p.clips.some((c) => c.id === s.selectedClip) ? s.selectedClip : null,
  };
}
function syncHistory(extra: Partial<AppState> = {}) {
  store.set((s) => ({
    project: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    ...extra,
    ...tidy(history.present, { ...s, ...extra }),
  }));
}
/** Apply an edit. Edits sharing a `group` within a moment (a drag, a fader) undo together. */
function edit(fn: (p: Project) => Project, group: string | null = null, windowMs?: number, extra: Partial<AppState> = {}) {
  history = pushHistory(history, fn(history.present), group, Date.now(), windowMs);
  syncHistory(extra);
}
function doUndo() {
  history = undo(history);
  syncHistory();
}
function doRedo() {
  history = redo(history);
  syncHistory();
}
function replaceProject(p: Project) {
  history = resetHistory(p);
  syncHistory({ current: p.patterns[0]?.id ?? null, openDrums: null, openRoll: null, selectedClip: null });
}
function setPrefs(patch: Partial<Prefs>) {
  store.set((s) => ({ prefs: { ...s.prefs, ...patch } }));
  savePrefs(storage, store.get().prefs);
}

/** Open a pattern's editor window and make it the current pattern. */
function openPattern(id: string) {
  const pat = findPattern(project(), id);
  if (!pat) return;
  store.set(pat.kind === "drums" ? { openDrums: id, current: id } : { openRoll: id, current: id });
}

/** A free place for a pattern: after its last clip, or at bar 1 on the first empty track. */
function findSpot(p: Project, patternId: string): { track: number; start: number } {
  const pat = findPattern(p, patternId)!;
  const len = patternSteps(pat, p.timeSig);
  const free = (track: number, start: number) =>
    !p.clips.some((c) => c.track === track && c.start < start + len && start < c.start + c.length);
  const own = p.clips.filter((c) => c.patternId === patternId).sort((a, b) => a.start + a.length - (b.start + b.length));
  const last = own[own.length - 1];
  if (last && free(last.track, last.start + last.length)) return { track: last.track, start: last.start + last.length };
  const start = last ? last.start + last.length : 0;
  for (let t = 0; t < p.tracks; t++) if (free(t, start)) return { track: t, start };
  return { track: 0, start: songSteps(p) };
}

function place(patternId: string) {
  addAndPlace(project(), patternId, {});
}

/** Put a pattern on the playlist (after any new pattern was made) as one undo step. */
function addAndPlace(p: Project, patternId: string, extra: Partial<AppState>) {
  const spot = findSpot(p, patternId);
  const { project: next, id } = addClip(p, patternId, spot.track, spot.start);
  edit(() => next, null, undefined, { selectedClip: id, current: patternId, ...extra });
}

/** "Kick 2" when there is already a "Kick". */
function uniqueChannelName(p: Project, base: string): string {
  const names = new Set(p.channels.map((c) => c.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

/* ---------- Transport ---------- */

const running = () => ["playing", "counting"].includes(store.get().playState);
let takeCount = 0;
let take = "take-0";

/** The melody that recording and live keys go to: the open piano roll, else the current melody. */
function recordTarget(): MelodyPattern | undefined {
  const s = store.get();
  const open = findPattern(s.project, s.openRoll);
  if (open?.kind === "melody") return open;
  const cur = findPattern(s.project, s.current);
  return cur?.kind === "melody" ? cur : undefined;
}

function liveChannel(): string | undefined {
  return recordTarget()?.channelId ?? synthChannels(project())[0]?.id;
}

function togglePlay() {
  if (running()) {
    releaseAllKeys();
    engine.pause();
    return;
  }
  const s = store.get();
  if (s.recordArmed) {
    const target = recordTarget();
    if (!target) {
      toast.show("Open a melody to record into it.", "error");
      return;
    }
    // Recording loops the melody being recorded, like FL's pattern mode.
    if (s.mode !== "pattern" || s.current !== target.id) store.set({ mode: "pattern", current: target.id });
  }
  engine.play(s.recordArmed && s.prefs.countIn && s.playState === "stopped");
}
function stop() {
  releaseAllKeys();
  engine.stop();
}
function toggleRecord() {
  const armed = !store.get().recordArmed;
  if (armed) take = `take-${++takeCount}`;
  store.set({ recordArmed: armed });
  if (!armed) return;
  const target = recordTarget();
  toast.show(target ? `Recording into ${target.name}. Press Play, then play notes.` : "Open a melody to record into it.");
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
  setMode: (mode) => store.set({ mode }),
  setBpm: (bpm) => edit((p) => setBpm(p, bpm), "bpm"),
  setTimeSig: (sig) => edit((p) => setTimeSig(p, sig)),
  setSwing: (swing) => edit((p) => setSwing(p, swing), "swing"),
});

/* ---------- Channel rack and pattern list ---------- */

const mixActions = {
  setMute: (id: string, muted: boolean) => edit((p) => setChannelMix(p, id, { muted })),
  setSolo: (id: string, solo: boolean) => edit((p) => setChannelMix(p, id, { solo })),
  setVolume: (id: string, volume: number) => edit((p) => setChannelMix(p, id, { volume }), `vol-${id}`),
};

const sidebar = createSidebar({
  ...mixActions,
  addChannel(kind, sound) {
    edit((p) => {
      const ch: Channel =
        kind === "drum" ? drumChannel(sound as DrumId) : synthChannel(sound as SynthId);
      return addChannel(p, { ...ch, name: uniqueChannelName(p, ch.name) });
    });
  },
  removeChannel: (id) => edit((p) => removeChannel(p, id)),
  renameChannel(id) {
    const ch = findChannel(project(), id);
    if (!ch) return;
    const name = window.prompt("Channel name", ch.name);
    if (name !== null) edit((p) => renameChannel(p, id, name));
  },
  setChannelSound: (id, sound) => edit((p) => setChannelSound(p, id, sound)),
  addKit808() {
    const have = new Set(project().channels.filter((c) => c.kind === "drum").map((c) => c.sound));
    const missing = DRUMS_808.filter((d) => !have.has(d));
    if (!missing.length) {
      toast.show("This song already has every 808 kit sound.");
      return;
    }
    edit((p) => missing.reduce((acc, d) => addChannel(acc, drumChannel(d)), p));
    toast.show(`Added ${missing.length} 808 sound${missing.length === 1 ? "" : "s"} to the channel rack.`);
  },
  newDrums() {
    const { project: withPattern, id } = addDrumPattern(project());
    addAndPlace(withPattern, id, { openDrums: id });
  },
  newMelody() {
    const { project: withPattern, id } = addMelodyPattern(project(), recordTarget()?.channelId);
    if (id) addAndPlace(withPattern, id, { openRoll: id });
  },
  selectPattern: (id) => store.set({ current: id }),
  editPattern: openPattern,
  placePattern: place,
  duplicatePattern(id) {
    const { project: next, id: copy } = duplicatePattern(project(), id);
    if (copy) edit(() => next, null, undefined, { current: copy });
  },
  deletePattern(id) {
    const pat = findPattern(project(), id);
    if (!pat) return;
    edit((p) => deletePattern(p, id));
    toast.show(`Deleted ${pat.name}. Ctrl+Z brings it back.`);
  },
});

/* ---------- Playlist ---------- */

const playlist = createPlaylist(() => store.get(), {
  select(clipId) {
    const clip = project().clips.find((c) => c.id === clipId);
    store.set({ selectedClip: clipId, ...(clip ? { current: clip.patternId } : {}) });
  },
  placeAt(track, start) {
    const cur = store.get().current;
    if (!findPattern(project(), cur)) {
      toast.show("Pick a pattern in the list first.", "error");
      return;
    }
    const { project: next, id } = addClip(project(), cur!, track, start);
    edit(() => next, null, undefined, { selectedClip: id });
  },
  move: (id, track, start, group) => edit((p) => moveClip(p, id, track, start), group),
  resize: (id, length, group) => edit((p) => resizeClip(p, id, length), group),
  remove: (id) => edit((p) => deleteClip(p, id), null, undefined, { selectedClip: null }),
  duplicate(id) {
    const { project: next, id: copy } = duplicateClip(project(), id);
    if (copy) edit(() => next, null, undefined, { selectedClip: copy });
  },
  open(id) {
    const clip = project().clips.find((c) => c.id === id);
    if (clip) openPattern(clip.patternId);
  },
  seek(step) {
    store.set({ mode: "song" });
    engine.setSource("song", store.get().current);
    engine.seek(step);
  },
  addTrack: () => edit(addTrack),
  setBarWidth: (barWidth) => setPrefs({ barWidth }),
  setFollow: (follow) => setPrefs({ follow }),
  setSnap: (snap) => setPrefs({ snap }),
  copy(id) {
    const clip = project().clips.find((c) => c.id === id);
    if (!clip) return;
    clipboard = { patternId: clip.patternId, length: clip.length, track: clip.track };
    toast.show("Clip copied. Ctrl+V pastes it after the selected clip.");
  },
  paste() {
    const p = project();
    if (!clipboard || !findPattern(p, clipboard.patternId)) return;
    const sel = p.clips.find((c) => c.id === store.get().selectedClip);
    const track = sel?.track ?? clipboard.track;
    const start = sel ? sel.start + sel.length : songSteps(p);
    const { project: next, id } = addClip(p, clipboard.patternId, track, start, clipboard.length);
    if (id) edit(() => next, null, undefined, { selectedClip: id });
  },
});
let clipboard: { patternId: string; length: number; track: number } | null = null;

/* ---------- Editor windows ---------- */

const common = {
  rename: (id: string, name: string) => edit((p) => renamePattern(p, id, name)),
  setBars: (id: string, bars: number) => edit((p) => setPatternBars(p, id, bars)),
  clear: (id: string) => edit((p) => clearPattern(p, id)),
  setZoom: (zoom: number) => setPrefs({ zoom }),
};

const drumEditor = createDrumEditor(() => store.get(), {
  ...common,
  ...mixActions,
  close: () => store.set({ openDrums: null }),
  setStep(patternId, channelId, step, on, group) {
    edit((p) => setDrumStep(p, patternId, channelId, step, on), group);
    if (on) engine.previewDrum(channelId);
  },
});

const rollEditor = createRollEditor(() => store.get(), {
  ...common,
  close: () => {
    releaseAllKeys();
    store.set({ openRoll: null });
  },
  setChannel: (id, channelId) => edit((p) => setMelodyChannel(p, id, channelId)),
  drawNote(id, step, pitch, length, group) {
    edit((p) => {
      const pat = findPattern(p, id);
      const existing = pat?.kind === "melody" ? pat.notes.find((n) => n.step === step && n.pitch === pitch) : undefined;
      const base = existing ? removeNoteAt(p, id, step, pitch) : p;
      return addNote(base, id, { step, pitch, length, velocity: existing?.velocity ?? DEFAULT_VELOCITY });
    }, group);
  },
  removeNote: (id, step, pitch, group) => edit((p) => removeNoteAt(p, id, step, pitch), group),
  nudgeNote(id, step, pitch, dir) {
    const pat = findPattern(project(), id);
    const n = pat?.kind === "melody" ? noteAt(pat, step, pitch) : undefined;
    if (n) edit((p) => resizeNoteAt(p, id, step, pitch, n.length + dir));
  },
  preview: (channelId, pitch) => engine.previewNote(channelId, pitch),
  setDrawLength: (drawLength) => store.set({ drawLength }),
  setCountIn: (countIn) => setPrefs({ countIn }),
  setQuantize: (quantize) => setPrefs({ quantize }),
  setKeys: (keys) => setPrefs({ keys }),
  shiftOctave: (dir) => setPrefs({ keysBase: shiftOctave(store.get().prefs.keysBase, dir) }),
  async connectMidi() {
    try {
      await connectMidi(onMidi, (names) =>
        rollEditor.setMidiStatus(names.length ? `MIDI: ${names.join(", ")}` : "MIDI: plug in a keyboard", true),
      );
    } catch (err) {
      const msg = err instanceof Error && err.message.includes("support") ? err.message : "MIDI access was not allowed.";
      rollEditor.setMidiStatus(msg, false);
      toast.show(msg, "error");
    }
  },
});
rollEditor.setMidiStatus("", false);

/* ---------- Live notes and recording ---------- */

interface Held {
  channelId: string;
  patternId: string | null;
  pitch: number;
  velocity: number;
  /** Position when the key went down, or null when not recording. */
  down: number | null;
}
const held = new Map<string, Held>();

function noteDown(key: string, pitch: number, velocity: number) {
  if (held.has(key)) return;
  const channelId = liveChannel();
  if (!channelId) return;
  engine.noteOn(channelId, pitch, velocity);
  const s = store.get();
  const target = recordTarget();
  const recording = s.recordArmed && running() && s.mode === "pattern" && target?.id === s.current;
  held.set(key, { channelId, patternId: target?.id ?? null, pitch, velocity, down: recording ? engine.heardSteps() : null });
  rollEditor.press(pitch, true);
}

function noteUp(key: string) {
  const note = held.get(key);
  if (!note) return;
  held.delete(key);
  engine.noteOff(note.channelId, note.pitch);
  rollEditor.press(note.pitch, false);
  const up = engine.heardSteps();
  // Notes played during most of the count-in are ignored; ones just before
  // the downbeat snap onto it.
  if (note.down === null || up === null || note.down < -0.5 || !note.patternId || !inRollRange(note.pitch)) return;
  const pat = findPattern(project(), note.patternId);
  if (!pat) return;
  const n = recordedNote({
    downSteps: Math.max(0, note.down),
    upSteps: up,
    pitch: note.pitch,
    velocity: note.velocity,
    grid: store.get().prefs.quantize,
    totalSteps: patternSteps(pat, project().timeSig),
  });
  edit((p) => addNote(p, note.patternId!, n), take, Infinity);
}

function releaseAllKeys() {
  for (const key of [...held.keys()]) noteUp(key);
}

function onMidi(e: MidiEvent) {
  if (e.type === "on") noteDown(`m${e.pitch}`, e.pitch, e.velocity);
  else noteUp(`m${e.pitch}`);
}

/* ---------- Project files ---------- */

const fileActions: FileActions = {
  undo: doUndo,
  redo: doRedo,
  newProject() {
    const ok = window.confirm("Start a new empty song? This replaces the current one. Save it first if you want to keep it.");
    if (!ok) return;
    stop();
    replaceProject(emptyProject());
    toast.show("New empty song.");
  },
  async openFile(file) {
    if (file.size > 5_000_000) {
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
    downloadBlob(new Blob([serializeProject(project(), true)], { type: "application/json" }), name);
    toast.show(`Saved ${name}.`);
  },
  async exportWav() {
    const s = store.get();
    const pat = s.mode === "pattern" ? findPattern(s.project, s.current) : undefined;
    toast.show(pat ? `Rendering ${pat.name}.` : "Rendering the song. Long songs take a few seconds.");
    try {
      // Loaded on first use so the main bundle stays small.
      const { renderWav } = await import("./audio/render");
      const blob = await renderWav(s.project, pat ? "pattern" : "song", pat?.id ?? null);
      const slug = (pat?.name ?? "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "song";
      const name = `steplab-${slug}-${s.project.bpm}bpm.wav`;
      downloadBlob(blob, name);
      toast.show(`Exported ${name}.`);
    } catch {
      toast.show("The WAV export failed in this browser.", "error");
    }
  },
};
const files = createFileBar(fileActions);

/* ---------- Playheads ---------- */

engine.setStepListener((step) => {
  const s = store.get();
  const follow = s.prefs.follow && step >= 0;
  playlist.setPlayhead(s.mode === "song" ? step : -1, follow);
  const localFor = (id: string | null) => {
    if (!id || step < 0) return -1;
    if (s.mode === "pattern") return id === s.current ? step : -1;
    return clipAt(s.project, id, step)?.local ?? -1;
  };
  const d = localFor(s.openDrums);
  const r = localFor(s.openRoll);
  drumEditor.setPlayhead(d);
  rollEditor.setPlayhead(r);
  if (follow) {
    drumEditor.reveal(d);
    rollEditor.reveal(r);
  }
});

/* ---------- Page ---------- */

const helpWin = createShortcutsWindow(() => helpWin.hide());
function openHelp() {
  helpWin.show();
}

// Auto sizes panels and windows to fit; Manual lets you drag their sizes.
const layoutSeg = segmented<Prefs["layout"]>({
  legend: "Layout",
  options: [
    { value: "auto", label: "Auto", title: "Panels and editor windows size themselves to fit" },
    { value: "manual", label: "Manual", title: "Drag the divider and window corners to size them yourself" },
  ],
  value: "auto",
  onChange: (layout) => setPrefs({ layout }),
  className: "seg-layout",
});
const helpBtn = h(
  "button",
  { type: "button", class: "btn btn-small", title: "Keyboard shortcuts (F1)", "aria-keyshortcuts": "F1", onclick: openHelp },
  "Shortcuts",
);

// The divider between the sidebar and the playlist. Dragging it switches to
// Manual layout; double-clicking it goes back to Auto.
const splitter = h("div", {
  class: "splitter",
  role: "separator",
  tabindex: 0,
  "aria-orientation": "vertical",
  "aria-label": "Sidebar width. Arrow keys resize, Enter returns to automatic size.",
  "aria-valuemin": 240,
  "aria-valuemax": 640,
  title: "Drag to resize. Double-click for automatic size.",
});
const workspace = h(
  "main",
  { class: "workspace" },
  h("h1", { class: "sr-only" }, "Steplab beat maker"),
  sidebar.el,
  splitter,
  playlist.el,
);
let splitDrag = false;
splitter.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  splitDrag = true;
  splitter.setPointerCapture(e.pointerId);
  e.preventDefault();
});
splitter.addEventListener("pointermove", (e) => {
  if (!splitDrag) return;
  const left = workspace.getBoundingClientRect().left;
  const width = Math.round(Math.min(640, Math.max(240, e.clientX - left - 8)));
  store.set((s) => ({ prefs: { ...s.prefs, layout: "manual", sidebarWidth: width } }));
});
splitter.addEventListener("pointerup", () => {
  if (!splitDrag) return;
  splitDrag = false;
  savePrefs(storage, store.get().prefs);
});
splitter.addEventListener("dblclick", () => setPrefs({ layout: "auto" }));
splitter.addEventListener("keydown", (e) => {
  const w = store.get().prefs.sidebarWidth;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const sidebarWidth = Math.min(640, Math.max(240, w + (e.key === "ArrowRight" ? 16 : -16)));
    setPrefs({ layout: "manual", sidebarWidth });
  } else if (e.key === "Enter") {
    e.preventDefault();
    setPrefs({ layout: "auto" });
  }
});

const app = document.getElementById("app")!;
app.append(
  h(
    "header",
    { class: "top" },
    h(
      "div",
      { class: "brand" },
      h("span", { class: "logo", "aria-hidden": "true" }, "Steplab"),
      h("span", { class: "brand-tools" }, layoutSeg.el, helpBtn),
      files.el,
    ),
    transport.el,
  ),
  workspace,
  h(
    "footer",
    { class: "foot" },
    h("p", {}, "FL Studio shortcuts work here: ", h("kbd", {}, "Space"), " play, ", h("kbd", {}, "R"), " record, ", h("kbd", {}, "L"), " pattern or song, ", h("kbd", {}, "Alt"), " + drag to skip snapping. Press ", h("kbd", {}, "F1"), " for the full list."),
    h("p", { class: "foot-save" }, "Your song autosaves in this browser."),
  ),
  toast.el,
);
document.body.append(drumEditor.win.el, rollEditor.win.el, helpWin.el);
paintStarfield();

function render() {
  const s = store.get();
  transport.update(s);
  sidebar.update(s);
  playlist.update(s);
  drumEditor.update(s);
  rollEditor.update(s);
  files.setHistory(s.canUndo, s.canRedo);
  layoutSeg.setValue(s.prefs.layout);
  workspace.dataset.layout = s.prefs.layout;
  workspace.style.setProperty("--side-w", `${s.prefs.sidebarWidth}px`);
  splitter.setAttribute("aria-valuenow", String(s.prefs.sidebarWidth));
  for (const w of [drumEditor.win, rollEditor.win, helpWin]) {
    w.setLayout(s.prefs.layout);
    w.fit();
  }
  document.documentElement.style.setProperty("--step-w", `${s.prefs.zoom}px`);
}
window.addEventListener("resize", () => {
  for (const w of [drumEditor.win, rollEditor.win, helpWin]) w.fit();
});

// Autosave: quietly after each pause in editing, and right away when the tab is hidden.
let autosaveWarned = false;
function autosaveNow(p: Project) {
  if (saveAutosave(storage, p) || autosaveWarned) return;
  autosaveWarned = true;
  document.querySelector(".foot-save")?.replaceChildren("Autosave is off in this browser. Use Save to keep your song.");
  toast.show("Autosave is off in this browser. Use Save to keep your song.", "error");
}
const autosave = debounce(autosaveNow, 400);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") autosave.flush(project());
});

store.subscribe((s, prev) => {
  if (s.project !== prev.project) {
    engine.setProject(s.project);
    autosave(s.project);
  }
  if (s.mode !== prev.mode || s.current !== prev.current) engine.setSource(s.mode, s.current);
  if (s.playState !== prev.playState && s.playState === "stopped") take = `take-${++takeCount}`;
  render();
});
render();

/* ---------- Keyboard: FL Studio shortcuts ---------- */

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !["range", "radio", "checkbox", "button"].includes(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Space plays only when it would not press a focused control. */
function spaceIsFree(target: EventTarget | null): boolean {
  return !(target instanceof HTMLElement) || !target.closest("button, input, select, label, a, [role=tab], [role=separator]");
}

/** Space in FL Studio: start, or stop and go back to the start. */
function playStop() {
  if (running()) stop();
  else togglePlay();
}

function toggleMode() {
  const mode = store.get().mode === "song" ? "pattern" : "song";
  store.set({ mode });
  toast.show(mode === "song" ? "Song mode: playing the playlist." : "Pattern mode: looping the selected pattern.");
}

/** Numpad + and -: step through the pattern list. */
function cyclePattern(dir: 1 | -1) {
  const { patterns } = project();
  if (!patterns.length) return;
  const i = patterns.findIndex((x) => x.id === store.get().current);
  const next = patterns[(i + dir + patterns.length) % patterns.length]!;
  store.set({ current: next.id });
  toast.show(`Pattern: ${next.name}`);
}

/** F7: the piano roll for the melody being worked on, or the first melody. */
function openPianoRoll() {
  const target = recordTarget() ?? project().patterns.find((x) => x.kind === "melody");
  if (target) openPattern(target.id);
  else toast.show("There is no melody yet. Press New melody to make one.");
}

document.addEventListener("keydown", (e) => {
  if (app.inert) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  // Window keys and file shortcuts work from anywhere, even a text box.
  const fkeys: Record<string, () => void> = {
    F1: openHelp,
    F5: () => playlist.focus(),
    F6: () => sidebar.focusRack(),
    F7: openPianoRoll,
  };
  if (fkeys[e.key] && !mod && !e.altKey) {
    e.preventDefault();
    fkeys[e.key]!();
    return;
  }
  if (mod && !e.altKey && !e.shiftKey && (k === "s" || k === "o" || k === "r")) {
    e.preventDefault();
    if (k === "s") fileActions.saveFile();
    else if (k === "o") files.pickFile();
    else void fileActions.exportWav?.();
    return;
  }

  if (isTyping(e.target)) return;
  if (mod && k === "z") {
    e.preventDefault();
    if (e.shiftKey) doRedo();
    else doUndo();
    return;
  }
  if (mod && k === "y") {
    e.preventDefault();
    doRedo();
    return;
  }
  if (mod && e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) togglePlay();
    return;
  }
  if (mod || e.altKey) return;

  if (e.key === " " && spaceIsFree(e.target)) {
    e.preventDefault();
    if (!e.repeat) playStop();
    return;
  }
  if (e.key === "Escape") {
    stop();
    return;
  }
  const { prefs } = store.get();
  if (e.code === "KeyR" && (e.shiftKey || !prefs.keys)) {
    e.preventDefault();
    if (!e.repeat) toggleRecord();
    return;
  }
  if (e.code === "KeyL" && !e.shiftKey) {
    e.preventDefault();
    if (!e.repeat) toggleMode();
    return;
  }
  if (e.code === "NumpadAdd" || e.code === "NumpadSubtract") {
    e.preventDefault();
    cyclePattern(e.code === "NumpadAdd" ? 1 : -1);
    return;
  }
  if (e.key === "?") {
    openHelp();
    return;
  }
  if (e.code === "KeyP" && !e.shiftKey) {
    e.preventDefault();
    if (!e.repeat) togglePlay();
    return;
  }
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
