import { formatIrr, type ComparedProject } from "@roi-calculator/engine";
import { cad, fmt } from "./format";
import type { ExtraFigures } from "./portfolio";

export interface CompareRow {
  id: keyof Omit<ComparedProject, "name">;
  label: string;
  lowerIsBetter: boolean;
  /** The number behind the bar; null when the project has no value (no payback, no IRR). */
  value: (p: ComparedProject) => number | null;
  /** Full-precision text for the table. */
  table: (v: number | null) => string;
  /** Short text for the bar label; IRR is capped here. */
  bar: (v: number | null) => string;
}

export const COMPARE_ROWS: CompareRow[] = [
  { id: "build", label: "Build cost", lowerIsBetter: true, value: (p) => p.build, table: (v) => cad(v ?? 0), bar: (v) => cad(v ?? 0) },
  { id: "runPerMonth", label: "Run rate per month", lowerIsBetter: true, value: (p) => p.runPerMonth, table: (v) => cad(v ?? 0), bar: (v) => cad(v ?? 0) },
  { id: "benefitPerYear", label: "Benefit per year", lowerIsBetter: false, value: (p) => p.benefitPerYear, table: (v) => cad(v ?? 0), bar: (v) => cad(v ?? 0) },
  { id: "npv", label: "NPV", lowerIsBetter: false, value: (p) => p.npv, table: (v) => cad(v ?? 0), bar: (v) => cad(v ?? 0) },
  { id: "paybackMonth", label: "Payback", lowerIsBetter: true, value: (p) => p.paybackMonth, table: (v) => (v === null ? "Not within plan" : `Month ${v}`), bar: (v) => (v === null ? "Not within plan" : `Month ${v}`) },
  { id: "irrPct", label: "IRR", lowerIsBetter: false, value: (p) => p.irrPct, table: (v) => (v === null ? "Not defined" : `${fmt(v, 1)}% a year`), bar: (v) => (v === null ? "Not defined" : formatIrr(v)) },
];

/** Index of the best value, or -1 when fewer than two projects have a value or the best is tied. */
export function bestIndex(values: (number | null)[], lowerIsBetter: boolean): number {
  const have = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  if (have.length < 2) return -1;
  const best = have.reduce((a, b) => ((lowerIsBetter ? b.v < a.v : b.v > a.v) ? b : a));
  const tied = have.filter((x) => x.v === best.v).length > 1;
  return tied ? -1 : best.i;
}

export interface ExtraCompareRow {
  id: keyof ExtraFigures;
  label: string;
  lowerIsBetter: boolean;
  table: (v: number | null) => string;
}

/** Rows added by the portfolio view. A project without the data shows "n/a" and takes no part in the Best mark. */
export const EXTRA_COMPARE_ROWS: ExtraCompareRow[] = [
  { id: "discountedPaybackMonth", label: "Discounted payback", lowerIsBetter: true, table: (v) => (v === null ? "n/a" : `Month ${v}`) },
  { id: "savingPerMonth", label: "Saving per month from current state", lowerIsBetter: false, table: (v) => (v === null ? "n/a" : cad(v)) },
  { id: "scorecardComposite", label: "Scorecard composite", lowerIsBetter: false, table: (v) => (v === null ? "n/a" : `${fmt(v, 1)}% better`) },
  { id: "monetisedMonthly", label: "Monetised scorecard value per month", lowerIsBetter: false, table: (v) => (v === null ? "n/a" : cad(v)) },
];
