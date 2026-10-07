import { workloadVolume, confidenceWeight } from "./benefits.js";
import type { CurrentLine, Project } from "./project.js";

/**
 * Current state: what the work costs today, line by line, and how much of it goes away.
 *
 * Plan months count from the first build month (month 1). Nothing is saved during build: a line's change can start
 * no earlier than go-live (build months + 1). Dual running needs no field. The target's run costs start in their own
 * months and a current cost falls only from its change month, so the overlap appears in the ledger by itself.
 *
 * Double-counting risk: a current-state line and an avoided cost (or a time-saved capability) can describe the same
 * thing, for example a retired licence. Enter it once.
 */
export const currentLines = (p: Pick<Project, "currentState">): CurrentLine[] => p.currentState?.lines ?? [];

/** Pay-rate escalation applied to people lines in plan month `m`: the rate rises each production year, like avoided headcount. */
export const currentEscalation = (p: Project, m: number): number => {
  const B = p.timeline.buildMonths;
  return m > B ? (1 + p.roi.rateEscalationPctPerYear / 100) ** Math.floor((m - B - 1) / 12) : 1;
};

/** Monthly volume of a per-transaction line: the linked workload's items, else the figure entered. */
export function currentVolume(p: Project, line: CurrentLine): number {
  const b = line.basis;
  if (b.kind !== "perTransaction") return 0;
  const w = b.volumeFrom ? p.workloads.find((x) => x.id === b.volumeFrom) : undefined;
  return (w ? workloadVolume(w).items : undefined) ?? b.volumePerMonth ?? 0;
}

/**
 * What the line costs each month today, before any change, at today's pay rates:
 * monthly = the amount; fte = FTE x hours x the role's hourly rate; perTransaction = unit cost x monthly volume.
 */
export function currentLineMonthly(p: Project, line: CurrentLine): number {
  const b = line.basis;
  if (b.kind === "monthly") return b.amountCad;
  if (b.kind === "fte") return b.fte * b.hoursPerMonth * (p.rateCard.find((r) => r.id === b.roleId)?.hourlyRate ?? 0);
  return b.unitCostCad * currentVolume(p, line);
}

/** A conditional decommission that is not assumed to happen: the line stays and saves nothing. */
export const blockedByCondition = (line: CurrentLine): boolean => line.decommission?.conditional === true && !line.decommission.assumed;

/** The plan month a line's change starts: its own `fromMonth`, but never before go-live. */
export const changeStartMonth = (p: Project, line: CurrentLine): number =>
  Math.max(p.timeline.buildMonths + 1, line.change.mode === "keep" ? 0 : (line.change.fromMonth ?? 0));

/**
 * The part of a line the change removes in plan month `m`, before confidence, as `{ intended, realised }`.
 * - intended: what the change removes once it has fully taken effect (retire: all of it, reduce: pct of it, keep: 0).
 *   A line blocked by an unassumed conditional decommission has intended 0: it is a cost that stays.
 * - realised: the part removed in month m. Zero before the change month; then intended in full, except a reduce that
 *   follows adoption, which ramps with the project's adoption ramp counted from the change month.
 * People lines escalate with pay rates; monthly and per-transaction lines stay flat. During build both are 0.
 */
export function currentLineEffect(p: Project, line: CurrentLine, m: number): { intended: number; realised: number } {
  const B = p.timeline.buildMonths;
  if (m <= B || line.change.mode === "keep" || blockedByCondition(line)) return { intended: 0, realised: 0 };
  const share = line.change.mode === "retire" ? 1 : line.change.pct / 100;
  const intended = currentLineMonthly(p, line) * (line.basis.kind === "fte" ? currentEscalation(p, m) : 1) * share;
  const start = changeStartMonth(p, line);
  if (m < start) return { intended, realised: 0 };
  const r = p.timeline.adoptionRampMonths;
  const ramp = line.change.mode === "reduce" && line.change.followsAdoption ? (r === 0 ? 1 : Math.min(1, (m - start + 1) / r)) : 1;
  return { intended, realised: intended * ramp };
}

/** The saving a line adds to plan month `m`: realised, weighted by confidence. This is what goes into `MonthBenefit.currentState`. */
export const currentLineSaving = (p: Project, line: CurrentLine, m: number): number => currentLineEffect(p, line, m).realised * confidenceWeight(line.confidencePct);

/** One line's saving per month once its change is in full effect and adoption is full, at today's pay rates, weighted by confidence. */
export const currentLineFullSaving = (p: Project, l: CurrentLine): number =>
  blockedByCondition(l) || l.change.mode === "keep" ? 0 : currentLineMonthly(p, l) * (l.change.mode === "retire" ? 1 : l.change.pct / 100) * confidenceWeight(l.confidencePct);

