import type { Catalog } from "@roi-calculator/catalog";
import { PriceBook } from "./pricing.js";
import type { Percentile } from "./harness.js";
import { buildLedger, type Ledger } from "./ledger.js";
import type { Project, Workload } from "./project.js";
import { computeRoi, roiOptions, type RoiResult } from "./roi.js";
import { workloadLines } from "./workloads.js";
import { resolveAssumptions } from "./assumptions.js";
import { requestVolumes } from "./hosting.js";

/**
 * Ranges. Two kinds, both built from documented assumptions rather than a simulation of uncertainty:
 *
 * - Workload range (`workloadRange`): the same workload priced at P10, the chosen percentile (P50 by default) and P90.
 *   Agents use the harness simulation; chat and LLM-call workloads scale their token counts by `TOKEN_SPREAD` (spread.ts);
 *   workloads priced per page, hour, request or row have no spread and report the same figure three times.
 * - Project range (`projectRange`): three whole-project cases.
 *     Pessimistic: P90 usage, P90 Dev Lab runs and the conservative benefit column.
 *     Expected: the project as entered, at the chosen percentile.
 *     Optimistic: P10 usage, typical Dev Lab runs and the optimistic benefit column.
 *   Adoption and realisation percentages the user typed in stay where they are; only the preset's own figures move.
 *   `low` and `high` are the smallest and largest of the three, so a figure never reads low > expected.
 */

export interface Range { low: number; expected: number; high: number }

/** Payback in months: `best` is the earliest of the cases, `worst` the latest. Null means not paid back within the plan. */
export interface PaybackRange { best: number | null; expected: number | null; worst: number | null }

export interface ProjectRange {
  totalCost: Range;
  /** Build labour, AI Dev Lab and dev environment. */
  build: Range;
  /** Steady-state production run plus maintenance, per year. */
  annualRun: Range;
  totalBenefit: Range;
  npv: Range;
  payback: PaybackRange;
  /** Null when the cash flows never change sign in any case. */
  irrPct: Range | null;
  cases: { pessimistic: RoiResult; expected: RoiResult; optimistic: RoiResult };
}

const spanOf = (xs: number[], expected: number): Range => ({ low: Math.min(...xs), expected, high: Math.max(...xs) });

interface CaseResult { ledger: Ledger; roi: RoiResult }

function runCase(p: Project, cat: Catalog, percentile: Percentile): CaseResult {
  const ledger = buildLedger(p, cat, percentile);
  return { ledger, roi: computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p)) };
}

export function projectRange(p: Project, cat: Catalog, opts: { percentile?: Percentile; expected?: CaseResult } = {}): ProjectRange {
  const expected = opts.expected ?? runCase(p, cat, opts.percentile ?? "p50");
  const pess = structuredClone(p);
  pess.roi.benefitPreset = "conservative";
  pess.settings.devLabPercentile = "p90";
  const opt = structuredClone(p);
  opt.roi.benefitPreset = "optimistic";
  opt.settings.devLabPercentile = "p50";
  const pessimistic = runCase(pess, cat, "p90");
  const optimistic = runCase(opt, cat, "p10");
  const all = [pessimistic, expected, optimistic];
  const annual = (c: CaseResult) => (c.ledger.totals.runRate + c.ledger.totals.maintRate) * 12;
  const paybacks = all.map((c) => c.roi.paybackMonth);
  const finite = paybacks.filter((x): x is number => x !== null);
  const irrs = all.map((c) => c.roi.irrPct).filter((x): x is number => x !== null);
  return {
    totalCost: spanOf(all.map((c) => c.roi.totalCost), expected.roi.totalCost),
    build: spanOf(all.map((c) => c.ledger.totals.build), expected.ledger.totals.build),
    annualRun: spanOf(all.map(annual), annual(expected)),
    totalBenefit: spanOf(all.map((c) => c.roi.totalBenefit), expected.roi.totalBenefit),
    npv: spanOf(all.map((c) => c.roi.npv), expected.roi.npv),
    payback: { best: finite.length ? Math.min(...finite) : null, expected: expected.roi.paybackMonth, worst: paybacks.some((x) => x === null) ? null : Math.max(...finite) },
    irrPct: irrs.length && expected.roi.irrPct !== null ? spanOf(irrs, expected.roi.irrPct) : null,
    cases: { pessimistic: pessimistic.roi, expected: expected.roi, optimistic: optimistic.roi },
  };
}

/**
 * Monthly production cost of one workload at full volume, at P10, the chosen percentile and P90.
 * `spread` is false when the workload has no percentile spread, so the three figures are equal.
 */
export function workloadRange(p: Project, cat: Catalog, w: Workload, percentile: Percentile = "p50"): Range & { spread: boolean } {
  const book = new PriceBook(cat, p.settings);
  const harnesses = new Map(p.harnesses.map((h) => [h.id, h]));
  const at = (pc: Percentile) => workloadLines(w, { book, date: p.startDate, harnesses, percentile: pc, language: p.settings.language, assumptions: resolveAssumptions(p), volumes: requestVolumes(p.workloads) })
    .filter((l) => (l.stream === "run" || l.stream === "platform") && !l.once)
    .reduce((s, l) => s + l.cost, 0);
  const expected = at(percentile), a = at("p10"), b = at("p90");
  const r = spanOf([a, expected, b], expected);
  return { ...r, spread: r.high - r.low > 1e-9 };
}
