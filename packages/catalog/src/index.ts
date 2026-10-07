import meta from "../data/meta.json" with { type: "json" };
import chatModels from "../data/chat-models.json" with { type: "json" };
import embeddingModels from "../data/embedding-models.json" with { type: "json" };
import speechEngines from "../data/speech-engines.json" with { type: "json" };
import realtimeModels from "../data/realtime-models.json" with { type: "json" };
import ptu from "../data/ptu.json" with { type: "json" };
import searchTiers from "../data/search-tiers.json" with { type: "json" };
import unitPrices from "../data/unit-prices.json" with { type: "json" };
import snowflake from "../data/snowflake.json" with { type: "json" };
import benchmarks from "../data/benchmarks.json" with { type: "json" };
import compute from "../data/resources/compute.json" with { type: "json" };
import database from "../data/resources/database.json" with { type: "json" };
import storage from "../data/resources/storage.json" with { type: "json" };
import { Catalog, ResourceFile } from "./schema.js";

export * from "./schema.js";
export { heuristics } from "./heuristics.js";
export type { Heuristics } from "./heuristics.js";

/**
 * One entry per file in `data/resources/`, named by category. Adding a category is one import and one line here;
 * lazy per-category loading comes later and can replace this list without changing the file format.
 */
const RESOURCE_FILES: unknown[] = [compute, database, storage];

function loadResourceFiles(): { types: ResourceFile["types"]; unitPrices: ResourceFile["unitPrices"] } {
  const types: ResourceFile["types"] = [];
  const unitPrices: ResourceFile["unitPrices"] = [];
  for (const raw of RESOURCE_FILES) {
    const parsed = ResourceFile.safeParse(raw);
    if (!parsed.success) {
      const lines = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Resource catalogue is invalid:\n${lines.join("\n")}`);
    }
    const wrong = parsed.data.types.filter((t) => t.category !== parsed.data.category);
    if (wrong.length) throw new Error(`Resource types in the ${parsed.data.category} file have another category: ${wrong.map((t) => t.id).join(", ")}`);
    types.push(...parsed.data.types);
    unitPrices.push(...parsed.data.unitPrices);
  }
  return { types, unitPrices };
}

/** Parse and validate the bundled catalogue. Throws with a path-based message on bad data. */
export function loadCatalog(): Catalog {
  const resources = loadResourceFiles();
  const parsed = Catalog.safeParse({ meta, chatModels, embeddingModels, speechEngines, realtimeModels, ptu, searchTiers, unitPrices: [...unitPrices, ...resources.unitPrices], resourceTypes: resources.types, snowflake, benchmarks });
  if (!parsed.success) {
    const lines = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Price catalogue is invalid:\n${lines.join("\n")}`);
  }
  const cat = parsed.data;
  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  const d = [
    ...dupes(cat.chatModels.map((m) => m.id)),
    ...dupes(cat.embeddingModels.map((m) => m.id)),
    ...dupes(cat.speechEngines.map((m) => m.id)),
    ...dupes(cat.unitPrices.map((m) => m.id)),
    ...dupes(cat.resourceTypes.map((t) => t.id)),
  ];
  if (d.length) throw new Error(`Duplicate catalogue ids: ${d.join(", ")}`);
  return cat;
}
