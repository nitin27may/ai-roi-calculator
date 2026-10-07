import type { Project } from "./project.js";

/** The hourly rate a build or maintenance team line is costed at: its manual rate when set, else the role's rate-card rate. */
export const lineRate = (p: Pick<Project, "rateCard">, t: { roleId: string; rateOverride?: number }): number =>
  t.rateOverride ?? p.rateCard.find((r) => r.id === t.roleId)?.hourlyRate ?? 0;

/** How many places use a role: build team lines, maintenance team lines, time-saved capabilities and avoided costs. A role in use cannot be removed. */
export function roleUsage(p: Project, roleId: string): number {
  const maint = p.maintenance.mode === "team" ? p.maintenance.team.filter((t) => t.roleId === roleId).length : 0;
  return p.build.team.filter((t) => t.roleId === roleId).length + maint
    + p.benefits.capabilities.filter((c) => c.roleId === roleId).length
    + p.benefits.avoidedCosts.filter((a) => a.roleId === roleId).length
    + (p.currentState?.lines ?? []).filter((c) => c.basis.kind === "fte" && c.basis.roleId === roleId).length;
}

/** A role id for a new label that does not clash with an existing one ("Data engineer" -> "dataEngineer", then "dataEngineer2"). */
export function newRoleId(p: Pick<Project, "rateCard">, label: string): string {
  const words = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const base = words.length ? words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join("") : "role";
  const taken = new Set(p.rateCard.map((r) => r.id));
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}${k}`;
  return id;
}

/** Adds a role to the rate card and returns its id. Mutates `p` (use inside a store edit). */
export function addRole(p: Project, label: string, hourlyRate: number): string {
  const id = newRoleId(p, label);
  p.rateCard.push({ id, label, hourlyRate });
  return id;
}

/** Removes an unused role. Returns false (and changes nothing) when something still uses it or it is the last role. */
export function removeRole(p: Project, roleId: string): boolean {
  if (roleUsage(p, roleId) > 0 || p.rateCard.length <= 1) return false;
  p.rateCard = p.rateCard.filter((r) => r.id !== roleId);
  return true;
}

/** Plain-words note on what the yearly rate rise touches, with a worked year-2 and year-3 figure for an example rate. */
export function rateEscalationNote(pct: number, exampleRate: number): string {
  if (pct <= 0) return "Rate escalation is 0%, so rates stay flat for the whole plan.";
  const y = (n: number) => Math.round(exampleRate * (1 + pct / 100) ** n * 100) / 100;
  return `Rate escalation is ${pct}% a year from the second production year. It raises maintenance labour and the value of hours saved (a C$${exampleRate} rate becomes C$${y(1)} in production year 2 and C$${y(2)} in year 3). It does not change build labour.`;
}
