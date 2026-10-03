/**
 * USD-only list prices (Claude on Foundry, preview models, tools with no CAD meter) are kept in
 * packages/catalog/data/usd-list.json and converted to CAD with the rate Azure itself bills at:
 * the CAD/USD ratio of the same Retail API meters. Every refresh re-measures the rate and
 * re-converts, so the catalogue stays CAD-only and moves with the exchange rate.
 */
import { round, type RetailRow, type RowSource } from "./retail.js";

type Json = Record<string, any>;

/** One catalogue entry whose prices come from USD list prices. Keys of `usd` are dotted field paths. */
export interface UsdEntry { file: string; id: string; url?: string; note?: string; usd: Record<string, number> }

export interface FxRate { usdToCad: number; meters: number; asOf: string; source: string }

/** Meters with the same id, region and tier in both currencies; small prices are skipped because they are rounded to 4 decimals. */
export const FX_FILTER = "productName eq 'Azure OpenAI GPT5'";

export function fxFromRows(cad: RetailRow[], usd: RetailRow[], today: string): FxRate {
  const key = (r: RetailRow) => `${r.meterId}|${r.armRegionName}|${r.tierMinimumUnits}`;
  const usdByKey = new Map(usd.map((r) => [key(r), r.retailPrice]));
  const ratios = cad.flatMap((r) => {
    const u = usdByKey.get(key(r));
    return u && u >= 1 ? [r.retailPrice / u] : [];
  }).sort((a, b) => a - b);
  if (ratios.length < 20) throw new Error(`Only ${ratios.length} meters priced in both CAD and USD; cannot measure the exchange rate.`);
  const median = ratios[Math.floor(ratios.length / 2)]!;
  if (ratios[0]! < median * 0.99 || ratios.at(-1)! > median * 1.01) throw new Error(`CAD/USD ratios disagree (${ratios[0]} to ${ratios.at(-1)}); check the meters.`);
  return { usdToCad: round(median, 5), meters: ratios.length, asOf: today, source: `Azure Retail Prices API: CAD/USD ratio of ${ratios.length} matched meters (${FX_FILTER})` };
}

export async function measureFx(cad: RowSource, usd: RowSource, today: string): Promise<FxRate> {
  return fxFromRows(await cad(FX_FILTER), await usd(FX_FILTER), today);
}

export interface FxChange { id: string; field: string; from: number | undefined; to: number }

/** Writes `usd × rate` into each listed field. Returns what changed and entries that no longer exist. */
export function applyUsdList(files: Record<string, Json[]>, list: UsdEntry[], fx: FxRate): { changes: FxChange[]; missing: string[] } {
  const changes: FxChange[] = [], missing: string[] = [];
  for (const u of list) {
    const entry = files[u.file]?.find((e) => e.id === u.id);
    if (!entry) { missing.push(`${u.file}/${u.id}`); continue; }
    for (const [field, usd] of Object.entries(u.usd)) {
      const path = field.split(".");
      let o = entry;
      for (const p of path.slice(0, -1)) o = o[p] ??= {};
      const last = path.at(-1)!;
      const to = round(usd * fx.usdToCad);
      if (o[last] !== to) changes.push({ id: u.id, field, from: o[last], to });
      o[last] = to;
    }
    // Entries that are partly Retail API priced (a promo model's list price) keep their Retail API source.
    if (entry.source?.kind !== "azure-retail-api") {
      entry.source = { kind: "derived", ...(u.url ? { url: u.url } : {}), note: `${u.note ? `${u.note}. ` : ""}USD list price × ${fx.usdToCad} (Azure CAD/USD rate on ${fx.asOf})`, retrievedAt: fx.asOf };
    }
  }
  return { changes, missing };
}
