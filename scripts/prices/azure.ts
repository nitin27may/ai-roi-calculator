/**
 * pnpm prices:azure [--check] [--region canadacentral] [--cache .cache/prices]
 *
 * Refreshes Azure entries in packages/catalog/data from the Azure Retail Prices API in CAD.
 * Writes a report to reports/prices-azure-<date>.md listing changed prices (flagging moves over
 * 30%), mapping errors, and Foundry model meters that no catalogue entry covers yet.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT, CHAT_PRODUCTS, EMBEDDINGS, GLOBAL_TOKEN, SEARCH_FILTER, SEARCH_TIERS, SPEECH_HOURLY, SPEECH_TOKENS, UNIT_METERS } from "./azure-map.js";
import { HOURS_PER_MONTH, PriceMatchError, one, per1M, retailSource, round, type RetailRow, type RowSource } from "./retail.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/catalog/data");

type Json = Record<string, any>;
export interface Change { id: string; field: string; from: number | undefined; to: number; pct: number | null }
export interface Result { files: Record<string, Json[] | Json>; changes: Change[]; errors: string[]; unmapped: string[] }

export async function updateAzure(files: { chat: Json[]; embeddings: Json[]; speech: Json[]; search: Json[]; units: Json[] }, source: RowSource, region: string, today: string): Promise<Result> {
  const changes: Change[] = [], errors: string[] = [];
  const set = (entry: Json, field: string, value: number, meter: string) => {
    const path = field.split(".");
    let o = entry;
    for (const p of path.slice(0, -1)) o = o[p] ??= {};
    const last = path.at(-1)!;
    const from = o[last] as number | undefined;
    if (from !== value) changes.push({ id: entry.id, field, from, to: value, pct: from ? (value - from) / from : null });
    o[last] = value;
    entry.source = { kind: "azure-retail-api", url: "https://prices.azure.com/api/retail/prices", meterName: meter, retrievedAt: today };
    entry.confidence = "verified";
  };
  const attempt = (id: string, fn: () => void) => { try { fn(); } catch (e) { if (e instanceof PriceMatchError) errors.push(`${id}: ${e.message}`); else throw e; } };

  // Foundry models (Global meters carry no region).
  const chatRows: RetailRow[] = [];
  for (const p of CHAT_PRODUCTS) chatRows.push(...(await source(`productName eq '${p}'`)));
  const matchedMeters = new Set<string>();
  for (const m of files.chat.filter((x) => x.platform === "azure" && CHAT[x.id])) {
    const spec = CHAT[m.id]!;
    attempt(m.id, () => {
      const pick = (pat: string) => one(chatRows, { meterName: pat.replace("{r}", GLOBAL_TOKEN), productName: `${spec.product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$` });
      const inp = pick(spec.input), out = pick(spec.output);
      let cached: RetailRow | null = null;
      try { cached = pick(spec.cachedInput); } catch { /* some models have no cached meter */ }
      // The API reports the price in force today (promo prices included), so it always refreshes `global`.
      const target = "prices.global";
      set(m, `${target}.input`, per1M(inp), inp.meterName);
      set(m, `${target}.cachedInput`, cached ? per1M(cached) : per1M(inp), inp.meterName);
      set(m, `${target}.output`, per1M(out), inp.meterName);
      [inp, out, cached].forEach((r) => r && matchedMeters.add(r.meterName));
    });
  }
  // Anything priced per token in the chat products that no entry claims: new models to add.
  const unmapped = [...new Set(chatRows.filter((r) => /Gl|glbl/i.test(r.meterName) && !matchedMeters.has(r.meterName) && r.retailPrice > 0).map((r) => `${r.productName} · ${r.meterName}`))].sort();

  for (const e of files.embeddings.filter((x) => EMBEDDINGS[x.id])) {
    attempt(e.id, () => { const r = one(chatRows, { meterName: EMBEDDINGS[e.id]! }); set(e, "per1M", per1M(r), r.meterName); });
  }
  for (const s of files.speech) {
    if (SPEECH_TOKENS[s.id]) attempt(s.id, () => {
      const a = one(chatRows, { meterName: SPEECH_TOKENS[s.id]!.audioInput }), t = one(chatRows, { meterName: SPEECH_TOKENS[s.id]!.textOutput });
      set(s, "tokens.audioInputPer1M", per1M(a), a.meterName);
      set(s, "tokens.textOutputPer1M", per1M(t), a.meterName);
    });
    if (SPEECH_HOURLY[s.id]) attempt(s.id, () => { const r = one(chatRows, { meterName: SPEECH_HOURLY[s.id]! }); set(s, "perAudioHour", round(r.retailPrice), r.meterName); });
  }

  const searchRows = await source(`armRegionName eq '${region}' and ${SEARCH_FILTER}`);
  for (const t of files.search.filter((x) => SEARCH_TIERS[x.id])) {
    attempt(`search ${t.id}`, () => { const r = one(searchRows, { meterName: SEARCH_TIERS[t.id]! }); set(t, "perSUMonth", round(r.retailPrice * HOURS_PER_MONTH, 2), r.meterName); });
  }
  for (const u of files.units) {
    if (u.id.startsWith("search-su-")) {
      const tier = files.search.find((t) => `search-su-${t.id}` === u.id);
      if (tier && tier.perSUMonth !== u.price) set(u, "price", tier.perSUMonth, tier.source?.meterName ?? "");
      continue;
    }
    const spec = UNIT_METERS[u.id];
    if (!spec) continue;
    const rows = await source(`armRegionName eq '${region}' and ${spec.filter}`);
    attempt(u.id, () => {
      let r: RetailRow;
      if (spec.pick === "max") {
        const hits = rows.filter((x) => new RegExp(spec.meterName, "i").test(x.meterName) && x.retailPrice > 0);
        if (!hits.length) throw new PriceMatchError(`no meter matches ${spec.meterName}`);
        r = hits.reduce((a, b) => (b.retailPrice > a.retailPrice ? b : a));
      } else r = one(rows, { meterName: spec.meterName, skuName: spec.skuName, tierMinimumUnits: spec.tierMinimumUnits });
      set(u, "price", round(r.retailPrice * (spec.scale ?? 1)), r.meterName);
    });
  }
  return { files: { "chat-models": files.chat, "embedding-models": files.embeddings, "speech-engines": files.speech, "search-tiers": files.search, "unit-prices": files.units }, changes, errors, unmapped };
}

