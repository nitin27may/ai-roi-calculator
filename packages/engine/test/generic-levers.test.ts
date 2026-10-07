import { describe, expect, it } from "vitest";
import { loadCatalog, type Catalog } from "@roi-calculator/catalog";
import { resourceFixtureCatalog } from "./fixtures/resource-catalog.js";
import {
  LEVERS, ProjectSchema, applicableLevers, applyScenario, blankProject, buildLedger, compareScenarios, computeRoi, currentLineMonthly, evaluateLevers, leverEffect,
  meetingIntelligence, projectRange, roiOptions, sensitivity, standardPhases, type Lever, type Project,
} from "../src/index.js";

/** A catalogue where the VM type has a size ladder: D2 (100), D4 (200), D8 (400) in Linux; Windows has D4 only. */
function ladderCatalog(): Catalog {
  const c = resourceFixtureCatalog();
  const src = { kind: "derived" as const, note: "Test fixture.", retrievedAt: "2026-10-06" };
  const price = (id: string, p: number) => ({ id, label: id, platform: "azure" as const, unit: "month (730 h)", price: p, source: src, confidence: "unverified" as const });
  return {
    ...c,
    unitPrices: [...c.unitPrices, price("fx-vm-d2", 100), price("fx-vm-d8", 400)],
    resourceTypes: c.resourceTypes.map((t) => t.id !== "vm" ? t : {
      ...t,
      skus: [
        { id: "d8s-v5-linux", label: "D8s v5, Linux", attrs: { os: "linux", vcpu: 8 }, prices: { compute: "fx-vm-d8" } },
        { id: "d4s-v5-linux", label: "D4s v5, Linux", attrs: { os: "linux", vcpu: 4 }, prices: { compute: "fx-vm-linux" } },
        { id: "d2s-v5-linux", label: "D2s v5, Linux", attrs: { os: "linux", vcpu: 2 }, prices: { compute: "fx-vm-d2" } },
        { id: "d4s-v5-windows", label: "D4s v5, Windows", attrs: { os: "windows", vcpu: 4 }, prices: { compute: "fx-vm-windows" } },
      ],
    }),
  };
}
const cat = ladderCatalog();
const real = loadCatalog();

/**
 * A non-AI project: 6 build months, 36 months, no discounting, no contingency. Three Linux VMs at C$200 (ri1 C$125, ri3 C$80), production and a dev
 * environment (0.5 size, 10 h x 22 days). Team: PM 1 x 100 h at C$100, an analyst 1 x 100 h at C$50 (also a current-state people role).
 * Current state: a lease retiring in month 12 (C$1,500), 1,000 cheques at C$2 reduced 100%, an analyst FTE line. Payments: 9,000 x C$0.30. 50 seats at C$30.
 */
function project(extra: (p: Project) => void = () => {}): Project {
  const p = blankProject("Generic", "2027-01-01");
  p.features = [{ id: "f1", label: "Payments", types: ["automation"] }];
  p.timeline = { buildMonths: 6, horizonMonths: 36, adoptionRampMonths: 0 };
  p.roi.discountRatePct = 0; p.roi.rateEscalationPctPerYear = 0; p.roi.growthPctPerYear = 0; p.roi.basis = "full";
  p.maintenance = { mode: "none" };
  p.build.environment = []; p.build.contingencyPct = 0;
  p.rateCard = [{ id: "pm", label: "PM", hourlyRate: 100 }, { id: "analyst", label: "Analyst", hourlyRate: 50 }];
  p.build.team = [
    { roleId: "pm", people: 1, hoursPerMonth: 100, experiments: false },
    { roleId: "analyst", people: 1, hoursPerMonth: 100, experiments: false },
  ];
  p.resources = [{ id: "r1", label: "App servers", typeId: "vm", skuId: "d4s-v5-linux", inputs: { count: 3 }, term: "payg", ahb: false }];
  p.environments = [
    { id: "prod", label: "Production", production: true, sizeFactor: 1, schedule: { hoursPerMonth: 730 }, pricing: "payg" },
    { id: "dev", label: "Dev", production: false, sizeFactor: 0.5, schedule: { hoursPerDay: 10, daysPerMonth: 22 }, pricing: "payg" },
  ];
  p.workloads = [
    { kind: "transactionFee", id: "pay", label: "Payment fees", volumePerMonth: 9000, cadPerTxn: 0.3 },
    { kind: "seats", id: "lic", label: "Licences", seats: 50, cadPerSeat: 30, followsAdoption: false },
  ] as unknown as Project["workloads"];
  p.currentState = { lines: [
    { id: "lease", label: "Lease", category: "infrastructure", basis: { kind: "monthly", amountCad: 1500 }, change: { mode: "retire", fromMonth: 12 } },
    { id: "cheques", label: "Cheques", category: "transaction", basis: { kind: "perTransaction", unitCostCad: 2, volumePerMonth: 1000 }, change: { mode: "reduce", pct: 100, followsAdoption: false } },
    { id: "ops", label: "Operations", category: "people", basis: { kind: "fte", roleId: "analyst", fte: 1, hoursPerMonth: 100 }, change: { mode: "keep" } },
  ] };
  extra(p);
  return ProjectSchema.parse(p);
}

