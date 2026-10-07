import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PriceMatchError, one, preciseSmall, retailSource, type RetailRow, type RowSource } from "../retail.js";
import { exitCodeFor, refreshResources, report, unitFactor, type Ctx } from "../resources.js";
import { buildFiles } from "../resource-scaffold.js";
import { ResourceFile } from "../../../packages/catalog/src/schema.js";

type Json = Record<string, any>;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/resource-rows.json", import.meta.url), "utf8")) as { cad: Record<string, RetailRow[]>; usd: Record<string, RetailRow[]> };
const fromFixture = (rows: Record<string, RetailRow[]>): RowSource => async (filter) => rows[filter] ?? [];
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ source: fromFixture(fixture.cad), usd: fromFixture(fixture.usd), usdToCad: 1.4166, region: "canadacentral", today: "2026-10-07", ...over });

/** A copy of one real type from the scaffold with only the SKUs the fixture has rows for. */
function slice(category: string, typeId: string, skuIds: string[]): Json {
  const file = buildFiles()[category]!;
  const type = file.types.find((t: Json) => t.id === typeId)!;
  return { category, types: [{ ...type, skus: type.skus.filter((s: Json) => skuIds.includes(s.id)) }], unitPrices: [] };
}
const unit = (file: Json, id: string): Json => file.unitPrices.find((u: Json) => u.id === id)!;

const row = (o: Partial<RetailRow>): RetailRow => ({ currencyCode: "CAD", retailPrice: 1, armRegionName: "canadacentral", productName: "P", skuName: "S", meterName: "M", serviceName: "X", unitOfMeasure: "1 Hour", tierMinimumUnits: 0, type: "Consumption", ...o });

describe("retailSource price types", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = () => vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ Items: [row({ type: "Consumption", retailPrice: 1 }), row({ type: "Reservation", reservationTerm: "1 Year", retailPrice: 1200 }), row({ type: "DevTestConsumption", retailPrice: 0.5 })], NextPageLink: null }) }));

  it("keeps only Consumption rows by default, so today's output does not change", async () => {
    stub();
    const rows = await retailSource()("serviceName eq 'X'");
    expect(rows.map((r) => r.type)).toEqual(["Consumption"]);
  });
  it("keeps the requested types and the reservation term", async () => {
    stub();
    const rows = await retailSource({ types: ["Consumption", "Reservation", "DevTestConsumption"] })("serviceName eq 'X'");
    expect(rows.map((r) => r.type)).toEqual(["Consumption", "Reservation", "DevTestConsumption"]);
    expect(rows[1]!.reservationTerm).toBe("1 Year");
  });
});

describe("matching by type, term and tier", () => {
  const rows = [
    row({ meterName: "m", retailPrice: 0.3 }),
    row({ meterName: "m", type: "Reservation", reservationTerm: "1 Year", retailPrice: 1800 }),
    row({ meterName: "m", type: "Reservation", reservationTerm: "3 Years", retailPrice: 3000 }),
    row({ meterName: "m", type: "DevTestConsumption", retailPrice: 0 }),
    row({ meterName: "t", tierMinimumUnits: 0, retailPrice: 0 }), row({ meterName: "t", tierMinimumUnits: 100, retailPrice: 0.02 }),
  ];
  it("picks one price per type and reservation term", () => {
    expect(one(rows, { meterName: "^m$", type: "Consumption" }).retailPrice).toBe(0.3);
    expect(one(rows, { meterName: "^m$", type: "Reservation", reservationTerm: "3 Years" }).retailPrice).toBe(3000);
  });
  it("accepts a zero price only when asked (dev/test and licence meters)", () => {
    expect(() => one(rows, { meterName: "^m$", type: "DevTestConsumption" })).toThrow(PriceMatchError);
    expect(one(rows, { meterName: "^m$", type: "DevTestConsumption", allowZero: true }).retailPrice).toBe(0);
  });
  it("takes the first paid tier", () => {
    expect(one(rows, { meterName: "^t$", firstPaidTier: true }).retailPrice).toBe(0.02);
  });
  it("tells ambiguous from missing", () => {
    const two = [row({ meterName: "a", retailPrice: 1 }), row({ meterName: "a", productName: "Other", retailPrice: 2 })];
    expect(() => one(two, { meterName: "^a$" })).toThrow(expect.objectContaining({ count: 2 }));
    expect(() => one(two, { meterName: "^zzz$" })).toThrow(expect.objectContaining({ count: 0 }));
  });
});

