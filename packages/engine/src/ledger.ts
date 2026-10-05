import type { Catalog } from "@studio/catalog";
import { PriceBook, monthDate, type PriceNote } from "./pricing.js";
import type { Project } from "./project.js";
import type { Percentile } from "./harness.js";
import { cashLine, workloadLines } from "./workloads.js";
import { oneTimeKey, workloadWindow } from "./features.js";
import { isCashItem } from "./project.js";
import { devLabLines, teamLines } from "./devlab.js";
import { avoidedMonthly, capabilityHours } from "./benefits.js";
import { line, sum, type Line, type Stream } from "./lines.js";

export interface MonthBenefit {
  /** Value of time saved, by capability id. */
  capabilities: Record<string, number>;
  avoided: number;
  oneOff: number;
}

export interface Month {
  m: number;
  date: string;
  phase: "build" | "production";
  /** 0..1 adoption in production; 0 during build. */
  adoption: number;
  lines: Line[];
  byStream: Record<Stream, number>;
  benefit: number;
  benefitBy: MonthBenefit;
}

export interface Ledger {
  months: Month[];
  /** 1-based month the run rate is read at: every workload that is still running has reached full volume. */
  steadyMonth: number;
  notes: PriceNote[];
  totals: { build: number; buildLabour: number; devLab: number; runRate: number; maintRate: number; benefitRate: number };
}

/** The month run-rate figures are read at (see `Ledger.steadyMonth`). */
export const steadyState = (ledger: Ledger): Month => ledger.months[ledger.steadyMonth - 1] ?? ledger.months.at(-1)!;

export const STREAMS: Stream[] = ["labour", "devlab", "devenv", "run", "platform", "maint", "transition"];

/**
 * The project as a month-by-month ledger.
 * - Build months: labour (by delivery phase window), AI Dev Lab and dev environment lines.
 * - Production months: workload lines (usage scaled by adoption and yearly growth, fixed in
 *   full), maintenance (labour escalates yearly) and transition costs in their window.
 * - Benefits: time saved scales with adoption, growth, preset and rate escalation; avoided
 *   costs are a step from their start month; one-off benefits land in their month.
 * Free allowances are applied once per meter per month.
 */
