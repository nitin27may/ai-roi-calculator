import { PROJECT_TYPE_INFO, projectTypes, scoreItems, scoreRows, currentLines, currentVsTarget, type ComparedProject, type Ledger, type Project, type RoiResult } from "@roi-calculator/engine";
import { PORTFOLIO_FILTER_KEYS, type PortfolioKey } from "./prefs";

/** Group and filter keys: the six types plus a bucket for projects with no type chosen. */
export type { PortfolioKey };
export const PORTFOLIO_KEYS: readonly PortfolioKey[] = PORTFOLIO_FILTER_KEYS;
export const portfolioLabel = (k: PortfolioKey): string => (k === "notSet" ? "Not set" : PROJECT_TYPE_INFO[k].label);

/** The keys a project falls under: its types (A1 `projectTypes`), or "notSet" when no feature has one. */
export function portfolioKeys(p: Pick<Project, "features">): PortfolioKey[] {
  const t = projectTypes(p);
  return t.length > 0 ? t : ["notSet"];
}

/** With no chips on every project shows; otherwise a project shows when any of its keys is on. */
export function filterProjects<T extends { project: Pick<Project, "features"> }>(entries: T[], filter: readonly PortfolioKey[]): T[] {
  if (filter.length === 0) return entries;
  return entries.filter((e) => portfolioKeys(e.project).some((k) => filter.includes(k)));
}

export interface PortfolioGroup<T> { key: PortfolioKey; label: string; entries: T[] }

/**
 * Groups by type in display order. A project with several types appears in each of its groups. When chips are on,
 * only the groups they name are shown. Empty groups are left out.
 */
export function groupProjects<T extends { project: Pick<Project, "features"> }>(entries: T[], filter: readonly PortfolioKey[]): PortfolioGroup<T>[] {
  return PORTFOLIO_KEYS.filter((k) => filter.length === 0 || filter.includes(k))
    .map((key) => ({ key, label: portfolioLabel(key), entries: entries.filter((e) => portfolioKeys(e.project).includes(key)) }))
    .filter((g) => g.entries.length > 0);
}

export interface PortfolioTotals { count: number; build: number; runPerMonth: number; npv: number; payingBack: number }

/** Sums of the compare figures the cards already show. A project appears once per call, so pass distinct projects for overall totals. */
export function portfolioTotals(figures: Pick<ComparedProject, "build" | "runPerMonth" | "npv" | "paybackMonth">[]): PortfolioTotals {
  return figures.reduce<PortfolioTotals>((t, f) => ({ count: t.count + 1, build: t.build + f.build, runPerMonth: t.runPerMonth + f.runPerMonth, npv: t.npv + f.npv, payingBack: t.payingBack + (f.paybackMonth !== null ? 1 : 0) }), { count: 0, build: 0, runPerMonth: 0, npv: 0, payingBack: 0 });
}

/** Figures beyond the six core compare rows. Each is null when the project has no data for it. */
export interface ExtraFigures {
  discountedPaybackMonth: number | null;
  scorecardComposite: number | null;
  monetisedMonthly: number | null;
  /** Saving per month against today's current state, at full adoption. Null with no current-state lines. */
  savingPerMonth: number | null;
}

export function extraFigures(p: Project, ledger: Ledger, roi: RoiResult): ExtraFigures {
  const hasScore = scoreItems(p).length > 0;
  const score = hasScore ? scoreRows(p) : null;
  return {
    discountedPaybackMonth: roi.discountedPaybackMonth,
    scorecardComposite: score?.composite ?? null,
    monetisedMonthly: score ? score.monetisedMonthly : null,
    savingPerMonth: currentLines(p).length > 0 ? currentVsTarget(p, ledger).saving : null,
  };
}