const B = 6;
const lines = (p: Project, c: Catalog = cat) => buildLedger(p, c);
const resCost = (p: Project, m: number, envId: string, c: Catalog = cat) =>
  lines(p, c).months[m - 1]!.lines.filter((l) => l.componentId.startsWith("resource:") && l.id.endsWith(`:${envId}`)).reduce((s, l) => s + l.cost, 0);
const npv = (p: Project, c: Catalog = cat) => computeRoi(buildLedger(p, c), p.roi.basis, p.roi.discountRatePct, roiOptions(p)).npv;
const lever = (id: string): Lever => LEVERS.find((l) => l.id === id)!;
const edit = (p: Project, leverId: string, amount?: number) => applyScenario(p, { id: "s", label: "s", edits: [{ kind: "lever", leverId, ...(amount === undefined ? {} : { amount }) }] }, cat);
/** Build labour only: the sum of the labour stream (totals.build also carries non-production environments). */
const labour = (p: Project) => lines(p).months.reduce((a, m) => a + m.byStream.labour, 0);

describe("reserved coverage", () => {
  it("50% on a VM with ri1 C$125 blends to half payg and half reserved in production, dev untouched", () => {
    const p = project();
    const q = edit(p, "reserve1y", 50);
    expect(resCost(q, B + 1, "prod")).toBeCloseTo(3 * (0.5 * 200 + 0.5 * 125), 6);
    expect(resCost(q, 1, "dev")).toBeCloseTo(resCost(p, 1, "dev"), 6);
    expect(resCost(q, 1, "dev")).toBeCloseTo(3 * 200 * 0.5 * (220 / 730), 6);
  });
  it("defaults to 50% when no amount is given and 100% reserves all of production at the reserved price", () => {
    const p = project();
    expect(resCost(edit(p, "reserve1y"), B + 1, "prod")).toBeCloseTo(487.5, 6);
    expect(resCost(edit(p, "reserve1y", 100), B + 1, "prod")).toBeCloseTo(3 * 125, 6);
    expect(resCost(edit(p, "reserve3y", 100), B + 1, "prod")).toBeCloseTo(3 * 80, 6);
  });
  it("without environments the whole resource splits in place", () => {
    const p = project((x) => { x.environments = []; });
    expect(resCost({ ...edit(p, "reserve1y", 50) }, B + 1, "")).toBe(0); // ids carry no env suffix
    const l = lines(edit(p, "reserve1y", 50)).months[B]!.lines.filter((x) => x.componentId.startsWith("resource:")).reduce((s, x) => s + x.cost, 0);
    expect(l).toBeCloseTo(487.5, 6);
  });
  it("is hidden when nothing can be reserved: already reserved, no reserved price, or no resources", () => {
    expect(applicableLevers(project((x) => { x.resources![0]!.term = "ri1"; }), cat).map((l) => l.id)).not.toContain("reserve1y");
    expect(applicableLevers(project((x) => { x.resources![0]!.typeId = "app-service-plan"; x.resources![0]!.skuId = "p1v3-linux"; x.resources![0]!.inputs = { instances: 1 }; }), resourceFixtureCatalog()).map((l) => l.id)).toContain("reserve1y");
    expect(applicableLevers(project((x) => { x.resources = []; }), cat).map((l) => l.id)).not.toContain("reserve1y");
  });
  it("shows as a saving in the cost-lever list", () => {
    const o = evaluateLevers(project(), cat).find((x) => x.lever.id === "reserve1y");
    expect(o?.saving).toBeGreaterThan(0);
  });
});

