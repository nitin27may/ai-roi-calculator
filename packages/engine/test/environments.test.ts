import { describe, expect, it } from "vitest";
import { type Catalog } from "@roi-calculator/catalog";
import { resourceFixtureCatalog } from "./fixtures/resource-catalog.js";
import { COST_BASES, ProjectSchema, basisCost, buildLedger, computeAllocation, costSplit, meetingIntelligence, monthRows, type Project } from "../src/index.js";

const cat = resourceFixtureCatalog();
const B = meetingIntelligence.timeline.buildMonths;
const vm = (extra: object = {}) => ({ id: "r1", label: "App servers", typeId: "vm", skuId: "d4s-v5-linux", inputs: { count: 3 }, ...extra });
const prod = { id: "prod", label: "Production", production: true };
const dev = { id: "dev", label: "Dev", sizeFactor: 0.5, schedule: { hoursPerDay: 10, daysPerMonth: 22 } };
const uat = { id: "uat", label: "UAT", fromMonth: 5, toMonth: 6 };

function setup(resources: unknown[], environments: unknown[], c: Catalog = cat, project: object = {}) {
  const base = meetingIntelligence;
  const p = ProjectSchema.parse({ ...base, build: { ...base.build, contingencyScope: "labour" }, resources, environments, ...project }) as Project;
  return { p, ledger: buildLedger(p, c) };
}
const res = (ledger: ReturnType<typeof buildLedger>, m: number, envId?: string) =>
  ledger.months[m - 1]!.lines.filter((l) => l.componentId.startsWith("resource:") && (!envId || l.id.endsWith(`:${envId}`)));
const baseline = buildLedger(meetingIntelligence, cat);

