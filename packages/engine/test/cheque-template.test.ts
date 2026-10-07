import { describe, expect, it } from "vitest";
import { loadCatalog, type ResourceType, type UnitPrice } from "@roi-calculator/catalog";
import { resourceFixtureCatalog } from "./fixtures/resource-catalog.js";
import { ProjectSchema, buildLedger, buildPlanProject, chequesTemplate, computeRoi, newActivity, roiOptions, summarize, usesAi, type Project } from "../src/index.js";

/**
 * Pins the worked example in docs/plan/50-any-project-build-plan.md ("cheques to online payments"). The example prices production
 * resources at a TEST figure of C$1,800 a month, all hour-billed. The shipped template does not: it uses catalogue SKUs (an App
 * Service plan and an Azure SQL database), so its own production resource cost differs. These tests therefore swap the template's
 * resources for one fixture resource that costs C$1,800 a month and price the project against a fixture catalogue; everything else
 * is the template as shipped.
 *
 * Rounding: the plan rounds the non-production environments to C$271 (dev, test) and C$542 (UAT), but the engine does the exact
 * sum 1,800 x 0.5 x 220 / 730 = C$271.23 and 1,800 x 1.0 x 220 / 730 = C$542.47. So the engine's figures are higher by C$0.23 per
 * dev or test month and C$0.47 per UAT month: C$3.7 on the build total (4,339.73 against 4,336), C$0.47 a month in production
 * (542.47 against 542), and C$29 on the cumulative net at month 60. Everything else (labour, delivery costs, savings, gateway
 * fee, support) is exact, so the tolerances below are C$5 on the build, C$1 a month and C$30 on the 60-month figure.
 */
const src = { kind: "derived" as const, note: "Test fixture.", retrievedAt: "2026-10-06" };
const FIXTURE_TYPE: ResourceType = {
  id: "fx-prod", label: "Plan fixture", category: "compute",
  inputs: [{ id: "units", label: "Units", unit: "units", help: "How many." }],
  meters: [{ id: "m", label: "Monthly", quantity: { input: "units" }, hourly: true, scalesWithSize: true }],
  options: ["payg"], skus: [{ id: "std", label: "Standard", attrs: {}, prices: { m: "fx-prod-price" } }],
};
const FIXTURE_PRICE: UnitPrice = { id: "fx-prod-price", label: "Production resources, test price", platform: "azure", unit: "month (730 h)", price: 1800, source: src, confidence: "unverified" };
const base = resourceFixtureCatalog();
const cat = { ...base, resourceTypes: [...base.resourceTypes, FIXTURE_TYPE], unitPrices: [...base.unitPrices, FIXTURE_PRICE] };
const real = loadCatalog();

/** The template with its catalogue resources replaced by one C$1,800 a month resource (in every environment). */
function worked(edit: (p: Project) => void = () => {}): Project {
  const p = chequesTemplate("Cheques to online payments");
  p.resources = [{ id: "prod-res", label: "Production resources (test price)", typeId: "fx-prod", skuId: "std", inputs: { units: 1 }, term: "payg", ahb: false }];
  edit(p);
  return ProjectSchema.parse(p) as Project;
}
const run = (p: Project, c = cat) => {
  const ledger = buildLedger(p, c);
  const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  return { ledger, roi, s: summarize(p, ledger, roi, c) };
};
const total = (m: { byStream: Record<string, number | undefined> }) => Object.values(m.byStream).reduce<number>((t, x) => t + (x ?? 0), 0);
const netOf = (r: ReturnType<typeof run>) => r.ledger.months.map((m) => m.benefit - total(m));
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

