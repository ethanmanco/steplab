import { describe, expect, it } from "vitest";
import manifestJson from "../public/samples/manifest.json";
import { filterSounds, soundCatalog, type LibraryEntry } from "../src/core/soundCatalog";
import { DRUM_IDS, SYNTH_IDS } from "../src/core/types";

const library = manifestJson as LibraryEntry[];
const all = soundCatalog(library);

describe("soundCatalog", () => {
  it("lists every built-in drum and synth and every recorded sound once", () => {
    expect(all).toHaveLength(DRUM_IDS.length + SYNTH_IDS.length + library.length);
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
  });

  it("starts with the 808 kit, the sounds most songs here use", () => {
    expect(all[0]).toMatchObject({ id: "drum:kick808", section: "808 kit", kind: "drum" });
  });

  it("makes one-shot samples drum channels and melodic samples synth channels", () => {
    const kick = all.find((x) => x.id === "lib:ac-kick")!;
    const piano = all.find((x) => x.id === "lib:grand-piano")!;
    expect(kick).toMatchObject({ kind: "drum", category: "recorded", section: "Recorded: Drums" });
    expect(piano).toMatchObject({ kind: "synth", home: 72 });
  });

  it("keeps demo phrases of recorded sounds in a middle range", () => {
    for (const x of all.filter((s) => s.library && s.kind === "synth")) {
      expect(x.home).toBeGreaterThanOrEqual(48);
      expect(x.home).toBeLessThanOrEqual(72);
    }
  });
});

describe("filterSounds", () => {
  it("narrows to a category", () => {
    expect(filterSounds(all, "", "synths")).toHaveLength(SYNTH_IDS.length);
    expect(filterSounds(all, "", "all")).toHaveLength(all.length);
  });

  it("matches every typed word against the name and section, ignoring case", () => {
    expect(filterSounds(all, "808 KICK", "all").map((x) => x.id)).toEqual(["drum:kick808"]);
    expect(filterSounds(all, "recorded keys", "all").every((x) => x.section === "Recorded: Keys")).toBe(true);
    expect(filterSounds(all, "bass", "synths").map((x) => x.id)).toEqual(["synth:bass", "synth:sub", "synth:reese"]);
  });

  it("finds nothing for nonsense", () => {
    expect(filterSounds(all, "zzzz", "all")).toEqual([]);
  });
});
