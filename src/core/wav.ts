/**
 * Encode audio as a 16-bit PCM WAV file. Channels are interleaved and
 * samples are clamped to -1..1 first, so a loud mix clips instead of
 * wrapping around into noise.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length;
  if (numChannels === 0) throw new Error("No audio channels to encode.");
  const frames = channels[0]!.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i] ?? 0));
      view.setInt16(offset, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      offset += 2;
    }
  }
  return buffer;
}

/**
 * Which slice of an offline render makes a seamless loop. The loop is
 * rendered twice and the second pass is kept: it already contains the
 * tails (pad releases, open hats) that spill over from the end of the
 * first pass, exactly as they would when the loop repeats.
 */
export function loopSlice(loopSeconds: number, sampleRate: number): { start: number; end: number } {
  const frames = Math.round(loopSeconds * sampleRate);
  return { start: frames, end: frames * 2 };
}
