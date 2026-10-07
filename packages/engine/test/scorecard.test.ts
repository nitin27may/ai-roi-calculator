import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, blankProject, buildLedger, computeRoi, roiOptions, scoreRows, scorecardRows, summarize, summaryRows, monthRows, featureBreakdown, type Project, type ScoreItem } from "../src/index.js";

const cat = loadCatalog();

const item = (o: Partial<ScoreItem> & Pick<ScoreItem, "id" | "before" | "after" | "higherIsBetter">): ScoreItem => ({
  label: o.id, dimension: "speed", measure: "Days from claim to payment", unit: "day", weightPct: 50, confidencePct: 100, ...o,
});

/** Six build months, a 6-month ramp, a fixed monthly run cost so NPV is not zero. */
function base(items: ScoreItem[] | undefined, setup?: (p: Project) => void): Project {
  const p = blankProject("Claims", "2027-01-01");
  p.timeline = { buildMonths: 6, horizonMonths: 36, adoptionRampMonths: 6 };
  p.build.team = []; p.build.environment = []; p.maintenance = { mode: "none" };
  p.roi.discountRatePct = 10; p.roi.growthPctPerYear = 0; p.roi.rateEscalationPctPerYear = 0;
  p.workloads.push({ kind: "fixed", id: "run", label: "Run", group: "Platform", items: [{ id: "x", label: "Run", amountCad: 2000, cadence: "monthly" }] } as Project["workloads"][number]);
  setup?.(p);
  if (items) p.benefits.scorecard = items;
  return ProjectSchema.parse(p);
}
const roiOf = (p: Project) => { const l = buildLedger(p, cat); return { l, r: computeRoi(l, p.roi.basis, p.roi.discountRatePct, roiOptions(p)) }; };

describe("scorecard improvement and composite", () => {
  it("cycle time 10 -> 2 days, lower is better, is +80%; a score 60 -> 75, higher is better, is +25%", () => {
    const p = base([item({ id: "cycle", before: 10, after: 2, higherIsBetter: false }), item({ id: "csat", dimension: "customer", before: 60, after: 75, higherIsBetter: true })]);
    const { rows } = scoreRows(p);
    expect(rows[0]!.improvementPct).toBeCloseTo(80, 9);
    expect(rows[0]!.direction).toBe("better");
    expect(rows[1]!.improvementPct).toBeCloseTo(25, 9);
  });

  it("composite is the weighted average improvement: weights 60/40 give 0.6 x 80 + 0.4 x 25 = 58", () => {
    const p = base([item({ id: "cycle", before: 10, after: 2, higherIsBetter: false, weightPct: 60 }), item({ id: "csat", before: 60, after: 75, higherIsBetter: true, weightPct: 40 })]);
    const r = scoreRows(p);
    expect(r.composite).toBeCloseTo(58, 9);
    expect(r.rows[0]!.contribution).toBeCloseTo(48, 9);
    expect(r.rows[1]!.contribution).toBeCloseTo(10, 9);
  });

  it("weights are normalised, so 30/20 gives the same composite as 60/40", () => {
    const p = base([item({ id: "a", before: 10, after: 2, higherIsBetter: false, weightPct: 30 }), item({ id: "b", before: 60, after: 75, higherIsBetter: true, weightPct: 20 })]);
    expect(scoreRows(p).composite).toBeCloseTo(58, 9);
  });

  it("confidence does not discount the index", () => {
    const hi = base([item({ id: "a", before: 10, after: 2, higherIsBetter: false, confidencePct: 100 })]);
    const lo = base([item({ id: "a", before: 10, after: 2, higherIsBetter: false, confidencePct: 10 })]);
    expect(scoreRows(lo).composite).toBe(scoreRows(hi).composite);
  });

  it("a worse direction is negative and a bigger number can be worse", () => {
    const p = base([item({ id: "a", before: 10, after: 15, higherIsBetter: false }), item({ id: "b", before: 80, after: 80, higherIsBetter: true })]);
    const { rows } = scoreRows(p);
    expect(rows[0]!.improvementPct).toBeCloseTo(-50, 9);
    expect(rows[0]!.direction).toBe("worse");
    expect(rows[1]!.direction).toBe("no change");
  });

  it("before = 0 gives no percentage and is left out of the composite", () => {
    const p = base([item({ id: "z", before: 0, after: 5, higherIsBetter: true, weightPct: 90 }), item({ id: "a", before: 10, after: 5, higherIsBetter: false, weightPct: 10 })]);
    const r = scoreRows(p);
    expect(r.rows[0]!.improvementPct).toBeNull();
    expect(r.rows[0]!.direction).toBe("better");
    expect(r.composite).toBeCloseTo(50, 9);
    expect(scorecardRows(p)[0]!["Improvement (%)"]).toBe("n/a");
  });

  it("composite is null when no item has a weight", () => {
    expect(scoreRows(base([item({ id: "a", before: 10, after: 5, higherIsBetter: false, weightPct: 0 })])).composite).toBeNull();
  });
});

