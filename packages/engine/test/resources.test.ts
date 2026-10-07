import { describe, expect, it } from "vitest";
import { loadCatalog, type Catalog, type ResourceType, type UnitPrice } from "@roi-calculator/catalog";
import { ProjectSchema, buildLedger, meetingIntelligence, resourceLines, PriceBook, type Project } from "../src/index.js";

/**
 * A minimal resource catalogue in test code, so these tests pin the engine's rules and do not move when the real catalogue
 * is refreshed: a VM type (Linux and Windows SKUs, reserved, Hybrid Benefit) and an App Service plan.
 */
const src = { kind: "derived" as const, note: "Test fixture.", retrievedAt: "2026-10-06" };
const unit = (id: string, price: number, extra: Partial<UnitPrice> = {}): UnitPrice => ({ id, label: id, platform: "azure", unit: "month (730 h)", price, source: src, confidence: "unverified", ...extra });
const FIXTURE_TYPES: ResourceType[] = [
  {
    id: "vm", label: "Virtual machine", category: "compute",
    inputs: [{ id: "count", label: "Machines", unit: "machines", help: "How many." }],
    meters: [{ id: "compute", label: "Compute", quantity: { input: "count" }, hourly: true, scalesWithSize: true }],
    options: ["payg", "ri1", "ri3", "ahb"],
    skus: [
      { id: "d4s-v5-linux", label: "D4s v5, Linux", attrs: { os: "linux" }, prices: { compute: "fx-vm-linux" } },
      { id: "d4s-v5-windows", label: "D4s v5, Windows", attrs: { os: "windows" }, prices: { compute: "fx-vm-windows" } },
    ],
  },
  {
    id: "app-service-plan", label: "App Service plan", category: "compute",
    inputs: [{ id: "instances", label: "Instances", unit: "instances", help: "How many." }],
    meters: [{ id: "plan", label: "Plan instances", quantity: { input: "instances" }, hourly: true, scalesWithSize: true }],
    options: ["payg", "ri1", "ri3"],
    skus: [{ id: "p1v3-linux", label: "P1v3, Linux", attrs: { os: "linux" }, prices: { plan: "fx-asp-linux" } }],
  },
];
const FIXTURE_UNITS: UnitPrice[] = [
  unit("fx-vm-linux", 200, { attrs: { "fallback.ahb": "Linux has no licence component, so Hybrid Benefit does not apply; pay-as-you-go used." }, options: { ri1: { price: 125, source: src }, ri3: { price: 80, source: src } } }),
  unit("fx-vm-windows", 390, { options: { ri1: { price: 315, source: src }, ri3: { price: 270, source: src }, ahb: { price: 200, source: src } } }),
  unit("fx-asp-linux", 160, { options: { ri1: { price: 120, source: src }, ri3: { price: 90, source: src } } }),
];
const real = loadCatalog();
const cat: Catalog = { ...real, resourceTypes: FIXTURE_TYPES, unitPrices: [...real.unitPrices.filter((u) => !real.resourceTypes.some((t) => t.skus.some((s) => Object.values(s.prices).includes(u.id)))), ...FIXTURE_UNITS] };
const B = meetingIntelligence.timeline.buildMonths;
const withResources = (resources: unknown[], c: Catalog = cat) => {
  const p = ProjectSchema.parse({ ...meetingIntelligence, resources }) as Project;
  return { p, ledger: buildLedger(p, c) };
};
const vm = (extra: object = {}) => ({ id: "r1", label: "App servers", typeId: "vm", skuId: "d4s-v5-linux", inputs: { count: 3 }, ...extra });
const lines = (ledger: ReturnType<typeof buildLedger>, m = B + 1) => ledger.months[m - 1]!.lines.filter((l) => l.componentId.startsWith("resource:"));

