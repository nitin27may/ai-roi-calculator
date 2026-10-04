import { CURRENT_PROJECT_VERSION } from "./project.js";

/** A step upgrades a project one version forward; its output's `version` must be the input's plus one. */
type Step = (raw: Record<string, unknown>) => Record<string, unknown>;

const steps: Record<number, Step> = {
  /** v1 → v2: establishes the migration mechanism; no field changes. */
  1: (raw) => ({ ...raw, version: 2 }),
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
