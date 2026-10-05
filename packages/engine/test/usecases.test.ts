import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import {
  MissingChoice, RECIPES, applyAssumption, applicableDevKinds, buildLedger, buildWizardProject, defaultDevKinds, missingModels, modelOptions,
  projectIssues, recipeById, recommendModel, withDefaults, type AzureDeployment, type Quality, type WizardSelection,
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
  it("has the 14 recipes with unique ids and sourced questions", () => {
    expect(RECIPES).toHaveLength(14);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(14);
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

  it("benefits of every type land in the project and reviewed edits apply", () => {
    for (const type of ["timeSaved", "costAvoided", "revenue", "quality", "risk"] as const) {
      const sel = { ...picked("batch"), benefit: { type, basis: "perItem" as const, amountCad: 500, cadence: "monthly" as const } };
      const res = buildWizardProject(cat, { ...base, selections: [sel] });
      const b = res.project.benefits;
      expect(b.capabilities.length + b.avoidedCosts.length + b.oneOff.length).toBeGreaterThan(0);
      expect(projectIssues(res.project)).toEqual([]);
    }
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
