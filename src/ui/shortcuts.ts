import { h } from "./dom";
import { createFloatingWindow } from "./floatingWindow";

/** The keyboard shortcuts, grouped the way FL Studio users look for them. */
export const SHORTCUTS: [string, [string, string][]][] = [
  [
    "Transport",
    [
      ["Space", "Play or stop (back to the start)"],
      ["Ctrl+Space", "Play or pause"],
      ["Esc", "Stop"],
      ["R", "Record on or off (Shift+R while computer keys are on)"],
      ["L", "Switch between Pattern and Song mode"],
      ["Numpad + / -", "Next or previous pattern"],
    ],
  ],
  [
    "Project",
    [
      ["Ctrl+S", "Save the project file"],
      ["Ctrl+O", "Open a project file"],
      ["Ctrl+R", "Export WAV"],
      ["MIDI button", "Export MIDI; Open also adds a .mid file to the song"],
      ["Ctrl+Z / Ctrl+Alt+Z", "Undo"],
      ["Ctrl+Y / Ctrl+Shift+Z", "Redo"],
    ],
  ],
  [
    "Windows",
    [
      ["F5", "Go to the playlist"],
      ["F6", "Go to the channel rack"],
      ["F7", "Open the piano roll"],
      ["F9", "Open or close the mixer"],
      ["F1", "Show these shortcuts"],
      ["Esc in a window", "Close it"],
    ],
  ],
  [
    "Playlist",
    [
      ["Drag", "Move a clip, snapped to the Snap setting"],
      ["Alt + drag", "Move or stretch without snapping"],
      ["Drag right edge", "Stretch a clip"],
      ["Right-click", "Delete a clip"],
      ["Double-click", "Edit the pattern"],
      ["Ctrl+B", "Duplicate the clip after itself"],
      ["Ctrl+C / Ctrl+V", "Copy and paste a clip"],
      ["Ctrl+D", "Deselect"],
      ["Delete", "Delete the selected clip"],
      ["Arrows", "Move the clip by the snap size or a track (Shift: one step)"],
      ["[ and ]", "Shorter or longer"],
      ["Ctrl + wheel", "Zoom"],
    ],
  ],
  [
    "Step sequencer and piano roll",
    [
      ["Left-click", "Add a step or note (drag to paint or stretch)"],
      ["Right-click", "Delete (drag to delete more)"],
      ["Arrows", "Move between steps"],
      ["Space or Enter", "Turn the focused step or note on or off"],
      ["Shift + Left / Right", "Make the focused note shorter or longer"],
      ["Z to M, Q to U", "Play notes (computer keys)"],
      ["- and =", "Computer keys octave down or up"],
    ],
  ],
];

export function createShortcutsWindow(onClose: () => void) {
  const win = createFloatingWindow({ className: "win-help", x: 200, y: 110, onClose });
  win.setTitle("Keyboard shortcuts");
  win.body.append(
    h(
      "div",
      { class: "help-body" },
      h("p", { class: "help-lede" }, "Steplab follows FL Studio shortcuts where it can, so they should feel familiar."),
      ...SHORTCUTS.map(([group, rows]) =>
        h(
          "section",
          { class: "help-group" },
          h("h3", {}, group),
          h(
            "dl",
            {},
            ...rows.flatMap(([keys, what]) => [h("dt", {}, ...keys.split(" / ").flatMap((k, i) => [i ? " / " : "", h("kbd", {}, k)])), h("dd", {}, what)]),
          ),
        ),
      ),
    ),
  );
  return win;
}
