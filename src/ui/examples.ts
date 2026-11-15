import type { Preset } from "../core/presets";
import { h } from "./dom";
import { createFloatingWindow } from "./floatingWindow";

/** A window listing the example songs, each with a Load button. */
export function createExamplesWindow(presets: Preset[], onLoad: (preset: Preset) => void) {
  const win = createFloatingWindow({ className: "win-examples", x: 260, y: 120, onClose: () => win.hide() });
  win.setTitle("Example songs");
  win.body.append(
    h(
      "div",
      { class: "examples-body" },
      h(
        "p",
        { class: "help-lede" },
        "Load an example to hear what Steplab can do, or to start from it. Your current song is replaced, and Ctrl+Z brings it back.",
      ),
      h(
        "ul",
        { class: "example-list", role: "list" },
        ...presets.map((preset) =>
          h(
            "li",
            { class: "example" },
            h("div", { class: "example-text" }, h("h3", {}, preset.name), h("p", {}, preset.description)),
            h(
              "button",
              { type: "button", class: "btn btn-small", "aria-label": `Load ${preset.name}`, onclick: () => onLoad(preset) },
              "Load",
            ),
          ),
        ),
      ),
    ),
  );
  return win;
}
