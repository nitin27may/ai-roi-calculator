import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PROJECT_TEMPLATES, buildLedger, computeRoi, meetingIntelligence, summarize } from "../src/index.js";

const cat = loadCatalog();
const r2 = (n: number) => Math.round(n * 100) / 100;

describe("summarize()", () => {
  for (const t of PROJECT_TEMPLATES) {
    const p = t.make(t.label);
    const ledger = buildLedger(p, cat);
    const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct);
    const s = summarize(p, ledger, roi, cat);

    it(`${t.label}: waterfall sums to net`, () => {
      const build = s.waterfall.find((w) => w.id === "build")!.value;
      const year1Run = s.waterfall.find((w) => w.id === "year1Run")!.value;
      const laterRun = s.waterfall.find((w) => w.id === "laterRun")!.value;
      const benefit = s.waterfall.find((w) => w.id === "benefit")!.value;
      const net = s.waterfall.find((w) => w.id === "net")!.value;
      expect(r2(benefit - build - year1Run - laterRun)).toBeCloseTo(r2(net), 0);
      expect(r2(build + year1Run + laterRun)).toBeCloseTo(r2(roi.totalCost), 0);
    });

    it(`${t.label}: total cost and benefit equal the ledger's`, () => {
      expect(r2(s.totalCost)).toBeCloseTo(r2(roi.totalCost), 0);
      expect(r2(s.totalBenefit)).toBeCloseTo(r2(roi.totalBenefit), 0);
      expect(r2(s.build)).toBeCloseTo(r2(ledger.totals.build), 0);
    });

    it(`${t.label}: payback matches roi.ts`, () => {
      expect(s.paybackMonth).toBe(roi.paybackMonth);
      expect(s.paysBackWithinPlan).toBe(roi.paybackMonth !== null);
      expect(s.verdict.paysBack).toBe(s.paysBackWithinPlan);
    });

    it(`${t.label}: steady-state annual run is 12x the monthly run + maintenance rate`, () => {
      expect(r2(s.steadyStateAnnualRun)).toBeCloseTo(r2((ledger.totals.runRate + ledger.totals.maintRate) * 12), 0);
      expect(r2(s.benefitPerYear)).toBeCloseTo(r2(ledger.totals.benefitRate * 12), 0);
    });

    it(`${t.label}: cost drivers sum to no more than the total lines, top is at most 6 rows`, () => {
      expect(s.costDrivers.length).toBeLessThanOrEqual(6);
      const lineTotal = ledger.months.flatMap((m) => m.lines).reduce((a, l) => a + l.cost, 0);
      const driverTotal = s.costDrivers.reduce((a, d) => a + d.value, 0);
      expect(driverTotal).toBeLessThanOrEqual(lineTotal + 1);
    });

    it(`${t.label}: sensitivity top 3 are sorted by swing, descending`, () => {
      for (let i = 1; i < s.sensitivityTop3.length; i++) expect(s.sensitivityTop3[i - 1]!.swing).toBeGreaterThanOrEqual(s.sensitivityTop3[i]!.swing);
      expect(s.sensitivityTop3.length).toBeLessThanOrEqual(3);
    });

    it(`${t.label}: alert groups only use the four named buckets plus other`, () => {
      for (const g of s.alerts) expect(["notOffered", "retiring", "tierFallback", "lowConfidence", "other"]).toContain(g.id);
    });
  }

  it("unit costs: the sample's chat workload gives a per-user figure", () => {
    const ledger = buildLedger(meetingIntelligence, cat);
    const roi = computeRoi(ledger, meetingIntelligence.roi.basis, meetingIntelligence.roi.discountRatePct);
    const s = summarize(meetingIntelligence, ledger, roi, cat);
    const perUser = s.unitCosts.find((u) => u.id === "chat:user");
    expect(perUser).toBeTruthy();
    expect(perUser!.perUnit).toBeGreaterThan(0);
  });

  it("verdict text matches the payback state", () => {
    const ledger = buildLedger(meetingIntelligence, cat);
    const roi = computeRoi(ledger, meetingIntelligence.roi.basis, meetingIntelligence.roi.discountRatePct);
    const s = summarize(meetingIntelligence, ledger, roi, cat);
    if (s.paysBackWithinPlan) expect(s.verdict.text).toBe(`Pays back in month ${s.paybackMonth}`);
    else expect(s.verdict.text).toBe("Does not pay back within the plan");
  });
});