describe("SKU size step", () => {
  it("up picks the next-priced sibling in the same operating system", () => {
    const p = project();
    expect(edit(p, "skuUp").resources![0]!.skuId).toBe("d8s-v5-linux");
    expect(resCost(edit(p, "skuUp"), B + 1, "prod")).toBeCloseTo(3 * 400, 6);
  });
  it("down picks the next cheaper sibling, and skips a resource at the bottom of its ladder", () => {
    const p = project();
    const q = edit(p, "skuDown");
    expect(q.resources![0]!.skuId).toBe("d2s-v5-linux");
    expect(resCost(q, B + 1, "prod")).toBeCloseTo(3 * 100, 6);
    expect(edit(q, "skuDown").resources![0]!.skuId).toBe("d2s-v5-linux");
    expect(applicableLevers(q, cat).map((l) => l.id)).not.toContain("skuDown");
  });
  it("never crosses operating system, and skips types with no numeric size", () => {
    const win = project((x) => { x.resources![0]!.skuId = "d4s-v5-windows"; });
    expect(applicableLevers(win, cat).map((l) => l.id)).not.toContain("skuUp");
    expect(applicableLevers(win, cat).map((l) => l.id)).not.toContain("skuDown");
    expect(edit(win, "skuUp").resources![0]!.skuId).toBe("d4s-v5-windows");
    expect(applicableLevers(project(), resourceFixtureCatalog()).map((l) => l.id)).not.toContain("skuUp");
  });
});

describe("non-production hours", () => {
  it("x0.5 halves the hour-billed dev cost and leaves production alone", () => {
    const p = project();
    const q = edit(p, "envHours", 50);
    expect(resCost(q, 1, "dev")).toBeCloseTo(resCost(p, 1, "dev") / 2, 6);
    expect(resCost(q, B + 1, "prod")).toBeCloseTo(resCost(p, B + 1, "prod"), 6);
    expect(q.environments![1]!.schedule).toEqual({ hoursPerDay: 5, daysPerMonth: 22 });
  });
  it("scales a monthly-hours schedule, and a reserved dev resource does not follow it", () => {
    const m = project((x) => { x.environments![1]!.schedule = { hoursPerMonth: 400 }; });
    expect(resCost(edit(m, "envHours", 50), 1, "dev")).toBeCloseTo(resCost(m, 1, "dev") / 2, 6);
    const ri = project((x) => { x.resources![0]!.term = "ri1"; });
    expect(resCost(edit(ri, "envHours", 50), 1, "dev")).toBeCloseTo(resCost(ri, 1, "dev"), 6);
  });
  it("is hidden with no non-production environment", () => {
    expect(applicableLevers(project((x) => { x.environments = x.environments!.slice(0, 1); }), cat).map((l) => l.id)).not.toContain("envHours");
  });
});

describe("shiftMonths decommission", () => {
  it("+6 delays the lease saving by 6 months and NPV falls by exactly that saving", () => {
    const p = project();
    const q = applyScenario(p, { id: "s", label: "s", edits: [{ kind: "shiftMonths", target: "decommission", by: 6 }] }, cat);
    const at = (x: Project, m: number) => lines(x).months[m - 1]!.benefitBy.currentState.lease ?? 0;
    expect(at(p, 12)).toBe(1500); expect(at(q, 12)).toBe(0); expect(at(q, 18)).toBe(1500);
    expect(q.currentState!.lines.find((l) => l.id === "lease")!.change).toEqual({ mode: "retire", fromMonth: 18 });
    expect(npv(p) - npv(q)).toBeCloseTo(6 * 1500 + 6 * 1000 * 2, 6); // the cheque reduction (from go-live, month 7) shifts to month 13 too
  });
  it("never moves a change before go-live, and leaves kept lines alone", () => {
    const q = applyScenario(project(), { id: "s", label: "s", edits: [{ kind: "shiftMonths", target: "decommission", by: -24 }] }, cat);
    expect(q.currentState!.lines.find((l) => l.id === "lease")!.change).toEqual({ mode: "retire", fromMonth: B + 1 });
    expect(q.currentState!.lines.find((l) => l.id === "ops")!.change).toEqual({ mode: "keep" });
  });
});

