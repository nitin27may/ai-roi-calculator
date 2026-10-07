"use client";
import Link from "next/link";
import { useMemo } from "react";
import { WIDE_RANGE_TEXT, buildLabel, compareScenarios, moneyBand } from "@roi-calculator/engine";
import { Card, CardHead } from "@/components/ui";
import { BulletBar, CumulativeLine, RangeBar, RankedBars, ViewToggle, Waterfall } from "@/components/charts";
import { Story } from "@/components/story";
import { MonthLegend } from "@/components/months";
import { Dumbbell } from "@/components/charts-compare";
import { AiAssistTile, CumulativeTable, CurrentVsTargetTile, DriversTable, FinanceMeasures, HeadlineTiles, RiskSummary, ScorecardTile, VerdictChip, WATERFALL_COST_IDS, WaterfallTable, wideDrivers } from "@/components/summary-parts";
import { catalog, useSummary } from "@/lib/compute";
import { cad, cadUnit } from "@/lib/format";

export default function Summary() {
  const { project, roi, summary: s } = useSummary();
  const scenarios = useMemo(() => compareScenarios(project, catalog), [project]);
  const rangeRows = [
    { id: "cost", label: "Total cost", ...s.range.totalCost },
    { id: "build", label: buildLabel(project), ...s.range.build },
    { id: "run", label: "Annual run", ...s.range.annualRun },
    { id: "benefit", label: "Total benefit", ...s.range.totalBenefit },
    { id: "npv", label: "NPV", ...s.range.npv },
  ].map((r) => ({ ...r, wide: moneyBand(r).wide }));
  const wideLabels = rangeRows.filter((r) => r.wide).map((r) => r.label);
  const drivers = wideDrivers(s);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5 overflow-auto">
      <Card className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 pt-3.5">
          <VerdictChip verdict={s.verdict} />
        </div>
        <div className="px-3.5 pb-3.5">
          <Story />
        </div>
      </Card>

      <div className="shrink-0" data-tour="summary-tiles">
        <HeadlineTiles s={s} />
      </div>

      {s.currentLineCount > 0 && (
        <Card className="shrink-0">
          <CardHead title="Current vs target" sub={<>What the work costs today against the new run cost. <Link href="/roi" className="underline">Edit current state on the ROI page →</Link></>} />
          <CurrentVsTargetTile s={s} />
        </Card>
      )}

      {s.scorecard && (
        <Card className="shrink-0">
          <CardHead title="Scorecard" sub={<>Non-financial benefits next to the financial tiles; they are not in NPV unless monetised. <Link href="/roi" className="underline">Edit the scorecard on the ROI page →</Link></>} />
          <ScorecardTile s={s} />
        </Card>
      )}

      {s.aiAssist && (
        <Card className="shrink-0">
          <CardHead title="AI-assisted development" sub={<>Build hours AI coding tools save, against what the seats and tokens cost. <Link href="/build" className="underline">Edit on the Build page →</Link></>} />
          <AiAssistTile s={s} />
        </Card>
      )}

      <div className="grid shrink-0 gap-3.5 lg:grid-cols-2" data-tour="summary-charts">
        <Card id="how-sure">
          <CardHead title="How sure are we?" sub="Cautious, expected and optimistic cases side by side. Cautious means heavier usage and the conservative benefit column; optimistic means lighter usage and the optimistic column." />
          <div className="px-3.5 pb-3.5">
            <RangeBar caption="Low, expected and high for cost, build, run, benefit and NPV" rows={rangeRows} />
            {wideLabels.length > 0 && (
              <p className="mt-2 rounded-md bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">
                {WIDE_RANGE_TEXT.replace(": see how sure we are", "")} on {wideLabels.join(", ").toLowerCase()}: the cautious and optimistic cases are far apart.
                {drivers.length > 0 && <> The biggest drivers are {drivers.join(", ")}.</>} The table view has every number.
              </p>
            )}
          </div>
        </Card>
        <Card>
          <CardHead title="Finance measures" sub="Return measures a CFO asks for. Set the hurdle rate and terminal value on the ROI page." />
          <FinanceMeasures s={s} />
        </Card>
      </div>

      <div className="grid shrink-0 gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHead title="Build, run and benefit" sub={s.labourExcluded ? "How the plan nets out, build to benefit. Build labour excluded." : s.labourPartial ? `How the plan nets out, build to benefit. ${s.labourPartial}.` : "How the plan nets out, build to benefit."} />
          <div className="px-3.5 pb-3.5">
            <ViewToggle table={<WaterfallTable s={s} />}>
              <Waterfall steps={s.waterfall} costIds={WATERFALL_COST_IDS} />
            </ViewToggle>
          </div>
        </Card>
        <Card>
          <CardHead title="When do we break even?" sub="Cumulative net position, with the payback month marked." />
          <div className="px-3.5 pb-3.5">
            <ViewToggle table={<CumulativeTable values={roi.cumulative} />}>
              <CumulativeLine values={roi.cumulative} payback={roi.paybackMonth} className="relative h-[260px] shrink-0" />
            </ViewToggle>
            <MonthLegend className="mt-2" />
          </div>
        </Card>
      </div>

      <Card className="shrink-0">
        <CardHead title="What if we change something?" sub={<>Baseline against each scenario on NPV and monthly run cost. <Link href="/roi" className="underline">Add scenarios on the ROI page →</Link></>} />
        <div className="px-3.5 pb-3.5">
          <ScenarioCompare results={scenarios} />
        </div>
      </Card>

      <div className="grid shrink-0 gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHead title="What does one unit cost?" sub="Cost per unit at full adoption, against today's manual cost where known." />
          <div className="flex flex-col gap-3 px-3.5 pb-3.5">
            {s.unitCosts.length === 0 && <p className="text-sm text-muted">No workload here has a user or volume figure to divide by.</p>}
            {s.unitCosts.map((u) => (
              <div key={u.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="truncate text-ink-2">{u.label}</span>
                  <span className="num whitespace-nowrap font-semibold text-ink">{cadUnit(u.perUnit)} / {u.unit}</span>
                </div>
                <BulletBar value={u.perUnit} baseline={u.baselinePerUnit} />
                {u.baselinePerUnit !== null && <div className="mt-1 text-xs text-muted">Today, manually: {cadUnit(u.baselinePerUnit)} / {u.unit}</div>}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Where does the money go?" sub="Top cost lines over the whole plan." />
          <div className="px-3.5 pb-3.5">
            <ViewToggle table={<DriversTable rows={s.costDrivers} />}>
              <RankedBars rows={s.costDrivers} />
            </ViewToggle>
          </div>
        </Card>
      </div>

      <div className="grid shrink-0 gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHead title="What changes the answer most?" sub={<>The three biggest sensitivity drivers. <Link href="/roi" className="underline">Full sensitivity tab →</Link></>} />
          <div className="px-3.5 pb-3.5">
            <MiniTornado s={s} />
          </div>
        </Card>
        <Card>
          <CardHead title="What's risky?" sub={<>Alerts by severity. <Link href="/overview" className="underline">See all on Overview →</Link></>} />
          <div className="px-3.5 pb-3.5">
            <RiskSummary alerts={s.alerts} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function MiniTornado({ s }: { s: ReturnType<typeof useSummary>["summary"] }) {
  const rows = s.sensitivityTop3;
  if (!rows.length) return <p className="text-sm text-muted">Not enough inputs on this project to rank sensitivity drivers.</p>;
  const base = s.npv;
  const lo = Math.min(base, ...rows.map((r) => Math.min(r.low, r.high)), 0);
  const hi = Math.max(base, ...rows.map((r) => Math.max(r.low, r.high)), 0);
  const pad = (hi - lo || 1) * 0.17;
  const x = (v: number) => Math.round((10000 * (v - (lo - pad))) / (hi - lo + 2 * pad || 1)) / 100;
  return (
    <ViewToggle table={<TornadoTable rows={rows} />}>
      <div className="grid grid-cols-[minmax(120px,190px)_1fr] gap-x-3 gap-y-2 text-[12px]">
        {rows.map((r) => {
          const down = Math.min(r.low, r.high), up = Math.max(r.low, r.high);
          return (
            <div key={r.id} className="contents">
              <span className="truncate py-1 text-ink-2" title={r.label}>{r.label}</span>
              <div className="relative h-6" title={`${r.lowLabel}: ${cad(r.low)} · ${r.highLabel}: ${cad(r.high)}`}>
                <div className="absolute inset-y-0 w-px bg-line" style={{ left: `${x(0)}%` }} />
                <div className="absolute top-1 bottom-1 rounded-l" style={{ left: `${x(down)}%`, width: `${Math.max(0.5, Math.round(100 * (x(Math.min(base, up)) - x(down))) / 100)}%`, background: "var(--risk)", opacity: 0.75 }} />
                <div className="absolute top-1 bottom-1 rounded-r" style={{ left: `${x(Math.max(base, down))}%`, width: `${Math.max(0.5, Math.round(100 * (x(up) - x(Math.max(base, down)))) / 100)}%`, background: "var(--good)", opacity: 0.75 }} />
                <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${x(base)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </ViewToggle>
  );
}

function TornadoTable({ rows }: { rows: { id: string; label: string; lowLabel: string; low: number; highLabel: string; high: number; swing: number }[] }) {
  return (
    <table className="data">
      <thead><tr><th>Driver</th><th className="n">Low</th><th className="n">High</th><th className="n">Swing</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.label}</td><td className="n">{r.lowLabel}: {cad(r.low)}</td><td className="n">{r.highLabel}: {cad(r.high)}</td><td className="n">{cad(r.swing)}</td></tr>)}</tbody>
    </table>
  );
}


function ScenarioCompare({ results }: { results: ReturnType<typeof compareScenarios> }) {
  if (results.length < 2) return <p className="text-sm text-muted">No scenarios yet. A scenario is a saved what-if, such as a cheaper model or double the volume; add one on the ROI page and it appears here.</p>;
  const [base, ...rest] = results as [ReturnType<typeof compareScenarios>[number], ...ReturnType<typeof compareScenarios>];
  const run = (r: typeof base) => r.ledger.totals.runRate + r.ledger.totals.maintRate;
  const table = (
    <table className="data">
      <thead><tr><th>Scenario</th><th className="n">NPV</th><th className="n">Run cost / month</th><th className="n">Payback</th></tr></thead>
      <tbody>{results.map((r) => <tr key={r.id}><td>{r.label}{r.error ? " (could not be applied)" : ""}</td><td className="n">{cad(r.roi.npv)}</td><td className="n">{cad(run(r))}</td><td className="n">{r.roi.paybackMonth ? `Month ${r.roi.paybackMonth}` : "Not within plan"}</td></tr>)}</tbody>
    </table>
  );
  return (
    <ViewToggle table={table}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Dumbbell title="NPV" baseline={base.roi.npv} rows={rest.map((r) => ({ id: r.id, label: r.label, value: r.roi.npv }))} />
        <Dumbbell title="Run cost per month" baseline={run(base)} rows={rest.map((r) => ({ id: r.id, label: r.label, value: run(r) }))} higherIsBetter={false} />
      </div>
      {rest.some((r) => r.error) && <p className="mt-2 text-xs text-warn">A scenario that could not be applied is shown at the baseline figure.</p>}
    </ViewToggle>
  );
}
