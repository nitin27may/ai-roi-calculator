import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import {
  ACTIVITY_KINDS, ProjectSchema, WORKLOAD_KINDS, applyScenario, buildLedger, compareScenarios, computeAllocation, computeRoi,
  meetingIntelligence, newActivity, newWorkload, removeWorkload, setPath, type Project,
} from "../src/index.js";

const cat = loadCatalog();
const p = meetingIntelligence;
const L = buildLedger(p, cat);
const clone = (): Project => structuredClone(p);

describe("benefit timing", () => {
  it("starts avoided costs at their start month, not at go-live", () => {
    expect(L.months[8]!.benefitBy.avoided).toBe(0);
    expect(L.months[9]!.benefitBy.avoided).toBe(4000);
  });
  it("adds one-off benefits in their month only", () => {
    const q = clone();
    q.benefits.oneOff.push({ id: "grant", label: "Grant", amount: 25000, month: 12 });
    const L2 = buildLedger(q, cat);
    expect(L2.months[11]!.benefit - L.months[11]!.benefit).toBeCloseTo(25000, 6);
    expect(L2.months[12]!.benefit).toBeCloseTo(L.months[12]!.benefit, 6);
  });
  it("bills transition costs in their window and counts them from the maintenance basis up", () => {
    expect(L.months[6]!.byStream.transition).toBe(3000);
    expect(L.months[9]!.byStream.transition).toBe(0);
    expect(computeRoi(L, "runMaint").totalCost - computeRoi(L, "run").totalCost).toBeGreaterThan(9000 - 1);
  });
});

describe("growth, escalation and NPV", () => {
  it("grows usage and benefit year over year", () => {
    const y1 = L.months[12]!, y2 = L.months[24]!;
    expect(y2.byStream.run / y1.byStream.run).toBeCloseTo(1.1, 2);
  });
  it("discounts net cash with NPV below undiscounted net when net is back-loaded", () => {
    const r = computeRoi(L, "full", 8), r0 = computeRoi(L, "full", 0);
    expect(r0.npv).toBeCloseTo(r0.totalBenefit - r0.totalCost, 4);
    expect(r.npv).toBeLessThan(r0.npv);
  });
});

describe("cost allocation", () => {
  for (const basis of ["run", "runMaint", "full"] as const) {
    it(`reconciles to total cost on the ${basis} basis`, () => {
      const a = computeAllocation(p, L, basis);
      const allocated = a.capabilities.reduce((s, c) => s + c.cost, 0) + a.unallocated.cost;
      expect(allocated).toBeCloseTo(computeRoi(L, basis).totalCost, 4);
    });
  }
  it("reports unlinked workloads as unallocated", () => {
    const a = computeAllocation(p, L, "full");
    expect(a.unallocated.items.map((i) => i.componentId).sort()).toEqual(["ceval", "safety"]);
  });
  it("leaves everything unallocated when no capability is linked", () => {
    const q = clone();
    q.benefits.capabilities.forEach((c) => { c.workloadIds = []; c.workstreamIds = []; });
    const a = computeAllocation(q, buildLedger(q, cat), "full");
    expect(a.unallocated.reason).toBe("noLinks");
    expect(a.capabilities.every((c) => c.cost === 0)).toBe(true);
  });
});

describe("scenarios", () => {
  it("addresses list items by id in paths", () => {
    const q = clone();
    setPath(q, ["workloads", "chat", "modelId"], "gpt-5.4-mini");
    expect(q.workloads.find((w) => w.id === "chat")).toMatchObject({ modelId: "gpt-5.4-mini" });
  });
  it("compares baseline with each scenario", () => {
    const r = compareScenarios(p, cat);
    expect(r.map((x) => x.id)).toEqual(["baseline", "mini-chat", "lean-build", "half-usage"]);
    expect(r.every((x) => !x.error)).toBe(true);
    const [base, mini, lean] = r;
    expect(mini!.ledger.totals.runRate).toBeLessThan(base!.ledger.totals.runRate);
    expect(lean!.ledger.totals.build).toBeLessThan(base!.ledger.totals.build);
  });
  it("reports a scenario that points at something that no longer exists", () => {
    const q = clone();
    q.scenarios = [{ id: "bad", label: "Bad", edits: [{ kind: "set", path: ["workloads", "gone", "users"], value: 1 }] }];
    expect(compareScenarios(q, cat)[1]!.error).toMatch(/not found/);
    expect(() => applyScenario(q, q.scenarios[0]!, cat)).toThrow();
  });
});

describe("templates", () => {
  it("every new activity and workload validates and prices", () => {
    const q = clone();
    for (const k of ACTIVITY_KINDS) q.build.activities.push(newActivity(q, k.kind));
    for (const k of WORKLOAD_KINDS) q.workloads.push(newWorkload(q, k.kind));
    expect(ProjectSchema.safeParse(q).success).toBe(true);
    const L2 = buildLedger(q, cat);
    expect(L2.totals.devLab).toBeGreaterThan(L.totals.devLab);
    expect(L2.totals.runRate).toBeGreaterThan(L.totals.runRate);
    expect(new Set([...q.build.activities, ...q.workloads].map((x) => x.id)).size).toBe(q.build.activities.length + q.workloads.length);
  });
  it("adds a default harness when the project has none", () => {
    const q = clone();
    q.harnesses = [];
    q.build.activities = [];
    q.workloads = q.workloads.filter((w) => w.kind !== "agent");
    q.build.activities.push(newActivity(q, "bakeoff"));
    expect(q.harnesses).toHaveLength(1);
  });
  it("removing a workload unlinks it from capabilities", () => {
    const q = clone();
    removeWorkload(q, "chat");
    expect(q.benefits.capabilities.some((c) => c.workloadIds.includes("chat"))).toBe(false);
  });
});
