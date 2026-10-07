import { describe, expect, it } from "vitest";
import { defaultConfidence, projectIssues, recommendModel, recipeById } from "@roi-calculator/engine";
import { loadCatalog } from "@roi-calculator/catalog";
import {
  STEPS, blocker, buildFromState, initialState, missingFor, recipeDeployment, setBenefit, setBuild, setDeployment, setEdit, setModel, setValue, toggleDevKind, togglePick,
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
