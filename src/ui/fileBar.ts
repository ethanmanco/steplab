import { h } from "./dom";

export interface FileActions {
  newProject(): void;
  openFile(file: File): void;
  saveFile(): void;
  exportWav?: () => Promise<void>;
  exportMidi?: () => void;
  undo(): void;
  redo(): void;
}

/** Project file buttons: New, Open, Save, and WAV export. */
export function createFileBar(actions: FileActions) {
  const input = h("input", {
    type: "file",
    accept: ".json,.mid,.midi,application/json,audio/midi,audio/x-midi",
    class: "sr-only",
    tabindex: -1,
    "aria-hidden": "true",
    onchange: () => {
      const file = input.files?.[0];
      if (file) actions.openFile(file);
      input.value = "";
    },
  });

  const btn = (text: string, label: string, onclick: () => void) =>
    h("button", { type: "button", class: "btn btn-small", "aria-label": label, title: label, onclick }, text);

  const exportWav = actions.exportWav;
  const wav: HTMLButtonElement = btn("WAV", "Export loop as WAV", async () => {
    if (!exportWav) return;
    wav.disabled = true;
    wav.textContent = "Rendering...";
    try {
      await exportWav();
    } finally {
      wav.disabled = false;
      wav.textContent = "WAV";
    }
  });

  // aria-disabled instead of disabled, so focus is not lost when undo runs out.
  const undoBtn = btn("Undo", "Undo (Ctrl+Z)", () => {
    if (undoBtn.getAttribute("aria-disabled") !== "true") actions.undo();
  });
  const redoBtn = btn("Redo", "Redo (Ctrl+Shift+Z)", () => {
    if (redoBtn.getAttribute("aria-disabled") !== "true") actions.redo();
  });

  // Undo and redo stay in the main row; the file buttons fold into the More panel.
  const history = h("span", { class: "btn-pair", role: "group", "aria-label": "History" }, undoBtn, redoBtn);
  const el = h(
    "div",
    { class: "files", role: "group", "aria-label": "Project file" },
    btn("New", "New project", actions.newProject),
    btn("Open", "Open a project file, or a MIDI file to add to the song", () => input.click()),
    btn("Save", "Save project file", actions.saveFile),
    exportWav ? wav : null,
    actions.exportMidi ? btn("MIDI", "Export MIDI for FL Studio and other DAWs", actions.exportMidi) : null,
    input,
  );
  return {
    el,
    history,
    /** Open the file picker, for Ctrl+O. */
    pickFile: () => input.click(),
    setHistory(canUndo: boolean, canRedo: boolean) {
      undoBtn.setAttribute("aria-disabled", String(!canUndo));
      redoBtn.setAttribute("aria-disabled", String(!canRedo));
    },
  };
}

/** A short message at the bottom of the screen, also read by screen readers. */
export function createToast() {
  const el = h("p", { class: "toast", role: "status", "aria-live": "polite" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    el,
    show(message: string, kind: "info" | "error" = "info") {
      el.textContent = message;
      el.dataset.kind = kind;
      el.classList.add("show");
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove("show"), kind === "error" ? 7000 : 4000);
    },
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename, class: "sr-only" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function dateStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