describe("scaleRates", () => {
  it("1.1 raises delivery labour exactly 10%, and leaves the value of an hour saved and current-state people cost alone", () => {
    const p = project();
    const q = applyScenario(p, { id: "s", label: "s", edits: [{ kind: "scaleRates", factor: 1.1 }] }, cat);
    const lab = (x: Project) => lines(x).months[0]!.byStream.labour;
    expect(lab(p)).toBeCloseTo(100 * 100 + 100 * 50, 6);
    expect(lab(q)).toBeCloseTo(lab(p) * 1.1, 6);
    expect(currentLineMonthly(q, q.currentState!.lines.find((l) => l.id === "ops")!)).toBe(5000);
    expect(q.rateCard.find((r) => r.id === "analyst")!.hourlyRate).toBe(50);
    expect(q.rateCard.find((r) => r.id === "pm")!.hourlyRate).toBeCloseTo(110, 9);
  });
  it("scales a manual rate in place", () => {
    const p = project((x) => { x.build.team[0]!.rateOverride = 200; });
    const q = applyScenario(p, { id: "s", label: "s", edits: [{ kind: "scaleRates", factor: 1.1 }] }, cat);
    expect(q.build.team[0]!.rateOverride).toBeCloseTo(220, 9);
  });
  it("scope all also moves current-state people cost", () => {
    const q = applyScenario(project(), { id: "s", label: "s", edits: [{ kind: "scaleRates", factor: 1.1, scope: "all" }] }, cat);
    expect(currentLineMonthly(q, q.currentState!.lines.find((l) => l.id === "ops")!)).toBeCloseTo(5500, 9);
  });
});

describe("volume", () => {
  it("x2 doubles transaction fees, seats and per-transaction savings", () => {
    const p = project();
    const q = edit(p, "volume", 200);
    const run = (x: Project, m: number) => { const b = lines(x).months[m - 1]!.byStream; return b.run + b.platform; };
    expect(run(q, B + 1) - run(p, B + 1)).toBeCloseTo(9000 * 0.3 + 50 * 30, 6);
    const w = q.workloads.find((x) => x.id === "pay") as { volumePerMonth: number };
    expect(w.volumePerMonth).toBe(18000);
    const cheques = (x: Project) => lines(x).months[B]!.benefitBy.currentState.cheques!;
    expect(cheques(q)).toBeCloseTo(cheques(p) * 2, 6);
  });
  it("leaves a volume that is read from another workload to follow it", () => {
    const p = project((x) => { x.currentState!.lines[1]!.basis = { kind: "perTransaction", unitCostCad: 2, volumeFrom: "pay" }; });
    const q = edit(p, "volume", 200);
    expect(currentLineMonthly(q, q.currentState!.lines[1]!)).toBeCloseTo(2 * 18000, 6);
  });
  it("is hidden with no per-transaction or seat volume", () => {
    expect(applicableLevers(project((x) => { x.workloads = []; x.currentState = { lines: [] }; }), cat).map((l) => l.id)).not.toContain("volume");
  });
});

describe("delivery length and go-live", () => {
  const phased = () => project((x) => {
    x.timeline.phases = standardPhases(6, 36);
    x.build.team.push({ roleId: "pm", people: 1, hoursPerMonth: 100, experiments: false, fromMonth: 3, toMonth: 6 });
  });
  it("x2 doubles open-ended labour, scales explicit windows and phases, and shifts hypercare", () => {
    const p = phased();
    const q = edit(p, "deliveryLength", 200);
    expect(q.timeline.buildMonths).toBe(12);
    expect(labour(p)).toBeCloseTo(6 * 15000 + 4 * 10000, 6);
    expect(labour(q)).toBeCloseTo(12 * 15000 + 8 * 10000, 6); // open-ended lines run 12 months, the windowed line 5 to 12
    const w = q.build.team[2]!;
    expect([w.fromMonth, w.toMonth]).toEqual([5, 12]);
    const h = q.timeline.phases!.find((x) => x.id === "hypercare")!, h0 = p.timeline.phases!.find((x) => x.id === "hypercare")!;
    expect([h.fromMonth, h.toMonth]).toEqual([h0.fromMonth + 6, h0.toMonth + 6]);
    expect(q.timeline.phases!.find((x) => x.id === "deploy")!.toMonth).toBe(12);
  });
  it("shrinks and clamps to 1..24 months", () => {
    expect(edit(project(), "deliveryLength", 50).timeline.buildMonths).toBe(3);
    expect(edit(project((x) => { x.timeline.buildMonths = 20; }), "deliveryLength", 200).timeline.buildMonths).toBe(24);
  });
  it("go-live +3 adds three months of team time and moves later change months and hypercare with it", () => {
    const p = phased();
    const q = applyScenario(p, { id: "s", label: "s", edits: [{ kind: "shiftMonths", target: "golive", by: 3 }] }, cat);
    expect(q.timeline.buildMonths).toBe(9);
    expect(labour(q)).toBeCloseTo(labour(p) + 3 * (100 * 100 + 100 * 50 + 100 * 100), 6); // all three lines run to the new end
    expect(q.currentState!.lines.find((l) => l.id === "lease")!.change).toEqual({ mode: "retire", fromMonth: 15 });
    expect(q.timeline.phases!.find((x) => x.id === "hypercare")!.fromMonth).toBe(10);
    expect(q.build.team[2]!.toMonth).toBe(9);
    expect(npv(q)).toBeLessThan(npv(p));
  });
  it("go-live earlier by more than the build clamps at 1 month", () => {
    expect(applyScenario(project(), { id: "s", label: "s", edits: [{ kind: "shiftMonths", target: "golive", by: -20 }] }, cat).timeline.buildMonths).toBe(1);
  });
});

