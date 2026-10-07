import type { Ledger } from "./ledger.js";
import type { Capability, DevActivity, Feature, Project, Workload } from "./project.js";
import { sum } from "./lines.js";
import { currentLines } from "./currentstate.js";

/** Id of the feature a migrated v2 project's items are put in. */
export const DEFAULT_FEATURE_ID = "feature-1";

/** Everything a capability's cost allocation follows: the workloads and workstreams it uses. */
export const capabilityLinks = (c: Pick<Capability, "workloadIds" | "workstreamIds">): string[] => [...c.workloadIds, ...c.workstreamIds];

/** The monthly volume field a one-time volume replaces, by workload kind. Kinds with no monthly volume (search index, fixed costs, chat) have none. */
const ONE_TIME_KEY: Partial<Record<Workload["kind"], string>> = {
  transcription: "hoursPerMonth", documents: "pagesPerMonth", email: "emailsPerMonth", embeddings: "tokensPerMonth",
  retrieval: "queriesPerMonth", agent: "tasksPerMonth", continuousEval: "interactionsPerMonth", contentSafety: "requestsPerMonth",
  llm: "callsPerMonth", voiceAgent: "callsPerMonth", snowflakeComplete: "rowsPerMonth", snowflakeFunction: "rowsPerMonth",
};
export const oneTimeKey = (w: Workload): string | undefined => ONE_TIME_KEY[w.kind];

/** When and how fast a workload bills, in project months: from `start` to `end` (inclusive), reaching full volume over `ramp` months. */
export function workloadWindow(p: Project, w: Pick<Workload, "startMonth" | "endMonth" | "rampMonths">): { start: number; end: number; ramp: number } {
  const B = p.timeline.buildMonths;
  return { start: Math.max(B + 1, w.startMonth ?? 0), end: w.endMonth ?? Infinity, ramp: w.rampMonths ?? p.timeline.adoptionRampMonths };
}

/** The feature an activity belongs to: its workstream's, else its own; undefined means shared by the project. */
export function activityFeature(p: Project, a: DevActivity): string | undefined {
  const ws = a.workstreamId ? p.build.workstreams.find((w) => w.id === a.workstreamId) : undefined;
  return ws?.featureId ?? a.featureId;
}

/** A new, empty feature with a unique id. */
export function newFeature(p: Project, label = "New feature"): Feature {
  const taken = new Set(p.features.map((f) => f.id));
  let id = "feature", i = 1;
  while (taken.has(id)) id = `feature-${++i}`;
  return { id, label };
}

/** Remove a feature; what it owned becomes shared (no feature). */
export function removeFeature(p: Project, id: string): void {
  p.features = p.features.filter((f) => f.id !== id);
  for (const x of [...p.workloads, ...p.build.workstreams, ...p.build.activities, ...p.benefits.capabilities]) if (x.featureId === id) delete x.featureId;
}

/** Point a capability at every workload and workstream its feature owns (its benefit then carries their cost). */
export function linkCapabilityToFeature(p: Project, capabilityId: string, featureId: string): void {
  const c = p.benefits.capabilities.find((x) => x.id === capabilityId);
  if (!c) return;
  c.featureId = featureId;
  c.workloadIds = p.workloads.filter((w) => w.featureId === featureId).map((w) => w.id);
  c.workstreamIds = p.build.workstreams.filter((w) => w.featureId === featureId).map((w) => w.id);
}

export interface FeatureRow {
  /** Empty string for what no feature owns. */
  id: string;
  label: string;
  /** Production usage and platform cost over the horizon. */
  run: number;
  /** Build labour, Dev Lab and dev environment over the build. */
  build: number;
  /** Time-saving benefit of the feature's capabilities over the horizon. */
  benefit: number;
  net: number;
  workloads: number;
}

export const SHARED_FEATURE_ID = "";

/**
 * Cost and benefit per feature over the horizon. Run cost follows the workload's feature; build cost follows the
 * workstream's (or the activity's own) feature; a current-state saving follows its line's feature. Maintenance, transition costs, project-wide labour, avoided costs
 * and one-off benefits belong to the project and sit in the shared row. Rows add up to the ledger's totals.
 */
export function featureBreakdown(p: Project, ledger: Ledger): FeatureRow[] {
  const rows = new Map<string, FeatureRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) { r = { id, label: id === SHARED_FEATURE_ID ? "Shared by the project" : (p.features.find((f) => f.id === id)?.label ?? id), run: 0, build: 0, benefit: 0, net: 0, workloads: 0 }; rows.set(id, r); }
    return r;
  };
  for (const f of p.features) row(f.id);
  const wFeature = new Map(p.workloads.map((w) => [w.id, w.featureId ?? SHARED_FEATURE_ID]));
  for (const r of p.resources ?? []) wFeature.set(`resource:${r.id}`, r.featureId ?? SHARED_FEATURE_ID);
  const wsFeature = new Map(p.build.workstreams.map((w) => [w.id, w.featureId ?? SHARED_FEATURE_ID]));
  const actFeature = new Map(p.build.activities.map((a) => [a.id, activityFeature(p, a) ?? SHARED_FEATURE_ID]));
  for (const w of p.workloads) row(w.featureId ?? SHARED_FEATURE_ID).workloads++;
  for (const mo of ledger.months) {
    for (const l of mo.lines) {
      if (l.stream === "run" || l.stream === "platform") row(wFeature.get(l.componentId) ?? SHARED_FEATURE_ID).run += l.cost;
      else if (l.stream === "labour" || l.stream === "devlab" || l.stream === "devenv") row((l.workstreamId ? wsFeature.get(l.workstreamId) : actFeature.get(l.componentId)) ?? SHARED_FEATURE_ID).build += l.cost;
      else row(SHARED_FEATURE_ID).run += l.cost; // maintenance and transition: the project's own
    }
    for (const c of p.benefits.capabilities) row(c.featureId ?? SHARED_FEATURE_ID).benefit += mo.benefitBy.capabilities[c.id] ?? 0;
    row(SHARED_FEATURE_ID).benefit += mo.benefitBy.avoided + mo.benefitBy.oneOff;
    for (const c of currentLines(p)) row(c.featureId ?? SHARED_FEATURE_ID).benefit += mo.benefitBy.currentState[c.id] ?? 0;
  }
  for (const r of rows.values()) r.net = r.benefit - r.run - r.build;
  const all = [...rows.values()].filter((r) => r.id !== SHARED_FEATURE_ID || r.run + r.build + r.benefit > 0 || r.workloads > 0);
  return [...all.filter((r) => r.id !== SHARED_FEATURE_ID), ...all.filter((r) => r.id === SHARED_FEATURE_ID)];
}

/** Total of a breakdown, for checks that it reconciles with the ledger. */
export const featureTotals = (rows: FeatureRow[]) => ({ run: sum(rows.map((r) => r.run)), build: sum(rows.map((r) => r.build)), benefit: sum(rows.map((r) => r.benefit)) });
