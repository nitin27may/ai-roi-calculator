import { formatIrr, type ComparedProject } from "@studio/engine";
import { cad, fmt } from "./format";

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
