"use client";
import { createContext, useContext, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, OctagonAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/format";
import { helpFor, type HelpId } from "@/lib/help";
import { rangeMessage } from "@/lib/validation";
import { HelpTip } from "@/components/help-tip";

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cn("flex min-h-0 min-w-0 flex-col rounded-lg border border-line bg-surface", className)}>{children}</div>;
}

export function CardHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 pb-2 pt-3 [&>*]:min-w-0 [&>*]:max-w-full">
      <div className="min-w-0">
        <h2 className="text-base font-bold">{title}</h2>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

/** `wrap` lays the options out as separate buttons on as many lines as needed (for long strips such as the Value & ROI views) instead of one scrolling strip. */
export function Seg<T extends string>({ value, options, onChange, label, wrap = false }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; wrap?: boolean }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex max-w-full", wrap ? "flex-wrap gap-1" : "overflow-x-auto rounded-md border border-line bg-surface")}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={cn("min-h-6 flex-none whitespace-nowrap px-2.5 py-1 text-xs font-medium", wrap ? "rounded-md border border-line" : "border-r border-line last:border-r-0", o.value === value ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PILL_ICON = { ok: CheckCircle2, warn: AlertTriangle, crit: OctagonAlert } as const;
/** Status is carried by an icon as well as colour, so it reads in greyscale and for colour-blind users. */
export function Pill({ tone = "n", children }: { tone?: "ok" | "warn" | "crit" | "n"; children: ReactNode }) {
  const t = { ok: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", crit: "bg-crit-soft text-crit", n: "bg-surface-2 text-ink-2" }[tone];
  const Icon = tone === "n" ? null : PILL_ICON[tone];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px text-xs font-medium", t)}>{Icon && <Icon size={11} aria-hidden />}{children}</span>;
}

interface FieldContextValue { id: string; help?: string }
const FieldContext = createContext<FieldContextValue | null>(null);
/** Supplies a help id to the Field rendered inside it, for callers (like `Fields`) that build many fields from a spec list. */
export const HelpScope = createContext<string | undefined>(undefined);

/** A labelled input with a help hint. `help` is a key of `lib/help.ts`; the label is tied to the control through `id`. */
export function Field({ label, help, children }: { label: string; help?: HelpId; children: ReactNode }) {
  const id = useId();
  const scoped = useContext(HelpScope);
  const helpId = help ?? scoped;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted">
      <div className="flex items-center gap-0.5">
        <label htmlFor={id} className="min-w-0">{label}</label>
        {helpId && helpFor(helpId) && <HelpTip id={helpId} label={label} />}
      </div>
      <FieldContext.Provider value={{ id, help: helpId }}>{children}</FieldContext.Provider>
    </div>
  );
}

export const inputCls = "num min-w-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] font-medium text-ink";

export function TextInput({ value, onChange, type = "text", placeholder, label }: { value: string; onChange: (v: string) => void; type?: "text" | "month"; placeholder?: string; label?: string }) {
  const ctx = useContext(FieldContext);
  return <input id={ctx?.id} aria-label={ctx ? undefined : label} className={cn(inputCls, type === "text" && "font-sans")} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

/** Free-form text input that commits on blur (used for comma-separated lists). */
export function BlurInput({ defaultValue, onCommit }: { defaultValue: string; onCommit: (text: string) => void }) {
  const ctx = useContext(FieldContext);
  return <input id={ctx?.id} className={inputCls} defaultValue={defaultValue} onBlur={(e) => onCommit(e.target.value)} />;
}

/** A number input that explains a refused value instead of silently clamping it. Inside a `Field` it is labelled by the field;
 * in a table cell pass `label` so it still has an accessible name.
 */
export function NumberInput({ value, onChange, min = 0, max, step, suffix, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; label?: string }) {
  const ctx = useContext(FieldContext);
  const errId = useId();
  // The draft is only held while the typed text is empty or refused; otherwise the committed value is shown.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = ctx?.help ? helpFor(ctx.help)?.limit : undefined;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1">
        <input id={ctx?.id} aria-label={ctx ? undefined : label} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined}
          className={cn(inputCls, "w-full", error && "border-crit")} type="number" value={draft ?? (Number.isFinite(value) ? value : 0)} min={min} max={max} step={step ?? "any"}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (!Number.isFinite(v)) { setDraft(e.target.value); setError(null); return; }
            const problem = rangeMessage(v, { min, max, suffix }, limit);
            setError(problem);
            if (problem) setDraft(e.target.value);
            else { setDraft(null); onChange(v); }
          }}
          onBlur={() => { setDraft(null); setError(null); }} />
        {suffix && <span className="whitespace-nowrap text-xs text-muted">{suffix}</span>}
      </span>
      {error && <span id={errId} role="alert" className="flex items-start gap-1 text-xs leading-snug text-crit"><OctagonAlert size={12} className="mt-0.5 flex-none" aria-hidden />{error}</span>}
    </span>
  );
}

export function Select({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label?: string }) {
  const ctx = useContext(FieldContext);
  return (
    <select id={ctx?.id} aria-label={ctx ? undefined : label} title={options.find((o) => o.value === value)?.label} className={cn(inputCls, "w-full")} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** A remove button with a 24px minimum hit target. */
export function TrashButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cn("inline-flex h-6 min-h-6 w-6 min-w-6 items-center justify-center rounded text-ink-2 hover:bg-crit-soft hover:text-crit", className)}>
      <Trash2 size={14} aria-hidden />
    </button>
  );
}

/** Arrow, Home and End keys move between the rows of a list of selectable rows. Attach to the wrapping element (role="group"; a listbox would be wrong because the list also holds headings and add buttons). */
export function listboxKeys(e: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-list-row]")];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
  e.preventDefault();
  items[next]?.focus();
}

export function Formula({ children }: { children: ReactNode }) {
  return <div className="num whitespace-pre-wrap rounded-md bg-surface-2 px-2.5 py-2 text-xs leading-relaxed text-ink-2">{children}</div>;
}

export function ListRow({ selected, onClick, title, sub, aside, value }: { selected: boolean; onClick: () => void; title: ReactNode; sub?: ReactNode; aside?: ReactNode; value: ReactNode }) {
  return (
    <button type="button" data-list-row aria-pressed={selected} onClick={onClick}
      className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-l-[3px] border-b-line px-3.5 py-2 text-left",
        selected ? "border-l-accent bg-accent-soft" : "border-l-transparent hover:bg-surface-2")}>
      <span className="min-w-0">
        <span className="line-clamp-2 break-words font-medium" title={typeof title === "string" ? title : undefined}>{title}</span>
        {sub && <span className="line-clamp-2 break-words text-xs text-muted" title={typeof sub === "string" ? sub : undefined}>{sub}</span>}
      </span>
      <span>{aside}</span>
      <span className="num whitespace-nowrap text-right text-[12.5px]">{value}</span>
    </button>
  );
}

export const GroupHead = ({ children }: { children: ReactNode }) => (
  <div className="px-3.5 pb-1 pt-2.5 text-xs uppercase tracking-[0.08em] text-muted">{children}</div>
);

export function Bar({ ratio }: { ratio: number }) {
  return <div className="h-[7px] rounded bg-accent" style={{ width: `${Math.max(1, Math.min(100, ratio * 100))}%` }} />;
}
