import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import {
  DELIVERY_PHASES, HYPERCARE_ID, ProjectSchema, addDeliveryCost, addStandardRole, applyStandardPhases, blankProject, buildLedger, computeAllocation,
  costSplit, deliveryCost, lineMonthlyHours, monthRows, removeDeliveryCost, setEffort, setEffortMode, setLinePhase, standardPhases, summaryRows, summarize, computeRoi, basisCost,
  type Project,
} from "../src/index.js";

const cat = loadCatalog();

/** A project with no other cost: 6 build months, a 100 C$/h rate, no contingency, no dev-cost cut. */
function base(over: (p: Project) => void = () => {}): Project {
  const p = blankProject("Delivery test", "2027-01-01");
  p.timeline = { buildMonths: 6, horizonMonths: 24, adoptionRampMonths: 3 };
  p.rateCard = [{ id: "dev", label: "Developer", hourlyRate: 100 }];
  p.build = { ...p.build, team: [], environment: [], activities: [], workstreams: [], contingencyPct: 0, contingencyScope: "labour" };
  p.roi = { ...p.roi, devCutPct: 0, maintCutPct: 0 };
  p.maintenance = { mode: "none" };
  over(p);
  return ProjectSchema.parse(p) as Project;
}
const L = (p: Project) => buildLedger(p, cat);
const labour = (p: Project, m: number) => L(p).months[m - 1]!.byStream.labour;

describe("standard phases", () => {
  it("lists the seven standard phases", () => {
    expect(DELIVERY_PHASES.map((d) => d.id)).toEqual(["discovery", "design", "build", "test", "migration", "deploy", "hypercare"]);
  });
  it("a 12-month build gets the reference months and hypercare after go-live", () => {
    expect(standardPhases(12, 36).map((x) => [x.id, x.fromMonth, x.toMonth])).toEqual([
      ["discovery", 1, 1], ["design", 2, 3], ["build", 4, 8], ["test", 9, 10], ["migration", 11, 11], ["deploy", 12, 12], ["hypercare", 13, 14],
    ]);
  });
  it("a 6-month build is scaled, ordered, inside the build, and hypercare runs past it", () => {
    const ph = standardPhases(6, 24);
    expect(ph.map((x) => [x.id, x.fromMonth, x.toMonth])).toEqual([
      ["discovery", 1, 1], ["design", 2, 2], ["build", 3, 4], ["test", 5, 5], ["migration", 6, 6], ["deploy", 6, 6], ["hypercare", 7, 8],
    ]);
  });
  it("any build length keeps every non-hypercare phase inside 1..B and in order", () => {
    for (let B = 1; B <= 24; B++) {
      const ph = standardPhases(B, 36).filter((x) => x.id !== HYPERCARE_ID);
      let prev = 0;
      for (const x of ph) { expect(x.fromMonth).toBeGreaterThanOrEqual(1); expect(x.toMonth).toBeLessThanOrEqual(B); expect(x.fromMonth).toBeLessThanOrEqual(x.toMonth); expect(x.fromMonth).toBeGreaterThanOrEqual(prev); prev = x.fromMonth; }
    }
  });
  it("is an explicit action: a project has no phases until applied", () => {
    const p = base();
    expect(p.timeline.phases).toBeUndefined();
    applyStandardPhases(p);
    expect(p.timeline.phases).toHaveLength(7);
  });
  it("hypercare is cut at the horizon", () => {
    expect(standardPhases(12, 12).some((x) => x.id === HYPERCARE_ID)).toBe(false);
    expect(standardPhases(12, 13).at(-1)).toMatchObject({ id: HYPERCARE_ID, fromMonth: 13, toMonth: 13 });
  });
});

