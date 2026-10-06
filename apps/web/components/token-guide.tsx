"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Formula } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Guide } from "@/lib/walkthrough";

/** A step-by-step reading of one calculation: input, tokens, loops, what each loop re-sends, cost. Driven by the numbers the page is showing. */
export function TokenGuide({ guide, heading = "How this is calculated" }: { guide: Pick<Guide, "id" | "title" | "steps">; heading?: string }) {
  const [at, setAt] = useState(0);
  const i = Math.min(at, guide.steps.length - 1);
  const s = guide.steps[i]!;
  return (
    <section aria-label={heading} data-testid={`guide-${guide.id}`} className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-3">
      <div>
        <h3 className="text-sm font-semibold">{heading}</h3>
        <div className="text-xs text-muted">Worked example: {guide.title}</div>
      </div>
      <ol className="flex flex-wrap gap-1" aria-label="Steps">
        {guide.steps.map((x, k) => (
          <li key={x.id}>
            <button type="button" aria-current={k === i ? "step" : undefined} onClick={() => setAt(k)}
              className={cn("min-h-6 rounded-md border px-2 text-xs font-medium", k === i ? "border-accent bg-accent text-accent-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
              {x.title.replace(/^\d+\.\s*/, `${k + 1}. `)}
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2" aria-live="polite">
        <h4 className="text-[13px] font-semibold">{s.title}</h4>
        <p className="text-[13px] text-ink-2">{s.plain}</p>
        <table className="data">
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.label}><td className="w-[38%]">{r.label}</td><td className="num font-medium">{r.value}{r.note && <div className="text-xs font-normal text-muted">{r.note}</div>}</td></tr>
            ))}
          </tbody>
        </table>
        {s.formula && <Formula>{s.formula}</Formula>}
      </div>
      <div className="flex items-center justify-between">
        <button type="button" disabled={i === 0} onClick={() => setAt(i - 1)} className="inline-flex min-h-6 items-center gap-1 rounded border border-line px-2 text-xs hover:bg-surface-2 disabled:opacity-40"><ChevronLeft size={14} />Back</button>
        <span className="text-xs text-muted">Step {i + 1} of {guide.steps.length}</span>
        <button type="button" disabled={i === guide.steps.length - 1} onClick={() => setAt(i + 1)} className="inline-flex min-h-6 items-center gap-1 rounded border border-line px-2 text-xs hover:bg-surface-2 disabled:opacity-40">Next<ChevronRight size={14} /></button>
      </div>
    </section>
  );
}
