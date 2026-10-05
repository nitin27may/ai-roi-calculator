import type { Catalog } from "@studio/catalog";
import type { PriceNote } from "./pricing.js";
import { steadyState, type Ledger, type Month } from "./ledger.js";
import type { Project } from "./project.js";
import type { RoiResult } from "./roi.js";
import { basisCost } from "./roi.js";
import { sum, type Stream } from "./lines.js";
import { beforeAfter, workloadVolume } from "./benefits.js";
import { sensitivity, type SensitivityRow } from "./sensitivity.js";
import { projectRange, type ProjectRange } from "./ranges.js";
import { verdictFor } from "./present.js";

export type Row = Record<string, string | number>;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface WaterfallStep {
  id: "build" | "year1Run" | "laterRun" | "benefit" | "net";
  label: string;
  /** CAD; cost steps are positive magnitudes, benefit and net carry their sign. */
  value: number;
  color: "build" | "run" | "benefit" | "ink";
}

/** Colour key for a cost driver, mapped to the one-meaning-per-colour tokens in the UI. */
export type DriverColor = "labour" | "devlab" | "run" | "platform" | "maint" | "other";

export interface CostDriverRow { label: string; value: number; color: DriverColor }

export interface UnitCostRow { id: string; label: string; unit: string; perUnit: number; baselinePerUnit: number | null }

export interface AlertGroup { id: "notOffered" | "retiring" | "tierFallback" | "lowConfidence" | "other"; label: string; count: number; items: string[] }

export interface Verdict { text: string; npvPositive: boolean; paysBack: boolean; tone: "ok" | "warn" | "crit" }

export interface Summary {
  basis: Project["roi"]["basis"];
  totalCost: number;
  totalBenefit: number;
  build: number;
  devLabShare: number;
  steadyStateAnnualRun: number;
  year1Run: number;
  benefitPerYear: number;
  npv: number;
  discountRatePct: number;
  roi: number;
  paybackMonth: number | null;
  paysBackWithinPlan: boolean;
  /** Payback with each month discounted at the discount rate; null when not reached within the plan. */
  discountedPaybackMonth: number | null;
  /** Annual internal rate of return in percent; null when the cash flows never change sign. */
  irrPct: number | null;
  hurdleRatePct: number | null;
  clearsHurdle: boolean | null;
  terminalValue: number;
  /** Low / expected / high across the pessimistic, expected and optimistic cases (see ranges.ts). */
  range: ProjectRange;
  horizonMonths: number;
  waterfall: WaterfallStep[];
  costDrivers: CostDriverRow[];
  unitCosts: UnitCostRow[];
  alerts: AlertGroup[];
  sensitivityTop3: SensitivityRow[];
  verdict: Verdict;
}

const ALERT_GROUP: Record<PriceNote["kind"], AlertGroup["id"]> = {
  unavailable: "notOffered",
  retired: "retiring",
  deprecated: "retiring",
  "promo-ended": "retiring",
  "tier-unavailable": "tierFallback",
  unverified: "lowConfidence",
  "long-context": "other",
  routing: "other",
  quota: "other",
  capacity: "other",
};
const ALERT_LABEL: Record<AlertGroup["id"], string> = {
  notOffered: "Not offered in this deployment",
  retiring: "Retiring or ending soon",
  tierFallback: "Processing tier fell back to Standard",
  lowConfidence: "Low confidence or unverified price",
  other: "Other notices",
};

/** Alert counts and top items by severity group, reusing the PriceBook notes the Overview lists. */
export function alertSummary(ledger: Ledger): AlertGroup[] {
  const byGroup = new Map<AlertGroup["id"], string[]>();
  for (const n of ledger.notes) {
    const g = ALERT_GROUP[n.kind];
    byGroup.set(g, [...(byGroup.get(g) ?? []), n.message]);
  }
  const order: AlertGroup["id"][] = ["notOffered", "retiring", "tierFallback", "lowConfidence", "other"];
  return order.filter((id) => byGroup.has(id)).map((id) => ({ id, label: ALERT_LABEL[id], count: byGroup.get(id)!.length, items: byGroup.get(id)!.slice(0, 3) }));
}

