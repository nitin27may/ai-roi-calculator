"use client";
import { cad } from "@/lib/format";

/** Comparison charts: scenario dumbbell, project bars and the portfolio mini split. Hand-rolled, no chart library. */

export interface DumbbellRow { id: string; label: string; value: number }

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Baseline against each scenario on one shared axis: a line joins the baseline marker to the scenario's dot.
 * The dot is green when the scenario is better than the baseline, red when worse; the direction is stated in words
 * as well, so colour is never the only signal. Pass `higherIsBetter={false}` for costs.
 */
export function Dumbbell({ title, baseline, rows, format = cad, higherIsBetter = true }: { title: string; baseline: number; rows: DumbbellRow[]; format?: (v: number) => string; higherIsBetter?: boolean }) {
  const all = [baseline, ...rows.map((r) => r.value)];
  const lo0 = Math.min(...all), hi0 = Math.max(...all);
  const pad = (hi0 - lo0 || Math.abs(baseline) || 1) * 0.12;
  const lo = lo0 - pad, span = hi0 + pad - lo || 1;
  const x = (v: number) => r2((100 * (v - lo)) / span);
  return (
    <div role="group" aria-label={`${title}: baseline against each scenario`}>
      <div className="mb-1 text-[12px] font-semibold text-ink">{title}</div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const diff = r.value - baseline;
          const better = higherIsBetter ? diff > 0 : diff < 0;
          const same = Math.abs(diff) < 0.005;
          const color = same ? "var(--muted)" : better ? "var(--good)" : "var(--risk)";
          const words = same ? "same as baseline" : `${better ? "better" : "worse"} by ${format(Math.abs(diff))}`;
          return (
            <div key={r.id} className="grid grid-cols-[minmax(90px,150px)_1fr] items-center gap-2 text-[12px]">
              <span className="truncate text-ink-2" title={r.label}>{r.label}</span>
              <div>
                <div aria-hidden className="relative h-5" title={`${r.label}: ${format(r.value)} (${words})`}>
                  <div className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded" style={{ left: `${Math.min(x(baseline), x(r.value))}%`, width: `${r2(Math.abs(x(r.value) - x(baseline)))}%`, background: color }} />
                  <div className="absolute inset-y-0.5 w-0.5 bg-ink" style={{ left: `${x(baseline)}%` }} />
                  <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface" style={{ left: `${x(r.value)}%`, background: color }} />
                </div>
                <div className="num text-xs text-muted"><span className="font-semibold text-ink">{format(r.value)}</span> · {words}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted"><i className="inline-block h-3 w-0.5 bg-ink" />Baseline {format(baseline)}</div>
    </div>
  );
}

export interface CompareMetric { id: string; label: string; format: (v: number | null) => string; values: (number | null)[] }

/** Colours for up to three compared projects: distinct from the cost-category colours. */
export const COMPARE_COLORS = ["var(--s1)", "var(--s6)", "var(--s7)"];

/**
 * One group of bars per metric, one bar per project, each metric on its own scale from zero (negative values
 * draw leftward from a zero line).
 */
export function CompareBars({ names, metrics }: { names: string[]; metrics: CompareMetric[] }) {
  return (
    <div className="grid gap-x-6 gap-y-3 md:grid-cols-2" role="group" aria-label="Projects compared on each figure">
      {metrics.map((m) => {
        const nums = m.values.filter((v): v is number => v !== null);
        const maxAbs = Math.max(...nums.map(Math.abs), 1);
        const hasNeg = nums.some((v) => v < 0);
        const zero = hasNeg ? 30 : 0;
        const scale = hasNeg ? 70 : 100;
        return (
          <div key={m.id}>
            <div className="mb-1 text-[12px] font-semibold text-ink">{m.label}</div>
            <div className="flex flex-col gap-1">
              {m.values.map((v, i) => {
                const w = v === null ? 0 : r2((scale * Math.abs(v)) / maxAbs);
                const left = v !== null && v < 0 ? r2(zero - w) : zero;
                return (
                  <div key={`${names[i]}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <div aria-hidden className="relative h-3.5 rounded bg-surface-2" title={`${names[i]}: ${m.format(v)}`}>
                      {hasNeg && <div className="absolute inset-y-0 w-px bg-line" style={{ left: `${zero}%` }} />}
                      {v !== null && <div className="absolute inset-y-0 rounded" style={{ left: `${left}%`, width: `${Math.max(1, w)}%`, background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />}
                    </div>
                    <span className="num whitespace-nowrap text-xs font-semibold text-ink"><span className="sr-only">{names[i]}: </span>{m.format(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SPLIT_COLOR: Record<string, string> = { build: "var(--build)", run: "var(--run)", platform: "var(--platform)", maint: "var(--maint)" };

/** A thin stacked bar of the plan's cost by stream, with the shares written out beneath it. */
export function MiniSplit({ parts }: { parts: { key: string; label: string; share: number }[] }) {
  const shown = parts.filter((p) => p.share > 0);
  const text = shown.map((p) => `${p.label} ${Math.round(p.share * 100)}%`).join(", ");
  return (
    <div title={text} role="img" aria-label={`Cost split: ${text || "no cost"}`}>
      <div className="flex h-2 overflow-hidden rounded bg-surface-2">
        {shown.map((p) => <div key={p.key} style={{ width: `${r2(p.share * 100)}%`, background: SPLIT_COLOR[p.key] ?? "var(--muted)" }} />)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
        {parts.filter((p) => p.share >= 0.01).map((p) => <span key={p.key} className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rounded-sm" style={{ background: SPLIT_COLOR[p.key] }} />{p.label} {Math.round(p.share * 100)}%</span>)}
      </div>
    </div>
  );
}
