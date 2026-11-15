import { describe, expect, it } from "vitest";
import manifestJson from "../public/samples/manifest.json";
import { inRollRange } from "../src/core/notes";
import { PRESETS } from "../src/core/presets";
import { findPattern, patternSteps } from "../src/core/project";
import { songEventsAtStep } from "../src/core/schedule";
import { parseProject, serializeProject } from "../src/core/serialize";
import { MAX_STEPS } from "../src/core/timing";

const manifest = manifestJson as { id: string; url: string; root: number }[];

describe("preset songs", () => {
  it("have unique ids and names", () => {
    expect(new Set(PRESETS.map((x) => x.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((x) => x.name)).size).toBe(PRESETS.length);
  });

  for (const preset of PRESETS) {
    describe(preset.name, () => {
      const p = preset.build();

      it("survives a save and open unchanged", () => {
        const r = parseProject(serializeProject(p));
        if (!r.ok) throw new Error(r.error);
        expect(r.project).toEqual(p);
      });

      it("places only real patterns, inside the tracks", () => {
        expect(p.clips.length).toBeGreaterThan(0);
        for (const c of p.clips) {
          expect(findPattern(p, c.patternId)).toBeDefined();
          expect(c.track).toBeLessThan(p.tracks);
        }
      });

      it("keeps notes on the roll and inside their patterns", () => {
        for (const pat of p.patterns) {
          const len = patternSteps(pat, p.timeSig);
          expect(len).toBeLessThanOrEqual(MAX_STEPS);
          if (pat.kind === "melody") {
            expect(pat.notes.length).toBeGreaterThan(0);
            for (const n of pat.notes) {
              expect(inRollRange(n.pitch)).toBe(true);
              expect(n.step).toBeLessThan(len);
            }
          } else {
            for (const steps of Object.values(pat.rows)) for (const s of steps) expect(s).toBeLessThan(len);
          }
        }
      });

      it("makes sound on the first beat", () => {
        const e = songEventsAtStep(p, 0);
        expect(e.drums.length + e.notes.length).toBeGreaterThan(0);
      });

      it("only uses samples that ship with the app, at their measured root", () => {
        for (const s of p.samples) {
          const entry = manifest.find((m) => `lib-${m.id}` === s.id);
          expect(entry, s.id).toBeDefined();
          expect(s).toMatchObject({ source: "bundled", url: entry!.url, root: entry!.root });
        }
      });
    });
  }

  it("builds fresh ids each time, so loading twice never clashes", () => {
    const a = PRESETS[1]!.build();
    const b = PRESETS[1]!.build();
    expect(a.channels[0]!.id).not.toBe(b.channels[0]!.id);
  });
});