const STREAM_WORD: Record<Stream, string> = { labour: "Building", devlab: "Building", devenv: "Building", run: "Running", platform: "Platform", maint: "Maintenance", transition: "Maintenance" };
const STREAM_DRIVER_COLOR: Record<Stream, DriverColor> = { labour: "labour", devlab: "devlab", devenv: "devlab", run: "run", platform: "platform", maint: "maint", transition: "maint" };

/**
 * Top 5 cost lines over the whole plan (by stream and label, summed across months) plus an
 * "Other" remainder. Each row is prefixed with its stream in plain words — the same line label
 * can otherwise read as, say, production cost when it is really the maintenance team. Build
 * labour lines already lead with their own delivery phase (e.g. "Build: Dev A (AI developer)"
 * from `teamLines()` in devlab.ts); that phase is dropped so the stream prefix doesn't double up.
 */
export function costDrivers(ledger: Ledger): CostDriverRow[] {
  const byKey = new Map<string, { label: string; value: number; color: DriverColor }>();
  for (const mo of ledger.months) for (const l of mo.lines) {
    const label = l.stream === "labour" ? l.label.replace(/^[^:]+:\s*/, "") : l.label;
    const key = `${l.stream}:${label}`;
    const row = byKey.get(key);
    if (row) row.value += l.cost;
    else byKey.set(key, { label: `${STREAM_WORD[l.stream]}: ${label}`, value: l.cost, color: STREAM_DRIVER_COLOR[l.stream] });
  }
  const sorted = [...byKey.values()].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const other = sorted.slice(5).reduce((s, r) => s + r.value, 0);
  return other > 0 ? [...top, { label: "Other", value: other, color: "other" }] : top;
}

const UNIT_LABEL: Record<string, string> = {
  users: "active user", tasksPerMonth: "task", callsPerMonth: "call", emailsPerMonth: "email",
  queriesPerMonth: "query", interactionsPerMonth: "interaction", pagesPerMonth: "page",
  requestsPerMonth: "request", hoursPerMonth: "audio hour",
};

/**
 * Cost per active user per month, and per transaction/task/document where a workload's volume
 * supports it. Per-user rows lead (executives read "per seat" first), then per-item rows, each
 * ordered by cost descending; capped to a small, defensible set.
 */
export function unitCosts(p: Project, ledger: Ledger, cat: Catalog): UnitCostRow[] {
  const firstFull = steadyState(ledger);
  const ba = beforeAfter(p, cat.benchmarks, ledger.totals);
  const perUser: UnitCostRow[] = [];
  const perItem: UnitCostRow[] = [];
  for (const w of p.workloads) {
    const id = w.id, label = w.label;
    const v = workloadVolume(w);
    const cost = sum(firstFull.lines.filter((l) => l.componentId === id && (l.stream === "run" || l.stream === "platform") && !l.once).map((l) => l.cost));
    if (cost <= 0) continue;
    const cap = p.benefits.capabilities.find((c) => c.volumeFrom === id);
    const baseRow = cap ? ba.rows.find((r) => r.id === cap.id) : undefined;
    if (v.users) {
      const baseline = baseRow?.baselineHours !== null && baseRow !== undefined ? baseRow.before / v.users : null;
      perUser.push({ id: `${id}:user`, label: `${label} — per active user per month`, unit: UNIT_LABEL.users!, perUnit: cost / v.users, baselinePerUnit: baseline });
    } else if (v.items && v.itemsKey) {
      const unit = UNIT_LABEL[v.itemsKey] ?? "item";
      const baseline = baseRow?.baselineHours !== null && baseRow !== undefined ? baseRow.before / v.items : null;
      perItem.push({ id: `${id}:item`, label: `${label} — per ${unit}`, unit, perUnit: cost / v.items, baselinePerUnit: baseline });
    }
  }
  const byCostDesc = (a: UnitCostRow, b: UnitCostRow) => b.perUnit - a.perUnit;
  return [...perUser.sort(byCostDesc), ...perItem.sort(byCostDesc)].slice(0, 4);
}

