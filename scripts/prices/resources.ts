/**
 * pnpm prices:resources [--check] [--region canadacentral] [--cache .cache/prices] [--types vm,disk-premium-ssd]
 *
 * Prices the resource catalogue in packages/catalog/data/resources/*.json from the Azure Retail Prices API (CAD).
 * For every type with a `retail` block it prices each SKU's meters as pay-as-you-go (Consumption), 1- and 3-year
 * reserved (Reservation, monthly = total / (12 x years)), Azure Hybrid Benefit (per the type's `ahb` rule) and dev/test
 * (DevTestConsumption). Every option keeps its own source. A match must be unique: an ambiguous meter is reported and
 * left unpriced, never guessed. `--check` writes nothing, prints the per-type report and fails on ambiguity or a missing
 * pay-as-you-go price.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RETAIL_API, PriceMatchError, one, preciseSmall, retailSource, type Match, type RetailRow, type RowSource } from "./retail.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/catalog/data");
const RESOURCES = join(DATA, "resources");

type Json = Record<string, any>;
export type Option = "payg" | "ri1" | "ri3" | "ahb" | "devtest";
export const FETCH_TYPES = ["Consumption", "Reservation", "DevTestConsumption"];
const TERMS: Record<"ri1" | "ri3", { term: string; years: number }> = { ri1: { term: "1 Year", years: 1 }, ri3: { term: "3 Years", years: 3 } };

export interface Ctx {
  source: RowSource;
  /** USD rows, used for tiny per-unit prices and meters with no CAD row. */
  usd?: RowSource;
  usdToCad?: number;
  region: string;
  today: string;
}

