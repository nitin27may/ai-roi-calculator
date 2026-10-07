import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ALLOWANCE_ID, MANUAL_METER, ProjectSchema, allowanceActive, buildLedger, computeRoi, summarize, clearActivityOverrides, clearAllOverrides, meetingIntelligence, overriddenCells, setMonthOverride, type Project } from "../src/index.js";

const cat = loadCatalog();
const fresh = (): Project => structuredClone(meetingIntelligence);
const devlab = (p: Project, m: number, id?: string) => buildLedger(p, cat).months[m - 1]!.lines.filter((l) => l.stream === "devlab" && (id === undefined || l.componentId === id)).reduce((s, l) => s + l.cost, 0);
const tooling = (p: Project) => p.build.activities.find((a) => a.kind === "tooling")!;

describe("typed Dev Lab cells", () => {
  it("a typed amount replaces the calculated month and flows into the totals", () => {
    const p = fresh();
    const a = tooling(p);
    const base = buildLedger(p, cat);
    const calc = devlab(p, 2, a.id);
    expect(calc).toBeGreaterThan(0);
    setMonthOverride(a, 2, 1234);
    const l = buildLedger(p, cat);
    expect(devlab(p, 2, a.id)).toBeCloseTo(1234, 6);
    expect(l.totals.devLab).toBeCloseTo(base.totals.devLab - calc + 1234, 4);
    expect(l.totals.build).toBeCloseTo(base.totals.build - calc + 1234, 4);
    const line = l.months[1]!.lines.find((x) => x.manual && x.componentId === a.id)!;
    expect(line.meter).toBe(MANUAL_METER);
    expect(line.calculated).toBeCloseTo(calc, 4);
    // other months are untouched
    expect(devlab(p, 3, a.id)).toBeCloseTo(devlab(fresh(), 3, a.id), 6);
  });

  it("is final as typed: contingency on all build costs and the AI dev-cost cut do not scale it", () => {
    const p = fresh();
    p.build.contingencyScope = "all";
    p.build.contingencyPct = 25;
    p.roi.devCutPct = 20;
    setMonthOverride(tooling(p), 2, 1000);
    expect(devlab(p, 2, tooling(p).id)).toBeCloseTo(1000, 6);
  });

  it("zero is a real override (the month costs nothing)", () => {
    const p = fresh();
    setMonthOverride(tooling(p), 2, 0);
    expect(devlab(p, 2, tooling(p).id)).toBe(0);
    expect(overriddenCells(p)).toHaveLength(1);
  });

  it("a typed amount works on a month where the calculation is empty, and on evaluation", () => {
    const p = fresh();
    const ev = p.build.activities.find((a) => a.kind === "evaluation")!;
    setMonthOverride(ev, 1, 500);
    expect(devlab(p, 1, ev.id)).toBeCloseTo(500, 6);
  });

  it("reset restores the calculation and removes the map", () => {
    const p = fresh();
    const a = tooling(p);
    const before = JSON.stringify(buildLedger(p, cat).totals);
    setMonthOverride(a, 2, 99);
    setMonthOverride(a, 3, 98);
    setMonthOverride(a, 2, undefined);
    expect(overriddenCells(p)).toHaveLength(1);
    clearActivityOverrides(a);
    expect(a.monthlyOverrideCad).toBeUndefined();
    expect(JSON.stringify(buildLedger(p, cat).totals)).toBe(before);
  });

  it("clearAllOverrides counts what it removes", () => {
    const p = fresh();
    setMonthOverride(p.build.activities[0]!, 1, 5);
    setMonthOverride(p.build.activities[1]!, 2, 6);
    expect(clearAllOverrides(p)).toBe(2);
    expect(overriddenCells(p)).toEqual([]);
  });

  it("does not count cells beyond the build window", () => {
    const p = fresh();
    setMonthOverride(tooling(p), p.timeline.buildMonths + 3, 5);
    expect(overriddenCells(p)).toEqual([]);
  });

  it("totals are identical when the fields are absent, and a project without them still parses", () => {
    const p = fresh();
    expect(p.build.devLabMonthlyCad).toBeUndefined();
    expect(p.build.activities.every((a) => a.monthlyOverrideCad === undefined)).toBe(true);
    expect(ProjectSchema.safeParse(p).success).toBe(true);
  });

  it("the schema accepts typed cells and rejects negative or non-month keys", () => {
    const p = fresh();
    setMonthOverride(tooling(p), 2, 10);
    expect(ProjectSchema.safeParse(p).success).toBe(true);
    const bad = fresh();
    (tooling(bad) as { monthlyOverrideCad?: Record<string, number> }).monthlyOverrideCad = { "2": -1 };
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
    (tooling(bad) as { monthlyOverrideCad?: Record<string, number> }).monthlyOverrideCad = { x: 1 };
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
  });
});

describe("one summarize() feeds every output", () => {
  it("the Summary build cost follows a typed cell and the allowance", () => {
    const sum = (p: Project) => { const l = buildLedger(p, cat); return summarize(p, l, computeRoi(l, p.roi.basis, p.roi.discountRatePct), cat); };
    const p = fresh();
    const base = sum(p);
    setMonthOverride(tooling(p), 2, 1_000_000);
    const typed = sum(p);
    expect(typed.build).toBeGreaterThan(base.build + 900_000);
    expect(typed.devLabShare).toBeGreaterThan(base.devLabShare);
    p.build.devLabMonthlyCad = 100;
    expect(sum(p).build).toBeLessThan(typed.build);
  });
});

describe("fixed monthly Dev Lab allowance", () => {
  it("replaces the calculated Dev Lab spend in every build month and wins over typed cells", () => {
    const p = fresh();
    const B = p.timeline.buildMonths;
    const base = buildLedger(p, cat);
    setMonthOverride(tooling(p), 2, 777);
    p.build.devLabMonthlyCad = 4000;
    expect(allowanceActive(p)).toBe(true);
    const l = buildLedger(p, cat);
    for (let m = 1; m <= B; m++) {
      expect(devlab(p, m)).toBeCloseTo(4000, 6);
      expect(l.months[m - 1]!.lines.filter((x) => x.stream === "devlab").map((x) => x.componentId)).toEqual([ALLOWANCE_ID]);
    }
    expect(l.totals.devLab).toBeCloseTo(4000 * B, 4);
    // labour and production are unchanged
    expect(l.totals.buildLabour).toBeCloseTo(base.totals.buildLabour, 6);
    expect(l.totals.runRate).toBeCloseTo(base.totals.runRate, 6);
  });

  it("0 or absent means no allowance", () => {
    const p = fresh();
    const base = buildLedger(p, cat).totals.devLab;
    p.build.devLabMonthlyCad = 0;
    expect(allowanceActive(p)).toBe(false);
    expect(buildLedger(p, cat).totals.devLab).toBeCloseTo(base, 6);
  });
});
