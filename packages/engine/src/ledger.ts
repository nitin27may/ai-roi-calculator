import type { Catalog } from "@studio/catalog";
import { PriceBook, monthDate, type PriceNote } from "./pricing.js";
import type { Project } from "./project.js";
import type { Percentile } from "./harness.js";
import { workloadLines } from "./workloads.js";
import { devLabLines, teamLines } from "./devlab.js";
import { line, sum, type Line, type Stream } from "./lines.js";

export interface Month {
  m: number;
  date: string;
  phase: "build" | "production";
  /** 0..1 adoption in production; 0 during build. */
  adoption: number;
  lines: Line[];
  byStream: Record<Stream, number>;
  benefit: number;
}

export interface Ledger {
  months: Month[];
  notes: PriceNote[];
  totals: { build: number; buildLabour: number; devLab: number; runRate: number; maintRate: number; benefitRate: number };
}

export const BENEFIT_PRESET = { conservative: 0.7, typical: 1, optimistic: 1.3 } as const;

/**
 * The project as a month-by-month ledger: build months carry labour, AI Dev Lab and dev
 * environment lines; production months carry workload lines (usage scaled by adoption,
 * fixed in full) and maintenance. Free allowances are applied once per meter per month.
 */
export function buildLedger(p: Project, catalog: Catalog, percentile: Percentile = "p50"): Ledger {
  const book = new PriceBook(catalog, p.settings);
  const B = p.timeline.buildMonths;
  const harnesses = new Map(p.harnesses.map((h) => [h.id, h]));
  const devCut = 1 - p.roi.devCutPct / 100;
  const maintCut = 1 - p.roi.maintCutPct / 100;
  const rates = new Map(p.rateCard.map((r) => [r.id, r.hourlyRate]));
  const preset = BENEFIT_PRESET[p.roi.benefitPreset];
  const benefitFull = sum(p.benefits.capabilities.map((c) => c.hoursSavedPerMonth * (rates.get(c.roleId) ?? 0))) * preset + sum(p.benefits.avoidedCosts.map((a) => a.monthly)) * preset;

  const contingency = 1 + p.build.contingencyPct / 100;
  let buildTotal = 0;
  const months: Month[] = [];
  for (let m = 1; m <= p.timeline.horizonMonths; m++) {
    const date = monthDate(p.startDate, m);
    let lines: Line[] = [];
    let adoption = 0;
    if (m <= B) {
      lines.push(...teamLines(p, p.build.team, "labour", "team", contingency));
      lines.push(...devLabLines(p, m, book, date));
      lines.push(...p.build.environment.map((it) => line({ id: `devenv:${it.id}`, componentId: "devenv", label: it.label, stream: "devenv", behaviour: "fixed", meter: it.unitPriceId, quantity: it.quantity, unit: book.unit(it.unitPriceId).unit, unitPrice: book.unitPrice(it.unitPriceId), formula: `${it.quantity} × ${book.unit(it.unitPriceId).unit}` })));
      lines = lines.map((l) => ({ ...l, unitPrice: l.unitPrice * devCut, cost: l.cost * devCut }));
      buildTotal += sum(lines.map((l) => l.cost));
    } else {
      const r = p.timeline.adoptionRampMonths;
      adoption = r === 0 ? 1 : Math.min(1, (m - B) / r);
      for (const w of p.workloads) {
        for (const l of workloadLines(w, { book, date, harnesses, percentile })) {
          lines.push(l.behaviour === "usage" ? { ...l, quantity: l.quantity * adoption, cost: l.cost * adoption } : l);
        }
      }
      const maint = p.maintenance.mode === "team"
        ? teamLines(p, p.maintenance.team, "maint", "maintenance", maintCut)
        : [line({ id: "maintenance:pct", componentId: "maintenance", label: `Maintenance (${p.maintenance.pctPerYear}% of build per year)`, stream: "maint", behaviour: "fixed", meter: "maint-pct", quantity: 1, unit: "month", unitPrice: (buildTotal / devCut) * (p.maintenance.pctPerYear / 100 / 12) * maintCut, formula: `build × ${p.maintenance.pctPerYear}% ÷ 12` })];
      lines.push(...maint);
    }
    lines = applyFreeAllowances(lines, book);
    const byStream = { labour: 0, devlab: 0, devenv: 0, run: 0, platform: 0, maint: 0 } as Record<Stream, number>;
    for (const l of lines) byStream[l.stream] += l.cost;
    months.push({ m, date, phase: m <= B ? "build" : "production", adoption, lines, byStream, benefit: m <= B ? 0 : benefitFull * adoption });
  }
  const last = months[months.length - 1]!;
  const buildMonths = months.filter((x) => x.phase === "build");
  return {
    months,
    notes: [...book.notes.values()],
    totals: {
      build: sum(buildMonths.map((x) => x.byStream.labour + x.byStream.devlab + x.byStream.devenv)),
      buildLabour: sum(buildMonths.map((x) => x.byStream.labour)),
      devLab: sum(buildMonths.map((x) => x.byStream.devlab)),
      runRate: last.byStream.run + last.byStream.platform,
      maintRate: last.byStream.maint,
      benefitRate: benefitFull,
    },
  };
}

/** Subtract per-month free allowances once per meter, spread pro rata over the lines using it. */
function applyFreeAllowances(lines: Line[], book: PriceBook): Line[] {
  const byMeter = new Map<string, Line[]>();
  for (const l of lines) {
    const u = book.catalog.unitPrices.find((x) => x.id === l.meter);
    if (!u?.freePerMonth) continue;
    byMeter.set(l.meter, [...(byMeter.get(l.meter) ?? []), l]);
  }
  if (byMeter.size === 0) return lines;
  const adjust = new Map<string, number>();
  for (const [meter, ls] of byMeter) {
    const free = book.unit(meter).freePerMonth!;
    const qty = sum(ls.map((l) => l.quantity));
    const factor = qty > 0 ? Math.max(0, qty - free) / qty : 1;
    for (const l of ls) adjust.set(l.id, factor);
  }
  return lines.map((l) => (adjust.has(l.id) ? { ...l, cost: l.cost * adjust.get(l.id)!, formula: `${l.formula} · free allowance ${book.unit(l.meter).freePerMonth} ${book.unit(l.meter).unit}/month` } : l));
}
