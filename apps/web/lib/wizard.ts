import type { Catalog, ProcessingTier } from "@roi-calculator/catalog";
import {
  ALL_RECIPES, MissingChoice, ProjectSchema, applyAssumption, batchOfferedUnder, buildWizardProject, defaultBuild, defaultDevKinds, missingModels, modelOptions, recipeById, recipeTypes, recipesForTypes,
  type Assumption, type AzureDeployment, type BenefitInput, type DevKind, type Project, type ProjectType, type Quality, type Recipe, type Values, type WizardInput, type WizardResult,
} from "@roi-calculator/engine";

/** Every wizard step, in order. `stepsFor` drops the ones that do not apply to what was picked. */
export const STEPS = [
  { id: "what", label: "What kind of change?", short: "Change" },
  { id: "volume", label: "How much", short: "How much" },
  { id: "run", label: "How should it run", short: "How it runs" },
  { id: "build", label: "Building it", short: "Building" },
  { id: "worth", label: "What it is worth", short: "Worth" },
  { id: "review", label: "Review", short: "Review" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

/** True when a pick is an AI recipe: only those choose a model, deployment and Batch. */
const isAiPick = (id: string): boolean => { const r = recipeById(id); return !!r && recipeTypes(r).includes("ai"); };
/** True when a pick brings no plan of its own and so needs the generic team and length of the Building it step. */
const needsBuildStep = (id: string): boolean => { const r = recipeById(id); return !!r && !r.plan; };

/**
 * The steps that apply. Model choice ("How should it run") is only for AI recipes, and the generic team and length
 * ("Building it") only for recipes without a plan of their own; non-AI recipes ask for team and months in their own questions.
 * Before anything is picked every step is listed.
 */
export function stepsFor(s: Pick<WizardState, "picks">): readonly (typeof STEPS)[number][] {
  if (!s.picks.length) return STEPS;
  return STEPS.filter((x) => (x.id === "run" ? s.picks.some(isAiPick) : x.id === "build" ? s.picks.some(needsBuildStep) : true));
}
export const stepIdOf = (s: Pick<WizardState, "picks" | "step">): StepId => (stepsFor(s)[s.step] ?? STEPS[0]).id;

export interface WizardState {
  step: number;
  name: string;
  deployment: AzureDeployment;
  tier: ProcessingTier;
  quality: Quality;
  batchAllowed: boolean;
  /** The kinds of change chosen on step 1, in the order picked. Empty until the user chooses; nothing is preselected. */
  types: ProjectType[];
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
    types: [], picks: [], values: {}, models: {}, build: { people: 2, months: 3 }, buildTouched: false, devKinds: [], devTouched: false, benefits: {}, edits: {},
  };
}

/** Any change to an earlier answer drops review edits, because the numbers they sat on have moved. */
const reset = (s: WizardState): WizardState => (Object.keys(s.edits).length ? { ...s, edits: {} } : s);

/** The kinds of change a feature built from this recipe gets: the recipe's own types among those chosen (all of its types when none match). */
export function featureTypes(s: Pick<WizardState, "types">, r: Recipe): ProjectType[] {
  const mine = recipeTypes(r).filter((t) => s.types.includes(t));
  return mine.length ? mine : recipeTypes(r);
}

/** Recipes offered for the kinds chosen, in list order. Empty until a kind is chosen. */
export const recipesFor = (s: Pick<WizardState, "types">): Recipe[] => recipesForTypes(s.types);

const followPicks = (s: WizardState, picks: string[]): WizardState => {
  const b = defaultBuild(picks);
  return {
    ...s, picks,
    build: s.buildTouched ? s.build : { people: b.people, months: b.months },
    devKinds: s.devTouched ? s.devKinds.filter((k) => picks.some((r) => recipeById(r)?.devKinds.some((x) => x.kind === k))) : defaultDevKinds(picks),
  };
};

/**
 * Chooses or drops a kind of change. Dropping one also drops the recipes picked only under it, because they are no longer offered.
 * Nothing is chosen for the user: types start empty and only this function adds one.
 */
export function toggleType(s: WizardState, t: ProjectType): WizardState {
  const types = s.types.includes(t) ? s.types.filter((x) => x !== t) : [...s.types, t];
  const picks = s.picks.filter((id) => { const r = recipeById(id); return !!r && recipeTypes(r).some((x) => types.includes(x)); });
  return reset(followPicks({ ...s, types }, picks));
}

/**
 * Adds or removes a recipe; unless the user has set them, team size, length and Dev Lab kinds follow the recipes picked.
 * Picking a recipe none of whose types is chosen adds its first type, so a recipe is never picked without a kind.
 */
export function togglePick(s: WizardState, id: string): WizardState {
  const picks = s.picks.includes(id) ? s.picks.filter((x) => x !== id) : [...s.picks, id];
  const r = recipeById(id);
  const types = r && !s.picks.includes(id) && !recipeTypes(r).some((t) => s.types.includes(t)) ? [...s.types, recipeTypes(r)[0]!] : s.types;
  return reset(followPicks({ ...s, types }, picks));
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
  switch (stepIdOf(s)) {
    case "what": return s.picks.length ? null : s.types.length ? "Pick at least one thing to build." : "Choose the kind of change first. Nothing is chosen for you.";
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
      return { recipeId: id, values: recipeValues(s, r), models: s.models[id] ?? {}, deployment: recipeDeployment(cat, s, r), benefit: s.benefits[id] ?? r.benefit(recipeValues(s, r)), types: featureTypes(s, r) };
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

export { ALL_RECIPES };
