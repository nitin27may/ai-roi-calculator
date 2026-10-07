import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCatalog, loadCoreCatalog, type Catalog, type ResourceType, type UnitPrice } from "@roi-calculator/catalog";
import {
  PLAN_RECIPES, ProjectSchema, applyAssumption, buildLedger, buildPlanProject, buildWizardProject, computeRoi, recipeById, recipeTypes, recipesForTypes, recommendModel, roiOptions, summarize, usesAi,
  withDefaults, type Project, type Recipe, type Values,
} from "../src/index.js";

/**
 * The eight non-AI recipes (A12): each parses, adds no AI, references only catalogue ids that exist, sets its type(s) on the
 * feature, and keeps the totals recorded in fixtures/recipes-golden.json. The fixture is generated once with
 * GENERATE_GOLDEN_RECIPES=1 and never regenerated to make a failure pass: a changed figure is a bug or a deliberate change to state in a PR.
 *
 * The golden is priced against the catalogue entries it was generated with (kept in the fixture), so a price refresh
 * does not move it. The "ids exist" test runs against the live catalogue.
 */
const FIXTURE = new URL("./fixtures/recipes-golden.json", import.meta.url);
const live = loadCatalog();
const PLAN = PLAN_RECIPES;
/** Answers for the golden: defaults, plus the user choices the recipes leave empty (environments, decommission). */
const CHOICES: Values = { envs: "dev,test,uat", exit: "yes", leaseEnded: "yes" };

function make(r: Recipe, values: Values = CHOICES, startDate = "2027-01-01"): Project {
  const { project } = buildPlanProject({
    name: r.label, deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 0, months: 6 }, devKinds: [],
    selections: [{ recipeId: r.id, values: Object.fromEntries(Object.entries(values).filter(([k]) => r.questions.some((q) => q.id === k))), types: r.types }],
  });
  return { ...project, startDate };
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;
function record(p: Project, cat: Catalog) {
  const L = buildLedger(p, cat);
  const roi = computeRoi(L, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  const s = summarize(p, L, roi, cat);
  return {
    totals: Object.fromEntries(Object.entries(L.totals).map(([k, v]) => [k, round(v as number)])),
    summary: { totalCost: round(s.totalCost), totalBenefit: round(s.totalBenefit), build: round(s.build), steadyStateAnnualRun: round(s.steadyStateAnnualRun), benefitPerYear: round(s.benefitPerYear), npv: round(s.npv), paybackMonth: s.paybackMonth },
    currentVsTarget: s.currentVsTarget ? Object.fromEntries(Object.entries(s.currentVsTarget).map(([k, v]) => [k, round(v)])) : null,
    lineCount: L.months.reduce((t, m) => t + m.lines.length, 0),
  };
}

/** A catalogue holding only the resource types and prices the recipes reference, as they were when the golden was generated. */
function frozen(projects: Project[]) {
  const want = new Map<string, Set<string>>();
  for (const p of projects) for (const r of p.resources ?? []) (want.get(r.typeId) ?? want.set(r.typeId, new Set()).get(r.typeId)!).add(r.skuId);
  const types: ResourceType[] = live.resourceTypes.filter((t) => want.has(t.id)).map((t) => ({ ...t, skus: t.skus.filter((s) => want.get(t.id)!.has(s.id)) }));
  const priceIds = new Set(types.flatMap((t) => t.skus.flatMap((s) => Object.values(s.prices))));
  return { resourceTypes: types, unitPrices: live.unitPrices.filter((u) => priceIds.has(u.id)) as UnitPrice[] };
}
const withFrozen = (f: ReturnType<typeof frozen>): Catalog => {
  const core = new Set(loadCoreCatalog().unitPrices.map((u) => u.id));
  return { ...live, resourceTypes: f.resourceTypes, unitPrices: [...live.unitPrices.filter((u) => core.has(u.id)), ...f.unitPrices] };
};

if (process.env.GENERATE_GOLDEN_RECIPES === "1" && !existsSync(FIXTURE)) {
  const projects = PLAN.map((r) => make(r));
  const f = frozen(projects);
  const cat = withFrozen(f);
  const out: Record<string, unknown> = { catalogue: f, answers: CHOICES, recipes: {} };
  PLAN.forEach((r, i) => ((out.recipes as Record<string, unknown>)[r.id] = record(projects[i]!, cat)));
  writeFileSync(FIXTURE, JSON.stringify(out, null, 1) + "\n");
}

const fixture = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as { catalogue: ReturnType<typeof frozen>; recipes: Record<string, ReturnType<typeof record>> }) : undefined;