describe("adoption levers", () => {
  it("the ramp lever shortens the ramp and is hidden at 0", () => {
    const p = project((x) => { x.timeline.adoptionRampMonths = 6; x.currentState!.lines[1]!.change = { mode: "reduce", pct: 100, followsAdoption: true }; });
    expect(edit(p, "adoptionRamp", 2).timeline.adoptionRampMonths).toBe(2);
    expect(edit(p, "adoptionRamp").timeline.adoptionRampMonths).toBe(3);
    expect(applicableLevers(project(), cat).map((l) => l.id)).not.toContain("adoptionRamp");
  });
});

describe("applicability", () => {
  const ids = (p: Project, c: Catalog = cat) => applicableLevers(p, c).map((l) => l.id);
  it("a non-AI project sees no AI lever and the generic ones for its parts", () => {
    const got = ids(project());
    for (const id of ["narrowBakeoff", "batchRegression", "batchBakeoff", "devCache", "sampleEval", "routeChat", "cheapestStt"]) expect(got).not.toContain(id);
    for (const id of ["reserve1y", "reserve3y", "skuUp", "skuDown", "envHours", "volume", "deliveryLength", "goLive", "decommission", "labourRates"]) expect(got).toContain(id);
  });
  it("a blank project has only the timing levers its (empty) plan supports", () => {
    const got = ids(ProjectSchema.parse(blankProject("Blank")), real);
    for (const id of ["reserve1y", "skuUp", "envHours", "volume", "decommission", "adoptionShare", "adoptionRamp"]) expect(got).not.toContain(id);
  });
  it("the sample keeps every AI lever it had and gains none that need resources, volumes or current state", () => {
    const s = ProjectSchema.parse(meetingIntelligence);
    const got = ids(s, real);
    for (const id of ["narrowBakeoff", "batchRegression", "devCache", "sampleEval", "routeChat"]) expect(got).toContain(id);
    for (const id of ["reserve1y", "reserve3y", "skuUp", "skuDown", "envHours", "volume", "decommission"]) expect(got).not.toContain(id);
  });
  it("existing cost-lever list for the sample is unchanged: AI levers only", () => {
    const s = ProjectSchema.parse(meetingIntelligence);
    expect(evaluateLevers(s, real).every((o) => o.lever.group === "ai")).toBe(true);
  });
  it("what-if levers move NPV and are measured by leverEffect", () => {
    const p = project();
    const e = leverEffect(p, cat, lever("labourRates"), 110);
    expect(e.cost).toBeCloseTo(labour(p) * 0.1, 6);
    expect(e.npv).toBeCloseTo(-e.cost, 6);
  });
  it("every lever is pure and runs on an empty-ish project without throwing", () => {
    const p = project();
    const before = JSON.stringify(p);
    for (const l of LEVERS) l.apply(p, cat);
    expect(JSON.stringify(p)).toBe(before);
    for (const l of LEVERS) expect(() => l.apply(ProjectSchema.parse(blankProject("Blank")), real)).not.toThrow();
  });
  it("lever amounts are clamped to their bounds", () => {
    expect(edit(project(), "labourRates", 500).rateCard.find((r) => r.id === "pm")!.hourlyRate).toBeCloseTo(150, 9);
  });
});

