import type { Catalog, ResourceType } from "@roi-calculator/catalog";
import { HYPERCARE_ID } from "./delivery.js";
import { changeStartMonth } from "./currentstate.js";
import { PriceBook } from "./pricing.js";
import type { Project, Resource } from "./project.js";

/**
 * Generic what-if transforms (A13). Each one mutates the project it is given (callers pass a clone) and returns it.
 * They back the scenario edits `scaleRates` and `shiftMonths`, the generic levers in levers.ts and the generic
 * sensitivity drivers, so the three always agree on what a change means. Every one is a no-op when the project has
 * nothing for it to act on.
 */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Role ids used by build or maintenance team lines. */
export const deliveryRoleIds = (p: Project): Set<string> =>
  new Set([...p.build.team.map((t) => t.roleId), ...(p.maintenance.mode === "team" ? p.maintenance.team.map((t) => t.roleId) : [])]);
/** Role ids that value a benefit or a current-state people line. */
export const valueRoleIds = (p: Project): Set<string> =>
  new Set([
    ...p.benefits.capabilities.map((c) => c.roleId),
    ...p.benefits.avoidedCosts.flatMap((a) => (a.roleId ? [a.roleId] : [])),
    ...(p.currentState?.lines ?? []).flatMap((l) => (l.basis.kind === "fte" ? [l.basis.roleId] : [])),
  ]);

/**
 * Scale labour rates by `factor`.
 * - scope "delivery" (the default): build and maintenance team lines only. A role used only by delivery lines has its
 *   rate-card rate scaled. A role that also values a benefit or a current-state people line keeps its rate card entry
 *   (so the value of an hour saved does not move) and its team lines get a manual rate of rate x factor instead.
 *   A manual rate already on a line is scaled in place.
 * - scope "all": every rate-card rate and every manual rate, so benefit value and current-state people cost move too.
 */
export function scaleRatesBy(q: Project, factor: number, scope: "delivery" | "all" = "delivery"): Project {
  const teams = [...q.build.team, ...(q.maintenance.mode === "team" ? q.maintenance.team : [])];
  if (scope === "all") {
    for (const r of q.rateCard) r.hourlyRate *= factor;
    for (const t of teams) if (t.rateOverride !== undefined) t.rateOverride *= factor;
    return q;
  }
  const shared = valueRoleIds(q);
  const rate = new Map(q.rateCard.map((r) => [r.id, r.hourlyRate]));
  for (const r of q.rateCard) if (deliveryRoleIds(q).has(r.id) && !shared.has(r.id)) r.hourlyRate *= factor;
  for (const t of teams) {
    if (t.rateOverride !== undefined) t.rateOverride *= factor;
    else if (shared.has(t.roleId) && rate.has(t.roleId)) t.rateOverride = rate.get(t.roleId)! * factor;
  }
  return q;
}

/** Whether any team line has a rate to scale. */
export const hasDeliveryRates = (p: Project): boolean => p.build.team.length > 0 || (p.maintenance.mode === "team" && p.maintenance.team.length > 0);

/** Move every current-state line's change month by `by` months, never before go-live. Lines that are kept do not move. */
export function shiftDecommission(q: Project, by: number): Project {
  const B = q.timeline.buildMonths;
  for (const l of q.currentState?.lines ?? []) {
    if (l.change.mode === "keep") continue;
    l.change.fromMonth = Math.max(B + 1, changeStartMonth(q, l) + Math.round(by));
  }
  return q;
}
export const hasDecommissionLines = (p: Project): boolean => (p.currentState?.lines ?? []).some((l) => l.change.mode !== "keep");

/**
 * Re-time the plan for a new build length `nB`. Months inside the old build map through `mapFrom` (a window start) and
 * `mapTo` (a window end); months after go-live (hypercare, explicit later start or end months, current-state change
 * months) shift by the change in build length, so everything that happened a fixed time after go-live still does.
 * Items with no explicit month follow the build by themselves. The horizon does not move.
 */
