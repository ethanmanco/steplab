import { h } from "./dom";

/**
 * A still deep-sky backdrop in the style of a Hubble deep field: near-black
 * space, faint stars of slightly different colors, a few bright ones with
 * four-point diffraction spikes, and tiny smudges of distant galaxies.
 * Painted once from a seeded random generator, so the sky is the same on
 * every visit, and nothing moves.
 */
export function paintStarfield(): void {
  let seed = 20261115;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  // Mostly white, some blue-white and some warm, as real star colors run.
  const tints = ["255,255,255", "255,255,255", "214,226,255", "200,214,255", "255,240,224", "255,226,196"];
  const tint = () => tints[Math.floor(rand() * tints.length)]!;

  const size = 1600;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return;

  const dot = (x: number, y: number, r: number, color: string, alpha: number) => {
    ctx.fillStyle = `rgba(${color},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Distant galaxies: small, faint, slightly elongated smudges.
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 2 + rand() * 6;
    const color = rand() > 0.5 ? "255,236,214" : "214,222,255";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.scale(1, 0.3 + rand() * 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, `rgba(${color},${0.16 + rand() * 0.14})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, len, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The faint background: hundreds of tiny, dim stars.
  for (let i = 0; i < 900; i++) {
    dot(rand() * size, rand() * size, 0.3 + rand() * 0.45, tint(), 0.1 + rand() * 0.35);
  }

  // Middle stars.
  for (let i = 0; i < 110; i++) {
    dot(rand() * size, rand() * size, 0.6 + rand() * 0.5, tint(), 0.45 + rand() * 0.35);
  }

  // A few bright stars with the four diffraction spikes a telescope's mirror supports draw.
  for (let i = 0; i < 9; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const color = tint();
    const spike = 7 + rand() * 12;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, 6);
    halo.addColorStop(0, `rgba(${color},0.5)`);
    halo.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(x - 6, y - 6, 12, 12);
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const line = ctx.createLinearGradient(x - dx * spike, y - dy * spike, x + dx * spike, y + dy * spike);
      line.addColorStop(0, `rgba(${color},0)`);
      line.addColorStop(0.5, `rgba(${color},0.55)`);
      line.addColorStop(1, `rgba(${color},0)`);
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - dx * spike, y - dy * spike);
      ctx.lineTo(x + dx * spike, y + dy * spike);
      ctx.stroke();
    }
    dot(x, y, 1.2 + rand() * 0.6, color, 0.95);
  }

  try {
    document.documentElement.style.setProperty("--stars", `url(${c.toDataURL("image/png")})`);
  } catch {
    // Without the image the plain black sky still shows.
  }
  document.body.prepend(h("div", { class: "cosmos", "aria-hidden": "true" }));
}
