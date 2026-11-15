import { midiToName, midiToSpoken } from "../core/notes";
import { keyboardLayout, type KeyboardRow } from "../core/pianoKeys";
import type { MelodyPattern } from "../core/types";
import { h, setAttr } from "./dom";

export interface DockActions {
  /** A finger went down on a key; `id` tells fingers apart. */
  noteDown(id: string, pitch: number): void;
  noteUp(id: string): void;
  shiftOctave(dir: 1 | -1): void;
  setKeyboardOpen(open: boolean): void;
  selectMelody(id: string): void;
  newMelody(): void;
}

export interface DockView {
  keyboardOpen: boolean;
  base: number;
  melodies: MelodyPattern[];
  /** The melody new notes record into, if any. */
  target: MelodyPattern | undefined;
  /** Name of the sound the keys play. */
  sound: string;
  /** The keys are playing a sound from the sound browser, not a melody's channel. */
  trying: boolean;
  recordArmed: boolean;
}

const NEW = "__new";

/**
 * The play and record dock for phones and tablets. It sits at the bottom of
 * the screen, over everything, so Play and Record stay in reach while the
 * on-screen keyboard is open, but well clear of the keys. The transport
 * buttons are moved in here from the top bar (see main.ts), so there is only
 * ever one of each.
 */
