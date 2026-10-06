"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useStudio } from "@/lib/store";
import { monthLegendText, monthTitle } from "@/lib/months";
import { cn } from "@/lib/format";

/** "Month 3" column header with a tooltip naming the calendar month and whether it is build or production. */
export function MonthTh({ m, short = false, className = "n" }: { m: number; short?: boolean; className?: string }) {
  const project = useStudio((s) => s.project);
  return <th scope="col" className={className} title={monthTitle(project.startDate, m, project.timeline.buildMonths)}>{short ? `M${m}` : `Month ${m}`}</th>;
}

/** One sentence that explains the "M1" short form. Put it under any chart or table that uses M-labels. */
export function MonthLegend({ className }: { className?: string }) {
  const project = useStudio((s) => s.project);
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  return (
    <p data-testid="month-legend" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted", className)}>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--s2)" }} />Build</span>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--s3)" }} />Production</span>
      <span>{monthLegendText(project.startDate, B, H)}</span>
    </p>
  );
}

/** Plain-language caption above a table of numbers. */
export function TableNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mb-2 max-w-3xl text-xs text-ink-2", className)}>{children}</p>;
}

/** "Where this comes from" line: names the inputs and links to the page where they change. */
export function WhereFrom({ children, to, toLabel, className }: { children: ReactNode; to?: string; toLabel?: string; className?: string }) {
  return (
    <p className={cn("text-xs text-muted", className)}>
      <b className="font-semibold text-ink-2">Where this comes from:</b> {children}
      {to && <> Change it: <Link href={to} className="font-medium text-accent underline underline-offset-2">{toLabel ?? to}</Link>.</>}
    </p>
  );
}
