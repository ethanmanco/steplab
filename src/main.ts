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
  addSample,
  makeId,
  resetChannelSound,
  setChannelFx,
  setChannelPan,
  setChannelSample,
  setChannelTone,
  setMaster,
  addDrumPattern,
  addMelodyPattern,
  addNote,
  addTrack,
  clearPattern,
  deleteClip,
  deletePattern,
  drumChannel,
  duplicateClip,
  duplicatePattern,
  emptyProject,
  findChannel,
  findPattern,
  moveClip,
  noteAt,
  patternSteps,
  playsAlongside,
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
import { positionInPattern, recordedNote } from "./core/record";
import { clipAt } from "./core/schedule";
import { parseProject, serializeProject } from "./core/serialize";
import { decodeMidi, encodeMidi, importMidi, projectToMidi } from "./core/midifile";
import { DRUMS_808, type Channel, type DrumId, type MelodyPattern, type Project, type SynthId } from "./core/types";
import { connectMidi } from "./midi";
import { debounce, getStorage, loadAutosave, loadPrefs, saveAutosave, savePrefs } from "./storage";
import { h } from "./ui/dom";
import { createDrumEditor, createRollEditor } from "./ui/editors";
import { createFileBar, createToast, dateStamp, downloadBlob, type FileActions } from "./ui/fileBar";
import { segmented } from "./ui/controls";
import { createShortcutsWindow } from "./ui/shortcuts";
import { createChannelSettings, type LibrarySample } from "./ui/channelSettings";
import { createMixer } from "./ui/mixer";
import { createExamplesWindow } from "./ui/examples";
import { PRESETS, defaultBeat } from "./core/presets";
import { createSampleBank } from "./samples";
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
  recordWith: "backing",
  backingLevel: 0.7,
};
/** Settings come from storage, so make sure the choice-type ones hold a real choice. */
function cleanPrefs(p: Prefs): Prefs {
  return {
    ...p,
    layout: p.layout === "manual" ? "manual" : "auto",
    snap: ["bar", "beat", "step"].includes(p.snap) ? p.snap : "bar",
    sidebarWidth: Math.min(640, Math.max(240, p.sidebarWidth || 320)),
    recordWith: ["alone", "backing", "song"].includes(p.recordWith) ? p.recordWith : "backing",
    backingLevel: Math.min(1, Math.max(0, Number.isFinite(p.backingLevel) ? p.backingLevel : 0.7)),
  };
}
const initialProject = loadAutosave(storage) ?? defaultBeat();
let history: History<Project> = createHistory(initialProject);


const store = createStore({
  project: initialProject,
  playState: "stopped",
  recordArmed: false,
  mode: "song",
  current: initialProject.patterns[0]?.id ?? null,
  backing: null,
  openDrums: null,
  openRoll: null,
  selectedClip: null,
  openChannel: null,
  mixerOpen: false,
  sampleStatus: {},
  drawLength: 2,
  prefs: cleanPrefs(loadPrefs(storage, DEFAULT_PREFS)),
  canUndo: false,
  canRedo: false,
});
// Sample audio: decoded once, shared by playback and export. When a file
// finishes loading, the engine rebuilds that channel's voice.
const bank = createSampleBank(() => {
  engine.setProject(project());
  store.set((s) => ({ sampleStatus: sampleStatusFor(s.project) }));
});
function sampleStatusFor(p: Project): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of p.samples) {
    if (bank.failed(x.id)) out[x.id] = `${x.name} could not be loaded. Load the file again.`;
    else if (!bank.get(x.id)) out[x.id] = `Loading ${x.name}...`;
  }
  return out;
}
const engine = new Engine(initialProject, (id) => bank.get(id));
bank.ensure(initialProject.samples);
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
    openChannel: p.channels.some((c) => c.id === s.openChannel) ? s.openChannel : null,
    backing: s.backing && s.backing.filter((id) => has(id)),
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
  syncHistory({ current: p.patterns[0]?.id ?? null, openDrums: null, openRoll: null, selectedClip: null, backing: null });
}
function setPrefs(patch: Partial<Prefs>) {
  store.set((s) => ({ prefs: { ...s.prefs, ...patch } }));
  savePrefs(storage, store.get().prefs);
}

