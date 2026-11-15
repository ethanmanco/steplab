import { h } from "./dom";

/**
 * The deep space backdrop behind the app: two layers of stars that drift
 * very slowly at different speeds (a gentle parallax), a faint galaxy band,
 * colored nebula light, a planet on the horizon and a few stars that
 * twinkle. Everything is painted once from a seeded random generator, so the
 * sky is the same on every visit. With reduced motion turned on, nothing
 * moves.
 */
export function paintStarfield(): void {
  let seed = 20261115;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;
  const tints = ["255,255,255", "200,215,255", "255,232,215", "214,198,255", "190,240,255"];

  function canvas(w: number, hgt: number, draw: (ctx: CanvasRenderingContext2D) => void): string | null {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = hgt;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    draw(ctx);
    try {
      return `url(${c.toDataURL("image/png")})`;
    } catch {
      return null;
    }
  }

  function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, glow: boolean) {
    const tint = tints[Math.floor(rand() * tints.length)]!;
    if (glow) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      g.addColorStop(0, `rgba(${tint},${alpha * 0.45})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    }
    ctx.fillStyle = `rgba(${tint},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Far layer: many small, dim stars.
  const far = canvas(1000, 1000, (ctx) => {
    for (let i = 0; i < 520; i++) star(ctx, rand() * 1000, rand() * 1000, 0.3 + rand() * 0.55, 0.12 + rand() * 0.4, false);
  });

  // Near layer: fewer, bigger and brighter, some with a soft glow.
  const near = canvas(1400, 1400, (ctx) => {
    for (let i = 0; i < 90; i++) {
      const big = rand() > 0.82;
      star(ctx, rand() * 1400, rand() * 1400, big ? 1.1 + rand() * 0.9 : 0.6 + rand() * 0.6, big ? 0.7 + rand() * 0.3 : 0.4 + rand() * 0.4, big);
    }
  });

  // A diagonal band of dust and tiny stars, like a distant galaxy seen edge on.
  const milky = canvas(1600, 1000, (ctx) => {
    const angle = -0.42;
    const cx = 800;
    const cy = 520;
    const along = (t: number, off: number) => ({
      x: cx + Math.cos(angle) * t - Math.sin(angle) * off,
      y: cy + Math.sin(angle) * t + Math.cos(angle) * off,
    });
    for (let i = 0; i < 70; i++) {
      const p = along((rand() - 0.5) * 1900, gauss() * 90);
      const r = 60 + rand() * 140;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const hue = rand() > 0.5 ? "150,120,255" : "110,170,255";
      g.addColorStop(0, `rgba(${hue},0.05)`);
      g.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 1400; i++) {
      const p = along((rand() - 0.5) * 1900, gauss() * 70);
      star(ctx, p.x, p.y, 0.25 + rand() * 0.45, 0.1 + rand() * 0.35, false);
    }
  });

  const root = document.documentElement.style;
  if (far) root.setProperty("--stars-far", far);
  if (near) root.setProperty("--stars-near", near);
  if (milky) root.setProperty("--milky", milky);

  // A handful of stars twinkle slowly, each on its own rhythm.
  const twinkles = Array.from({ length: 28 }, () => {
    const size = 1.5 + rand() * 2;
    return h("span", {
      class: "twinkle",
      style: `left:${(rand() * 100).toFixed(2)}%;top:${(rand() * 100).toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;animation-duration:${(3.5 + rand() * 5).toFixed(1)}s;animation-delay:-${(rand() * 8).toFixed(1)}s`,
    });
  });

  document.body.prepend(
    h(
      "div",
      { class: "cosmos", "aria-hidden": "true" },
      h("div", { class: "nebula" }),
      h("div", { class: "milky" }),
      h("div", { class: "stars stars-far" }),
      h("div", { class: "stars stars-near" }),
      h("div", { class: "twinkles" }, ...twinkles),
      h("div", { class: "planet" }),
    ),
  );
}
