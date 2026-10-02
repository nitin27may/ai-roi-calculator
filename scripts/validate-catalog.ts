/**
 * Validate the bundled CAD price catalogue and list what still needs a human check:
 * prices marked unverified or single-source, derived (USD-converted) prices, and
 * benchmarks with low confidence or vendor funding. Exits non-zero if the catalogue is invalid.
 *
 *   pnpm validate
 */
import { loadCatalog } from "@studio/catalog";

const cat = loadCatalog(); // throws with path-based messages when invalid
const entries = [
  ...cat.chatModels.map((x) => ({ kind: "chat model", id: x.id, label: x.label, confidence: x.confidence, source: x.source })),
  ...cat.embeddingModels.map((x) => ({ kind: "embedding", id: x.id, label: x.label, confidence: x.confidence, source: x.source })),
  ...cat.speechEngines.map((x) => ({ kind: "speech", id: x.id, label: x.label, confidence: x.confidence, source: x.source })),
  ...cat.unitPrices.map((x) => ({ kind: "unit price", id: x.id, label: x.label, confidence: x.confidence, source: x.source })),
];
console.log(`Catalogue valid. Prices as of ${cat.meta.asOf} (${cat.meta.currency}, ${cat.meta.region}).`);
console.log(`  ${cat.chatModels.length} chat models, ${cat.embeddingModels.length} embedding models, ${cat.speechEngines.length} speech engines, ${cat.unitPrices.length} unit prices, ${cat.benchmarks.capabilities.length} benchmarks`);

const weak = entries.filter((e) => e.confidence === "unverified" || e.confidence === "single-source");
console.log(`\nNeeds checking (${weak.length} unverified or single-source):`);
for (const e of weak) console.log(`  [${e.confidence}] ${e.kind}: ${e.id} (${e.label})${e.source.url ? `  ${e.source.url}` : ""}`);

const derived = entries.filter((e) => e.source.kind === "derived");
console.log(`\nConverted from USD (${derived.length}); replace with CAD meters when the Retail API has them:`);
console.log(`  ${derived.map((e) => e.id).join(", ")}`);

const bench = cat.benchmarks.capabilities.filter((b) => b.confidence === "low" || b.confidence === "none" || b.vendorFunded);
console.log(`\nBenchmarks to treat with care (${bench.length}):`);
for (const b of bench) console.log(`  [${b.confidence}${b.vendorFunded ? ", vendor-funded" : ""}] ${b.id}: ${b.sourceLabel}`);
