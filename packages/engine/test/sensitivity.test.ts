import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { sensitivity, meetingIntelligence, buildLedger, computeRoi } from "../src/index.js";

const cat = loadCatalog();

describe("sensitivity", () => {
  const s = sensitivity(meetingIntelligence, cat);
  it("uses the project's NPV as the base and sorts by swing", () => {
    const p = meetingIntelligence;
    expect(s.base).toBeCloseTo(computeRoi(buildLedger(p, cat), p.roi.basis, p.roi.discountRatePct).npv, 4);
    for (let i = 1; i < s.rows.length; i++) expect(s.rows[i - 1]!.swing).toBeGreaterThanOrEqual(s.rows[i]!.swing);
  });
  it("moves NPV in the expected direction for each input", () => {
    for (const r of s.rows) expect(r.high).toBeGreaterThanOrEqual(r.low - 1e-6);
  });
  it("does not change the project it is given", () => {
    const before = JSON.stringify(meetingIntelligence);
    sensitivity(meetingIntelligence, cat);
    expect(JSON.stringify(meetingIntelligence)).toBe(before);
  });
});

describe("combined cases", () => {
  it("puts every input at its low end below every single low, and the reverse for highs", () => {
    const s = sensitivity(meetingIntelligence, cat);
    expect(s.combined.low).toBeLessThan(Math.min(...s.rows.map((r) => r.low)));
    expect(s.combined.high).toBeGreaterThan(Math.max(...s.rows.map((r) => r.high)));
  });
});
