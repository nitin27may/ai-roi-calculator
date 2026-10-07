import type { Ledger } from "./ledger.js";
import type { Project } from "./project.js";
import { seatEffort } from "./devlab.js";
import { sum } from "./lines.js";

const PROJECT_WIDE = "";

export interface WorkstreamRow {
  /** Empty string for project-wide cost. */
  id: string;
  label: string;
  labour: number;
  devlab: number;
  total: number;
  /** Build months. */
  byMonth: number[];
  /** Average people allocated over the build. */
  people: number;
}

/** Build labour and AI Dev Lab cost per workstream, plus a project-wide row (dev environment included). */
export function workstreamBreakdown(p: Project, ledger: Ledger): WorkstreamRow[] {
  const B = p.timeline.buildMonths;
  const rows = new Map<string, WorkstreamRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, label: id === PROJECT_WIDE ? "Project-wide" : (p.build.workstreams.find((w) => w.id === id)?.label ?? id), labour: 0, devlab: 0, total: 0, byMonth: Array(B).fill(0), people: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const w of p.build.workstreams) row(w.id);
  for (const mo of ledger.months.slice(0, B)) {
    for (const l of mo.lines) {
      if (l.stream !== "labour" && l.stream !== "devlab" && l.stream !== "devenv") continue;
      const r = row(l.workstreamId ?? PROJECT_WIDE);
      if (l.stream === "labour") r.labour += l.cost; else r.devlab += l.cost;
      r.total += l.cost;
      r.byMonth[mo.m - 1]! += l.cost;
    }
    for (const e of seatEffort(p, mo.m, false)) {
      for (const [ws, n] of Object.entries(e.byWorkstream)) row(ws).people += n / B;
      row(PROJECT_WIDE).people += e.projectWide / B;
    }
  }
  return [...rows.values()].sort((a, b) => (a.id === PROJECT_WIDE ? 1 : b.id === PROJECT_WIDE ? -1 : b.total - a.total));
}

export interface DeveloperRow {
  seat: number;
  label: string;
  people: number;
  labour: number;
  /** AI Dev Lab spend attributed to this line (by its effort on each workstream). */
  devlab: number;
  devlabByMonth: number[];
  /** Dev Lab spend per person per month. */
  perPersonByMonth: number[];
  /** Build months (1-based) above the per-person budget. */
  overBudget: number[];
}

/**
 * Build cost per team line (named seat or role count). Workstream Dev Lab lines are shared by the
 * people on that workstream in proportion to their effort; project-wide ones by everyone who runs
 * experiments that month. Dev Lab cost with nobody to carry it is returned as `unattributed`.
 */
export function developerBreakdown(p: Project, ledger: Ledger): { rows: DeveloperRow[]; unattributed: number } {
  const B = p.timeline.buildMonths;
  const rates = new Map(p.rateCard.map((r) => [r.id, r.label]));
  const rows: DeveloperRow[] = p.build.team.map((t, seat) => ({
    seat, label: t.name ? `${t.name} (${rates.get(t.roleId) ?? t.roleId})` : `${t.people} × ${rates.get(t.roleId) ?? t.roleId}${t.phase ? `, ${t.phase}` : ""}`,
    people: t.people, labour: 0, devlab: 0, devlabByMonth: Array(B).fill(0), perPersonByMonth: Array(B).fill(0), overBudget: [],
  }));
  let unattributed = 0;
  // Hypercare labour after go-live belongs to its team line too.
  for (const mo of ledger.months.slice(B)) for (const l of mo.lines) if (l.stream === "labour" && l.seat !== undefined) rows[l.seat]!.labour += l.cost;
  for (const mo of ledger.months.slice(0, B)) {
    const eff = seatEffort(p, mo.m);
    for (const l of mo.lines) {
      if (l.stream === "labour" && l.seat !== undefined) { rows[l.seat]!.labour += l.cost; continue; }
      if (l.stream !== "devlab") continue;
      const weights = eff.map((e) => (l.workstreamId ? e.byWorkstream[l.workstreamId] ?? 0 : e.people));
      const total = sum(weights);
      if (total <= 0) { unattributed += l.cost; continue; }
      weights.forEach((w, i) => { if (w > 0) { rows[i]!.devlab += (l.cost * w) / total; rows[i]!.devlabByMonth[mo.m - 1]! += (l.cost * w) / total; } });
    }
  }
  const budget = p.build.devBudgetPerMonth;
  for (const r of rows) {
    r.perPersonByMonth = r.devlabByMonth.map((c) => (r.people > 0 ? c / r.people : 0));
    if (budget !== undefined && budget > 0) r.overBudget = r.perPersonByMonth.flatMap((c, i) => (c > budget + 1e-9 ? [i + 1] : []));
  }
  return { rows, unattributed };
}

/** AI Dev Lab spend over the build by price meter (model or service), largest first. */
export function devLabByMeter(ledger: Ledger, buildMonths: number): { meter: string; cost: number }[] {
  const by = new Map<string, number>();
  for (const mo of ledger.months.slice(0, buildMonths)) for (const l of mo.lines) if (l.stream === "devlab") by.set(l.meter, (by.get(l.meter) ?? 0) + l.cost);
  return [...by.entries()].map(([meter, cost]) => ({ meter, cost })).sort((a, b) => b.cost - a.cost);
}