describe("units and precision", () => {
  it("converts hourly units to a 730 hour month and daily units to 30.4 days", () => {
    expect(unitFactor("1 Hour")).toEqual({ factor: 730, hourly: true });
    expect(unitFactor("1 GiB/Hour")).toEqual({ factor: 730, hourly: true });
    expect(unitFactor("1/Day").factor).toBeCloseTo(30.4167, 3);
    expect(unitFactor("1 GB/Month")).toEqual({ factor: 1, hourly: false });
    expect(() => unitFactor("1 Second")).toThrow(PriceMatchError);
  });
  it("replaces small CAD prices with the USD twin times the rate and leaves larger ones", () => {
    const cad = [row({ meterId: "a", retailPrice: 0.0001 }), row({ meterId: "b", retailPrice: 12.5 })];
    const usd = [row({ meterId: "a", currencyCode: "USD", retailPrice: 0.0000368 }), row({ meterId: "b", currencyCode: "USD", retailPrice: 8 })];
    const out = preciseSmall(cad, usd, 1.4166);
    expect(out[0]!.retailPrice).toBeCloseTo(0.0000368 * 1.4166, 10);
    expect(out[1]!.retailPrice).toBe(12.5);
  });
});

describe("refreshResources on recorded rows", () => {
  const vmFile = () => slice("compute", "vm", ["d4s-v5-linux", "d4s-v5-windows", "b2ms-linux", "b2ms-windows"]);

  it("prices pay-as-you-go per month, picking the Windows or Linux product by name", async () => {
    const file = vmFile();
    const r = await refreshResources([file], ctx());
    expect(r.types[0]).toMatchObject({ typeId: "vm", priced: 4, ambiguous: [], errors: [] });
    expect(unit(file, "vm-d4s-v5-linux-compute").price).toBeCloseTo(0.3031 * 730, 2);
    expect(unit(file, "vm-d4s-v5-windows-compute").price).toBeCloseTo(0.5638 * 730, 2);
    const src = unit(file, "vm-d4s-v5-windows-compute").source;
    expect(src).toMatchObject({ kind: "azure-retail-api", meterName: "D4s v5", retrievedAt: "2026-10-07" });
    expect(src.filter).toContain("armSkuName eq 'Standard_D4s_v5'");
    expect(ResourceFile.safeParse({ ...file, types: file.types }).success).toBe(true);
  });

  it("converts the reservation total to a monthly price: total / (12 x years)", async () => {
    const file = vmFile();
    await refreshResources([file], ctx());
    const lin = unit(file, "vm-d4s-v5-linux-compute");
    expect(lin.options.ri1.price).toBeCloseTo(1638.9484 / 12, 3);
    expect(lin.options.ri3.price).toBeCloseTo(3146.1576 / 36, 3);
    expect(lin.options.ri1.source).toMatchObject({ kind: "azure-retail-api", meterName: "D4s v5" });
  });

  it("prices a Windows reservation as the Linux reservation plus the Windows licence at pay-as-you-go", async () => {
    const file = vmFile();
    await refreshResources([file], ctx());
    const win = unit(file, "vm-d4s-v5-windows-compute");
    const uplift = (0.5638 - 0.3031) * 730;
    expect(win.options.ri1.price).toBeCloseTo(1638.9484 / 12 + uplift, 2);
    expect(win.options.ri1.source.kind).toBe("derived");
  });

  it("gives a Windows VM the Linux price for Hybrid Benefit and a Linux VM a fallback note", async () => {
    const file = vmFile();
    await refreshResources([file], ctx());
    expect(unit(file, "vm-d4s-v5-windows-compute").options.ahb.price).toBeCloseTo(0.3031 * 730, 2);
    const lin = unit(file, "vm-d4s-v5-linux-compute");
    expect(lin.options.ahb).toBeUndefined();
    expect(lin.attrs["fallback.ahb"]).toContain("Linux has no licence component");
  });

  it("parses DevTestConsumption rows and falls back to pay-as-you-go with a note when there is none", async () => {
    const file = vmFile();
    await refreshResources([file], ctx());
    expect(unit(file, "vm-d4s-v5-windows-compute").options.devtest.price).toBeCloseTo(0.3031 * 730, 2);
    expect(unit(file, "vm-d4s-v5-linux-compute").options.devtest).toBeUndefined();
    expect(unit(file, "vm-d4s-v5-linux-compute").attrs["fallback.devtest"]).toContain("pay-as-you-go");
  });

  it("leaves reserved options out with a note where Azure sells no reservation (B-series)", async () => {
    const file = vmFile();
    const r = await refreshResources([file], ctx());
    const b = unit(file, "vm-b2ms-linux-compute");
    expect(b.options?.ri1).toBeUndefined();
    expect(b.attrs["fallback.ri1"]).toContain("No 1-year reserved price");
    expect(Object.keys(r.types[0]!.missing).some((k) => k.startsWith("ri1:"))).toBe(true);
  });

  it("keeps a manual price and the entry's other fields when it refreshes", async () => {
    const file = vmFile();
    file.unitPrices.push({ id: "vm-d4s-v5-linux-compute", label: "kept label", platform: "azure", unit: "x", price: 1, manual: { price: 99, note: "EA quote", retrievedAt: "2026-10-01" }, source: { kind: "manual", retrievedAt: "2026-10-01" }, confidence: "unverified" });
    await refreshResources([file], ctx());
    const u = unit(file, "vm-d4s-v5-linux-compute");
    expect(u.manual).toEqual({ price: 99, note: "EA quote", retrievedAt: "2026-10-01" });
    expect(u.label).toBe("kept label");
    expect(u.price).toBeCloseTo(0.3031 * 730, 2);
  });

  it("prices App Service Windows and Linux plans from their own products, with reserved and dev/test", async () => {
    const file = slice("compute", "app-service-plan", ["p1v3-linux", "p1v3-windows", "b1-linux"]);
    const r = await refreshResources([file], ctx());
    expect(r.types[0]).toMatchObject({ priced: 3, errors: [], ambiguous: [] });
    const l = unit(file, "app-service-plan-p1v3-linux-plan"), w = unit(file, "app-service-plan-p1v3-windows-plan");
    expect(l.price).toBeCloseTo(0.238 * 730, 2);
    expect(w.price).toBeCloseTo(0.4646 * 730, 2);
    expect(l.options.ri3.price).toBeCloseTo(2830.2669 / 36, 3);
    expect(w.options.devtest.price).toBeCloseTo(0.1785 * 730, 2);
  });

  it("prices a SQL Server licence per vCPU from the 64 vCPU meter, free with Hybrid Benefit and dev/test", async () => {
    const file = slice("database", "sql-server-licence", ["standard"]);
    await refreshResources([file], ctx());
    const u = unit(file, "sql-server-licence-standard-licence");
    expect(u.price).toBeCloseTo((9.0659 / 64) * 730, 2);
    expect(u.options.ahb.price).toBe(0);
    expect(u.options.devtest.price).toBe(0);
  });

  it("prices SQL vCore compute with reserved terms and marks the storage meter as not reserved by design", async () => {
    const file = slice("database", "sql-db-vcore", ["gp-gen5"]);
    const r = await refreshResources([file], ctx());
    const c = unit(file, "sql-db-vcore-gp-gen5-compute"), s = unit(file, "sql-db-vcore-gp-gen5-storage");
    expect(c.options.ri1.price).toBeCloseTo(1473.212 / 12, 3);
    expect(s.price).toBeCloseTo(0.1792, 4);
    expect(s.attrs["fallback.ri1"]).toContain("Not offered");
    expect(r.types[0]!.designed).toBeGreaterThan(0);
  });

  it("sums parts and takes tiny per-unit prices from USD (Container Instances)", async () => {
    const file = slice("compute", "container-instances", ["standard"]);
    await refreshResources([file], ctx());
    expect(unit(file, "container-instances-standard-memory").price).toBeCloseTo(0.0069 * 730, 0);
    expect(unit(file, "container-instances-standard-vcpu").price).toBeGreaterThan(40);
  });

  it("takes the USD list price times the rate when no CAD meter exists, and says so", async () => {
    const file = vmFile();
    const usdRows = fromFixture({ ...fixture.cad, [Object.keys(fixture.cad)[0]!]: fixture.cad[Object.keys(fixture.cad)[0]!]!.map((r) => ({ ...r, currencyCode: "USD", retailPrice: r.retailPrice / 1.5 })) });
    const first = Object.keys(fixture.cad)[0]!;
    await refreshResources([file], ctx({ source: fromFixture({ ...fixture.cad, [first]: [] }), usd: usdRows, usdToCad: 1.5 }));
    const u = unit(file, "vm-b2ms-linux-compute");
    expect(u.source.kind).toBe("derived");
    expect(u.source.note).toContain("USD list price x 1.5");
  });
});

