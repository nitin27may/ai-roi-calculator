"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cad, kcad } from "@/lib/format";

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
