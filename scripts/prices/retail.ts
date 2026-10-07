import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Azure Retail Prices API client (public, no auth). Follows NextPageLink, retries with backoff,
 * keeps rows of the requested price types (default Consumption), and caches raw pages on disk so a re-run is offline.
 * Adapted from an earlier internal cost calculator fetcher.
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
  /** "1 Year" or "3 Years" on Reservation rows. */
  reservationTerm?: string;
  armSkuName?: string;
}

export type RowSource = (filter: string) => Promise<RetailRow[]>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function retailSource(opts: { currency?: string; cacheDir?: string; maxPages?: number; types?: string[]; log?: (m: string) => void } = {}): RowSource {
  const currency = opts.currency ?? "CAD";
  const types = opts.types ?? ["Consumption"];
  // The default keeps today's cache keys, so existing cached pages stay valid.
  const keySuffix = types.length === 1 && types[0] === "Consumption" ? "" : `|${[...types].sort().join(",")}`;
  const memo = new Map<string, Promise<RetailRow[]>>();
  return (filter) => {
    const key = createHash("sha1").update(`${currency}|${filter}${keySuffix}`).digest("hex").slice(0, 16);
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
      rows.push(...(body?.Items ?? []).filter((r) => types.includes(r.type)));
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

export class PriceMatchError extends Error {
  /** How many distinct prices matched: 0 means missing, more than 1 means ambiguous. */
  constructor(message: string, readonly count?: number) { super(message); }
}

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
  /** Only rows in these regions count (Canada for Regional Standard, the US for Data Zone). */
  regions?: string[];
  /** Regex on unitOfMeasure ("^1/Month$" separates a monthly row from an hourly one of the same meter name). */
  uomPattern?: string;
  /** Regex on skuName (in addition to the exact `skuName`). */
  skuPattern?: string;
  /** Price type to keep ("Consumption", "Reservation", "DevTestConsumption"); default any. */
  type?: string;
  /** "1 Year" or "3 Years" on Reservation rows. */
  reservationTerm?: string;
  armSkuName?: string;
  /** Accept a row priced 0 (licence meters, free dev/test); default is a price above 0. */
  allowZero?: boolean;
  /** Take the lowest tier with a price above 0 instead of `tierMinimumUnits`. */
  firstPaidTier?: boolean;
}

/** Exactly one distinct price must match, otherwise the mapping is ambiguous or stale. */
export function one(rows: RetailRow[], m: Match): RetailRow {
  const re = new RegExp(m.meterName, "i");
  const pr = m.productName ? new RegExp(m.productName, "i") : null;
  const sp = m.skuPattern ? new RegExp(m.skuPattern, "i") : null;
  const up = m.uomPattern ? new RegExp(m.uomPattern, "i") : null;
  const base = rows.filter((r) =>
    re.test(r.meterName) && (!pr || pr.test(r.productName)) && (!m.skuName || r.skuName === m.skuName) && (!sp || sp.test(r.skuName)) && (!up || up.test(r.unitOfMeasure)) &&
    (!m.type || r.type === m.type) && (!m.reservationTerm || r.reservationTerm === m.reservationTerm) && (!m.armSkuName || r.armSkuName === m.armSkuName) &&
    (m.armRegionName === undefined || r.armRegionName === m.armRegionName) && (!m.regions || m.regions.includes(r.armRegionName)) && (m.allowZero || r.retailPrice > 0));
  // The first paid tier is the lowest tier above 0 that carries a price, per meter and product.
  const tier = m.firstPaidTier ? Math.min(...base.filter((r) => r.retailPrice > 0).map((r) => r.tierMinimumUnits)) : (m.tierMinimumUnits ?? 0);
  const hits = base.filter((r) => r.tierMinimumUnits === tier);
  const distinctOf = (rs: RetailRow[]) => new Map(rs.map((h) => [`${h.meterName}|${h.skuName}|${h.productName}|${h.retailPrice}`, h]));
  const distinct = distinctOf(hits);
  if (distinct.size === 1) return [...distinct.values()][0]!;
  for (const region of distinct.size > 1 ? m.preferRegions ?? [] : []) {
    const inRegion = distinctOf(hits.filter((h) => h.armRegionName === region));
    if (inRegion.size === 1) return [...inRegion.values()][0]!;
    if (inRegion.size > 1) break;
  }
  throw new PriceMatchError(distinct.size === 0 ? `no meter matches ${JSON.stringify(m)}` : `${distinct.size} meters match ${JSON.stringify(m)}: ${[...distinct.keys()].slice(0, 4).join("; ")}`, distinct.size);
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

/**
 * Per-1K token meters carry CAD rounded to 4 decimals (0.0007 for 0.000686), which is 2-30% off per 1M.
 * Replace each 1K row's CAD price with its USD twin × the rate Azure bills at, which keeps 6+ digits.
 */
export function preciseRows(cad: RetailRow[], usd: RetailRow[], usdToCad: number): RetailRow[] {
  const key = (r: RetailRow) => `${r.meterId}|${r.armRegionName}|${r.tierMinimumUnits}`;
  const twin = new Map(usd.map((r) => [key(r), r.retailPrice]));
  return cad.map((r) => {
    const u = r.unitOfMeasure.replace(/\s+/g, "") === "1K" ? twin.get(key(r)) : undefined;
    return u === undefined ? r : { ...r, retailPrice: u * usdToCad };
  });
}

/**
 * CAD prices carry four decimals, so anything under a few cents loses digits (0.0001 for 0.0000368 a GB-second).
 * Replace each small CAD price with its USD twin x the rate Azure bills at. Rows with no twin, and larger prices, are kept.
 */
export function preciseSmall(cad: RetailRow[], usd: RetailRow[], usdToCad: number, below = 0.05): RetailRow[] {
  const key = (r: RetailRow) => `${r.meterId}|${r.armRegionName}|${r.tierMinimumUnits}|${r.type}|${r.reservationTerm ?? ""}|${r.skuName}`;
  const twin = new Map(usd.map((r) => [key(r), r.retailPrice]));
  return cad.map((r) => {
    const u = r.retailPrice < below ? twin.get(key(r)) : undefined;
    return u === undefined || u === 0 ? r : { ...r, retailPrice: u * usdToCad };
  });
}