describe("effort: people x weeks x hours per week", () => {
  const withEffort = () => base((p) => {
    p.build.team = [{ roleId: "dev", people: 2, hoursPerMonth: 0, experiments: false, effort: { people: 2, weeks: 12, hoursPerWeek: 40 }, fromMonth: 1, toMonth: 3 }];
  });
  it("total hours = people x weeks x hours per week, spread evenly over the month window", () => {
    const p = withEffort();
    expect(2 * 12 * 40).toBe(960);
    expect(lineMonthlyHours(p, p.build.team[0]!)).toBe(320);
    const m1 = L(p).months[0]!.lines.find((l) => l.stream === "labour")!;
    expect(m1.quantity).toBe(320);
    expect(m1.cost).toBe(32_000);
    expect(m1.formula).toContain("2 × 12 wk × 40 h/wk ÷ 3 months");
  });
  it("costs the whole 960 hours (C$96,000) over the window and nothing outside it", () => {
    const p = withEffort();
    const led = L(p);
    expect([1, 2, 3].map((m) => led.months[m - 1]!.byStream.labour)).toEqual([32_000, 32_000, 32_000]);
    expect(labour(p, 4)).toBe(0);
    expect(led.totals.buildLabour).toBe(96_000);
    expect(led.totals.build).toBe(96_000);
  });
  it("follows the window: the same effort over 4 months is 240 h a month", () => {
    const p = withEffort();
    p.build.team[0]!.toMonth = 4;
    expect(lineMonthlyHours(p, p.build.team[0]!)).toBe(240);
    expect(L(p).totals.buildLabour).toBe(96_000);
  });
  it("applies the line's manual rate and the contingency", () => {
    const p = withEffort();
    p.build.team[0]!.rateOverride = 150;
    p.build.contingencyPct = 10;
    expect(L(p).totals.buildLabour).toBeCloseTo(960 * 150 * 1.1, 6);
  });
  it("without effort the line is people x hours per month, as before", () => {
    const p = base((q) => { q.build.team = [{ roleId: "dev", people: 2, hoursPerMonth: 100, experiments: false, fromMonth: 1, toMonth: 3 }]; });
    expect(labour(p, 1)).toBe(20_000);
  });
  it("switching a line to people x weeks keeps its monthly hours, and back again", () => {
    const p = base((q) => { q.build.team = [{ roleId: "dev", people: 2, hoursPerMonth: 100, experiments: false, fromMonth: 1, toMonth: 3 }]; });
    const before = L(p).totals.buildLabour;
    setEffortMode(p, 0, true);
    expect(p.build.team[0]!.effort).toEqual({ people: 2, weeks: 7.5, hoursPerWeek: 40 }); // 2 x 100 x 3 = 600 h = 2 x 7.5 x 40
    expect(L(p).totals.buildLabour).toBe(before);
    setEffort(p, 0, { weeks: 15 });
    expect(L(p).totals.buildLabour).toBe(before * 2);
    setEffortMode(p, 0, false);
    expect(p.build.team[0]!.effort).toBeUndefined();
    expect(p.build.team[0]!.hoursPerMonth).toBe(200);
  });
  it("a line with a zero-month window costs nothing", () => {
    const p = withEffort();
    p.build.team[0]!.fromMonth = 5; p.build.team[0]!.toMonth = 2;
    expect(L(p).totals.buildLabour).toBe(0);
  });
});

describe("phases on team lines", () => {
  it("a line with a phaseId and no months follows the phase's months", () => {
    const p = base((q) => {
      applyStandardPhases(q);
      q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false, phaseId: "design" }];
    });
    const design = p.timeline.phases!.find((x) => x.id === "design")!;
    const led = L(p);
    for (let m = 1; m <= 6; m++) expect(led.months[m - 1]!.byStream.labour).toBe(m >= design.fromMonth && m <= design.toMonth ? 10_000 : 0);
    expect(led.months[design.fromMonth - 1]!.lines[0]!.label).toBe("Design: Developer");
  });
  it("picking a phase sets From and To; clearing keeps them", () => {
    const p = base((q) => { applyStandardPhases(q); q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false }]; });
    setLinePhase(p, 0, "build");
    expect(p.build.team[0]).toMatchObject({ phaseId: "build", fromMonth: 3, toMonth: 4 });
    setLinePhase(p, 0, undefined);
    expect(p.build.team[0]!.phaseId).toBeUndefined();
    expect(p.build.team[0]!.fromMonth).toBe(3);
  });
  it("the free-text phase still works and wins the label", () => {
    const p = base((q) => { applyStandardPhases(q); q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false, phase: "Spike", phaseId: "design" }]; });
    expect(L(p).months[1]!.lines[0]!.label).toBe("Spike: Developer");
  });
  it("an unknown phaseId behaves as no phase", () => {
    const p = base((q) => { q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false, phaseId: "nope" }]; });
    expect(L(p).totals.buildLabour).toBe(6 * 10_000);
  });
});

