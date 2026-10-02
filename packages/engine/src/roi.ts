import type { Ledger, Month } from "./ledger.js";
import type { Project } from "./project.js";

export type CostBasis = Project["roi"]["basis"];

export interface RoiResult {
  basis: CostBasis;
  monthlyCost: number[];
  monthlyBenefit: number[];
  cumulative: number[];
  /** First month where cumulative net ≥ 0, or null within the horizon. */
  paybackMonth: number | null;
  totalCost: number;
  totalBenefit: number;
  roi: number;
  byYear: { year: number; cost: number; benefit: number; net: number }[];
}

/** Cost counted for a month under a basis. */
export function basisCost(mo: Month, basis: CostBasis): number {
  const s = mo.byStream;
  const run = s.run + s.platform;
  if (basis === "run") return run;
  if (basis === "runMaint") return run + s.maint;
  return run + s.maint + s.labour + s.devlab + s.devenv;
}

export function computeRoi(ledger: Ledger, basis: CostBasis): RoiResult {
  const monthlyCost = ledger.months.map((mo) => basisCost(mo, basis));
  const monthlyBenefit = ledger.months.map((mo) => mo.benefit);
  let c = 0;
  const cumulative = monthlyCost.map((x, i) => (c += monthlyBenefit[i]! - x));
  // Payback: start of the final non-negative run of the cumulative curve, counted from the first month with cost.
  const firstCost = monthlyCost.findIndex((x) => x > 0);
  let payback: number | null = null;
  if (firstCost >= 0) {
    for (let i = cumulative.length - 1; i >= firstCost && cumulative[i]! >= 0; i--) payback = i + 1;
  }
  const totalCost = monthlyCost.reduce((a, b) => a + b, 0);
  const totalBenefit = monthlyBenefit.reduce((a, b) => a + b, 0);
  const byYear = [];
  for (let y = 0; y * 12 < monthlyCost.length; y++) {
    const cost = monthlyCost.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b, 0);
    const benefit = monthlyBenefit.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b, 0);
    byYear.push({ year: y + 1, cost, benefit, net: benefit - cost });
  }
  return {
    basis, monthlyCost, monthlyBenefit, cumulative,
    paybackMonth: totalBenefit > 0 ? payback : null,
    totalCost, totalBenefit, roi: totalCost > 0 ? (totalBenefit - totalCost) / totalCost : 0, byYear,
  };
}
