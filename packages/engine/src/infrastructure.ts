import type { Ledger } from "./ledger.js";
import type { Project } from "./project.js";

/** What one resource costs in one environment in one month, read from the ledger lines the engine already priced. */
export interface ResourceEnvCost {
  /** Environment id; null when the project defines no environments (one implicit production environment). */
  envId: string | null;
  envLabel: string;
  production: boolean;
  /** Project month the figure is read at: the first month the resource is billed in this environment. 0 when never billed. */
  month: number;
  monthly: number;
  /** Formulas of the meter lines, one per line. */
  formulas: string[];
  /** Notes the engine added (fallback prices, reserved capacity under a schedule), without the formula part. */
  notes: string[];
}

export interface ResourceCostRow {
  resourceId: string;
  perEnv: ResourceEnvCost[];
  /** Sum of the per-environment monthly figures. */
  monthly: number;
  /** Distinct notes across environments, plus catalogue problems. */
  notes: string[];
}

export interface EnvironmentCostRow {
  envId: string | null;
  label: string;
  production: boolean;
  /** Cost a month in the first month the environment is billed. */
  monthly: number;
  /** Resource ids that bill in this environment. */
  resourceIds: string[];
}

export interface InfrastructureSummary {
  /** All resource and environment cost in the build months. */
  buildTotal: number;
  /** All resource and environment cost over the whole plan. */
  planTotal: number;
  /** Monthly cost of production environments while billed. */
  productionMonthly: number;
  /** Monthly cost of non-production environments while billed. */
  nonProductionMonthly: number;
  /** Cost a month in production, read at the steady-state month: production plus any non-production still billed then. */
  steadyMonthly: number;
}

const PREFIX = "resource:";
const noteOf = (formula: string): string | undefined => {
  const i = formula.indexOf("; ");
  return i < 0 ? undefined : formula.slice(i + 2);
};

/** Per-resource, per-environment monthly cost for the infrastructure page, from the ledger's resource lines. */
export function resourceCostRows(p: Project, ledger: Ledger): ResourceCostRow[] {
  const envs = p.environments ?? [];
  const cells = new Map<string, ResourceEnvCost>();
  for (const mo of ledger.months) {
    const seen = new Set<string>();
    for (const l of mo.lines) {
      if (!l.componentId.startsWith(PREFIX)) continue;
      const rid = l.componentId.slice(PREFIX.length);
      const envId = envs.length ? l.id.slice(l.id.lastIndexOf(":") + 1) : null;
      const key = `${rid}\u0000${envId ?? ""}`;
      const existing = cells.get(key);
      if (existing && !seen.has(key)) continue; // a later month of an environment already read
      seen.add(key);
      const env = envs.find((e) => e.id === envId);
      const cell = existing ?? { envId, envLabel: env?.label ?? "Production", production: env ? env.production : true, month: mo.m, monthly: 0, formulas: [], notes: [] };
      cell.monthly += l.cost;
      cell.formulas.push(l.formula);
      const n = noteOf(l.formula);
      if (n && !cell.notes.includes(n)) cell.notes.push(n);
      cells.set(key, cell);
    }
  }
  return (p.resources ?? []).map((r) => {
    const perEnv: ResourceEnvCost[] = [];
    const wanted = envs.length ? envs.filter((e) => !r.envIds || r.envIds.includes(e.id)) : [null];
    for (const e of wanted) {
      const c = cells.get(`${r.id}\u0000${e?.id ?? ""}`);
      perEnv.push(c ?? { envId: e?.id ?? null, envLabel: e?.label ?? "Production", production: e ? e.production : true, month: 0, monthly: 0, formulas: [], notes: [] });
    }
    const notes = [...new Set(perEnv.flatMap((c) => c.notes))];
    const problem = ledger.notes.find((n) => n.kind === "resource" && n.message.includes("is not in the catalogue") && n.message.startsWith(`${r.label}:`));
    if (problem) notes.push(problem.message.slice(r.label.length + 2));
    return { resourceId: r.id, perEnv, monthly: perEnv.reduce((s, c) => s + c.monthly, 0), notes };
  });
}

/** Monthly cost of each defined environment (or the implicit production one), summed over the resources that exist in it. */
export function environmentCostRows(p: Project, ledger: Ledger): EnvironmentCostRow[] {
  const rows = resourceCostRows(p, ledger);
  const envs = p.environments ?? [];
  const list = envs.length ? envs.map((e) => ({ id: e.id as string | null, label: e.label, production: e.production })) : [{ id: null as string | null, label: "Production", production: true }];
  return list.map((e) => {
    const cells = rows.flatMap((r) => r.perEnv.filter((c) => c.envId === e.id).map((c) => ({ rid: r.resourceId, c })));
    return { envId: e.id, label: e.label, production: e.production, monthly: cells.reduce((s, x) => s + x.c.monthly, 0), resourceIds: cells.filter((x) => x.c.monthly > 0).map((x) => x.rid) };
  });
}

/** Totals for the strip at the top of the page. All figures come from the resource lines; nothing is priced again. */
export function infrastructureSummary(p: Project, ledger: Ledger): InfrastructureSummary {
  const B = p.timeline.buildMonths;
  const monthTotal = (m: Ledger["months"][number]) => m.lines.filter((l) => l.componentId.startsWith(PREFIX)).reduce((s, l) => s + l.cost, 0);
  const env = environmentCostRows(p, ledger);
  const steady = ledger.months[ledger.steadyMonth - 1];
  return {
    buildTotal: ledger.months.slice(0, B).reduce((s, m) => s + monthTotal(m), 0),
    planTotal: ledger.months.reduce((s, m) => s + monthTotal(m), 0),
    productionMonthly: env.filter((e) => e.production).reduce((s, e) => s + e.monthly, 0),
    nonProductionMonthly: env.filter((e) => !e.production).reduce((s, e) => s + e.monthly, 0),
    steadyMonthly: steady ? monthTotal(steady) : 0,
  };
}
