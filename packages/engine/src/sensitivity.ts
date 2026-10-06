import type { Catalog } from "@studio/catalog";
import type { Project } from "./project.js";
import { buildLedger } from "./ledger.js";
import { computeRoi, roiOptions } from "./roi.js";
import { applyEdit } from "./scenarios.js";
import { PriceBook, availableIn } from "./pricing.js";
import { workloadLines } from "./workloads.js";
import { resolveAssumptions } from "./assumptions.js";
import { requestVolumes } from "./hosting.js";
import { capabilityVolume, roiAssumptions } from "./benefits.js";

export interface SensitivityRow {
  id: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  /** NPV with the input at its low and high value (CAD). */
  low: number;
  high: number;
  /** |high − low|: how far this input alone can move NPV. */
  swing: number;
}

/** A driver mutates the project copy, and may swap `ctx.cat` for a re-priced copy of the catalogue. */
interface Ctx { cat: Catalog }
type Change = (p: Project, ctx: Ctx) => void;
type Driver = { id: string; label: string; low: [string, Change]; high: [string, Change]; applies?: (p: Project) => boolean };

/** Scale every token price (chat models: Azure and Snowflake credits; embeddings) by f. Returns a copy. */
function scaleTokenPrices(cat: Catalog, f: number): Catalog {
  const c = structuredClone(cat);
  const scaleTp = (t: { input: number; cachedInput: number; output: number; cacheWrite?: number | undefined } | undefined) => { if (!t) return; t.input *= f; t.cachedInput *= f; t.output *= f; if (t.cacheWrite !== undefined) t.cacheWrite *= f; };
  for (const m of c.chatModels) {
    if (m.prices) for (const k of ["global", "dataZone", "regional", "globalList"] as const) scaleTp(m.prices[k]);
    scaleTp(m.longContext?.prices);
    if (m.credits) { m.credits.input *= f; m.credits.output *= f; if (m.credits.cachedInput !== undefined) m.credits.cachedInput *= f; }
    for (const t of Object.values(m.tiers ?? {})) if ("prices" in t) scaleTp(t.prices);
  }
  for (const e of c.embeddingModels) {
    if (e.per1M !== undefined) e.per1M *= f;
    if (e.deployments?.regional !== undefined) e.deployments.regional *= f;
    if (e.deployments?.dataZone !== undefined) e.deployments.dataZone *= f;
  }
  return c;
}

/**
 * The exchange rate: Azure bills in USD, so the CAD price of everything on Azure moves with it. Scales token prices plus
 * per-hour speech, Azure unit prices and AI Search tiers by f. Snowflake credits and realtime/PTU rates are left alone.
 */
function scaleFx(cat: Catalog, f: number): Catalog {
  const c = scaleTokenPrices(cat, f);
  for (const s of c.speechEngines) {
    if (s.platform !== "azure") continue;
    if (s.perAudioHour !== undefined) s.perAudioHour *= f;
    if (s.diarizationAddOnPerHour !== undefined) s.diarizationAddOnPerHour *= f;
  }
  for (const u of c.unitPrices) if (u.platform === "azure" && u.price !== undefined) u.price *= f;
  for (const t of c.searchTiers) t.perSUMonth *= f;
  return c;
}

type CachedWorkload = { id: string; cacheHit: number };
const cacheWorkloads = (p: Project) => (p.workloads as unknown as { kind: string; id: string; cacheHit?: number }[]).filter((w) => (w.kind === "chat" || w.kind === "agent") && typeof w.cacheHit === "number") as CachedWorkload[];

/** Model ids that bill tokens in this project, with the workload cost they carry, dearest first. */
function modelSpend(p: Project, cat: Catalog): { modelId: string; spend: number }[] {
  const book = new PriceBook(cat, p.settings);
  const spend = new Map<string, number>();
  const harnesses = new Map(p.harnesses.map((h) => [h.id, h]));
  for (const w of p.workloads) {
    const modelId = (w as { modelId?: string }).modelId;
    if (!modelId || !["chat", "agent", "llm"].includes(w.kind)) continue;
    const cost = workloadLines(w, { book, date: p.startDate, harnesses, percentile: "p50", language: p.settings.language, assumptions: resolveAssumptions(p), volumes: requestVolumes(p.workloads) }).reduce((s, l) => s + l.cost, 0);
    spend.set(modelId, (spend.get(modelId) ?? 0) + cost);
  }
  return [...spend].map(([modelId, s]) => ({ modelId, spend: s })).sort((a, b) => b.spend - a.spend);
}

