/**
 * Map a 0..1 fader to decibels. Squaring the fader (gain = v * v) gives a
 * curve that feels even to the ear: halfway is about -12 dB, not -6 dB.
 * Zero is true silence.
 */
export function volumeToDb(volume: number): number {
  const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
  if (v === 0) return -Infinity;
  return 40 * Math.log10(v);
}

/** A short spoken form for a fader, used in accessible labels. */
export function volumePercent(volume: number): string {
  return `${Math.round(Math.min(1, Math.max(0, volume)) * 100)}%`;
}
