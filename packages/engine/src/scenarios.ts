import type { Catalog } from "@roi-calculator/catalog";
import { ProjectSchema, type Project, type Scenario, type ScenarioEdit } from "./project.js";
import { LEVERS } from "./levers.js";
import { buildLedger, type Ledger } from "./ledger.js";
import { computeRoi, roiOptions, type RoiResult } from "./roi.js";

/** Volume fields scaled by a `scaleUsage` edit. */
const VOLUME_KEYS = ["hoursPerMonth", "pagesPerMonth", "emailsPerMonth", "tokensPerMonth", "queriesPerMonth", "users", "tasksPerMonth", "interactionsPerMonth", "requestsPerMonth", "callsPerMonth", "chunks", "rowsPerMonth", "rows"];

/** Set a value at a path; array segments match an element's `id` (or a numeric index). */
export function setPath(target: unknown, path: (string | number)[], value: unknown): void {
  let o = target as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!;
    const next = Array.isArray(o) ? (typeof seg === "number" ? o[seg] : o.find((x: { id?: string }) => x?.id === seg)) : o[seg];
    if (next === undefined || next === null || typeof next !== "object") throw new Error(`Scenario path not found: ${path.slice(0, i + 1).join(".")}`);
    o = next as Record<string | number, unknown>;
  }
  const last = path.at(-1)!;
  if (Array.isArray(o) && typeof last === "string") throw new Error(`Scenario path ends at a list: ${path.join(".")}`);
  o[last] = value;
}

export function applyEdit(p: Project, e: ScenarioEdit, cat: Catalog): Project {
  if (e.kind === "lever") {
    const l = LEVERS.find((x) => x.id === e.leverId);
    if (!l) throw new Error(`Unknown lever ${e.leverId}`);
    return l.applies(p, cat) ? l.apply(p, cat) : p;
  }
  const q = structuredClone(p);
  if (e.kind === "set") setPath(q, e.path, e.value);
  else for (const w of q.workloads as unknown as Record<string, unknown>[]) for (const k of VOLUME_KEYS) if (typeof w[k] === "number") w[k] = (w[k] as number) * e.factor;
  return q;
}

/** The project with a scenario's edits applied, validated. */
export function applyScenario(p: Project, s: Scenario, cat: Catalog): Project {
  const q = s.edits.reduce((acc, e) => applyEdit(acc, e, cat), p);
  const parsed = ProjectSchema.safeParse(q);
  if (!parsed.success) throw new Error(`Scenario "${s.label}" makes the project invalid: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

export interface ScenarioResult { id: string; label: string; ledger: Ledger; roi: RoiResult; error?: string }

/** Baseline plus every scenario, each with its ledger and ROI on the project's cost basis. */
export function compareScenarios(p: Project, cat: Catalog): ScenarioResult[] {
  const run = (id: string, label: string, q: Project): ScenarioResult => {
    const ledger = buildLedger(q, cat);
    return { id, label, ledger, roi: computeRoi(ledger, q.roi.basis, q.roi.discountRatePct, roiOptions(q)) };
  };
  const out = [run("baseline", "Baseline", p)];
  for (const s of p.scenarios) {
    try {
      out.push(run(s.id, s.label, applyScenario(p, s, cat)));
    } catch (e) {
      out.push({ ...run(s.id, s.label, p), error: (e as Error).message });
    }
  }
  return out;
}
