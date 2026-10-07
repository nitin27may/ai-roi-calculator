import { describe, expect, it } from "vitest";
import { exitCodeFor, refreshResources, refreshVendorDoc, type Ctx } from "../resources.js";
import { buildFiles } from "../resource-scaffold.js";
import { ResourceFile } from "../../../packages/catalog/src/schema.js";
import type { RetailRow } from "../retail.js";

type Json = Record<string, any>;
const row = (o: Partial<RetailRow>): RetailRow => ({ currencyCode: "CAD", retailPrice: 1, armRegionName: "canadacentral", productName: "P", skuName: "S", meterName: "M", serviceName: "X", unitOfMeasure: "1 Hour", tierMinimumUnits: 0, type: "Consumption", ...o });
const ctxOf = (rows: RetailRow[]): Ctx => ({ source: async () => rows, usdToCad: 1.41655, region: "canadacentral", today: "2026-10-07" });

/** One real type from the scaffold, trimmed to the SKUs the recorded rows cover. */
function slice(category: string, typeId: string, skuIds: string[]): Json {
  const type = buildFiles()[category]!.types.find((t: Json) => t.id === typeId)!;
  return { category, types: [{ ...type, skus: type.skus.filter((s: Json) => skuIds.includes(s.id)) }], unitPrices: [] };
}
const unit = (file: Json, id: string): Json => file.unitPrices.find((u: Json) => u.id === id)!;

// Rows recorded from the Retail API (canadacentral, CAD) on 2026-10-06.
const SB = (o: Partial<RetailRow>) => row({ serviceName: "Service Bus", productName: "Service Bus", ...o });
const serviceBusRows = [
  SB({ skuName: "Basic", meterName: "Basic Messaging Operations", unitOfMeasure: "1M", retailPrice: 0.0708 }),
  SB({ skuName: "Standard", meterName: "Standard Base Unit", unitOfMeasure: "1/Month", retailPrice: 14.1655 }),
  SB({ skuName: "Standard", meterName: "Standard Base Unit", unitOfMeasure: "1/Hour", retailPrice: 0.019 }),
  SB({ skuName: "Standard", meterName: "Standard Messaging Operations", unitOfMeasure: "1M", retailPrice: 0 }),
  SB({ skuName: "Standard", meterName: "Standard Messaging Operations", unitOfMeasure: "1M", tierMinimumUnits: 13, retailPrice: 1.1332 }),
  SB({ skuName: "Standard", meterName: "Standard Messaging Operations", unitOfMeasure: "1M", tierMinimumUnits: 100, retailPrice: 0.7083 }),
  SB({ skuName: "Premium", meterName: "Premium Messaging Unit", unitOfMeasure: "1/Hour", retailPrice: 1.3139 }),
];