describe("generic sensitivity drivers", () => {
  const rows = (p: Project, c: Catalog = cat) => sensitivity(p, c).rows.map((r) => r.id);
  it("a non-AI project shows the generic drivers and none of the AI-only ones", () => {
    const got = rows(project());
    for (const id of ["resourceCost", "currentSavings", "transactionVolume", "seatCount", "decommissionMonth", "buildLength", "deliveryRates"]) expect(got).toContain(id);
    for (const id of ["tokenPrice", "cacheHit", "modelSwap", "runVolume"]) expect(got).not.toContain(id);
  });
  it("each generic driver moves NPV the right way and the project is not mutated", () => {
    const p = project();
    const before = JSON.stringify(p);
    const s = sensitivity(p, cat);
    expect(JSON.stringify(p)).toBe(before);
    const get = (id: string) => s.rows.find((r) => r.id === id)!;
    expect(get("resourceCost").high).toBeGreaterThan(get("resourceCost").low);
    expect(get("currentSavings").high).toBeGreaterThan(get("currentSavings").low);
    expect(get("decommissionMonth").high).toBeGreaterThan(get("decommissionMonth").low);
    expect(get("seatCount").high).toBeGreaterThan(get("seatCount").low);
    // Resources cost 3 x 200 x 30 production months + dev; +-20% of the whole resource bill is the swing.
    const resTotal = lines(p).months.reduce((a, m) => a + m.lines.filter((l) => l.componentId.startsWith("resource:")).reduce((x, l) => x + l.cost, 0), 0);
    expect(get("resourceCost").swing).toBeCloseTo(0.4 * resTotal, 4);
    // Low is +6 months: the lease loses 6 months (C$9,000) and the cheque saving 6 months (C$12,000). High is 6 earlier, but the lease can only
    // reach go-live (month 7, 5 months early: C$7,500) and the cheques already start there.
    expect(get("decommissionMonth").swing).toBeCloseTo(6 * 1500 + 6 * 2000 + 5 * 1500, 4);
  });
  it("absent parts hide their drivers", () => {
    const got = rows(project((x) => { x.resources = []; x.workloads = []; x.currentState = { lines: [] }; }));
    for (const id of ["resourceCost", "currentSavings", "transactionVolume", "seatCount", "decommissionMonth"]) expect(got).not.toContain(id);
  });
  it("legacy and blank projects keep the AI drivers exactly as before", () => {
    const sample = rows(ProjectSchema.parse(meetingIntelligence), real);
    for (const id of ["tokenPrice", "runVolume", "cacheHit"]) expect(sample).toContain(id);
    expect(rows(ProjectSchema.parse(blankProject("Blank")), real)).toContain("runVolume");
    for (const id of ["resourceCost", "currentSavings", "transactionVolume", "seatCount", "decommissionMonth"]) expect(sample).not.toContain(id);
  });
  it("an AI-typed project with the same parts keeps AI drivers", () => {
    expect(rows(project((x) => { x.features[0]!.types = ["ai"]; }))).toContain("runVolume");
  });
});

describe("scenarios and ranges with the new parts", () => {
  it("compareScenarios runs saved generic edits and reports no error", () => {
    const p = project((x) => { x.scenarios = [{ id: "s1", label: "Later and dearer", edits: [{ kind: "shiftMonths", target: "decommission", by: 6 }, { kind: "scaleRates", factor: 1.1 }, { kind: "lever", leverId: "reserve1y", amount: 50 }] }]; });
    const r = compareScenarios(p, cat);
    expect(r[1]!.error).toBeUndefined();
    expect(r[1]!.roi.npv).not.toBe(r[0]!.roi.npv);
  });
  it("an unknown or inapplicable lever in a saved scenario leaves the project as it was", () => {
    const p = project((x) => { x.resources = []; });
    const q = applyScenario(p, { id: "s", label: "s", edits: [{ kind: "lever", leverId: "reserve1y" }] }, cat);
    expect(q.resources).toEqual([]);
  });
  it("the project range stays ordered low <= expected <= high", () => {
    const r = projectRange(project(), cat);
    for (const k of ["totalCost", "build", "annualRun", "totalBenefit", "npv"] as const) {
      expect(r[k].low).toBeLessThanOrEqual(r[k].expected + 1e-6);
      expect(r[k].expected).toBeLessThanOrEqual(r[k].high + 1e-6);
    }
  });
});
