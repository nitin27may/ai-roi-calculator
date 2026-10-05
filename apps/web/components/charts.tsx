"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cad, cadUnit, kcad } from "@/lib/format";

/** Measures a container so charts draw at real pixel size (crisp text, no stretching). */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

interface Tip { x: number; y: number; body: ReactNode }
function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none fixed z-50 max-w-[260px] rounded-md bg-ink px-2.5 py-2 text-xs leading-snug text-bg"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 270), top: Math.min(tip.y + 14, window.innerHeight - 180) }}>
      {tip.body}
    </div>
  );
}
const TipRow = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-3"><span>{k}</span><span className="num">{v}</span></div>;

export interface Series { key: string; label: string; color: string }

/** Stacked monthly bars with an optional dashed line (same CAD axis). */
export function StackedBars({ rows, series, line, xLabel, className }: { rows: Record<string, number>[]; series: Series[]; line?: Series; xLabel: (i: number) => string; className?: string }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const W = Math.max(320, w), H = Math.max(160, h), L = 54, R = 10, T = 10, B = 24;
  const tot = rows.map((r) => series.reduce((s, x) => s + (r[x.key] ?? 0), 0));
  const max = niceMax(Math.max(...tot, ...(line ? rows.map((r) => r[line.key] ?? 0) : [0])));
  const bw = (W - L - R) / Math.max(1, rows.length), y = (v: number) => T + (H - T - B) * (1 - v / max);
  const every = Math.ceil(rows.length / Math.max(1, W / 52));
  return (
    <div ref={ref} className={className ?? "relative min-h-[200px] flex-1"}>
      {w > 0 && (
        <svg className="chart absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly cost by stream">
          {[0, 1, 2, 3, 4].map((i) => <g key={i}><line x1={L} x2={W - R} y1={y((max * i) / 4)} y2={y((max * i) / 4)} stroke="var(--line)" /><text x={L - 6} y={y((max * i) / 4) + 4} textAnchor="end">{kcad((max * i) / 4)}</text></g>)}
          {rows.map((r, i) => {
            let acc = 0;
            const bwInner = Math.max(2, bw * 0.7), x = L + i * bw + (bw - bwInner) / 2;
            return (
              <g key={i}>
                {series.map((s) => {
                  const v = r[s.key] ?? 0;
                  if (v <= 0) return null;
                  const y0 = y(acc), y1 = y(acc + v);
                  acc += v;
                  const top = acc >= tot[i]! - 0.01;
                  return <rect key={s.key} x={x} y={y1} width={bwInner} height={Math.max(0, y0 - y1 - (top ? 0 : 1.5))} fill={s.color} rx={top ? 2 : 0} />;
                })}
                {i % every === 0 && <text x={x + bwInner / 2} y={H - 6} textAnchor="middle">{xLabel(i)}</text>}
                <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent"
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, body: <><b>{xLabel(i)}</b>{series.map((s) => (r[s.key] ?? 0) > 0 && <TipRow key={s.key} k={s.label} v={cad(r[s.key]!)} />)}<TipRow k="Total" v={cad(tot[i]!)} />{line && <TipRow k={line.label} v={cad(r[line.key] ?? 0)} />}</> })}
                  onMouseLeave={() => setTip(null)} />
              </g>
            );
          })}
          {line && <path d={rows.map((r, i) => `${i ? "L" : "M"}${L + i * bw + bw / 2},${y(r[line.key] ?? 0)}`).join("")} fill="none" stroke={line.color} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Cumulative net position with zero line and payback marker. */
export function CumulativeLine({ values, payback, className }: { values: number[]; payback: number | null; className?: string }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const W = Math.max(320, w), H = Math.max(160, h), L = 58, R = 12, T = 18, B = 24;
  const mn = Math.min(0, ...values), mx = Math.max(0, ...values);
  const lo = mn < 0 ? -niceMax(-mn) : 0, hi = mx > 0 ? niceMax(mx) : 1;
  const y = (v: number) => T + ((H - T - B) * (hi - v)) / (hi - lo), x = (i: number) => L + ((W - L - R) * i) / Math.max(1, values.length - 1);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const ticks = [...new Set([lo, lo / 2, 0, hi / 2, hi])];
  const step = (W - L - R) / Math.max(1, values.length - 1);
  return (
    <div ref={ref} className={className ?? "relative min-h-[200px] flex-1"}>
      {w > 0 && (
        <svg className="chart absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative net position by month">
          {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--muted)" : "var(--line)"} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{kcad(v)}</text></g>)}
          <path d={`${path}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--accent)" opacity={0.12} />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {values.map((_, i) => (i % 6 === 0 || i === values.length - 1) && <text key={i} x={x(i)} y={H - 6} textAnchor="middle">M{i + 1}</text>)}
          {payback && <g><circle cx={x(payback - 1)} cy={y(values[payback - 1]!)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} /><text x={x(payback - 1)} y={y(values[payback - 1]!) - 10} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>Payback · month {payback}</text></g>}
          {values.map((v, i) => <rect key={i} x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent" onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, body: <><b>Month {i + 1}</b><TipRow k="Cumulative net" v={cad(v)} /></> })} onMouseLeave={() => setTip(null)} />)}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

export function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1), w = 66, h = 20, bw = w / Math.max(1, values.length);
  return (
    <svg width={w} height={h} aria-hidden="true" className="block">
      {values.map((v, i) => <rect key={i} x={i * bw + 1} y={h - Math.max(1, (v / max) * h)} width={Math.max(1, bw - 2)} height={Math.max(1, (v / max) * h)} rx={1} fill={color} />)}
    </svg>
  );
}

/** Shows a chart, with a small toggle to switch to an accessible table of the same data. */
export function ViewToggle({ table, children }: { table: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div>
      <div className="flex justify-end">
        <button type="button" className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "View as chart" : "View as table"}
        </button>
      </div>
      {asTable ? table : children}
    </div>
  );
}

export interface WaterfallBar { id: string; label: string; value: number; color: "build" | "run" | "benefit" | "ink" }

const WATERFALL_COLOR: Record<WaterfallBar["color"], string> = { build: "var(--build)", run: "var(--run)", benefit: "var(--benefit)", ink: "var(--ink)" };

/**
 * Horizontal waterfall: cost steps draw down from the running total, the benefit step draws it
 * back up, and the net step is a full bar from zero. The row label sits in its own HTML column
 * so it can never collide with the amount label drawn against the bar; semantic colours, no
 * chart library.
 */
export function Waterfall({ steps, costIds, className }: { steps: WaterfallBar[]; costIds: string[]; className?: string }) {
  let running = 0;
  const bars = steps.map((b) => {
    if (b.id === "net") return { ...b, start: 0, end: b.value };
    const start = running;
    running += costIds.includes(b.id) ? -b.value : b.value;
    return { ...b, start, end: running };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.start, b.end)));
  const hi = Math.max(0, ...bars.map((b) => Math.max(b.start, b.end)));
  const pad = (hi - lo || 1) * 0.08;
  // Rounded to 2 decimals so the style strings are identical on the server and in the browser (unrounded floats differ in the last digits and trip hydration).
  const pct = (v: number) => Math.round((10000 * (v - (lo - pad))) / (hi - lo + 2 * pad || 1)) / 100;
  const zero = pct(0);
  const labelCol = "minmax(100px,150px)";
  return (
    <div className={className ?? "flex flex-col gap-1.5"} role="img" aria-label="Waterfall from build cost to net">
      <div className="grid items-center gap-2 text-[10.5px] text-muted" style={{ gridTemplateColumns: labelCol + " 1fr" }}>
        <span />
        <div className="relative h-4">
          <span className="num absolute -translate-x-1/2" style={{ left: `${zero}%` }}>C$0</span>
        </div>
      </div>
      {bars.map((b) => {
        const color = b.color === "ink" && b.value < 0 ? "var(--risk)" : WATERFALL_COLOR[b.color];
        const left = Math.min(pct(b.start), pct(b.end)), width = Math.max(0.6, Math.round(100 * Math.abs(pct(b.end) - pct(b.start))) / 100);
        const labelOnRight = pct(b.end) >= pct(b.start);
        // Costs are entered as positive magnitudes internally; show them signed so direction reads without decoding bar position.
        const signedValue = costIds.includes(b.id) ? -b.value : b.value;
        const amount = `${signedValue >= 0 ? "+" : ""}${cad(signedValue)}`;
        // Keep the amount label outside the bar when there's room; otherwise pin it against the
        // bar's own inner edge with a matching background, so it stays readable even when it's
        // wider than the bar and runs past it onto the empty track.
        const end = Math.round(100 * (left + width)) / 100;
        const fitsOutside = labelOnRight ? end < 82 : left > 18;
        const outsideStyle = labelOnRight ? { left: `calc(${end}% + 6px)` } : { right: `calc(${Math.round(100 * (100 - left)) / 100}% + 6px)` };
        const insideStyle = labelOnRight ? { right: `calc(${Math.round(100 * (100 - end)) / 100}% + 4px)` } : { left: `calc(${left}% + 4px)` };
        return (
          <div key={b.id} className="grid items-center gap-2 text-[12px]" style={{ gridTemplateColumns: labelCol + " 1fr" }}>
            <span className="truncate text-ink-2" title={b.label}>{b.label}</span>
            <div className="relative h-6" title={`${b.label}: ${amount}`}>
              <div className="absolute inset-y-0 w-px bg-line" style={{ left: `${zero}%` }} />
              <div className="absolute top-1 bottom-1 rounded" style={{ left: `${left}%`, width: `${width}%`, background: color }} />
              {fitsOutside ? (
                <span className="num absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11.5px] font-semibold text-ink" style={outsideStyle}>{amount}</span>
              ) : (
                <span className="num absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1 text-[11.5px] font-semibold" style={{ ...insideStyle, background: color, color: "var(--bg)" }}>{amount}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A cost driver's stream, for colouring its bar with the one-meaning-per-colour palette. */
export type DriverColor = "labour" | "devlab" | "run" | "platform" | "maint" | "other";

const DRIVER_COLOR: Record<DriverColor, string> = {
  labour: "var(--build-2)", devlab: "var(--build)", run: "var(--run)", platform: "var(--platform)", maint: "var(--maint)", other: "var(--muted)",
};

/** Ranked horizontal bars, longest first, coloured by stream — used for cost drivers, never a pie. */
export function RankedBars({ rows, className }: { rows: { label: string; value: number; color: DriverColor }[]; className?: string }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div ref={ref} className={className ?? "flex flex-col gap-2"}>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[12.5px]">
          <div className="min-w-0">
            <div className="truncate text-ink-2">{r.label}</div>
            <div className="h-[9px] overflow-hidden rounded bg-surface-2">
              {w > 0 && <div className="h-full rounded" style={{ width: `${Math.max(1.5, (100 * r.value) / max)}%`, background: DRIVER_COLOR[r.color] }} />}
            </div>
          </div>
          <span className="num whitespace-nowrap font-semibold text-ink">{cad(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** A bullet bar: this project's unit cost against today's manual cost for the same unit, when known. */
export function BulletBar({ value, baseline, color = "var(--accent)" }: { value: number; baseline: number | null; color?: string }) {
  const max = Math.max(value, baseline ?? 0, 0.01) * 1.15;
  return (
    <div className="relative h-[18px] rounded bg-surface-2">
      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.max(1.5, (100 * value) / max)}%`, background: color }} />
      {baseline !== null && <div className="absolute inset-y-[-3px] w-0.5 bg-ink" style={{ left: `${Math.min(99, (100 * baseline) / max)}%` }} title={`Today, manually: ${cadUnit(baseline)}`} />}
    </div>
  );
}

export interface RangeRow { id: string; label: string; low: number; expected: number; high: number; format?: (v: number) => string; /** The range is too wide to read as plain numbers; the row is tagged and the bar is drawn lighter. */ wide?: boolean }

/**
 * One bar per figure: the span from the lowest to the highest case, with the expected value marked. Rows share one
 * scale per call, so pass figures of the same kind (money). The "View as table" toggle shows the same numbers as text.
 */
export function RangeBar({ rows, caption }: { rows: RangeRow[]; caption?: string }) {
  const show = (r: RangeRow, v: number) => (r.format ?? cad)(v);
  const table = (
    <table className="data">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead><tr><th>Figure</th><th className="n">Low</th><th className="n">Expected</th><th className="n">High</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.label}{r.wide ? " (wide range)" : ""}</td><td className="n">{show(r, r.low)}</td><td className="n">{show(r, r.expected)}</td><td className="n">{show(r, r.high)}</td></tr>)}</tbody>
    </table>
  );
  return (
    <ViewToggle table={table}>
      <div className="flex flex-col gap-2.5" role="img" aria-label={caption ?? "Low, expected and high for each figure"}>
        {rows.map((r) => {
          // Scale to the span itself, with a little padding; zero only shows when the range reaches it.
          const pad = ((r.high - r.low) || Math.abs(r.expected) || 1) * 0.06;
          const lo = r.low - pad, hi = r.high + pad;
          const span = hi - lo || 1;
          const x = (v: number) => (100 * (v - lo)) / span;
          const pos = (v: number) => Math.min(98, Math.max(2, x(v)));
          return (
            <div key={r.id} className="grid grid-cols-[minmax(100px,150px)_1fr] items-center gap-2 text-[12px]">
              <span className="truncate text-ink-2" title={r.label}>{r.label}{r.wide && <span className="ml-1 rounded bg-warn-soft px-1 text-[10.5px] font-medium text-warn">Wide</span>}</span>
              <div>
                <div className="relative h-5" title={`${r.label}: ${show(r, r.low)} to ${show(r, r.high)}, expected ${show(r, r.expected)}`}>
                  {x(0) > 0 && x(0) < 100 && <div className="absolute inset-y-0 w-px bg-line" style={{ left: `${x(0)}%` }} />}
                  <div className="absolute top-1.5 bottom-1.5 rounded bg-surface-2" style={{ left: `${x(r.low)}%`, width: `${Math.max(0.8, x(r.high) - x(r.low))}%`, background: "var(--accent)", opacity: 0.35 }} />
                  <div className="absolute inset-y-0.5 w-0.5 rounded bg-ink" style={{ left: `${pos(r.expected)}%` }} />
                </div>
                <div className="num flex justify-between text-[11px] text-muted"><span>{show(r, r.low)}</span><span className="font-semibold text-ink">{show(r, r.expected)}</span><span>{show(r, r.high)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </ViewToggle>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-2.5 text-[11.5px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <i className={i.line ? "inline-block h-0.5 w-3.5" : "inline-block h-2.5 w-2.5 rounded-sm"} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
