import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, computeRoi, blankProject, buildLedger, featureBreakdown, hidesAiChoices, isAiWorkloadKind, newWorkload, projectIssues, steadyState, summarize, type Project, type Workload } from "../src/index.js";

const cat = loadCatalog();

/** 6 build months, a 6-month ramp, no growth, no maintenance: production month k is project month 6 + k. */
function base(workloads: Workload[]): Project {
  const p = blankProject("Run cost", "2027-01-01");
  p.timeline = { buildMonths: 6, horizonMonths: 48, adoptionRampMonths: 6 };
  p.build.team = []; p.build.environment = []; p.maintenance = { mode: "none" };
  p.roi.growthPctPerYear = 0; p.roi.discountRatePct = 0;
  p.workloads = workloads;
  return p;
}
const cost = (p: Project, id: string, m: number) => buildLedger(p, cat).months[m - 1]!.lines.filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0);
const seats = (o: Partial<Extract<Workload, { kind: "seats" }>> = {}): Workload => ({ kind: "seats", id: "lic", label: "Licences", seats: 50, cadPerSeat: 30, followsAdoption: false, ...o });

describe("seats", () => {
  it("bills every seat from go-live when it does not follow adoption: 50 x C$30 = C$1,500", () => {
    const p = base([seats()]);
    expect(cost(p, "lic", 6)).toBe(0); // build month
    for (const m of [7, 8, 12, 13]) expect(cost(p, "lic", m)).toBeCloseTo(1500, 6);
  });

  it("ramps with the adoption ramp when it follows adoption: 1/6 in the first production month, full from month 6", () => {
    const p = base([seats({ followsAdoption: true })]);
    expect(cost(p, "lic", 7)).toBeCloseTo(250, 6);
    expect(cost(p, "lic", 9)).toBeCloseTo(750, 6);
    expect(cost(p, "lic", 12)).toBeCloseTo(1500, 6);
    expect(cost(p, "lic", 20)).toBeCloseTo(1500, 6);
    const l = buildLedger(p, cat).months[6]!.lines.find((x) => x.componentId === "lic")!;
    expect(l.stream).toBe("platform");
    expect(l.behaviour).toBe("usage");
    expect(l.formula).toContain("50 seats × C$30.00 per seat-month");
    expect(l.formula).toContain("17% of full volume");
  });

  it("prices from the catalogue and subtracts free seats", () => {
    const p = base([seats({ cadPerSeat: undefined, unitPriceId: "copilot-business", freeSeats: 10 })]);
    const unit = cat.unitPrices.find((u) => u.id === "copilot-business")!.price!;
    const l = buildLedger(p, cat).months[7]!.lines.find((x) => x.componentId === "lic")!;
    expect(l.cost).toBeCloseTo(40 * unit, 6);
    expect(l.meter).toBe("copilot-business");
    expect(l.formula).toContain("(50 seats − 10 free) = 40 seats");
  });

  it("takes its count from a chat workload (volumeFrom) and follows later edits to it", () => {
    const chat = { ...newWorkload(base([]), "chat"), id: "assistant", users: 200 } as Workload;
    const p = base([chat, seats({ seats: 5, volumeFrom: "assistant" })]);
    expect(cost(p, "lic", 12)).toBeCloseTo(200 * 30, 6);
    (chat as { users: number }).users = 300;
    expect(cost(p, "lic", 12)).toBeCloseTo(300 * 30, 6);
  });

  it("adds nothing when empty or with no price", () => {
    expect(cost(base([seats({ seats: 0 })]), "lic", 12)).toBe(0);
    expect(cost(base([seats({ cadPerSeat: undefined })]), "lic", 12)).toBe(0);
    expect(cost(base([seats({ freeSeats: 50 })]), "lic", 12)).toBe(0);
  });
});

describe("contract", () => {
  const contract = (o: Partial<Extract<Workload, { kind: "contract" }>> = {}): Workload => ({ kind: "contract", id: "sup", label: "Support", amountCad: 12000, cadence: "yearly", escalationPct: 3, ...o });

  it("bills C$12,000 a year as C$1,000 a month and escalates 3% in year 2", () => {
    const p = base([contract()]);
    expect(cost(p, "sup", 7)).toBeCloseTo(1000, 6);
    expect(cost(p, "sup", 18)).toBeCloseTo(1000, 6);
    expect(cost(p, "sup", 19)).toBeCloseTo(1030, 6);
    expect(cost(p, "sup", 31)).toBeCloseTo(1060.9, 6);
    const l = buildLedger(p, cat).months[18]!.lines.find((x) => x.componentId === "sup")!;
    expect(l.stream).toBe("platform");
    expect(l.behaviour).toBe("fixed");
    expect(l.formula).toContain("C$12,000 a year ÷ 12 = C$1,000.00 a month");
    expect(l.formula).toContain("year 2");
  });

  it("is flat without escalation, monthly cadence, and respects start and end month", () => {
    const p = base([contract({ cadence: "monthly", amountCad: 800, escalationPct: undefined, startMonth: 10, endMonth: 12 })]);
    expect(cost(p, "sup", 9)).toBe(0);
    expect(cost(p, "sup", 10)).toBe(800);
    expect(cost(p, "sup", 12)).toBe(800);
    expect(cost(p, "sup", 13)).toBe(0);
  });

  it("counts escalation years from the contract's own start month", () => {
    const p = base([contract({ startMonth: 10 })]);
    expect(cost(p, "sup", 21)).toBeCloseTo(1000, 6);
    expect(cost(p, "sup", 22)).toBeCloseTo(1030, 6);
  });

  it("adds nothing when the amount is 0", () => {
    expect(cost(base([contract({ amountCad: 0 })]), "sup", 12)).toBe(0);
  });
});