describe("catalogue part 2 refresh patterns", () => {
  it("separates a monthly row from an hourly row of the same meter name, takes the first paid tier and frees what does not apply", async () => {
    const file = slice("messaging", "service-bus", ["basic", "standard", "premium"]);
    const r = await refreshResources([file], ctxOf(serviceBusRows));
    expect(exitCodeFor(r)).toBe(0);
    expect(unit(file, "service-bus-standard-base").price).toBe(14.1655);
    expect(unit(file, "service-bus-standard-ops").price).toBe(1.1332);
    expect(unit(file, "service-bus-premium-mu").price).toBe(959.147);
    expect(unit(file, "service-bus-basic-base")).toMatchObject({ price: 0, attrs: { free: true } });
    expect(ResourceFile.safeParse(file).success).toBe(true);
  });

  it("multiplies by a SKU attribute and takes the reserved price from another product (Fabric)", async () => {
    const file = slice("data", "fabric-capacity", ["f2", "f64"]);
    const rows = [
      row({ serviceName: "Microsoft Fabric", productName: "Fabric Capacity", skuName: "Power BI Capacity Usage", meterName: "Power BI Capacity Usage CU", retailPrice: 0.2833 }),
      row({ serviceName: "Microsoft Fabric", productName: "Fabric Capacity Reservation", skuName: "Fabric Capacity", meterName: "Fabric Capacity CU", type: "Reservation", reservationTerm: "1 Year", retailPrice: 1476.0451 }),
    ];
    const r = await refreshResources([file], ctxOf(rows));
    expect(exitCodeFor(r)).toBe(0);
    expect(unit(file, "fabric-capacity-f2-capacity").price).toBeCloseTo(2 * 0.2833 * 730, 2);
    expect(unit(file, "fabric-capacity-f64-capacity").price).toBeCloseTo(64 * 0.2833 * 730, 1);
    expect(unit(file, "fabric-capacity-f2-capacity").options.ri1.price).toBeCloseTo((2 * 1476.0451) / 12, 2);
    expect(unit(file, "fabric-capacity-f2-capacity").options.ri3).toBeUndefined(); // the 3-year row is not offered
  });

  it("keeps a per-hour usage price per hour instead of scaling it to a month (DBU-hours)", async () => {
    const file = slice("data", "databricks-dbu", ["premium-jobs", "premium-all-purpose"]);
    const rows = [
      row({ serviceName: "Azure Databricks", productName: "Azure Databricks", skuName: "Premium Jobs Compute", meterName: "Premium Jobs Compute DBU", retailPrice: 0.425 }),
      row({ serviceName: "Azure Databricks", productName: "Azure Databricks", skuName: "Premium All-purpose Compute", meterName: "Premium All-purpose Compute DBU", retailPrice: 0.7791 }),
      row({ serviceName: "Azure Databricks", productName: "Azure Databricks", skuName: "Premium All-Purpose Photon", meterName: "Premium All-Purpose Photon DBU", retailPrice: 0.7791 }),
    ];
    const r = await refreshResources([file], ctxOf(rows));
    expect(exitCodeFor(r)).toBe(0);
    expect(unit(file, "databricks-dbu-premium-jobs-dbu")).toMatchObject({ price: 0.425, unit: "1 Hour" });
  });

  it("leaves a price that lives in unit-prices.json alone and reports an ambiguous match instead of choosing", async () => {
    const file = slice("messaging", "apim-gateway", ["developer", "basic"]);
    const rows = [row({ serviceName: "API Management", productName: "API Management", skuName: "Basic", meterName: "Basic Unit", retailPrice: 0.2856 })];
    const r = await refreshResources([file], ctxOf(rows), undefined, new Set(["apim-developer"]));
    expect(file.unitPrices.map((u: Json) => u.id)).toEqual(["apim-gateway-basic-units"]);
    expect(unit(file, "apim-gateway-basic-units").price).toBeCloseTo(0.2856 * 730, 2);
    const twice = [...rows, row({ serviceName: "API Management", productName: "API Management", skuName: "Basic", meterName: "Basic Unit", retailPrice: 0.3 })];
    const file2 = slice("messaging", "apim-gateway", ["basic"]);
    const r2 = await refreshResources([file2], ctxOf(twice));
    expect(exitCodeFor(r)).toBe(0);
    expect(exitCodeFor(r2)).toBe(1);
    expect(file2.unitPrices).toEqual([]);
  });

  it("moves a vendor-doc seat price with the FX rate", () => {
    const file = buildFiles().security!;
    const before = unit(file, "entra-id-p1-users");
    expect(before).toMatchObject({ confidence: "unverified", attrs: { usdList: 7 }, source: { kind: "vendor-doc" } });
    const changes = refreshVendorDoc([file], 1.5);
    expect(unit(file, "entra-id-p1-users").price).toBe(10.5);
    expect(changes.some((c) => c.id === "entra-id-p1-users")).toBe(true);
    expect(unit(file, "entra-id-p1-users").source.note).toContain("x 1.5 (USD");
  });
});
