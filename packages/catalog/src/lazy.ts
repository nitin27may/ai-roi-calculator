import type { Catalog, ResourceCategory } from "./schema.js";
import { RESOURCE_CATEGORIES } from "./schema.js";
import { parseResourceFile } from "./core.js";

/** One dynamic import per category, so a bundler puts each file in its own chunk. */
export const RESOURCE_LOADERS: Record<ResourceCategory, () => Promise<unknown>> = {
  compute: () => import("../data/resources/compute.json", { with: { type: "json" } }).then((m) => m.default),
  database: () => import("../data/resources/database.json", { with: { type: "json" } }).then((m) => m.default),
  storage: () => import("../data/resources/storage.json", { with: { type: "json" } }).then((m) => m.default),
  messaging: () => import("../data/resources/messaging.json", { with: { type: "json" } }).then((m) => m.default),
  network: () => import("../data/resources/network.json", { with: { type: "json" } }).then((m) => m.default),
  security: () => import("../data/resources/security.json", { with: { type: "json" } }).then((m) => m.default),
  monitoring: () => import("../data/resources/monitoring.json", { with: { type: "json" } }).then((m) => m.default),
  data: () => import("../data/resources/data.json", { with: { type: "json" } }).then((m) => m.default),
  licences: () => import("../data/resources/licences.json", { with: { type: "json" } }).then((m) => m.default),
};

const loaded = new WeakMap<Catalog, Set<ResourceCategory>>();
const pending = new WeakMap<Catalog, Map<ResourceCategory, Promise<void>>>();

export const resourceCategoriesLoaded = (catalog: Catalog): ReadonlySet<ResourceCategory> => loaded.get(catalog) ?? new Set();

/**
 * Adds the given categories to a catalogue built with `loadCoreCatalog()`, in place, so every holder of the object sees the
 * resource types and their unit prices. Safe to call twice for a category. Resolves when all requested categories are in.
 */
export async function loadResourceCategories(catalog: Catalog, categories: readonly ResourceCategory[] = RESOURCE_CATEGORIES): Promise<void> {
  const wip = pending.get(catalog) ?? new Map<ResourceCategory, Promise<void>>();
  pending.set(catalog, wip);
  await Promise.all(categories.map((c) => {
    if (loaded.get(catalog)?.has(c)) return undefined;
    if (!wip.has(c)) wip.set(c, RESOURCE_LOADERS[c]().then((raw) => hydrateResources(catalog, [raw])));
    return wip.get(c);
  }));
}

/** Adds already-loaded resource category files to the catalogue (in place). Categories already present are skipped. */
export function hydrateResources(catalog: Catalog, files: readonly unknown[]): void {
  const done = loaded.get(catalog) ?? new Set<ResourceCategory>();
  loaded.set(catalog, done);
  for (const raw of files) {
    const file = parseResourceFile(raw);
    if (done.has(file.category)) continue;
    const have = new Set(catalog.unitPrices.map((u) => u.id));
    const clash = file.unitPrices.filter((u) => have.has(u.id)).map((u) => u.id);
    if (clash.length) throw new Error(`Duplicate catalogue ids: ${clash.join(", ")}`);
    catalog.unitPrices.push(...file.unitPrices);
    catalog.resourceTypes.push(...file.types);
    done.add(file.category);
  }
}
