import compute from "../data/resources/compute.json" with { type: "json" };
import database from "../data/resources/database.json" with { type: "json" };
import storage from "../data/resources/storage.json" with { type: "json" };
import messaging from "../data/resources/messaging.json" with { type: "json" };
import network from "../data/resources/network.json" with { type: "json" };
import security from "../data/resources/security.json" with { type: "json" };
import monitoring from "../data/resources/monitoring.json" with { type: "json" };
import data from "../data/resources/data.json" with { type: "json" };
import licences from "../data/resources/licences.json" with { type: "json" };

/**
 * Every resource category file, statically imported. Only `loadCatalog()` uses this, so a bundle that imports
 * `loadCoreCatalog` and `lazy.ts` alone does not carry the resource JSON in its main chunk.
 * Adding a category is one import here, one line in `lazy.ts`, and the category name in the schema enum.
 */
export const RESOURCE_FILES: unknown[] = [compute, database, storage, messaging, network, security, monitoring, data, licences];
