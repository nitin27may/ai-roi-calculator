import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ENGINEERING_TOOL_KINDS, HYPERCARE_ID, addEngineeringTool, setAiAssistPct, ProjectSchema, applyStandardPhases, blankProject, buildLedger, computeRoi, newActivity, roiOptions, summarize, summaryRows, type Project } from "../src/index.js";

const cat = loadCatalog();

/** 6 build months, 3 developers at 100 C$/h and 1 QA at 50 C$/h, 100 h a month each, 15% contingency, no dev-cost cut. */
function base(over: (p: Project) => void = () => {}): Project {
  const p = blankProject("AI assist test", "2027-01-01");
  p.timeline = { buildMonths: 6, horizonMonths: 24, adoptionRampMonths: 3 };
  p.rateCard = [{ id: "dev", label: "Developer", hourlyRate: 100 }, { id: "qa", label: "QA", hourlyRate: 50 }];
  p.build = { ...p.build, team: [
    { roleId: "dev", people: 3, hoursPerMonth: 100, experiments: true },
    { roleId: "qa", people: 1, hoursPerMonth: 100, experiments: false },
  ], environment: [], activities: [], workstreams: [], contingencyPct: 15, contingencyScope: "labour" };
  p.roi = { ...p.roi, devCutPct: 0, maintCutPct: 0 };
  p.maintenance = { mode: "none" };
  over(p);
  return ProjectSchema.parse(p) as Project;
}
const run = (p: Project) => {
  const ledger = buildLedger(p, cat);
  const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  return { ledger, roi, s: summarize(p, ledger, roi, cat) };
};
const DEV_HOURS = 3 * 100 * 6, DEV_RATE = 100, FACTOR = 1.15;

describe("AI-assisted development", () => {
  it("20% on Dev saves exactly 0.2 x hours x rate x contingency and leaves QA alone", () => {
    const off = run(base());
    const p = base((q) => { q.build.aiAssist = { productivityPctByRole: { dev: 20 } }; });
    const on = run(p);
    const expected = 0.2 * DEV_HOURS * DEV_RATE * FACTOR;
    expect(off.ledger.totals.buildLabour - on.ledger.totals.buildLabour).toBeCloseTo(expected, 6);
    expect(on.s.aiAssist!.labourSaved).toBeCloseTo(expected, 6);
    expect(on.s.aiAssist!.hoursSaved).toBeCloseTo(0.2 * DEV_HOURS, 6);
    // QA lines are untouched, line by line.
    const qa = (r: ReturnType<typeof run>) => r.ledger.months.flatMap((m) => m.lines.filter((l) => l.meter === "role:qa").map((l) => l.cost));
    expect(qa(on)).toEqual(qa(off));
    const dev = on.ledger.months[0]!.lines.find((l) => l.meter === "role:dev")!;
    expect(dev.quantity).toBeCloseTo(240, 9);
    expect(dev.formula).toContain("20% AI-assisted");
  });

  it("net is labour saved minus the cost of the tooling activity", () => {
    const p = base((q) => {
      q.build.aiAssist = { productivityPctByRole: { dev: 20 } };
      q.build.activities = [newActivity(q, "tooling")];
    });
    const { ledger, s } = run(p);
    const tool = ledger.months.slice(0, 6).flatMap((m) => m.lines.filter((l) => l.componentId === p.build.activities[0]!.id)).reduce((t, l) => t + l.cost, 0);
    expect(tool).toBeGreaterThan(0);
    expect(s.aiAssist!.toolCost).toBeCloseTo(tool, 6);
    expect(s.aiAssist!.net).toBeCloseTo(s.aiAssist!.labourSaved - s.aiAssist!.toolCost, 9);
  });

  it("is absent when aiAssist is not set, and adds no summary rows", () => {
    const p = base();
    const { ledger, roi, s } = run(p);
    expect(s.aiAssist).toBeUndefined();
    expect("aiAssist" in s).toBe(false);
    expect(summaryRows(p, ledger, roi, cat).some((r) => String(r.Item).startsWith("AI-assisted"))).toBe(false);
  });

  it("an empty or all-zero map moves no figure", () => {
    const off = run(base());
    for (const map of [{}, { dev: 0 }] as Record<string, number>[]) {
      const on = run(base((q) => { q.build.aiAssist = { productivityPctByRole: map }; }));
      expect(on.ledger.totals).toEqual(off.ledger.totals);
      expect(on.s.aiAssist!.labourSaved).toBe(0);
    }
  });

  it("shows four rows in the Excel summary when set", () => {
    const p = base((q) => { q.build.aiAssist = { productivityPctByRole: { dev: 20 } }; });
    const { ledger, roi } = run(p);
    expect(summaryRows(p, ledger, roi, cat).filter((r) => String(r.Item).startsWith("AI-assisted development"))).toHaveLength(4);
  });

  it("rejects a percentage above 90 or below 0", () => {
    const bad = (v: number) => ProjectSchema.safeParse({ ...base(), build: { ...base().build, aiAssist: { productivityPctByRole: { dev: v } } } }).success;
    expect(bad(91)).toBe(false);
    expect(bad(-1)).toBe(false);
    expect(bad(90)).toBe(true);
  });

  it("hypercare lines are reduced too, and counted in the saving", () => {
    const mk = (assist: boolean) => base((q) => {
      applyStandardPhases(q);
      q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false, phaseId: HYPERCARE_ID }];
      if (assist) q.build.aiAssist = { productivityPctByRole: { dev: 20 } };
    });
    const on = run(mk(true));
    const off = run(mk(false));
    // Hypercare is months 7 and 8: 2 x 100 h x 100 x 1.15.
    expect(off.ledger.months[6]!.byStream.labour).toBeCloseTo(100 * 100 * 1.15, 6);
    expect(on.ledger.months[6]!.byStream.labour).toBeCloseTo(80 * 100 * 1.15, 6);
    expect(on.s.aiAssist!.labourSaved).toBeCloseTo(0.2 * 200 * 100 * 1.15, 6);
  });

  it("does not touch maintenance team lines", () => {
    const mk = (assist: boolean) => base((q) => {
      q.maintenance = { mode: "team", team: [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false }] };
      if (assist) q.build.aiAssist = { productivityPctByRole: { dev: 50 } };
    });
    expect(run(mk(true)).ledger.totals.maintRate).toBe(run(mk(false)).ledger.totals.maintRate);
  });

  it("multiplies with devCutPct, so both set counts the saving twice (documented double count)", () => {
    const labour = (cut: number, pct: number) => run(base((q) => {
      q.roi.devCutPct = cut;
      if (pct) q.build.aiAssist = { productivityPctByRole: { dev: pct, qa: pct } };
    })).ledger.totals.buildLabour;
    const none = labour(0, 0);
    expect(labour(10, 0)).toBeCloseTo(none * 0.9, 6);
    expect(labour(0, 20)).toBeCloseTo(none * 0.8, 6);
    expect(labour(10, 20)).toBeCloseTo(none * 0.9 * 0.8, 6);
  });

  it("labourSaved includes the dev-cost cut exactly as the lines are billed", () => {
    const p = base((q) => { q.roi.devCutPct = 10; q.build.aiAssist = { productivityPctByRole: { dev: 20 } }; });
    expect(run(p).s.aiAssist!.labourSaved).toBeCloseTo(0.2 * DEV_HOURS * DEV_RATE * FACTOR * 0.9, 6);
  });
});

