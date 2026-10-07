import { describe, expect, it } from "vitest";
import { buildLedger, computeRoi, defaultConfidence, projectIssues, recommendModel, recipeById, roiOptions, summarize, usesAi } from "@roi-calculator/engine";
import { loadCatalog } from "@roi-calculator/catalog";
import {
  STEPS, blocker, buildFromState, featureTypes, initialState, missingFor, recipeDeployment, recipesFor, setBenefit, setBuild, setDeployment, setEdit, setModel, setValue, stepIdOf, stepsFor,
  toggleDevKind, togglePick, toggleType,
} from "../lib/wizard";

const catalog = loadCatalog();
const start = () => initialState({ deployment: "global", tier: "standard" });

function withModels(s: ReturnType<typeof start>) {
  let out = s;
  for (const id of s.picks) for (const role of missingFor(out, id)) {
    const rec = recommendModel(catalog, role, { deployment: recipeDeployment(catalog, out, recipeById(id)!), quality: out.quality, batch: out.batchAllowed });
    if (rec) out = setModel(out, id, role.id, rec.modelId);
  }
  return out;
}

describe("wizard state", () => {
  it("has six steps and starts with nothing picked", () => {
    expect(STEPS).toHaveLength(6);
    const s = start();
    expect(s.picks).toEqual([]);
    expect(s.models).toEqual({});
    expect(blocker(s)).not.toBeNull();
  });

  it("toggles recipes and follows them with team size and Dev Lab kinds until the user edits", () => {
    let s = togglePick(start(), "rag");
    expect(s.picks).toEqual(["rag"]);
    const small = s.build.people;
    s = togglePick(togglePick(togglePick(s, "agent"), "multi"), "email");
    expect(s.build.people).toBeGreaterThan(small);
    expect(s.devKinds).toContain("iterations");
    s = togglePick(togglePick(s, "agent"), "multi");
    expect(s.devKinds).not.toContain("iterations");
    s = setBuild(s, { people: 7 });
    s = togglePick(s, "batch");
    expect(s.build.people).toBe(7);
  });

  it("blocks Next and Create until every needed model is picked, and never picks for the user", () => {
    let s = { ...togglePick(start(), "rag"), step: 2 };
    expect(blocker(s)).toMatch(/Choose 1 model/);
    expect(buildFromState(catalog, s)).toBeNull();
    s = withModels(s);
    expect(blocker(s)).toBeNull();
    expect(buildFromState(catalog, s)).not.toBeNull();
  });

  it("does not ask for a model a recipe does not need under the current answers", () => {
    const s = togglePick(start(), "extraction");
    expect(missingFor(s, "extraction")).toHaveLength(0);
    expect(missingFor(setValue(s, "extraction", "route", "model"), "extraction")).toHaveLength(1);
  });

  it("changing the deployment clears model picks", () => {
    const s = withModels(togglePick(start(), "chat"));
    expect(Object.keys(s.models.chat ?? {})).toHaveLength(1);
    expect(setDeployment(s, "dataZone").models).toEqual({});
    expect(setDeployment(s, "regional").batchAllowed).toBe(false);
  });

  it("builds a valid project from two combined recipes with the Dev Lab kinds chosen", () => {
    let s = togglePick(togglePick(start(), "rag"), "email");
    s = withModels({ ...s, name: "Combined" });
    s = toggleDevKind(s, "playground");
    const b = buildFromState(catalog, s)!;
    expect(b.project.features.map((f) => f.id)).toEqual(["rag", "email"]);
    expect(projectIssues(b.project)).toEqual([]);
    expect(b.project.harnesses).toHaveLength(0);
    expect(b.assumptions.every((a) => a.source.length > 0)).toBe(true);
  });

  it("applies review edits, and drops them when an earlier answer changes", () => {
    let s = withModels(togglePick(start(), "batch"));
    const first = buildFromState(catalog, s)!;
    const a = first.assumptions.find((x) => x.target && x.label.includes("items a month"))!;
    s = setEdit(s, a.id, 777);
    const edited = buildFromState(catalog, s)!;
    expect(edited.project.workloads.find((w) => w.id === a.target!.id)).toMatchObject({ callsPerMonth: 777 });
    s = setValue(s, "batch", "monthly", 5);
    expect(s.edits).toEqual({});
  });

  it("maps wizard benefits to the P8 types: revenue as a value item, time saved as a capability, each with a confidence", () => {
    let s = withModels(togglePick(togglePick(start(), "batch"), "email"));
    s = setBenefit(s, "batch", { type: "revenue", monthlyRevenue: 12000, marginPct: 35 });
    const b = buildFromState(catalog, s)!;
    expect(projectIssues(b.project)).toEqual([]);
    const rev = b.project.benefits.value.find((v) => v.featureId === "batch")!;
    expect(rev).toMatchObject({ kind: "revenue", monthlyRevenue: 12000, marginPct: 35, confidencePct: defaultConfidence({ type: "revenue" }) });
    expect(b.project.benefits.capabilities.some((c) => c.id === rev.capabilityId && c.featureId === "batch")).toBe(true);
    const email = b.project.benefits.capabilities.find((c) => c.featureId === "email")!;
    expect(email.confidencePct).toBe(70);
    expect(b.project.benefits.avoidedCosts).toHaveLength(0);
    const edit = b.assumptions.find((a) => a.id === "batch-benefit-confidence")!;
    const edited = buildFromState(catalog, setEdit(s, edit.id, 20))!;
    expect(edited.project.benefits.value.find((v) => v.featureId === "batch")!.confidencePct).toBe(20);
    expect(b.assumptions.every((a) => a.source.length > 0)).toBe(true);
  });

  it("nothing is preselected for a benefit: an untouched feature uses the recipe's time-saved default only", () => {
    const s = withModels(togglePick(start(), "batch"));
    expect(s.benefits).toEqual({});
    expect(buildFromState(catalog, s)!.project.benefits.value).toHaveLength(0);
  });

  it("moves voice to the global deployment when the project deployment offers no real-time model", () => {
    const s = setDeployment(togglePick(start(), "voice"), "regional");
    expect(recipeDeployment(catalog, s, recipeById("voice")!)).toBe("global");
    const t = withModels(s);
    const b = buildFromState(catalog, t)!;
    expect(projectIssues(b.project)).toEqual([]);
    expect(b.project.workloads.find((w) => w.kind === "voiceAgent")).toMatchObject({ deployment: "global" });
  });
});

