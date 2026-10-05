"use client";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { AlertGroup } from "@studio/engine";
import { Card, CardHead, Pill } from "@/components/ui";
import { BulletBar, CumulativeLine, RangeBar, RankedBars, ViewToggle, Waterfall } from "@/components/charts";
import { Story } from "@/components/story";
import { useSummary } from "@/lib/compute";
import { cad, cadUnit, fmt } from "@/lib/format";

const ALERT_TONE: Record<AlertGroup["id"], "ok" | "warn" | "crit" | "n"> = {
  notOffered: "crit", retiring: "crit", tierFallback: "warn", lowConfidence: "warn", other: "n",
};

const WATERFALL_COST_IDS = ["build", "year1Run", "laterRun"];

export default function Summary() {
  const { ledger, roi, summary: s } = useSummary();

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

      <div className="grid shrink-0 gap-3.5 lg:grid-cols-2" data-tour="summary-charts">
        <Card>
          <CardHead title="How sure are we?" sub="Cautious, expected and optimistic cases side by side. Cautious means heavier usage and the conservative benefit column; optimistic means lighter usage and the optimistic column." />
          <div className="px-3.5 pb-3.5">
            <RangeBar caption="Low, expected and high for cost, build, run, benefit and NPV" rows={[
              { id: "cost", label: "Total cost", ...s.range.totalCost },
              { id: "build", label: "Build", ...s.range.build },
              { id: "run", label: "Annual run", ...s.range.annualRun },
              { id: "benefit", label: "Total benefit", ...s.range.totalBenefit },
              { id: "npv", label: "NPV", ...s.range.npv },
            ]} />
          </div>
        </Card>
        <Card>
          <CardHead title="Finance measures" sub="Return measures a CFO asks for. Set the hurdle rate and terminal value on the ROI page." />
          <FinanceMeasures s={s} />
        </Card>
      </div>

      <div className="grid shrink-0 gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHead title="Build, run and benefit" sub="How the plan nets out, build to benefit." />
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
          </div>
        </Card>
      </div>

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
                {u.baselinePerUnit !== null && <div className="mt-1 text-[11px] text-muted">Today, manually: {cadUnit(u.baselinePerUnit)} / {u.unit}</div>}
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

function VerdictChip({ verdict }: { verdict: { text: string; npvPositive: boolean; tone: "ok" | "warn" | "crit" } }) {
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

function HeadlineTiles({ s }: { s: ReturnType<typeof useSummary>["summary"] }) {
  const tiles: { label: string; value: string; sub?: string; range?: string }[] = [
    { label: "Total cost over plan", value: cad(s.totalCost), sub: `${s.horizonMonths} months`, range: span(s.range.totalCost) },
    { label: "Build", value: cad(s.build), sub: `${fmt(s.devLabShare * 100)}% AI Dev Lab`, range: span(s.range.build) },
    { label: "Annual run (steady state)", value: cad(s.steadyStateAnnualRun), sub: "run + platform + maintenance", range: span(s.range.annualRun) },
    { label: "Benefit per year", value: cad(s.benefitPerYear), sub: "at full adoption" },
    { label: "NPV", value: cad(s.npv), sub: `at ${s.discountRatePct}%`, range: span(s.range.npv) },
    { label: "Payback", value: s.paybackMonth ? `Month ${s.paybackMonth}` : `> ${s.horizonMonths} months`, sub: `ROI ${fmt(s.roi * 100)}%`, range: paybackSpan(s.range.payback, s.horizonMonths) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 rounded-lg border border-line bg-surface px-3.5 py-2.5">
          <div className="truncate text-[11.5px] text-muted">{t.label}</div>
          <div className="num truncate font-display text-xl font-bold leading-tight">{t.value}</div>
          {t.sub && <div className="truncate text-[11px] text-ink-2">{t.sub}</div>}
          {t.range && <div className="num truncate text-[11px] text-muted" title={`Range across the cautious, expected and optimistic cases: ${t.range}`}>{t.range}</div>}
        </div>
      ))}
    </div>
  );
}

