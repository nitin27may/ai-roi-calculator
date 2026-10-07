"use client";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { LABOUR_EXCLUDED_TEXT, WIDE_RANGE_TEXT, formatIrr, irrBand, moneyBand, type AlertGroup, type Summary } from "@roi-calculator/engine";
import { Pill } from "@/components/ui";
import { cad, fmt } from "@/lib/format";

/** Pieces of the Summary page that the printed Report reuses, so both always read the same. */

export const ALERT_TONE: Record<AlertGroup["id"], "ok" | "warn" | "crit" | "n"> = {
  notOffered: "crit", retiring: "crit", tierFallback: "warn", lowConfidence: "warn", other: "n",
};

export const WATERFALL_COST_IDS = ["build", "year1Run", "laterRun"];

/** The biggest sensitivity drivers, in plain words, for the "wide range" note. */
export const wideDrivers = (s: Summary) => s.sensitivityTop3.map((r) => r.label);

export function VerdictChip({ verdict }: { verdict: { text: string; npvPositive: boolean; tone: "ok" | "warn" | "crit" } }) {
  const Icon = verdict.tone === "ok" ? CheckCircle2 : verdict.tone === "warn" ? AlertTriangle : XCircle;
  const toneCls = { ok: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", crit: "bg-crit-soft text-crit" }[verdict.tone];
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${toneCls}`}>
      <Icon size={16} aria-hidden="true" />
      <span>{verdict.text} · NPV {verdict.npvPositive ? "positive" : "negative"}</span>
    </div>
  );
}

const span = (r: { low: number; high: number }) => `${cad(r.low)} to ${cad(r.high)}`;
const paybackSpan = (r: { best: number | null; worst: number | null }, horizon: number) =>
  r.best === null ? `Not within ${horizon} months` : `Month ${r.best} to ${r.worst === null ? `after ${horizon}` : r.worst}`;

/** The note that replaces a range too wide to read; names the drivers when it can. */
function WideNote({ s, anchor }: { s: Summary; anchor: boolean }) {
  const drivers = wideDrivers(s);
  const title = drivers.length ? `Biggest drivers: ${drivers.join(", ")}` : undefined;
  return anchor
    ? <a href="#how-sure" className="text-warn underline underline-offset-2 print:no-underline" title={title}>{WIDE_RANGE_TEXT}</a>
    : <span className="text-warn" title={title}>{WIDE_RANGE_TEXT}</span>;
}

/**
 * Six headline tiles. A range shows as "low to high" only when it is narrow enough to read (see moneyBand);
 * otherwise the tile says so and points at "How sure are we?". The full numbers stay in that card's table view.
 */
export function HeadlineTiles({ s, linkWide = true }: { s: Summary; linkWide?: boolean }) {
  const tiles: { label: string; value: string; sub?: string; range?: ReactNode }[] = [
    { label: "Total cost over plan", value: cad(s.totalCost), sub: `${s.horizonMonths} months · ${s.basisLabel}`, range: moneyBand(s.range.totalCost).wide ? <WideNote s={s} anchor={linkWide} /> : span(s.range.totalCost) },
    { label: "Build", value: cad(s.build), sub: s.labourExcluded ? LABOUR_EXCLUDED_TEXT : s.labourPartial ? s.labourPartial : `${fmt(s.devLabShare * 100)}% AI Dev Lab`, range: moneyBand(s.range.build).wide ? <WideNote s={s} anchor={linkWide} /> : span(s.range.build) },
    { label: "Annual run (steady state)", value: cad(s.steadyStateAnnualRun), sub: "run + platform + maintenance", range: moneyBand(s.range.annualRun).wide ? <WideNote s={s} anchor={linkWide} /> : span(s.range.annualRun) },
    { label: "Benefit per year", value: cad(s.benefitPerYear), sub: "at full adoption", range: moneyBand(s.range.totalBenefit).wide ? <WideNote s={s} anchor={linkWide} /> : undefined },
    { label: "NPV", value: cad(s.npv), sub: `at ${s.discountRatePct}% · ${s.basisLabel}`, range: moneyBand(s.range.npv).wide ? <WideNote s={s} anchor={linkWide} /> : span(s.range.npv) },
    { label: "Payback", value: s.paybackMonth ? `Month ${s.paybackMonth}` : `> ${s.horizonMonths} months`, sub: `ROI ${fmt(s.roi * 100)}% · ${s.basisLabel}`, range: paybackSpan(s.range.payback, s.horizonMonths) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6 print:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 rounded-lg border border-line bg-surface px-3.5 py-2.5">
          <div className="truncate text-xs text-muted">{t.label}</div>
          <div className="num truncate font-display text-xl font-bold leading-tight">{t.value}</div>
          {t.sub && <div className="text-xs text-ink-2" title={t.sub}>{t.sub}</div>}
          {t.range && <div className="num text-xs leading-tight text-muted">{t.range}</div>}
        </div>
      ))}
    </div>
  );
}

/** Current state against the target, from `summarize()`. Render only when `s.currentLineCount > 0`. */
export function CurrentVsTargetTile({ s, className = "px-3.5 pb-3.5" }: { s: Summary; className?: string }) {
  const c = s.currentVsTarget;
  const rows: [string, string, string][] = [
    ["Current cost per month", cad(c.currentMonthly), `${s.currentLineCount} line${s.currentLineCount === 1 ? "" : "s"}, before any change`],
    ["Target run cost per month", cad(c.targetMonthly), "steady state: running, platform and maintenance"],
    ["Saving per month", cad(c.saving), "every change in effect, full adoption"],
    ["Dual-running cost", cad(c.dualRunningCost), "current cost still paid while the target is billed"],
  ];
  return (
    <dl className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[12.5px] ${className}`} data-testid="current-vs-target">
      {rows.map(([k, v, note]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}<small className="block text-muted">{note}</small></dt>
          <dd className="num self-center text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Finance measures as label/value rows. IRR is capped in text and its range shows only when it is narrow. */
export function FinanceMeasures({ s, className = "px-3.5 pb-3.5" }: { s: Summary; className?: string }) {
  const irr = irrBand(s.range.irrPct);
  const irrNote = s.range.irrPct
    ? irr.shown ? `${fmt(s.range.irrPct.low)}% to ${fmt(s.range.irrPct.high)}% across the three cases` : undefined
    : undefined;
  const rows: [string, ReactNode, ReactNode?][] = [
    ["Internal rate of return (IRR)", formatIrr(s.irrPct), irrNote ?? (irr.wide ? <WideNote s={s} anchor /> : undefined)],
    ["Hurdle rate", s.hurdleRatePct === null ? "Not set" : `${fmt(s.hurdleRatePct)}% a year`, s.clearsHurdle === null ? undefined : s.clearsHurdle ? "IRR clears the hurdle" : "IRR is below the hurdle"],
    ["Payback", s.paybackMonth ? `Month ${s.paybackMonth}` : `Not within ${s.horizonMonths} months`],
    ["Payback after discounting", s.discountedPaybackMonth ? `Month ${s.discountedPaybackMonth}` : `Not within ${s.horizonMonths} months`, s.discountRatePct === 0 ? "Same as payback at a 0% rate" : undefined],
    ["NPV", cad(s.npv), `at ${s.discountRatePct}%`],
    ...(s.terminalValue > 0 ? [["Terminal value (in NPV and IRR)", cad(s.terminalValue)] as [string, string]] : []),
  ];
  return (
    <dl className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[12.5px] ${className}`}>
      {rows.map(([k, v, note]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}{note && <span className="block text-xs text-muted">{note}</span>}</dt>
          <dd className="num self-center text-right font-semibold text-ink" title={k.startsWith("Internal") && s.irrPct !== null ? `Full figure: ${fmt(s.irrPct, 1)}% a year` : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WaterfallTable({ s }: { s: Summary }) {
  return (
    <table className="data">
      <thead><tr><th>Step</th><th className="n">Amount</th></tr></thead>
      <tbody>{s.waterfall.map((w) => {
        const signed = WATERFALL_COST_IDS.includes(w.id) ? -w.value : w.value;
        return <tr key={w.id}><td>{w.label}</td><td className="n">{signed >= 0 ? "+" : ""}{cad(signed)}</td></tr>;
      })}</tbody>
    </table>
  );
}

export function CumulativeTable({ values }: { values: number[] }) {
  return (
    <table className="data">
      <thead><tr><th>Month</th><th className="n">Cumulative net</th></tr></thead>
      <tbody>{values.map((v, i) => <tr key={i}><td>Month {i + 1}</td><td className="n">{cad(v)}</td></tr>)}</tbody>
    </table>
  );
}

export function DriversTable({ rows }: { rows: { label: string; value: number }[] }) {
  return (
    <table className="data">
      <thead><tr><th>Cost line</th><th className="n">Over the plan</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="n">{cad(r.value)}</td></tr>)}</tbody>
    </table>
  );
}

export function RiskSummary({ alerts, compact = false }: { alerts: AlertGroup[]; compact?: boolean }) {
  if (!alerts.length) return <p className="text-sm text-muted">Nothing needs attention.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {alerts.map((g) => (
        <div key={g.id} className="rounded-md border border-line p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-ink">{g.label}</span>
            <Pill tone={ALERT_TONE[g.id]}>{g.count}</Pill>
          </div>
          <ul className="mt-1 list-disc pl-4 text-xs text-ink-2">
            {g.items.slice(0, compact ? 2 : 3).map((m) => <li key={m} className={compact ? "" : "truncate"}>{m}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
