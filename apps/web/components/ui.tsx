"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 min-w-0 flex-col rounded-lg border border-line bg-surface", className)}>{children}</div>;
}

export function CardHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 pb-2 pt-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold">{title}</h2>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-line bg-surface">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={cn("border-r border-line px-2.5 py-1 text-xs font-medium last:border-r-0", o.value === value ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ tone = "n", children }: { tone?: "ok" | "warn" | "crit" | "n"; children: ReactNode }) {
  const t = { ok: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", crit: "bg-crit-soft text-crit", n: "bg-surface-2 text-ink-2" }[tone];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-medium", t)}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5 text-[11.5px] text-muted">
      {label}
      {children}
    </label>
  );
}

const inputCls = "num min-w-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] font-medium text-ink";

export function NumberInput({ value, onChange, min = 0, max, step, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <span className="flex items-center gap-1">
      <input className={cn(inputCls, "w-full")} type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step ?? "any"}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) onChange(Math.max(min, max !== undefined ? Math.min(max, v) : v));
        }} />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );
}

export function Select({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select className={cn(inputCls, "w-full")} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Formula({ children }: { children: ReactNode }) {
  return <div className="num whitespace-pre-wrap rounded-md bg-surface-2 px-2.5 py-2 text-xs leading-relaxed text-ink-2">{children}</div>;
}

export function ListRow({ selected, onClick, title, sub, aside, value }: { selected: boolean; onClick: () => void; title: ReactNode; sub?: ReactNode; aside?: ReactNode; value: ReactNode }) {
  return (
    <button type="button" role="option" aria-selected={selected} onClick={onClick}
      className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-l-[3px] border-b-line px-3.5 py-2 text-left",
        selected ? "border-l-accent bg-accent-soft" : "border-l-transparent hover:bg-surface-2")}>
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted">{sub}</span>}
      </span>
      <span>{aside}</span>
      <span className="num whitespace-nowrap text-right text-[12.5px]">{value}</span>
    </button>
  );
}

export const GroupHead = ({ children }: { children: ReactNode }) => (
  <div className="px-3.5 pb-1 pt-2.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">{children}</div>
);

export function Bar({ ratio }: { ratio: number }) {
  return <div className="h-[7px] rounded bg-accent" style={{ width: `${Math.max(1, Math.min(100, ratio * 100))}%` }} />;
}