describe("wizard step 1: what kind of change", () => {
  it("is named for the kind of change, starts with no kind and no recipe chosen, and asks for a kind first", () => {
    const s = start();
    expect(STEPS[0]!.label).toBe("What kind of change?");
    expect(s.types).toEqual([]);
    expect(s.picks).toEqual([]);
    expect(recipesFor(s)).toEqual([]);
    expect(blocker(s)).toMatch(/kind of change/);
    expect(blocker(toggleType(s, "automation"))).toMatch(/at least one thing/);
  });

  it("offers recipes by kind: AI ones only under ai, the non-AI ones under their own kinds", () => {
    const ids = (t: Parameters<typeof toggleType>[1]) => recipesFor(toggleType(start(), t)).map((r) => r.id);
    expect(ids("ai")).toContain("rag");
    expect(ids("ai")).not.toContain("cheques");
    expect(ids("automation")).toEqual(expect.arrayContaining(["cheques", "rpa"]));
    expect(ids("automation")).not.toContain("rag");
    expect(ids("replatform")).toEqual(expect.arrayContaining(["liftshift", "paas", "dataplatform"]));
    expect(ids("saas")).toContain("saas");
    expect(ids("newApp")).toEqual(expect.arrayContaining(["newapp", "cheques", "dataplatform"]));
    expect(ids("enhancement")).toContain("enhance");
  });

  it("dropping a kind drops the recipes picked only under it, and keeps the ones another chosen kind still offers", () => {
    let s = toggleType(toggleType(start(), "automation"), "replatform");
    s = togglePick(togglePick(togglePick(s, "rpa"), "paas"), "dataplatform");
    expect(s.picks).toEqual(["rpa", "paas", "dataplatform"]);
    s = toggleType(s, "automation");
    expect(s.picks).toEqual(["paas", "dataplatform"]);
    expect(s.types).toEqual(["replatform"]);
  });

  it("a feature gets the chosen kinds its recipe belongs to", () => {
    const both = toggleType(toggleType(start(), "automation"), "newApp");
    expect(featureTypes(both, recipeById("cheques")!)).toEqual(["newApp", "automation"]);
    expect(featureTypes(toggleType(start(), "automation"), recipeById("cheques")!)).toEqual(["automation"]);
    expect(featureTypes(toggleType(start(), "ai"), recipeById("rag")!)).toEqual(["ai"]);
  });

  it("non-AI picks skip model choice and the generic build step; AI picks keep every step", () => {
    const plan = togglePick(toggleType(start(), "automation"), "cheques");
    expect(stepsFor(plan).map((x) => x.id)).toEqual(["what", "volume", "worth", "review"]);
    expect(allIds(togglePick(toggleType(start(), "ai"), "rag"))).toEqual(["what", "volume", "run", "build", "worth", "review"]);
    expect(allIds(togglePick(plan, "rag"))).toEqual(["what", "volume", "run", "build", "worth", "review"]);
    expect(stepIdOf({ ...plan, step: 2 })).toBe("worth");
    expect(blocker({ ...plan, step: 3 })).toBeNull();
    function allIds(x: ReturnType<typeof start>) { return stepsFor(x).map((y) => y.id); }
  });

  it("picking two kinds in one project builds one feature per recipe with types set per feature", () => {
    let s = toggleType(toggleType(start(), "automation"), "replatform");
    s = togglePick(togglePick(s, "rpa"), "paas");
    const b = buildFromState(catalog, s)!;
    expect(b.project.features.map((f) => [f.id, f.types])).toEqual([["rpa", ["automation"]], ["paas", ["replatform"]]]);
    expect(projectIssues(b.project)).toEqual([]);
    expect(usesAi(b.project)).toBe(false);
    expect(b.project.harnesses).toEqual([]);
    expect(b.project.build.activities).toEqual([]);
    expect(b.project.environments).toBeUndefined();
  });

  it("completes the cheques recipe with the user's choices and lands on the plan's figures", () => {
    let s = togglePick(toggleType(toggleType(start(), "automation"), "newApp"), "cheques");
    s = setValue(setValue(s, "cheques", "envs", "dev,test,uat"), "cheques", "leaseEnded", "yes");
    expect(blocker({ ...s, step: 1 })).toBeNull();
    const b = buildFromState(catalog, s)!;
    expect(b.project.features[0]!.types).toEqual(["newApp", "automation"]);
    const L = buildLedger(b.project, catalog);
    const roi = computeRoi(L, b.project.roi.basis, b.project.roi.discountRatePct, roiOptions(b.project));
    const sum = summarize(b.project, L, roi, catalog);
    expect(sum.currentVsTarget).toMatchObject({ currentMonthly: 42_000, saving: 33_150 });
    expect(L.totals.buildLabour).toBeCloseTo(672_750, 6);
    expect(b.project.timeline).toMatchObject({ buildMonths: 6, horizonMonths: 60, adoptionRampMonths: 6 });
    expect(sum.paybackMonth).not.toBeNull();
    expect(b.assumptions.every((a) => a.source.length > 0)).toBe(true);
    // Review edits reach the plan: a different gateway fee changes the run cost.
    const fee = b.assumptions.find((a) => a.id === "cheques-gateway.fee")!;
    const edited = buildFromState(catalog, setEdit(s, fee.id, 0.6))!;
    expect(buildLedger(edited.project, catalog).totals.runRate).toBeGreaterThan(L.totals.runRate);
  });

  it("leaves environments and the lease decision unchosen until the user chooses", () => {
    const s = togglePick(toggleType(start(), "automation"), "cheques");
    const b = buildFromState(catalog, s)!;
    expect(b.project.environments).toBeUndefined();
    expect(b.project.currentState!.lines.find((l) => l.id === "cheques-lease")!.decommission).toMatchObject({ assumed: false });
  });

  it("a plan recipe beside an AI recipe keeps the model choice for the AI part", () => {
    let s = togglePick(togglePick(toggleType(toggleType(start(), "ai"), "automation"), "chat"), "cheques");
    expect(buildFromState(catalog, s)).toBeNull();
    s = withModels(s);
    const b = buildFromState(catalog, s)!;
    expect(b.project.features.map((f) => f.types)).toEqual([["ai"], ["automation"]]);
    expect(usesAi(b.project)).toBe(true);
  });
});


describe("wizard help", () => {
  it("every question of every recipe, including the non-AI plan recipes, has full help", async () => {
    const { ALL_RECIPES } = await import("@roi-calculator/engine");
    const { helpFor, wizardHelpId } = await import("../lib/help");
    for (const r of ALL_RECIPES) for (const q of r.questions) {
      const h = helpFor(wizardHelpId(r.id, q.id));
      expect(h, `${r.id}.${q.id}`).toBeDefined();
      for (const part of ["meaning", "unit", "example", "source"] as const) expect(h![part].trim().length, `${r.id}.${q.id}.${part}`).toBeGreaterThan(0);
    }
  });
});