/** Total saving per month once every change has taken effect and adoption is full: the sum of `currentLineFullSaving`. */
export const currentFullSaving = (p: Project): number => currentLines(p).reduce((s, l) => s + currentLineFullSaving(p, l), 0);

export interface CurrentVsTarget {
  /**
   * Sum of the current-state lines' monthly cost at go-live, before any change (month 0 of production), at today's pay
   * rates and not weighted by confidence. 0 when there are no lines.
   */
  currentMonthly: number;
  /** Steady-state run rate of the target: production usage and platform plus maintenance per month (the ledger's `runRate + maintRate`). */
  targetMonthly: number;
  /**
   * Monthly saving once every change has taken effect and adoption is full, weighted by each line's confidence.
   * Lines blocked by an unassumed conditional decommission add nothing.
   */
  saving: number;
  /**
   * Cost of running both. Over each production month in which the target's run or platform cost is billed, the part of
   * each line that is due to go away (its intended change) but has not yet gone. A retire counts its whole cost until
   * its month; a reduce counts the reduced share until its month, and the unramped share while it follows adoption.
   * Lines blocked by an unassumed conditional decommission are not counted: they never go away.
   * Not weighted by confidence. 0 when there are no lines.
   */
  dualRunningCost: number;
}

/** Current against target, from the project and its ledger (see the field comments for the exact definitions). */
export function currentVsTarget(p: Project, ledger: { months: { m: number; byStream: { run: number; platform: number } }[]; totals: { runRate: number; maintRate: number } }): CurrentVsTarget {
  const lines = currentLines(p);
  let dual = 0;
  if (lines.length) {
    for (const mo of ledger.months) {
      if (mo.byStream.run + mo.byStream.platform <= 0) continue;
      for (const l of lines) { const e = currentLineEffect(p, l, mo.m); dual += e.intended - e.realised; }
    }
  }
  return {
    currentMonthly: lines.reduce((s, l) => s + currentLineMonthly(p, l), 0),
    targetMonthly: ledger.totals.runRate + ledger.totals.maintRate,
    saving: currentFullSaving(p),
    dualRunningCost: dual,
  };
}

export const CURRENT_CATEGORY_LABEL: Record<CurrentLine["category"], string> = {
  people: "People", licence: "Licence", infrastructure: "Infrastructure", transaction: "Per-transaction cost", contract: "Contract", other: "Other",
};

/** The basis in words, e.g. "10,000 x C$0.40" or "2 FTE x 150 h x Reconciliation clerk". */
export function describeBasis(p: Project, line: CurrentLine): string {
  const b = line.basis;
  const n = (x: number) => x.toLocaleString("en-CA", { maximumFractionDigits: 2 });
  if (b.kind === "monthly") return `C$${n(b.amountCad)} a month`;
  if (b.kind === "fte") return `${n(b.fte)} FTE x ${n(b.hoursPerMonth)} h x ${p.rateCard.find((r) => r.id === b.roleId)?.label ?? b.roleId}`;
  return `${n(currentVolume(p, line))} x C$${n(b.unitCostCad)} per transaction`;
}

/** The change in words, e.g. "Reduce 90% with adoption, from month 7" or "Retire from month 18, if decommissioned". */
export function describeChange(p: Project, line: CurrentLine): string {
  const c = line.change;
  if (c.mode === "keep") return "Keep";
  const from = `from month ${changeStartMonth(p, line)}`;
  const cond = line.decommission?.conditional ? (line.decommission.assumed ? `, assumes: ${line.decommission.condition}` : ", not assumed: it stays") : "";
  return c.mode === "retire" ? `Retire ${from}${cond}` : `Reduce ${c.pct}%${c.followsAdoption ? " with adoption" : ""}, ${from}${cond}`;
}

/** One row per current-state line for the Excel export and the Report: cost today, the change, and the saving once it is in full effect. Empty without lines. */
export function currentStateRows(p: Project): Record<string, string | number>[] {
  return currentLines(p).map((l) => ({
    Item: l.label,
    Category: CURRENT_CATEGORY_LABEL[l.category],
    Basis: describeBasis(p, l),
    "Cost per month today (CAD)": Math.round(currentLineMonthly(p, l) * 100) / 100,
    Change: describeChange(p, l),
    "Saving per month, change in full effect (CAD)": Math.round(currentLineFullSaving(p, l) * 100) / 100,
  }));
}
