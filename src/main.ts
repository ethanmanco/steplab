import "./styles/app.css";
import { Engine } from "./audio/engine";
import { clearDrums, demoProject, setBpm, setLoopBars, setTrackMix, toggleDrumStep } from "./core/project";
import type { Project } from "./core/types";
import { createDrumGrid } from "./ui/drumGrid";
import { h } from "./ui/dom";
import { showStartOverlay } from "./ui/startOverlay";
import { createStore } from "./ui/store";
import { createTransport } from "./ui/transport";

const initialProject = demoProject();
const store = createStore({ project: initialProject, playing: false, editBar: 0 });
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

engine.setStepListener((step) => drums.setPlayhead(step));

const app = document.getElementById("app")!;
app.append(
  h(
    "header",
    { class: "top" },
    h("div", { class: "brand" }, h("span", { class: "logo", "aria-hidden": "true" }, "Steplab")),
    transport.el,
  ),
  h("main", { class: "main" }, h("h1", { class: "sr-only" }, "Steplab beat maker"), drums.el),
  h(
    "footer",
    { class: "foot" },
    h("p", {}, h("kbd", {}, "P"), " play or stop"),
    h("p", {}, h("kbd", {}, "Arrows"), " move in a grid"),
    h("p", {}, h("kbd", {}, "Space"), " toggle a step"),
    h("p", {}, h("kbd", {}, "["), " ", h("kbd", {}, "]"), " change bar"),
  ),
);

function render() {
  const s = store.get();
  transport.update(s);
  drums.update(s);
}
store.subscribe((s, prev) => {
  if (s.project !== prev.project) engine.setProject(s.project);
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