describe("ambiguity", () => {
  const typeJson = (): Json => ({
    category: "compute",
    types: [{
      id: "t", label: "T", category: "compute", inputs: [{ id: "n", label: "N", unit: "n", help: "h" }],
      meters: [{ id: "m", label: "M", quantity: { input: "n" }, hourly: true, scalesWithSize: true }], options: ["payg", "ri1"],
      retail: { filter: "serviceName eq 'X' and armRegionName eq '{region}'", productName: "^P", meters: { m: { meterName: "^M$" } } },
      skus: [{ id: "a", label: "A", attrs: {}, prices: { m: "t-a-m" } }, { id: "b", label: "B", attrs: {}, prices: { m: "t-b-m" } }],
    }],
    unitPrices: [],
  });
  const filter = "serviceName eq 'X' and armRegionName eq 'canadacentral'";

  it("reports more than one distinct price, writes nothing for it and fails the check", async () => {
    const file = typeJson();
    const rows = [row({ productName: "P one", retailPrice: 0.1 }), row({ productName: "P two", retailPrice: 0.2 })];
    const r = await refreshResources([file], ctx({ source: async () => rows }));
    expect(r.types[0]!.ambiguous).toHaveLength(2);
    expect(r.types[0]!.ambiguous[0]).toContain("a/m");
    expect(file.unitPrices).toHaveLength(0);
    expect(exitCodeFor(r)).toBe(1);
    expect(report(r, "2026-10-07", "canadacentral")).toContain("Ambiguous");
  });

  it("treats identical duplicate rows as one match", async () => {
    const file = typeJson();
    const rows = [row({ retailPrice: 0.1 }), row({ retailPrice: 0.1, meterId: "other-id" })];
    const r = await refreshResources([file], ctx({ source: async (f) => (f === filter ? rows : []) }));
    expect(r.types[0]!.ambiguous).toEqual([]);
    expect(unit(file, "t-a-m").price).toBeCloseTo(73, 6);
    expect(exitCodeFor(r)).toBe(0);
  });

  it("flags a ambiguous option without blocking the pay-as-you-go price", async () => {
    const file = typeJson();
    const rows = [row({ retailPrice: 0.1 }), row({ type: "Reservation", reservationTerm: "1 Year", productName: "P one", retailPrice: 600 }), row({ type: "Reservation", reservationTerm: "1 Year", productName: "P two", retailPrice: 700 })];
    const r = await refreshResources([file], ctx({ source: async () => rows }));
    expect(unit(file, "t-a-m").price).toBeCloseTo(73, 6);
    expect(r.types[0]!.ambiguous.some((a) => a.includes("ri1"))).toBe(true);
    expect(unit(file, "t-a-m").attrs["fallback.ri1"]).toContain("Several Retail API meters match");
  });

  it("fails when a pay-as-you-go price has no row", async () => {
    const r = await refreshResources([typeJson()], ctx({ source: async () => [] }));
    expect(r.types[0]!.errors).toHaveLength(2);
    expect(exitCodeFor(r)).toBe(1);
  });
});