describe("hypercare after go-live", () => {
  const withHypercare = (extra: Partial<Project["build"]["team"][number]> = {}) => base((q) => {
    applyStandardPhases(q); // hypercare = months 7 and 8
    q.build.team = [
      { roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false, phaseId: HYPERCARE_ID, ...extra },
      { roleId: "dev", people: 2, hoursPerMonth: 100, experiments: false, fromMonth: 1, toMonth: 12 }, // runs past the build but is not hypercare
    ];
  });
  it("a hypercare line is costed as labour in production months 7 and 8", () => {
    const led = L(withHypercare());
    expect(led.months[6]!.phase).toBe("production");
    expect(led.months[6]!.byStream.labour).toBe(10_000);
    expect(led.months[7]!.byStream.labour).toBe(10_000);
    expect(led.months[6]!.lines.filter((l) => l.stream === "labour")).toHaveLength(1);
    expect(led.months[8]!.byStream.labour).toBe(0);
  });
  it("a non-hypercare line with months past the build is not billed there", () => {
    const led = L(withHypercare());
    for (let m = 1; m <= 6; m++) expect(led.months[m - 1]!.byStream.labour).toBe(10_000 * 0 + 20_000 + (m >= 7 ? 10_000 : 0));
    for (let m = 7; m <= 24; m++) expect(led.months[m - 1]!.lines.filter((l) => l.stream === "labour" && l.seat === 1)).toHaveLength(0);
  });
  it("a line whose own To month is past the hypercare phase is cut at the phase end", () => {
    const led = L(withHypercare({ fromMonth: 7, toMonth: 20 }));
    expect(led.months[7]!.byStream.labour).toBe(10_000);
    expect(led.months[8]!.byStream.labour).toBe(0);
  });
  it("counts in the build totals and the Team row, and stays labour for ROI", () => {
    const p = withHypercare();
    const led = L(p);
    expect(led.totals.buildLabour).toBe(6 * 20_000 + 20_000);
    expect(led.totals.build).toBe(led.totals.buildLabour);
    const roi = computeRoi(led, "full", 0, {} as never);
    expect(basisCost(led.months[6]!, "full")).toBe(10_000);
    expect(roi.cumulative.length).toBe(24);
  });
  it("carries contingency", () => {
    const p = withHypercare();
    p.build.contingencyPct = 20;
    expect(L(p).months[6]!.byStream.labour).toBeCloseTo(12_000, 6);
  });
  it("needs a hypercare phase that extends past the build: without phases nothing is billed after go-live", () => {
    const p = withHypercare();
    delete p.timeline.phases;
    for (let m = 7; m <= 24; m++) expect(L(p).months[m - 1]!.byStream.labour).toBe(0);
    p.timeline.phases = [{ id: HYPERCARE_ID, label: "Hypercare", fromMonth: 5, toMonth: 6 }];
    for (let m = 7; m <= 24; m++) expect(L(p).months[m - 1]!.byStream.labour).toBe(0);
  });
  it("is off when build labour is excluded or the line is not costed", () => {
    const p = withHypercare({ costed: false });
    expect(L(p).months[6]!.byStream.labour).toBe(0);
    const q = withHypercare();
    q.build.includeLabour = false;
    expect(L(q).months[6]!.byStream.labour).toBe(0);
  });
  it("only a hypercare-phase line, never another phase, runs past the build", () => {
    const p = base((q) => {
      applyStandardPhases(q);
      q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false, phaseId: "deploy", fromMonth: 6, toMonth: 9 }];
    });
    expect(L(p).months.map((m) => m.byStream.labour)[6]).toBe(0);
    expect(L(p).totals.buildLabour).toBe(10_000);
  });
});

