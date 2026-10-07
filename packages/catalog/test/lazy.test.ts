import { describe, expect, it } from "vitest";
import { RESOURCE_CATEGORIES, loadCatalog, loadCoreCatalog, loadResourceCategories, resourceCategoriesLoaded } from "../src/index.js";

describe("lazy resource categories", () => {
  it("the core catalogue has no resource types and no resource prices", () => {
    const core = loadCoreCatalog();
    expect(core.resourceTypes).toEqual([]);
    expect(core.unitPrices.length).toBeLessThan(loadCatalog().unitPrices.length);
  });

  it("loading every category gives exactly the complete synchronous catalogue", async () => {
    const full = loadCatalog();
    const core = loadCoreCatalog();
    await loadResourceCategories(core);
    expect(core.resourceTypes.map((t) => t.id).sort()).toEqual(full.resourceTypes.map((t) => t.id).sort());
    expect(core.unitPrices.map((u) => u.id).sort()).toEqual(full.unitPrices.map((u) => u.id).sort());
    expect([...resourceCategoriesLoaded(core)].sort()).toEqual([...RESOURCE_CATEGORIES].sort());
  });

  it("loads one category at a time, once, and tolerates concurrent and repeated calls", async () => {
    const core = loadCoreCatalog();
    await Promise.all([loadResourceCategories(core, ["messaging"]), loadResourceCategories(core, ["messaging", "network"])]);
    await loadResourceCategories(core, ["network"]);
    expect([...new Set(core.resourceTypes.map((t) => t.category))].sort()).toEqual(["messaging", "network"]);
    const ids = core.resourceTypes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
