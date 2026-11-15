/**
 * Paint a still starfield once and use it as a repeating page background.
 * A seeded random generator keeps the sky the same on every visit, and
 * nothing moves, so it stays out of the way of the music.
 */
export function paintStarfield(size = 900): void {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let seed = 20261115;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const tints = ["255,255,255", "200,215,255", "255,235,215", "215,200,255"];
  for (let i = 0; i < 220; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const big = rand() > 0.94;
    const r = big ? 1 + rand() * 0.8 : 0.35 + rand() * 0.6;
    const alpha = big ? 0.55 + rand() * 0.35 : 0.15 + rand() * 0.45;
    const tint = tints[Math.floor(rand() * tints.length)]!;
    if (big) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      glow.addColorStop(0, `rgba(${tint},${alpha * 0.35})`);
      glow.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
    ctx.fillStyle = `rgba(${tint},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  try {
    document.documentElement.style.setProperty("--stars", `url(${canvas.toDataURL("image/png")})`);
  } catch {
    // Without the image the plain space gradient still shows.
  }
}