export function createDock(actions: DockActions) {
  const bar = h("div", { class: "dock-bar" });

  const melodySelect = h("select", {
    class: "select dock-melody",
    "aria-label": "Melody to play and record into",
    onchange: () => {
      if (melodySelect.value === NEW) actions.newMelody();
      else actions.selectMelody(melodySelect.value);
    },
  });
  const octaveLabel = h("span", { class: "octave-label", "aria-live": "polite" });
  const octave = h(
    "span",
    { class: "octave", role: "group", "aria-label": "Keyboard octave" },
    h("button", { type: "button", class: "mini", "aria-label": "Octave down", onclick: () => actions.shiftOctave(-1) }, "-"),
    octaveLabel,
    h("button", { type: "button", class: "mini", "aria-label": "Octave up", onclick: () => actions.shiftOctave(1) }, "+"),
  );
  const recNote = h("span", { class: "dock-rec-note" });
  const head = h("div", { class: "dock-head" }, melodySelect, recNote, octave);

  const piano = h("div", { class: "piano", role: "group", "aria-label": "Keyboard" });
  const keysPanel = h("div", { class: "dock-keys", hidden: true }, head, piano);

  const keysToggle = h(
    "button",
    {
      type: "button",
      class: "btn btn-keys",
      "aria-expanded": "false",
      "aria-controls": "dock-keys",
      title: "Show or hide the keyboard",
      onclick: () => actions.setKeyboardOpen(keysToggle.getAttribute("aria-expanded") !== "true"),
    },
    h("span", { class: "keys-icon", "aria-hidden": "true" }),
    h("span", {}, "Keys"),
  );
  keysPanel.id = "dock-keys";
  const tools = h("div", { class: "dock-tools" }, keysToggle);
  bar.append(tools);

  // Transport on top, keys at the bottom edge where thumbs rest, with the
  // melody row between them, so a missed key never lands on Stop or Record.
  const el = h("div", { class: "dock", role: "region", "aria-label": "Play, record and keyboard" }, bar, keysPanel);

  /* ---------- Keys ---------- */

  const keyEls = new Map<number, HTMLElement>();
  let built = "";

  function buildRows(rows: KeyboardRow[]) {
    keyEls.clear();
    piano.replaceChildren(
      ...rows.map((row) => {
        const rowEl = h("div", { class: "piano-row" });
        rowEl.style.setProperty("--whites", String(row.whites));
        for (const k of row.keys) {
          const key = h(
            "button",
            {
              type: "button",
              class: k.black ? "pkey pkey-black" : "pkey",
              tabindex: -1,
              "aria-label": midiToSpoken(k.pitch),
              "data-pitch": k.pitch,
            },
            !k.black && k.pitch % 12 === 0 ? h("span", { class: "pkey-name" }, midiToName(k.pitch)) : null,
          );
          // White keys fill their slot; black keys straddle the line after their white key.
          key.style.setProperty("--at", String(k.black ? k.white + 1 : k.white));
          rowEl.append(key);
          keyEls.set(k.pitch, key);
        }
        return rowEl;
      }),
    );
  }

  // Each finger is its own pointer. Sliding a finger moves to the key under
  // it, like a glissando, and a finger lifting ends only its own note.
  const fingers = new Map<number, number>();
  const pitchAt = (x: number, y: number): number | null => {
    const key = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(".pkey");
    return key && piano.contains(key) ? Number(key.dataset.pitch) : null;
  };
  let lastKeyTouch = -Infinity;
  const press = (pointer: number, pitch: number) => {
    lastKeyTouch = performance.now();
    fingers.set(pointer, pitch);
    actions.noteDown(`t${pointer}`, pitch);
    keyEls.get(pitch)?.classList.add("is-down");
  };
  const lift = (pointer: number) => {
    const pitch = fingers.get(pointer);
    if (pitch === undefined) return;
    lastKeyTouch = performance.now();
    fingers.delete(pointer);
    actions.noteUp(`t${pointer}`);
    if (![...fingers.values()].includes(pitch)) keyEls.get(pitch)?.classList.remove("is-down");
  };
  piano.addEventListener("pointerdown", (e) => {
    const pitch = pitchAt(e.clientX, e.clientY);
    if (pitch === null) return;
    e.preventDefault();
    try {
      piano.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; the note still plays until it lifts.
    }
    press(e.pointerId, pitch);
  });
  piano.addEventListener("pointermove", (e) => {
    if (!fingers.has(e.pointerId)) return;
    const pitch = pitchAt(e.clientX, e.clientY);
    if (pitch === null || pitch === fingers.get(e.pointerId)) return;
    lift(e.pointerId);
    press(e.pointerId, pitch);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    piano.addEventListener(type, (e) => lift(e.pointerId));
  }
  piano.addEventListener("contextmenu", (e) => e.preventDefault());
  // A tap is a finger-down (which plays the key) and then a click. Phones snap
  // that click onto the nearest button, which could be the octave + just above
  // the keys. Cancelling the touch here means the keys never produce a click.
  piano.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

  // And in case one gets through: while a finger is on the keys, or just
  // after, the melody picker and octave buttons ignore touches.
  const playingKeys = () => fingers.size > 0 || performance.now() - lastKeyTouch < 500;
  for (const type of ["pointerdown", "mousedown", "touchstart", "click"] as const) {
    head.addEventListener(
      type,
      (e) => {
        if (!playingKeys()) return;
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true, passive: false },
    );
  }

  let base = 48;
  function layout() {
    if (keysPanel.hidden) return;
    const width = piano.clientWidth || el.clientWidth;
    const rows = keyboardLayout(base, width);
    const key = rows.map((r) => `${r.low}:${r.keys.length}`).join("|");
    if (key === built) return;
    for (const p of [...fingers.keys()]) lift(p);
    built = key;
    buildRows(rows);
  }
  new ResizeObserver(layout).observe(piano);

  return {
    el,
    bar,
    tools,
    update(v: DockView) {
      keysPanel.hidden = !v.keyboardOpen;
      setAttr(keysToggle, "aria-expanded", String(v.keyboardOpen));
      keysToggle.classList.toggle("is-on", v.keyboardOpen);
      if (v.base !== base) {
        base = v.base;
        built = "";
      }
      layout();
      const rows = keyboardLayout(base, piano.clientWidth || 360);
      const low = Math.min(...rows.map((r) => r.low));
      const high = Math.max(...rows.flatMap((r) => r.keys.map((k) => k.pitch)));
      octaveLabel.textContent = `${midiToName(low)} to ${midiToName(high)}`;

      const optKey = `${v.melodies.map((m) => `${m.id}:${m.name}`).join("|")}|${v.target?.id ?? ""}`;
      if (melodySelect.dataset.key !== optKey) {
        melodySelect.dataset.key = optKey;
        melodySelect.replaceChildren(
          ...(v.target ? [] : [h("option", { value: "", disabled: true }, "Pick a melody")]),
          ...v.melodies.map((m) => h("option", { value: m.id }, m.name)),
          h("option", { value: NEW }, "New melody"),
        );
        melodySelect.value = v.target?.id ?? "";
      }
      // While trying a sound, the melody picker does not apply, so the sound name takes its place.
      melodySelect.hidden = v.trying;
      recNote.textContent = v.trying ? v.sound : v.recordArmed ? (v.target ? "Recording" : "Pick a melody") : v.sound;
      recNote.classList.toggle("is-rec", v.recordArmed && !v.trying);
    },
  };
}