export interface Change { id: string; field: string; from: number | undefined; to: number }
export interface TypeReport {
  typeId: string;
  category: string;
  skus: number;
  /** SKU x meter pairs priced pay-as-you-go. */
  priced: number;
  pairs: number;
  /** "option: reason" to the SKU meters a declared option could not price (each carries a fallback note). */
  missing: Record<string, string[]>;
  /** Fallbacks that are by design (Linux and Hybrid Benefit, free tiers, meters a rule excludes). */
  designed: number;
  /** Matches that returned more than one distinct price. */
  ambiguous: string[];
  /** Pay-as-you-go matches with no row and anything else that failed. */
  errors: string[];
  optionCounts: Record<string, number>;
}
export interface Result { types: TypeReport[]; changes: Change[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Seven significant digits: keeps per-second meters that CAD rounds to 0.0001 while leaving normal prices at their cents. */
const sig = (n: number) => Number(n.toPrecision(7));

/** Monthly multiplier and whether the unit is an hourly one, from the Retail API unit of measure. */
export function unitFactor(uom: string): { factor: number; hourly: boolean } {
  const u = uom.trim().toLowerCase().replace(/\s+/g, " ");
  if (/(^|[ /])hour$/.test(u)) return { factor: 730, hourly: true };
  if (/(^|[ /])day$/.test(u)) return { factor: 730 / 24, hourly: false };
  // "1 GB Second" is a quantity unit (priced per GB-second); a bare per-second unit has no monthly conversion here.
  if (/second/.test(u) && !/gi?b second/.test(u)) throw new PriceMatchError(`unsupported unit of measure "${uom}"`);
  return { factor: 1, hourly: false };
}

function defaultUnit(uom: string, hourly: boolean): string {
  if (hourly) return "unit-month (730 h)";
  const u = uom.trim().replace(/\s+/g, " ");
  return /day$/i.test(u) ? "unit-month (30.4 days)" : u;
}

type Product = string | Record<string, string> | undefined;
const osOf = (sku: Json): "linux" | "windows" => (sku.attrs?.os === "windows" ? "windows" : "linux");

function productPattern(p: Product, os: "linux" | "windows", armSku?: string): string | undefined {
  const raw = typeof p === "string" ? p : p ? p[os] : os === "windows" ? "Windows" : "^(?!.*Windows)";
  return raw?.replaceAll("{armSku}", escape(armSku ?? ""));
}

export interface MeterPrice {
  price: number;
  unit: string;
  hourly: boolean;
  source: Json;
  options: Partial<Record<Exclude<Option, "payg">, { price: number; source: Json }>>;
  fallbacks: Partial<Record<Exclude<Option, "payg">, string>>;
  free?: string;
  confidence: "verified" | "single-source";
}

interface Env {
  rows: RetailRow[];
  usdRows?: () => Promise<RetailRow[]>;
  filter: string;
  ctx: Ctx;
}

const FROM_USD = new WeakSet<RetailRow>();

async function pick(env: Env, m: Match): Promise<RetailRow> {
  try {
    return one(env.rows, m);
  } catch (e) {
    if (!(e instanceof PriceMatchError) || e.count !== 0 || !env.usdRows || !env.ctx.usdToCad) throw e;
    // No CAD meter: take the USD list price times the measured rate and say so in the source.
    const usd = one(await env.usdRows(), m);
    const row = { ...usd, retailPrice: usd.retailPrice * env.ctx.usdToCad, currencyCode: "CAD" };
    FROM_USD.add(row);
    return row;
  }
}

/** The pay-as-you-go source carries the filter and product; option sources only name the meter and what makes them different. */
const src = (env: Env, row: RetailRow, note?: string, full = false): Json => {
  const derived = FROM_USD.has(row);
  const text = [full ? `${row.productName} / ${row.skuName}` : undefined, note, derived ? `USD list price x ${env.ctx.usdToCad} (no CAD meter)` : undefined].filter(Boolean).join("; ");
  return { kind: derived ? "derived" : "azure-retail-api", meterName: row.meterName, ...(full ? { filter: env.filter } : {}), ...(text ? { note: text } : {}), retrievedAt: env.ctx.today };
};

/** Prices one meter of one SKU. Throws PriceMatchError for the pay-as-you-go price; option problems go to `fallbacks` and `ambiguous`. */
export async function priceMeter(type: Json, sku: Json, meterId: string, env: Env, ambiguous: string[]): Promise<MeterPrice> {
  const retail = type.retail as Json;
  const asRule = (r: unknown): Json | undefined => (typeof r === "string" ? { meterName: r } : (r as Json | undefined));
  const base = asRule(retail.meters[meterId]);
  const own = asRule(sku.retail?.[meterId]);
  const rule: Json | undefined = own ? (own.free !== undefined ? own : { ...base, ...own }) : base;
  if (!rule) throw new PriceMatchError(`no retail rule for meter ${meterId}`);
  const meter = type.meters.find((m: Json) => m.id === meterId)!;
  const declared = (type.options as Option[]).filter((o) => o !== "payg") as Exclude<Option, "payg">[];
  const allowed: Option[] = rule.options ?? type.options;
  const os = osOf(sku);
  const perSku = retail.filter.includes("armSkuName eq '{armSku}'");
  const div: number = rule.divisor ?? 1;
  const label = `${sku.id}/${meterId}`;

  if (rule.free !== undefined) {
    const fallbacks: MeterPrice["fallbacks"] = {};
    for (const o of declared) fallbacks[o] = "Free tier, nothing to discount.";
    return { price: 0, unit: rule.unit ?? "unit-month", hourly: meter.hourly, free: rule.free, source: { kind: "vendor-doc", ...(type.docsUrl ? { url: type.docsUrl } : {}), note: rule.free, retrievedAt: env.ctx.today }, options: {}, fallbacks, confidence: "single-source" };
  }

  const build = (over: Partial<Match> = {}, who: "own" | "linux" = "own"): Match => {
    const target = who === "linux" ? "linux" : os;
    return {
      meterName: (rule.meterName ?? ".").replaceAll("{armSku}", escape(sku.armSku ?? "")),
      productName: productPattern(rule.productName ?? retail.productName, target, sku.armSku),
      skuPattern: (rule.skuName ?? retail.skuName)?.replaceAll("{armSku}", escape(sku.armSku ?? "")),
      ...(perSku && sku.armSku ? { armSkuName: sku.armSku } : {}),
      ...(rule.tier === "paid" ? { firstPaidTier: true } : { tierMinimumUnits: rule.tier ?? 0 }),
      ...over,
    };
  };

  // Pay-as-you-go. A `parts` rule sums rows times SKU attributes.
  let payg: number;
  let uom: string;
  let paygSource: Json;
  if (rule.parts) {
    payg = 0;
    let first: RetailRow | undefined;
    for (const part of rule.parts as Json[]) {
      const factor = Number(sku.attrs?.[part.factorAttr]);
      if (!Number.isFinite(factor) || factor <= 0) throw new PriceMatchError(`${label}: attribute ${part.factorAttr} is missing`);
      const row = await pick(env, build({ meterName: part.meterName.replaceAll("{armSku}", escape(sku.armSku ?? "")), productName: productPattern(part.productName ?? rule.productName ?? retail.productName, os, sku.armSku), skuPattern: part.skuName ?? rule.skuName ?? retail.skuName, type: "Consumption", ...(part.tier === "paid" ? { firstPaidTier: true } : { tierMinimumUnits: part.tier ?? 0 }) }));
      const u = unitFactor(row.unitOfMeasure);
      payg += row.retailPrice * u.factor * factor;
      first ??= row;
    }
    uom = first!.unitOfMeasure;
    paygSource = src(env, first!, `sum of ${(rule.parts as Json[]).map((p) => p.meterName).join(" + ")}, each x ${(rule.parts as Json[]).map((p) => p.factorAttr).join(", ")}`, true);
  } else {
    const row = await pick(env, build({ type: "Consumption" }));
    payg = (row.retailPrice * unitFactor(row.unitOfMeasure).factor) / div;
    uom = row.unitOfMeasure;
    paygSource = src(env, row, undefined, true);
  }
  const { hourly } = unitFactor(uom);
  if (hourly !== meter.hourly && !rule.parts) throw new PriceMatchError(`${label}: meter is ${meter.hourly ? "hourly" : "not hourly"} but the Retail API unit is "${uom}"`);

  const out: MeterPrice = { price: sig(payg), unit: rule.unit ?? defaultUnit(uom, hourly), hourly: meter.hourly, source: paygSource, options: {}, fallbacks: {}, confidence: "verified" };
  const note = (o: Exclude<Option, "payg">, why: string) => { out.fallbacks[o] = why; };
  const attempt = async (o: Exclude<Option, "payg">, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) {
      if (!(e instanceof PriceMatchError)) throw e;
      if (e.count && e.count > 1) { ambiguous.push(`${label} ${o}: ${e.message}`); note(o, "Several Retail API meters match, so none is used; pay-as-you-go applies."); }
      else note(o, o === "devtest" ? "The Retail API has no separate dev/test rate for this meter, pay-as-you-go used." : `No ${o === "ri1" ? "1-year" : "3-year"} reserved price is published for this meter, pay-as-you-go used.`);
    }
  };

  for (const o of declared) {
    if (!allowed.includes(o)) { note(o, o === "ahb" ? "Hybrid Benefit does not apply to this meter, pay-as-you-go used." : "Not offered for this meter, pay-as-you-go used."); continue; }
    if (rule.parts && o !== "devtest") { note(o, "Not offered for this meter, pay-as-you-go used."); continue; }
    if (o === "ri1" || o === "ri3") {
      await attempt(o, async () => {
        const { term, years } = TERMS[o];
        const windowsRi = retail.windowsLicence === true && os === "windows";
        const row = await pick(env, build({ type: "Reservation", reservationTerm: term }, windowsRi ? "linux" : "own"));
        const monthly = row.retailPrice / (12 * years) / div;
        if (!windowsRi) { out.options[o] = { price: sig(monthly), source: src(env, row, `${term} reservation, total / ${12 * years} months`) }; return; }
        // Reservations cover compute only: the Windows licence stays at pay-as-you-go.
        const linux = await pick(env, build({ type: "Consumption" }, "linux"));
        const uplift = payg - linux.retailPrice * unitFactor(linux.unitOfMeasure).factor;
        out.options[o] = { price: sig(monthly + uplift), source: { ...src(env, row, `${term} Linux reservation / ${12 * years} months + Windows licence at pay-as-you-go (${sig(uplift)} a month); reservations cover compute only`), kind: "derived" } };
      });
    } else if (o === "ahb") {
      const rule2 = type.ahb as Json | undefined;
      if (!rule2 || rule2.kind === "unavailable") { note(o, rule2?.note ?? "No Hybrid Benefit price is published, pay-as-you-go used."); continue; }
      if (rule2.kind === "licence-free") {
        out.options.ahb = { price: 0, source: { kind: "derived", note: rule2.note, retrievedAt: env.ctx.today } };
        continue;
      }
      // linux-twin
      if (os !== "windows") { note(o, "Linux has no licence component, so Hybrid Benefit does not apply; pay-as-you-go is used."); continue; }
      await attempt(o, async () => {
        const row = await pick(env, build({ type: "Consumption" }, "linux"));
        out.options.ahb = { price: sig((row.retailPrice * unitFactor(row.unitOfMeasure).factor) / div), source: src(env, row, "Hybrid Benefit: the Linux price of the same size, Windows licence removed") };
      });
    } else if (o === "devtest") {
      await attempt(o, async () => {
        const row = await pick(env, build({ type: "DevTestConsumption", allowZero: true }));
        out.options.devtest = { price: sig((row.retailPrice * unitFactor(row.unitOfMeasure).factor) / div), source: src(env, row, "dev/test rate") };
      });
    }
  }
  return out;
}

/** Applies a priced meter to a unit price entry, keeping `manual`, `promo`, `lifecycle` and attrs the refresh does not own. */
export function applyMeter(file: Json, id: string, label: string, mp: MeterPrice, changes: Change[]): void {
  let entry = (file.unitPrices as Json[]).find((u) => u.id === id);
  if (!entry) { entry = { id, label, platform: "azure" }; file.unitPrices.push(entry); }
  const had = entry.price as number | undefined;
  const attrs: Json = Object.fromEntries(Object.entries(entry.attrs ?? {}).filter(([k]) => !k.startsWith("fallback.") && k !== "free"));
  for (const [o, why] of Object.entries(mp.fallbacks)) attrs[`fallback.${o}`] = why;
  if (mp.free !== undefined) attrs.free = true;
  Object.assign(entry, { label: entry.label ?? label, platform: "azure", unit: mp.unit, price: mp.price, attrs: Object.keys(attrs).length ? attrs : undefined, options: Object.keys(mp.options).length ? mp.options : undefined, source: mp.source, confidence: mp.confidence });
  for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
  if (had !== mp.price) changes.push({ id, field: "price", from: had, to: mp.price });
}

const DESIGNED = /^(Not offered|Linux has no|Free tier|Hybrid Benefit does not apply)/;
const keyOf = (id: string, sku: string, meter: string) => `${id}|${sku}|${meter}`;

/** Refreshes every type that has a `retail` block in the given resource files (mutated in place). */
export async function refreshResources(files: Json[], ctx: Ctx, only?: string[]): Promise<Result> {
  const result: Result = { types: [], changes: [] };
  for (const file of files) {
    for (const type of file.types as Json[]) {
      if (!type.retail || (only && !only.includes(type.id))) continue;
      const rep: TypeReport = { typeId: type.id, category: file.category, skus: type.skus.length, priced: 0, pairs: 0, missing: {}, designed: 0, ambiguous: [], errors: [], optionCounts: {} };
      result.types.push(rep);
      const declared = (type.options as Option[]).filter((o) => o !== "payg");
      if (declared.includes("ahb") && !type.ahb) rep.errors.push(`declares the ahb option without an ahb rule`);
      const region = type.retail.regionOverride ?? ctx.region;
      const seen = new Set<string>();
      for (const sku of type.skus as Json[]) {
        const filter = (type.retail.filter as string).replaceAll("{region}", region).replaceAll("{armSku}", String(sku.armSku ?? "").replaceAll("'", "''"));
        if (type.retail.filter.includes("{armSku}") && !sku.armSku) { rep.errors.push(`${sku.id}: filter needs an armSku`); continue; }
        let rows = await ctx.source(filter);
        if (type.retail.precise && ctx.usd && ctx.usdToCad) rows = preciseSmall(rows, await ctx.usd(filter), ctx.usdToCad);
        const env: Env = { rows, filter, ctx, usdRows: ctx.usd ? () => ctx.usd!(filter) : undefined };
        for (const meter of type.meters as Json[]) {
          const id = sku.prices[meter.id];
          if (!id) continue;
          rep.pairs++;
          try {
            const mp = await priceMeter(type, sku, meter.id, env, rep.ambiguous);
            // A unit price shared by several SKUs must come out the same for all of them.
            const k = keyOf(id, "", "");
            if (!seen.has(k)) { seen.add(k); applyMeter(file, id, mp.free !== undefined ? `${type.label}: ${meter.label ?? meter.id}, no charge` : `${sku.label} · ${meter.label ?? meter.id}`, mp, result.changes); }
            rep.priced++;
            for (const o of Object.keys(mp.options)) rep.optionCounts[o] = (rep.optionCounts[o] ?? 0) + 1;
            for (const [o, why] of Object.entries(mp.fallbacks)) {
              if (DESIGNED.test(why)) rep.designed++;
              else (rep.missing[`${o}: ${why}`] ??= []).push(`${sku.id}/${meter.id}`);
            }
          } catch (e) {
            if (!(e instanceof PriceMatchError)) throw e;
            if (e.count && e.count > 1) rep.ambiguous.push(`${sku.id}/${meter.id}: ${e.message}`);
            else rep.errors.push(`${sku.id}/${meter.id}: ${e.message}`);
          }
        }
      }
    }
  }
  return result;
}

/** `--check` fails on an ambiguous match or a pay-as-you-go price that no row supplies. */
export const exitCodeFor = (r: Result): number => (r.types.some((t) => t.ambiguous.length || t.errors.length) ? 1 : 0);

export function report(r: Result, today: string, region: string): string {
  const lines = [`# Resource price refresh ${today}`, "", `Source: Azure Retail Prices API, currency CAD, region ${region}.`, "",
    `- ${r.types.length} types, ${r.types.reduce((n, t) => n + t.skus, 0)} SKUs, ${r.types.reduce((n, t) => n + t.priced, 0)} of ${r.types.reduce((n, t) => n + t.pairs, 0)} SKU meters priced pay-as-you-go`,
    `- ${r.changes.length} unit prices changed or added`, `- ${r.types.reduce((n, t) => n + t.ambiguous.length, 0)} ambiguous matches, ${r.types.reduce((n, t) => n + t.errors.length, 0)} unmatched`, "",
    "| Type | SKUs | Priced | ri1 | ri3 | ahb | devtest | Ambiguous | Unmatched |", "|---|---|---|---|---|---|---|---|---|"];
  for (const t of r.types) lines.push(`| ${t.typeId} | ${t.skus} | ${t.priced}/${t.pairs} | ${t.optionCounts.ri1 ?? 0} | ${t.optionCounts.ri3 ?? 0} | ${t.optionCounts.ahb ?? 0} | ${t.optionCounts.devtest ?? 0} | ${t.ambiguous.length} | ${t.errors.length} |`);
  for (const t of r.types) {
    if (!t.ambiguous.length && !t.errors.length && !Object.keys(t.missing).length) continue;
    lines.push("", `## ${t.typeId}`);
    if (t.ambiguous.length) lines.push("", "Ambiguous (more than one distinct price; nothing written):", ...t.ambiguous.map((a) => `- ${a}`));
    if (t.errors.length) lines.push("", "Unmatched:", ...t.errors.map((a) => `- ${a}`));
    for (const [why, list] of Object.entries(t.missing)) lines.push("", `Not priced, ${why} (${list.length}: ${list.slice(0, 6).join(", ")}${list.length > 6 ? `, and ${list.length - 6} more` : ""}). Each carries a fallback note.`);
  }
  return `${lines.join("\n")}\n`;
}

export const readResourceFiles = (): { name: string; data: Json }[] =>
  readdirSync(RESOURCES).filter((f) => f.endsWith(".json")).sort().map((f) => ({ name: f, data: JSON.parse(readFileSync(join(RESOURCES, f), "utf8")) as Json }));

export async function runResources(args: string[], log: (m: string) => void = console.log): Promise<number> {
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const check = args.includes("--check");
  const meta = JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8"));
  const region = flag("--region") ?? meta.region;
  const today = new Date().toISOString().slice(0, 10);
  const cache = flag("--cache") ?? join(ROOT, ".cache/prices", today);
  const only = flag("--types")?.split(",");
  const usdToCad: number | undefined = meta.fx?.usdToCad;
  const ctx: Ctx = {
    source: retailSource({ currency: "CAD", cacheDir: cache, types: FETCH_TYPES, log }),
    usd: usdToCad ? retailSource({ currency: "USD", cacheDir: `${cache}-usd`, types: FETCH_TYPES, log }) : undefined,
    usdToCad, region, today,
  };
  const files = readResourceFiles();
  log(`Pricing resources (CAD, ${region})…`);
  const r = await refreshResources(files.map((f) => f.data), ctx, only);
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  const reportPath = join(ROOT, "reports", `prices-resources-${today}.md`);
  writeFileSync(reportPath, report(r, today, region));
  const ambiguous = r.types.reduce((n, t) => n + t.ambiguous.length, 0), unmatched = r.types.reduce((n, t) => n + t.errors.length, 0);
  const code = exitCodeFor(r);
  log(`${r.types.length} types, ${r.changes.length} unit prices changed, ${ambiguous} ambiguous, ${unmatched} unmatched. Report: ${reportPath}`);
  if (check) return code;
  for (const f of files) writeFileSync(join(RESOURCES, f.name), `${JSON.stringify(f.data, null, 2)}\n`);
  log("Resource catalogue updated. Run `pnpm test` to validate it.");
  return code;
}

export { RETAIL_API };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runResources(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