describe("transactionFee", () => {
  const fee = (o: Partial<Extract<Workload, { kind: "transactionFee" }>> = {}): Workload => ({ kind: "transactionFee", id: "pay", label: "Payment fees", volumePerMonth: 9000, cadPerTxn: 0.3, ...o });

  it("9,000 x C$0.30 = C$2,700 a month at full adoption, as a run-stream usage line", () => {
    const p = base([fee()]);
    expect(cost(p, "pay", 12)).toBeCloseTo(2700, 6);
    const l = buildLedger(p, cat).months[11]!.lines.find((x) => x.componentId === "pay")!;
    expect(l.stream).toBe("run");
    expect(l.behaviour).toBe("usage");
    expect(l.formula).toBe("9,000 transactions × C$0.30 per transaction (your own price)");
    expect(buildLedger(p, cat).months[11]!.byStream.run).toBeCloseTo(2700, 6);
  });

  it("scales with the ramp and with growth like other usage lines", () => {
    const p = base([fee()]);
    expect(cost(p, "pay", 7)).toBeCloseTo(450, 6);
    p.roi.growthPctPerYear = 20;
    expect(cost(p, "pay", 19)).toBeCloseTo(2700 * 1.2, 6);
  });

  it("takes volume from another workload (volumeFrom) and prices per transaction from a per-1K catalogue price", () => {
    const llm = { ...newWorkload(base([]), "retrieval"), id: "search", queriesPerMonth: 40000 } as Workload;
    const unit = cat.unitPrices.find((u) => u.unit === "1K transactions")!;
    const p = base([llm, fee({ cadPerTxn: undefined, unitPriceId: unit.id, volumeFrom: "search" })]);
    const l = steadyState(buildLedger(p, cat)).lines.find((x) => x.componentId === "pay")!;
    expect(l.quantity).toBe(40000);
    expect(l.unitPrice).toBeCloseTo(unit.price! / 1000, 8);
  });

  it("an extra one-time volume is billed once on its own and ignores volumeFrom", () => {
    const p = base([fee({ oneTime: { volume: 1000, month: 8 } })]);
    const m = buildLedger(p, cat).months;
    expect(m[7]!.lines.filter((l) => l.once).reduce((s, l) => s + l.cost, 0)).toBeCloseTo(300, 6);
    expect(m[8]!.lines.some((l) => l.once)).toBe(false);
  });

  it("adds nothing when the volume is 0 or no price is set", () => {
    expect(cost(base([fee({ volumePerMonth: 0 })]), "pay", 12)).toBe(0);
    expect(cost(base([fee({ cadPerTxn: undefined })]), "pay", 12)).toBe(0);
  });
});

describe("whole-project behaviour", () => {
  it("flows into run rate, the feature breakdown and the summary", () => {
    const f = { id: "f1", label: "Feature", types: [] };
    const p = base([seats({ featureId: "f1" }), { kind: "contract", id: "sup", label: "Support", amountCad: 1000, cadence: "monthly", featureId: "f1" } as Workload, { kind: "transactionFee", id: "pay", label: "Fees", volumePerMonth: 9000, cadPerTxn: 0.3 } as Workload]);
    p.features = [f];
    const led = buildLedger(p, cat);
    expect(led.totals.runRate).toBeCloseTo(1500 + 1000 + 2700, 6);
    const row = featureBreakdown(p, led).find((r) => r.id === "f1")!;
    expect(row.workloads).toBe(2);
    expect(row.run).toBeGreaterThan(0);
    const roi = computeRoi(led, p.roi.basis, p.roi.discountRatePct);
    expect(summarize(p, led, roi, cat).steadyStateAnnualRun).toBeCloseTo(12 * (1500 + 1000 + 2700), 4);
  });

  it("is not AI: stays visible when only non-AI types are chosen, and parses with an unknown-link check", () => {
    for (const k of ["seats", "contract", "transactionFee"]) expect(isAiWorkloadKind(k)).toBe(false);
    expect(hidesAiChoices({ features: [{ id: "a", label: "A", types: ["saas"] }] })).toBe(true);
    const p = base([seats({ volumeFrom: "ghost" })]);
    expect(projectIssues(p).map((i) => i.message)).toContain('Unknown workload "ghost"');
    expect(ProjectSchema.safeParse(base([seats()])).success).toBe(true);
    expect(ProjectSchema.safeParse(base([seats({ volumeFrom: "ghost" })])).success).toBe(false);
  });

  it("round-trips through the schema and an old file without these kinds still parses", () => {
    const p = base([seats(), { kind: "contract", id: "c", label: "C", amountCad: 1, cadence: "yearly" } as Workload, { kind: "transactionFee", id: "t", label: "T", volumePerMonth: 1, cadPerTxn: 1 } as Workload]);
    expect(ProjectSchema.parse(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});
