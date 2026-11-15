import { h, nextId } from "./dom";

let topZ = 40;

/**
 * An editor window that floats over the playlist, like the piano roll and
 * channel rack windows in FL Studio. Drag it by its title bar, resize it from
 * the corner, close it with the button or Escape. On phones it fills the
 * screen instead.
 */
export function createFloatingWindow(opts: {
  className: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const titleId = nextId("win");
  const title = h("h2", { id: titleId, class: "win-title" });
  const tools = h("div", { class: "win-tools" });
  const close = h(
    "button",
    { type: "button", class: "mini win-close", "aria-label": "Close window", title: "Close (Esc)", onclick: () => opts.onClose() },
    "×",
  );
  const bar = h("div", { class: "win-bar" }, title, tools, close);
  const body = h("div", { class: "win-body" });
  const el = h(
    "section",
    { class: `win ${opts.className}`, role: "dialog", "aria-labelledby": titleId, hidden: true },
    bar,
    body,
  );
  el.style.left = `${opts.x}px`;
  el.style.top = `${opts.y}px`;

  const raise = () => {
    topZ += 1;
    el.style.zIndex = String(topZ);
  };
  el.addEventListener("pointerdown", raise, true);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      opts.onClose();
    }
  });

  // Drag by the title bar, keeping at least part of the window on screen.
  let drag: { dx: number; dy: number } | null = null;
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, select")) return;
    if (window.matchMedia("(max-width: 720px)").matches) return;
    drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const x = Math.min(window.innerWidth - 120, Math.max(-el.offsetWidth + 120, e.clientX - drag.dx));
    const y = Math.min(window.innerHeight - 40, Math.max(0, e.clientY - drag.dy));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });
  const end = () => {
    drag = null;
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);

  let lastFocus: HTMLElement | null = null;
  return {
    el,
    body,
    tools,
    setTitle(text: string) {
      if (title.textContent !== text) title.textContent = text;
    },
    get open() {
      return !el.hidden;
    },
    show() {
      if (!el.hidden) return;
      lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.hidden = false;
      raise();
      close.focus();
    },
    hide() {
      if (el.hidden) return;
      const hadFocus = el.contains(document.activeElement);
      el.hidden = true;
      if (hadFocus && lastFocus?.isConnected) lastFocus.focus();
    },
  };
}
