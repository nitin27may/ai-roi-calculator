import { CURRENT_PROJECT_VERSION } from "./project.js";
import { DEFAULT_FEATURE_ID } from "./features.js";

/** A step upgrades a project one version forward; its output's `version` must be the input's plus one. */
type Step = (raw: Record<string, unknown>) => Record<string, unknown>;

const steps: Record<number, Step> = {
  /** v1 → v2: establishes the migration mechanism; no field changes. */
  1: (raw) => ({ ...raw, version: 2 }),
  /**
   * v2 → v3: one default feature owns everything, so totals do not move.
   * - Every workload, workstream, activity and capability gets `featureId` of that feature.
   * - `capability.componentIds` (workloads and workstreams mixed) is split into `workloadIds` and `workstreamIds`;
   *   ids that match neither are dropped, since they carried no cost.
   * - Contingency keeps covering build labour only; timing fields and cash items are optional and absent.
   */
  2: (raw) => {
    const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
    const build = (raw.build ?? {}) as Record<string, unknown>;
    const benefits = (raw.benefits ?? {}) as Record<string, unknown>;
    const withFeature = (xs: unknown): Record<string, unknown>[] => arr(xs).map((x) => ({ ...x, featureId: DEFAULT_FEATURE_ID }));
    const workloads = withFeature(raw.workloads);
    const workstreams = withFeature(build.workstreams);
    const workloadIds = new Set(workloads.map((w) => w.id));
    const workstreamIds = new Set(workstreams.map((w) => w.id));
    const capabilities = arr(benefits.capabilities).map((c) => {
      const { componentIds, ...rest } = c;
      const ids = Array.isArray(componentIds) ? (componentIds as string[]) : [];
      return { ...rest, featureId: DEFAULT_FEATURE_ID, workloadIds: ids.filter((i) => workloadIds.has(i)), workstreamIds: ids.filter((i) => workstreamIds.has(i)) };
    });
    return {
      ...raw, version: 3,
      features: [{ id: DEFAULT_FEATURE_ID, label: "Main feature" }],
      workloads,
      build: { ...build, contingencyScope: "labour", workstreams, activities: arr(build.activities).map((a) => (a.workstreamId ? a : { ...a, featureId: DEFAULT_FEATURE_ID })) },
      benefits: { ...benefits, capabilities },
    };
  },
};

/** Upgrades a saved project to `CURRENT_PROJECT_VERSION`, one step at a time. Leaves non-project input untouched so `ProjectSchema.safeParse` reports the real problem. */
export function migrateProject(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  let project = raw as Record<string, unknown>;
  const version = project.version;
  if (typeof version !== "number") return raw;
  if (version > CURRENT_PROJECT_VERSION) {
    throw new Error(`This project is from a newer version of the app (version ${version}); this app supports up to version ${CURRENT_PROJECT_VERSION}.`);
  }
  let v = version;
  while (v < CURRENT_PROJECT_VERSION) {
    const step = steps[v];
    if (!step) throw new Error(`No migration path from project version ${v} to ${CURRENT_PROJECT_VERSION}.`);
    project = step(project);
    const next = project.version;
    if (typeof next !== "number" || next <= v) throw new Error(`Migration from version ${v} did not advance the project version.`);
    v = next;
  }
  return project;
}
