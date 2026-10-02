"use client";
import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";

/** A small disclosure menu for adding an item of a chosen kind. */
export function AddMenu<K extends string>({ label, items, onPick }: { label: string; items: { kind: K; label: string; detail: string }[]; onPick: (k: K) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    addEventListener("click", close);
    return () => removeEventListener("click", close);
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2"><Plus size={14} />{label}</summary>
      <div role="menu" className="absolute bottom-full left-0 z-20 mb-1 w-[300px] overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
        {items.map((i) => (
          <button key={i.kind} type="button" role="menuitem" className="block w-full border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
            onClick={() => { onPick(i.kind); if (ref.current) ref.current.open = false; }}>
            <span className="block text-[13px] font-medium">{i.label}</span>
            <span className="block text-[11.5px] text-muted">{i.detail}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

/** Editable title plus a remove button for an inspector. */
export function ItemHeader({ label, sub, onRename, onRemove, removeLabel }: { label: string; sub: string; onRename: (v: string) => void; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <input aria-label="Name" className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-display text-base font-bold hover:border-line focus:border-line" value={label} onChange={(e) => onRename(e.target.value)} />
        <div className="px-1 text-xs text-muted">{sub}</div>
      </div>
      <button type="button" className="whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-xs text-crit hover:bg-crit-soft" onClick={onRemove}>{removeLabel}</button>
    </div>
  );
}
