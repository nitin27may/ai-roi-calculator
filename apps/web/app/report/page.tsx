"use client";
import { useEffect, useMemo, useState } from "react";
import { DEPLOYMENT_LABEL, LABOUR_EXCLUDED_TEXT, WIDE_RANGE_TEXT, buildLabel, compareScenarios, computeAllocation, currentStateRows, evaluateLevers, moneyBand, pricesUsedRows, scorecardRows, steadyState } from "@roi-calculator/engine";
import { CumulativeLine, Legend, RankedBars, StackedBars, Waterfall } from "@/components/charts";
import { Field, TextInput } from "@/components/ui";
import { CurrentVsTargetTile, FinanceMeasures, HeadlineTiles, RiskSummary, VerdictChip, WATERFALL_COST_IDS, wideDrivers } from "@/components/summary-parts";
import { catalog, useSummary } from "@/lib/compute";
import { cad, fmt } from "@/lib/format";
import { useStudio } from "@/lib/store";

const STREAMS = [
  { key: "labour", label: "Build labour", color: "var(--build-2)" },
  { key: "devlab", label: "AI Dev Lab", color: "var(--build)" },
  { key: "run", label: "Production AI usage", color: "var(--run)" },
  { key: "platform", label: "Platform", color: "var(--platform)" },
  { key: "env", label: "Environments", color: "var(--platform)" },
  { key: "delivery", label: "Delivery costs", color: "var(--build-2)" },
  { key: "maint", label: "Maintenance & transition", color: "var(--maint)" },
];

import { ensureStorageMigrated } from "@/lib/storage-migrate";
ensureStorageMigrated();

const AUTHOR_KEY = "roi-calculator:reportAuthor";
const BASIS_WORDS = { run: "running cost only", runMaint: "running cost and maintenance", full: "the full lifecycle" };

