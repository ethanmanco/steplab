import { h } from "./dom";

export interface FileActions {
  newProject(): void;
  openFile(file: File): void;
  saveFile(): void;
  exportWav?: () => Promise<void>;
}

/** Project file buttons: New, Open, Save, and WAV export. */
export function createFileBar(actions: FileActions) {
  const input = h("input", {
    type: "file",
    accept: ".json,application/json",
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

  const el = h(
    "div",
    { class: "files", role: "group", "aria-label": "Project" },
    btn("New", "New project", actions.newProject),
    btn("Open", "Open project file", () => input.click()),
    btn("Save", "Save project file", actions.saveFile),
    exportWav ? wav : null,
    input,
  );
  return { el };
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
