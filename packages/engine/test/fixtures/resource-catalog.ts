import { loadCatalog, type Catalog, type ResourceType, type UnitPrice } from "@roi-calculator/catalog";

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
/** The real catalogue with its resource types and prices replaced by the fixture above. */
export function resourceFixtureCatalog(real: Catalog = loadCatalog()): Catalog {
  return { ...real, resourceTypes: FIXTURE_TYPES, unitPrices: [...real.unitPrices.filter((u) => !real.resourceTypes.some((t) => t.skus.some((s) => Object.values(s.prices).includes(u.id)))), ...FIXTURE_UNITS] };
}