/** Long-form report: cover, executive page, assumptions, then the appendix. Use the browser's Print, then Save as PDF. */
export default function Report() {
  const { project: p, ledger, roi, summary: s } = useSummary();
  const percentile = useStudio((st) => st.percentile);
  const [author, setAuthor] = useState("");
  const [today, setToday] = useState("");
  // Read after mount: the date and the stored author name differ between the static build and the browser.
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }));
    try { setAuthor(localStorage.getItem(AUTHOR_KEY) ?? ""); } catch { /* storage blocked: the field still works for this visit */ }
  }, []);
  const changeAuthor = (v: string) => {
    setAuthor(v);
    try { localStorage.setItem(AUTHOR_KEY, v); } catch { /* ignore */ }
  };

  const extra = useMemo(() => ({
    alloc: computeAllocation(p, ledger, p.roi.basis),
    scenarios: compareScenarios(p, catalog),
    levers: evaluateLevers(p, catalog).slice(0, 5),
    prices: pricesUsedRows(ledger, catalog),
  }), [p, ledger]);
  const t = ledger.totals, B = p.timeline.buildMonths;
  const rows = ledger.months.map((m) => ({ labour: m.byStream.labour, devlab: m.byStream.devlab + m.byStream.devenv, run: m.byStream.run, platform: m.byStream.platform, env: m.byStream.env ?? 0, delivery: m.byStream.delivery ?? 0, maint: m.byStream.maint + m.byStream.transition, benefit: m.benefit }));
  const basis = BASIS_WORDS[p.roi.basis];
  const hasEnv = ledger.months.some((m) => (m.byStream.env ?? 0) > 0);
  const hasDelivery = ledger.months.some((m) => (m.byStream.delivery ?? 0) > 0);
  const streams = STREAMS.filter((x) => (x.key !== "labour" || !s.labourExcluded) && (x.key !== "env" || hasEnv) && (x.key !== "delivery" || hasDelivery));
  const devById = new Map<string, number>();
  for (const m of ledger.months.slice(0, B)) for (const l of m.lines) if (l.stream === "devlab") devById.set(l.componentId, (devById.get(l.componentId) ?? 0) + l.cost);
  const firstFull = steadyState(ledger);
  const runById = new Map<string, number>();
  for (const l of firstFull.lines) if (!l.once && (l.stream === "run" || l.stream === "platform")) runById.set(l.componentId, (runById.get(l.componentId) ?? 0) + l.cost);
  const unverified = extra.prices.filter((r) => r.Confidence === "unverified" || r.Confidence === "single-source");
  const fx = catalog.meta.fx;
  const rangeRows = [
    { label: "Total cost over the plan", ...s.range.totalCost },
    { label: buildLabel(p), ...s.range.build },
    { label: "Annual run, steady state", ...s.range.annualRun },
    { label: "Total benefit over the plan", ...s.range.totalBenefit },
    { label: `NPV at ${s.discountRatePct}%`, ...s.range.npv },
  ];
  const drivers = wideDrivers(s);
  const wideLabels = rangeRows.filter((r) => moneyBand(r).wide).map((r) => r.label.replace(/^(?!NPV|IRR)([A-Z])/, (c) => c.toLowerCase()));
  const cap = s.hurdleRatePct;

  return (
    <div className="h-full overflow-auto scroll-hint print:overflow-visible">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <p className="max-w-[46ch] text-sm text-ink-2">A report for this project: cover, one-page summary, assumptions and a detailed appendix. Choose <b>Print</b>, then <b>Save as PDF</b>.</p>
          <div className="w-64"><Field label="Author on the cover" help="reportAuthor"><TextInput value={author} placeholder="Your name or team" onChange={changeAuthor} /></Field></div>
        </div>
        <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <article className="report mx-auto min-w-0 flex max-w-[960px] flex-col gap-6 print:max-w-none print:gap-0">
        {/* 1. Cover */}
        <section className="report-page report-cover flex min-h-[560px] flex-col justify-between rounded-lg border border-line bg-surface p-5 sm:p-10 print:min-h-[250mm] print:rounded-none print:border-0 print:p-0">
          <div>
            <div className="text-xs uppercase tracking-[0.1em] text-muted">AI cost and ROI estimate</div>
            <div className="mt-24 h-1.5 w-20 rounded bg-accent print:mt-40" />
            <h1 className="mt-5 max-w-[18ch] text-3xl sm:text-5xl font-bold leading-[1.08]">{p.name}</h1>
            <p className="mt-4 max-w-[52ch] text-[15px] text-ink-2">A {p.timeline.horizonMonths}-month view of what it costs to build and run, what it returns, and how sure we are.</p>
          </div>
          <dl className="grid max-w-[560px] grid-cols-1 sm:grid-cols-[150px_1fr] gap-x-4 gap-y-2 border-t border-line pt-5 text-[13.5px]">
            <dt className="text-muted">Report date</dt><dd className="text-ink">{today || " "}</dd>
            <dt className="text-muted">Prepared by</dt><dd className="text-ink">{author.trim() || "Not stated"}</dd>
            <dt className="text-muted">Currency</dt><dd className="text-ink">Canadian dollars (C$)</dd>
            <dt className="text-muted">Prices as of</dt><dd className="text-ink">{catalog.meta.asOf}</dd>
            <dt className="text-muted">Exchange rate</dt><dd className="text-ink">{fx ? `${fx.usdToCad} CAD per USD, Azure rate of ${fx.asOf}` : "Not needed: all prices are in CAD"}</dd>
            <dt className="text-muted">Estimate starts</dt><dd className="text-ink">{p.startDate}</dd>
          </dl>
        </section>

        {/* 2. Executive page */}
        <section className="report-page report-exec flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-4 sm:p-8 print:rounded-none print:border-0 print:p-0">
          <header>
            <div className="text-xs uppercase tracking-[0.08em] text-muted">Executive summary · {p.name}</div>
            <div className="mt-2"><VerdictChip verdict={s.verdict} /></div>
            <p className="mt-2 max-w-[78ch] text-[13.5px] leading-snug text-ink-2">
              Building takes <b>{B} months</b> and costs <b>{cad(s.build)}</b>{s.labourExcluded ? <> (build labour excluded)</> : s.labourPartial ? <> ({s.labourPartial.toLowerCase()})</> : null}. Running and maintaining it costs <b>{cad(s.steadyStateAnnualRun / 12)}</b> a month at full adoption, against <b>{cad(s.benefitPerYear / 12)}</b> a month in benefit.
              Measured on {basis}, it {s.paysBackWithinPlan ? <>pays back in <b>month {s.paybackMonth}</b></> : <><b>does not pay back</b> within {s.horizonMonths} months</>}, with an NPV of <b>{cad(s.npv)}</b> at {s.discountRatePct}%.
            </p>
          </header>
          <HeadlineTiles s={s} linkWide={false} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <section className="break-inside-avoid">
              <h2 className="mb-1.5 text-[15px] font-bold">Build, run and benefit</h2>
              <Waterfall steps={s.waterfall} costIds={WATERFALL_COST_IDS} className="flex flex-col gap-1" />
            </section>
            <section className="break-inside-avoid">
              <h2 className="mb-1.5 text-[15px] font-bold">Where the money goes</h2>
              <RankedBars rows={s.costDrivers} className="flex flex-col gap-1.5" />
            </section>
          </div>
          {s.currentLineCount > 0 && (
            <section className="break-inside-avoid">
              <h2 className="mb-1.5 text-[15px] font-bold">Current vs target</h2>
              <CurrentVsTargetTile s={s} className="" />
            </section>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <section className="break-inside-avoid">
              <h2 className="mb-1.5 text-[15px] font-bold">Finance measures</h2>
              <FinanceMeasures s={s} className="" />
            </section>
            <section className="break-inside-avoid">
              <h2 className="mb-1.5 text-[15px] font-bold">What to watch</h2>
              <RiskSummary alerts={s.alerts.slice(0, 3)} compact />
              {s.alerts.length > 3 && <p className="mt-1 text-xs text-muted">{s.alerts.length - 3} more group{s.alerts.length - 3 === 1 ? "" : "s"} of notices are in the appendix.</p>}
            </section>
          </div>
        </section>

        {/* 3. Assumptions and how sure we are */}
        <section className="report-page flex flex-col gap-4 rounded-lg border border-line bg-surface p-8 print:rounded-none print:border-0 print:p-0">
          <h2 className="text-xl font-bold">Assumptions and how sure we are</h2>
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-6 [&_td.n]:whitespace-normal [&_td.n]:font-sans">
            <section className="break-inside-avoid">
              <h3 className="mb-1.5 text-[15px] font-bold">What this estimate assumes</h3>
              <table className="data">
                <tbody>
                  <tr><td>Build</td><td className="n">{B} months, from {p.startDate}</td></tr>
                  {s.labourExcluded && <tr><td>Build labour</td><td className="n">{LABOUR_EXCLUDED_TEXT}: not in any figure in this report</td></tr>}
                  {s.labourPartial && <tr><td>Build labour</td><td className="n">{s.labourPartial}: those lines add no cost</td></tr>}
                  <tr><td>Plan length</td><td className="n">{p.timeline.horizonMonths} months</td></tr>
                  <tr><td>Adoption ramp</td><td className="n">{p.timeline.adoptionRampMonths} months to full use</td></tr>
                  <tr><td>Cost measured on</td><td className="n">{basis}</td></tr>
                  <tr><td>Benefit column</td><td className="n">{p.roi.benefitPreset}</td></tr>
                  <tr><td>Discount rate</td><td className="n">{p.roi.discountRatePct}% a year</td></tr>
                  <tr><td>Usage growth</td><td className="n">{p.roi.growthPctPerYear}% a year</td></tr>
                  <tr><td>Labour rate rise</td><td className="n">{p.roi.rateEscalationPctPerYear}% a year</td></tr>
                  {cap !== null && <tr><td>Hurdle rate</td><td className="n">{cap}% a year</td></tr>}
                  <tr><td>Azure deployment</td><td className="n">{DEPLOYMENT_LABEL[p.settings.azureDeployment]}</td></tr>
                  <tr><td>Usage priced at</td><td className="n">{percentile.toUpperCase()} of simulated runs</td></tr>
                  <tr><td>Price list</td><td className="n">List prices, no discounts, {catalog.meta.asOf}</td></tr>
                </tbody>
              </table>
            </section>
            <section className="break-inside-avoid">
              <h3 className="mb-1.5 text-[15px] font-bold">Workloads in production</h3>
              <table className="data">
                <thead><tr><th>Workload</th><th className="n">Per month</th></tr></thead>
                <tbody>{p.workloads.map((w) => <tr key={w.id}><td>{w.label}</td><td className="n">{cad(runById.get(w.id) ?? 0)}</td></tr>)}</tbody>
              </table>
            </section>
          </div>
          {s.currentLineCount > 0 && (
            <section className="break-inside-avoid">
              <h3 className="mb-1.5 text-[15px] font-bold">What the work costs today, and what changes</h3>
              <table className="data [&_td.n]:whitespace-normal [&_td.n]:font-sans">
                <thead><tr><th>Item</th><th>Basis</th><th className="n">Per month</th><th>Change</th><th className="n">Saving per month</th></tr></thead>
                <tbody>{currentStateRows(p).map((r) => <tr key={String(r.Item)}><td>{r.Item}</td><td>{r.Basis}</td><td className="n">{cad(Number(r["Cost per month today (CAD)"]))}</td><td>{r.Change}</td><td className="n">{cad(Number(r["Saving per month, change in full effect (CAD)"]))}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          {s.scorecard && (
            <section className="break-inside-avoid">
              <h3 className="mb-1.5 text-[15px] font-bold">Non-financial scorecard</h3>
              <p className="mb-1.5 max-w-[80ch] text-[12.5px] text-ink-2">Shown beside the financial figures. Only items marked as counted are in NPV and payback.</p>
              <table className="data [&_td.n]:whitespace-normal [&_td.n]:font-sans">
                <thead><tr><th>Item</th><th>Measure</th><th className="n">Before</th><th className="n">After</th><th>Result</th><th className="n">Weight</th><th className="n">Confidence</th><th>In NPV</th></tr></thead>
                <tbody>{scorecardRows(p).map((r) => <tr key={String(r.Item)}><td>{r.Item}</td><td>{r.Measure} ({r.Unit})</td><td className="n">{r.Before}</td><td className="n">{r.After}</td><td>{r.Direction}{typeof r["Improvement (%)"] === "number" ? ` ${r["Improvement (%)"]}%` : ""}</td><td className="n">{r["Weight (%)"]}%</td><td className="n">{r["Confidence (%)"]}%</td><td>{r["In NPV and payback"]}</td></tr>)}</tbody>
              </table>
              <p className="mt-1 text-[12.5px] text-ink-2">Composite index: {s.scorecard.composite === null ? "no weights set" : `${Math.round(s.scorecard.composite * 10) / 10}%`}. Counted in NPV: {cad(s.scorecard.monetisedMonthly)} a month at full rollout.</p>
            </section>
          )}
          <section className="break-inside-avoid">
            <h3 className="mb-1 text-[15px] font-bold">How sure are we</h3>
            <p className="mb-2 max-w-[80ch] text-[12.5px] text-ink-2">
              Three cases. Cautious means heavier usage and the conservative benefit column. Expected is the project as entered. Optimistic means lighter usage and the optimistic column.
              The table shows every number.
            </p>
            <table className="data">
              <thead><tr><th>Figure</th><th className="n">Cautious</th><th className="n">Expected</th><th className="n">Optimistic</th></tr></thead>
              <tbody>{rangeRows.map((r) => <tr key={r.label}><td>{r.label}{moneyBand(r).wide ? " (wide range)" : ""}</td><td className="n">{cad(r.low)}</td><td className="n">{cad(r.expected)}</td><td className="n">{cad(r.high)}</td></tr>)}
                <tr><td>Payback</td><td className="n">{s.range.payback.worst === null ? `Not within ${s.horizonMonths} months` : `Month ${s.range.payback.worst}`}</td><td className="n">{s.range.payback.expected === null ? "Not within plan" : `Month ${s.range.payback.expected}`}</td><td className="n">{s.range.payback.best === null ? "Not within plan" : `Month ${s.range.payback.best}`}</td></tr>
                {s.range.irrPct && <tr><td>IRR (a year)</td><td className="n">{fmt(s.range.irrPct.low, 1)}%</td><td className="n">{fmt(s.range.irrPct.expected, 1)}%</td><td className="n">{fmt(s.range.irrPct.high, 1)}%</td></tr>}
              </tbody>
            </table>
            {wideLabels.length > 0 && (
              <p className="mt-2 rounded-md bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">
                {WIDE_RANGE_TEXT.replace(": see how sure we are", "")} on {wideLabels.join(", ")}: the cautious and optimistic cases are far apart, so read the expected case as one possible outcome.
                {drivers.length > 0 && <> The biggest drivers are {drivers.join(", ")}.</>}
              </p>
            )}
          </section>
        </section>

        {/* 4. Appendix */}
        <section className="report-page report-appendix flex flex-col gap-6 rounded-lg border border-line bg-surface p-8 print:gap-5 print:rounded-none print:border-0 print:p-0">
          <h2 className="text-xl font-bold">Appendix: detail</h2>

          <section className="break-inside-avoid">
            <h3 className="mb-2 text-lg font-bold">Cost and benefit by month</h3>
            <Legend items={[...streams.map((x) => ({ label: x.label, color: x.color })), { label: "Benefit", color: "var(--ink)", line: true }]} />
            <StackedBars rows={rows} series={streams} line={{ key: "benefit", label: "Benefit", color: "var(--ink)" }} xLabel={(i) => `M${i + 1}`} className="relative mt-2 h-[260px] w-[688px] max-w-full" />
          </section>

          <section className="break-inside-avoid">
            <h3 className="mb-2 text-lg font-bold">Cumulative position</h3>
            <CumulativeLine values={roi.cumulative} payback={roi.paybackMonth} className="relative h-[220px] w-[688px] max-w-full" />
          </section>

          <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
            <section className="break-inside-avoid">
              <h3 className="mb-2 text-lg font-bold">Build, months 1 to {B}{s.labourExcluded ? " (build labour excluded)" : s.labourPartial ? ` (${s.labourPartial.toLowerCase()})` : ""}</h3>
              <table className="data">
                <tbody>
                  <tr><td>Labour</td><td className="n">{s.labourExcluded ? "Excluded" : cad(t.buildLabour)}</td></tr>
                  {p.build.activities.map((a) => <tr key={a.id}><td>{a.label}</td><td className="n">{cad(devById.get(a.id) ?? 0)}</td></tr>)}
                  <tr><td>Dev environment</td><td className="n">{cad(ledger.months.slice(0, B).reduce((sum, m) => sum + m.byStream.devenv, 0))}</td></tr>
                  {hasDelivery && <tr><td>Delivery costs</td><td className="n">{cad(ledger.months.reduce((sum, m) => sum + (m.byStream.delivery ?? 0), 0))}</td></tr>}
                  <tr className="total"><td>Total</td><td className="n">{cad(t.build)}</td></tr>
                </tbody>
              </table>
            </section>
            <section className="break-inside-avoid">
              <h3 className="mb-2 text-lg font-bold">Production, per month</h3>
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
              <h3 className="mb-2 text-lg font-bold">By year</h3>
              <table className="data">
                <thead><tr><th>Year</th><th className="n">Benefit</th><th className="n">Cost</th><th className="n">Net</th></tr></thead>
                <tbody>{roi.byYear.map((y) => <tr key={y.year}><td>Year {y.year}</td><td className="n">{cad(y.benefit)}</td><td className="n">{cad(y.cost)}</td><td className="n">{cad(y.net)}</td></tr>)}</tbody>
              </table>
            </section>
            <section className="break-inside-avoid">
              <h3 className="mb-2 text-lg font-bold">ROI by capability</h3>
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
              <h3 className="mb-2 text-lg font-bold">Scenarios</h3>
              <table className="data">
                <thead><tr><th>Scenario</th><th className="n">{buildLabel(p)}</th><th className="n">Run / month</th><th className="n">Payback</th><th className="n">ROI</th><th className="n">NPV</th></tr></thead>
                <tbody>{extra.scenarios.map((sc) => <tr key={sc.id}><td>{sc.label}</td><td className="n">{cad(sc.ledger.totals.build)}</td><td className="n">{cad(sc.ledger.totals.runRate)}</td><td className="n">{sc.roi.paybackMonth ? `M${sc.roi.paybackMonth}` : "–"}</td><td className="n">{fmt(sc.roi.roi * 100)}%</td><td className="n">{cad(sc.roi.npv)}</td></tr>)}</tbody>
              </table>
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
            <section className="break-inside-avoid">
              <h3 className="mb-2 text-lg font-bold">Ways to spend less</h3>
              <table className="data"><tbody>{extra.levers.map((l) => <tr key={l.lever.id}><td>{l.lever.label}</td><td className="n">−{cad(l.saving)}</td></tr>)}</tbody></table>
            </section>
            <section className="break-inside-avoid">
              <h3 className="mb-2 text-lg font-bold">Watch-outs</h3>
              <ul className="list-disc pl-5 text-[13px] text-ink-2">
                {ledger.notes.map((n) => <li key={n.message}>{n.message}</li>)}
                {unverified.length > 0 && <li>{unverified.length} prices used here are single-source or unverified: {unverified.map((r) => r.Item).join(", ")}.</li>}
              </ul>
            </section>
          </div>

          <footer className="border-t border-line pt-3 text-xs text-muted">
            Prices in CAD from the Azure Retail Prices API, the Snowflake Credit Consumption Table and curated sources, as of {catalog.meta.asOf}.{fx && ` USD-only list prices converted at ${fx.usdToCad} CAD per USD (Azure rate, ${fx.asOf}).`} List prices, no discounts. Token volumes are estimates from documented heuristics; agent costs use the typical (P50) run.
          </footer>
        </section>
      </article>
    </div>
  );
}
