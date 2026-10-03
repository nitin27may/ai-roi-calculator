"use client";
import { useMemo } from "react";
import { compareScenarios, computeAllocation, evaluateLevers, pricesUsedRows } from "@studio/engine";
import { CumulativeLine, Legend, StackedBars } from "@/components/charts";
import { catalog, useLedger } from "@/lib/compute";
import { cad, fmt } from "@/lib/format";

const STREAMS = [
  { key: "labour", label: "Build labour", color: "var(--s1)" },
  { key: "devlab", label: "AI Dev Lab", color: "var(--s2)" },
  { key: "run", label: "Production AI usage", color: "var(--s3)" },
  { key: "platform", label: "Platform", color: "var(--s4)" },
  { key: "maint", label: "Maintenance & transition", color: "var(--s5)" },
];

/** A printable one-document summary. Use the browser's Print → Save as PDF. */
export default function Report() {
  const { project: p, ledger, roi } = useLedger();
  const extra = useMemo(() => ({
    alloc: computeAllocation(p, ledger, p.roi.basis),
    scenarios: compareScenarios(p, catalog),
    levers: evaluateLevers(p, catalog).slice(0, 5),
    prices: pricesUsedRows(ledger, catalog),
  }), [p, ledger]);
  const t = ledger.totals, B = p.timeline.buildMonths;
  const rows = ledger.months.map((m) => ({ labour: m.byStream.labour, devlab: m.byStream.devlab + m.byStream.devenv, run: m.byStream.run, platform: m.byStream.platform, maint: m.byStream.maint + m.byStream.transition, benefit: m.benefit }));
  const basis = { run: "running cost only", runMaint: "running cost and maintenance", full: "the full lifecycle" }[p.roi.basis];
  const devById = new Map<string, number>();
  for (const m of ledger.months.slice(0, B)) for (const l of m.lines) if (l.stream === "devlab") devById.set(l.componentId, (devById.get(l.componentId) ?? 0) + l.cost);
  const firstFull = ledger.months.find((m) => m.phase === "production" && m.adoption >= 1) ?? ledger.months.at(-1)!;
  const runById = new Map<string, number>();
  for (const l of firstFull.lines) if (l.stream === "run" || l.stream === "platform") runById.set(l.componentId, (runById.get(l.componentId) ?? 0) + l.cost);
  const unverified = extra.prices.filter((r) => r.Confidence === "unverified" || r.Confidence === "single-source");

  return (
    <div className="h-full overflow-auto print:overflow-visible">
      <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-ink-2">A one-document summary of this project. Use your browser's <b>Print</b> and choose <b>Save as PDF</b>.</p>
        <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <article className="report mx-auto flex max-w-[960px] flex-col gap-6 rounded-lg border border-line bg-surface p-8 print:max-w-none print:border-0 print:p-0">
        <header>
          <div className="text-xs uppercase tracking-[0.08em] text-muted">AI cost & ROI estimate · CAD · prices as of {catalog.meta.asOf}</div>
          <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
          <p className="mt-2 max-w-[70ch] text-[15px] text-ink-2">
            Building takes <b>{B} months</b> and costs <b>{cad(t.build)}</b>, of which <b>{cad(t.devLab)}</b> is AI usage while building (the AI Dev Lab).
            In production it costs <b>{cad(t.runRate)}</b> a month to run plus <b>{cad(t.maintRate)}</b> for maintenance, against <b>{cad(t.benefitRate)}</b> a month in benefit at full adoption.
            Measured on {basis}, it {roi.paybackMonth ? <>pays back in <b>month {roi.paybackMonth}</b></> : <><b>does not pay back</b> within {p.timeline.horizonMonths} months</>}, with an ROI of <b>{fmt(roi.roi * 100)}%</b> and an NPV of <b>{cad(roi.npv)}</b> at {roi.discountRatePct}%.
          </p>
        </header>

        <section className="break-inside-avoid">
          <h2 className="mb-2 text-lg font-bold">Cost and benefit by month</h2>
          <Legend items={[...STREAMS.map((s) => ({ label: s.label, color: s.color })), { label: "Benefit", color: "var(--ink)", line: true }]} />
          <StackedBars rows={rows} series={STREAMS} line={{ key: "benefit", label: "Benefit", color: "var(--ink)" }} xLabel={(i) => `M${i + 1}`} className="relative mt-2 h-[260px]" />
        </section>

        <section className="break-inside-avoid">
          <h2 className="mb-2 text-lg font-bold">Cumulative position</h2>
          <CumulativeLine values={roi.cumulative} payback={roi.paybackMonth} className="relative h-[220px]" />
        </section>

        <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">Build, months 1–{B}</h2>
            <table className="data">
              <tbody>
                <tr><td>Labour</td><td className="n">{cad(t.buildLabour)}</td></tr>
                {p.build.activities.map((a) => <tr key={a.id}><td>{a.label}</td><td className="n">{cad(devById.get(a.id) ?? 0)}</td></tr>)}
                <tr><td>Dev environment</td><td className="n">{cad(ledger.months.slice(0, B).reduce((s, m) => s + m.byStream.devenv, 0))}</td></tr>
                <tr className="total"><td>Total</td><td className="n">{cad(t.build)}</td></tr>
              </tbody>
            </table>
          </section>
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">Production, per month</h2>
            <table className="data">
              <tbody>
                {p.workloads.map((w) => <tr key={w.id}><td>{w.label}</td><td className="n">{cad(runById.get(w.id) ?? 0)}</td></tr>)}
                <tr><td>Maintenance</td><td className="n">{cad(t.maintRate)}</td></tr>
                <tr className="total"><td>Total</td><td className="n">{cad(t.runRate + t.maintRate)}</td></tr>
              </tbody>
            </table>
          </section>
        </div>

        <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">By year</h2>
            <table className="data">
              <thead><tr><th>Year</th><th className="n">Benefit</th><th className="n">Cost</th><th className="n">Net</th></tr></thead>
              <tbody>{roi.byYear.map((y) => <tr key={y.year}><td>Year {y.year}</td><td className="n">{cad(y.benefit)}</td><td className="n">{cad(y.cost)}</td><td className="n">{cad(y.net)}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">ROI by capability</h2>
            <table className="data">
              <thead><tr><th>Capability</th><th className="n">Net</th><th className="n">ROI</th></tr></thead>
              <tbody>
                {extra.alloc.capabilities.map((c) => <tr key={c.id}><td>{c.label}</td><td className="n">{cad(c.net)}</td><td className="n">{c.roi === null ? "–" : `${fmt(c.roi * 100)}%`}</td></tr>)}
                {extra.alloc.unallocated.cost > 0 && <tr><td>Unallocated cost</td><td className="n">{cad(-extra.alloc.unallocated.cost)}</td><td /></tr>}
              </tbody>
            </table>
          </section>
        </div>

        {extra.scenarios.length > 1 && (
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">Scenarios</h2>
            <table className="data">
              <thead><tr><th>Scenario</th><th className="n">Build</th><th className="n">Run / month</th><th className="n">Payback</th><th className="n">ROI</th><th className="n">NPV</th></tr></thead>
              <tbody>{extra.scenarios.map((s) => <tr key={s.id}><td>{s.label}</td><td className="n">{cad(s.ledger.totals.build)}</td><td className="n">{cad(s.ledger.totals.runRate)}</td><td className="n">{s.roi.paybackMonth ? `M${s.roi.paybackMonth}` : "–"}</td><td className="n">{fmt(s.roi.roi * 100)}%</td><td className="n">{cad(s.roi.npv)}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">Ways to spend less</h2>
            <table className="data"><tbody>{extra.levers.map((l) => <tr key={l.lever.id}><td>{l.lever.label}</td><td className="n">−{cad(l.saving)}</td></tr>)}</tbody></table>
          </section>
          <section className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-bold">Watch-outs</h2>
            <ul className="list-disc pl-5 text-[13px] text-ink-2">
              {ledger.notes.map((n) => <li key={n.message}>{n.message}</li>)}
              {unverified.length > 0 && <li>{unverified.length} prices used here are single-source or unverified: {unverified.map((r) => r.Item).join(", ")}.</li>}
            </ul>
          </section>
        </div>

        <footer className="border-t border-line pt-3 text-[11.5px] text-muted">
          Prices in CAD from the Azure Retail Prices API, the Snowflake Credit Consumption Table and curated sources, as of {catalog.meta.asOf}.{catalog.meta.fx && ` USD-only list prices converted at ${catalog.meta.fx.usdToCad} CAD per USD (Azure rate, ${catalog.meta.fx.asOf}).`} List prices, no discounts. Token volumes are estimates from documented heuristics; agent costs use the typical (P50) run.
        </footer>
      </article>
    </div>
  );
}