/**
 * Everything the Summary page, the Report and the Excel export show, computed once so all
 * three always agree. Costs are on the project's selected basis (`p.roi.basis`); cost drivers
 * and unit costs look at the full lifecycle so "where the money goes" doesn't depend on it.
 */
export function summarize(p: Project, ledger: Ledger, roi: RoiResult, cat: Catalog): Summary {
  const t = ledger.totals;
  const B = p.timeline.buildMonths;
  const production = ledger.months.filter((m): m is Month => m.phase === "production");
  const costOf = (months: Month[]) => sum(months.map((m) => basisCost(m, roi.basis)));
  const buildCost = costOf(ledger.months.slice(0, B));
  const year1 = production.slice(0, 12);
  const year1Run = costOf(year1);
  const laterRun = roi.totalCost - buildCost - year1Run;
  const net = roi.totalBenefit - roi.totalCost;
  const paysBackWithinPlan = roi.paybackMonth !== null;
  const verdict = verdictFor(roi);
  return {
    basis: roi.basis,
    totalCost: roi.totalCost,
    totalBenefit: roi.totalBenefit,
    build: t.build,
    devLabShare: t.build > 0 ? t.devLab / t.build : 0,
    steadyStateAnnualRun: (t.runRate + t.maintRate) * 12,
    year1Run,
    benefitPerYear: t.benefitRate * 12,
    npv: roi.npv,
    discountRatePct: roi.discountRatePct,
    roi: roi.roi,
    paybackMonth: roi.paybackMonth,
    paysBackWithinPlan,
    discountedPaybackMonth: roi.discountedPaybackMonth,
    irrPct: roi.irrPct,
    hurdleRatePct: roi.hurdleRatePct,
    clearsHurdle: roi.clearsHurdle,
    terminalValue: roi.terminalValue,
    range: projectRange(p, cat, { expected: { ledger, roi } }),
    horizonMonths: p.timeline.horizonMonths,
    waterfall: [
      { id: "build", label: "Building & testing", value: buildCost, color: "build" },
      { id: "year1Run", label: "Running — year 1", value: year1Run, color: "run" },
      { id: "laterRun", label: "Running — later years", value: laterRun, color: "run" },
      { id: "benefit", label: "Benefit", value: roi.totalBenefit, color: "benefit" },
      { id: "net", label: "Net", value: net, color: "ink" },
    ],
    costDrivers: costDrivers(ledger),
    unitCosts: unitCosts(p, ledger, cat),
    alerts: alertSummary(ledger),
    sensitivityTop3: sensitivity(p, cat).rows.slice(0, 3),
    verdict,
  };
}

/** Every priced line in every month, with the formula that produced it. */
export function lineItemRows(ledger: Ledger): Row[] {
  return ledger.months.flatMap((mo) =>
    mo.lines.map((l) => ({
      Month: mo.m, Date: mo.date, Phase: mo.phase, Stream: l.stream, Component: l.componentId, Item: l.label,
      Quantity: Math.round(l.quantity * 1000) / 1000, Unit: l.unit, "Unit price (CAD)": Math.round(l.unitPrice * 1e6) / 1e6, "Cost (CAD)": r2(l.cost),
      Behaviour: l.behaviour, Meter: l.meter, Formula: l.formula,
    })));
}

/** One row per month: cost by stream, benefit, the basis cost and the cumulative position. */
export function monthRows(ledger: Ledger, roi: RoiResult): Row[] {
  return ledger.months.map((mo, i) => ({
    Month: mo.m, Date: mo.date, Phase: mo.phase, Adoption: Math.round(mo.adoption * 100) / 100,
    "Build labour": r2(mo.byStream.labour), "AI Dev Lab": r2(mo.byStream.devlab), "Dev environment": r2(mo.byStream.devenv),
    "Production AI usage": r2(mo.byStream.run), "Platform": r2(mo.byStream.platform), Maintenance: r2(mo.byStream.maint), Transition: r2(mo.byStream.transition),
    [`Cost (${roi.basis})`]: r2(basisCost(mo, roi.basis)), Benefit: r2(mo.benefit), "Cumulative net": r2(roi.cumulative[i]!),
  }));
}

/**
 * Headline figures as label/value rows, built on `summarize()` so the Excel Summary sheet,
 * the Summary page and the Report always show the same numbers.
 */