export function buildLedger(p: Project, catalog: Catalog, percentile: Percentile = "p50"): Ledger {
  const book = new PriceBook(catalog, p.settings);
  const B = p.timeline.buildMonths;
  const harnesses = new Map(p.harnesses.map((h) => [h.id, h]));
  const devCut = 1 - p.roi.devCutPct / 100;
  const maintCut = 1 - p.roi.maintCutPct / 100;
  const rates = new Map(p.rateCard.map((r) => [r.id, r.hourlyRate]));
  const growth = 1 + p.roi.growthPctPerYear / 100;
  const escalation = 1 + p.roi.rateEscalationPctPerYear / 100;
  const capFull = new Map(p.benefits.capabilities.map((c) => [c.id, capabilityHours(p, c, catalog.benchmarks).net * (rates.get(c.roleId) ?? 0)]));

  const contingency = 1 + p.build.contingencyPct / 100;
  /** Contingency on non-labour build costs (labour carries it in its rate); 1 when it covers labour only. */
  const nonLabourContingency = p.build.contingencyScope === "all" ? contingency : 1;
  let buildTotal = 0;
  const months: Month[] = [];
  for (let m = 1; m <= p.timeline.horizonMonths; m++) {
    const date = monthDate(p.startDate, m);
    let lines: Line[] = [];
    let adoption = 0;
    const benefitBy: MonthBenefit = { capabilities: {}, avoided: 0, oneOff: 0 };
    if (m <= B) {
      if (p.build.includeLabour) lines.push(...teamLines(p, p.build.team, "labour", "team", contingency, m));
      lines.push(...devLabLines(p, m, book, date));
      for (const it of p.build.environment) {
        if (isCashItem(it)) {
          if (it.cadence === "monthly" || m === Math.min(B, it.month ?? 1)) lines.push({ ...cashLine(`devenv:${it.id}`, "devenv", it, "devenv"), once: it.cadence === "once" });
        } else lines.push(line({ id: `devenv:${it.id}`, componentId: "devenv", label: it.label, stream: "devenv", behaviour: "fixed", meter: it.unitPriceId, quantity: it.quantity, unit: book.unit(it.unitPriceId).unit, unitPrice: book.unitPrice(it.unitPriceId), formula: `${it.quantity} × ${book.unit(it.unitPriceId).unit}` }));
      }
      lines = lines.map((l) => { const f = (l.stream === "labour" ? 1 : nonLabourContingency) * devCut; return { ...l, unitPrice: l.unitPrice * f, cost: l.cost * f }; });
      buildTotal += sum(lines.map((l) => l.cost));
    } else {
      const k = m - B; // production month, 1-based
      const r = p.timeline.adoptionRampMonths;
      adoption = r === 0 ? 1 : Math.min(1, k / r);
      const g = growth ** ((k - 1) / 12);
      const esc = escalation ** Math.floor((k - 1) / 12);
      for (const w of p.workloads) {
        // Each workload bills from its own start month to its end month and ramps on its own schedule (default: go-live and the project ramp).
        const win = workloadWindow(p, w);
        const active = m >= win.start && m <= win.end;
        const usage = (win.ramp === 0 ? 1 : Math.min(1, (m - win.start + 1) / win.ramp)) * g;
        for (const l of workloadLines(w, { book, date, harnesses, percentile, language: p.settings.language })) {
          if (l.once) { if (m === Math.max(B + 1, l.onceMonth ?? win.start)) lines.push(l); continue; }
          if (!active) continue;
          lines.push(l.behaviour === "usage" ? { ...l, quantity: l.quantity * usage, cost: l.cost * usage } : l);
        }
        const key = oneTimeKey(w);
        if (w.oneTime && key && m === Math.max(B + 1, w.oneTime.month ?? win.start)) {
          const once = { ...w, [key]: w.oneTime.volume } as typeof w;
          for (const l of workloadLines(once, { book, date, harnesses, percentile, language: p.settings.language })) {
            if (l.behaviour !== "usage" || l.once) continue;
            lines.push({ ...l, id: `${l.id}:once`, label: `${l.label} (one-time volume)`, behaviour: "fixed", once: true });
          }
        }
      }
      const maint = p.maintenance.mode === "none" ? []
        : p.maintenance.mode === "team"
        ? teamLines(p, p.maintenance.team, "maint", "maintenance", maintCut * esc)
        : [line({ id: "maintenance:pct", componentId: "maintenance", label: `Maintenance (${p.maintenance.pctPerYear}% of build per year)`, stream: "maint", behaviour: "fixed", meter: "maint-pct", quantity: 1, unit: "month", unitPrice: (buildTotal / devCut) * (p.maintenance.pctPerYear / 100 / 12) * maintCut, formula: `build × ${p.maintenance.pctPerYear}% ÷ 12` })];
      lines.push(...maint);
      for (const c of p.benefits.capabilities) {
        // Each capability ramps from its own go-live (the project's unless it says otherwise).
        const kc = m - Math.max(B + 1, c.liveFromMonth ?? B + 1) + 1;
        const ramp = kc <= 0 ? 0 : r === 0 ? 1 : Math.min(1, kc / r);
        benefitBy.capabilities[c.id] = capFull.get(c.id)! * ramp * g * esc;
      }
    }
    for (const t of p.roi.transitionCosts) {
      if (m >= t.fromMonth && m <= t.toMonth) lines.push(line({ id: `transition:${t.id}`, componentId: "transition", label: t.label, stream: "transition", behaviour: "fixed", meter: "transition", quantity: 1, unit: "month", unitPrice: t.monthly, formula: `CAD ${t.monthly}/month, months ${t.fromMonth}–${t.toMonth}` }));
    }
    // Headcount escalates with pay rates; a fixed amount (licence, contract) stays flat.
    const escNow = m > B ? escalation ** Math.floor((m - B - 1) / 12) : 1;
    for (const a of p.benefits.avoidedCosts) if (m >= (a.startMonth ?? B + 1)) benefitBy.avoided += avoidedMonthly(p, a) * (a.fte !== undefined && a.roleId ? escNow : 1);
    for (const o of p.benefits.oneOff) if (m === o.month) benefitBy.oneOff += o.amount;
    lines = applyFreeAllowances(lines, book);
    const byStream = Object.fromEntries(STREAMS.map((s) => [s, 0])) as Record<Stream, number>;
    for (const l of lines) byStream[l.stream] += l.cost;
    const benefit = sum(Object.values(benefitBy.capabilities)) + benefitBy.avoided + benefitBy.oneOff;
    months.push({ m, date, phase: m <= B ? "build" : "production", adoption, lines, byStream, benefit, benefitBy });
  }
  const last = months[months.length - 1]!;
  const buildMonths = months.filter((x) => x.phase === "build");
  const firstProjectFull = months.find((x) => x.phase === "production" && x.adoption >= 1) ?? last;
  // Steady state: also wait for every workload that has not ended to reach full volume.
  let steady = firstProjectFull.m;
  for (const w of p.workloads) {
    const win = workloadWindow(p, w);
    const full = win.start + Math.max(0, win.ramp - 1);
    if (full <= win.end) steady = Math.max(steady, Math.min(full, last.m));
  }
  const firstFull = months[steady - 1]!;
  const onceCost = sum(firstFull.lines.filter((l) => l.once && (l.stream === "run" || l.stream === "platform")).map((l) => l.cost));
  return {
    months,
    steadyMonth: steady,
    notes: [...book.notes.values()],
    totals: {
      build: sum(buildMonths.map((x) => x.byStream.labour + x.byStream.devlab + x.byStream.devenv)),
      buildLabour: sum(buildMonths.map((x) => x.byStream.labour)),
      devLab: sum(buildMonths.map((x) => x.byStream.devlab)),
      runRate: firstFull.byStream.run + firstFull.byStream.platform - onceCost,
      maintRate: firstFull.byStream.maint,
      benefitRate: sum([...capFull.values()]) + sum(p.benefits.avoidedCosts.map((a) => avoidedMonthly(p, a))),
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
