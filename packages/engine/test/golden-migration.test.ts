import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { CURRENT_PROJECT_VERSION, LEGACY_PROJECT_SCHEMA_ID, PROJECT_SCHEMA_ID, PROJECT_TEMPLATES, ProjectSchema, buildLedger, computeAllocation, computeRoi, meetingIntelligence, migrateProject } from "../src/index.js";
import golden from "./fixtures/v2-golden.json";

/**
 * v2-golden.json holds projects saved at schema version 2 (the sample and every template as they were before P5)
 * with the ledger figures the v2 engine produced for them. Migrating to v3 must not move a single figure:
 * a saved project, and a template a user started from, costs exactly what it did.
 */
const cat = loadCatalog();

/**
 * P10 fixed the Container Apps vCPU and memory prices, which were 0 (the Retail API's CAD rows carry only the free grant).
 * The v2 golden figures predate that, so they are checked against the catalogue as it stood: the same two entries at price 0
 * with no free grant. That isolates the migration and the engine; the price fix itself is pinned separately below.
 */
const legacyCat = structuredClone(cat);
for (const id of ["container-apps-vcpu-s", "container-apps-gib-s"]) {
  const u = legacyCat.unitPrices.find((x) => x.id === id)!;
  u.price = 0;
  delete u.freePerMonth;
}
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

      const ledger = buildLedger(migrated, legacyCat);
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
      const ledger = buildLedger(p, legacyCat);
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

/**
 * v4 to v5 (P10): hosting stacks, tool fees, image input, PTU mode and editable assumptions are all optional, and absent
 * means the old behaviour. A project saved at v4 must migrate to v5 and price exactly as it did, for the sample and every template.
 */
describe("v4 to v5 migration keeps every total", () => {
  const v4 = (p: unknown) => ({ ...(structuredClone(p) as Record<string, unknown>), version: 4 });
  const sources = [["sample", meetingIntelligence as unknown], ...PROJECT_TEMPLATES.map((t) => [t.id, t.make(`v4 ${t.id}`) as unknown] as const)] as const;

  for (const [name, project] of sources) {
    it(`${name}: a v4 save migrates to v5 with identical totals, ranges and allocation`, () => {
      const saved = v4(project);
      const migrated = ProjectSchema.parse(migrateProject(structuredClone(saved)));
      const current = ProjectSchema.parse(project);
      expect(migrated.version).toBe(CURRENT_PROJECT_VERSION);
      // v6 adds feature types (see types-migration.test.ts); everything else is identical.
      expect(migrated).toEqual({ ...current, version: CURRENT_PROJECT_VERSION, features: migrated.features });
      const a = buildLedger(migrated, cat), b = buildLedger(current, cat);
      expect(a.totals).toEqual(b.totals);
      a.months.forEach((mo, i) => {
        expect(mo.lines.map((l) => [l.id, l.cost])).toEqual(b.months[i]!.lines.map((l) => [l.id, l.cost]));
        expect(mo.byStream).toEqual(b.months[i]!.byStream);
      });
      expect(computeAllocation(migrated, a, migrated.roi.basis)).toEqual(computeAllocation(current, b, current.roi.basis));
    });
  }

  it("a v4 save with no new fields gains none", () => {
    const migrated = migrateProject(v4(meetingIntelligence)) as Record<string, unknown>;
    expect((migrated.settings as Record<string, unknown>).assumptions).toBeUndefined();
    expect(JSON.stringify(migrated.workloads)).not.toMatch(/"(ptu|tpmQuota|images|hosting)"/);
  });
});

/** The one intended delta in P10: the sample uses Container Apps, whose price used to be 0. */
describe("P10 price fix: Container Apps", () => {
  it("raises the sample's run rate by exactly the two meters' paid usage", () => {
    const before = buildLedger(ProjectSchema.parse(meetingIntelligence), legacyCat).totals.runRate;
    const after = buildLedger(ProjectSchema.parse(meetingIntelligence), cat).totals.runRate;
    // 2,600,000 vCPU-s and 5,200,000 GiB-s a month, less the free grant (180,000 and 360,000), at the corrected prices.
    const expected = (2_600_000 - 180_000) * 0.0000482 + (5_200_000 - 360_000) * 0.00000567;
    expect(after - before).toBeCloseTo(expected, 4);
    expect(expected).toBeCloseTo(144.0868, 4);
  });
});

/**
 * The 2026-10-06 rename changed the schema id from "ai-cost-roi-studio/project" to "roi-calculator/project". The shape did not change,
 * so this is an id alias handled in migrateProject, not a version bump: CURRENT_PROJECT_VERSION is unchanged. A saved library entry
 * and an exported file that still carry the old id must open with identical totals.
 */
describe("legacy schema id", () => {
  const sources = [["sample", meetingIntelligence as unknown], ...PROJECT_TEMPLATES.map((t) => [t.id, t.make(`legacy ${t.id}`) as unknown] as const)] as const;
  const withOldId = (p: unknown) => ({ ...(structuredClone(p) as Record<string, unknown>), schema: LEGACY_PROJECT_SCHEMA_ID });

  it("the new id is the one written, and the old one is a different string", () => {
    expect(PROJECT_SCHEMA_ID).toBe("roi-calculator/project");
    expect(LEGACY_PROJECT_SCHEMA_ID).toBe("ai-cost-roi-studio/project");
    expect(ProjectSchema.parse(meetingIntelligence).schema).toBe(PROJECT_SCHEMA_ID);
  });

  it("an unmigrated old-id project is rejected by the parser, so the loader must go through migrateProject", () => {
    expect(ProjectSchema.safeParse(withOldId(meetingIntelligence)).success).toBe(false);
  });

  for (const [name, project] of sources) {
    it(`${name}: a saved project and an exported JSON file with the old id open with identical totals`, () => {
      const current = ProjectSchema.parse(project);
      const expected = buildLedger(current, cat);
      const saved = withOldId(project);
      const exported = JSON.parse(JSON.stringify(saved, null, 2)) as unknown; // what a file on disk round-trips to
      for (const raw of [saved, exported]) {
        const opened = ProjectSchema.parse(migrateProject(structuredClone(raw)));
        expect(opened.schema).toBe(PROJECT_SCHEMA_ID);
        expect(opened.version).toBe(CURRENT_PROJECT_VERSION);
        expect(opened).toEqual(current);
        const ledger = buildLedger(opened, cat);
        expect(ledger.totals).toEqual(expected.totals);
        ledger.months.forEach((mo, i) => expect(mo.byStream).toEqual(expected.months[i]!.byStream));
      }
    });
  }

  it("an old-id project at an older version migrates both the id and the version", () => {
    const e = (golden as unknown as Record<string, Entry>).sample!;
    expect((e.project as { schema: string }).schema).toBe(LEGACY_PROJECT_SCHEMA_ID);
    const migrated = ProjectSchema.parse(migrateProject(structuredClone(e.project)));
    expect(migrated.schema).toBe(PROJECT_SCHEMA_ID);
    expect(migrated.version).toBe(CURRENT_PROJECT_VERSION);
  });

  it("a project with the new id is untouched by the alias step", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    expect(migrateProject(structuredClone(p))).toEqual(p);
  });
});
