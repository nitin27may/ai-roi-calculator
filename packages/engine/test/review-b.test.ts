import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { COST_BASES, basisLabel, buildLedger, computeRoi, meetingIntelligence as sample, ProjectSchema, roiOptions, summarize, summaryRows, type Project } from "../src/index.js";

const cat = loadCatalog();
const clone = (): Project => structuredClone(sample);
const total = (p: Project) => buildLedger(p, cat).months.reduce((a, m) => a + m.lines.reduce((b, l) => b + l.cost, 0), 0);
const run = (p: Project) => buildLedger(p, cat).totals.runRate;

describe("cost basis is an explicit choice", () => {
  const L = buildLedger(sample, cat);
  const rois = COST_BASES.map((b) => computeRoi(L, b.value, 0, roiOptions(sample)));

  it("lists the three bases with a label and one-line hint each", () => {
    expect(COST_BASES.map((b) => b.value)).toEqual(["run", "runMaint", "full"]);
    for (const b of COST_BASES) { expect(b.hint.length).toBeGreaterThan(20); expect(basisLabel(b.value)).toBe(b.label); }
  });
  it("orders total cost run <= runMaint <= full, and each basis moves ROI and NPV", () => {
    const [r, rm, f] = rois as [typeof rois[number], typeof rois[number], typeof rois[number]];
    expect(r.totalCost).toBeLessThanOrEqual(rm.totalCost);
    expect(rm.totalCost).toBeLessThan(f.totalCost);
    expect(f.npv).toBeLessThan(r.npv);
  });
  it("summarize and the Excel summary follow the project's basis and name it", () => {
    for (const b of COST_BASES) {
      const p = clone(); p.roi.basis = b.value;
      const l = buildLedger(p, cat);
      const roi = computeRoi(l, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
      const s = summarize(p, l, roi, cat);
      expect(s.basisLabel).toBe(b.label);
      expect(s.totalCost).toBeCloseTo(roi.totalCost, 6);
      const rows = summaryRows(p, l, roi, cat);
      expect(rows.find((x) => x.Item === "ROI measured against")!.Value).toBe(b.label);
      expect(String(rows.find((x) => String(x.Item).startsWith("Total cost over plan"))!.Item)).toContain(b.label);
    }
  }, 30_000);
}, 30_000);
  it("an old project without a Settings default still loads and keeps its basis", () => {
    expect(ProjectSchema.parse(sample).roi.basis).toBe(sample.roi.basis);
  });
});

describe("pricing model: pay-as-you-go default, PTU opt-in", () => {
  it("absent and explicit pay-as-you-go give identical totals", () => {
    const a = clone(); delete a.settings.pricingModel;
    const b = clone(); b.settings.pricingModel = "payg";
    expect(total(b)).toBe(total(a));
    expect(total(a)).toBe(total(sample));
  });
  it("PTU adds a reserved line per OpenAI chat workload and changes only run cost", () => {
    const base = buildLedger(sample, cat);
    const p = clone(); p.settings.pricingModel = "ptu";
    const l = buildLedger(p, cat);
    const ptuLines = l.months.flatMap((m) => m.lines).filter((x) => x.meter.startsWith("ptu:"));
    expect(ptuLines.length).toBeGreaterThan(0);
    expect(l.totals.build).toBeCloseTo(base.totals.build, 6);
    expect(l.totals.runRate).not.toBeCloseTo(base.totals.runRate, 0);
  });
  it("a workload that opts out stays pay-as-you-go while others use PTU", () => {
    const p = clone(); p.settings.pricingModel = "ptu";
    const w = p.workloads.find((x) => x.kind === "chat")!;
    if (w.kind === "chat") w.payg = true;
    const l = buildLedger(p, cat);
    const ids = new Set(l.months.flatMap((m) => m.lines).filter((x) => x.meter.startsWith("ptu:")).map((x) => x.componentId));
    expect(ids.has(w.id)).toBe(false);
    expect(ids.size).toBeGreaterThan(0);
    expect(run(p)).toBeGreaterThan(0);
  });
  it("non-OpenAI models stay pay-as-you-go", () => {
    const p = clone(); p.settings.pricingModel = "ptu";
    const w = p.workloads.find((x) => x.kind === "chat")!;
    if (w.kind === "chat") w.modelId = "claude-sonnet-5-5";
    const l = buildLedger(p, cat);
    expect(l.months.flatMap((m) => m.lines).some((x) => x.componentId === w.id && x.meter.startsWith("ptu:"))).toBe(false);
  });
});
