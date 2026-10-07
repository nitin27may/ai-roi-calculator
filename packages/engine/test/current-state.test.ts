import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import {
  ProjectSchema, blankProject, buildLedger, computeAllocation, computeRoi, currentLineMonthly, currentVsTarget, featureBreakdown, featureTotals,
  meetingIntelligence, monthRows, roiOptions, summarize, summaryRows, type CurrentLine, type Project,
} from "../src/index.js";

const cat = loadCatalog();

/** The cheque example from docs/plan/50-any-project-build-plan.md: 6 build months, a 6-month ramp, a target that bills C$4,500 a month from go-live. */
function chequeProject(opts: { assumed?: boolean; escalation?: number } = {}): Project {
  const p = blankProject("Cheques", "2027-01-01");
  p.timeline = { buildMonths: 6, horizonMonths: 36, adoptionRampMonths: 6 };
  p.build.team = []; p.build.environment = []; p.maintenance = { mode: "none" };
  p.roi.rateEscalationPctPerYear = opts.escalation ?? 0;
  p.roi.discountRatePct = 0;
  p.rateCard.push({ id: "recon", label: "Reconciliation clerk", hourlyRate: 40 });
  p.workloads.push({ kind: "fixed", id: "target", label: "Online payments", group: "Platform", items: [
    { id: "gw", label: "Payment gateway", amountCad: 2700, cadence: "monthly" },
    { id: "res", label: "Production resources", amountCad: 1800, cadence: "monthly" },
  ] } as Project["workloads"][number]);
  const reduce = (id: string, label: string, basis: CurrentLine["basis"]): CurrentLine => ({ id, label, category: "transaction", basis, change: { mode: "reduce", pct: 90, followsAdoption: true } });
  p.currentState = { lines: [
    reduce("stock", "Cheque stock and printing", { kind: "perTransaction", unitCostCad: 0.4, volumePerMonth: 10000 }),
    reduce("post", "Postage", { kind: "perTransaction", unitCostCad: 1.2, volumePerMonth: 10000 }),
    reduce("courier", "Courier", { kind: "perTransaction", unitCostCad: 15, volumePerMonth: 500 }),
    reduce("reissue", "Re-issues", { kind: "perTransaction", unitCostCad: 25, volumePerMonth: 200 }),
    { id: "recon", label: "Reconciliation", category: "people", basis: { kind: "fte", roleId: "recon", fte: 2, hoursPerMonth: 150 }, change: { mode: "reduce", pct: 50, followsAdoption: false } },
    { id: "lease", label: "Printer lease", category: "infrastructure", basis: { kind: "monthly", amountCad: 1500 }, change: { mode: "retire", fromMonth: 18 },
      decommission: { conditional: true, condition: "Lease ended and printer collected", assumed: opts.assumed ?? true } },
  ] };
  return ProjectSchema.parse(p);
}
const saving = (l: ReturnType<typeof buildLedger>, m: number) => Object.values(l.months[m - 1]!.benefitBy.currentState).reduce((a, b) => a + b, 0);