describe("cheques to online payments: the plan's worked example", () => {
  const r = run(worked());
  const net = netOf(r);

  it("is built from the six-month, 60-month plan with a 6-month ramp and 15% contingency on labour", () => {
    const p = worked();
    expect(p.timeline).toMatchObject({ buildMonths: 6, horizonMonths: 60, adoptionRampMonths: 6 });
    expect(p.build).toMatchObject({ contingencyPct: 15, contingencyScope: "labour" });
    expect(p.maintenance).toEqual({ mode: "none" });
    expect(p.features).toMatchObject([{ id: "cheques", types: ["newApp", "automation"] }]);
  });

  it("current state totals C$42,000 a month and the saving is C$31,650 until month 17 and C$33,150 from month 18", () => {
    expect(r.s.currentVsTarget!.currentMonthly).toBe(42_000);
    const benefit = r.ledger.months.map((m) => m.benefit);
    for (const m of [12, 13, 17]) expect(benefit[m - 1]).toBeCloseTo(31_650, 6);
    for (const m of [18, 19, 60]) expect(benefit[m - 1]).toBeCloseTo(33_150, 6);
    expect(r.s.currentVsTarget!.saving).toBeCloseTo(33_150, 6);
  });

  it("the lines are the plan's: unit costs, volumes and changes", () => {
    const by = Object.fromEntries(worked().currentState!.lines.map((l) => [l.id.replace("cheques-", ""), l]));
    expect(by.stock!.basis).toMatchObject({ kind: "perTransaction", unitCostCad: 0.4, volumePerMonth: 10_000 });
    expect(by.postage!.basis).toMatchObject({ unitCostCad: 1.2, volumePerMonth: 10_000 });
    expect(by.courier!.basis).toMatchObject({ unitCostCad: 15, volumePerMonth: 500 });
    expect(by.reissue!.basis).toMatchObject({ unitCostCad: 25, volumePerMonth: 200 });
    expect(by.recon!.basis).toMatchObject({ kind: "fte", fte: 2, hoursPerMonth: 150 });
    expect(by.recon!.change).toMatchObject({ mode: "reduce", pct: 50 });
    for (const k of ["stock", "postage", "courier", "reissue"]) expect(by[k]!.change).toMatchObject({ mode: "reduce", pct: 90, followsAdoption: true });
    expect(by.lease!.change).toEqual({ mode: "retire", fromMonth: 18 });
    expect(by.lease!.decommission).toMatchObject({ conditional: true, assumed: true });
  });

  it("the build is C$712,086: labour 672,750, delivery costs 35,000, non-production environments about 4,336", () => {
    const L = r.ledger;
    expect(L.totals.buildLabour).toBeCloseTo(672_750, 6);
    const months = L.months.slice(0, 6);
    expect(sum(months.map((m) => m.byStream.labour ?? 0))).toBeCloseTo(672_750, 6);
    expect(sum(months.map((m) => m.byStream.delivery ?? 0))).toBeCloseTo(35_000, 6);
    expect(sum(months.map((m) => m.byStream.env ?? 0))).toBeCloseTo(4_336, -1);
    // dev and test 0.5 size on 10 h x 22 d; UAT 1.0 size on the same hours, months 5 and 6 only.
    expect(sum(months.map((m) => m.byStream.env ?? 0))).toBeCloseTo(6 * 2 * (1800 * 0.5 * 220) / 730 + 2 * (1800 * 220) / 730, 6);
    expect(Math.abs(L.totals.build - 712_086)).toBeLessThan(5);
    expect(r.s.build).toBeCloseTo(L.totals.build, 6);
    const uat = L.months.map((m) => m.lines.some((l) => l.id.endsWith(":uat")));
    expect(uat.map((x, i) => (x ? i + 1 : 0)).filter(Boolean)).toEqual([5, 6]);
  });

  it("net per month: 13 to 17 C$26,108, from 18 C$27,608, and months 7 to 12 about C$84,273 with the ramp", () => {
    for (const m of [13, 14, 15, 16, 17]) expect(net[m - 1]).toBeCloseTo(26_108, 0);
    for (const m of [18, 30, 60]) expect(net[m - 1]).toBeCloseTo(27_608, 0);
    expect(Math.abs(sum(net.slice(6, 12)) - 84_273)).toBeLessThan(5);
  });

  it("pays back in month 36 and has about C$689,871 cumulative net at month 60 (undiscounted)", () => {
    expect(r.roi.paybackMonth).toBe(36);
    expect(r.s.paybackMonth).toBe(36);
    expect(Math.abs(sum(net) - 689_871)).toBeLessThan(30);
    let cum = 0;
    const cumulative = net.map((n) => (cum += n));
    expect(cumulative[34]).toBeLessThan(0);
    expect(cumulative[35]).toBeGreaterThan(0);
  });

  it("with the lease not decommissioned the saving stays C$31,650, net C$26,108 and payback is later", () => {
    const v = run(worked((p) => { const l = p.currentState!.lines.find((x) => x.id === "cheques-lease")!; l.decommission = { conditional: true, condition: "Printer lease ended", assumed: false }; }));
    const n = netOf(v);
    for (const m of [13, 18, 24, 60]) expect(n[m - 1]).toBeCloseTo(26_108, 0);
    expect(v.roi.paybackMonth).toBeGreaterThan(36);
    expect(v.s.currentVsTarget!.saving).toBeCloseTo(31_650, 6);
    expect(v.s.currentVsTarget!.currentMonthly).toBe(42_000);
  });

  it("AI-assisted development at 20% on Dev saves C$65,205 of labour including contingency, shown net of the seat cost", () => {
    const p = worked((q) => {
      q.build.aiAssist = { productivityPctByRole: { dev: 20 } };
      q.build.team.find((t) => t.roleId === "dev")!.experiments = true;
      q.build.activities = [newActivity(q, "tooling")];
    });
    const a = run(p).s.aiAssist!;
    expect(a.labourSaved).toBeCloseTo(0.2 * 3 * 150 * 6 * 105 * 1.15, 6);
    expect(a.labourSaved).toBeCloseTo(65_205, 6);
    expect(a.hoursSaved).toBeCloseTo(0.2 * 3 * 150 * 6, 6);
    expect(a.toolCost).toBeGreaterThan(0);
    expect(a.net).toBeCloseTo(65_205 - a.toolCost, 6);
  });

  it("the shipped template uses catalogue resources, so its production figure is not the C$1,800 test price", () => {
    const shipped = chequesTemplate("Cheques");
    expect(shipped.resources!.map((x) => `${x.typeId}/${x.skuId}`)).toEqual(["app-service-plan/p1v3-linux", "sql-db-vcore/gp-gen5"]);
    for (const x of shipped.resources!) {
      const t = real.resourceTypes.find((y) => y.id === x.typeId);
      expect(t, x.typeId).toBeDefined();
      expect(t!.skus.some((s) => s.id === x.skuId), `${x.typeId}/${x.skuId}`).toBe(true);
    }
    const prodResource = (p: Project, c = real) => buildLedger(p, c).months[20]!.lines.filter((l) => l.componentId.startsWith("resource:") && l.id.endsWith(":prod")).reduce((t, l) => t + l.cost, 0);
    const cost = prodResource(shipped);
    expect(cost).toBeGreaterThan(0);
    expect(Math.abs(cost - 1800)).toBeGreaterThan(100);
    expect(run(shipped, real).ledger.totals.build).not.toBeCloseTo(712_086, -2);
  });

  it("the scorecard starter has speed and customer items, unmonetised, so it does not move NPV", () => {
    const p = worked();
    expect(p.benefits.scorecard).toMatchObject([
      { dimension: "speed", measure: "Days from claim to payment", before: 10, after: 2, higherIsBetter: false },
      { dimension: "customer", measure: "Customer satisfaction score", before: 60, after: 75, higherIsBetter: true },
    ]);
    expect(p.benefits.scorecard!.every((x) => x.monetise === undefined)).toBe(true);
    const without = run(worked((q) => { delete q.benefits.scorecard; }));
    expect(r.roi.npv).toBeCloseTo(without.roi.npv, 6);
    expect(r.s.scorecard).toMatchObject({ count: 2, monetisedMonthly: 0 });
  });

  it("is not an AI project and adds no model, harness or Dev Lab work", () => {
    const p = worked();
    expect(usesAi(p)).toBe(false);
    expect(p.harnesses).toEqual([]);
    expect(p.build.activities).toEqual([]);
    expect(p.workloads.map((w) => w.kind).sort()).toEqual(["contract", "transactionFee"]);
  });

  it("the template and the recipe with the same answers are the same project", () => {
    const viaRecipe = buildPlanProject({
      name: "Same", deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 0, months: 6 }, devKinds: [],
      selections: [{ recipeId: "cheques", label: "Cheques to online payments", values: { envs: "dev,test,uat", leaseEnded: "yes" }, types: ["newApp", "automation"] }],
    }).project;
    expect({ ...viaRecipe, name: "x", startDate: "" }).toEqual({ ...chequesTemplate("x"), startDate: "" });
  });
});

