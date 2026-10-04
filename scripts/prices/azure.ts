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
import { CANADA_REGIONS, CHAT, CHAT_PRODUCTS, DZ_REGIONS, DZ_TOKEN, EMBEDDINGS, GLOBAL_REGIONS, GLOBAL_TOKEN, REALTIME, REGIONAL_TOKEN, SEARCH_FILTER, SEARCH_TIERS, SPEECH_FILTER, SPEECH_HOURLY, SPEECH_PRODUCTS, SPEECH_REGIONAL, SPEECH_TOKENS, UNIT_METERS, type TierMeters } from "./azure-map.js";
import { applyUsdList, measureFx, type FxChange, type FxRate, type UsdEntry } from "./fx.js";
import { HOURS_PER_MONTH, PriceMatchError, one, per1M, preciseRows, retailSource, round, type RetailRow, type RowSource } from "./retail.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/catalog/data");

type Json = Record<string, any>;
export interface Change { id: string; field: string; from: number | undefined; to: number; pct: number | null }
export interface Result { files: Record<string, Json[] | Json>; changes: Change[]; errors: string[]; unmapped: string[] }
export interface FxResult { rate: FxRate; previous?: number; changes: FxChange[]; missing: string[] }

/** USD rows and rate used to replace rounded per-1K CAD prices (see `preciseRows`). */
export interface Precise { usd: RowSource; usdToCad: number }