describe("current state lines", () => {
  const p = chequeProject();
  const L = buildLedger(p, cat);

  it("prices each basis: per transaction, FTE x hours x rate, and monthly", () => {
    const by = Object.fromEntries(p.currentState!.lines.map((l) => [l.id, currentLineMonthly(p, l)]));
    expect(by).toEqual({ stock: 4000, post: 12000, courier: 7500, reissue: 5000, recon: 12000, lease: 1500 });
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(42000);
  });

  it("saves nothing during build", () => {
    for (let m = 1; m <= 6; m++) expect(saving(L, m)).toBe(0);
  });

  it("a reduce that follows adoption ramps; a plain reduce is in full from go-live", () => {
    // month 7 is ramp 1/6: 90% of 28,500 x 1/6 = 4,275, plus 50% of 12,000 = 6,000.
    expect(L.months[6]!.benefitBy.currentState.stock).toBeCloseTo(4000 * 0.9 / 6, 6);
    expect(L.months[6]!.benefitBy.currentState.recon).toBeCloseTo(6000, 6);
    expect(saving(L, 7)).toBeCloseTo(10275, 6);
    expect(saving(L, 12)).toBeCloseTo(31650, 6);
  });

  it("a retire starts at its month and removes the whole line, where a reduce keeps the remainder", () => {
    expect(L.months[16]!.benefitBy.currentState.lease).toBeUndefined();
    expect(L.months[17]!.benefitBy.currentState.lease).toBe(1500);
    expect(saving(L, 17)).toBeCloseTo(31650, 6);
    expect(saving(L, 18)).toBeCloseTo(33150, 6);
    // The reduced reconciliation line still costs the other half: it is never a full saving.
    expect(L.months[30]!.benefitBy.currentState.recon).toBeCloseTo(6000, 6);
  });

  it("a conditional decommission with assumed false adds nothing; assumed true counts", () => {
    const off = buildLedger(chequeProject({ assumed: false }), cat);
    expect(off.months[17]!.benefitBy.currentState.lease).toBeUndefined();
    expect(saving(off, 18)).toBeCloseTo(31650, 6);
    expect(saving(off, 30)).toBeCloseTo(31650, 6);
    expect(off.totals.benefitRate).toBeCloseTo(31650, 6);
    expect(L.totals.benefitRate).toBeCloseTo(33150, 6);
  });

  it("people lines escalate with rate escalation each production year; fixed amounts stay flat", () => {
    const e = buildLedger(chequeProject({ escalation: 10 }), cat);
    expect(e.months[6]!.benefitBy.currentState.recon).toBeCloseTo(6000, 6);
    expect(e.months[18]!.benefitBy.currentState.recon).toBeCloseTo(6600, 6); // month 19, production year 2
    expect(e.months[30]!.benefitBy.currentState.recon).toBeCloseTo(7260, 6); // month 31, year 3
    expect(e.months[18]!.benefitBy.currentState.lease).toBe(1500);
    expect(e.months[18]!.benefitBy.currentState.stock).toBeCloseTo(3600, 6);
  });

  it("a line's confidence weights its saving", () => {
    const q = chequeProject();
    q.currentState!.lines.find((l) => l.id === "lease")!.confidencePct = 50;
    expect(buildLedger(q, cat).months[17]!.benefitBy.currentState.lease).toBe(750);
  });

  it("per-transaction volume can come from a workload", () => {
    const q = chequeProject();
    q.workloads.push({ kind: "retrieval", id: "pay", label: "Payments", queriesPerMonth: 8000, semanticShare: 0 } as Project["workloads"][number]);
    const line = q.currentState!.lines[0]!;
    if (line.basis.kind === "perTransaction") { delete line.basis.volumePerMonth; line.basis.volumeFrom = "pay"; }
    expect(currentLineMonthly(q, line)).toBeCloseTo(3200, 6);
    expect(ProjectSchema.safeParse(q).success).toBe(true);
    const bad = structuredClone(q);
    if (bad.currentState!.lines[0]!.basis.kind === "perTransaction") (bad.currentState!.lines[0]!.basis as { volumeFrom?: string }).volumeFrom = "missing";
    expect(ProjectSchema.safeParse(bad).success).toBe(false);
  });

  it("keep saves nothing", () => {
    const q = chequeProject();
    q.currentState!.lines.forEach((l) => { l.change = { mode: "keep" }; });
    const k = buildLedger(q, cat);
    expect(k.months.every((m) => Object.keys(m.benefitBy.currentState).length === 0)).toBe(true);
    expect(k.totals.benefitRate).toBe(0);
  });
});

