import * as Tone from "tone";
import type { SampleInfo } from "./core/types";

/**
 * Where sample audio lives. User files are kept as raw bytes in the
 * browser's IndexedDB (localStorage is far too small for audio) and are
 * embedded in saved project files. Bundled samples load from the app. Both
 * are decoded once and shared by live playback and the WAV export.
 */
const DB_NAME = "steplab-samples";
const STORE = "audio";
export const MAX_SAMPLE_BYTES = 15_000_000;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < view.length; i += 0x8000) bin += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = Tone.getContext().rawContext as BaseAudioContext;
  return ctx.decodeAudioData(bytes.slice(0));
}

export function createSampleBank(onLoaded: () => void) {
  const buffers = new Map<string, AudioBuffer>();
  const pending = new Set<string>();
  const failed = new Set<string>();

  return {
    /** Decoded audio, if it has loaded. */
    get: (id: string) => buffers.get(id),
    failed: (id: string) => failed.has(id),

    /** Make sure every sample in a project is loading. Calls onLoaded as each one is ready. */
    ensure(samples: SampleInfo[]) {
      for (const s of samples) {
        if (buffers.has(s.id) || pending.has(s.id) || failed.has(s.id)) continue;
        pending.add(s.id);
        void (async () => {
          try {
            let bytes: ArrayBuffer | undefined;
            if (s.source === "bundled" && s.url) {
              const res = await fetch(`${import.meta.env.BASE_URL}${s.url}`);
              if (res.ok) bytes = await res.arrayBuffer();
            } else {
              bytes = await withStore<ArrayBuffer>("readonly", (st) => st.get(s.id));
            }
            if (!bytes) throw new Error("missing");
            buffers.set(s.id, await decode(bytes));
            onLoaded();
          } catch {
            failed.add(s.id);
            onLoaded();
          } finally {
            pending.delete(s.id);
          }
        })();
      }
    },

    /** Check, decode and store an audio file the user picked. */
    async importFile(file: File, id: string): Promise<AudioBuffer> {
      if (file.size > MAX_SAMPLE_BYTES) throw new Error("That file is over 15 MB. Trim it or pick a shorter one.");
      const bytes = await file.arrayBuffer();
      let buffer: AudioBuffer;
      try {
        buffer = await decode(bytes);
      } catch {
        throw new Error("That file could not be read as audio. Try a WAV, MP3, OGG or FLAC file.");
      }
      await withStore("readwrite", (st) => st.put(bytes, id));
      buffers.set(id, buffer);
      failed.delete(id);
      return buffer;
    },

    /** Store audio that came embedded in an opened project file. */
    async putEmbedded(id: string, b64: string) {
      const bytes = fromBase64(b64);
      await withStore("readwrite", (st) => st.put(bytes, id));
      failed.delete(id);
      try {
        buffers.set(id, await decode(bytes));
      } catch {
        failed.add(id);
      }
    },

    /** Raw bytes of user samples, base64 encoded, for embedding in a saved file. */
    async embed(samples: SampleInfo[]): Promise<Record<string, string>> {
      const out: Record<string, string> = {};
      for (const s of samples) {
        if (s.source !== "user") continue;
        const bytes = await withStore<ArrayBuffer>("readonly", (st) => st.get(s.id));
        if (bytes) out[s.id] = toBase64(bytes);
      }
      return out;
    },
  };
}

export type SampleBank = ReturnType<typeof createSampleBank>;