/** Open a pattern's editor window and make it the current pattern. */
function openPattern(id: string) {
  const pat = findPattern(project(), id);
  if (!pat) return;
  // A different melody starts with its own automatic backing.
  const fresh = pat.kind === "melody" && store.get().openRoll !== id ? { backing: null } : {};
  store.set(pat.kind === "drums" ? { openDrums: id, current: id } : { openRoll: id, current: id, ...fresh });
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
function recordTarget(s: AppState = store.get()): MelodyPattern | undefined {
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
    if (s.prefs.recordWith === "song") {
      // Record over the whole song: notes land wherever this melody has clips.
      if (!s.project.clips.some((c) => c.patternId === target.id)) {
        toast.show(`Place ${target.name} on the playlist to record over the song.`, "error");
        return;
      }
      if (s.mode !== "song" || s.current !== target.id) store.set({ mode: "song", current: target.id });
    } else if (s.mode !== "pattern" || s.current !== target.id) {
      // Otherwise loop the melody, with its backing patterns if chosen.
      store.set({ mode: "pattern", current: target.id });
    }
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
  addSampleChannel(kind) {
    pickAudio(async (file) => {
      const sampleId = makeId("s");
      try {
        await bank.importFile(file, sampleId);
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "That file could not be loaded.", "error");
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Sample";
      const ch: Channel = kind === "drum" ? drumChannel("kick808", name) : synthChannel("piano", name);
      edit((p) => setChannelSample(addChannel(addSample(p, { id: sampleId, name, source: "user", root: 60 }), ch), ch.id, sampleId), null, undefined, { openChannel: ch.id });
      toast.show(`Added ${name} as a ${kind === "drum" ? "one shot drum" : "pitched"} channel.`);
    });
  },
  openSettings: (id) => store.set({ openChannel: id }),
  addLibraryChannel(libraryId) {
    const item = library.find((x) => x.id === libraryId);
    if (!item) return;
    const sampleId = `lib-${item.id}`;
    const p0 = project();
    const ch: Channel =
      item.kind === "oneshot" ? drumChannel("kick808", uniqueChannelName(p0, item.name)) : synthChannel("piano", uniqueChannelName(p0, item.name));
    edit((p) =>
      setChannelSample(
        addChannel(addSample(p, { id: sampleId, name: item.name, source: "bundled", url: item.url, root: item.root }), ch),
        ch.id,
        sampleId,
      ),
    );
    toast.show(`Added ${item.name}${item.kind === "oneshot" ? " to the drum loops" : ". Use it in a melody"}.`);
  },
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
  setRecordWith: (recordWith) => setPrefs({ recordWith }),
  toggleBacking: (id, on) =>
    store.set((s) => {
      const target = recordTarget(s);
      const base = s.backing ?? (target ? playsAlongside(s.project, target.id) : []);
      return { backing: on ? [...new Set([...base, id])] : base.filter((x) => x !== id) };
    }),
  setBackingLevel: (backingLevel) => setPrefs({ backingLevel }),
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
  /** Where the key went down, inside the pattern and as heard, or null when not recording. */
  down: { local: number; heard: number } | null;
}
const held = new Map<string, Held>();

function noteDown(key: string, pitch: number, velocity: number) {
  if (held.has(key)) return;
  const channelId = liveChannel();
  if (!channelId) return;
  engine.noteOn(channelId, pitch, velocity);
  const target = recordTarget();
  held.set(key, { channelId, patternId: target?.id ?? null, pitch, velocity, down: target ? recordPosition(target) : null });
  rollEditor.press(pitch, true);
}

function noteUp(key: string) {
  const note = held.get(key);
  if (!note) return;
  held.delete(key);
  engine.noteOff(note.channelId, note.pitch);
  rollEditor.press(note.pitch, false);
  const up = engine.heardSteps();
  if (note.down === null || up === null || !note.patternId || !inRollRange(note.pitch)) return;
  const pat = findPattern(project(), note.patternId);
  if (!pat) return;
  const n = recordedNote({
    downSteps: note.down.local,
    upSteps: note.down.local + Math.max(0, up - note.down.heard),
    pitch: note.pitch,
    velocity: note.velocity,
    grid: store.get().prefs.quantize,
    totalSteps: patternSteps(pat, project().timeSig),
  });
  edit((p) => addNote(p, note.patternId!, n), take, Infinity);
}

/**
 * Where a key press lands inside the melody being recorded, or null if it is
 * not being recorded. In Pattern mode the melody loops (with any backing); in
 * Song mode the note goes into whichever clip of the melody is playing.
 */
function recordPosition(target: MelodyPattern): { local: number; heard: number } | null {
  const s = store.get();
  if (!s.recordArmed || !running() || s.current !== target.id) return null;
  const raw = engine.heardSteps();
  // Notes played during most of the count-in are ignored; ones just before
  // the downbeat snap onto it.
  if (raw === null || raw < -0.5) return null;
  const heard = Math.max(0, raw);
  const length = patternSteps(target, s.project.timeSig);
  if (s.mode === "pattern") return { local: positionInPattern(heard, engine.loopSteps(), length), heard };
  if (s.prefs.recordWith !== "song") return null;
  const songStep = positionInPattern(heard, engine.loopSteps(), Infinity);
  const at = clipAt(s.project, target.id, Math.floor(songStep));
  return at ? { local: at.local + (songStep - Math.floor(songStep)), heard } : null;
}

function releaseAllKeys() {
  for (const key of [...held.keys()]) noteUp(key);
}

function onMidi(e: MidiEvent) {
  if (e.type === "on") noteDown(`m${e.pitch}`, e.pitch, e.velocity);
  else noteUp(`m${e.pitch}`);
}

/* ---------- Channel settings and mixer ---------- */

/** Open the system file picker for an audio file. */
const audioInput = h("input", { type: "file", accept: "audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff", class: "sr-only", tabindex: -1, "aria-hidden": "true" });
let audioPicked: ((file: File) => void) | null = null;
audioInput.addEventListener("change", () => {
  const f = audioInput.files?.[0];
  if (f && audioPicked) audioPicked(f);
  audioInput.value = "";
});
function pickAudio(fn: (file: File) => void) {
  audioPicked = fn;
  audioInput.click();
}

/** The bundled sample library, listed in public/samples/manifest.json when there is one. */
let library: LibrarySample[] = [];
void fetch(`${import.meta.env.BASE_URL}samples/manifest.json`)
  .then((r) => (r.ok ? r.json() : []))
  .then((list: unknown) => {
    if (!Array.isArray(list)) return;
    library = list.filter(
      (x): x is LibrarySample =>
        typeof x?.id === "string" && typeof x?.name === "string" && typeof x?.url === "string" && typeof x?.group === "string",
    );
    sidebar.setLibrary(library);
    render();
  })
  .catch(() => undefined);

async function loadIntoChannel(channelId: string, file: File) {
  const sampleId = makeId("s");
  try {
    await bank.importFile(file, sampleId);
  } catch (err) {
    toast.show(err instanceof Error ? err.message : "That file could not be loaded.", "error");
    return;
  }
  const name = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Sample";
  edit((p) => setChannelSample(addSample(p, { id: sampleId, name, source: "user", root: 60 }), channelId, sampleId));
  toast.show(`${name} loaded.`);
}

const channelSettings = createChannelSettings(
  () => store.get(),
  {
    close: () => store.set({ openChannel: null }),
    rename: (id, name) => edit((p) => renameChannel(p, id, name)),
    setSound: (id, sound) => edit((p) => setChannelSample(setChannelSound(p, id, sound), id, null)),
    setSample(id, sample) {
      if (sample?.startsWith("lib:")) {
        const item = library.find((x) => `lib:${x.id}` === sample);
        if (!item) return;
        const sampleId = `lib-${item.id}`;
        edit((p) => setChannelSample(addSample(p, { id: sampleId, name: item.name, source: "bundled", url: item.url, root: item.root }), id, sampleId));
        return;
      }
      edit((p) => setChannelSample(p, id, sample));
    },
    loadFile: (id, file) => void loadIntoChannel(id, file),
    setRoot: (sampleId, root) =>
      edit((p) => {
        const info = p.samples.find((x) => x.id === sampleId);
        return info ? addSample(p, { ...info, root }) : p;
      }),
    setTone: (id, patch) => edit((p) => setChannelTone(p, id, patch), `tone-${id}-${Object.keys(patch).join()}`),
    setPan: (id, pan) => edit((p) => setChannelPan(p, id, pan), `pan-${id}`),
    reset: (id) => edit((p) => resetChannelSound(p, id)),
  },
  () => library,
);

const mixer = createMixer({
  close: () => store.set({ mixerOpen: false }),
  setFx: (id, patch) => edit((p) => setChannelFx(p, id, patch), `fx-${id}-${Object.keys(patch).join()}`),
  setPan: (id, pan) => edit((p) => setChannelPan(p, id, pan), `pan-${id}`),
  setVolume: (id, volume) => edit((p) => setChannelMix(p, id, { volume }), `vol-${id}`),
  setMute: (id, muted) => edit((p) => setChannelMix(p, id, { muted })),
  setSolo: (id, solo) => edit((p) => setChannelMix(p, id, { solo })),
  setMaster: (patch) => edit((p) => setMaster(p, patch), `master-${Object.keys(patch).join()}`),
  openSettings: (id) => store.set({ openChannel: id }),
});
function toggleMixer() {
  store.set((s) => ({ mixerOpen: !s.mixerOpen }));
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
    if (/\.midi?$/i.test(file.name)) {
      await openMidi(file);
      return;
    }
    if (file.size > 200_000_000) {
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
    for (const [id, b64] of Object.entries(result.sampleData)) await bank.putEmbedded(id, b64);
    bank.ensure(result.project.samples);
    replaceProject(result.project);
    toast.show(`Opened ${file.name}.`);
  },
  async saveFile() {
    const name = `steplab-${dateStamp()}.json`;
    const p = project();
    // Your own samples travel inside the file, so it opens anywhere.
    const data = await bank.embed(p.samples);
    downloadBlob(new Blob([serializeProject(p, true, data)], { type: "application/json" }), name);
    toast.show(`Saved ${name}.`);
  },
  async exportWav() {
    const s = store.get();
    const pat = s.mode === "pattern" ? findPattern(s.project, s.current) : undefined;
    toast.show(pat ? `Rendering ${pat.name}.` : "Rendering the song. Long songs take a few seconds.");
    try {
      // Loaded on first use so the main bundle stays small.
      const { renderWav } = await import("./audio/render");
      const blob = await renderWav(s.project, pat ? "pattern" : "song", pat?.id ?? null, (id) => bank.get(id));
      const slug = (pat?.name ?? "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "song";
      const name = `steplab-${slug}-${s.project.bpm}bpm.wav`;
      downloadBlob(blob, name);
      toast.show(`Exported ${name}.`);
    } catch {
      toast.show("The WAV export failed in this browser.", "error");
    }
  },
};
fileActions.exportMidi = () => {
  const s = store.get();
  const pat = s.mode === "pattern" ? findPattern(s.project, s.current) : undefined;
  const song = projectToMidi(s.project, pat?.id ?? null);
  if (!song.tracks.length) {
    toast.show("There are no notes to export yet.", "error");
    return;
  }
  const slug = (pat?.name ?? "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "song";
  const name = `steplab-${slug}-${s.project.bpm}bpm.mid`;
  downloadBlob(new Blob([encodeMidi(song)], { type: "audio/midi" }), name);
  toast.show(`Exported ${name}. Drag it into FL Studio's playlist or channel rack.`);
};

/** Add a MIDI file's melodies and drums to the song as new patterns. */
async function openMidi(file: File) {
  if (file.size > 5_000_000) {
    toast.show("That MIDI file is too big.", "error");
    return;
  }
  try {
    const song = decodeMidi(new Uint8Array(await file.arrayBuffer()));
    const base = file.name.replace(/\.midi?$/i, "").slice(0, 30) || "MIDI";
    const result = importMidi(project(), song, base);
    if (!result.patternIds.length) {
      toast.show("That MIDI file has no notes.", "error");
      return;
    }
    edit(() => result.project, null, undefined, { current: result.patternIds[0] ?? null });
    const extra = result.skipped ? ` ${result.skipped} notes did not fit and were left out.` : "";
    const tempo = song.bpm !== project().bpm ? ` The file was at ${song.bpm} BPM.` : "";
    toast.show(`Added ${result.patternIds.length} pattern${result.patternIds.length === 1 ? "" : "s"} from ${file.name}.${tempo}${extra}`);
  } catch (err) {
    toast.show(err instanceof Error ? err.message : "That MIDI file could not be read.", "error");
  }
}

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
// Example songs. Loading one is an ordinary edit, so Ctrl+Z returns to your own song.
const examplesWin = createExamplesWindow(PRESETS, (preset) => {
  stop();
  const next = preset.build();
  edit(() => next, null, undefined, {
    mode: "song",
    current: next.patterns[0]?.id ?? null,
    openDrums: null,
    openRoll: null,
    openChannel: null,
    selectedClip: null,
    backing: null,
  });
  examplesWin.hide();
  toast.show(`Loaded ${preset.name}. Press Space to play. Ctrl+Z brings back your song.`);
});
const examplesBtn = h(
  "button",
  { type: "button", class: "btn btn-small", title: "Load an example song", onclick: () => examplesWin.show() },
  "Examples",
);
const mixerBtn = h(
  "button",
  { type: "button", class: "btn btn-small", title: "Mixer (F9)", "aria-keyshortcuts": "F9", onclick: () => toggleMixer() },
  "Mixer",
);
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
      h("span", { class: "brand-tools" }, layoutSeg.el, examplesBtn, mixerBtn, helpBtn),
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
document.body.append(drumEditor.win.el, rollEditor.win.el, helpWin.el, channelSettings.win.el, mixer.win.el, examplesWin.el, audioInput);
paintStarfield();

function render() {
  const s = store.get();
  transport.update(s);
  sidebar.update(s);
  playlist.update(s);
  drumEditor.update(s);
  rollEditor.update(s);
  channelSettings.update(s);
  mixer.update(s);
  mixerBtn.setAttribute("aria-pressed", String(s.mixerOpen));
  files.setHistory(s.canUndo, s.canRedo);
  layoutSeg.setValue(s.prefs.layout);
  workspace.dataset.layout = s.prefs.layout;
  workspace.style.setProperty("--side-w", `${s.prefs.sidebarWidth}px`);
  splitter.setAttribute("aria-valuenow", String(s.prefs.sidebarWidth));
  for (const w of [drumEditor.win, rollEditor.win, helpWin, channelSettings.win, mixer.win, examplesWin]) {
    w.setLayout(s.prefs.layout);
    w.fit();
  }
  document.documentElement.style.setProperty("--step-w", `${s.prefs.zoom}px`);
}
window.addEventListener("resize", () => {
  for (const w of [drumEditor.win, rollEditor.win, helpWin, channelSettings.win, mixer.win, examplesWin]) w.fit();
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

/**
 * Tell the engine what to play. While recording with backing, the melody
 * loops together with the chosen patterns, and everything except the
 * recorded channel plays at the backing volume.
 */
let sourceKey = "";
let backingKey = "";
function syncEngineSource(s: AppState) {
  const target = recordTarget(s);
  const recordingHere = s.recordArmed && !!target && s.current === target.id;
  const layers =
    recordingHere && s.mode === "pattern" && s.prefs.recordWith === "backing"
      ? (s.backing ?? playsAlongside(s.project, target!.id)).filter((id) => id !== target!.id)
      : [];
  const key = `${s.mode}|${s.current}|${layers.join()}`;
  if (key !== sourceKey) {
    sourceKey = key;
    engine.setSource(s.mode, s.current, layers);
  }
  const duck = recordingHere && s.prefs.recordWith !== "alone" ? `${target!.channelId}|${s.prefs.backingLevel}` : "";
  if (duck !== backingKey) {
    backingKey = duck;
    engine.setBacking(duck ? target!.channelId : null, s.prefs.backingLevel);
  }
}

store.subscribe((s, prev) => {
  if (s.project !== prev.project) {
    engine.setProject(s.project);
    autosave(s.project);
    if (s.project.samples !== prev.project.samples) {
      bank.ensure(s.project.samples);
      store.set({ sampleStatus: sampleStatusFor(s.project) });
    }
  }
  syncEngineSource(s);
  if (s.playState !== prev.playState && s.playState === "stopped") take = `take-${++takeCount}`;
  render();
});
render();
syncEngineSource(store.get());

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
    F9: toggleMixer,
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