describe("resource pricing", () => {
  it("adds no lines when the project has no resources", () => {
    const base = buildLedger(meetingIntelligence, cat);
    const { ledger } = withResources([]);
    expect(ledger.months.map((m) => m.lines.length)).toEqual(base.months.map((m) => m.lines.length));
    expect(ledger.totals).toEqual(base.totals);
  });

  it("prices pay-as-you-go at quantity x price in production months only, as fixed run cost", () => {
    const { ledger } = withResources([vm()]);
    const l = lines(ledger)[0]!;
    expect(l.cost).toBeCloseTo(3 * 200, 6);
    expect(l.stream).toBe("run");
    expect(l.behaviour).toBe("fixed");
    expect(l.formula).toContain("3 ×");
    expect(l.formula).toContain("730/730");
    expect(l.formula).toContain("pay-as-you-go");
    expect(lines(ledger, 1)).toHaveLength(0);
    expect(lines(ledger, 36)[0]!.cost).toBeCloseTo(600, 6);
    const base = buildLedger(meetingIntelligence, cat);
    expect(ledger.months[B]!.byStream.run - base.months[B]!.byStream.run).toBeCloseTo(600, 6);
  });

  it("uses the reserved price for 1- and 3-year terms", () => {
    expect(lines(withResources([vm({ term: "ri1" })]).ledger)[0]!.cost).toBeCloseTo(3 * 125, 6);
    const l3 = lines(withResources([vm({ term: "ri3" })]).ledger)[0]!;
    expect(l3.cost).toBeCloseTo(3 * 80, 6);
    expect(l3.formula).toContain("3-year reserved");
  });

  it("falls back to pay-as-you-go with a note when a reserved price is missing", () => {
    const stripped: Catalog = { ...cat, unitPrices: cat.unitPrices.map((u) => (u.id === "fx-vm-linux" ? { ...u, options: undefined } : u)) };
    const { ledger } = withResources([vm({ term: "ri1" })], stripped);
    const l = lines(ledger)[0]!;
    expect(l.cost).toBeCloseTo(600, 6);
    expect(l.formula).toContain("no 1-year reserved price");
    expect(ledger.notes.some((n) => n.kind === "resource")).toBe(true);
  });

  it("uses the Hybrid Benefit price on a Windows VM, and falls back on Linux", () => {
    const win = { skuId: "d4s-v5-windows" };
    expect(lines(withResources([vm(win)]).ledger)[0]!.cost).toBeCloseTo(3 * 390, 6);
    const ahb = lines(withResources([vm({ ...win, ahb: true })]).ledger)[0]!;
    expect(ahb.cost).toBeCloseTo(3 * 200, 6);
    expect(ahb.formula).toContain("Hybrid Benefit");
    const linux = lines(withResources([vm({ ahb: true })]).ledger)[0]!;
    expect(linux.cost).toBeCloseTo(600, 6);
    expect(linux.formula).toContain("Hybrid Benefit does not apply");
  });

  it("lets a manual price beat the refreshed one and flags it", () => {
    const manual: Catalog = { ...cat, unitPrices: cat.unitPrices.map((u) => (u.id === "fx-asp-linux" ? { ...u, manual: { price: 100, note: "Enterprise agreement quote", retrievedAt: "2026-10-06" } } : u)) };
    const { ledger } = withResources([{ id: "plan", label: "Plan", typeId: "app-service-plan", skuId: "p1v3-linux", inputs: { instances: 2 } }], manual);
    expect(lines(ledger)[0]!.cost).toBeCloseTo(200, 6);
    expect(ledger.notes.find((n) => n.kind === "manual")?.message).toContain("Enterprise agreement quote");
    const refreshed = withResources([{ id: "plan", label: "Plan", typeId: "app-service-plan", skuId: "p1v3-linux", inputs: { instances: 2 } }]);
    expect(lines(refreshed.ledger)[0]!.cost).toBeCloseTo(320, 6);
  });

  it("scales hourly pay-as-you-go by hours and size, but not reserved", () => {
    const { p } = withResources([vm(), vm({ id: "r2", term: "ri1" })]);
    const out = resourceLines(p, new PriceBook(cat, p.settings), { hours: 220, sizeFactor: 0.5 });
    expect(out[0]!.cost).toBeCloseTo(3 * 200 * (220 / 730) * 0.5, 6);
    expect(out[1]!.cost).toBeCloseTo(3 * 125 * 0.5, 6);
  });

  it("skips a resource missing from the catalogue with a note", () => {
    const { ledger } = withResources([{ id: "x", label: "Gone", typeId: "nope", skuId: "nope", inputs: {} }]);
    expect(lines(ledger)).toHaveLength(0);
    expect(ledger.notes.some((n) => n.kind === "resource" && n.message.includes("Gone"))).toBe(true);
  });

  it("keeps envIds and parses a project with resources omitted", () => {
    const { p } = withResources([vm({ envIds: ["prod"] })]);
    expect(p.resources![0]!.envIds).toEqual(["prod"]);
    expect(p.resources![0]!.term).toBe("payg");
    expect(ProjectSchema.parse(meetingIntelligence).resources ?? []).toEqual([]);
  });
});
