import type { Catalog } from "@studio/catalog";
import type { Ledger } from "./ledger.js";
import type { Project } from "./project.js";
import type { RoiResult } from "./roi.js";
import { basisCost } from "./roi.js";

export type Row = Record<string, string | number>;

const r2 = (n: number) => Math.round(n * 100) / 100;

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

/** Headline figures as label/value rows. */
export function summaryRows(p: Project, ledger: Ledger, roi: RoiResult): Row[] {
  const t = ledger.totals;
  const basis = { run: "Running cost only", runMaint: "Running + maintenance", full: "Full lifecycle" }[p.roi.basis];
  return [
    { Item: "Project", Value: p.name },
    { Item: "Currency", Value: "CAD" },
    { Item: "First build month", Value: p.startDate },
    { Item: "Build months", Value: p.timeline.buildMonths },
    { Item: "Plan length (months)", Value: p.timeline.horizonMonths },
    { Item: "Build cost", Value: r2(t.build) },
    { Item: "  of which labour", Value: r2(t.buildLabour) },
    { Item: "  of which AI Dev Lab", Value: r2(t.devLab) },
    { Item: "Production run-rate per month (full adoption)", Value: r2(t.runRate) },
    { Item: "Maintenance per month", Value: r2(t.maintRate) },
    { Item: "Benefit per month (full adoption)", Value: r2(t.benefitRate) },
    { Item: "ROI measured against", Value: basis },
    { Item: "Total cost over plan", Value: r2(roi.totalCost) },
    { Item: "Total benefit over plan", Value: r2(roi.totalBenefit) },
    { Item: "Net", Value: r2(roi.totalBenefit - roi.totalCost) },
    { Item: "ROI", Value: `${Math.round(roi.roi * 100)}%` },
    { Item: `NPV at ${roi.discountRatePct}%`, Value: r2(roi.npv) },
    { Item: "Payback month", Value: roi.paybackMonth ?? "Not within plan" },
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
