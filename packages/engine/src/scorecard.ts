import { workloadVolume } from "./benefits.js";
import type { Project, ScoreItem } from "./project.js";

/**
 * Non-financial benefit scorecard.
 *
 * Improvement % of an item = (after - before) / |before| when higher is better, and (before - after) / |before| when
 * lower is better. So 10 days down to 2 days (lower is better) is +80%, and a score of 60 up to 75 (higher is better) is
 * +25%. When before is 0 the percentage is undefined (null): it is shown as "n/a" and left out of the composite.
 *
 * Composite index = the weighted average improvement over the items that have a weight above 0 and a defined
 * improvement: sum(weightPct x improvement) / sum(weightPct). It is a percentage; null when no item qualifies.
 * Confidence is displayed beside each item and does NOT discount the index.
 *
 * Monetised value per month, at full rollout:
 *   good-direction units x cadPerUnit x monthly volume x confidencePct / 100
 * where good-direction units = after - before when higher is better and before - after when lower is better. It is
 * negative (a cost) when the item moves the wrong way. Volume is the linked workload's items, else the figure entered.
 * In the ledger the value starts at go-live and follows the adoption ramp like other usage benefits (no growth or
 * escalation). Only monetised items reach MonthBenefit.scorecard, Month.benefit and so ROI, payback, NPV and IRR.
 */
export const scoreItems = (p: Pick<Project, "benefits">): ScoreItem[] => p.benefits.scorecard ?? [];

export type ScoreDirection = "better" | "worse" | "no change";

export const SCORE_DIMENSION_LABEL: Record<ScoreItem["dimension"], string> = {
  speed: "Speed", customer: "Customer experience", employee: "Employee experience", compliance: "Compliance and risk", agility: "Agility", other: "Other",
};

/** Units moved in the good direction (negative when the item moves the wrong way). */
export const scoreGoodUnits = (i: ScoreItem): number => (i.higherIsBetter ? i.after - i.before : i.before - i.after);

/** Improvement as a percentage of the before value; null when before is 0. */
export function scoreImprovementPct(i: ScoreItem): number | null {
  if (i.before === 0) return null;
  return (scoreGoodUnits(i) / Math.abs(i.before)) * 100;
}

export function scoreDirection(i: ScoreItem): ScoreDirection {
  const g = scoreGoodUnits(i);
  return g > 0 ? "better" : g < 0 ? "worse" : "no change";
}

/** Monthly volume a monetised item applies to. */
export function scoreVolume(p: Pick<Project, "workloads">, i: ScoreItem): number {
  const m = i.monetise;
  if (!m) return 0;
  const w = m.volumeFrom ? p.workloads.find((x) => x.id === m.volumeFrom) : undefined;
  return (w ? workloadVolume(w).items : undefined) ?? m.volumePerMonth ?? 0;
}

/** Monthly value of a monetised item at full rollout, weighted by its confidence; 0 when not monetised. */
export const scoreMonthly = (p: Pick<Project, "workloads">, i: ScoreItem): number =>
  i.monetise ? scoreGoodUnits(i) * i.monetise.cadPerUnit * scoreVolume(p, i) * (i.confidencePct / 100) : 0;

/** Value of an item in plan month `m`: its full monthly value times the adoption ramp from go-live. 0 during build. */
export function scoreMonthValue(p: Project, i: ScoreItem, m: number): number {
  const B = p.timeline.buildMonths;
  if (m <= B || !i.monetise) return 0;
  const r = p.timeline.adoptionRampMonths;
  const ramp = r === 0 ? 1 : Math.min(1, (m - B) / r);
  return scoreMonthly(p, i) * ramp;
}

/** Sum of the monetised items' monthly value at full rollout: what `totals.benefitRate` takes from the scorecard. */
export const scoreFullMonthly = (p: Project): number => scoreItems(p).reduce((s, i) => s + scoreMonthly(p, i), 0);

export interface ScoreRow {
  id: string;
  label: string;
  dimension: ScoreItem["dimension"];
  improvementPct: number | null;
  direction: ScoreDirection;
  /** The item's share of the composite, in percentage points: weight / total weight x improvement. The contributions add up to the composite. 0 when it has no weight or no defined improvement. */
  contribution: number;
  monthlyValue: number;
  monetised: boolean;
}

export interface ScoreResult { rows: ScoreRow[]; composite: number | null; monetisedMonthly: number }

/** Per-item improvement, direction and weighted contribution, the composite index, and the monetised value per month. */
export function scoreRows(p: Project): ScoreResult {
  const items = scoreItems(p);
  const counted = items.filter((i) => i.weightPct > 0 && scoreImprovementPct(i) !== null);
  const totalWeight = counted.reduce((s, i) => s + i.weightPct, 0);
  const rows = items.map((i): ScoreRow => {
    const imp = scoreImprovementPct(i);
    const inIndex = i.weightPct > 0 && imp !== null && totalWeight > 0;
    return { id: i.id, label: i.label, dimension: i.dimension, improvementPct: imp, direction: scoreDirection(i), contribution: inIndex ? (i.weightPct / totalWeight) * imp : 0, monthlyValue: scoreMonthly(p, i), monetised: !!i.monetise };
  });
  return { rows, composite: totalWeight > 0 ? rows.reduce((s, r) => s + r.contribution, 0) : null, monetisedMonthly: rows.reduce((s, r) => s + r.monthlyValue, 0) };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const n = (x: number) => x.toLocaleString("en-CA", { maximumFractionDigits: 2 });

/** One row per item for the Excel export and the Report. Empty without items. */
export function scorecardRows(p: Project): Record<string, string | number>[] {
  const res = scoreRows(p);
  return scoreItems(p).map((i, k) => {
    const r = res.rows[k]!;
    return {
      Item: i.label,
      Dimension: SCORE_DIMENSION_LABEL[i.dimension],
      Measure: i.measure,
      Unit: i.unit,
      Before: i.before,
      After: i.after,
      Direction: r.direction === "better" ? "Better" : r.direction === "worse" ? "Worse" : "No change",
      "Improvement (%)": r.improvementPct === null ? "n/a" : r2(r.improvementPct),
      "Weight (%)": i.weightPct,
      "Confidence (%)": i.confidencePct,
      "In NPV and payback": i.monetise ? `Yes, C$${n(i.monetise.cadPerUnit)} per ${i.unit}` : "No",
      "Value per month, full rollout (CAD)": i.monetise ? r2(r.monthlyValue) : 0,
    };
  });
}
