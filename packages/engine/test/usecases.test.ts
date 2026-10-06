import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import {
  MissingChoice, RECIPES, applyAssumption, applicableDevKinds, buildLedger, buildWizardProject, defaultDevKinds, missingModels, modelOptions,
  defaultConfidence, projectIssues, recipeById, recommendModel, valueItemMonthly, withDefaults, type AzureDeployment, type Quality, type WizardSelection,
} from "../src/index.js";

const cat = loadCatalog();

/** Picks the recommended model for each role the answers need, as a user would. */
function picked(recipeId: string, deployment: AzureDeployment = "global", quality: Quality = "balanced", values = {}): WizardSelection {
  const sel: WizardSelection = { recipeId, values, models: {} };
  for (const role of missingModels(sel)) {
    const rec = recommendModel(cat, role, { deployment, quality, batch: true });
    if (rec) sel.models![role.id] = rec.modelId;
  }
  return sel;
}

const base = { name: "Test", deployment: "global" as const, quality: "balanced" as const, batchAllowed: true, build: { people: 2, months: 4 }, devKinds: [] as never[] };

describe("recipes", () => {
  it("has the 15 recipes with unique ids and sourced questions", () => {
    expect(RECIPES).toHaveLength(15);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(15);
    for (const r of RECIPES) for (const x of r.questions) expect(x.help.source.length).toBeGreaterThan(3);
  });

  for (const r of RECIPES) {
    it(`${r.label} validates and prices with default answers`, () => {
      const res = buildWizardProject(cat, { ...base, devKinds: defaultDevKinds([r.id]), selections: [picked(r.id)] });
      expect(projectIssues(res.project)).toEqual([]);
      const L = buildLedger(res.project, cat);
      expect(Number.isFinite(L.totals.build)).toBe(true);
      expect(Number.isFinite(L.totals.runRate)).toBe(true);
      expect(res.features).toHaveLength(1);
      if (r.id !== "nonai") expect(res.project.workloads.length).toBeGreaterThan(0);
    });
    it(`${r.label} adds a harness only if it needs one`, () => {
      const res = buildWizardProject(cat, { ...base, devKinds: ["iterations", "regression", "bakeoff", "evaluation", "playground"], selections: [picked(r.id)] });
      expect(res.project.harnesses.length > 0).toBe(r.needsHarness);
    });
    it(`${r.label} demands a model pick when it needs one`, () => {
      const need = missingModels({ recipeId: r.id });
      if (need.length) expect(() => buildWizardProject(cat, { ...base, selections: [{ recipeId: r.id }] })).toThrow(MissingChoice);
      else expect(() => buildWizardProject(cat, { ...base, selections: [{ recipeId: r.id }] })).not.toThrow();
    });
  }

  it("the non-AI recipe yields a valid project with no workloads by default", () => {
    const res = buildWizardProject(cat, { ...base, selections: [{ recipeId: "nonai" }] });
    expect(res.project.workloads).toHaveLength(0);
    expect(projectIssues(res.project)).toEqual([]);
    const withCost = buildWizardProject(cat, { ...base, selections: [{ recipeId: "nonai", values: { monthly: 1000, once: 5000 } }] });
    expect(buildLedger(withCost.project, cat).totals.runRate).toBeGreaterThan(0);
  });

  it("book optimisation uses a one-time volume plus a monthly volume", () => {
    const sel = picked("book", "global", "balanced", { once: 10, monthly: 2, pages: 100, scanned: true });
    const res = buildWizardProject(cat, { ...base, selections: [sel] });
    const w = res.project.workloads.find((x) => x.kind === "llm")!;
    expect(w.oneTime?.volume).toBeGreaterThan(0);
    expect((w as { callsPerMonth: number }).callsPerMonth).toBeGreaterThan(0);
    expect(res.project.workloads.some((x) => x.kind === "documents")).toBe(true);
  });

  it("combining recipes makes one feature each, with distinct ids", () => {
    const res = buildWizardProject(cat, { ...base, devKinds: defaultDevKinds(["rag", "email", "rag"]), selections: [picked("rag"), picked("email"), picked("rag")] });
    expect(res.features.map((f) => f.id)).toEqual(["rag", "email", "rag-2"]);
    expect(res.project.features).toHaveLength(3);
    expect(projectIssues(res.project)).toEqual([]);
    const ids = res.project.workloads.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.project.workloads.every((w) => res.features.some((f) => f.id === w.featureId))).toBe(true);
    expect(res.project.harnesses).toHaveLength(0);
    expect(Number.isFinite(buildLedger(res.project, cat).totals.runRate)).toBe(true);
  });

  it("agent plus chat adds a harness for the agent only", () => {
    const res = buildWizardProject(cat, { ...base, devKinds: ["iterations", "regression", "playground"], selections: [picked("agent"), picked("chat")] });
    expect(res.project.harnesses).toHaveLength(1);
    expect(projectIssues(res.project)).toEqual([]);
    const multi = buildWizardProject(cat, { ...base, devKinds: ["iterations"], selections: [picked("multi")] });
    expect(multi.project.harnesses).toHaveLength(2);
  });

  it("batch flag only applies where Batch exists", () => {
    const role = recipeById("batch")!.modelRoles[0]!;
    const any = modelOptions(cat, role, "regional")[0] ?? modelOptions(cat, role, "global")[0]!;
    const regional = buildWizardProject(cat, { ...base, deployment: "regional", selections: [{ recipeId: "batch", models: { main: any.id } }] });
    expect((regional.project.workloads[0] as { batchShare: number }).batchShare).toBe(0);
    const glob = buildWizardProject(cat, { ...base, selections: [picked("batch")] });
    expect((glob.project.workloads[0] as { batchShare: number }).batchShare).toBe(1);
    const off = buildWizardProject(cat, { ...base, batchAllowed: false, selections: [picked("batch")] });
    expect((off.project.workloads[0] as { batchShare: number }).batchShare).toBe(0);
  });

  const BENEFITS = {
    timeSaved: { type: "timeSaved", basis: "perItem", baselineMinutes: 5, savedPct: 50 },
    costAvoided: { type: "costAvoided", amountCad: 500, cadence: "monthly" },
    revenue: { type: "revenue", monthlyRevenue: 20000, marginPct: 30 },
    quality: { type: "quality", errorRateBeforePct: 5, errorRateAfterPct: 2, costPerError: 40 },
    risk: { type: "risk", eventsPerYear: 2, impactCad: 50000, reductionPct: 40 },
  } as const;

  it("each benefit type maps to its P8 structure, attributed to a capability, with a confidence", () => {
    for (const [type, benefit] of Object.entries(BENEFITS)) {
      const res = buildWizardProject(cat, { ...base, selections: [{ ...picked("batch"), benefit }] });
      const b = res.project.benefits;
      expect(projectIssues(res.project), type).toEqual([]);
      const cap = b.capabilities[0]!;
      expect(cap.featureId, type).toBe("batch");
      if (type === "timeSaved") {
        expect(b.value).toHaveLength(0);
        expect(cap.driver).toBe("perVolume");
        expect(cap.confidencePct).toBe(70);
        continue;
      }
      if (type === "costAvoided") {
        expect(b.avoidedCosts[0]).toMatchObject({ monthly: 500, capabilityId: cap.id, confidencePct: 90 });
        expect(b.value).toHaveLength(0);
      } else {
        expect(b.avoidedCosts).toHaveLength(0);
        expect(b.value).toHaveLength(1);
        expect(b.value[0]).toMatchObject({ kind: type, capabilityId: cap.id, featureId: "batch", confidencePct: { revenue: 50, quality: 60, risk: 50 }[type] });
        expect(valueItemMonthly(res.project, b.value[0]!)).toBeGreaterThan(0);
      }
      expect(b.oneOff).toHaveLength(0);
      const L = buildLedger(res.project, cat);
      expect(L.months.reduce((t, m) => t + Object.values(m.benefitBy.attributed).reduce((x, y) => x + y, 0), 0), type).toBeGreaterThan(0);
    }
  });

  it("every recipe validates with every benefit type and the ledger stays finite", () => {
    for (const r of RECIPES) for (const [type, benefit] of Object.entries(BENEFITS)) {
      const res = buildWizardProject(cat, { ...base, selections: [{ ...picked(r.id), benefit }] });
      expect(projectIssues(res.project), `${r.id} ${type}`).toEqual([]);
      expect(Number.isFinite(buildLedger(res.project, cat).totals.runRate), `${r.id} ${type}`).toBe(true);
    }
  });

  it("quality takes its volume from the feature's main workload", () => {
    const res = buildWizardProject(cat, { ...base, selections: [{ ...picked("batch"), benefit: BENEFITS.quality }] });
    expect(res.project.benefits.value[0]!.volumeFrom).toBe(res.project.workloads.find((w) => w.kind === "llm")!.id);
  });

  it("a confidence you set is used and applies through the review step; benchmarks start from their evidence grade", () => {
    const res = buildWizardProject(cat, { ...base, selections: [{ ...picked("batch"), benefit: { ...BENEFITS.revenue, confidencePct: 80 } }] });
    expect(res.project.benefits.value[0]!.confidencePct).toBe(80);
    const a = res.assumptions.find((x) => x.id === "batch-benefit-confidence")!;
    expect(a.target).toMatchObject({ collection: "value", field: ["confidencePct"] });
    expect(applyAssumption(res.project, a, 35)).toBe(true);
    expect(res.project.benefits.value[0]!.confidencePct).toBe(35);
    const bm = cat.benchmarks.capabilities.find((c) => c.driver === "perUserWeek") ?? cat.benchmarks.capabilities[0]!;
    const sel = { ...picked("rag"), benefit: { type: "timeSaved" as const, basis: "benchmark" as const, benchmarkId: bm.id, users: 50 } };
    const r2 = buildWizardProject(cat, { ...base, selections: [sel] });
    expect(r2.project.benefits.capabilities[0]!.confidencePct).toBe(defaultConfidence(sel.benefit, cat.benchmarks));
    expect(r2.assumptions.find((x) => x.id === "rag-benefit-confidence")!.source).toContain(bm.sourceLabel);
  });

  it("an empty amount adds no benefit, and one-off cost avoided stays a one-off", () => {
    for (const benefit of [{ type: "revenue" }, { type: "quality" }, { type: "risk" }, { type: "costAvoided", amountCad: 0 }] as const) {
      const b = buildWizardProject(cat, { ...base, selections: [{ ...picked("batch"), benefit }] }).project.benefits;
      expect(b.value.length + b.avoidedCosts.length + b.capabilities.length).toBe(0);
    }
    const once = buildWizardProject(cat, { ...base, selections: [{ ...picked("batch"), benefit: { type: "costAvoided", amountCad: 9000, cadence: "once" } }] }).project.benefits;
    expect(once.oneOff[0]!.amount).toBe(9000);
  });

  it("reviewed edits apply", () => {
    const res = buildWizardProject(cat, { ...base, selections: [picked("batch")] });
    const a = res.assumptions.find((x) => x.target && x.label.includes("items a month"))!;
    expect(applyAssumption(res.project, a, 1234)).toBe(true);
    expect((res.project.workloads[0] as { callsPerMonth: number }).callsPerMonth).toBe(1234);
  });

  it("every assumption cites a source", () => {
    for (const r of RECIPES) {
      const res = buildWizardProject(cat, { ...base, devKinds: defaultDevKinds([r.id]), selections: [picked(r.id)] });
      for (const a of res.assumptions) expect(a.source.length, `${r.id}: ${a.label}`).toBeGreaterThan(3);
    }
  });
});

