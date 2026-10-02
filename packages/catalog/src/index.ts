import meta from "../data/meta.json" with { type: "json" };
import chatModels from "../data/chat-models.json" with { type: "json" };
import embeddingModels from "../data/embedding-models.json" with { type: "json" };
import speechEngines from "../data/speech-engines.json" with { type: "json" };
import searchTiers from "../data/search-tiers.json" with { type: "json" };
import unitPrices from "../data/unit-prices.json" with { type: "json" };
import snowflake from "../data/snowflake.json" with { type: "json" };
import { Catalog } from "./schema.js";

export * from "./schema.js";
export { heuristics } from "./heuristics.js";
export type { Heuristics } from "./heuristics.js";

/** Parse and validate the bundled catalogue. Throws with a path-based message on bad data. */
export function loadCatalog(): Catalog {
  const parsed = Catalog.safeParse({ meta, chatModels, embeddingModels, speechEngines, searchTiers, unitPrices, snowflake });
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
  ];
  if (d.length) throw new Error(`Duplicate catalogue ids: ${d.join(", ")}`);
  return cat;
}