/** Output-weighted blended price per 1M tokens (3 in : 1 out), used only to rank models against each other. */
const blended = (cat: Catalog, p: Project, id: string): number => {
  const t = new PriceBook(cat, p.settings).tokenPrices(id, p.startDate);
  return (t.input * 3 + t.output) / 4;
};

/** Swap the project's costliest model for a cheaper (or dearer) Azure GA model, within what the project's deployment offers. */
function swapTarget(p: Project, cat: Catalog, dir: "cheaper" | "dearer"): { from: string; to: { id: string; label: string } } | null {
  const top = modelSpend(p, cat)[0];
  if (!top) return null;
  const cur = cat.chatModels.find((m) => m.id === top.modelId);
  if (!cur || cur.platform !== "azure") return null;
  const dep = p.settings.azureDeployment;
  const curPrice = blended(cat, p, cur.id);
  const pool = cat.chatModels
    .filter((m) => m.platform === "azure" && m.id !== cur.id && m.lifecycle.status === "ga" && availableIn(m, dep) && m.contextWindow >= cur.contextWindow / 4 && !!m.prices)
    .map((m) => ({ m, price: blended(cat, p, m.id) }))
    .filter((x) => (dir === "cheaper" ? x.price <= curPrice * 0.5 : x.price >= curPrice * 2));
  if (pool.length === 0) return null;
  // Nearest tier: the closest price to a halving (cheaper) or a doubling (dearer), not the extreme.
  const goal = dir === "cheaper" ? curPrice * 0.5 : curPrice * 2;
  pool.sort((a, b) => Math.abs(Math.log(a.price / goal)) - Math.abs(Math.log(b.price / goal)));
  const best = pool[0]!.m;
  return { from: cur.id, to: { id: best.id, label: best.label } };
}

/** Replace one model id everywhere workloads use it. */
function swapModel(q: Project, from: string, to: string) {
  for (const w of q.workloads as unknown as Record<string, unknown>[]) if (w.modelId === from) w.modelId = to;
}

const scaleRates = (p: Project, ids: Set<string>, f: number) => { for (const r of p.rateCard) if (ids.has(r.id)) r.hourlyRate *= f; };
/** Delivery rates move with the rate card, and so do manual rates on team lines. */
const scaleDeliveryRates = (p: Project, ids: Set<string>, f: number) => {
  scaleRates(p, ids, f);
  for (const t of [...p.build.team, ...(p.maintenance.mode === "team" ? p.maintenance.team : [])]) if (t.rateOverride !== undefined) t.rateOverride *= f;
};
const benefitRoles = (p: Project) => new Set([...p.benefits.capabilities.map((c) => c.roleId), ...p.benefits.avoidedCosts.flatMap((a) => (a.roleId ? [a.roleId] : []))]);
const deliveryRoles = (p: Project) => new Set([...p.build.team.map((t) => t.roleId), ...(p.maintenance.mode === "team" ? p.maintenance.team.map((t) => t.roleId) : [])]);
const scaleCapabilityVolume = (p: Project, f: number) => {
  // A capability linked to a workload scales that workload, so its run cost moves with the benefit.
  const linked = new Set(p.benefits.capabilities.flatMap((c) => (c.volumeFrom ? [c.volumeFrom] : [])));
  for (const w of p.workloads as unknown as Record<string, unknown>[]) {
    if (!linked.has(w.id as string)) continue;
    for (const k of ["users", "tasksPerMonth", "callsPerMonth", "emailsPerMonth", "queriesPerMonth", "interactionsPerMonth", "requestsPerMonth", "pagesPerMonth", "hoursPerMonth", "rowsPerMonth", "rows", "tokensPerMonth", "chunks"]) if (typeof w[k] === "number") w[k] = (w[k] as number) * f;
  }
  for (const c of p.benefits.capabilities) {
    if ((c.driver ?? "hours") === "hours") c.hoursSavedPerMonth *= f;
    if (c.users !== undefined) c.users *= f;
    if (c.itemsPerMonth !== undefined) c.itemsPerMonth *= f;
  }
};