export function summaryRows(p: Project, ledger: Ledger, roi: RoiResult, cat: Catalog): Row[] {
  const t = ledger.totals;
  const s = summarize(p, ledger, roi, cat);
  const basis = { run: "Running cost only", runMaint: "Running + maintenance", full: "Full lifecycle" }[p.roi.basis];
  return [
    { Item: "Project", Value: p.name },
    { Item: "Currency", Value: "CAD" },
    { Item: "First build month", Value: p.startDate },
    { Item: "Build months", Value: p.timeline.buildMonths },
    { Item: "Plan length (months)", Value: s.horizonMonths },
    { Item: "Build cost", Value: r2(s.build) },
    { Item: "  of which labour", Value: r2(t.buildLabour) },
    { Item: "  of which AI Dev Lab", Value: r2(t.devLab) },
    { Item: "Year-1 run cost", Value: r2(s.year1Run) },
    { Item: "Steady-state annual run (run + platform + maintenance)", Value: r2(s.steadyStateAnnualRun) },
    { Item: "Benefit per year (full adoption)", Value: r2(s.benefitPerYear) },
    { Item: "ROI measured against", Value: basis },
    { Item: "Total cost over plan", Value: r2(s.totalCost) },
    { Item: "Total benefit over plan", Value: r2(s.totalBenefit) },
    { Item: "Net", Value: r2(s.totalBenefit - s.totalCost) },
    { Item: "ROI", Value: `${Math.round(s.roi * 100)}%` },
    { Item: `NPV at ${s.discountRatePct}%`, Value: r2(s.npv) },
    { Item: "Payback month", Value: s.paybackMonth ?? "Not within plan" },
    { Item: "Payback month, discounted", Value: s.discountedPaybackMonth ?? "Not within plan" },
    { Item: "IRR (annual)", Value: s.irrPct === null ? "Not defined" : `${s.irrPct.toFixed(1)}%` },
    ...(s.hurdleRatePct !== null ? [{ Item: `Hurdle rate ${s.hurdleRatePct}%`, Value: s.clearsHurdle === null ? "n/a" : s.clearsHurdle ? "Cleared" : "Not cleared" }] : []),
    { Item: "Total cost, low to high", Value: `${r2(s.range.totalCost.low)} to ${r2(s.range.totalCost.high)}` },
    { Item: "NPV, low to high", Value: `${r2(s.range.npv.low)} to ${r2(s.range.npv.high)}` },
    { Item: "Verdict", Value: `${s.verdict.text} · NPV ${s.verdict.npvPositive ? "positive" : "negative"}` },
  ];
}

/** The catalogue prices the estimate actually used, with their source and confidence. */
export function pricesUsedRows(ledger: Ledger, cat: Catalog): Row[] {
  const used = new Set(ledger.months.flatMap((m) => m.lines.map((l) => l.meter)));
  const rows: Row[] = [];
  const add = (id: string, label: string, kind: string, source: { kind: string; url?: string | undefined; retrievedAt: string }, confidence: string) =>
    rows.push({ Id: id, Item: label, Type: kind, Source: source.kind, Retrieved: source.retrievedAt, Confidence: confidence, URL: source.url ?? "" });
  for (const m of cat.chatModels) if (used.has(m.id)) add(m.id, m.label, "Model", m.source, m.confidence);
  for (const m of cat.embeddingModels) if (used.has(m.id)) add(m.id, m.label, "Embedding", m.source, m.confidence);
  for (const m of cat.speechEngines) if (used.has(m.id)) add(m.id, m.label, "Speech", m.source, m.confidence);
  for (const m of cat.realtimeModels) if (used.has(m.id)) add(m.id, m.label, "Realtime", m.source, m.confidence);
  for (const u of cat.unitPrices) if (used.has(u.id)) add(u.id, u.label, "Service", u.source, u.confidence);
  for (const t of cat.searchTiers) if (used.has(`search-${t.id}`)) add(t.id, `AI Search ${t.label}`, "Search tier", t.source, t.confidence);
  return rows;
}

/** CSV with a header row; quotes fields that need it. */
export function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