function retime(q: Project, nB: number, mapFrom: (k: number) => number, mapTo: (k: number) => number): Project {
  const B = q.timeline.buildMonths;
  const H = q.timeline.horizonMonths;
  const d = nB - B;
  const late = (k: number) => clamp(k + d, 1, H);
  const from = (k: number) => (k > B ? late(k) : clamp(mapFrom(k), 1, nB));
  const to = (k: number) => (k > B ? late(k) : clamp(mapTo(k), 1, nB));
  const phases = q.timeline.phases ?? [];
  const hyperLine = (t: { phaseId?: string | undefined }) => t.phaseId === HYPERCARE_ID;
  for (const ph of phases) {
    if (ph.id === HYPERCARE_ID) { ph.fromMonth = late(ph.fromMonth); ph.toMonth = Math.max(ph.fromMonth, late(ph.toMonth)); continue; }
    ph.fromMonth = from(ph.fromMonth);
    ph.toMonth = Math.max(ph.fromMonth, to(ph.toMonth));
  }
  for (const t of q.build.team) {
    if (hyperLine(t)) {
      if (t.fromMonth !== undefined) t.fromMonth = late(t.fromMonth);
      if (t.toMonth !== undefined) t.toMonth = late(t.toMonth);
      continue;
    }
    if (t.fromMonth !== undefined) t.fromMonth = from(t.fromMonth);
    if (t.toMonth !== undefined) t.toMonth = Math.max(t.fromMonth ?? 1, to(t.toMonth));
  }
  for (const e of q.environments ?? []) {
    if (e.fromMonth !== undefined) e.fromMonth = e.production ? (e.fromMonth > B ? late(e.fromMonth) : e.fromMonth) : from(e.fromMonth);
    if (e.toMonth !== undefined) e.toMonth = e.production ? (e.toMonth > B && e.toMonth < H ? late(e.toMonth) : e.toMonth) : to(e.toMonth);
  }
  const after = <T extends Record<string, unknown>>(o: T, k: string) => { const v = o[k]; if (typeof v === "number" && v > B) (o as Record<string, unknown>)[k] = late(v); };
  for (const w of q.workloads) {
    after(w as unknown as Record<string, unknown>, "startMonth");
    after(w as unknown as Record<string, unknown>, "endMonth");
    if (w.oneTime?.month !== undefined && w.oneTime.month > B) w.oneTime.month = late(w.oneTime.month);
  }
  for (const c of q.benefits.capabilities) after(c as unknown as Record<string, unknown>, "startMonth");
  for (const a of q.benefits.avoidedCosts) after(a as unknown as Record<string, unknown>, "startMonth");
  for (const v of q.benefits.value) after(v as unknown as Record<string, unknown>, "startMonth");
  for (const o of q.benefits.oneOff) after(o as unknown as Record<string, unknown>, "month");
  for (const l of q.currentState?.lines ?? []) if (l.change.mode !== "keep" && l.change.fromMonth !== undefined && l.change.fromMonth > B) l.change.fromMonth = late(l.change.fromMonth);
  q.timeline.buildMonths = nB;
  return q;
}

/**
 * Move go-live by `by` months (later is positive), build length changing by the same amount, within 1 to 24 months.
 * The extra (or removed) months are at the end of the build: team lines and phases that ran to the end of the build
 * run to the new end, so labour grows or shrinks by the months added. See `retime` for what moves after go-live.
 */
export function shiftGoLive(q: Project, by: number): Project {
  const B = q.timeline.buildMonths;
  const nB = clamp(B + Math.round(by), 1, 24);
  if (nB === B) return q;
  return retime(q, nB, (k) => k, (k) => (k >= B ? nB : k));
}

/**
 * Stretch or shrink the build to `round(buildMonths x factor)` months, within 1 to 24. Team lines and phases with explicit
 * months scale in proportion (a window start k becomes floor((k - 1) x r) + 1, an end k becomes ceil(k x r), r = new / old).
 * People and hours per month do not change, so labour moves roughly in line with the length; people x weeks lines keep their
 * total hours and spread them over the longer or shorter window. Months after go-live shift by the change in length.
 */
export function scaleDeliveryLength(q: Project, factor: number): Project {
  const B = q.timeline.buildMonths;
  const nB = clamp(Math.round(B * factor), 1, 24);
  if (nB === B) return q;
  const r = nB / B;
  return retime(q, nB, (k) => Math.floor((k - 1) * r + 1e-9) + 1, (k) => Math.ceil(k * r - 1e-9));
}

/** Per-transaction and seat volumes the volume lever and drivers act on: the ones typed in, not read from another workload. */
export const hasTransactionVolume = (p: Project): boolean =>
  p.workloads.some((w) => w.kind === "transactionFee" && !w.volumeFrom) || (p.currentState?.lines ?? []).some((l) => l.basis.kind === "perTransaction" && !l.basis.volumeFrom);