/** Scale production usage while holding every capability's volume where it is. */
function scaleRunOnly(q: Project, f: number, cat: Catalog) {
  for (const c of q.benefits.capabilities) {
    if (!c.volumeFrom) continue;
    const v = capabilityVolume(q, c);
    c.users = v.users; c.itemsPerMonth = v.items;
    delete c.volumeFrom;
  }
  Object.assign(q, applyEdit(q, { kind: "scaleUsage", factor: f }, cat));
}

/** Change the build length; team lines that ran to the end of the build keep running to the new end. */
function setBuildLength(q: Project, n: number) {
  const B = q.timeline.buildMonths;
  for (const t of q.build.team) {
    if (t.toMonth === undefined || t.toMonth >= B) t.toMonth = n;
    if (t.fromMonth !== undefined && t.fromMonth > n) t.fromMonth = n;
  }
  q.timeline.buildMonths = n;
}

/**
 * One-at-a-time sensitivity of NPV (on the project's cost basis and discount rate) to the inputs
 * that usually decide an AI business case. Rows are sorted by swing, largest first, for a tornado.
 */
export function sensitivity(p: Project, cat: Catalog): { base: number; combined: { low: number; high: number }; rows: SensitivityRow[] } {
  const lib = cat.benchmarks;
  const cheaper = (() => { try { return swapTarget(p, cat, "cheaper"); } catch { return null; } })();
  const dearer = (() => { try { return swapTarget(p, cat, "dearer"); } catch { return null; } })();
  const a = roiAssumptions(p, lib);
  const npv = (q: Project, c: Catalog = cat) => computeRoi(buildLedger(q, c), q.roi.basis, q.roi.discountRatePct, roiOptions(q)).npv;
  const hasBenchmarked = p.benefits.capabilities.some((c) => (c.driver ?? "hours") !== "hours");
  const B = p.timeline.buildMonths;
  const drivers: Driver[] = [
    {
      id: "evidence", label: "Time saved per task (benchmark column)", applies: () => hasBenchmarked,
      // Keep adoption and realisation where they are; only the savings column moves.
      low: ["conservative", (q) => { q.roi.adoptionPct = a.adoptionPct; q.roi.realisationPct = a.realisationPct; q.roi.benefitPreset = "conservative"; }],
      high: ["optimistic", (q) => { q.roi.adoptionPct = a.adoptionPct; q.roi.realisationPct = a.realisationPct; q.roi.benefitPreset = "optimistic"; }],
    },
    { id: "adoption", label: "Adoption", applies: () => hasBenchmarked, low: [`${lib.presets.conservative.adoptionPct}%`, (q) => { q.roi.adoptionPct = lib.presets.conservative.adoptionPct; }], high: [`${lib.presets.optimistic.adoptionPct}%`, (q) => { q.roi.adoptionPct = lib.presets.optimistic.adoptionPct; }] },
    { id: "realisation", label: "Realisation", applies: () => hasBenchmarked, low: [`${lib.presets.conservative.realisationPct}%`, (q) => { q.roi.realisationPct = lib.presets.conservative.realisationPct; }], high: [`${lib.presets.optimistic.realisationPct}%`, (q) => { q.roi.realisationPct = lib.presets.optimistic.realisationPct; }] },
    { id: "users", label: "Users / volume of the work", low: ["−30%", (q) => scaleCapabilityVolume(q, 0.7)], high: ["+30%", (q) => scaleCapabilityVolume(q, 1.3)] },
    { id: "valueOfTime", label: "Value of an hour saved (benefit roles' rates)", low: ["−20%", (q) => scaleRates(q, benefitRoles(p), 0.8)], high: ["+20%", (q) => scaleRates(q, benefitRoles(p), 1.2)] },
    { id: "deliveryRates", label: "Delivery team rates", applies: () => p.build.includeLabour && p.build.team.some((t) => t.costed !== false), low: ["+20%", (q) => scaleDeliveryRates(q, deliveryRoles(p), 1.2)], high: ["−20%", (q) => scaleDeliveryRates(q, deliveryRoles(p), 0.8)] },
    { id: "runVolume", label: "AI run volume (same benefit)", low: ["×1.5", (q) => scaleRunOnly(q, 1.5, cat)], high: ["×0.7", (q) => scaleRunOnly(q, 0.7, cat)] },
    { id: "buildLength", label: "Build length (team stays on)", low: [`${Math.min(24, B + 2)} months`, (q) => setBuildLength(q, Math.min(24, B + 2))], high: [`${Math.max(1, B - 2)} months`, (q) => setBuildLength(q, Math.max(1, B - 2))] },
    { id: "ramp", label: "Adoption ramp", low: [`${p.timeline.adoptionRampMonths * 2 || 6} months`, (q) => { q.timeline.adoptionRampMonths = Math.min(24, p.timeline.adoptionRampMonths * 2 || 6); }], high: [`${Math.floor(p.timeline.adoptionRampMonths / 2)} months`, (q) => { q.timeline.adoptionRampMonths = Math.floor(p.timeline.adoptionRampMonths / 2); }] },
    { id: "tokenPrice", label: "Token prices (model list prices)", applies: () => modelSpend(p, cat).length > 0, low: ["+25%", (_q, x) => { x.cat = scaleTokenPrices(x.cat, 1.25); }], high: ["−25%", (_q, x) => { x.cat = scaleTokenPrices(x.cat, 0.75); }] },
    {
      id: "cacheHit", label: "Prompt cache hit rate", applies: () => cacheWorkloads(p).length > 0,
      low: ["half as many hits", (q) => { for (const w of q.workloads as unknown as CachedWorkload[]) if (typeof w.cacheHit === "number") w.cacheHit *= 0.5; }],
      high: ["half the misses gone", (q) => { for (const w of q.workloads as unknown as CachedWorkload[]) if (typeof w.cacheHit === "number") w.cacheHit += (1 - w.cacheHit) * 0.5; }],
    },
    {
      id: "modelSwap", label: cheaper || dearer ? `Model choice (${(cheaper ?? dearer)!.from})` : "Model choice", applies: () => cheaper !== null || dearer !== null,
      low: [dearer ? `to ${dearer.to.label}` : "no change", (q) => { if (dearer) swapModel(q, dearer.from, dearer.to.id); }],
      high: [cheaper ? `to ${cheaper.to.label}` : "no change", (q) => { if (cheaper) swapModel(q, cheaper.from, cheaper.to.id); }],
    },
    { id: "fx", label: "Exchange rate (USD-priced Azure services)", low: ["+5%", (_q, x) => { x.cat = scaleFx(x.cat, 1.05); }], high: ["−5%", (_q, x) => { x.cat = scaleFx(x.cat, 0.95); }] },
    { id: "growth", label: "Usage growth per year", low: ["0%", (q) => { q.roi.growthPctPerYear = 0; }], high: [`${Math.max(20, p.roi.growthPctPerYear * 2)}%`, (q) => { q.roi.growthPctPerYear = Math.max(20, p.roi.growthPctPerYear * 2); }] },
  ];
  const base = npv(p);
  const active = drivers.filter((d) => d.applies?.(p) ?? true);
  // Every input at its unfavourable (or favourable) end at once: the corners one-at-a-time bars hide.
  const apply = (q: Project, fs: Change[]) => { const x: Ctx = { cat }; for (const f of fs) f(q, x); return npv(q, x.cat); };
  const all = (end: "low" | "high") => apply(structuredClone(p), active.map((d) => d[end][1]));
  const combined = { low: all("low"), high: all("high") };
  const rows = active.map((d) => {
    const low = apply(structuredClone(p), [d.low[1]]), high = apply(structuredClone(p), [d.high[1]]);
    return { id: d.id, label: d.label, lowLabel: d.low[0], highLabel: d.high[0], low, high, swing: Math.abs(high - low) };
  });
  return { base, combined, rows: rows.sort((x, y) => y.swing - x.swing) };
}