describe("delivery costs", () => {
  const withDelivery = (over: (p: Project) => void = () => {}) => base((p) => {
    p.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false }];
    p.build.deliveryCosts = [
      { id: "d1", label: "Bank integration", amountCad: 25_000, cadence: "once", category: "vendor" },
      { id: "d2", label: "Training", amountCad: 10_000, cadence: "once", category: "training" },
    ];
    over(p);
  });
  it("C$35,000 lands in the delivery stream, in month 1 by default, and in totals.build", () => {
    const led = L(withDelivery());
    expect(deliveryCost(led.months[0]!)).toBe(35_000);
    expect(led.months[0]!.byStream.delivery).toBe(35_000);
    expect(deliveryCost(led.months[1]!)).toBe(0);
    expect(led.totals.build).toBe(6 * 10_000 + 35_000);
    expect(led.totals.buildLabour).toBe(60_000);
    expect(led.months[0]!.lines.filter((l) => l.stream === "delivery").map((l) => l.cost)).toEqual([25_000, 10_000]);
  });
  it("a one-off item with a month lands there (capped at the last build month); a monthly item bills every build month", () => {
    const led = L(withDelivery((p) => {
      p.build.deliveryCosts = [
        { id: "a", label: "Cutover support", amountCad: 8_000, cadence: "once", month: 5, category: "vendor" },
        { id: "b", label: "Late", amountCad: 1_000, cadence: "once", month: 99, category: "other" },
        { id: "c", label: "Comms", amountCad: 500, cadence: "monthly", category: "comms" },
      ];
    }));
    expect(deliveryCost(led.months[4]!)).toBe(8_000 + 500);
    expect(deliveryCost(led.months[5]!)).toBe(1_000 + 500);
    expect(deliveryCost(led.months[6]!)).toBe(0);
    expect(led.totals.build).toBe(60_000 + 8_000 + 1_000 + 6 * 500);
  });
  it("contingency scope 'all' adds contingency to delivery costs; 'labour' does not", () => {
    const labourOnly = withDelivery((p) => { p.build.contingencyPct = 15; p.build.contingencyScope = "labour"; });
    expect(L(labourOnly).totals.build).toBeCloseTo(60_000 * 1.15 + 35_000, 6);
    const all = withDelivery((p) => { p.build.contingencyPct = 15; p.build.contingencyScope = "all"; });
    expect(L(all).totals.build).toBeCloseTo((60_000 + 35_000) * 1.15, 6);
    expect(L(all).months[0]!.byStream.delivery).toBeCloseTo(35_000 * 1.15, 6);
  });
  it("the AI dev-cost cut does not touch delivery costs", () => {
    const led = L(withDelivery((p) => { p.roi.devCutPct = 50; }));
    expect(led.months[0]!.byStream.delivery).toBe(35_000);
    expect(led.months[0]!.byStream.labour).toBe(5_000);
  });
  it("counts under the full lifecycle basis only", () => {
    const led = L(withDelivery());
    const m1 = led.months[0]!;
    expect(basisCost(m1, "full")).toBe(10_000 + 35_000);
    expect(basisCost(m1, "runMaint")).toBe(0);
    expect(basisCost(m1, "run")).toBe(0);
  });
  it("is part of the cost split's build slice and a shared stream in the allocation", () => {
    const p = withDelivery();
    const led = L(p);
    expect(costSplit(led).find((x) => x.key === "build")!.value).toBe(95_000);
    const full = computeAllocation(p, led, "full");
    expect(full.sharedPool).toBe(95_000);
    expect(full.unallocated.items.map((i) => i.cost).reduce((a, b) => a + b, 0)).toBe(95_000);
    expect(computeAllocation(p, led, "runMaint").sharedPool).toBe(0);
  });
  it("shows in the Excel month rows and the summary build figure", () => {
    const p = withDelivery();
    const led = L(p);
    const roi = computeRoi(led, "full", 0, {} as never);
    const rows = monthRows(led, roi);
    expect(rows[0]!["Delivery costs"]).toBe(35_000);
    expect(rows[1]!["Delivery costs"]).toBe(0);
    expect(summarize(p, led, roi, cat).build).toBe(95_000);
    expect(summaryRows(p, led, roi, cat).length).toBeGreaterThan(0);
  });
  it("is in the base of 'maintenance as a percent of build', like the dev environment", () => {
    const mk = (withIt: boolean) => base((p) => {
      p.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false }];
      if (withIt) p.build.deliveryCosts = [{ id: "d", label: "Vendor", amountCad: 60_000, cadence: "once", category: "vendor" }];
      p.maintenance = { mode: "pctOfBuild", pctPerYear: 20 };
    });
    const m = (p: Project) => L(p).months[6]!.byStream.maint;
    expect(m(mk(false))).toBeCloseTo(60_000 * 0.2 / 12, 6);
    expect(m(mk(true))).toBeCloseTo(120_000 * 0.2 / 12, 6);
    const cut = mk(true);
    cut.roi.devCutPct = 50;
    // The base is the uncut build (60,000 labour + 60,000 delivery); the dev-cost cut is applied to the maintenance figure's own cut separately (maintCutPct), not here.
    expect(m(cut)).toBeCloseTo(120_000 * 0.2 / 12, 6);
  });
  it("addDeliveryCost / removeDeliveryCost keep ids unique and restore the original shape", () => {
    const p = base();
    const a = addDeliveryCost(p, "training");
    const b = addDeliveryCost(p, "dataMigration");
    expect(new Set([a, b]).size).toBe(2);
    expect(p.build.deliveryCosts![0]).toMatchObject({ category: "training", amountCad: 0, cadence: "once" });
    removeDeliveryCost(p, a); removeDeliveryCost(p, b);
    expect(p.build.deliveryCosts).toBeUndefined();
  });
});