describe("model recommendation", () => {
  it("never preselects: build fails until the user picks", () => {
    expect(() => buildWizardProject(cat, { ...base, selections: [{ recipeId: "rag" }] })).toThrow(MissingChoice);
  });
  it("respects the deployment and explains itself", () => {
    for (const d of ["global", "dataZone", "regional"] as const) {
      const role = recipeById("rag")!.modelRoles[0]!;
      const opts = modelOptions(cat, role, d);
      const rec = recommendModel(cat, role, { deployment: d, quality: "balanced", batch: true });
      if (rec) {
        expect(opts.some((o) => o.id === rec.modelId)).toBe(true);
        expect(rec.reason.length).toBeGreaterThan(20);
      }
    }
  });
  it("quality shifts the recommendation up and cost shifts it down", () => {
    const role = recipeById("chat")!.modelRoles[0]!;
    const price = (q: Quality) => {
      const id = recommendModel(cat, role, { deployment: "global", quality: q, batch: false })!.modelId;
      return modelOptions(cat, role, "global").find((m) => m.id === id)!.inputPer1M;
    };
    expect(price("cost")).toBeLessThanOrEqual(price("balanced"));
    expect(price("balanced")).toBeLessThanOrEqual(price("quality"));
  });
  it("lists dev kinds per recipe", () => {
    expect(applicableDevKinds(["rag"]).some((k) => k.kind === "iterations")).toBe(false);
    expect(applicableDevKinds(["agent"]).some((k) => k.kind === "iterations")).toBe(true);
    expect(withDefaults(recipeById("rag")!, { users: 5 }).users).toBe(5);
  });
});
