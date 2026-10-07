import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { PROJECT_TEMPLATES, buildLedger, compareFigures, computeRoi, costSplit, formatIrr, irrBand, meetingIntelligence, moneyBand, roiOptions, summarize, verdictFor } from "../src/index.js";

const cat = loadCatalog();

describe("range presentation", () => {
  it("flags the meeting-intelligence sample as wide on NPV, benefit and IRR", () => {
    const p = meetingIntelligence;
    const l = buildLedger(p, cat);
    const s = summarize(p, l, computeRoi(l, p.roi.basis, p.roi.discountRatePct, roiOptions(p)), cat);
    expect(moneyBand(s.range.npv).wide).toBe(true);
    expect(moneyBand(s.range.totalBenefit).wide).toBe(true);
    expect(irrBand(s.range.irrPct).wide).toBe(true);
  });
  it("shows a tight range as narrow", () => {
    expect(moneyBand({ low: 326, expected: 345, high: 350 }).wide).toBe(false);
    expect(irrBand({ low: 116, expected: 129, high: 130 })).toMatchObject({ wide: false, shown: true });
  });
  it("treats a flat range as narrow and a missing IRR range as not shown", () => {
    expect(moneyBand({ low: 5, expected: 5, high: 5 }).wide).toBe(false);
    expect(irrBand(null)).toMatchObject({ wide: false, shown: false });
  });
  it("is wide when the low IRR is below the floor even if the span is short", () => {
    expect(irrBand({ low: -60, expected: -20, high: 40 }).wide).toBe(true);
  });
  it("caps IRR text at both ends and keeps ordinary values", () => {
    expect(formatIrr(385.4)).toBe("over 300% a year");
    expect(formatIrr(-99.5)).toBe("below -90% a year");
    expect(formatIrr(39.4)).toBe("39% a year");
    expect(formatIrr(null)).toBe("Not defined");
  });
});

describe("costSplit, verdictFor, compareFigures", () => {
  for (const t of PROJECT_TEMPLATES) {
    it(`${t.label}: split sums to the plan cost on the full basis`, () => {
      const p = t.make(t.label);
      const l = buildLedger(p, cat);
      const roi = computeRoi(l, "full", 0);
      const parts = costSplit(l);
      expect(parts.reduce((s, x) => s + x.value, 0)).toBeCloseTo(roi.totalCost, 0);
      const shares = parts.reduce((s, x) => s + x.share, 0);
      expect(shares === 0 || Math.abs(shares - 1) < 1e-9).toBe(true);
    });
  }
  it("verdict tone follows payback and NPV", () => {
    expect(verdictFor({ paybackMonth: 10, npv: 1 }).tone).toBe("ok");
    expect(verdictFor({ paybackMonth: null, npv: 1 }).tone).toBe("warn");
    expect(verdictFor({ paybackMonth: 10, npv: -1 }).tone).toBe("warn");
    expect(verdictFor({ paybackMonth: null, npv: -1 }).tone).toBe("crit");
  });
  it("compareFigures reads the ledger totals", () => {
    const p = meetingIntelligence;
    const l = buildLedger(p, cat);
    const roi = computeRoi(l, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
    const c = compareFigures(p.name, l, roi);
    expect(c.build).toBe(l.totals.build);
    expect(c.runPerMonth).toBe(l.totals.runRate + l.totals.maintRate);
    expect(c.benefitPerYear).toBe(l.totals.benefitRate * 12);
    expect(c.npv).toBe(roi.npv);
  });
});
