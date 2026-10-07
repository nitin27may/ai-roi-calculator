import type { Ledger, Month } from "./ledger.js";
import type { Project } from "./project.js";

export type CostBasis = Project["roi"]["basis"];

/**
 * The three cost bases ROI, payback and NPV can be measured against. One list so the ROI page, Settings, Summary,
 * Report and Excel use the same words. `label` names the basis; `short` fits in a tile caption; `hint` is the one-line explanation.
 */
export const COST_BASES: readonly { value: CostBasis; label: string; short: string; hint: string }[] = [
  { value: "run", label: "Running cost only", short: "running cost only", hint: "Production AI usage, production infrastructure and platform. Non-production environments are not included. Use this for an app that already exists." },
  { value: "runMaint", label: "Running + maintenance", short: "running + maintenance", hint: "Adds the support team, transition costs and non-production environments, but not the build." },
  { value: "full", label: "Full lifecycle", short: "full lifecycle", hint: "Build labour, AI Dev Lab, dev environment, delivery costs (vendor, training and similar), non-production environments, running, maintenance and transition: everything the project costs." },
];

/** Display name of a cost basis, e.g. "Full lifecycle". */
export const basisLabel = (b: CostBasis): string => COST_BASES.find((x) => x.value === b)!.label;

export interface RoiOptions {
  /** Years of the last 12 months' net cash flow added at the end of the horizon. 0 or absent: none. */
  terminalValueYears?: number;
  /** Share of build cost treated as capital spend, in percent (accounting view only). */
  capexPct?: number;
  /** Months the capitalised build cost is written off over, from go-live. Default 36. */
  amortiseMonths?: number;
  hurdleRatePct?: number;
}

export interface Accounting {
  /** Build cost treated as capital spend. */
  capex: number;
  /** Everything else in the cost basis, expensed as it is spent. */
  opex: number;
  /** Monthly write-off of the capex, from go-live. */
  amortisation: number[];
  amortisedInHorizon: number;
  /** Capex not yet written off at the end of the horizon. */
  unamortised: number;
  /** Cost as the accounts see it: opex plus the amortisation inside the horizon (cash is unchanged). */
  bookCost: number;
}

export interface RoiResult {
  basis: CostBasis;
  monthlyCost: number[];
  monthlyBenefit: number[];
  cumulative: number[];
  /** First month from which cumulative net stays >= 0, or null within the horizon. */
  paybackMonth: number | null;
  /** Same, with each month's net discounted at the annual discount rate. Null when never reached, or when the rate is 0 and it equals `paybackMonth`. */
  discountedPaybackMonth: number | null;
  totalCost: number;
  totalBenefit: number;
  roi: number;
  /** Net present value at the annual discount rate (0% = undiscounted net), including any terminal value. */
  npv: number;
  discountRatePct: number;
  /** Internal rate of return as an annual percentage, or null when the cash flows never change sign. */
  irrPct: number | null;
  hurdleRatePct: number | null;
  /** True when IRR is at or above the hurdle rate; null when either is missing. */
  clearsHurdle: boolean | null;
  /** Terminal value added to the last month (0 when not set). Already inside `npv` and `irrPct`. */
  terminalValue: number;
  accounting: Accounting | null;
  byYear: { year: number; cost: number; benefit: number; net: number }[];
}

/** Cost counted for a month under a basis. Transition costs count once maintenance does. */
export function basisCost(mo: Month, basis: CostBasis): number {
  const s = mo.byStream;
  const run = s.run + s.platform;
  if (basis === "run") return run;
  // Non-production environments (stream env) count from "Running + maintenance" up; "Running cost only" is production and platform.
  if (basis === "runMaint") return run + s.maint + s.transition + (s.env ?? 0);
  return run + s.maint + s.transition + s.labour + s.devlab + s.devenv + (s.env ?? 0) + (s.delivery ?? 0);
}

/**
 * Rate per period at which the cash flows' present value is zero, found by bisection (flows[0] is period 0).
 * Null when the flows have no sign change. With several sign changes it returns the root nearest zero that bisection finds.
 * `irr([-100, 60, 60])` is about 0.1307.
 */