describe("non-AI recipes", () => {
  it("there are the eight recipes of the plan, each offered under its types and none under ai", () => {
    expect(PLAN.map((r) => r.id)).toEqual(["cheques", "rpa", "liftshift", "paas", "saas", "newapp", "enhance", "dataplatform"]);
    for (const r of PLAN) { expect(recipeTypes(r)).not.toContain("ai"); expect(r.modelRoles).toEqual([]); expect(r.needsHarness).toBe(false); expect(r.devKinds).toEqual([]); }
    expect(recipesForTypes(["ai"]).every((r) => !r.plan && r.id !== "nonai")).toBe(true);
    expect(recipesForTypes(["automation"]).map((r) => r.id)).toEqual(expect.arrayContaining(["nonai", "cheques", "rpa"]));
    expect(recipesForTypes(["replatform"]).map((r) => r.id)).toEqual(expect.arrayContaining(["liftshift", "paas", "dataplatform"]));
    expect(recipesForTypes(["saas"]).map((r) => r.id)).toContain("saas");
  });

  it("nothing is preselected: no environment, and no decommission is assumed, until the user chooses", () => {
    for (const r of PLAN) {
      const d = withDefaults(r);
      expect(d.envs ?? "").toBe("");
      expect(d.exit ?? "").toBe("");
      expect(d.leaseEnded ?? "").toBe("");
      expect(d.monetiseSpeed ?? false).toBe(false);
      const p = make(r, {});
      expect(p.environments).toBeUndefined();
      for (const l of p.currentState?.lines ?? []) if (l.decommission) expect(l.decommission.assumed, l.id).toBe(false);
    }
  });

  for (const r of PLAN) {
    describe(r.label, () => {
      const p = make(r);
      it("parses and prices", () => {
        expect(ProjectSchema.safeParse(p).success).toBe(true);
        const L = buildLedger(p, live);
        expect(L.totals.build).toBeGreaterThan(0);
        expect(p.timeline.buildMonths).toBe(Number(withDefaults(r).months));
      });
      it("sets the types on its feature and adds no AI", () => {
        expect(p.features).toHaveLength(1);
        expect(p.features[0]!.types).toEqual(r.types);
        expect(usesAi(p)).toBe(false);
        expect(p.harnesses).toEqual([]);
        expect(p.build.activities).toEqual([]);
        expect(p.workloads.every((w) => ["seats", "contract", "transactionFee", "fixed"].includes(w.kind))).toBe(true);
      });
      it("every referenced catalogue SKU exists with a price for each meter", () => {
        for (const x of p.resources ?? []) {
          const t = live.resourceTypes.find((y) => y.id === x.typeId);
          expect(t, `${r.id}: type ${x.typeId}`).toBeDefined();
          const s = t!.skus.find((y) => y.id === x.skuId);
          expect(s, `${r.id}: ${x.typeId}/${x.skuId}`).toBeDefined();
          for (const m of t!.meters) expect(s!.prices[m.id], `${x.typeId}/${x.skuId}/${m.id}`).toBeDefined();
          for (const k of Object.keys(x.inputs)) expect(t!.inputs.some((i) => i.id === k), `${x.typeId} input ${k}`).toBe(true);
        }
        for (const l of buildLedger(p, live).months.flatMap((m) => m.lines)) expect(Number.isFinite(l.cost), l.id).toBe(true);
      });
      it("has the plan's pieces: team with phases, delivery costs, current state (where there is one) and scorecard", () => {
        expect(p.build.team.length).toBeGreaterThan(0);
        expect((p.build.deliveryCosts ?? []).length).toBeGreaterThan(0);
        expect((p.benefits.scorecard ?? []).length).toBeGreaterThanOrEqual(2);
        expect((p.benefits.scorecard ?? []).every((x) => x.monetise === undefined)).toBe(true);
        expect(p.timeline.phases?.map((x) => x.id)).toContain("hypercare");
        if (r.id !== "newapp") expect((p.currentState?.lines ?? []).length).toBeGreaterThan(0);
        if (r.id !== "saas") expect((p.resources ?? []).length).toBeGreaterThan(0);
        if (r.id !== "saas") {
          expect(p.environments!.map((e) => e.id)).toEqual(["dev", "test", "uat", "prod"]);
          for (const res of p.resources ?? []) expect(res.envIds).toEqual(["dev", "test", "uat", "prod"]);
        } else expect(p.environments).toBeUndefined();
      });
      it("labels every line that is not a catalogue price as an assumption", () => {
        for (const l of p.currentState?.lines ?? []) expect(l.label).toMatch(/\(assumption\)$/);
        for (const d of p.build.deliveryCosts ?? []) expect(d.label).toMatch(/\(assumption\)$/);
        for (const w of p.workloads) expect(w.label).toMatch(/\(assumption\)$/);
      });
      it("records an editable assumption for the figures it derives, each with its source", () => {
        const { assumptions } = buildPlanProject({ name: "a", deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 0, months: 6 }, devKinds: [], selections: [{ recipeId: r.id, values: {}, types: r.types }] });
        expect(assumptions.length).toBeGreaterThan(3);
        expect(assumptions.every((a) => a.source.length > 0)).toBe(true);
        const q = new Set<string>();
        for (const a of assumptions) { expect(q.has(a.id), a.id).toBe(false); q.add(a.id); }
      });
      it("every question has full help with the assumption source", () => {
        for (const q of r.questions) {
          expect(q.help.meaning.length, q.id).toBeGreaterThan(10);
          expect(q.help.example.length, q.id).toBeGreaterThan(0);
          expect(q.help.source, q.id).toBe("Illustrative assumption: replace with your figure");
          expect(JSON.stringify(q)).not.toMatch(/\p{Extended_Pictographic}/u);
        }
      });
      it("keeps the golden totals", () => {
        expect(fixture, "recipes-golden.json exists").toBeDefined();
        const cat = withFrozen(fixture!.catalogue);
        expect(record(p, cat)).toEqual(fixture!.recipes[r.id]);
      });
    });
  }

  it("the golden covers exactly the eight recipes", () => expect(Object.keys(fixture?.recipes ?? {})).toEqual(PLAN.map((r) => r.id)));

  it("edits made on the review step reach the project (resources, delivery costs, current lines, workloads)", () => {
    for (const r of PLAN) {
      const res = buildPlanProject({ name: "e", deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 0, months: 6 }, devKinds: [], selections: [{ recipeId: r.id, values: {}, types: r.types }] });
      const editable = res.assumptions.filter((a) => a.target && typeof a.value === "number");
      expect(editable.length, r.id).toBeGreaterThan(2);
      for (const a of editable) expect(applyAssumption(res.project, a, 7), `${r.id}: ${a.id}`).toBe(true);
      expect(ProjectSchema.safeParse(res.project).success, r.id).toBe(true);
    }
  });

  it("combining plan recipes shares one project: features, types per feature, merged environments and rate card", () => {
    const res = buildPlanProject({
      name: "Mixed", deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 0, months: 6 }, devKinds: [],
      selections: [
        { recipeId: "rpa", values: { envs: "dev" }, types: ["automation"] },
        { recipeId: "paas", values: { envs: "dev,uat", exit: "yes" }, types: ["replatform"] },
        { recipeId: "saas", values: {}, types: ["saas"] },
      ],
    });
    const p = res.project;
    expect(p.features.map((f) => [f.id, f.types])).toEqual([["rpa", ["automation"]], ["paas", ["replatform"]], ["saas", ["saas"]]]);
    expect(p.environments!.map((e) => e.id).sort()).toEqual(["dev", "prod", "uat"]);
    expect(p.resources!.find((x) => x.id.startsWith("rpa-"))!.envIds).toEqual(["dev", "prod"]);
    expect(p.resources!.find((x) => x.id.startsWith("paas-"))!.envIds).toEqual(["dev", "uat", "prod"]);
    expect(new Set(p.rateCard.map((x) => x.id)).size).toBe(p.rateCard.length);
    expect(p.timeline.buildMonths).toBe(6);
    expect(usesAi(p)).toBe(false);
    expect(buildLedger(p, live).totals.build).toBeGreaterThan(0);
  });

  it("a plan recipe beside an AI recipe keeps the AI team and Dev Lab and adds the plan's team", () => {
    const res = buildWizardProject(live, {
      name: "Hybrid", deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 2, months: 3 }, devKinds: [],
      selections: [{ recipeId: "chat", models: { main: recommendModel(live, recipeById("chat")!.modelRoles[0]!, { deployment: "dataZone", quality: "balanced", batch: false })!.modelId }, types: ["ai"] }, { recipeId: "cheques", values: {}, types: ["automation"] }],
    });
    const p = res.project;
    expect(p.features.map((f) => f.types)).toEqual([["ai"], ["automation"]]);
    expect(p.build.team.some((t) => t.roleId === "architect")).toBe(true);
    expect(p.build.team.some((t) => t.roleId === "pm")).toBe(true);
    expect(p.timeline.buildMonths).toBe(6);
    expect(usesAi(p)).toBe(true);
  });
});
