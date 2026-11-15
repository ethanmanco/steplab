import { filterSounds, soundCatalog, type LibraryEntry, type SoundCategory, type SoundItem } from "../core/soundCatalog";
import { segmented } from "./controls";
import { h, setAttr } from "./dom";
import { createFloatingWindow } from "./floatingWindow";
import { isTouch, type AppState } from "./store";

export interface SoundBrowserActions {
  close(): void;
  /** Hear a sound, and make it the one your keys play while the browser is open. */
  audition(item: SoundItem): void;
  add(item: SoundItem): void;
  addFile(kind: "drum" | "synth"): void;
}

export interface BrowserView {
  /** The sound being tried. */
  selected: string | null;
  /** A recorded sound still downloading. */
  loading: string | null;
}

const CATEGORIES: { value: SoundCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "drums", label: "Drums" },
  { value: "synths", label: "Synths" },
  { value: "recorded", label: "Recorded" },
];

/**
 * The sound browser, like FL Studio's: every sound you can add as a channel,
 * with a search box. Tap a sound to hear it (it plays over the song if the
 * song is playing), then Add it. While the browser is open your keys play the
 * sound you picked: the computer keyboard, a MIDI keyboard or the on-screen
 * keys on a phone.
 */
export function createSoundBrowser(actions: SoundBrowserActions) {
  const win = createFloatingWindow({ className: "win-sounds", x: 300, y: 110, onClose: actions.close });
  win.setTitle("Add a channel");

  let items: SoundItem[] = soundCatalog([]);
  let query = "";
  let category: SoundCategory = "all";
  let view: BrowserView = { selected: null, loading: null };

  const search = h("input", {
    type: "search",
    class: "text-input sound-search",
    placeholder: "Search sounds",
    "aria-label": "Search sounds",
    oninput: () => {
      query = search.value;
      renderList();
    },
  });
  const filter = segmented<SoundCategory>({
    legend: "Show",
    hideLegend: true,
    options: CATEGORIES,
    value: "all",
    onChange: (c) => {
      category = c;
      renderList();
    },
    className: "seg-sounds",
  });
  const lede = h(
    "p",
    { class: "sounds-lede" },
    h("span", { class: "touch-hide" }, "Click a sound to hear it, then Add it. While this is open, your computer keys and MIDI keyboard play the sound you picked."),
    h("span", { class: "touch-only" }, "Tap a sound to hear it, then Add it. Open Keys to play the sound you picked."),
  );
  const list = h("ul", { class: "sound-list", role: "list", "aria-label": "Sounds" });
  const empty = h("p", { class: "sounds-empty", hidden: true }, "No sounds match.");
  const own = h(
    "div",
    { class: "sounds-own", role: "group", "aria-label": "Your own audio" },
    h("span", { class: "field-label" }, "Your own audio"),
    h("button", { type: "button", class: "btn btn-small", title: "Load a file to play once per hit, like a drum", onclick: () => actions.addFile("drum") }, "One shot"),
    h("button", { type: "button", class: "btn btn-small", title: "Load a file to play at any pitch in melodies", onclick: () => actions.addFile("synth") }, "Pitched"),
  );
  win.body.append(h("div", { class: "sounds-body" }, lede, h("div", { class: "sounds-controls" }, search, filter.el), list, empty, own));

  const rows = new Map<string, { li: HTMLElement; main: HTMLButtonElement; status: HTMLElement }>();

  function row(item: SoundItem) {
    const status = h("span", { class: "sound-status", "aria-live": "polite" });
    const main = h(
      "button",
      { type: "button", class: "sound-main", "aria-pressed": "false", title: "Hear it", onclick: () => actions.audition(item) },
      h("span", { class: "swatch", "aria-hidden": "true" }),
      h("span", { class: "sound-name" }, item.name),
      status,
    );
    const add = h(
      "button",
      { type: "button", class: "btn btn-small sound-add", "aria-label": `Add ${item.name} as a channel`, onclick: () => actions.add(item) },
      "Add",
    );
    // Recorded sounds get a neutral swatch; built-in ones their channel color.
    const li = h("li", { class: "sound", "data-sound": item.library ? "sample" : item.sound, "data-kind": item.kind }, main, add);
    rows.set(item.id, { li, main, status });
    return li;
  }

  function renderList() {
    const shown = filterSounds(items, query, category);
    const out: HTMLElement[] = [];
    let section = "";
    for (const item of shown) {
      if (item.section !== section) {
        section = item.section;
        out.push(h("li", { class: "sound-section", "aria-hidden": "true" }, section));
      }
      out.push(rows.get(item.id)?.li ?? row(item));
    }
    list.replaceChildren(...out);
    empty.hidden = shown.length > 0;
    paint();
  }

  function paint() {
    for (const [id, r] of rows) {
      setAttr(r.main, "aria-pressed", String(id === view.selected));
      r.li.classList.toggle("is-selected", id === view.selected);
      const text = id === view.loading ? "Loading..." : id === view.selected ? "Playing on your keys" : "";
      if (r.status.textContent !== text) r.status.textContent = text;
    }
  }

  renderList();

  return {
    win,
    setLibrary(library: LibraryEntry[]) {
      items = soundCatalog(library);
      rows.clear();
      renderList();
    },
    update(s: AppState, v: BrowserView) {
      if (!s.soundsOpen) {
        win.hide();
        return;
      }
      const opening = !win.open;
      win.show();
      // On touch screens focusing the search box would pop up the phone's keyboard.
      if (opening && !isTouch()) search.focus();
      if (v.selected !== view.selected || v.loading !== view.loading) {
        view = v;
        paint();
      }
    },
  };
}
