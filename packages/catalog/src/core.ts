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
import { Catalog, ResourceFile } from "./schema.js";

/** Validates one resource category file (`data/resources/<category>.json`). Throws with a path-based message. */
export function parseResourceFile(raw: unknown): ResourceFile {
  const parsed = ResourceFile.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Resource catalogue is invalid:\n${lines.join("\n")}`);
  }
  const wrong = parsed.data.types.filter((t) => t.category !== parsed.data.category);
  if (wrong.length) throw new Error(`Resource types in the ${parsed.data.category} file have another category: ${wrong.map((t) => t.id).join(", ")}`);
  return parsed.data;
}

/** Validates the core catalogue plus the given resource category files (none gives the core catalogue alone). */
export function buildCatalog(resourceFiles: readonly unknown[]): Catalog {
  const files = resourceFiles.map(parseResourceFile);
  const parsed = Catalog.safeParse({
    meta, chatModels, embeddingModels, speechEngines, realtimeModels, ptu, searchTiers,
    unitPrices: [...unitPrices, ...files.flatMap((f) => f.unitPrices)], resourceTypes: files.flatMap((f) => f.types), snowflake, benchmarks,
  });
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

/**
 * The catalogue without the resource categories (about half a megabyte of JSON). The web app starts from this and adds
 * categories as they are needed (`lazy.ts`); everything else uses `loadCatalog()`.
 */
export const loadCoreCatalog = (): Catalog => buildCatalog([]);
