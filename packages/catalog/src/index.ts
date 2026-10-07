import type { Catalog } from "./schema.js";
import { buildCatalog } from "./core.js";
import { RESOURCE_FILES } from "./resource-data.js";

export * from "./schema.js";
export { heuristics } from "./heuristics.js";
export type { Heuristics } from "./heuristics.js";
export { buildCatalog, loadCoreCatalog, parseResourceFile } from "./core.js";
export { RESOURCE_LOADERS, hydrateResources, resourceCategoriesLoaded, loadResourceCategories } from "./lazy.js";

/** Parse and validate the complete bundled catalogue, resources included (synchronous: for the engine, tests and CI). Throws with a path-based message on bad data. */
export function loadCatalog(): Catalog {
  return buildCatalog(RESOURCE_FILES);
}
