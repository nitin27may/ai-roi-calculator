import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, blankProject, buildLedger, compareFigures, computeRoi, roiOptions, type ProjectType, type Project } from "@roi-calculator/engine";
import { EXTRA_COMPARE_ROWS } from "../lib/compare";
import { extraFigures, filterProjects, groupProjects, portfolioKeys, portfolioTotals } from "../lib/portfolio";
import { PORTFOLIO_KEY, DEFAULT_PORTFOLIO, readPortfolio, writePortfolio, type PrefStorage } from "../lib/prefs";

const catalog = loadCatalog();
const typed = (name: string, ...featureTypes: ProjectType[][]): Project => {
  const b = blankProject(name, "2027-01-01");
  return ProjectSchema.parse({ ...b, features: featureTypes.map((types, i) => ({ id: `f${i}`, label: `F${i}`, types })) });
};
const entry = (id: string, project: Project) => ({ id, project });
const library = [
  entry("a", typed("Auto", ["automation"])),
  entry("b", typed("Bot", ["ai"])),
  entry("c", typed("Mixed", ["automation"], ["ai"])),
  entry("d", typed("Plain")),
];
const figures = (p: Project) => {
  const L = buildLedger(p, catalog);
  const r = computeRoi(L, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  return { L, r, f: compareFigures(p.name, L, r) };
};
const mem = (): PrefStorage & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }; };

describe("portfolio keys, filter and grouping", () => {
  it("puts a project with no type under notSet", () => {
    expect(portfolioKeys(library[3]!.project)).toEqual(["notSet"]);
    expect(portfolioKeys(library[2]!.project)).toEqual(["automation", "ai"]);
  });
  it("shows everything with no chip on", () => {
    expect(filterProjects(library, []).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps a mixed project when either of its types is on, and the not-set bucket on its own", () => {
    expect(filterProjects(library, ["ai"]).map((e) => e.id)).toEqual(["b", "c"]);
    expect(filterProjects(library, ["automation", "ai"]).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(filterProjects(library, ["notSet"]).map((e) => e.id)).toEqual(["d"]);
  });
  it("lists a mixed project in each of its groups, in type order, with Not set last", () => {
    const g = groupProjects(library, []);
    expect(g.map((x) => x.key)).toEqual(["automation", "ai", "notSet"]);
    expect(g[0]!.entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(g[1]!.entries.map((e) => e.id)).toEqual(["b", "c"]);
    expect(g[2]!.entries.map((e) => e.id)).toEqual(["d"]);
  });
  it("shows only the groups a chip names", () => {
    expect(groupProjects(library, ["ai"]).map((x) => x.key)).toEqual(["ai"]);
  });
  it("counts a mixed project once in overall totals even though it sits in two groups", () => {
    const fig = new Map(library.map((e) => [e.id, figures(e.project).f]));
    const overall = portfolioTotals(library.map((e) => fig.get(e.id)!));
    expect(overall.count).toBe(4);
    const groupCounts = groupProjects(library, []).map((g) => portfolioTotals(g.entries.map((e) => fig.get(e.id)!)).count);
    expect(groupCounts.reduce((a, b) => a + b, 0)).toBe(5);
    const one = fig.get("c")!;
    expect(overall.build).toBeCloseTo([...fig.values()].reduce((s, f) => s + f.build, 0));
    expect(overall.build).toBeGreaterThanOrEqual(one.build);
  });
  it("totals build, run, NPV and the number paying back", () => {
    const t = portfolioTotals([{ build: 10, runPerMonth: 1, npv: 5, paybackMonth: 4 }, { build: 20, runPerMonth: 2, npv: -3, paybackMonth: null }]);
    expect(t).toEqual({ count: 2, build: 30, runPerMonth: 3, npv: 2, payingBack: 1 });
  });
});

describe("portfolio persistence", () => {
  it("starts with nothing on and nothing stored", () => {
    const s = mem();
    expect(readPortfolio(s)).toEqual(DEFAULT_PORTFOLIO);
    expect(s.data.has(PORTFOLIO_KEY)).toBe(false);
    expect(PORTFOLIO_KEY.startsWith("roi-calculator:")).toBe(true);
  });
  it("round-trips the grouping and the chips", () => {
    const s = mem();
    writePortfolio(s, { groupBy: "type", filter: ["ai", "notSet"] });
    expect(readPortfolio(s)).toEqual({ groupBy: "type", filter: ["ai", "notSet"] });
  });
  it("drops unknown values and survives garbage or blocked storage", () => {
    const s = mem();
    s.setItem(PORTFOLIO_KEY, JSON.stringify({ groupBy: "colour", filter: ["ai", "bogus", 3] }));
    expect(readPortfolio(s)).toEqual({ groupBy: "none", filter: ["ai"] });
    s.setItem(PORTFOLIO_KEY, "{nope");
    expect(readPortfolio(s)).toEqual(DEFAULT_PORTFOLIO);
    const blocked: PrefStorage = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
    expect(readPortfolio(blocked)).toEqual(DEFAULT_PORTFOLIO);
    expect(() => writePortfolio(blocked, DEFAULT_PORTFOLIO)).not.toThrow();
  });
});

describe("compare extras", () => {
  it("is null for a project without current-state lines or scorecard items", () => {
    const p = typed("Plain");
    const { L, r } = figures(p);
    const x = extraFigures(p, L, r);
    expect(x.savingPerMonth).toBeNull();
    expect(x.scorecardComposite).toBeNull();
    expect(x.monetisedMonthly).toBeNull();
    for (const row of EXTRA_COMPARE_ROWS.filter((r2) => r2.id !== "discountedPaybackMonth")) expect(row.table(x[row.id])).toBe("n/a");
  });
  it("fills the saving, composite and monetised value when A5 and A11 data exist", () => {
    const b = typed("Rich", ["automation"]);
    const p = ProjectSchema.parse({
      ...b,
      currentState: { lines: [{ id: "l1", label: "Manual processing", category: "other", basis: { kind: "monthly", amountCad: 10000 }, change: { mode: "retire" } }] },
      benefits: { ...b.benefits, scorecard: [{ id: "s1", label: "Cycle time", dimension: "speed", measure: "Days", unit: "day", before: 10, after: 5, higherIsBetter: false, weightPct: 100, confidencePct: 100 }] },
    });
    const { L, r } = figures(p);
    const x = extraFigures(p, L, r);
    expect(x.savingPerMonth).toBeCloseTo(10000);
    expect(x.scorecardComposite).toBeCloseTo(50);
    expect(x.monetisedMonthly).toBe(0);
    const row = (id: string) => EXTRA_COMPARE_ROWS.find((r2) => r2.id === id)!;
    expect(row("savingPerMonth").table(x.savingPerMonth)).not.toBe("n/a");
    expect(row("scorecardComposite").table(x.scorecardComposite)).toContain("50");
  });
  it("shows a missing discounted payback as n/a", () => {
    expect(EXTRA_COMPARE_ROWS.find((r) => r.id === "discountedPaybackMonth")!.table(null)).toBe("n/a");
  });
});
