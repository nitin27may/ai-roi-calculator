import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { CURRENT_PROJECT_VERSION, PROJECT_TEMPLATES, ProjectSchema, buildLedger, computeAllocation, computeRoi, migrateProject } from "../src/index.js";
import golden from "./fixtures/v2-golden.json";

/**
 * v2-golden.json holds projects saved at schema version 2 (the sample and every template as they were before P5)
 * with the ledger figures the v2 engine produced for them. Migrating to v3 must not move a single figure:
 * a saved project, and a template a user started from, costs exactly what it did.
 */
const cat = loadCatalog();
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

type Entry = { project: Record<string, unknown>; golden: {
  totals: Record<string, number>; byStream: Record<string, number>[]; benefit: number[]; lineCount: number[];
  roi: { totalCost: number; totalBenefit: number; npv: number }; alloc: [string, number, number][];
} };

describe("v2 to v3 migration keeps every total", () => {
  for (const [name, entry] of Object.entries(golden as unknown as Record<string, Entry>)) {
    it(`${name}: ledger, ROI and allocation are identical after migration`, () => {
      expect(entry.project.version).toBe(2);
      const migrated = ProjectSchema.parse(migrateProject(structuredClone(entry.project)));
      expect(migrated.version).toBe(CURRENT_PROJECT_VERSION);
      expect(migrated.features).toHaveLength(1);

      const ledger = buildLedger(migrated, cat);
      for (const [k, v] of Object.entries(entry.golden.totals)) close((ledger.totals as Record<string, number>)[k]!, v);
      expect(ledger.months).toHaveLength(entry.golden.byStream.length);
      ledger.months.forEach((mo, i) => {
        for (const [s, v] of Object.entries(entry.golden.byStream[i]!)) close(mo.byStream[s as keyof typeof mo.byStream], v);
        close(mo.benefit, entry.golden.benefit[i]!);
        expect(mo.lines.length).toBe(entry.golden.lineCount[i]);
      });

      const roi = computeRoi(ledger, migrated.roi.basis, migrated.roi.discountRatePct);
      close(roi.totalCost, entry.golden.roi.totalCost);
      close(roi.totalBenefit, entry.golden.roi.totalBenefit);
      close(roi.npv, entry.golden.roi.npv);

      const alloc = computeAllocation(migrated, ledger, migrated.roi.basis);
      expect(alloc.capabilities.map((c) => c.id)).toEqual(entry.golden.alloc.map((a) => a[0]));
      alloc.capabilities.forEach((c, i) => { close(c.cost, entry.golden.alloc[i]![1]); close(c.benefit, entry.golden.alloc[i]![2]); });
    });
  }

  for (const t of PROJECT_TEMPLATES) {
    it(`${t.id}: a project started from the template today costs what it did before P5`, () => {
      const g = (golden as unknown as Record<string, Entry>)[t.id]!;
      const p = ProjectSchema.parse(t.make("Golden check"));
      const ledger = buildLedger(p, cat);
      for (const [k, v] of Object.entries(g.golden.totals)) close((ledger.totals as Record<string, number>)[k]!, v);
      const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct);
      close(roi.totalCost, g.golden.roi.totalCost);
      close(roi.totalBenefit, g.golden.roi.totalBenefit);
    });
  }

  it("a v2 project with capability componentIds splits them into workload and workstream links", () => {
    const e = (golden as unknown as Record<string, Entry>).sample!;
    const migrated = ProjectSchema.parse(migrateProject(structuredClone(e.project)));
    const notes = migrated.benefits.capabilities.find((c) => c.id === "notes")!;
    expect(notes.workloadIds).toEqual(expect.arrayContaining(["stt", "agent", "email"]));
    expect(notes.workstreamIds).toEqual(expect.arrayContaining(["ws-notes", "ws-shared"]));
    expect(notes.featureId).toBe(migrated.features[0]!.id);
  });
});
