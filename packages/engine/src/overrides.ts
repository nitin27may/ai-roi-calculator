import type { DevActivity, Project } from "./project.js";

/** The CAD typed for an activity in a build month, or undefined when the cell uses the calculation. */
export const monthOverride = (a: DevActivity, m: number): number | undefined => a.monthlyOverrideCad?.[String(m)];

/** Set (a number) or clear (undefined) one cell. Clearing the last cell removes the map, so a project with no typed cells is saved exactly as before. */
export function setMonthOverride(a: DevActivity, m: number, cad: number | undefined): void {
  if (cad === undefined) {
    if (!a.monthlyOverrideCad) return;
    delete a.monthlyOverrideCad[String(m)];
    if (Object.keys(a.monthlyOverrideCad).length === 0) delete a.monthlyOverrideCad;
    return;
  }
  a.monthlyOverrideCad = { ...a.monthlyOverrideCad, [String(m)]: cad };
}

/** Clear every typed cell on one activity. */
export function clearActivityOverrides(a: DevActivity): void {
  delete a.monthlyOverrideCad;
}

/** Typed cells inside the build window. Cells beyond it (after shortening the build) are ignored by the ledger and not counted. */
export function overriddenCells(p: Project): { activityId: string; month: number; cad: number }[] {
  const B = p.timeline.buildMonths;
  return p.build.activities.flatMap((a) =>
    Object.entries(a.monthlyOverrideCad ?? {}).flatMap(([k, cad]) => (Number(k) <= B ? [{ activityId: a.id, month: Number(k), cad }] : [])),
  );
}

/** Clear every typed cell on every activity. Returns how many in-window cells were cleared. */
export function clearAllOverrides(p: Project): number {
  const n = overriddenCells(p).length;
  for (const a of p.build.activities) clearActivityOverrides(a);
  return n;
}

/** True when a fixed monthly Dev Lab allowance is set; it then replaces the calculation and typed cells. */
export const allowanceActive = (p: Project): boolean => (p.build.devLabMonthlyCad ?? 0) > 0;