describe("absent fields add nothing", () => {
  it("a project without phases, effort, phaseId or delivery costs has no delivery stream and no extra lines", () => {
    const p = base((q) => { q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false }]; });
    const led = L(p);
    expect(led.months.every((m) => !("delivery" in m.byStream))).toBe(true);
    expect(led.months.flatMap((m) => m.lines).every((l) => l.stream === "labour")).toBe(true);
    expect(led.months.flatMap((m) => m.lines)).toHaveLength(6);
    expect(Object.keys(JSON.parse(JSON.stringify(ProjectSchema.parse(p).timeline)))).not.toContain("phases");
  });
  it("an empty deliveryCosts list changes no figure", () => {
    const a = base((q) => { q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false }]; });
    const b = base((q) => { q.build.team = [{ roleId: "dev", people: 1, hoursPerMonth: 100, experiments: false }]; q.build.deliveryCosts = []; q.timeline.phases = []; });
    expect(L(b).totals).toEqual(L(a).totals);
    expect(L(b).months.map((m) => m.byStream)).toEqual(L(a).months.map((m) => m.byStream));
  });
});

describe("standard roles", () => {
  const avail = cat.benchmarks.availableRoles;
  it("lists the 14 delivery roles, each an unverified assumption with a positive rate", () => {
    expect(avail.map((r) => r.id).sort()).toEqual(["architect", "ba", "bsa", "changeTraining", "dataEngineer", "dba", "developer", "devops", "pm", "qa", "scrumMaster", "supportAnalyst", "techLead", "ux"]);
    for (const r of avail) { expect(r.source).toBe("Assumption"); expect(r.confidence).toBe("unverified"); expect(r.hourlyRate).toBeGreaterThan(0); }
    expect(new Set(avail.map((r) => r.id)).size).toBe(avail.length);
  });
  it("does not change the rates of the roles that already existed", () => {
    for (const r of cat.benchmarks.roles) {
      const same = avail.find((a) => a.id === r.id);
      if (same) expect(same.hourlyRate).toBe(r.hourlyRate);
    }
    expect(Object.fromEntries(cat.benchmarks.roles.map((r) => [r.id, r.hourlyRate]))).toEqual({ knowledgeWorker: 49, ba: 55, engineer: 65, manager: 75 });
  });
  it("adding a role to a project adds exactly that role, once", () => {
    const p = base();
    const before = p.rateCard.length;
    expect(addStandardRole(p, avail.find((r) => r.id === "pm")!)).toBe("pm");
    expect(addStandardRole(p, avail.find((r) => r.id === "pm")!)).toBe("pm");
    expect(p.rateCard).toHaveLength(before + 1);
    expect(p.rateCard.find((r) => r.id === "pm")!.hourlyRate).toBe(avail.find((r) => r.id === "pm")!.hourlyRate);
  });
  it("is not added to any template or sample by itself", () => {
    const ids = new Set(blankProject("x").rateCard.map((r) => r.id));
    for (const bad of ["bsa", "qa", "pm", "scrumMaster", "devops", "dba", "ux", "dataEngineer", "techLead", "changeTraining", "supportAnalyst"]) expect(ids.has(bad)).toBe(false);
  });
});