describe("cheques recipe: the monetised example is off by default", () => {
  const make = (values: Record<string, string | number | boolean>) => buildPlanProject({
    name: "m", deployment: "dataZone", quality: "balanced", batchAllowed: false, build: { people: 0, months: 6 }, devKinds: [],
    selections: [{ recipeId: "cheques", values: { envs: "dev,test,uat", leaseEnded: "yes", ...values }, types: ["automation"] }],
  }).project;
  it("adds a monetised item only when asked, and then it moves NPV", () => {
    const off = make({});
    const on = make({ monetiseSpeed: true });
    expect(off.benefits.scorecard!.every((x) => x.monetise === undefined)).toBe(true);
    const speed = on.benefits.scorecard!.find((x) => x.dimension === "speed")!;
    expect(speed.monetise).toEqual({ cadPerUnit: 0.05, volumePerMonth: 9000 });
    expect(run(on, real).roi.npv).toBeGreaterThan(run(off, real).roi.npv);
  });
  it("leaves the lease saving out and picks no environment until the user chooses", () => {
    const p = make({ leaseEnded: "", envs: "" });
    expect(p.environments).toBeUndefined();
    expect(p.currentState!.lines.find((l) => l.id === "cheques-lease")!.decommission).toMatchObject({ assumed: false });
    expect(p.features[0]!.types).toEqual(["automation"]);
  });
});
