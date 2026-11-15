import { h } from "./dom";

/**
 * Browsers keep audio switched off until the visitor interacts with the page.
 * This screen makes that moment obvious instead of a silent first Play.
 */
export function showStartOverlay(app: HTMLElement, onStart: () => Promise<void>): void {
  app.inert = true;
  const error = h("p", { class: "start-error", role: "alert" });
  const button = h("button", { type: "button", class: "btn btn-start" }, "Click to start");
  const overlay = h(
    "div",
    { class: "start", role: "dialog", "aria-modal": "true", "aria-labelledby": "start-title" },
    h(
      "div",
      { class: "start-card" },
      h("h1", { id: "start-title", class: "logo" }, "Steplab"),
      h("p", { class: "start-lede" }, "A tiny beat maker. Six drums, two melodies, one loop."),
      button,
      h("p", { class: "start-note" }, "Your browser keeps sound off until you click. Headphones recommended."),
      error,
    ),
  );
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Starting...";
    try {
      await onStart();
      overlay.remove();
      app.inert = false;
    } catch {
      button.disabled = false;
      button.textContent = "Try again";
      error.textContent = "Audio could not start in this browser. Check that sound is allowed for this page.";
    }
  });
  document.body.append(overlay);
  button.focus();
}
