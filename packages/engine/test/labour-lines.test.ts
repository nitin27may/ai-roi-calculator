import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import {
  ProjectSchema, addRole, buildLabel, buildLedger, computeRoi, developerBreakdown, developers, labourExcluded, labourPartialText, lineRate, meetingIntelligence,
  rateEscalationNote, removeRole, roiOptions, roleUsage, sensitivity, summarize, summaryRows, type Project,
} from "../src/index.js";

const cat = loadCatalog();
const run = (p: Project) => {
  const ledger = buildLedger(p, cat);
  const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  return { ledger, roi, s: summarize(p, ledger, roi, cat) };
};

/** Three team lines, no contingency or Dev Lab cut, so labour is exactly people x hours x rate x build months. */
function fixture(): Project {
  const p = structuredClone(meetingIntelligence);
  p.roi.devCutPct = 0;
  p.build.contingencyPct = 0;
  p.rateCard = [{ id: "dev", label: "Developer", hourlyRate: 100 }, { id: "qa", label: "QA", hourlyRate: 50 }, ...p.rateCard.filter((r) => r.id !== "dev" && r.id !== "qa")];
  p.build.team = [
    { roleId: "dev", people: 2, hoursPerMonth: 100, experiments: true },
    { roleId: "qa", people: 1, hoursPerMonth: 80, experiments: false },
    { roleId: "dev", people: 1, hoursPerMonth: 50, experiments: true, name: "Contractor" },
  ];
  return p;
}
const B = (p: Project) => p.timeline.buildMonths;
const DEV = 2 * 100 * 100, QA = 80 * 50, CONTRACTOR = 50 * 100; // per month