function FinanceMeasures({ s }: { s: ReturnType<typeof useSummary>["summary"] }) {
  const rows: [string, string, string?][] = [
    ["Internal rate of return (IRR)", s.irrPct === null ? "Not defined" : `${fmt(s.irrPct)}% a year`, s.range.irrPct ? `${fmt(s.range.irrPct.low)}% to ${fmt(s.range.irrPct.high)}%` : undefined],
    ["Hurdle rate", s.hurdleRatePct === null ? "Not set" : `${fmt(s.hurdleRatePct)}% a year`, s.clearsHurdle === null ? undefined : s.clearsHurdle ? "IRR clears the hurdle" : "IRR is below the hurdle"],
    ["Payback", s.paybackMonth ? `Month ${s.paybackMonth}` : `Not within ${s.horizonMonths} months`],
    ["Payback after discounting", s.discountedPaybackMonth ? `Month ${s.discountedPaybackMonth}` : `Not within ${s.horizonMonths} months`, s.discountRatePct === 0 ? "Same as payback at a 0% rate" : undefined],
    ["NPV", cad(s.npv), `at ${s.discountRatePct}%`],
    ...(s.terminalValue > 0 ? [["Terminal value (in NPV and IRR)", cad(s.terminalValue)] as [string, string]] : []),
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-3.5 pb-3.5 text-[12.5px]">
      {rows.map(([k, v, note]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}{note && <span className="block text-[11px] text-muted">{note}</span>}</dt>
          <dd className="num self-center text-right font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function WaterfallTable({ s }: { s: ReturnType<typeof useSummary>["summary"] }) {
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

function CumulativeTable({ values }: { values: number[] }) {
  return (
    <table className="data">
      <thead><tr><th>Month</th><th className="n">Cumulative net</th></tr></thead>
      <tbody>{values.map((v, i) => <tr key={i}><td>Month {i + 1}</td><td className="n">{cad(v)}</td></tr>)}</tbody>
    </table>
  );
}

function DriversTable({ rows }: { rows: { label: string; value: number }[] }) {
  return (
    <table className="data">
      <thead><tr><th>Cost line</th><th className="n">Over the plan</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="n">{cad(r.value)}</td></tr>)}</tbody>
    </table>
  );
}

function MiniTornado({ s }: { s: ReturnType<typeof useSummary>["summary"] }) {
  const rows = s.sensitivityTop3;
  if (!rows.length) return <p className="text-sm text-muted">Not enough inputs on this project to rank sensitivity drivers.</p>;
  const base = s.npv;
  const lo = Math.min(base, ...rows.map((r) => Math.min(r.low, r.high)), 0);
  const hi = Math.max(base, ...rows.map((r) => Math.max(r.low, r.high)), 0);
  const pad = (hi - lo || 1) * 0.17;
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad || 1)) * 100;
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
                <div className="absolute top-1 bottom-1 rounded-l" style={{ left: `${x(down)}%`, width: `${Math.max(0.5, x(Math.min(base, up)) - x(down))}%`, background: "var(--risk)", opacity: 0.75 }} />
                <div className="absolute top-1 bottom-1 rounded-r" style={{ left: `${x(Math.max(base, down))}%`, width: `${Math.max(0.5, x(up) - x(Math.max(base, down)))}%`, background: "var(--good)", opacity: 0.75 }} />
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

function RiskSummary({ alerts }: { alerts: AlertGroup[] }) {
  if (!alerts.length) return <p className="text-sm text-muted">Nothing needs attention.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {alerts.map((g) => (
        <div key={g.id} className="rounded-md border border-line p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-ink">{g.label}</span>
            <Pill tone={ALERT_TONE[g.id]}>{g.count}</Pill>
          </div>
          <ul className="mt-1 list-disc pl-4 text-[11.5px] text-ink-2">
            {g.items.map((m) => <li key={m} className="truncate">{m}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