export function irr(flows: number[]): number | null {
  if (!flows.some((x) => x > 0) || !flows.some((x) => x < 0)) return null;
  const pv = (r: number) => flows.reduce((s, x, i) => s + x / (1 + r) ** i, 0);
  let lo = -0.9999, hi = 1;
  while (pv(hi) > 0 && hi < 1e6) hi *= 2;
  if (pv(lo) * pv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(lo) * pv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Start of the final non-negative run of a cumulative curve, counted from the first month with cost (1-based). */
function paybackOf(cumulative: number[], firstCost: number): number | null {
  let payback: number | null = null;
  if (firstCost >= 0) for (let i = cumulative.length - 1; i >= firstCost && cumulative[i]! >= 0; i--) payback = i + 1;
  return payback;
}

export function computeRoi(ledger: Ledger, basis: CostBasis, discountRatePct = 0, opts: RoiOptions = {}): RoiResult {
  const monthlyCost = ledger.months.map((mo) => basisCost(mo, basis));
  const monthlyBenefit = ledger.months.map((mo) => mo.benefit);
  let c = 0;
  const cumulative = monthlyCost.map((x, i) => (c += monthlyBenefit[i]! - x));
  const firstCost = monthlyCost.findIndex((x) => x > 0);
  const totalCost = monthlyCost.reduce((a, b) => a + b, 0);
  const totalBenefit = monthlyBenefit.reduce((a, b) => a + b, 0);
  const r = (1 + discountRatePct / 100) ** (1 / 12) - 1;
  const net = monthlyCost.map((x, i) => monthlyBenefit[i]! - x);
  const n = net.length;
  const last12 = net.slice(Math.max(0, n - 12)).reduce((a, b) => a + b, 0);
  const terminalValue = (opts.terminalValueYears ?? 0) > 0 ? Math.max(0, last12) * opts.terminalValueYears! : 0;
  const npv = net.reduce((s, x, i) => s + x / (1 + r) ** (i + 1), 0) + terminalValue / (1 + r) ** n;
  let d = 0;
  const discountedCum = net.map((x, i) => (d += x / (1 + r) ** (i + 1)));
  const discountedPayback = totalBenefit > 0 ? paybackOf(discountedCum, firstCost) : null;
  const flows = [0, ...net];
  if (n > 0) flows[n] = flows[n]! + terminalValue;
  const monthly = irr(flows);
  const irrPct = monthly === null ? null : ((1 + monthly) ** 12 - 1) * 100;
  const hurdle = opts.hurdleRatePct ?? null;
  const byYear = [];
  for (let y = 0; y * 12 < monthlyCost.length; y++) {
    const cost = monthlyCost.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b, 0);
    const benefit = monthlyBenefit.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b, 0);
    byYear.push({ year: y + 1, cost, benefit, net: benefit - cost });
  }
  return {
    basis, monthlyCost, monthlyBenefit, cumulative,
    paybackMonth: totalBenefit > 0 ? paybackOf(cumulative, firstCost) : null,
    discountedPaybackMonth: discountedPayback,
    totalCost, totalBenefit, roi: totalCost > 0 ? (totalBenefit - totalCost) / totalCost : 0,
    npv, discountRatePct, irrPct, hurdleRatePct: hurdle,
    clearsHurdle: irrPct === null || hurdle === null ? null : irrPct >= hurdle,
    terminalValue, accounting: accountingView(ledger, basis, monthlyCost, opts),
    byYear,
  };
}

/** Capex/opex split with straight-line amortisation from go-live. Accounting only: cash flows, NPV and IRR do not change. */
function accountingView(ledger: Ledger, basis: CostBasis, monthlyCost: number[], opts: RoiOptions): Accounting | null {
  const pct = opts.capexPct ?? 0;
  if (pct <= 0 || basis !== "full") return null;
  const buildMonths = ledger.months.filter((m) => m.phase === "build").length;
  const capex = ledger.totals.build * (pct / 100);
  const life = opts.amortiseMonths ?? 36;
  const amortisation = ledger.months.map((_, i) => (i >= buildMonths && i < buildMonths + life ? capex / life : 0));
  const amortisedInHorizon = amortisation.reduce((a, b) => a + b, 0);
  const totalCost = monthlyCost.reduce((a, b) => a + b, 0);
  const opex = totalCost - capex;
  return { capex, opex, amortisation, amortisedInHorizon, unamortised: capex - amortisedInHorizon, bookCost: opex + amortisedInHorizon };
}

/** Options for `computeRoi` taken from a project's ROI settings. */
export const roiOptions = (p: Project): RoiOptions => ({
  ...(p.roi.terminalValueYears !== undefined ? { terminalValueYears: p.roi.terminalValueYears } : {}),
  ...(p.roi.capexPct !== undefined ? { capexPct: p.roi.capexPct } : {}),
  ...(p.roi.amortiseMonths !== undefined ? { amortiseMonths: p.roi.amortiseMonths } : {}),
  ...(p.roi.hurdleRatePct !== undefined ? { hurdleRatePct: p.roi.hurdleRatePct } : {}),
});
