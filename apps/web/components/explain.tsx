"use client";
import type { Line } from "@studio/engine";
import { Formula } from "@/components/ui";
import { cad } from "@/lib/format";

/** Lines grouped by id, summed over the build months, with their formula. */
export function Explain({ title, lines, months }: { title: string; lines: Line[]; months: number }) {
  const byId = new Map<string, { label: string; cost: number; formula: string }>();
  for (const l of lines) {
    const e = byId.get(l.id) ?? { label: l.label, cost: 0, formula: l.formula };
    e.cost += l.cost;
    byId.set(l.id, e);
  }
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
      <div className="flex flex-col gap-1.5">
        {[...byId.values()].map((e) => (
          <Formula key={e.label}>
            <span className="flex justify-between gap-3 font-semibold text-ink"><span>{e.label}</span><span>{cad(e.cost)}{months > 1 ? ` over ${months} mo` : ""}</span></span>
            {e.formula}
          </Formula>
        ))}
      </div>
    </div>
  );
}