export async function updateAzure(files: { chat: Json[]; embeddings: Json[]; speech: Json[]; search: Json[]; units: Json[]; realtime?: Json[] }, source: RowSource, region: string, today: string, precise?: Precise): Promise<Result> {
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

  // Foundry models. Most Global meters carry one price everywhere; MAI Global meters are priced per region.
  const load = async (filter: string) => (precise ? preciseRows(await source(filter), await precise.usd(filter), precise.usdToCad) : source(filter));
  const chatRows: RetailRow[] = [];
  for (const p of CHAT_PRODUCTS) chatRows.push(...(await load(`productName eq '${p}'`)));
  const matchedMeters = new Set<string>();
  for (const m of files.chat.filter((x) => x.platform === "azure" && CHAT[x.id])) {
    const spec = CHAT[m.id]!;
    attempt(m.id, () => {
      const product = `${spec.product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
      type Kind = "global" | "dataZone" | "regional";
      const TOKEN = { global: GLOBAL_TOKEN, dataZone: DZ_TOKEN, regional: REGIONAL_TOKEN }, REGIONS = { global: GLOBAL_REGIONS, dataZone: DZ_REGIONS, regional: CANADA_REGIONS };
      const pick = (pat: string, k: Kind) => one(chatRows, {
        meterName: pat.replace("{r}", TOKEN[k]), productName: product, preferRegions: REGIONS[k], ...(k === "global" ? {} : { regions: REGIONS[k] }),
      });
      const tier = (t: TierMeters, dz: Kind, target: string) => {
        const inp = pick(t.input, dz), out = pick(t.output, dz);
        let cached: RetailRow | null = null;
        // Some models (gpt-4.1-nano, pro models) have no cached-input meter: cached input bills as input.
        if (t.cachedInput) try { cached = pick(t.cachedInput, dz); } catch (e) { if (!(e instanceof PriceMatchError)) throw e; }
        const write = t.cacheWrite ? pick(t.cacheWrite, dz) : null;
        set(m, `${target}.input`, per1M(inp), inp.meterName);
        set(m, `${target}.cachedInput`, cached ? per1M(cached) : per1M(inp), inp.meterName);
        set(m, `${target}.output`, per1M(out), inp.meterName);
        if (write) set(m, `${target}.cacheWrite`, per1M(write), inp.meterName);
        [inp, out, cached, write].forEach((r) => r && matchedMeters.add(r.meterName));
      };
      // The API reports the price in force today (promo prices included), so it always refreshes `global`.
      tier(spec, "global", "prices.global");
      if (spec.long) {
        if (!m.longContext?.threshold) throw new PriceMatchError(`has long-context meters but no longContext.threshold in the catalogue`);
        tier(spec.long, "global", "longContext.prices");
      }
      // US Data Zone (East US / East US 2) and Canada Regional prices. A model offered under a deployment
      // (`availableIn`) or already priced for it must have a meter there: a miss is a stale pattern, reported, not dropped.
      for (const [k, label] of [["dataZone", "Data Zone"], ["regional", "Canada Regional"]] as const) {
        try { tier(spec, k, `prices.${k}`); } catch (e) {
          if (!(e instanceof PriceMatchError)) throw e;
          if (m.prices?.[k] || m.availableIn?.includes(k)) throw new PriceMatchError(`${label}: ${e.message}`);
        }
      }
    });
  }

  for (const e of files.embeddings.filter((x) => EMBEDDINGS[x.id])) {
    const spec = EMBEDDINGS[e.id]!;
    attempt(e.id, () => {
      const g = one(chatRows, { meterName: spec.global, preferRegions: GLOBAL_REGIONS });
      set(e, "per1M", per1M(g), g.meterName);
      const r = one(chatRows, { meterName: spec.regional, regions: CANADA_REGIONS, preferRegions: CANADA_REGIONS });
      set(e, "deployments.regional", per1M(r), g.meterName);
      const dz = spec.dataZone.map((pat) => { try { return one(chatRows, { meterName: pat, regions: DZ_REGIONS, preferRegions: DZ_REGIONS }); } catch { return null; } }).find(Boolean);
      if (!dz) throw new PriceMatchError(`no US Data Zone or regional meter matches ${spec.dataZone.join(" | ")}`);
      set(e, "deployments.dataZone", per1M(dz), g.meterName);
      [g, r, dz].forEach((x) => matchedMeters.add(x.meterName));
    });
  }
  const mediaRows: RetailRow[] = [];
  for (const p of SPEECH_PRODUCTS) mediaRows.push(...(await load(`productName eq '${p}'`)));
  const foundryRows = [...chatRows, ...mediaRows];
  const global = (meterName: string) => one(foundryRows, { meterName, preferRegions: GLOBAL_REGIONS });
  const speechRows = await source(`armRegionName eq '${region}' and ${SPEECH_FILTER}`);
  for (const s of files.speech) {
    if (SPEECH_TOKENS[s.id]) attempt(s.id, () => {
      const a = global(SPEECH_TOKENS[s.id]!.audioInput), t = global(SPEECH_TOKENS[s.id]!.textOutput);
      set(s, "tokens.audioInputPer1M", per1M(a), a.meterName);
      set(s, "tokens.textOutputPer1M", per1M(t), a.meterName);
      matchedMeters.add(a.meterName).add(t.meterName);
    });
    if (SPEECH_HOURLY[s.id]) attempt(s.id, () => { const r = global(SPEECH_HOURLY[s.id]!); set(s, "perAudioHour", round(r.retailPrice), r.meterName); });
    const regional = SPEECH_REGIONAL[s.id];
    if (regional) attempt(s.id, () => {
      const r = one(speechRows, { meterName: regional.perAudioHour });
      set(s, "perAudioHour", round(r.retailPrice), r.meterName);
      if (regional.diarizationAddOnPerHour) set(s, "diarizationAddOnPerHour", round(one(speechRows, { meterName: regional.diarizationAddOnPerHour }).retailPrice), r.meterName);
    });
  }
  for (const m of files.realtime ?? []) {
    const spec = REALTIME[m.id];
    if (!spec) continue;
    attempt(m.id, () => {
      for (const kind of ["text", "audio"] as const) {
        const t = spec[kind], pick = (pat: string) => global(pat.replace("{r}", GLOBAL_TOKEN));
        const inp = pick(t.input), out = pick(t.output), cached = t.cachedInput ? pick(t.cachedInput) : inp;
        set(m, `${kind}.input`, per1M(inp), inp.meterName);
        set(m, `${kind}.cachedInput`, per1M(cached), inp.meterName);
        set(m, `${kind}.output`, per1M(out), inp.meterName);
      }
    });
  }

  // Global meters for models no entry claims: new models to add. Batch, Flex and Priority Processing are tiers, not models.
  const TIER = /\b(pp|batch|flex|fl)\b/i;
  const unmapped = [...new Set(chatRows.filter((r) => /\b(Gl|glbl)\b/i.test(r.meterName) && !TIER.test(r.meterName) && !matchedMeters.has(r.meterName) && r.retailPrice > 0).map((r) => `${r.productName} · ${r.meterName}`))].sort();

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
  return { files: { "chat-models": files.chat, "embedding-models": files.embeddings, "speech-engines": files.speech, "search-tiers": files.search, "unit-prices": files.units, ...(files.realtime ? { "realtime-models": files.realtime } : {}) }, changes, errors, unmapped };
}

export function report(r: Result, today: string, region: string, fx?: FxResult): string {
  const big = r.changes.filter((c) => c.pct !== null && Math.abs(c.pct) > 0.3);
  const fmtPct = (p: number | null) => (p === null ? "new" : `${p > 0 ? "+" : ""}${(p * 100).toFixed(1)}%`);
  return [
    `# Azure price refresh ${today}`, "",
    `Source: Azure Retail Prices API, currency CAD, region ${region} (Foundry models: Global meters).`, "",
    `- ${r.changes.length} values changed${big.length ? `, **${big.length} moved more than 30%** (check before using)` : ""}`,
    `- ${r.errors.length} mapping errors`,
    `- ${r.unmapped.length} Foundry meters not in the catalogue`, "",
    ...(fx ? [
      "## Exchange rate", "",
      `1 USD = ${fx.rate.usdToCad} CAD${fx.previous ? ` (was ${fx.previous})` : ""}. ${fx.rate.source}.`,
      `USD-only list prices in \`usd-list.json\` were converted at this rate: ${fx.changes.length} values changed.`,
      ...(fx.missing.length ? ["", `**Entries in usd-list.json with no catalogue entry:** ${fx.missing.join(", ")}`] : []), "",
    ] : []),
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
  const cache = flag("--cache") ?? join(ROOT, ".cache/prices", today);
  const source = retailSource({ currency: "CAD", cacheDir: cache, log: (m) => console.log(m) });
  const files = { chat: read("chat-models"), embeddings: read("embedding-models"), speech: read("speech-engines"), search: read("search-tiers"), units: read("unit-prices"), realtime: read("realtime-models") };
  const meta = read("meta");

  // USD-only list prices first, at Azure's own CAD/USD rate; CAD meters below override them.
  console.log("Measuring Azure's CAD/USD rate…");
  const usdSource = retailSource({ currency: "USD", cacheDir: `${cache}-usd`, log: (m) => console.log(m) });
  const rate = await measureFx(source, usdSource, today);
  const usd = applyUsdList({ "chat-models": files.chat, "embedding-models": files.embeddings, "speech-engines": files.speech, "unit-prices": files.units, "realtime-models": files.realtime }, read("usd-list") as UsdEntry[], rate);
  const fx: FxResult = { rate, previous: meta.fx?.usdToCad, ...usd };
  console.log(`1 USD = ${rate.usdToCad} CAD (${rate.meters} meters); ${usd.changes.length} USD-derived values changed.`);

  console.log(`Fetching Azure Retail Prices (CAD, ${region})…`);
  const r = await updateAzure(files, source, region, today, { usd: usdSource, usdToCad: rate.usdToCad });
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  const reportPath = join(ROOT, "reports", `prices-azure-${today}.md`);
  writeFileSync(reportPath, report(r, today, region, fx));
  console.log(`${r.changes.length} changes, ${r.errors.length} errors, ${r.unmapped.length} unmapped meters. Report: ${reportPath}`);
  if (check) { process.exitCode = r.changes.length || usd.changes.length ? 1 : 0; return; }
  for (const [name, data] of Object.entries(r.files)) writeFileSync(join(DATA, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  meta.asOf = today;
  meta.fx = rate;
  writeFileSync(join(DATA, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log("Catalogue updated. Run `pnpm test` to validate it.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