describe("current state flows through the benefit pipeline", () => {
  const p = chequeProject();
  const L = buildLedger(p, cat);
  const base = buildLedger({ ...p, currentState: undefined }, cat);
  const roi = computeRoi(L, "runMaint", 0, roiOptions(p));
  const roi0 = computeRoi(base, "runMaint", 0, roiOptions(p));

  it("adds its savings to month benefit, total benefit, NPV and payback", () => {
    const expected = L.months.reduce((s, m) => s + Object.values(m.benefitBy.currentState).reduce((a, b) => a + b, 0), 0);
    expect(expected).toBeGreaterThan(0);
    expect(roi.totalBenefit - roi0.totalBenefit).toBeCloseTo(expected, 4);
    expect(roi.npv - roi0.npv).toBeCloseTo(expected, 4);
    expect(roi0.totalBenefit).toBe(0);
    expect(roi.paybackMonth).not.toBeNull();
    expect(roi.irrPct === null || roi.irrPct > 0).toBe(true);
  });

  it("shows in project benefit (allocation), the feature breakdown and the month rows", () => {
    const total = L.months.reduce((s, m) => s + m.benefit, 0);
    expect(computeAllocation(p, L, p.roi.basis).projectBenefit).toBeCloseTo(total, 4);
    expect(featureTotals(featureBreakdown(p, L)).benefit).toBeCloseTo(total, 4);
    expect(monthRows(L, roi)[17]!["Current-state savings"]).toBeCloseTo(33150, 2);
    expect(monthRows(base, roi0)[17]).not.toHaveProperty("Current-state savings");
  });

  it("a saving follows its line's feature", () => {
    const q = chequeProject();
    q.features = [{ id: "f1", label: "Payments" }];
    q.currentState!.lines[0]!.featureId = "f1";
    const rows = featureBreakdown(q, buildLedger(q, cat));
    expect(rows.find((r) => r.id === "f1")!.benefit).toBeGreaterThan(0);
  });
});

describe("current vs target", () => {
  const p = chequeProject();
  const L = buildLedger(p, cat);
  const roi = computeRoi(L, "full", 0, roiOptions(p));
  const s = summarize(p, L, roi, cat).currentVsTarget;

  it("current is the month-0 total, target the steady run rate, saving the full saving", () => {
    expect(s.currentMonthly).toBe(42000);
    expect(s.targetMonthly).toBeCloseTo(4500, 6);
    expect(s.saving).toBeCloseTo(33150, 6);
  });

  it("dual running is the cost still paid on lines due to go, while the target is billed", () => {
    // Follow-adoption lines: 25,650 x (5+4+3+2+1+0)/6 = 64,125. The lease: 11 months (7 to 17) x 1,500 = 16,500.
    expect(s.dualRunningCost).toBeCloseTo(64125 + 16500, 4);
  });

  it("a line that is not decommissioned is not dual running: it stays", () => {
    const off = chequeProject({ assumed: false });
    const o = currentVsTarget(off, buildLedger(off, cat));
    expect(o.dualRunningCost).toBeCloseTo(64125, 4);
    expect(o.saving).toBeCloseTo(31650, 6);
  });

  it("retiring earlier than the target starts costs nothing extra; later adds dual running", () => {
    const q = chequeProject();
    q.currentState!.lines.find((l) => l.id === "lease")!.change = { mode: "retire", fromMonth: 7 };
    expect(currentVsTarget(q, buildLedger(q, cat)).dualRunningCost).toBeCloseTo(64125, 4);
  });

  it("summaryRows lists the figures only when there are lines", () => {
    const items = summaryRows(p, L, roi, cat).map((r) => String(r.Item));
    expect(items).toContain("Dual-running cost (current cost still paid while the target runs)");
    const b = buildLedger({ ...p, currentState: undefined }, cat);
    const none = summaryRows({ ...p, currentState: undefined }, b, computeRoi(b, "full", 0, roiOptions(p)), cat).map((r) => String(r.Item));
    expect(none.some((i) => /Current|Dual-running/.test(i))).toBe(false);
  });
});

describe("empty current state moves nothing", () => {
  it("no lines: same lines, benefits, totals and figures as no field at all", () => {
    for (const lines of [undefined, []] as const) {
      const q = structuredClone(meetingIntelligence) as Project;
      if (lines) q.currentState = { lines: [] };
      const a = buildLedger(meetingIntelligence, cat), b = buildLedger(ProjectSchema.parse(q), cat);
      expect(b.totals).toEqual(a.totals);
      expect(b.months.map((m) => [m.lines.map((l) => [l.id, l.cost]), m.benefit, m.benefitBy.currentState])).toEqual(a.months.map((m) => [m.lines.map((l) => [l.id, l.cost]), m.benefit, {}]));
      const s = summarize(q, b, computeRoi(b, q.roi.basis, q.roi.discountRatePct, roiOptions(q)), cat);
      expect(s.currentVsTarget).toMatchObject({ currentMonthly: 0, saving: 0, dualRunningCost: 0 });
    }
  });
});
