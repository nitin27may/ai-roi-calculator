import type { Catalog, ProcessingTier } from "@roi-calculator/catalog";
import {
  MissingChoice, ProjectSchema, RECIPES, applyAssumption, batchOfferedUnder, buildWizardProject, defaultBuild, defaultDevKinds, missingModels, modelOptions, recipeById,
  type Assumption, type AzureDeployment, type BenefitInput, type DevKind, type Project, type Quality, type Recipe, type Values, type WizardInput, type WizardResult,
} from "@roi-calculator/engine";

/** The six wizard steps, in order. */
export const STEPS = [
  { id: "what", label: "What are you building", short: "What" },
  { id: "volume", label: "How much", short: "How much" },
  { id: "run", label: "How should it run", short: "How it runs" },
  { id: "build", label: "Building it", short: "Building" },
  { id: "worth", label: "What it is worth", short: "Worth" },
  { id: "review", label: "Review", short: "Review" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export interface WizardState {
  step: number;
  name: string;
  deployment: AzureDeployment;
  tier: ProcessingTier;
  quality: Quality;
  batchAllowed: boolean;
  /** Recipe ids in the order picked. */
  picks: string[];
  values: Record<string, Values>;
  /** Model picked per recipe and role. Empty until the user chooses; nothing is preselected. */
  models: Record<string, Record<string, string>>;
  build: { people: number; months: number };
  /** True once the user has edited the team or the length, so a change of recipes stops resetting them. */
  buildTouched: boolean;
  devKinds: DevKind[];
  devTouched: boolean;
  benefits: Record<string, BenefitInput>;
  /** Edits made on the review step, keyed by assumption id. Cleared whenever an earlier answer changes. */
  edits: Record<string, number | string | boolean>;
}

export interface WizardDefaults { deployment: AzureDeployment; tier: ProcessingTier }

export function initialState(d: WizardDefaults): WizardState {
  return {
    step: 0, name: "", deployment: d.deployment, tier: d.tier, quality: "balanced", batchAllowed: batchOfferedUnder(d.deployment),
    picks: [], values: {}, models: {}, build: { people: 2, months: 3 }, buildTouched: false, devKinds: [], devTouched: false, benefits: {}, edits: {},
  };
}

/** Any change to an earlier answer drops review edits, because the numbers they sat on have moved. */
const reset = (s: WizardState): WizardState => (Object.keys(s.edits).length ? { ...s, edits: {} } : s);

/** Adds or removes a recipe; unless the user has set them, team size, length and Dev Lab kinds follow the recipes picked. */
export function togglePick(s: WizardState, id: string): WizardState {
  const picks = s.picks.includes(id) ? s.picks.filter((x) => x !== id) : [...s.picks, id];
  const b = defaultBuild(picks);
  return reset({
    ...s, picks,
    build: s.buildTouched ? s.build : { people: b.people, months: b.months },
    devKinds: s.devTouched ? s.devKinds.filter((k) => picks.some((r) => recipeById(r)?.devKinds.some((x) => x.kind === k))) : defaultDevKinds(picks),
  });
}

export const recipeValues = (s: WizardState, r: Recipe): Values => ({ ...Object.fromEntries(r.questions.map((q) => [q.id, q.default])), ...s.values[r.id] });
export const setValue = (s: WizardState, recipeId: string, key: string, v: number | string | boolean): WizardState =>
  reset({ ...s, values: { ...s.values, [recipeId]: { ...s.values[recipeId], [key]: v } } });
export const setModel = (s: WizardState, recipeId: string, roleId: string, modelId: string): WizardState =>
  reset({ ...s, models: { ...s.models, [recipeId]: { ...s.models[recipeId], [roleId]: modelId } } });
export const setDeployment = (s: WizardState, deployment: AzureDeployment): WizardState =>
  reset({ ...s, deployment, batchAllowed: batchOfferedUnder(deployment) ? s.batchAllowed : false, models: {} });
export const setQuality = (s: WizardState, quality: Quality): WizardState => reset({ ...s, quality });
export const setBatchAllowed = (s: WizardState, batchAllowed: boolean): WizardState => reset({ ...s, batchAllowed: batchAllowed && batchOfferedUnder(s.deployment) });
export const setTier = (s: WizardState, tier: ProcessingTier): WizardState => reset({ ...s, tier });
export const setBuild = (s: WizardState, build: Partial<WizardState["build"]>): WizardState => reset({ ...s, build: { ...s.build, ...build }, buildTouched: true });
export const toggleDevKind = (s: WizardState, kind: DevKind): WizardState =>
  reset({ ...s, devTouched: true, devKinds: s.devKinds.includes(kind) ? s.devKinds.filter((k) => k !== kind) : [...s.devKinds, kind] });
export const setBenefit = (s: WizardState, recipeId: string, b: BenefitInput): WizardState => reset({ ...s, benefits: { ...s.benefits, [recipeId]: b } });
export const setEdit = (s: WizardState, id: string, v: number | string | boolean): WizardState => ({ ...s, edits: { ...s.edits, [id]: v } });

/** The deployment a recipe runs under. Real-time voice models are only offered globally, so voice moves there when the project's deployment has none. */
export function recipeDeployment(cat: Catalog, s: WizardState, r: Recipe): AzureDeployment {
  const needsRealtime = r.modelRoles.some((m) => m.need === "realtime");
  if (!needsRealtime || s.deployment === "global") return s.deployment;
  const here = r.modelRoles.filter((m) => m.need === "realtime").every((m) => modelOptions(cat, m, s.deployment).length > 0);
  return here ? s.deployment : "global";
}

/** Roles the answers need that the user has not picked yet. */
export function missingFor(s: WizardState, recipeId: string): ReturnType<typeof missingModels> {
  const r = recipeById(recipeId);
  if (!r) return [];
  return missingModels({ recipeId, values: recipeValues(s, r), models: s.models[recipeId] ?? {} });
}

export const allModelsPicked = (s: WizardState): boolean => s.picks.every((id) => missingFor(s, id).length === 0);

/** Why Next is disabled on a step, or null when it can proceed. */
export function blocker(s: WizardState): string | null {
  switch (STEPS[s.step]?.id) {
    case "what": return s.picks.length ? null : "Pick at least one thing to build.";
    case "run": {
      const n = s.picks.reduce((c, id) => c + missingFor(s, id).length, 0);
      return n ? `Choose ${n} model${n === 1 ? "" : "s"} to continue. Nothing is chosen for you.` : null;
    }
    case "review": return allModelsPicked(s) ? null : "Choose the missing models on the How should it run step.";
    default: return null;
  }
}

export function toInput(cat: Catalog, s: WizardState): WizardInput {
  return {
    name: s.name, deployment: s.deployment, tier: s.tier, quality: s.quality, batchAllowed: s.batchAllowed,
    build: s.build, devKinds: s.devKinds,
    selections: s.picks.map((id) => {
      const r = recipeById(id)!;
      return { recipeId: id, values: recipeValues(s, r), models: s.models[id] ?? {}, deployment: recipeDeployment(cat, s, r), benefit: s.benefits[id] ?? r.benefit(recipeValues(s, r)) };
    }),
  };
}

export interface Built extends WizardResult {
  /** Assumptions with the user's review edits applied to their `value`. */
  assumptions: Assumption[];
}

/** The project the wizard would create now, with review edits applied; null while a model pick is missing. */
export function buildFromState(cat: Catalog, s: WizardState): Built | null {
  if (!s.picks.length || !allModelsPicked(s)) return null;
  let res: WizardResult;
  try {
    res = buildWizardProject(cat, toInput(cat, s));
  } catch (e) {
    if (e instanceof MissingChoice) return null;
    throw e;
  }
  const project: Project = res.project;
  const assumptions = res.assumptions.map((a) => {
    const edit = s.edits[a.id];
    if (edit === undefined || !a.target) return a;
    applyAssumption(project, a, edit);
    return { ...a, value: edit };
  });
  return { ...res, project: ProjectSchema.parse(project), assumptions };
}

export { RECIPES };