export const hasSeatVolume = (p: Project): boolean => p.workloads.some((w) => w.kind === "seats" && !w.volumeFrom);

/**
 * Scale volumes by `factor`: transaction fee workloads, per-transaction current-state lines (when the volume is typed in)
 * and seat counts. A workload or line that reads its volume from another workload follows that workload, so it moves only when
 * the source is one of these. AI workloads, hosting requests and benefit volumes are not touched.
 */
export function scaleVolumes(q: Project, factor: number, what: "transactions" | "seats" | "both" = "both"): Project {
  if (what !== "seats") {
    for (const w of q.workloads) if (w.kind === "transactionFee" && !w.volumeFrom) { w.volumePerMonth *= factor; if (w.oneTime) w.oneTime.volume *= factor; }
    for (const l of q.currentState?.lines ?? []) if (l.basis.kind === "perTransaction" && !l.basis.volumeFrom && l.basis.volumePerMonth !== undefined) l.basis.volumePerMonth *= factor;
  }
  if (what !== "transactions") for (const w of q.workloads) if (w.kind === "seats" && !w.volumeFrom) { w.seats *= factor; if (w.oneTime) w.oneTime.volume *= factor; }
  return q;
}

/** The resource lines in play for resource levers: non-empty resource list and catalogue types. */
const typeOf = (cat: Catalog, r: Resource): ResourceType | undefined => cat.resourceTypes.find((t) => t.id === r.typeId);

/** Whether the resource can be reserved for `term`: pay-as-you-go now, the type offers the term and at least one meter has a cheaper reserved price. */
function reservable(book: PriceBook, cat: Catalog, r: Resource, term: "ri1" | "ri3"): boolean {
  const t = typeOf(cat, r);
  const sku = t?.skus.find((s) => s.id === r.skuId);
  if (!t || !sku || r.term !== "payg" || !t.options.includes(term)) return false;
  return t.meters.some((m) => { const u = sku.prices[m.id]; const o = u ? book.optionPrice(u, term) : undefined; return o !== undefined && o < book.unitPrice(u!); });
}
export const hasReservable = (p: Project, cat: Catalog, term: "ri1" | "ri3"): boolean => {
  const book = new PriceBook(cat, p.settings);
  return (p.resources ?? []).some((r) => reservable(book, cat, r, term));
};

/**
 * Reserve `coveragePct` percent of production capacity for one or three years. Over `project.resources`: every
 * pay-as-you-go resource that can be reserved (see `reservable`) is split in production into a pay-as-you-go row holding
 * (1 - c) of every quantity input and a reserved row holding c of them, so the blend is exactly c of the machines (or
 * GiB, or instances) at the reserved price and the rest at pay-as-you-go. Non-production environments keep the whole
 * resource at pay-as-you-go: a reservation bills all 730 hours, so reserving a dev or test machine that is off at night
 * costs more. Resources in no production environment, and those that cannot be reserved, are left alone.
 * Quantities can come out fractional (half of 3 machines is 1.5): they read as a blend, not a purchase order.
 */
export function reserveCoverage(q: Project, cat: Catalog, term: "ri1" | "ri3", coveragePct: number): Project {
  const c = clamp(coveragePct, 0, 100) / 100;
  if (c === 0 || !q.resources?.length) return q;
  const book = new PriceBook(cat, q.settings);
  const envs = q.environments ?? [];
  const prodIds = envs.filter((e) => e.production).map((e) => e.id);
  const out: Resource[] = [];
  const scaled = (r: Resource, f: number): Record<string, number> => Object.fromEntries(Object.entries(r.inputs).map(([k, v]) => [k, v * f]));
  for (const r of q.resources) {
    if (!reservable(book, cat, r, term)) { out.push(r); continue; }
    const where = r.envIds ?? envs.map((e) => e.id);
    const prodPart = envs.length === 0 ? undefined : where.filter((id) => prodIds.includes(id));
    if (prodPart && prodPart.length === 0) { out.push(r); continue; }
    const nonProd = envs.length === 0 ? [] : where.filter((id) => !prodIds.includes(id));
    if (c >= 1 && nonProd.length === 0) { out.push({ ...r, term }); continue; }
    const prodEnv = prodPart ? { envIds: prodPart } : {};
    out.push({ ...r, ...prodEnv, inputs: scaled(r, 1 - c) });
    out.push({ ...r, ...prodEnv, id: `${r.id}-${term}`, label: `${r.label} (${term === "ri1" ? "1-year" : "3-year"} reserved)`, inputs: scaled(r, c), term });
    if (nonProd.length) out.push({ ...r, id: `${r.id}-np`, label: `${r.label} (non-production)`, envIds: nonProd });
  }
  q.resources = out;
  return q;
}