describe("per-line costing and manual rates", () => {
  it("known inputs give known labour totals", () => {
    const p = fixture();
    expect(run(p).ledger.totals.buildLabour).toBeCloseTo((DEV + QA + CONTRACTOR) * B(p), 4);
  });

  it("an uncosted line adds no labour but still counts as people", () => {
    const p = fixture();
    const full = run(p);
    p.build.team[1]!.costed = false;
    const part = run(p);
    expect(part.ledger.totals.buildLabour).toBeCloseTo((DEV + CONTRACTOR) * B(p), 4);
    expect(part.ledger.totals.build).toBeCloseTo(full.ledger.totals.build - QA * B(p), 4);
    expect(part.ledger.totals.devLab).toBeCloseTo(full.ledger.totals.devLab, 6);
    expect(developers(p)).toBe(3);
  });

  it("an uncosted experimenting line still drives Dev Lab volumes", () => {
    const p = fixture();
    const full = run(p);
    p.build.team[0]!.costed = false;
    const part = run(p);
    expect(part.ledger.totals.devLab).toBeCloseTo(full.ledger.totals.devLab, 6);
    expect(part.ledger.totals.buildLabour).toBeCloseTo((QA + CONTRACTOR) * B(p), 4);
    const rows = developerBreakdown(p, part.ledger).rows;
    expect(rows[0]!.labour).toBe(0);
    expect(rows[0]!.devlab).toBeGreaterThan(0);
  });

  it("partial exclusion flows to the summary, label, text and rows; all lines off reads as fully excluded", () => {
    const p = fixture();
    expect(run(p).s.labourPartial).toBe("");
    p.build.team[1]!.costed = false;
    p.build.team[2]!.costed = false;
    const { s, ledger, roi } = run(p);
    expect(s.labourPartial).toBe("Some build labour excluded (2 of 3 lines)");
    expect(s.labourExcluded).toBe(false);
    expect(buildLabel(p)).toBe("Build (some build labour excluded)");
    expect(JSON.stringify(summaryRows(p, ledger, roi, cat))).toContain("Some build labour excluded (2 of 3 lines)");
    p.build.team[0]!.costed = false;
    expect(labourExcluded(p)).toBe(true);
    expect(labourPartialText(p)).toBe("");
    const all = run(p);
    expect(all.s.labourExcluded).toBe(true);
    expect(all.ledger.totals.buildLabour).toBe(0);
  });

  it("the project-wide switch still means exclude all, whatever the line ticks", () => {
    const p = fixture();
    p.build.includeLabour = false;
    p.build.team[0]!.costed = false;
    expect(run(p).ledger.totals.buildLabour).toBe(0);
    expect(labourExcluded(p)).toBe(true);
  });

  it("a manual rate beats the rate card for that line only", () => {
    const p = fixture();
    p.build.team[2]!.rateOverride = 140;
    expect(lineRate(p, p.build.team[2]!)).toBe(140);
    expect(lineRate(p, p.build.team[0]!)).toBe(100);
    expect(run(p).ledger.totals.buildLabour).toBeCloseTo((DEV + QA + 50 * 140) * B(p), 4);
    const lab = run(p).ledger.months[0]!.lines.find((l) => l.stream === "labour" && l.label.includes("Contractor"))!;
    expect(lab.formula).toContain("manual rate");
  });

  it("a zero manual rate is a real rate, not 'absent'", () => {
    const p = fixture();
    p.build.team[1]!.rateOverride = 0;
    expect(run(p).ledger.totals.buildLabour).toBeCloseTo((DEV + CONTRACTOR) * B(p), 4);
  });

  it("a manual rate does not change the value of hours saved", () => {
    const p = fixture();
    const base = run(p).ledger.totals.benefitRate;
    p.build.team[0]!.rateOverride = 500;
    expect(run(p).ledger.totals.benefitRate).toBeCloseTo(base, 6);
  });

  it("maintenance team lines honour a manual rate", () => {
    const p = fixture();
    p.maintenance = { mode: "team", team: [{ roleId: "dev", people: 1, hoursPerMonth: 10, experiments: false }] };
    p.roi.rateEscalationPctPerYear = 0;
    p.roi.maintCutPct = 0;
    const a = run(p).ledger.totals.maintRate;
    p.maintenance.team[0]!.rateOverride = 200;
    expect(run(p).ledger.totals.maintRate).toBeCloseTo(a * 2, 4);
  });

  it("totals are identical when the new fields are absent or explicitly default", () => {
    const base = run(meetingIntelligence);
    const q = structuredClone(meetingIntelligence);
    for (const t of q.build.team) t.costed = true;
    const withTicks = run(q);
    expect(withTicks.ledger.totals).toEqual(base.ledger.totals);
    expect(withTicks.s.totalCost).toBe(base.s.totalCost);
    expect(meetingIntelligence.build.team.every((t) => t.costed === undefined && t.rateOverride === undefined)).toBe(true);
    expect(base.s.labourPartial).toBe("");
  });

  it("saved projects without the fields still parse, and the fields round-trip", () => {
    expect(ProjectSchema.safeParse(meetingIntelligence).success).toBe(true);
    const p = fixture();
    p.build.team[0]!.costed = false;
    p.build.team[0]!.rateOverride = 123;
    const back = ProjectSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(back.build.team[0]!.costed).toBe(false);
    expect(back.build.team[0]!.rateOverride).toBe(123);
    expect(ProjectSchema.safeParse({ ...p, build: { ...p.build, team: [{ ...p.build.team[0]!, rateOverride: -1 }] } }).success).toBe(false);
  });

  it("sensitivity scales manual rates with the delivery rates", () => {
    const p = fixture();
    p.build.team[2]!.rateOverride = 140;
    p.roi.basis = "full";
    const swing = (q: Project) => { const r = sensitivity(q, cat); const row = r.rows.find((x) => x.id === "deliveryRates")!; return r.base - row.low; };
    const withOverride = swing(p);
    p.build.team[2]!.rateOverride = undefined;
    expect(withOverride).toBeGreaterThan(swing(p));
  });
});

describe("rate card helpers", () => {
  it("adds a role with a unique id and removes only unused roles", () => {
    const p = fixture();
    const id = addRole(p, "Data engineer", 120);
    expect(id).toBe("dataEngineer");
    expect(addRole(p, "Data engineer", 130)).toBe("dataEngineer2");
    expect(roleUsage(p, "dev")).toBeGreaterThan(0);
    expect(removeRole(p, "dev")).toBe(false);
    expect(removeRole(p, id)).toBe(true);
    expect(p.rateCard.some((r) => r.id === id)).toBe(false);
    expect(ProjectSchema.safeParse(p).success).toBe(true);
  });

  it("explains the escalation in plain numbers", () => {
    expect(rateEscalationNote(0, 100)).toContain("flat");
    const t = rateEscalationNote(10, 100);
    expect(t).toContain("C$110");
    expect(t).toContain("C$121");
    expect(t).toContain("does not change build labour");
  });
});
