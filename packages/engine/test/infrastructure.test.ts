import { describe, expect, it } from "vitest";
import { resourceFixtureCatalog } from "./fixtures/resource-catalog.js";
import { ProjectSchema, buildLedger, environmentCostRows, infrastructureSummary, meetingIntelligence, resourceCostRows, type Project } from "../src/index.js";

const cat = resourceFixtureCatalog();
const B = meetingIntelligence.timeline.buildMonths;
const vm = (extra: object = {}) => ({ id: "r1", label: "App servers", typeId: "vm", skuId: "d4s-v5-windows", inputs: { count: 2 }, ...extra });
const prod = { id: "prod", label: "Production", production: true };
const dev = { id: "dev", label: "Dev", sizeFactor: 0.5, schedule: { hoursPerDay: 10, daysPerMonth: 22 } };
const uat = { id: "uat", label: "UAT", fromMonth: 5, toMonth: 6 };

function setup(resources: unknown[], environments: unknown[]) {
  const p = ProjectSchema.parse({ ...meetingIntelligence, resources, environments }) as Project;
  return { p, ledger: buildLedger(p, cat) };
}

describe("infrastructure display helpers", () => {
  it("splits one resource by environment at the first billed month of each", () => {
    const { p, ledger } = setup([vm()], [prod, dev, uat]);
    const [row] = resourceCostRows(p, ledger);
    const by = Object.fromEntries(row!.perEnv.map((c) => [c.envId, c]));
    expect(by.dev!.monthly).toBeCloseTo(2 * 390 * 0.5 * (220 / 730), 6);
    expect(by.dev!.month).toBe(1);
    expect(by.uat!.monthly).toBeCloseTo(2 * 390, 6);
    expect(by.uat!.month).toBe(5);
    expect(by.prod!.monthly).toBeCloseTo(780, 6);
    expect(by.prod!.month).toBe(B + 1);
    expect(row!.monthly).toBeCloseTo(by.dev!.monthly + by.uat!.monthly + 780, 6);
  });

  it("respects envIds and shows the implicit production environment when none are defined", () => {
    const only = setup([vm({ envIds: ["dev"] })], [prod, dev]);
    expect(resourceCostRows(only.p, only.ledger)[0]!.perEnv.map((c) => c.envId)).toEqual(["dev"]);
    const none = setup([vm()], []);
    const row = resourceCostRows(none.p, none.ledger)[0]!;
    expect(row.perEnv).toHaveLength(1);
    expect(row.perEnv[0]).toMatchObject({ envId: null, production: true, monthly: 780 });
    expect(environmentCostRows(none.p, none.ledger)).toEqual([{ envId: null, label: "Production", production: true, monthly: 780, resourceIds: ["r1"] }]);
  });

  it("carries the engine's notes: reserved under a schedule, Hybrid Benefit fallback", () => {
    const reserved = setup([vm({ term: "ri1" })], [prod, dev]);
    expect(resourceCostRows(reserved.p, reserved.ledger)[0]!.notes.join(" ")).toContain("schedule does not lower");
    const linux = setup([vm({ skuId: "d4s-v5-linux", ahb: true })], [prod]);
    expect(resourceCostRows(linux.p, linux.ledger)[0]!.notes.join(" ")).toContain("Hybrid Benefit does not apply");
  });

  it("reports a resource whose SKU left the catalogue", () => {
    const { p, ledger } = setup([vm({ skuId: "gone" })], [prod]);
    const row = resourceCostRows(p, ledger)[0]!;
    expect(row.monthly).toBe(0);
    expect(row.notes.join(" ")).toContain("not in the catalogue");
  });

  it("summarises build, production and the production / non-production split", () => {
    const { p, ledger } = setup([vm()], [prod, dev, uat]);
    const s = infrastructureSummary(p, ledger);
    const devM = 2 * 390 * 0.5 * (220 / 730);
    expect(s.productionMonthly).toBeCloseTo(780, 6);
    expect(s.nonProductionMonthly).toBeCloseTo(devM + 780, 6);
    expect(s.buildTotal).toBeCloseTo(devM * B + 780 * 2, 6);
    expect(s.steadyMonthly).toBeCloseTo(780, 6);
    expect(s.planTotal).toBeGreaterThan(s.buildTotal);
  });

  it("is all zeros for a project without resources", () => {
    const { p, ledger } = setup([], []);
    expect(resourceCostRows(p, ledger)).toEqual([]);
    expect(infrastructureSummary(p, ledger)).toEqual({ buildTotal: 0, planTotal: 0, productionMonthly: 0, nonProductionMonthly: 0, steadyMonthly: 0 });
  });
});
