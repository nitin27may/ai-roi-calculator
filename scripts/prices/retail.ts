import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Azure Retail Prices API client (public, no auth). Follows NextPageLink, retries with backoff,
 * keeps Consumption rows, and caches raw pages on disk so a re-run is offline.
 * Adapted from workgraph.ai showcase/cost-calculator/packages/fetcher.
 */
export const RETAIL_API = "https://prices.azure.com/api/retail/prices";

export interface RetailRow {
  currencyCode: string;
  retailPrice: number;
  armRegionName: string;
  productName: string;
  skuName: string;
  meterName: string;
  serviceName: string;
  unitOfMeasure: string;
  tierMinimumUnits: number;
  type: string;
  meterId?: string;
}

export type RowSource = (filter: string) => Promise<RetailRow[]>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function retailSource(opts: { currency?: string; cacheDir?: string; maxPages?: number; log?: (m: string) => void } = {}): RowSource {
  const currency = opts.currency ?? "CAD";
  const memo = new Map<string, Promise<RetailRow[]>>();
  return (filter) => {
    const key = createHash("sha1").update(`${currency}|${filter}`).digest("hex").slice(0, 16);
    if (!memo.has(key)) memo.set(key, load(filter, key));
    return memo.get(key)!;
  };

  async function load(filter: string, key: string): Promise<RetailRow[]> {
    const cached = opts.cacheDir ? join(opts.cacheDir, `${key}.json`) : null;
    if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")) as RetailRow[];
    let url: string | null = `${RETAIL_API}?currencyCode='${currency}'&$filter=${encodeURIComponent(filter)}`;
    const rows: RetailRow[] = [];
    for (let page = 0; url && page < (opts.maxPages ?? 80); page++) {
      let body: { Items?: RetailRow[]; NextPageLink?: string | null } | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          body = (await res.json()) as typeof body;
          break;
        } catch (e) {
          if (attempt === 4) throw new Error(`Retail API failed for ${filter}: ${(e as Error).message}`, { cause: e });
          await sleep(1000 * 2 ** attempt);
        }
      }
      rows.push(...(body?.Items ?? []).filter((r) => r.type === "Consumption"));
      url = body?.NextPageLink ?? null;
      opts.log?.(`  ${filter.slice(0, 70)}… page ${page + 1}, ${rows.length} rows`);
    }
    if (cached) {
      mkdirSync(opts.cacheDir!, { recursive: true });
      writeFileSync(cached, JSON.stringify(rows));
    }
    return rows;
  }
}

export class PriceMatchError extends Error {}

export interface Match {
  meterName: string;
  productName?: string;
  skuName?: string;
  armRegionName?: string;
  /** Tier lower bound; default 0 (first tier). */
  tierMinimumUnits?: number;
  /**
   * When the meter's price differs by region (MAI Global meters, US vs EU Data Zone), take the price
   * of the first region in this list that carries the meter.
   */
  preferRegions?: string[];
}

/** Exactly one distinct price must match, otherwise the mapping is ambiguous or stale. */
export function one(rows: RetailRow[], m: Match): RetailRow {
  const re = new RegExp(m.meterName, "i");
  const pr = m.productName ? new RegExp(m.productName, "i") : null;
  const hits = rows.filter((r) =>
    re.test(r.meterName) && (!pr || pr.test(r.productName)) && (!m.skuName || r.skuName === m.skuName) &&
    (m.armRegionName === undefined || r.armRegionName === m.armRegionName) && r.tierMinimumUnits === (m.tierMinimumUnits ?? 0) && r.retailPrice > 0);
  const distinctOf = (rs: RetailRow[]) => new Map(rs.map((h) => [`${h.meterName}|${h.skuName}|${h.productName}|${h.retailPrice}`, h]));
  const distinct = distinctOf(hits);
  if (distinct.size === 1) return [...distinct.values()][0]!;
  for (const region of distinct.size > 1 ? m.preferRegions ?? [] : []) {
    const inRegion = distinctOf(hits.filter((h) => h.armRegionName === region));
    if (inRegion.size === 1) return [...inRegion.values()][0]!;
    if (inRegion.size > 1) break;
  }
  throw new PriceMatchError(distinct.size === 0 ? `no meter matches ${JSON.stringify(m)}` : `${distinct.size} meters match ${JSON.stringify(m)}: ${[...distinct.keys()].slice(0, 4).join("; ")}`);
}

/** Retail API token meters are per 1K or 1M; normalise to CAD per 1M. */
export function per1M(row: RetailRow): number {
  const u = row.unitOfMeasure.replace(/\s+/g, "");
  if (u === "1K") return round(row.retailPrice * 1000);
  if (u === "1M") return round(row.retailPrice);
  if (u === "1") return round(row.retailPrice * 1e6);
  throw new PriceMatchError(`unexpected token unit "${row.unitOfMeasure}" on ${row.meterName}`);
}

export const HOURS_PER_MONTH = 730;
export const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
