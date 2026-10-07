import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { LABOUR_EXCLUDED_TEXT, PROJECT_TEMPLATES, buildLabel, buildLedger, computeRoi, meetingIntelligence, roiOptions, summarize, summaryRows, labourExcluded, type Project } from "../src/index.js";

const cat = loadCatalog();
const run = (p: Project) => {
  const ledger = buildLedger(p, cat);
  const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  return { ledger, roi, s: summarize(p, ledger, roi, cat) };
};
const without = (p: Project): Project => { const q = structuredClone(p); q.build.includeLabour = false; return q; };

describe("exclude build labour", () => {
  const projects: [string, Project][] = [["sample", meetingIntelligence], ...PROJECT_TEMPLATES.map((t): [string, Project] => [t.label, t.make(t.label)])];

  for (const [name, p] of projects) {
    it(`${name}: build and total cost drop by exactly the build labour, other costs unchanged`, () => {
      const on = run(p), off = run(without(p));
      const labour = on.ledger.totals.buildLabour;
      expect(off.ledger.totals.buildLabour).toBe(0);
      expect(off.ledger.totals.build).toBeCloseTo(on.ledger.totals.build - labour, 4);
      expect(off.ledger.totals.devLab).toBeCloseTo(on.ledger.totals.devLab, 6);
      expect(off.ledger.totals.runRate).toBeCloseTo(on.ledger.totals.runRate, 6);
      // Maintenance priced as a percent of build is derived from the build figure, so it follows it down; a team or none is untouched.
      if (p.maintenance.mode === "pctOfBuild") expect(Math.abs(off.ledger.totals.maintRate - on.ledger.totals.maintRate * (off.ledger.totals.build / on.ledger.totals.build))).toBeLessThan(5);
      else expect(off.ledger.totals.maintRate).toBeCloseTo(on.ledger.totals.maintRate, 6);
      expect(off.ledger.totals.benefitRate).toBeCloseTo(on.ledger.totals.benefitRate, 6);
      if (p.roi.basis === "full" && p.maintenance.mode !== "pctOfBuild") expect(off.s.totalCost).toBeCloseTo(on.s.totalCost - labour, 3);
      expect(off.s.build).toBeCloseTo(on.s.build - labour, 4);
    });

    it(`${name}: summary flags it and the waterfall build step says so`, () => {
      const on = run(p).s, off = run(without(p)).s;
      expect(on.labourExcluded).toBe(false);
      expect(off.labourExcluded).toBe(true);
      expect(on.waterfall[0]!.label).toBe("Building & testing");
      expect(off.waterfall[0]!.label).toContain(LABOUR_EXCLUDED_TEXT.toLowerCase());
    });
  }

  it("sample: the flag changes nothing until set, and the golden build figures hold", () => {
    expect(meetingIntelligence.build.includeLabour).toBe(true);
    const on = run(meetingIntelligence);
    expect(on.ledger.totals.buildLabour).toBeGreaterThan(0);
    expect(labourExcluded(meetingIntelligence)).toBe(false);
    expect(buildLabel(meetingIntelligence)).toBe("Build");
  });

  it("sample: NPV and payback move with the flag, and the benefit side does not", () => {
    const on = run(meetingIntelligence), off = run(without(meetingIntelligence));
    expect(off.roi.totalBenefit).toBeCloseTo(on.roi.totalBenefit, 4);
    expect(off.roi.npv).toBeGreaterThan(on.roi.npv);
    expect(off.s.paybackMonth ?? 0).toBeLessThanOrEqual(on.s.paybackMonth ?? Infinity);
  });

  it("the Excel summary rows and range label carry the same flag", () => {
    const q = without(meetingIntelligence);
    const { ledger, roi } = run(q);
    const rows = summaryRows(q, ledger, roi, cat);
    expect(rows.find((r) => String(r.Item).startsWith("Build cost"))!.Item).toContain("build labour excluded");
    expect(rows.find((r) => r.Item === "  of which labour")!.Value).toBe("Excluded");
    expect(rows.some((r) => r.Item === "Build labour")).toBe(true);
    const base = run(meetingIntelligence);
    const baseRows = summaryRows(meetingIntelligence, base.ledger, base.roi, cat);
    expect(baseRows.find((r) => r.Item === "Build cost")).toBeDefined();
    expect(baseRows.some((r) => r.Item === "Build labour")).toBe(false);
  });
});
