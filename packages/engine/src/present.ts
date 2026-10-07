import type { Ledger } from "./ledger.js";
import type { Range } from "./ranges.js";
import type { RoiResult } from "./roi.js";
import type { Verdict } from "./report.js";

/**
 * Presentation rules for ranges. Nothing here changes an engine number; it decides how a range
 * is shown so a figure reads as a decision aid and not as noise.
 */

/** A money range is "wide" when high minus low is more than this many times the expected figure. */
export const WIDE_RATIO = 2;
/** An IRR range is "wide" when it spans more than this many percentage points, or its low end is below the floor. */
export const IRR_MAX_WIDTH_POINTS = 200;
export const IRR_LOW_FLOOR_PCT = -50;
/** IRR is shown capped at both ends; the table view still has the full number. */
export const IRR_CAP_HIGH_PCT = 300;
export const IRR_CAP_LOW_PCT = -90;

export interface RangeBand {
  /** True when the range is too wide to show as plain numbers. */
  wide: boolean;
  /** (high - low) divided by |expected|; Infinity when expected is zero and the range is not. */
  ratio: number;
}

/** Whether a money range (cost, benefit, NPV) is narrow enough to show as "low to high". */
export function moneyBand(r: Range): RangeBand {
  const spread = r.high - r.low;
  if (spread <= 0) return { wide: false, ratio: 0 };
  const base = Math.abs(r.expected);
  const ratio = base > 0 ? spread / base : Infinity;
  return { wide: ratio > WIDE_RATIO, ratio };
}

/** Whether an IRR range (percent) is narrow enough to show. A missing range counts as not shown, not wide. */
export function irrBand(r: Range | null): RangeBand & { shown: boolean } {
  if (!r) return { wide: false, ratio: 0, shown: false };
  const width = r.high - r.low;
  const wide = width > IRR_MAX_WIDTH_POINTS || r.low < IRR_LOW_FLOOR_PCT;
  return { wide, ratio: width, shown: !wide };
}

/** IRR as text, capped at both ends so a runaway figure is labelled rather than printed. */
export function formatIrr(pct: number | null): string {
  if (pct === null) return "Not defined";
  if (pct > IRR_CAP_HIGH_PCT) return `over ${IRR_CAP_HIGH_PCT}% a year`;
  if (pct < IRR_CAP_LOW_PCT) return `below ${IRR_CAP_LOW_PCT}% a year`;
  return `${Math.round(pct).toLocaleString("en-CA")}% a year`;
}

export const WIDE_RANGE_TEXT = "Wide range: see how sure we are";

export type SplitKey = "build" | "run" | "platform" | "maint";
export interface CostSplitPart { key: SplitKey; label: string; value: number; share: number }

/**
 * Whole-plan cost by stream in four parts: build (labour, AI Dev Lab, dev environment), production
 * AI usage, platform, and maintenance with transition. Shares add to 1 (all 0 when there is no cost).
 */
export function costSplit(ledger: Ledger): CostSplitPart[] {
  const t = { build: 0, run: 0, platform: 0, maint: 0 };
  for (const m of ledger.months) {
    t.build += m.byStream.labour + m.byStream.devlab + m.byStream.devenv + (m.byStream.delivery ?? 0);
    // Non-production environments split by phase: build months with the build, production months with platform cost.
    if (m.phase === "build") t.build += m.byStream.env ?? 0;
    else t.platform += m.byStream.env ?? 0;
    t.run += m.byStream.run;
    t.platform += m.byStream.platform;
    t.maint += m.byStream.maint + m.byStream.transition;
  }
  const total = t.build + t.run + t.platform + t.maint;
  const labels: Record<SplitKey, string> = { build: "Build", run: "Production AI usage", platform: "Platform", maint: "Maintenance" };
  return (Object.keys(t) as SplitKey[]).map((key) => ({ key, label: labels[key], value: t[key], share: total > 0 ? t[key] / total : 0 }));
}

export interface ComparedProject {
  name: string;
  build: number;
  runPerMonth: number;
  benefitPerYear: number;
  npv: number;
  paybackMonth: number | null;
  irrPct: number | null;
}

/** The six figures the project comparison shows, from a ledger and its ROI. */
export function compareFigures(name: string, ledger: Ledger, roi: RoiResult): ComparedProject {
  const t = ledger.totals;
  return { name, build: t.build, runPerMonth: t.runRate + t.maintRate, benefitPerYear: t.benefitRate * 12, npv: roi.npv, paybackMonth: roi.paybackMonth, irrPct: roi.irrPct };
}

/** The one-line verdict, from payback and NPV. Used by the Summary, the Report and the portfolio cards. */
export function verdictFor(roi: Pick<RoiResult, "paybackMonth" | "npv">): Verdict {
  const paysBack = roi.paybackMonth !== null;
  const npvPositive = roi.npv >= 0;
  const tone: Verdict["tone"] = paysBack && npvPositive ? "ok" : paysBack || npvPositive ? "warn" : "crit";
  return { text: paysBack ? `Pays back in month ${roi.paybackMonth}` : "Does not pay back within the plan", npvPositive, paysBack, tone };
}