describe("environments", () => {
  it("dev at size 0.5 on 10 h x 22 d costs production x 0.5 x 220 / 730 in the env stream", () => {
    const { ledger } = setup([vm()], [prod, dev]);
    const l = res(ledger, 1, "dev")[0]!;
    expect(l.cost).toBeCloseTo(3 * 200 * 0.5 * (220 / 730), 6);
    expect(l.stream).toBe("env");
    expect(l.formula).toContain("220/730");
    const p = res(ledger, B + 1, "prod")[0]!;
    expect(p.cost).toBeCloseTo(600, 6);
    expect(p.stream).toBe("run");
    expect(res(ledger, 1, "prod")).toHaveLength(0);
    expect(res(ledger, B + 1, "dev")).toHaveLength(0);
  });

  it("reserved ignores the schedule (still scaled by size) and adds a note", () => {
    const { ledger } = setup([vm({ term: "ri1" })], [prod, dev]);
    expect(res(ledger, 1, "dev")[0]!.cost).toBeCloseTo(3 * 125 * 0.5, 6);
    expect(ledger.notes.some((n) => n.kind === "resource" && n.message.includes("schedule does not lower"))).toBe(true);
  });

  it("dev/test uses the dev/test price when present and falls back with a note when not", () => {
    const withDt: Catalog = {
      ...cat,
      resourceTypes: cat.resourceTypes.map((t) => (t.id === "vm" ? { ...t, options: [...t.options, "devtest" as const] } : t)),
      unitPrices: cat.unitPrices.map((u) => (u.id === "fx-vm-linux" ? { ...u, options: { ...u.options, devtest: { price: 120, source: u.source } } } : u)),
    };
    const env = { ...dev, pricing: "devtest" };
    const hit = setup([vm()], [prod, env], withDt);
    expect(res(hit.ledger, 1, "dev")[0]!.cost).toBeCloseTo(3 * 120 * 0.5 * (220 / 730), 6);
    expect(res(hit.ledger, 1, "dev")[0]!.formula).toContain("dev/test");
    const miss = setup([vm()], [prod, env]);
    expect(res(miss.ledger, 1, "dev")[0]!.cost).toBeCloseTo(3 * 200 * 0.5 * (220 / 730), 6);
    expect(miss.ledger.notes.some((n) => n.kind === "resource" && n.message.includes("dev/test"))).toBe(true);
  });

  it("empty environments equals production at 730 hours and adds no env stream", () => {
    const none = setup([vm()], []);
    const implicit = setup([vm()], undefined as unknown as unknown[]);
    expect(none.ledger.totals).toEqual(implicit.ledger.totals);
    expect(res(none.ledger, B + 1)[0]!.cost).toBeCloseTo(600, 6);
    expect(res(none.ledger, B + 1)[0]!.id).toBe("resource:r1:compute");
    expect(res(none.ledger, 1)).toHaveLength(0);
    expect("env" in none.ledger.months[0]!.byStream).toBe(false);
    expect(buildLedger(meetingIntelligence, cat).months.every((m) => !("env" in m.byStream))).toBe(true);
  });

  it("a single production environment at defaults matches the implicit one", () => {
    const one = setup([vm()], [prod]);
    expect(res(one.ledger, B + 1)[0]!.cost).toBeCloseTo(600, 6);
    expect(one.ledger.totals.runRate - baseline.totals.runRate).toBeCloseTo(600, 6);
  });

  it("fromMonth and toMonth bound the billed months; a missing bound is the edge of the default phase", () => {
    const { ledger } = setup([vm()], [prod, uat, { ...dev, id: "late", label: "Late", fromMonth: 3 }, { ...prod, id: "dr", label: "DR", fromMonth: 4 }]);
    const months = (id: string) => ledger.months.filter((m) => res(ledger, m.m, id).length > 0).map((m) => m.m);
    expect(months("uat")).toEqual([5, 6]);
    expect(months("late")).toEqual([3, 4, 5, 6]);
    expect(months("dr")[0]).toBe(4);
    expect(months("dr").at(-1)).toBe(36);
    expect(months("prod")[0]).toBe(B + 1);
  });

  it("envIds selects which environments a resource exists in; absent means all", () => {
    const { ledger } = setup([vm({ envIds: ["prod"] }), vm({ id: "r2", label: "Db", envIds: ["dev"] }), vm({ id: "r3", label: "Shared" })], [prod, dev]);
    const ids = (m: number) => res(ledger, m).map((l) => l.componentId).sort();
    expect(ids(1)).toEqual(["resource:r2", "resource:r3"]);
    expect(ids(B + 1)).toEqual(["resource:r1", "resource:r3"]);
  });

  it("env stream counts in totals.build during build months and in runRate when billed in production months", () => {
    const { ledger } = setup([vm()], [prod, dev, { ...uat, id: "perm", label: "Perm test", fromMonth: undefined, toMonth: undefined, production: false }]);
    const devM = 3 * 200 * 0.5 * (220 / 730);
    const permM = 3 * 200;
    expect(ledger.months[0]!.byStream.env).toBeCloseTo(devM + permM, 6);
    expect(ledger.totals.build - baseline.totals.build).toBeCloseTo(B * (devM + permM), 6);
    expect(ledger.totals.runRate - baseline.totals.runRate).toBeCloseTo(600, 6);

    const live = setup([vm()], [prod, { ...dev, toMonth: 36 }]);
    expect(live.ledger.totals.runRate - baseline.totals.runRate).toBeCloseTo(600 + devM, 6);
    expect(live.ledger.months[B]!.byStream.env).toBeCloseTo(devM, 6);
    expect(live.ledger.months[B]!.byStream.run - baseline.months[B]!.byStream.run).toBeCloseTo(600, 6);
  });

  it("UAT in months 5 and 6 only", () => {
    const { ledger } = setup([vm()], [prod, uat]);
    expect(ledger.months.map((m) => m.byStream.env ?? 0).slice(0, 8).map((v) => Math.round(v))).toEqual([0, 0, 0, 0, 600, 600, 0, 0]);
    expect(ledger.totals.build - baseline.totals.build).toBeCloseTo(1200, 6);
  });

  it("cost bases: run excludes env, runMaint and full include it", () => {
    const { ledger } = setup([vm()], [prod, { ...dev, toMonth: 36 }]);
    const devM = 3 * 200 * 0.5 * (220 / 730);
    const mo = ledger.months[B]!, b = baseline.months[B]!;
    expect(basisCost(mo, "run") - basisCost(b, "run")).toBeCloseTo(600, 6);
    expect(basisCost(mo, "runMaint") - basisCost(b, "runMaint")).toBeCloseTo(600 + devM, 6);
    expect(basisCost(mo, "full") - basisCost(b, "full")).toBeCloseTo(600 + devM, 6);
    expect(COST_BASES.find((x) => x.value === "run")!.hint).toContain("Non-production environments are not included");
    expect(COST_BASES.find((x) => x.value === "runMaint")!.hint).toContain("non-production environments");
  });

  it("allocation, cost split and the month rows include env", () => {
    const { p, ledger } = setup([vm()], [prod, uat]);
    const full = computeAllocation(p, ledger, "full");
    const base = computeAllocation(meetingIntelligence, baseline, "full");
    expect(full.sharedPool - base.sharedPool).toBeCloseTo(1200, 6);
    expect(computeAllocation(p, ledger, "run").sharedPool).toBeCloseTo(computeAllocation(meetingIntelligence, baseline, "run").sharedPool, 6);
    const split = costSplit(ledger);
    expect(split.find((x) => x.key === "build")!.value - costSplit(baseline).find((x) => x.key === "build")!.value).toBeCloseTo(1200, 6);
    const rows = monthRows(ledger, { basis: "full", cumulative: ledger.months.map(() => 0) } as never);
    expect(rows[4]!.Environments).toBe(600);
    expect(rows[0]!.Environments).toBe(0);
  });

  it("environments never apply the AI dev-cost cut to infrastructure", () => {
    const { ledger } = setup([vm()], [prod, uat], cat, { roi: { ...meetingIntelligence.roi, devCutPct: 50 } });
    expect(ledger.months[4]!.byStream.env).toBeCloseTo(600, 6);
  });
});