describe("engineering tools and the productivity setter", () => {
  it("a per-person tool bills people x amount each month; a fixed tool bills the amount", () => {
    const p = base((q) => {
      const a = addEngineeringTool(q, "ide");
      const b = addEngineeringTool(q, "cicd");
      for (const [id, amt] of [[a, 20], [b, 300]] as const) { const it = q.build.environment.find((x) => x.id === id)!; if ("amountCad" in it) it.amountCad = amt; }
    });
    const { ledger } = run(p);
    expect(ledger.months[0]!.byStream.devenv).toBeCloseTo(4 * 20 + 300, 9);
    expect(ledger.totals.build).toBeCloseTo(ledger.totals.buildLabour + 6 * (80 + 300), 6);
  });

  it("a new tool costs nothing until an amount is typed, and the five kinds are offered", () => {
    expect(ENGINEERING_TOOL_KINDS.map((k) => k.kind)).toEqual(["ide", "cicd", "testTooling", "loadTesting", "other"]);
    const p = base((q) => { for (const k of ENGINEERING_TOOL_KINDS) addEngineeringTool(q, k.kind); });
    expect(run(p).ledger.totals.build).toBe(run(base()).ledger.totals.build);
  });

  it("a one-off load-testing amount lands once, in the chosen month", () => {
    const p = base((q) => { const id = addEngineeringTool(q, "loadTesting"); const it = q.build.environment.find((x) => x.id === id)!; if ("amountCad" in it) { it.amountCad = 5000; it.month = 5; } });
    const { ledger } = run(p);
    expect(ledger.months.map((m) => m.byStream.devenv)).toEqual([0, 0, 0, 0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("setAiAssistPct sets, caps at 90, clears, and drops an emptied map", () => {
    const p = base();
    setAiAssistPct(p, "dev", 20);
    expect(p.build.aiAssist).toEqual({ productivityPctByRole: { dev: 20 } });
    setAiAssistPct(p, "qa", 120);
    expect(p.build.aiAssist!.productivityPctByRole.qa).toBe(90);
    setAiAssistPct(p, "dev", 0);
    setAiAssistPct(p, "qa", Number.NaN);
    expect(p.build.aiAssist).toBeUndefined();
  });
});
