import "./styles/app.css";
import { Engine } from "./audio/engine";
import {
  clearDrums,
  clearMelody,
  demoProject,
  emptyProject,
  setBpm,
  setLoopBars,
  setSynth,
  setTrackMix,
  toggleDrumStep,
  toggleNote,
} from "./core/project";
import { parseProject, serializeProject } from "./core/serialize";
import type { Project } from "./core/types";
import { debounce, getStorage, loadAutosave, saveAutosave } from "./storage";
import { createDrumGrid } from "./ui/drumGrid";
import { h } from "./ui/dom";
import { createFileBar, createToast, dateStamp, downloadBlob } from "./ui/fileBar";
import { createMelodyPanel } from "./ui/melodyPanel";
import { showStartOverlay } from "./ui/startOverlay";
import { createStore } from "./ui/store";
import { createTransport } from "./ui/transport";

const storage = getStorage();
const initialProject = loadAutosave(storage) ?? demoProject();
const store = createStore({ project: initialProject, playing: false, editBar: 0, activeMelody: 0 });
const engine = new Engine(initialProject);

function updateProject(fn: (p: Project) => Project): void {
  store.set((s) => ({ project: fn(s.project) }));
}

const play = () => {
  engine.play();
  store.set({ playing: engine.playing });
};
const stop = () => {
  engine.stop();
  store.set({ playing: false });
};
const togglePlay = () => (store.get().playing ? stop() : play());

const transport = createTransport({
  play,
  stop,
  setBpm: (bpm) => updateProject((p) => setBpm(p, bpm)),
  setBars: (bars) =>
    store.set((s) => ({
      project: setLoopBars(s.project, bars),
      editBar: Math.min(s.editBar, bars - 1),
    })),
});

const drums = createDrumGrid(initialProject.drums, {
  toggle(track, step) {
    const wasOn = store.get().project.drums[track]?.steps[step];
    updateProject((p) => toggleDrumStep(p, track, step));
    if (!wasOn) engine.previewDrum(track);
  },
  setMute: (track, muted) => updateProject((p) => setTrackMix(p, "drums", track, { muted })),
  setVolume: (track, volume) => updateProject((p) => setTrackMix(p, "drums", track, { volume })),
  setEditBar: (bar) => store.set({ editBar: bar }),
  clear: () => updateProject(clearDrums),
});

const melody = createMelodyPanel({
  toggle(track, step, row) {
    const wasOn = store.get().project.melodies[track]?.notes[step]?.includes(row);
    updateProject((p) => toggleNote(p, track, step, row));
    if (!wasOn) engine.previewNote(track, row);
  },
  setSynth: (track, synth) => updateProject((p) => setSynth(p, track, synth)),
  setMute: (track, muted) => updateProject((p) => setTrackMix(p, "melodies", track, { muted })),
  setVolume: (track, volume) => updateProject((p) => setTrackMix(p, "melodies", track, { volume })),
  setEditBar: (bar) => store.set({ editBar: bar }),
  setActive: (track) => store.set({ activeMelody: track }),
  clear: (track) => updateProject((p) => clearMelody(p, track)),
});

const toast = createToast();

/** Swap in a whole new project (New or Open). */
function replaceProject(project: Project) {
  store.set({ project, editBar: 0 });
}

const files = createFileBar({
  newProject() {
    const ok = window.confirm(
      "Start a new empty project? This replaces the current beat. Save it first if you want to keep it.",
    );
    if (!ok) return;
    replaceProject(emptyProject());
    toast.show("New empty project.");
  },
  async openFile(file) {
    if (file.size > 1_000_000) {
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

engine.setStepListener((step) => {
  drums.setPlayhead(step);
  melody.setPlayhead(step);
});

const app = document.getElementById("app")!;
app.append(
  h(
    "header",
    { class: "top" },
    h("div", { class: "brand" }, h("span", { class: "logo", "aria-hidden": "true" }, "Steplab")),
    transport.el,
    files.el,
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
    h("p", {}, h("kbd", {}, "P"), " play or stop"),
    h("p", {}, h("kbd", {}, "Arrows"), " move in a grid"),
    h("p", {}, h("kbd", {}, "Space"), " toggle a step"),
    h("p", {}, h("kbd", {}, "["), " ", h("kbd", {}, "]"), " change bar"),
    h("p", { class: "foot-save" }, "Your beat autosaves in this browser."),
  ),
  toast.el,
);

function render() {
  const s = store.get();
  transport.update(s);
  drums.update(s);
  melody.update(s);
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
  render();
});
render();

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    return !["range", "radio", "checkbox", "button"].includes(target.type);
  }
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

document.addEventListener("keydown", (e) => {
  if (app.inert || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
  const s = store.get();
  if (e.key === "p" || e.key === "P") {
    e.preventDefault();
    togglePlay();
  } else if (e.key === "[" || e.key === "]") {
    const next = s.editBar + (e.key === "]" ? 1 : -1);
    if (next >= 0 && next < s.project.bars) {
      e.preventDefault();
      store.set({ editBar: next });
    }
  }
});

showStartOverlay(app, async () => {
  await engine.start();
  transport.focusPlay();
});