describe("scorecard in the financial figures", () => {
  const plain = base(undefined);
  const { l: l0, r: r0 } = roiOf(plain);

  it("an absent or empty scorecard adds nothing", () => {
    const empty = base([]);
    const { l, r } = roiOf(empty);
    expect(r.npv).toBe(r0.npv);
    expect(r.paybackMonth).toBe(r0.paybackMonth);
    expect(l.totals.benefitRate).toBe(l0.totals.benefitRate);
    expect(summarize(empty, l, r, cat).scorecard).toBeUndefined();
    expect(summaryRows(empty, l, r, cat).map((x) => x.Item).join("|")).not.toMatch(/Scorecard/);
    expect(scorecardRows(empty)).toEqual([]);
    expect(monthRows(l, r)[0]).not.toHaveProperty("Scorecard value");
  });

  it("a non-monetised item changes no NPV, payback, IRR, benefit or cost", () => {
    const p = base([item({ id: "cycle", before: 10, after: 2, higherIsBetter: false })]);
    const { l, r } = roiOf(p);
    expect(r.npv).toBe(r0.npv);
    expect(r.irrPct).toBe(r0.irrPct);
    expect(r.paybackMonth).toBe(r0.paybackMonth);
    expect(r.totalBenefit).toBe(r0.totalBenefit);
    expect(r.totalCost).toBe(r0.totalCost);
    expect(l.totals.benefitRate).toBe(l0.totals.benefitRate);
    const s = summarize(p, l, r, cat);
    expect(s.scorecard).toEqual({ count: 1, composite: 80, monetisedMonthly: 0 });
  });

  it("monetised: 8 days saved x C$25 per day x 1,000 payments x 50% confidence = C$100,000 a month at full rollout", () => {
    const p = base([item({ id: "cycle", before: 10, after: 2, higherIsBetter: false, confidencePct: 50, monetise: { cadPerUnit: 25, volumePerMonth: 1000 } })]);
    const { l, r } = roiOf(p);
    expect(scoreRows(p).monetisedMonthly).toBe(100_000);
    expect(l.totals.benefitRate - l0.totals.benefitRate).toBe(100_000);
    expect(r.npv).toBeGreaterThan(r0.npv);
    expect(summarize(p, l, r, cat).scorecard!.monetisedMonthly).toBe(100_000);
  });

  it("follows the adoption ramp from go-live: nothing in build, 1/6 in month 7, full from month 12", () => {
    const p = base([item({ id: "cycle", before: 10, after: 2, higherIsBetter: false, confidencePct: 50, monetise: { cadPerUnit: 25, volumePerMonth: 1000 } })]);
    const { l } = roiOf(p);
    const v = (m: number) => l.months[m - 1]!.benefitBy.scorecard.cycle ?? 0;
    expect(v(6)).toBe(0);
    expect(v(7)).toBeCloseTo(100_000 / 6, 6);
    expect(v(9)).toBeCloseTo(50_000, 6);
    expect(v(12)).toBe(100_000);
    expect(v(30)).toBe(100_000);
    expect(l.months[11]!.benefit - l0.months[11]!.benefit).toBe(100_000);
  });

  it("a monetised item that moves the wrong way is a cost", () => {
    const p = base([item({ id: "bad", before: 2, after: 4, higherIsBetter: false, confidencePct: 100, monetise: { cadPerUnit: 10, volumePerMonth: 100 } })]);
    const { l, r } = roiOf(p);
    expect(scoreRows(p).monetisedMonthly).toBe(-2000);
    expect(l.totals.benefitRate - l0.totals.benefitRate).toBe(-2000);
    expect(r.npv).toBeLessThan(r0.npv);
  });

  it("takes volume from a linked workload, and only monetised items count in a mix", () => {
    const p = base([
      item({ id: "m", before: 10, after: 8, higherIsBetter: false, monetise: { cadPerUnit: 1, volumeFrom: "pay" } }),
      item({ id: "n", dimension: "customer", before: 60, after: 90, higherIsBetter: true }),
    ], (q) => { q.workloads.push({ kind: "transactionFee", id: "pay", label: "Payments", group: "Platform", volumePerMonth: 3000, feeCad: 0 } as unknown as Project["workloads"][number]); });
    const rows = scoreRows(p);
    expect(rows.rows[0]!.monthlyValue).toBe(6000);
    expect(rows.rows[1]!.monthlyValue).toBe(0);
    expect(rows.monetisedMonthly).toBe(6000);
  });

  it("feature breakdown credits a monetised item to its feature", () => {
    const p = base([item({ id: "m", before: 10, after: 8, higherIsBetter: false, featureId: "f1", monetise: { cadPerUnit: 1, volumePerMonth: 1000 } })],
      (q) => { q.features.push({ id: "f1", label: "Faster payments", types: [] } as unknown as Project["features"][number]); });
    const { l } = roiOf(p);
    const row = featureBreakdown(p, l).find((x) => x.id === "f1")!;
    expect(row.benefit).toBeGreaterThan(0);
  });

  it("rejects an unknown feature or workload id", () => {
    const p = base([item({ id: "ok", before: 1, after: 2, higherIsBetter: true })]);
    p.benefits.scorecard = [item({ id: "m", before: 1, after: 2, higherIsBetter: true, featureId: "nope", monetise: { cadPerUnit: 1, volumeFrom: "nowhere" } })];
    const res = ProjectSchema.safeParse(p);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toMatch(/Unknown feature[\s\S]*Unknown workload/);
  });
});