export function report(r: Result, today: string, region: string): string {
  const big = r.changes.filter((c) => c.pct !== null && Math.abs(c.pct) > 0.3);
  const fmtPct = (p: number | null) => (p === null ? "new" : `${p > 0 ? "+" : ""}${(p * 100).toFixed(1)}%`);
  return [
    `# Azure price refresh ${today}`, "",
    `Source: Azure Retail Prices API, currency CAD, region ${region} (Foundry models: Global meters).`, "",
    `- ${r.changes.length} values changed${big.length ? `, **${big.length} moved more than 30%** (check before using)` : ""}`,
    `- ${r.errors.length} mapping errors`,
    `- ${r.unmapped.length} Foundry meters not in the catalogue`, "",
    "## Changes", "", "| Entry | Field | Was | Now | Change |", "|---|---|---|---|---|",
    ...r.changes.map((c) => `| ${c.id} | ${c.field} | ${c.from ?? "–"} | ${c.to} | ${Math.abs(c.pct ?? 0) > 0.3 ? "**" : ""}${fmtPct(c.pct)}${Math.abs(c.pct ?? 0) > 0.3 ? "**" : ""} |`),
    "", "## Mapping errors", "", ...(r.errors.length ? r.errors.map((e) => `- ${e}`) : ["None."]),
    "", "## Meters with no catalogue entry", "", "New models usually appear here first. Add an entry to `packages/catalog/data/chat-models.json` and a pattern to `scripts/prices/azure-map.ts`.", "",
    ...(r.unmapped.length ? r.unmapped.map((u) => `- ${u}`) : ["None."]), "",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const check = args.includes("--check");
  const region = flag("--region") ?? JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8")).region;
  const today = new Date().toISOString().slice(0, 10);
  const read = (f: string) => JSON.parse(readFileSync(join(DATA, `${f}.json`), "utf8"));
  const source = retailSource({ currency: "CAD", cacheDir: flag("--cache") ?? join(ROOT, ".cache/prices", today), log: (m) => console.log(m) });
  console.log(`Fetching Azure Retail Prices (CAD, ${region})…`);
  const r = await updateAzure({ chat: read("chat-models"), embeddings: read("embedding-models"), speech: read("speech-engines"), search: read("search-tiers"), units: read("unit-prices") }, source, region, today);
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  const reportPath = join(ROOT, "reports", `prices-azure-${today}.md`);
  writeFileSync(reportPath, report(r, today, region));
  console.log(`${r.changes.length} changes, ${r.errors.length} errors, ${r.unmapped.length} unmapped meters. Report: ${reportPath}`);
  if (check) { process.exitCode = r.changes.length ? 1 : 0; return; }
  for (const [name, data] of Object.entries(r.files)) writeFileSync(join(DATA, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  const meta = read("meta");
  meta.asOf = today;
  writeFileSync(join(DATA, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log("Catalogue updated. Run `pnpm test` to validate it.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