/**
 * The SKUs a resource could step to: same type, same value for every text attribute (operating system, series, tier), and the
 * type's SKUs all carry a numeric size attribute (vCPU, memory, GiB). Ordered by price: the sum over meters of the
 * pay-as-you-go unit price x the meter's quantity factor, dearest last, catalogue order breaking ties.
 */
export function skuLadder(book: PriceBook, t: ResourceType, skuId: string): string[] {
  const sku = t.skus.find((s) => s.id === skuId);
  if (!sku) return [];
  const sized = t.skus.every((s) => Object.values(s.attrs).some((v) => typeof v === "number"));
  if (!sized) return [skuId];
  const text = (s: ResourceType["skus"][number]) => JSON.stringify(Object.entries(s.attrs).filter(([, v]) => typeof v === "string").sort());
  const price = (s: ResourceType["skus"][number]) => t.meters.reduce((sum, m) => { const u = s.prices[m.id]; return sum + (u ? book.unitPrice(u) * (m.quantity.factor ?? 1) : 0); }, 0);
  return t.skus.map((s, i) => ({ s, i })).filter(({ s }) => text(s) === text(sku)).sort((a, b) => price(a.s) - price(b.s) || a.i - b.i).map(({ s }) => s.id);
}

/** The SKU one step up or down the ladder, or undefined at the end of it (or when the price is unchanged, so the step means nothing). */
function stepTarget(book: PriceBook, t: ResourceType, skuId: string, dir: 1 | -1): string | undefined {
  const ladder = skuLadder(book, t, skuId);
  const at = ladder.indexOf(skuId);
  const next = ladder[at + dir];
  return at < 0 || next === undefined ? undefined : next;
}

export const hasSkuStep = (p: Project, cat: Catalog, dir: 1 | -1): boolean => {
  const book = new PriceBook(cat, p.settings);
  return (p.resources ?? []).some((r) => { const t = typeOf(cat, r); return !!t && stepTarget(book, t, r.skuId, dir) !== undefined; });
};

/** Move every resource that has a sibling SKU one size up (`1`) or down (`-1`); resources without one are skipped. */
export function stepSkus(q: Project, cat: Catalog, dir: 1 | -1): Project {
  const book = new PriceBook(cat, q.settings);
  for (const r of q.resources ?? []) {
    const t = typeOf(cat, r);
    const to = t ? stepTarget(book, t, r.skuId, dir) : undefined;
    if (to) r.skuId = to;
  }
  return q;
}

/** Whether the project has a non-production environment on an hour schedule, and resources to run in it. */
export const hasNonProdEnvironments = (p: Project): boolean => !!p.resources?.length && (p.environments ?? []).some((e) => !e.production);

/**
 * Scale the hours non-production environments run by `factor`: hours per day (days a month unchanged, capped at 24) or the
 * monthly hours. Production is untouched. Only hourly pay-as-you-go, Hybrid Benefit and dev/test meters follow the hours;
 * reserved capacity still bills all 730 (the ledger notes this).
 */
export function scaleNonProdHours(q: Project, factor: number): Project {
  for (const e of q.environments ?? []) {
    if (e.production) continue;
    if ("hoursPerDay" in e.schedule) e.schedule = { hoursPerDay: Math.min(24, e.schedule.hoursPerDay * factor), daysPerMonth: e.schedule.daysPerMonth };
    else e.schedule = { hoursPerMonth: Math.min(730, e.schedule.hoursPerMonth * factor) };
  }
  return q;
}

/** Scale every quantity input of every resource by `factor` (the generic resource and environment cost driver). */
export function scaleResourceQuantities(q: Project, factor: number): Project {
  for (const r of q.resources ?? []) r.inputs = Object.fromEntries(Object.entries(r.inputs).map(([k, v]) => [k, v * factor]));
  return q;
}

/** Scale what each current-state line costs today (monthly amount, FTE, unit cost), and with it the saving. */
export function scaleCurrentCosts(q: Project, factor: number): Project {
  for (const l of q.currentState?.lines ?? []) {
    const b = l.basis;
    if (b.kind === "monthly") b.amountCad *= factor;
    else if (b.kind === "fte") b.fte *= factor;
    else b.unitCostCad *= factor;
  }
  return q;
}
