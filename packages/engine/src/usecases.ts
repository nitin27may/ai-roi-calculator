import type { Catalog, ChatModel, ProcessingTier } from "@studio/catalog";
import { DEPLOYMENT_LABEL, PriceBook, availableIn, type AzureDeployment } from "./pricing.js";
import {
  ProjectSchema, type Capability, type DevActivity, type Feature, type Harness, type Project, type ValueItem, type Workload, type Workstream,
} from "./project.js";
import { DEFAULT_HARNESS, newActivity, ACTIVITY_KINDS } from "./templates.js";
import { blankProject } from "./samples/templates.js";
import { IMAGE_SIZES } from "./images.js";

/**
 * Use-case recipes, as data. A recipe asks a few plain questions and turns the answers into the
 * features, workloads, Dev Lab activities, workstreams and benefits of a project. Recipes never
 * choose a model (the user does), and never add an agent harness unless the recipe is an agent.
 * Several recipes can be combined; each one becomes a feature.
 */

export type DevKind = DevActivity["kind"];
export type AnswerValue = number | string | boolean;
export type Values = Record<string, AnswerValue>;
export type Quality = "cost" | "balanced" | "quality";

export interface QuestionHelp { meaning: string; example: string; source: string }
interface QBase { id: string; label: string; help: QuestionHelp }
export type Question = QBase & (
  | { kind: "number"; unit: string; default: number; min: number; max?: number; step?: number }
  | { kind: "choice"; options: { value: string; label: string }[]; default: string }
  | { kind: "toggle"; default: boolean }
);

export type ModelNeed = "light" | "balanced" | "strong" | "snowflake" | "realtime";
/** A model the recipe needs the user to pick. `when` hides it for answers that make it unnecessary. */
export interface ModelRole { id: string; label: string; need: ModelNeed; reason: string; when?: (v: Values) => boolean }

export type BenefitType = "timeSaved" | "costAvoided" | "revenue" | "quality" | "risk" | "none";
export interface BenefitInput {
  type: BenefitType;
  /** timeSaved: a library benchmark (users x tasks), minutes per user per week, or minutes per item. */
  basis?: "benchmark" | "perUser" | "perItem";
  benchmarkId?: string;
  users?: number;
  tasksPerUserPerDay?: number;
  /** Minutes the task takes today: per user per week (perUser) or per item (perItem). */
  baselineMinutes?: number;
  savedPct?: number;
  /** costAvoided: a C$ amount, monthly or once at go-live. */
  amountCad?: number;
  cadence?: "monthly" | "once";
  label?: string;
  /** revenue: extra sales per month and the margin kept. */
  monthlyRevenue?: number;
  marginPct?: number;
  /** quality: error rates before and after, and what one error costs. Items checked come from the feature's volume. */
  errorRateBeforePct?: number;
  errorRateAfterPct?: number;
  costPerError?: number;
  /** risk: events a year, cost of one, and the share the feature prevents. */
  eventsPerYear?: number;
  impactCad?: number;
  reductionPct?: number;
  /** How sure the benefit will arrive, in percent. Absent means the default for the type (see `defaultConfidence`). */
  confidencePct?: number;
}

/** Evidence grade of a library benchmark as a starting confidence. A placeholder to replace, not a measurement. */
const GRADE_CONFIDENCE = { high: 90, medium: 70, low: 50, none: 30 } as const;

/**
 * Starting confidence for a benefit: a benchmark's evidence grade, else a placeholder by type
 * (cost avoided is a known contract, revenue and risk are forecasts, so they start lower).
 */
export function defaultConfidence(b: BenefitInput, benchmarks?: Catalog["benchmarks"]): number {
  if (b.type === "timeSaved") {
    const bm = b.basis === "benchmark" ? benchmarks?.capabilities.find((x) => x.id === b.benchmarkId) : undefined;
    return bm ? GRADE_CONFIDENCE[bm.confidence] : 70;
  }
  return { costAvoided: 90, quality: 60, revenue: 50, risk: 50, none: 100 }[b.type];
}

export interface Assumption {
  id: string;
  featureId: string;
  label: string;
  value: number | string | boolean;
  unit: string;
  source: string;
  /** Where the value lives in the built project, so the review step can edit it. Absent means it is explained only. */
  target?: { collection: "workloads" | "harnesses" | "activities" | "capabilities" | "value" | "avoidedCosts"; id: string; field: string[] };
}

export interface RecipeVolume { users?: number; monthlyItems: number; oneTimeItems: number; unit: string; mainWorkloadId?: string }

export interface RecipeAnswers {
  featureId: string;
  label: string;
  values: Values;
  /** Model per role id. A role the answers need but the user has not picked makes `build` throw `MissingChoice`. */
  models: Record<string, string>;
  deployment: AzureDeployment;
  /** The project's own deployment; a workload only carries `deployment` when this feature runs elsewhere. */
  projectDeployment: AzureDeployment;
  /** Batch allowed by the user and offered under the deployment. */
  batch: boolean;
  quality: Quality;
  /** Model for judges and evaluators in Dev Lab; defaults to the recipe's own model. */
  judgeModelId?: string;
  dev: { kinds: DevKind[]; effortShare: number; buildMonths: number; primary: boolean };
  benefit?: BenefitInput;
  benchmarks?: Catalog["benchmarks"];
  /** Hourly rate for valuing a one-off saving. */
  rateCad?: number;
}

export interface RecipeResult {
  feature: Feature;
  workloads: Workload[];
  harnesses: Harness[];
  workstreams: Workstream[];
  activities: DevActivity[];
  capabilities: Capability[];
  avoidedCosts: Project["benefits"]["avoidedCosts"];
  oneOff: Project["benefits"]["oneOff"];
  /** Revenue, quality and risk-reduction benefits. */
  value: ValueItem[];
  assumptions: Assumption[];
  volume: RecipeVolume;
}

export interface Recipe {
  id: string;
  label: string;
  description: string;
  questions: Question[];
  modelRoles: ModelRole[];
  /** Dev Lab activities that make sense for this recipe; `default` is whether they start ticked. */
  devKinds: { kind: DevKind; why: string; default: boolean }[];
  /** True only for recipes that run an agent. */
  needsHarness: boolean;
  /** Whether part of the workload can run on the Batch tier. */
  batchable: boolean;
  /** Plain-language note on what a time-saved estimate means here. */
  benefitHint: string;
  benefit: (v: Values) => BenefitInput;
  build: (a: RecipeAnswers) => RecipeResult;
}

export class MissingChoice extends Error {
  constructor(readonly roleId: string, readonly recipeId: string) { super(`Pick a model for "${roleId}" in ${recipeId}`); }
}

// ---------------------------------------------------------------- helpers

const TOK_PER_WORD = 1.33;
const WORDS_PER_PAGE = 500;
const TOK_PER_PAGE = Math.round(WORDS_PER_PAGE * TOK_PER_WORD);
const WORKING_DAYS = 21;
const HEURISTICS = "Catalogue heuristic (about 1.33 tokens per English word, 500 words on a plain page).";
const YOU = "Your answer.";
const DEFAULTS = "Recipe default; replace it with your own figure.";
const GOLIVE = (a: RecipeAnswers) => a.dev.buildMonths + 1;
const round = (x: number, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
const num = (v: Values, k: string): number => Number(v[k] ?? 0);
const bool = (v: Values, k: string): boolean => v[k] === true;
const str = (v: Values, k: string): string => String(v[k] ?? "");

/** The picture settings of a recipe answer, as the project's image input (`perCall` is pictures per page). */
const imageInputFrom = (v: Values) => {
  const size = IMAGE_SIZES.find((x) => x.id === str(v, "imageSize")) ?? IMAGE_SIZES[1];
  return { perCall: num(v, "imagesPerPage"), widthPx: size.widthPx, heightPx: size.heightPx, detail: (str(v, "imageDetail") === "low" ? "low" : "high") as "low" | "high" };
};

const q = {
  num: (id: string, label: string, unit: string, def: number, min: number, max: number | undefined, help: [string, string, string], step?: number): Question =>
    ({ kind: "number", id, label, unit, default: def, min, ...(max !== undefined ? { max } : {}), ...(step ? { step } : {}), help: { meaning: help[0], example: help[1], source: help[2] } }),
  choice: (id: string, label: string, options: [string, string][], def: string, help: [string, string, string]): Question =>
    ({ kind: "choice", id, label, options: options.map(([value, l]) => ({ value, label: l })), default: def, help: { meaning: help[0], example: help[1], source: help[2] } }),
  toggle: (id: string, label: string, def: boolean, help: [string, string, string]): Question =>
    ({ kind: "toggle", id, label, default: def, help: { meaning: help[0], example: help[1], source: help[2] } }),
};

/** Answers with every missing question filled from its default. */
export function withDefaults(r: Recipe, values: Values = {}): Values {
  const out: Values = {};
  for (const x of r.questions) out[x.id] = values[x.id] ?? x.default;
  return out;
}

const reasoningFor = (a: RecipeAnswers) => (a.quality === "cost" ? "none" : a.quality === "balanced" ? "low" : "medium") as "none" | "low" | "medium";
const batchOk = (a: RecipeAnswers) => a.batch && a.deployment !== "regional";
const dep = (a: RecipeAnswers) => (a.deployment !== a.projectDeployment ? { deployment: a.deployment } : {});
const need = (a: RecipeAnswers, recipeId: string, role: string): string => {
  const m = a.models[role];
  if (!m) throw new MissingChoice(role, recipeId);
  return m;
};
const p = (a: RecipeAnswers, s: string) => `${a.featureId}-${s}`;

/** Builds the pieces every recipe returns, so each recipe only fills in what is specific to it. */
class Out {
  workloads: Workload[] = [];
  harnesses: Harness[] = [];
  workstreams: Workstream[] = [];
  activities: DevActivity[] = [];
  assumptions: Assumption[] = [];
  constructor(readonly a: RecipeAnswers) {}
  /** Adds a workload tagged with the feature and returns it. */
  add<W extends Workload>(w: W): W { w.featureId = this.a.featureId; this.workloads.push(w); return w; }
  /** Records an assumption; when `target` names a workload field the review step can edit it. */
  note(id: string, label: string, value: Assumption["value"], unit: string, source: string, target?: Assumption["target"]) {
    this.assumptions.push({ id: p(this.a, id), featureId: this.a.featureId, label, value, unit, source, ...(target ? { target } : {}) });
  }
  /** Records a workload field as an editable assumption, reading its current value. */
  field(w: Workload, path: string[], label: string, unit: string, source: string) {
    let cur: unknown = w;
    for (const k of path) cur = (cur as Record<string, unknown> | undefined)?.[k];
    if (typeof cur !== "number" && typeof cur !== "string" && typeof cur !== "boolean") return;
    this.note(`${w.id}.${path.join(".")}`, `${w.label}: ${label}`, cur, unit, source, { collection: "workloads", id: w.id, field: path });
  }
  finish(volume: RecipeVolume, extra: { workloadIds?: string[] } = {}): RecipeResult {
    const a = this.a;
    const ben = makeBenefits(a, volume, extra.workloadIds ?? this.workloads.filter((w) => w.kind !== "fixed").map((w) => w.id), this.workstreams.map((w) => w.id));
    return {
      feature: { id: a.featureId, label: a.label }, workloads: this.workloads, harnesses: this.harnesses, workstreams: this.workstreams, activities: this.activities,
      capabilities: ben.capabilities, avoidedCosts: ben.avoidedCosts, oneOff: ben.oneOff, value: ben.value, assumptions: [...this.assumptions, ...ben.assumptions], volume,
    };
  }
}

/** One-time volume, only when it is more than zero. */
const once = (a: RecipeAnswers, volume: number) => (volume > 0 ? { oneTime: { volume: Math.round(volume), month: GOLIVE(a) } } : {});

/**
 * Dev Lab activities the user ticked for this recipe. Effort-driven volumes are split across the features
 * sharing the team (`effortShare`); artefact-driven ones run once per feature. Harness-driven kinds only
 * exist when the recipe has a harness; coding-tool seats are added once, by the primary feature.
 */
function devActivities(out: Out, recipe: Recipe, modelId: string, harnessIds: string[] = [], workstreamId?: string) {
  const a = out.a;
  const scratch = blankProject("scratch");
  scratch.timeline.buildMonths = a.dev.buildMonths;
  scratch.harnesses = out.harnesses.length ? out.harnesses.map((h) => ({ ...h })) : [];
  const judge = a.judgeModelId ?? modelId;
  modelId = modelId || judge;
  const share = a.dev.effortShare;
  const allowed = new Set(recipe.devKinds.map((k) => k.kind));
  const scope = workstreamId ? { workstreamId } : { featureId: a.featureId };
  const label = (k: DevKind) => `${a.label}: ${ACTIVITY_KINDS.find((x) => x.kind === k)!.label}`;
  const put = (act: DevActivity, suffix = "") => {
    Object.assign(act, scope, { id: p(a, `${act.kind}${suffix}`), label: label(act.kind) + (suffix ? ` (${suffix.slice(1)})` : "") });
    out.activities.push(act);
  };
  for (const kind of a.dev.kinds) {
    if (!allowed.has(kind)) continue;
    if ((kind === "bakeoff" || kind === "iterations" || kind === "regression") && !harnessIds.length) continue;
    if (kind === "tooling" && !a.dev.primary) continue;
    if (kind !== "tooling" && !modelId) continue;
    const act = newActivity(scratch, kind);
    switch (act.kind) {
      case "bakeoff": act.harnessId = harnessIds[0]!; act.candidates = [{ modelId, fromMonth: 1 }]; put(act); break;
      case "iterations":
        harnessIds.forEach((h, i) => {
          const one = i === 0 ? act : structuredClone(act);
          if (one.kind !== "iterations") return;
          one.harnessId = h; one.modelId = modelId; one.runsPerDevPerDay = Math.max(1, round(one.runsPerDevPerDay * share));
          put(one, harnessIds.length > 1 ? `-${h.replace(`${a.featureId}-`, "")}` : "");
        });
        break;
      case "regression": act.harnessId = harnessIds[0]!; act.modelIds = [modelId]; put(act); break;
      case "evaluation": act.judgeModelId = judge; put(act); break;
      case "redteam": act.targetModelId = modelId; put(act); break;
      case "playground": act.modelId = modelId; act.callsPerDevPerDay = Math.max(1, round(act.callsPerDevPerDay * share)); put(act); break;
      case "synthetic": act.generatorModelId = modelId; act.judgeModelId = judge; act.acceptedPerMonth = Math.max(100, round(act.acceptedPerMonth * share)); put(act); break;
      case "tooling": put(act); break;
      case "finetune": break;
    }
  }
  if (a.dev.kinds.length) out.note("dev", "Dev Lab activities", out.activities.length, "activities", `The ones you ticked on the Building it step, with volumes split across ${round(1 / Math.max(0.01, share))} feature(s) sharing the team.`);
}

/**
 * The feature's benefit, in the project's real P8 structures: time saved is a capability (benchmark or own minutes),
 * cost avoided an avoided cost, revenue, quality and risk are value items. Every benefit carries a confidence and,
 * for the non-time types, is attributed to a capability of the feature (an hours-zero one, so ROI by capability
 * shows the feature's value next to the cost of the workloads it uses).
 */
function makeBenefits(a: RecipeAnswers, vol: RecipeVolume, workloadIds: string[], workstreamIds: string[]) {
  const out = { capabilities: [] as Capability[], avoidedCosts: [] as Project["benefits"]["avoidedCosts"], oneOff: [] as Project["benefits"]["oneOff"], value: [] as ValueItem[], assumptions: [] as Assumption[] };
  const b = a.benefit;
  if (!b || b.type === "none") return out;
  const f = a.featureId;
  const capId = p(a, "benefit");
  const links = { featureId: f, workloadIds, workstreamIds };
  const conf = Math.min(100, Math.max(0, b.confidencePct ?? defaultConfidence(b, a.benchmarks)));
  const note = (id: string, label: string, value: number | string, unit: string, source: string, target?: Assumption["target"]) =>
    out.assumptions.push({ id: `${f}-benefit-${id}`, featureId: f, label: `${a.label} benefit: ${label}`, value, unit, source, ...(target ? { target } : {}) });
  const on = (collection: "capabilities" | "value" | "avoidedCosts", id: string, field: string): Assumption["target"] => ({ collection, id, field: [field] });
  const rate = a.rateCad ?? 62.5;
  const confidenceNote = (target: Assumption["target"], source: string) =>
    note("confidence", "confidence that it arrives", conf, "%", b.confidencePct === undefined ? source : `${YOU} The benefit counts at this share of its value.`, target);
  if (b.type === "timeSaved") {
    if (b.basis === "benchmark") {
      const bm = a.benchmarks?.capabilities.find((x) => x.id === b.benchmarkId);
      if (!bm) return out;
      const users = b.users ?? vol.users ?? 100;
      const cap: Capability = {
        id: capId, label: `${a.label}: ${bm.label}`, roleId: bm.roleId, ...links, hoursSavedPerMonth: 0, driver: bm.driver, benchmarkId: bm.id,
        baselineMinutes: bm.baselineMinutes, savings: { ...bm.savings }, unit: bm.unit, licenceOverlap: bm.licenceOverlap, confidencePct: conf,
        ...(bm.driver === "perVolume" ? { itemsPerMonth: vol.monthlyItems, handledPct: 100 } : { users }),
        ...(bm.driver === "perTask" ? { tasksPerUserPerDay: b.tasksPerUserPerDay ?? 1 } : {}),
      };
      out.capabilities.push(cap);
      note("users", "users who get the saving", users, "users", YOU, bm.driver === "perVolume" ? undefined : on("capabilities", capId, "users"));
      note("benchmark", `time saved per ${bm.driver === "perUserWeek" ? "user per week" : "task"}`, `${bm.savings.typical} ${bm.unit === "pct" ? "%" : "minutes"} (typical), from ${bm.sourceLabel}`, bm.unit === "pct" ? "%" : "minutes", `Benchmark library: ${bm.sourceLabel}.`);
      confidenceNote(on("capabilities", capId, "confidencePct"), `Starts from the benchmark's evidence grade (${bm.confidence}${bm.vendorFunded ? ", vendor funded" : ""}): ${bm.sourceLabel}.`);
    } else if (b.basis === "perUser") {
      const m = b.baselineMinutes ?? 120, pct = b.savedPct ?? 20, users = b.users ?? vol.users ?? 100;
      out.capabilities.push({
        id: capId, label: `${a.label}: time saved`, roleId: "knowledgeWorker", ...links, hoursSavedPerMonth: 0, driver: "perUserWeek", users,
        baselineMinutes: m, savings: pctTriple(pct), unit: "pct", confidencePct: conf,
      });
      note("users", "users who get the saving", users, "users", YOU, on("capabilities", capId, "users"));
      note("baselineMinutes", "minutes per user per week on this task today", m, "minutes", YOU, on("capabilities", capId, "baselineMinutes"));
      note("savedPct", "share of that time saved (typical)", pct, "%", YOU);
      confidenceNote(on("capabilities", capId, "confidencePct"), "Placeholder for time you estimate yourself; replace it with a pilot result.");
    } else {
      const m = b.baselineMinutes ?? 10, pct = b.savedPct ?? 50;
      if (vol.monthlyItems > 0) {
        out.capabilities.push({
          id: capId, label: `${a.label}: time saved per ${vol.unit.replace(/s$/, "")}`, roleId: "knowledgeWorker", ...links, hoursSavedPerMonth: 0, driver: "perVolume",
          itemsPerMonth: vol.monthlyItems, handledPct: 100, baselineMinutes: m, savings: pctTriple(pct), unit: "pct", confidencePct: conf,
          ...(vol.mainWorkloadId ? { volumeFrom: vol.mainWorkloadId } : {}),
        });
        note("baselineMinutes", `minutes per ${vol.unit.replace(/s$/, "")} today`, m, "minutes", YOU, on("capabilities", capId, "baselineMinutes"));
        confidenceNote(on("capabilities", capId, "confidencePct"), "Placeholder for time you estimate yourself; replace it with a pilot result.");
      }
      if (vol.oneTimeItems > 0) {
        const amount = round((vol.oneTimeItems * m) / 60 * (pct / 100) * rate);
        out.oneOff.push({ id: p(a, "benefit-once"), label: `${a.label}: one-time saving on ${Math.round(vol.oneTimeItems).toLocaleString("en-CA")} ${vol.unit}`, amount, month: GOLIVE(a) });
        note("oneOff", "one-time saving", amount, "C$", `${Math.round(vol.oneTimeItems)} ${vol.unit} x ${m} min x ${pct}% saved x C$${rate}/hour.`);
      }
      note("savedPct", "share of that time saved (typical)", pct, "%", YOU);
    }
    return out;
  }
  const prefix = { costAvoided: "Cost avoided", revenue: "Added revenue", quality: "Quality gain (rework avoided)", risk: "Risk reduced (expected loss avoided)" }[b.type];
  const label = `${a.label}: ${b.label?.trim() || prefix}`;
  // A one-off has no confidence or capability to carry, so only cost avoided may be once.
  if (b.type === "costAvoided" && b.cadence === "once") {
    if ((b.amountCad ?? 0) <= 0) return out;
    out.oneOff.push({ id: p(a, "benefit-once"), label, amount: b.amountCad!, month: GOLIVE(a) });
    note("amount", "cost avoided (once)", b.amountCad!, "C$", `${YOU} It enters the model as a one-off amount, not scaled by adoption.`);
    return out;
  }
  const item: ValueItem = { id: `${capId}-value`, label, kind: "revenue", capabilityId: capId, featureId: f, confidencePct: conf, startMonth: GOLIVE(a) };
  let confTarget: Assumption["target"];
  let placeholder: string;
  if (b.type === "costAvoided") {
    const amount = b.amountCad ?? 0;
    if (amount <= 0) return out;
    out.avoidedCosts.push({ id: capId, label, monthly: amount, capabilityId: capId, confidencePct: conf });
    note("amount", "cost avoided (per month)", amount, "C$", `${YOU} It enters the model as a monthly amount, not scaled by adoption.`, on("avoidedCosts", capId, "monthly"));
    confTarget = on("avoidedCosts", capId, "confidencePct");
    placeholder = "A cost you can point to (a licence, a contract) starts high; lower it if it is not yet agreed.";
  } else if (b.type === "revenue") {
    const revenue = b.monthlyRevenue ?? 0, margin = b.marginPct ?? 40;
    if (revenue <= 0) return out;
    Object.assign(item, { kind: "revenue", monthlyRevenue: revenue, marginPct: margin });
    out.value.push(item);
    note("revenue", "extra revenue per month", revenue, "C$", `${YOU} Follows the adoption ramp from go-live.`, on("value", item.id, "monthlyRevenue"));
    note("margin", "margin kept on that revenue", margin, "%", `${YOU} Only the margin is a benefit, not the sales.`, on("value", item.id, "marginPct"));
    confTarget = on("value", item.id, "confidencePct");
    placeholder = "Forecast revenue is the least certain benefit, so it starts at half.";
  } else if (b.type === "quality") {
    const before = b.errorRateBeforePct ?? 0, after = b.errorRateAfterPct ?? 0, per = b.costPerError ?? 0;
    const items = vol.monthlyItems;
    if (items <= 0 || before <= after || per <= 0) return out;
    Object.assign(item, { kind: "quality", errorRateBeforePct: before, errorRateAfterPct: after, costPerError: per, ...(vol.mainWorkloadId ? { volumeFrom: vol.mainWorkloadId } : { volumePerMonth: items }) });
    out.value.push(item);
    note("errorBefore", "error rate today", before, "%", YOU, on("value", item.id, "errorRateBeforePct"));
    note("errorAfter", "error rate with AI", after, "%", YOU, on("value", item.id, "errorRateAfterPct"));
    note("costPerError", "cost of one error", per, "C$", YOU, on("value", item.id, "costPerError"));
    note("checked", `${vol.unit} checked per month`, Math.round(items), vol.unit, "Taken from this feature's volume on How much, so the two stay in step.");
    confTarget = on("value", item.id, "confidencePct");
    placeholder = "Error rates are usually measured on a sample; lower this if yours is a guess.";
  } else {
    const events = b.eventsPerYear ?? 0, impact = b.impactCad ?? 0, share = b.reductionPct ?? 0;
    if (events <= 0 || impact <= 0 || share <= 0) return out;
    Object.assign(item, { kind: "risk", eventsPerYear: events, impactCad: impact, reductionPct: share });
    out.value.push(item);
    note("events", "events per year", events, "events", YOU, on("value", item.id, "eventsPerYear"));
    note("impact", "cost of one event", impact, "C$", YOU, on("value", item.id, "impactCad"));
    note("reduction", "share of events prevented", share, "%", YOU, on("value", item.id, "reductionPct"));
    confTarget = on("value", item.id, "confidencePct");
    placeholder = "A rare event is a forecast, so it starts at half.";
  }
  const cap: Capability = { id: capId, label: `${a.label}: ${prefix.split(" (")[0]!.toLowerCase()}`, roleId: "knowledgeWorker", ...links, hoursSavedPerMonth: 0, driver: "hours" };
  out.capabilities.push(cap);
  confidenceNote(confTarget, placeholder);
  note("capability", "counted under capability", cap.label, "capability", `This feature's capability, so ROI by capability sets what ${a.label} is worth against what it costs.`);
  return out;
}

const pctTriple = (pct: number) => ({ conservative: round(pct * 0.5, 1), typical: pct, optimistic: Math.min(100, round(pct * 1.3, 1)) });

function agentHarness(a: RecipeAnswers, id: string, label: string, over: Partial<Harness>): Harness {
  return { ...DEFAULT_HARNESS, id: p(a, id), label, reasoning: reasoningFor(a), ...over };
}

/** Shared by knowledge search and search only: the corpus, its index, embeddings and queries. */
function searchCore(out: Out, v: Values, queriesPerMonth: number, modelRoleUsed: boolean) {
  const a = out.a;
  const corpusTokens = num(v, "corpusDocs") * num(v, "pagesPerDoc") * TOK_PER_PAGE;
  const newTokens = num(v, "newDocsMonthly") * num(v, "pagesPerDoc") * TOK_PER_PAGE;
  const chunkTokens = 512;
  if (bool(v, "extract")) {
    const w = out.add({ kind: "documents", id: p(a, "ingest"), label: "Document ingestion", pagesPerMonth: num(v, "newDocsMonthly") * num(v, "pagesPerDoc"), pageType: "plain", route: { type: "extract", extractorId: "di-layout", addOnIds: [] }, ...once(a, num(v, "corpusDocs") * num(v, "pagesPerDoc")), ...dep(a) } as Workload);
    out.field(w, ["pagesPerMonth"], "pages a month", "pages", "New documents a month x pages each.");
    out.field(w, ["oneTime", "volume"], "pages loaded once", "pages", "Documents already in the corpus x pages each.");
  }
  const emb = out.add({ kind: "embeddings", id: p(a, "embed"), label: "Embeddings", tokensPerMonth: newTokens, modelId: "text-embedding-3-small", ...once(a, corpusTokens), ...dep(a) } as Workload);
  out.field(emb, ["tokensPerMonth"], "tokens embedded a month", "tokens", `New documents x pages x ${TOK_PER_PAGE} tokens a page. ${HEURISTICS}`);
  out.field(emb, ["oneTime", "volume"], "tokens embedded once", "tokens", `Corpus documents x pages x ${TOK_PER_PAGE} tokens a page.`);
  out.field(emb, ["modelId"], "embedding model", "model", "Default small embedding model; change it here if you prefer another.");
  const idx = out.add({ kind: "aiSearch", id: p(a, "index"), label: "Search index", chunks: Math.max(1000, Math.ceil(corpusTokens / chunkTokens)), embeddingModelId: "text-embedding-3-small", bytesPerDim: 4, chunkTokens, replicas: 2 } as Workload);
  out.field(idx, ["chunks"], "chunks in the index", "chunks", `Corpus tokens divided by ${chunkTokens} tokens per chunk, at least 1,000.`);
  out.field(idx, ["replicas"], "index copies", "replicas", "Two copies keep search up while one updates (sample default).");
  const ret = out.add({ kind: "retrieval", id: p(a, "retrieval"), label: "Retrieval", queriesPerMonth: Math.round(queriesPerMonth), semanticShare: bool(v, "semantic") || modelRoleUsed ? 1 : 0, ...dep(a) } as Workload);
  out.field(ret, ["queriesPerMonth"], "searches a month", "queries", "Users x questions a day x working days.");
  out.field(ret, ["semanticShare"], "share using the semantic ranker", "share", "On by default; it improves ranking and carries its own fee.");
  return ret;
}

const SEARCH_QS = (users: number, perDay: number): Question[] => [
  q.num("corpusDocs", "Documents in the knowledge base", "documents", 5000, 1, 10_000_000, ["How many documents people will search across when you go live.", "5,000 policies, manuals and contracts.", YOU]),
  q.num("pagesPerDoc", "Pages per document", "pages", 10, 1, 5000, ["The average length of a document.", "10 pages for a policy document.", YOU]),
  q.num("newDocsMonthly", "New or changed documents a month", "documents", 200, 0, 10_000_000, ["Documents added or updated each month after go-live. They are read and embedded again.", "200 new documents a month.", YOU]),
  q.toggle("extract", "Documents need text extracted first", true, ["Whether files are scans or PDFs that need a document-reading service before they can be indexed.", "Yes for PDFs and scans, no for text already in a database.", YOU]),
  q.num("users", "Users", "people", users, 1, 1_000_000, ["How many people search each month.", "200 staff in one department.", YOU]),
  q.num("perDay", "Questions per user per day", "questions", perDay, 0.1, 500, ["How many questions an active user asks on a working day.", "5 questions a day.", YOU], 0.1),
];

const AGENT_DEV = (why: string): Recipe["devKinds"] => [
  { kind: "iterations", why: "Developers re-run the agent while they change it.", default: true },
  { kind: "regression", why: "Nightly full-set runs catch regressions.", default: true },
  { kind: "evaluation", why: "A judge model scores the runs above.", default: true },
  { kind: "bakeoff", why: "Compare candidate models on the same test set.", default: false },
  { kind: "redteam", why: "Adversarial scans before launch. " + why, default: false },
  { kind: "playground", why: "Ad-hoc calls while designing prompts.", default: true },
  { kind: "tooling", why: "Coding-assistant seats for the developers.", default: true },
];
const LLM_DEV: Recipe["devKinds"] = [
  { kind: "playground", why: "Ad-hoc calls while designing prompts.", default: true },
  { kind: "synthetic", why: "Generate a test set and keep what a judge accepts.", default: false },
  { kind: "redteam", why: "Adversarial scans before launch.", default: false },
  { kind: "tooling", why: "Coding-assistant seats for the developers.", default: true },
];

const batchQ = (): Question[] => [];

// ---------------------------------------------------------------- recipes

const book: Recipe = {
  id: "book", label: "Book or document optimisation", needsHarness: false, batchable: true,
  description: "A model rewrites, edits or proofreads long documents in passes. Typical for a back catalogue of books, manuals or reports.",
  questions: [
    q.num("once", "Books or documents to optimise now", "documents", 10, 0, 1_000_000, ["The backlog you will run once, at go-live.", "Optimise 10 books.", YOU]),
    q.num("monthly", "New books or documents each month", "documents", 0, 0, 1_000_000, ["Fresh items that arrive every month after the backlog.", "2 new titles a month.", YOU]),
    q.num("pages", "Pages each", "pages", 250, 1, 5000, ["The average length of one item.", "250 pages for a book.", YOU]),
    q.num("words", "Words per page", "words", 300, 20, 1500, ["How dense a page is. Words are converted to tokens.", "300 words for a book page, 500 for a dense report page.", HEURISTICS]),
    q.num("passes", "Passes over each item", "passes", 2, 1, 10, ["How many times the full text goes through the model, for example one rewrite and one proofread.", "2 passes: rewrite, then proofread.", YOU]),
    q.num("pagesPerCall", "Pages the model handles in one call", "pages", 5, 1, 100, ["A long item is cut into pieces; this is the size of a piece.", "5 pages at a time keeps each answer reliable.", DEFAULTS]),
    q.toggle("scanned", "Pages are scanned images that need text recognition", false, ["Whether text must be read from images before the model can edit it.", "Yes for scans of printed books.", YOU]),
  ],
  modelRoles: [{ id: "main", label: "Editing model", need: "balanced", reason: "editing long text needs steady quality over many pages, but not the most expensive model" }],
  devKinds: LLM_DEV,
  benefitHint: "Hours an editor would spend on the same items by hand.",
  benefit: (v) => ({ type: "timeSaved", basis: "perItem", baselineMinutes: Math.round(num(v, "pages") * 2.4), savedPct: 40 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "book", "main");
    const chunk = Math.round(num(v, "pagesPerCall") * num(v, "words") * TOK_PER_WORD);
    const callsPerItem = Math.ceil(num(v, "pages") / num(v, "pagesPerCall")) * num(v, "passes");
    const pages = (n: number) => n * num(v, "pages");
    if (bool(v, "scanned")) {
      const w = o.add({ kind: "documents", id: p(a, "ocr"), label: "Text recognition", pagesPerMonth: pages(num(v, "monthly")), pageType: "plain", route: { type: "extract", extractorId: "di-read", addOnIds: [] }, ...once(a, pages(num(v, "once"))), ...dep(a) } as Workload);
      o.field(w, ["pagesPerMonth"], "pages a month", "pages", "New items a month x pages each.");
      o.field(w, ["oneTime", "volume"], "pages read once", "pages", "Backlog items x pages each.");
    }
    const w = o.add({
      kind: "llm", id: p(a, "passes"), label: "Optimisation passes", callsPerMonth: callsPerItem * num(v, "monthly"), modelId: model,
      inputTokens: chunk + 800, cachedInputTokens: 0, outputTokens: chunk, batchShare: batchOk(a) ? 1 : 0, reasoning: reasoningFor(a), ...once(a, callsPerItem * num(v, "once")), ...dep(a),
    } as Workload);
    o.note("callsPerItem", "Model calls for one item", callsPerItem, "calls", `${Math.ceil(num(v, "pages") / num(v, "pagesPerCall"))} pieces x ${num(v, "passes")} passes.`);
    o.field(w, ["callsPerMonth"], "calls a month", "calls", "New items a month x calls per item.");
    o.field(w, ["oneTime", "volume"], "calls for the backlog", "calls", "Backlog items x calls per item.");
    o.field(w, ["inputTokens"], "tokens in per call", "tokens", `One piece (${chunk} tokens: pages x words x 1.33) plus 800 tokens of instructions and style guide.`);
    o.field(w, ["outputTokens"], "tokens out per call", "tokens", "An edit returns about as much text as it reads.");
    o.field(w, ["batchShare"], "share sent as Batch", "share", batchOk(a) ? "Batch is allowed and offered under your deployment; overnight editing can wait." : "Batch is off or not offered under your deployment.");
    devActivities(o, book, model);
    return o.finish({ monthlyItems: num(v, "monthly"), oneTimeItems: num(v, "once"), unit: "documents", mainWorkloadId: w.id }, { workloadIds: o.workloads.map((x) => x.id) });
  },
};

const extraction: Recipe = {
  id: "extraction", label: "Document extraction", needsHarness: false, batchable: true,
  description: "Read invoices, forms or contracts and pull out the fields you need. Optional backlog on top of a monthly flow.",
  questions: [
    q.num("once", "Backlog to process once", "documents", 5000, 0, 100_000_000, ["Documents already waiting that you will run through once.", "5,000 scanned invoices from last year.", YOU]),
    q.num("monthly", "New documents each month", "documents", 2000, 0, 100_000_000, ["Documents that arrive every month after go-live.", "2,000 invoices a month.", YOU]),
    q.num("pagesPerDoc", "Pages per document", "pages", 6, 1, 5000, ["The average length of a document.", "6 pages for an invoice with attachments.", YOU]),
    q.choice("pageType", "What a page looks like", [["plain", "Plain text"], ["dense", "Dense (tables, small print)"], ["slide", "Slides"], ["spreadsheet", "Spreadsheet"]], "dense", ["Denser pages hold more words and so more tokens.", "Dense for forms and contracts.", HEURISTICS]),
    q.choice("route", "How it is read", [["service", "A document-reading service"], ["model", "A language model reads the pages"]], "service", ["A reading service is priced per page. A model is priced per token and handles odd layouts.", "Service for standard forms, model for free-form letters.", "Catalogue prices for both are in Prices & sources."]),
    q.num("imagesPerPage", "Pictures per page (when a model reads the pages)", "images", 0, 0, 100, ["Photos, charts or scanned figures embedded in each page. A model that reads the pages is billed for each picture as well as the text.", "2 if every page carries a chart and a photo.", "Image-token formula of the model you pick (published by the vendor); 0 leaves pictures out."]),
    q.choice("imageSize", "Size of those pictures", IMAGE_SIZES.map((x) => [x.id, x.label] as [string, string]), "photo", ["Bigger pictures cost more tokens, up to a cap that depends on the model.", "A phone photo is about 1,024 x 768.", "Resolution presets from the vendors' image guides."]),
    q.choice("imageDetail", "Image detail level", [["high", "High (full detail)"], ["low", "Low (a fixed small cost)"]], "high", ["Some models offer a cheap low-detail mode that reads the picture coarsely. Others ignore it.", "Low for decorative pictures, high for charts you need read.", "OpenAI vision guide; Claude has no detail setting."]),
    q.num("outTokens", "Fields written out per document", "tokens", 300, 10, 20000, ["How much structured output each document produces (field names and values).", "300 tokens is about 25 fields.", DEFAULTS]),
    q.toggle("tidy", "A model also tidies and normalises the fields", false, ["Adds a model pass that fixes formats and fills gaps after reading.", "Yes if dates and amounts arrive in mixed formats.", YOU]),
  ],
  modelRoles: [{ id: "main", label: "Model for reading or tidying", need: "light", reason: "extraction follows a fixed template, so a small model is usually accurate enough", when: (v) => v.route === "model" || v.tidy === true }],
  devKinds: LLM_DEV.filter((k) => k.kind !== "synthetic"),
  benefitHint: "Minutes a person spends keying or checking each document today.",
  benefit: () => ({ type: "timeSaved", basis: "perItem", baselineMinutes: 8, savedPct: 70 }),
  build(a) {
    const v = a.values, o = new Out(a), usesModel = v.route === "model" || bool(v, "tidy");
    const model = usesModel ? need(a, "extraction", "main") : undefined;
    const pages = (n: number) => n * num(v, "pagesPerDoc");
    const route = v.route === "model" ? { type: "direct" as const, modelId: model!, outputTokens: Math.max(10, Math.round(num(v, "outTokens") / num(v, "pagesPerDoc"))) } : { type: "extract" as const, extractorId: "di-layout", addOnIds: [] };
    const w = o.add({
      kind: "documents", id: p(a, "docs"), label: "Document extraction", pagesPerMonth: pages(num(v, "monthly")), pageType: str(v, "pageType") as "plain", route,
      ...(bool(v, "tidy") ? { enrich: { modelId: model!, pagesPerDoc: num(v, "pagesPerDoc"), outputTokensPerDoc: num(v, "outTokens"), reasoning: reasoningFor(a) } } : {}),
      ...(v.route === "model" && num(v, "imagesPerPage") > 0 ? { images: imageInputFrom(v) } : {}),
      ...(usesModel && batchOk(a) ? { tier: "batch" as ProcessingTier } : {}), ...once(a, pages(num(v, "once"))), ...dep(a),
    } as Workload);
    o.field(w, ["pagesPerMonth"], "pages a month", "pages", "New documents a month x pages each.");
    o.field(w, ["oneTime", "volume"], "pages in the backlog", "pages", "Backlog documents x pages each.");
    o.field(w, ["pageType"], "page type", "type", YOU);
    if (w.kind === "documents" && w.images) {
      o.note("images", "Pictures per page", w.images.perCall, "images", `${YOU} Billed with the model's own image formula (${w.images.widthPx} x ${w.images.heightPx} px, ${w.images.detail} detail), on top of the page itself.`, { collection: "workloads", id: w.id, field: ["images", "perCall"] });
    }
    if (v.route === "model") o.field(w, ["route", "outputTokens"], "tokens out per page", "tokens", "Fields written out per document divided by pages per document.");
    if (model) devActivities(o, extraction, model);
    return o.finish({ monthlyItems: num(v, "monthly"), oneTimeItems: num(v, "once"), unit: "documents", mainWorkloadId: w.id });
  },
};

const rag: Recipe = {
  id: "rag", label: "Knowledge search (RAG)", needsHarness: false, batchable: false,
  description: "People ask questions and a model answers from your own documents, with sources. Includes ingestion, search index and chat.",
  questions: [
    ...SEARCH_QS(200, 5),
    q.num("turns", "Questions in one conversation", "questions", 3, 1, 50, ["How many back-and-forth questions make up one conversation. History grows with each.", "3 questions per conversation.", DEFAULTS]),
    q.num("topK", "Passages sent with each question", "passages", 5, 1, 50, ["How many retrieved passages the model reads for every question.", "5 passages of about 512 tokens.", DEFAULTS]),
  ],
  modelRoles: [{ id: "main", label: "Answering model", need: "balanced", reason: "answers must stay faithful to the retrieved text, which a mid-tier model does well" }],
  devKinds: LLM_DEV,
  benefitHint: "Time people no longer spend hunting for information. A library benchmark is offered.",
  benefit: (v) => ({ type: "timeSaved", basis: "benchmark", benchmarkId: "kb_ask", users: num(v, "users") }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "rag", "main");
    const convs = (num(v, "perDay") * WORKING_DAYS) / num(v, "turns");
    const queries = num(v, "users") * convs * num(v, "turns");
    searchCore(o, v, queries, true);
    const chat = o.add({
      kind: "chat", id: p(a, "chat"), label: "Question answering", users: num(v, "users"), conversationsPerUser: round(convs, 1), turns: num(v, "turns"), modelId: model,
      systemPromptTokens: 600, userTurnTokens: 100, assistantTurnTokens: 400, topK: num(v, "topK"), chunkTokens: 512, cacheHit: 0.4, reasoning: reasoningFor(a), ...dep(a),
    } as Workload);
    o.note("convs", "Conversations per user per month", round(convs, 1), "conversations", `Questions a day x ${WORKING_DAYS} working days / questions per conversation.`);
    o.field(chat, ["users"], "users", "people", YOU);
    o.field(chat, ["conversationsPerUser"], "conversations per user per month", "conversations", "Derived from questions a day.");
    o.field(chat, ["turns"], "questions per conversation", "questions", DEFAULTS);
    o.field(chat, ["topK"], "passages per question", "passages", DEFAULTS);
    o.field(chat, ["cacheHit"], "share of input served from cache", "share", "Sample default: the fixed instructions are cached between questions.");
    devActivities(o, rag, model);
    return o.finish({ users: num(v, "users"), monthlyItems: Math.round(queries), oneTimeItems: 0, unit: "questions", mainWorkloadId: p(a, "retrieval") });
  },
};

const search: Recipe = {
  id: "search", label: "Search only", needsHarness: false, batchable: false,
  description: "A search box over your documents with ranked results and no generated answers. Index, embeddings and queries only.",
  questions: [...SEARCH_QS(300, 4), q.toggle("semantic", "Use the semantic ranker", true, ["Re-ranks results for better relevance. It carries a fee per thousand queries.", "Yes for most knowledge bases.", DEFAULTS])],
  modelRoles: [],
  devKinds: [{ kind: "tooling", why: "Coding-assistant seats for the developers.", default: true }],
  benefitHint: "Time people no longer lose looking for documents.",
  benefit: (v) => ({ type: "timeSaved", basis: "perUser", users: num(v, "users"), baselineMinutes: 120, savedPct: 25 }),
  build(a) {
    const v = a.values, o = new Out(a);
    const queries = num(v, "users") * num(v, "perDay") * WORKING_DAYS;
    searchCore(o, v, queries, false);
    devActivities(o, search, "");
    return o.finish({ users: num(v, "users"), monthlyItems: Math.round(queries), oneTimeItems: 0, unit: "searches", mainWorkloadId: p(a, "retrieval") });
  },
};

const chat: Recipe = {
  id: "chat", label: "Chat assistant (no document search)", needsHarness: false, batchable: false,
  description: "A general assistant for a team: drafting, summarising, answering from the model's own knowledge. No search over your documents.",
  questions: [
    q.num("users", "Users", "people", 300, 1, 1_000_000, ["How many people use the assistant each month.", "300 staff.", YOU]),
    q.num("convs", "Conversations per user per month", "conversations", 20, 0.1, 1000, ["How many separate conversations an active user starts in a month.", "20 conversations, about one a working day.", YOU], 0.1),
    q.num("turns", "Messages in one conversation", "messages", 4, 1, 100, ["How many user messages make up one conversation. History grows with each one.", "4 messages.", DEFAULTS]),
    q.num("systemTokens", "Standing instructions length", "tokens", 600, 0, 50000, ["The fixed instructions sent with every conversation.", "600 tokens is about a page of guidelines.", DEFAULTS]),
  ],
  modelRoles: [{ id: "main", label: "Assistant model", need: "balanced", reason: "a general assistant is judged on everyday quality, which a mid-tier model delivers" }],
  devKinds: LLM_DEV,
  benefitHint: "Minutes each user saves per week on writing and summarising.",
  benefit: (v) => ({ type: "timeSaved", basis: "perUser", users: num(v, "users"), baselineMinutes: 90, savedPct: 20 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "chat", "main");
    const w = o.add({
      kind: "chat", id: p(a, "chat"), label: "Assistant conversations", users: num(v, "users"), conversationsPerUser: num(v, "convs"), turns: num(v, "turns"), modelId: model,
      systemPromptTokens: num(v, "systemTokens"), userTurnTokens: 100, assistantTurnTokens: 400, topK: 0, chunkTokens: 0, cacheHit: 0.4, reasoning: reasoningFor(a), ...dep(a),
    } as Workload);
    o.field(w, ["users"], "users", "people", YOU);
    o.field(w, ["conversationsPerUser"], "conversations per user per month", "conversations", YOU);
    o.field(w, ["turns"], "messages per conversation", "messages", DEFAULTS);
    o.field(w, ["userTurnTokens"], "tokens per user message", "tokens", "About 75 words per message (sample default).");
    o.field(w, ["assistantTurnTokens"], "tokens per reply", "tokens", "About 300 words per reply (sample default).");
    devActivities(o, chat, model);
    return o.finish({ users: num(v, "users"), monthlyItems: num(v, "users") * num(v, "convs"), oneTimeItems: 0, unit: "conversations", mainWorkloadId: w.id });
  },
};

const agentQs = (tasks: number): Question[] => [
  q.num("tasks", "Tasks per month", "tasks", tasks, 0, 100_000_000, ["How many jobs the agent completes each month. One task is one request taken through to a result.", "2,000 claims triaged a month.", YOU]),
  q.num("backlog", "Backlog to run once", "tasks", 0, 0, 100_000_000, ["Tasks already waiting that run once at go-live.", "10,000 old cases to work through.", YOU]),
];

const agent: Recipe = {
  id: "agent", label: "Single agent", needsHarness: true, batchable: false,
  description: "One agent works through tasks using tools: it plans, calls tools, reads the results and finishes. Adds an agent harness and its Dev Lab activities.",
  questions: [
    ...agentQs(2000),
    q.num("steps", "Steps per task", "steps", 6, 1, 100, ["How many reasoning and tool rounds an average task takes. Each round re-reads the history.", "6 steps for a typical lookup-and-answer task.", "Agent harness default; measure it from traces once you have a prototype."]),
    q.num("tools", "Tools the agent can use", "tools", 8, 0, 100, ["How many tools are described to the model on every call. Each description costs tokens.", "8 tools: search, a database, email and so on.", DEFAULTS]),
  ],
  modelRoles: [{ id: "main", label: "Agent model", need: "balanced", reason: "agents chain many steps, so reliable tool use matters more than raw size" }],
  devKinds: AGENT_DEV("Agents can be steered, so this is worth doing."),
  benefitHint: "Minutes a person spends on one task today.",
  benefit: () => ({ type: "timeSaved", basis: "perItem", baselineMinutes: 20, savedPct: 60 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "agent", "main");
    const h = agentHarness(a, "agent", `${a.label} agent`, { steps: num(v, "steps"), tools: num(v, "tools") });
    o.harnesses.push(h);
    o.workstreams.push({ id: p(a, "ws"), label: a.label, harnessIds: [h.id], featureId: a.featureId, evaluated: true });
    const w = o.add({ kind: "agent", id: p(a, "agent"), label: "Agent tasks", harnessId: h.id, modelId: model, tasksPerMonth: num(v, "tasks"), cacheHit: 0.8, toolFees: [], ...once(a, num(v, "backlog")), ...dep(a) } as Workload);
    o.field(w, ["tasksPerMonth"], "tasks a month", "tasks", YOU);
    o.field(w, ["oneTime", "volume"], "tasks in the backlog", "tasks", YOU);
    o.field(w, ["cacheHit"], "share of input served from cache", "share", "Agent loops re-send the same history, so most input is cached (sample default).");
    o.note("harness", "Agent harness", `${h.steps} steps, ${h.tools} tools`, "", "Default harness sizes, with your steps and tools. Edit the harness on the Run page.");
    devActivities(o, agent, model, [h.id], p(a, "ws"));
    return o.finish({ monthlyItems: num(v, "tasks"), oneTimeItems: num(v, "backlog"), unit: "tasks", mainWorkloadId: w.id });
  },
};

const multi: Recipe = {
  id: "multi", label: "Multi-agent system", needsHarness: true, batchable: false,
  description: "A planner agent splits each request and hands pieces to worker agents. Adds two harnesses and the Dev Lab activities for both.",
  questions: [
    ...agentQs(1000),
    q.num("workers", "Worker runs per task", "runs", 3, 1, 50, ["How many pieces the planner hands to workers for one task.", "3 workers: research, draft, check.", DEFAULTS]),
  ],
  modelRoles: [
    { id: "planner", label: "Planner model", need: "strong", reason: "the planner decides how to split the work, so mistakes here spoil every worker run" },
    { id: "worker", label: "Worker model", need: "balanced", reason: "workers do narrower jobs and run many times, so a mid-tier model keeps cost in check" },
  ],
  devKinds: AGENT_DEV("Several agents widen the attack surface."),
  benefitHint: "Minutes a person spends on one task today.",
  benefit: () => ({ type: "timeSaved", basis: "perItem", baselineMinutes: 45, savedPct: 60 }),
  build(a) {
    const v = a.values, o = new Out(a), planner = need(a, "multi", "planner"), worker = need(a, "multi", "worker");
    const hp = agentHarness(a, "planner", `${a.label} planner`, { steps: 4, tools: 4, outputPerStep: 400 });
    const hw = agentHarness(a, "worker", `${a.label} worker`, { steps: 8, tools: 10 });
    o.harnesses.push(hp, hw);
    o.workstreams.push({ id: p(a, "ws"), label: a.label, harnessIds: [hp.id, hw.id], featureId: a.featureId, evaluated: true });
    const wp = o.add({ kind: "agent", id: p(a, "planner"), label: "Planner tasks", harnessId: hp.id, modelId: planner, tasksPerMonth: num(v, "tasks"), cacheHit: 0.8, toolFees: [], ...once(a, num(v, "backlog")), ...dep(a) } as Workload);
    const ww = o.add({ kind: "agent", id: p(a, "worker"), label: "Worker runs", harnessId: hw.id, modelId: worker, tasksPerMonth: num(v, "tasks") * num(v, "workers"), cacheHit: 0.8, toolFees: [], ...once(a, num(v, "backlog") * num(v, "workers")), ...dep(a) } as Workload);
    o.field(wp, ["tasksPerMonth"], "planner tasks a month", "tasks", YOU);
    o.field(ww, ["tasksPerMonth"], "worker runs a month", "runs", "Tasks a month x worker runs per task.");
    o.field(wp, ["oneTime", "volume"], "planner tasks in the backlog", "tasks", YOU);
    o.field(ww, ["oneTime", "volume"], "worker runs in the backlog", "runs", "Backlog tasks x worker runs per task.");
    o.note("harness", "Agent harnesses", "planner (4 steps), worker (8 steps)", "", "Default harness sizes. Edit them on the Run page.");
    devActivities(o, multi, planner, [hp.id, hw.id], p(a, "ws"));
    return o.finish({ monthlyItems: num(v, "tasks"), oneTimeItems: num(v, "backlog"), unit: "tasks", mainWorkloadId: wp.id });
  },
};

// ---------------------------------------------------------------- spreadsheet analysis agent

/** Fixed sizes behind the spreadsheet recipe. Each is shown to the user as an editable assumption with its reasoning. */
export const SHEET = {
  /** o200k tokens per cell when a table is printed as text: a short value is about 2 tokens plus a separator. */
  cellTokens: 3,
  /** Tab name, row and column counts printed with each tab. */
  tabOverhead: 20,
  /** Rows and columns of the result table the code prints at the end. */
  resultRows: 20,
  resultCols: 6,
  /** An error traceback the interpreter prints when the code fails. */
  tracebackTokens: 400,
  /** Fix-and-rerun rounds a failing task needs on average. */
  fixRounds: 2,
  /** Code written per call: list the tabs, inspect them, the analysis itself, one fix. */
  listCode: 80, inspectCode: 150, analysisCode: 600, fixCode: 400,
  systemPrompt: 1500, userInput: 300, narrationPerStep: 80, finalOutput: 500,
} as const;

export interface SheetDerivation {
  tabsUsed: number;
  inspectRows: number;
  /** Tokens the tool returns on each kind of step. */
  schemaListing: number;
  inspect: number;
  resultTable: number;
  fixSteps: number;
  /** LLM calls for one typical task, and how many of them return tool output. */
  steps: number;
  toolSteps: number;
  /** Averages over the tool-returning steps, which is what the harness takes. */
  toolResultTokens: number;
  execOutputTokens: number;
  codeTokens: number;
  /** Raw totals behind those averages. */
  toolResultTotal: number;
  execOutputTotal: number;
  codeTotal: number;
}

/** From the workbook's size to the tokens each loop of the agent handles. Pure, so the stepper and the tests can reproduce it. */
export function deriveSpreadsheet(v: Values): SheetDerivation {
  const tabs = Math.max(1, num(v, "tabs")), rows = Math.max(1, num(v, "rows")), cols = Math.max(1, num(v, "cols"));
  const tabsUsed = Math.min(tabs, Math.max(1, num(v, "tabsUsed")));
  const inspectRows = v.readMode === "whole" ? rows : Math.min(rows, num(v, "sampleRows"));
  const { cellTokens: c, tabOverhead } = SHEET;
  const schemaListing = tabs * (cols * c + tabOverhead);
  const inspect = tabsUsed * ((inspectRows + 1) * cols * c + tabOverhead);
  const resultTable = (SHEET.resultRows + 1) * SHEET.resultCols * c;
  const fixSteps = Math.ceil((num(v, "failPct") / 100) * SHEET.fixRounds - 1e-9);
  // Calls: list the tabs, inspect them, write and run the analysis, any fixes, then the written answer.
  const steps = 4 + fixSteps;
  const toolSteps = steps - 1;
  const toolResultTotal = schemaListing + inspect + resultTable;
  const execOutputTotal = fixSteps * SHEET.tracebackTokens;
  const codeTotal = SHEET.listCode + SHEET.inspectCode + SHEET.analysisCode + fixSteps * SHEET.fixCode;
  return {
    tabsUsed, inspectRows, schemaListing, inspect, resultTable, fixSteps, steps, toolSteps,
    toolResultTokens: Math.round(toolResultTotal / toolSteps), execOutputTokens: Math.round(execOutputTotal / toolSteps), codeTokens: Math.round(codeTotal / toolSteps),
    toolResultTotal, execOutputTotal, codeTotal,
  };
}

const spreadsheet: Recipe = {
  id: "spreadsheet", label: "Spreadsheet analysis agent (writes and runs code)", needsHarness: true, batchable: false,
  description: "An agent opens a workbook, looks at its tabs, writes Python in a code interpreter, runs it, fixes errors and writes up the answer. Each loop re-sends everything so far. Adds an agent harness, with a step cap and token budget, and a code-interpreter session fee per task.",
  questions: [
    ...agentQs(500).map((x) => x.id === "tasks" ? { ...x, label: "Questions or reports per month" } : x),
    q.num("tabs", "Tabs in the workbook", "tabs", 10, 1, 200, ["How many sheets the workbook has. The agent lists all of them on its first step.", "10 tabs: one per region plus a summary.", YOU]),
    q.num("rows", "Rows per tab", "rows", 2000, 1, 5_000_000, ["Average data rows on a tab, not counting the header.", "2,000 rows of monthly transactions.", YOU]),
    q.num("cols", "Columns per tab", "columns", 12, 1, 500, ["Average number of columns on a tab.", "12 columns: date, account, region, amount and so on.", YOU]),
    q.num("tabsUsed", "Tabs one task actually reads", "tabs", 3, 1, 200, ["Most questions touch only a few tabs. The agent inspects those, not all of them.", "3 tabs for a regional variance report.", "Recipe default; replace it with what your questions need."]),
    q.choice("readMode", "How the agent reads a tab", [["sample", "A sample of rows, then code does the work"], ["whole", "Prints the whole tab into the conversation"]], "sample", ["A sample shows the layout and lets the code process every row without sending the rows to the model. Printing a whole tab puts every row in the history, and every later loop re-sends it.", "Sample for anything over a few hundred rows.", "Standard code-interpreter practice: inspect with head(), compute in code."]),
    q.num("sampleRows", "Rows shown in a sample", "rows", 5, 1, 1000, ["How many rows the agent prints per tab when it samples.", "5 rows, the default of a head() call.", "Recipe default (pandas head() shows 5)."]),
    q.num("failPct", "Share of tasks whose code fails first time", "percent", 30, 0, 100, ["Generated code often hits a missing column or a type error. Each failure costs a fix-and-rerun loop.", "30 means 3 tasks in 10 need a fix.", "Recipe default; measure it from traces once you have a prototype."]),
    q.num("maxSteps", "Maximum steps per task", "steps", 12, 1, 100, ["The most model calls the agent may make before it is stopped.", "12 steps allows about 7 more than a clean run.", "Recipe default; this is the loop cap in your agent harness."]),
    q.num("budget", "Token budget per task (0 for none)", "tokens", 150_000, 0, 10_000_000, ["Total tokens (input and output) one task may spend. The loop stops after the call that crosses it.", "150,000 tokens, a few dollars at most on a mid-size model.", "Recipe default; set it from the most you are willing to pay for one task."]),
  ],
  modelRoles: [{ id: "main", label: "Agent model", need: "balanced", reason: "writing correct analysis code and reading its output needs a capable model, but not the largest" }],
  devKinds: AGENT_DEV("Code-writing agents can be steered, so this is worth doing."),
  benefitHint: "Minutes an analyst spends on one question or report today.",
  benefit: () => ({ type: "timeSaved", basis: "perItem", baselineMinutes: 45, savedPct: 60 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "spreadsheet", "main");
    const d = deriveSpreadsheet(v);
    const budget = Math.round(num(v, "budget"));
    const h = agentHarness(a, "sheet", `${a.label} agent`, {
      systemPromptTokens: SHEET.systemPrompt, tools: 1, userInputTokens: SHEET.userInput, steps: d.steps, toolCallsPerStep: 1,
      toolResultTokens: d.toolResultTokens, outputPerStep: SHEET.narrationPerStep, finalOutputTokens: SHEET.finalOutput,
      maxTurns: Math.max(1, Math.round(num(v, "maxSteps"))), codeTokensPerStep: d.codeTokens, execOutputTokensPerStep: d.execOutputTokens,
      ...(budget > 0 ? { tokenBudget: budget } : {}),
    });
    o.harnesses.push(h);
    o.workstreams.push({ id: p(a, "ws"), label: a.label, harnessIds: [h.id], featureId: a.featureId, evaluated: true });
    const w = o.add({
      kind: "agent", id: p(a, "agent"), label: "Spreadsheet tasks", harnessId: h.id, modelId: model, tasksPerMonth: num(v, "tasks"), cacheHit: 0.8,
      toolFees: [{ unitPriceId: "code-interpreter", label: "Code interpreter session", perTask: 1 }], ...once(a, num(v, "backlog")), ...dep(a),
    } as Workload);
    o.field(w, ["tasksPerMonth"], "questions or reports a month", "tasks", YOU);
    o.field(w, ["oneTime", "volume"], "tasks in the backlog", "tasks", YOU);
    o.field(w, ["cacheHit"], "share of input served from cache", "share", "Each loop re-sends the same history, so most input is cached (sample default).");
    const hf = (id: string, label: string, value: number, unit: string, source: string, field: string) =>
      o.note(`harness.${id}`, `Agent harness: ${label}`, value, unit, source, { collection: "harnesses", id: h.id, field: [field] });
    hf("steps", "steps per task", d.steps, "steps", `4 calls (list the tabs, inspect, write and run the analysis, write the answer) plus ${d.fixSteps} fix-and-rerun call(s): ${num(v, "failPct")}% of tasks fail first time x ${SHEET.fixRounds} rounds on average, rounded up.`, "steps");
    hf("toolResult", "tool-result tokens per step", d.toolResultTokens, "tokens", `Average over ${d.toolSteps} tool steps of the schema listing (${d.schemaListing}), the inspection of ${d.tabsUsed} tab(s) (${d.inspect}) and the result table (${d.resultTable}), at ${SHEET.cellTokens} tokens a cell.`, "toolResultTokens");
    hf("code", "code tokens written per step", d.codeTokens, "tokens", `Average over ${d.toolSteps} steps of ${SHEET.listCode} (list), ${SHEET.inspectCode} (inspect), ${SHEET.analysisCode} (analysis) and ${SHEET.fixCode} per fix. Code is output, billed at the output rate, and stays in the history.`, "codeTokensPerStep");
    hf("exec", "execution-output tokens per step", d.execOutputTokens, "tokens", `${d.fixSteps} traceback(s) of about ${SHEET.tracebackTokens} tokens, averaged over ${d.toolSteps} tool steps.`, "execOutputTokensPerStep");
    hf("maxTurns", "maximum steps", h.maxTurns, "steps", YOU, "maxTurns");
    if (budget > 0) hf("budget", "token budget per task", budget, "tokens", YOU, "tokenBudget");
    o.note("sheet.session", "Code interpreter session per task", 1, "session", "One session per task, priced from the catalogue (Agent Service Code Interpreter, per session).");
    if (v.readMode === "whole") o.note("sheet.whole", "Whole-tab read", d.inspect, "tokens", `Printing every row of ${d.tabsUsed} tab(s) puts about ${d.inspect.toLocaleString("en-CA")} tokens in the history, which is more than most context windows. Sampling is almost always the better design.`);
    devActivities(o, spreadsheet, model, [h.id], p(a, "ws"));
    return o.finish({ monthlyItems: num(v, "tasks"), oneTimeItems: num(v, "backlog"), unit: "tasks", mainWorkloadId: w.id });
  },
};

const batchJobs: Recipe = {
  id: "batch", label: "Batch processing", needsHarness: false, batchable: true,
  description: "The same prompt runs over a large set of items: classify, tag, summarise or score. Nobody waits, so it can run on the cheaper Batch tier.",
  questions: [
    q.num("once", "Items to run once", "items", 100_000, 0, 1_000_000_000, ["The backlog you will process in one go.", "100,000 archived tickets.", YOU]),
    q.num("monthly", "New items each month", "items", 20_000, 0, 1_000_000_000, ["Items that arrive every month after go-live.", "20,000 tickets a month.", YOU]),
    q.num("inTokens", "Tokens in per item", "tokens", 1500, 1, 1_000_000, ["The item plus the instructions sent with it.", "1,500 tokens is about 900 words.", HEURISTICS]),
    q.num("outTokens", "Tokens out per item", "tokens", 300, 1, 100_000, ["What the model writes back for each item.", "300 tokens for a short summary.", DEFAULTS]),
  ],
  modelRoles: [{ id: "main", label: "Processing model", need: "light", reason: "a repeated, well-defined job rarely needs a large model, and volume makes price matter" }],
  devKinds: LLM_DEV,
  benefitHint: "Minutes a person would spend on one item by hand.",
  benefit: () => ({ type: "timeSaved", basis: "perItem", baselineMinutes: 3, savedPct: 80 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "batch", "main");
    const w = o.add({ kind: "llm", id: p(a, "run"), label: "Batch run", callsPerMonth: num(v, "monthly"), modelId: model, inputTokens: num(v, "inTokens"), cachedInputTokens: 0, outputTokens: num(v, "outTokens"), batchShare: batchOk(a) ? 1 : 0, reasoning: reasoningFor(a), ...once(a, num(v, "once")), ...dep(a) } as Workload);
    o.field(w, ["callsPerMonth"], "items a month", "items", YOU);
    o.field(w, ["oneTime", "volume"], "items in the backlog", "items", YOU);
    o.field(w, ["inputTokens"], "tokens in per item", "tokens", YOU);
    o.field(w, ["outputTokens"], "tokens out per item", "tokens", YOU);
    o.field(w, ["batchShare"], "share sent as Batch", "share", batchOk(a) ? "Batch is allowed and offered under your deployment." : "Batch is off or not offered under your deployment.");
    devActivities(o, batchJobs, model);
    return o.finish({ monthlyItems: num(v, "monthly"), oneTimeItems: num(v, "once"), unit: "items", mainWorkloadId: w.id });
  },
};

const email: Recipe = {
  id: "email", label: "Email triage", needsHarness: false, batchable: true,
  description: "Read incoming email and attachments, then classify and route each one. No agent unless you add one later.",
  questions: [
    q.num("monthly", "Emails per month", "emails", 20_000, 0, 1_000_000_000, ["How many emails reach the inbox each month.", "20,000 emails to a shared claims inbox.", YOU]),
    q.num("once", "Backlog to clear once", "emails", 0, 0, 1_000_000_000, ["Emails already waiting that run once at go-live.", "100,000 unread emails.", YOU]),
    q.num("attachShare", "Emails with attachments", "%", 25, 0, 100, ["The share of emails that carry attachments.", "25% means one email in four.", "Catalogue heuristic for business email."]),
    q.num("pages", "Pages per attachment", "pages", 5, 1, 500, ["The average attachment length.", "5 pages for a typical PDF.", "Catalogue heuristic for business email."]),
    q.toggle("overnight", "Triage can wait for an overnight batch", false, ["Whether sorting can happen hours later. If so the model calls run on the cheaper Batch tier.", "No for a claims inbox that people watch live.", YOU]),
  ],
  modelRoles: [{ id: "main", label: "Triage model", need: "light", reason: "sorting email into categories is a short, repeated job that a small model handles" }],
  devKinds: LLM_DEV.filter((k) => k.kind !== "synthetic"),
  benefitHint: "Minutes a person spends reading and routing one email.",
  benefit: () => ({ type: "timeSaved", basis: "perItem", baselineMinutes: 3, savedPct: 60 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "email", "main");
    const w = o.add({
      kind: "email", id: p(a, "mail"), label: "Inbound email", emailsPerMonth: num(v, "monthly"), bodyExtractorId: "cu-doc-minimal", attachmentExtractorId: "di-read",
      attachmentShare: num(v, "attachShare") / 100, attachmentsPerEmail: 1.5, pagesPerAttachment: num(v, "pages"), dedupe: 0.7,
      triage: { modelId: model, outputTokens: 60, reasoning: reasoningFor(a) }, ...(bool(v, "overnight") && batchOk(a) ? { tier: "batch" as ProcessingTier } : {}), ...once(a, num(v, "once")), ...dep(a),
    } as Workload);
    o.field(w, ["emailsPerMonth"], "emails a month", "emails", YOU);
    o.field(w, ["oneTime", "volume"], "emails in the backlog", "emails", YOU);
    o.field(w, ["attachmentShare"], "share with attachments", "share", YOU);
    o.field(w, ["pagesPerAttachment"], "pages per attachment", "pages", YOU);
    o.field(w, ["dedupe"], "attachments left after removing duplicates", "share", "Catalogue heuristic: signature images and repeated forwards are dropped.");
    devActivities(o, email, model);
    return o.finish({ monthlyItems: num(v, "monthly"), oneTimeItems: num(v, "once"), unit: "emails", mainWorkloadId: w.id });
  },
};

const voice: Recipe = {
  id: "voice", label: "Voice or call centre", needsHarness: false, batchable: false,
  description: "A real-time voice agent takes calls, with optional transcripts for quality review.",
  questions: [
    q.num("calls", "Calls per month", "calls", 5000, 0, 100_000_000, ["How many calls the voice agent handles each month.", "5,000 calls.", YOU]),
    q.num("minutes", "Minutes per call", "minutes", 5, 0.5, 120, ["The average call length.", "5 minutes.", YOU], 0.5),
    q.num("telephony", "Phone line cost per minute", "C$ per minute", 0.02, 0, 1, ["What the carrier or calling service charges per minute. Zero for web or app voice.", "C$0.02 a minute for a phone number through a calling service.", "Sample call-centre template; replace it with your carrier's rate."], 0.005),
    q.toggle("transcribe", "Transcribe calls for quality review", true, ["Adds a speech-to-text pass over every call so a team can review it.", "Yes for a regulated call centre.", YOU]),
  ],
  modelRoles: [{ id: "voice", label: "Voice model", need: "realtime", reason: "calls need a speech-to-speech model that answers in real time; the smaller one costs less per call" }],
  devKinds: LLM_DEV.filter((k) => k.kind !== "synthetic"),
  benefitHint: "Minutes of agent time each handled call would otherwise take.",
  benefit: (v) => ({ type: "timeSaved", basis: "perItem", baselineMinutes: Math.round(num(v, "minutes") + 2), savedPct: 50 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "voice", "voice");
    const w = o.add({
      kind: "voiceAgent", id: p(a, "voice"), label: "Voice agent", modelId: model, callsPerMonth: num(v, "calls"), minutesPerCall: num(v, "minutes"), turnsPerCall: Math.max(1, Math.round(num(v, "minutes") * 2.4)),
      agentTalkShare: 0.5, systemPromptTokens: 1500, cacheHit: 0.8, telephonyPerMinute: num(v, "telephony"), ...dep(a),
    } as Workload);
    o.field(w, ["callsPerMonth"], "calls a month", "calls", YOU);
    o.field(w, ["minutesPerCall"], "minutes per call", "minutes", YOU);
    o.field(w, ["turnsPerCall"], "turns per call", "turns", "About 2.4 turns a minute (sample default).");
    o.field(w, ["agentTalkShare"], "share of the call the agent speaks", "share", "Sample default: the agent and the caller split the call.");
    o.field(w, ["telephonyPerMinute"], "phone line cost per minute", "C$", YOU);
    if (bool(v, "transcribe")) {
      const t = o.add({ kind: "transcription", id: p(a, "transcripts"), label: "Call transcripts", hoursPerMonth: round((num(v, "calls") * num(v, "minutes")) / 60, 1), engineId: "speech-batch", diarize: true, ...dep(a) } as Workload);
      o.field(t, ["hoursPerMonth"], "audio hours a month", "hours", "Calls x minutes / 60.");
      o.field(t, ["engineId"], "speech engine", "engine", "Default batch transcription engine; change it here if you prefer another.");
    }
    devActivities(o, voice, "");
    return o.finish({ monthlyItems: num(v, "calls"), oneTimeItems: 0, unit: "calls", mainWorkloadId: w.id });
  },
};

const FN: Record<string, { id: string; label: string; hidden: number; out: (tokens: number) => number }> = {
  classify: { id: "sf-ai-classify", label: "Classify", hidden: 150, out: () => 10 },
  extract: { id: "sf-ai-extract", label: "Extract fields", hidden: 200, out: () => 100 },
  translate: { id: "sf-ai-translate", label: "Translate", hidden: 100, out: (t) => t },
};
const snowflake: Recipe = {
  id: "snowflake", label: "Snowflake Cortex analytics", needsHarness: false, batchable: false,
  description: "AI functions run over table rows inside Snowflake: classify, extract, translate, or free-form completion. Billed in AI credits plus warehouse time.",
  questions: [
    q.choice("task", "What it does to each row", [["classify", "Classify"], ["extract", "Extract fields"], ["translate", "Translate"], ["complete", "Free-form completion with a chosen model"]], "classify", ["The Cortex function that runs on every row. Completion lets you pick the model.", "Classify support tickets by topic.", YOU]),
    q.num("monthly", "Rows per month", "rows", 100_000, 0, 10_000_000_000, ["How many rows the function runs on each month.", "100,000 new tickets.", YOU]),
    q.num("once", "Rows to run once", "rows", 0, 0, 10_000_000_000, ["A backlog of rows processed once at go-live.", "2 million historic rows.", YOU]),
    q.num("tokens", "Tokens of text per row", "tokens", 300, 1, 1_000_000, ["How much text each row sends to the function.", "300 tokens is about 225 words.", HEURISTICS]),
    q.num("whHours", "Warehouse hours a month", "hours", 10, 0, 744, ["Hours the virtual warehouse runs to feed the function, at full volume.", "10 hours for a nightly job.", DEFAULTS]),
    q.choice("whSize", "Warehouse size", [["xs", "XS"], ["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"]], "m", ["The size of the warehouse that runs the query.", "M is a sensible middle size.", DEFAULTS]),
  ],
  modelRoles: [{ id: "sf", label: "Snowflake model", need: "snowflake", reason: "Cortex runs the model inside Snowflake; a small model is enough for per-row work", when: (v) => v.task === "complete" }],
  devKinds: [{ kind: "playground", why: "Ad-hoc calls while designing prompts.", default: false }, { kind: "tooling", why: "Coding-assistant seats for the developers.", default: true }],
  benefitHint: "Minutes an analyst would spend labelling or reading one row.",
  benefit: () => ({ type: "timeSaved", basis: "perItem", baselineMinutes: 2, savedPct: 80 }),
  build(a) {
    const v = a.values, o = new Out(a), wh = { size: str(v, "whSize") as "m", hoursPerMonth: num(v, "whHours") };
    let w: Workload;
    if (v.task === "complete") {
      const model = need(a, "snowflake", "sf");
      w = o.add({ kind: "snowflakeComplete", id: p(a, "cortex"), label: "Cortex completion", modelId: model, rowsPerMonth: num(v, "monthly"), inputTokens: num(v, "tokens"), outputTokens: 200, warehouse: wh, ...once(a, num(v, "once")) } as Workload);
      o.field(w, ["outputTokens"], "tokens out per row", "tokens", DEFAULTS);
      devActivities(o, snowflake, model);
    } else {
      const f = FN[str(v, "task")]!;
      w = o.add({ kind: "snowflakeFunction", id: p(a, "cortex"), label: `Cortex ${f.label.toLowerCase()}`, functionId: f.id, rowsPerMonth: num(v, "monthly"), tokensPerRow: num(v, "tokens"), hiddenPromptTokens: f.hidden, outputTokensPerRow: f.out(num(v, "tokens")), warehouse: wh, ...once(a, num(v, "once")) } as Workload);
      o.field(w, ["hiddenPromptTokens"], "hidden prompt tokens per row", "tokens", "Snowflake adds its own prompt on top of your text; this is the catalogue figure for the function.");
      o.field(w, ["outputTokensPerRow"], "tokens out per row", "tokens", DEFAULTS);
    }
    o.field(w, ["rowsPerMonth"], "rows a month", "rows", YOU);
    o.field(w, ["oneTime", "volume"], "rows run once", "rows", YOU);
    o.field(w, ["warehouse", "hoursPerMonth"], "warehouse hours a month", "hours", YOU);
    if (v.task !== "complete") devActivities(o, snowflake, "");
    return o.finish({ monthlyItems: num(v, "monthly"), oneTimeItems: num(v, "once"), unit: "rows", mainWorkloadId: w.id });
  },
};

const content: Recipe = {
  id: "content", label: "Content generation", needsHarness: false, batchable: true,
  description: "A model drafts articles, product descriptions, reports or emails from a brief. People review before anything goes out.",
  questions: [
    q.num("monthly", "Pieces per month", "pieces", 400, 0, 100_000_000, ["How many finished pieces you generate each month.", "400 product descriptions.", YOU]),
    q.num("once", "Pieces to generate once", "pieces", 0, 0, 100_000_000, ["A catalogue or backlog generated once at go-live.", "5,000 descriptions for the existing catalogue.", YOU]),
    q.num("inTokens", "Brief and context per piece", "tokens", 1500, 1, 1_000_000, ["Instructions, style guide and source facts sent for each piece.", "1,500 tokens is about a page of notes.", HEURISTICS]),
    q.num("outWords", "Words per piece", "words", 800, 10, 100000, ["The length of one finished piece.", "800 words for an article.", YOU]),
    q.num("drafts", "Drafts per piece", "drafts", 2, 1, 20, ["How many times a piece is generated before one is kept.", "2 drafts: first pass and a rewrite.", DEFAULTS], 0.5),
    q.toggle("overnight", "Generated in overnight runs", false, ["Whether pieces can wait until a scheduled run. If so they use the cheaper Batch tier.", "Yes for a catalogue refresh, no for drafts people wait on.", YOU]),
  ],
  modelRoles: [{ id: "main", label: "Writing model", need: "balanced", reason: "tone and accuracy show in finished writing, so a mid-tier model is the usual starting point" }],
  devKinds: LLM_DEV,
  benefitHint: "Minutes a writer would spend producing one piece from scratch.",
  benefit: (v) => ({ type: "timeSaved", basis: "perItem", baselineMinutes: Math.round(num(v, "outWords") / 8), savedPct: 50 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "content", "main");
    const out = Math.round(num(v, "outWords") * TOK_PER_WORD), drafts = num(v, "drafts");
    const w = o.add({
      kind: "llm", id: p(a, "gen"), label: "Content generation", callsPerMonth: Math.round(num(v, "monthly") * drafts), modelId: model, inputTokens: num(v, "inTokens"), cachedInputTokens: 0, outputTokens: out,
      batchShare: bool(v, "overnight") && batchOk(a) ? 1 : 0, reasoning: reasoningFor(a), ...once(a, num(v, "once") * drafts), ...dep(a),
    } as Workload);
    o.field(w, ["callsPerMonth"], "model calls a month", "calls", "Pieces a month x drafts per piece.");
    o.field(w, ["oneTime", "volume"], "model calls for the backlog", "calls", "Backlog pieces x drafts per piece.");
    o.field(w, ["inputTokens"], "tokens in per call", "tokens", YOU);
    o.field(w, ["outputTokens"], "tokens out per call", "tokens", `Words per piece x 1.33. ${HEURISTICS}`);
    devActivities(o, content, model);
    return o.finish({ monthlyItems: num(v, "monthly"), oneTimeItems: num(v, "once"), unit: "pieces", mainWorkloadId: w.id });
  },
};

const translation: Recipe = {
  id: "translation", label: "Translation", needsHarness: false, batchable: true,
  description: "Documents or messages are translated into one or more languages by a model. A backlog plus a monthly flow, billed per target language.",
  questions: [
    q.num("monthly", "Documents per month", "documents", 200, 0, 100_000_000, ["New documents translated each month.", "200 documents a month.", YOU]),
    q.num("once", "Backlog to translate once", "documents", 2000, 0, 100_000_000, ["Existing documents translated once at go-live.", "2,000 documents already waiting.", YOU]),
    q.num("words", "Words per document", "words", 1500, 1, 1_000_000, ["The average length of one document.", "1,500 words is about three pages.", YOU]),
    q.num("languages", "Target languages", "languages", 2, 1, 50, ["How many languages each document is translated into. Each one is a separate pass.", "2 for French and Spanish.", YOU]),
    q.toggle("overnight", "Translation can wait for an overnight batch", true, ["Whether documents can be translated hours later. If so they use the cheaper Batch tier.", "Yes for a document archive.", YOU]),
  ],
  modelRoles: [{ id: "main", label: "Translation model", need: "light", reason: "translation is well covered by small and mid-size models, and volume makes price matter" }],
  devKinds: LLM_DEV.filter((k) => k.kind !== "synthetic"),
  benefitHint: "Minutes a translator would spend on one document.",
  benefit: (v) => ({ type: "timeSaved", basis: "perItem", baselineMinutes: Math.round(num(v, "words") / 10), savedPct: 60 }),
  build(a) {
    const v = a.values, o = new Out(a), model = need(a, "translation", "main");
    const docTokens = Math.round(num(v, "words") * TOK_PER_WORD), piece = Math.min(docTokens, 3000);
    const callsPerDoc = Math.ceil(docTokens / 3000) * num(v, "languages");
    const w = o.add({
      kind: "llm", id: p(a, "translate"), label: "Translation", callsPerMonth: Math.round(num(v, "monthly") * callsPerDoc), modelId: model, inputTokens: piece + 300, cachedInputTokens: 0, outputTokens: piece,
      batchShare: bool(v, "overnight") && batchOk(a) ? 1 : 0, reasoning: "none", ...once(a, num(v, "once") * callsPerDoc), ...dep(a),
    } as Workload);
    o.note("callsPerDoc", "Model calls for one document", callsPerDoc, "calls", `${Math.ceil(docTokens / 3000)} piece(s) of up to 3,000 tokens x ${num(v, "languages")} language(s).`);
    o.field(w, ["callsPerMonth"], "calls a month", "calls", "Documents a month x calls per document.");
    o.field(w, ["oneTime", "volume"], "calls for the backlog", "calls", "Backlog documents x calls per document.");
    o.field(w, ["inputTokens"], "tokens in per call", "tokens", "A piece of the document plus 300 tokens of instructions.");
    devActivities(o, translation, model);
    return o.finish({ monthlyItems: num(v, "monthly"), oneTimeItems: num(v, "once"), unit: "documents", mainWorkloadId: w.id });
  },
};

const nonAi: Recipe = {
  id: "nonai", label: "Non-AI or hybrid (fixed costs and benefits)", needsHarness: false, batchable: false,
  description: "Costs and benefits that do not come from a model: a licence, a contractor, a platform fee. Use it alone or beside an AI recipe.",
  questions: [
    q.num("monthly", "Fixed cost per month", "C$", 0, 0, 100_000_000, ["A recurring cost such as a licence, hosting or a support contract.", "C$4,500 a month for a vendor platform.", YOU]),
    q.num("once", "One-time cost", "C$", 0, 0, 1_000_000_000, ["A cost paid once at go-live, such as set-up or a licence purchase.", "C$60,000 for implementation.", YOU]),
  ],
  modelRoles: [],
  devKinds: [],
  benefitHint: "Enter what the change saves or earns. Nothing here is scaled by AI adoption.",
  benefit: () => ({ type: "costAvoided", amountCad: 0, cadence: "monthly" }),
  build(a) {
    const v = a.values, o = new Out(a);
    const items: { id: string; label: string; amountCad: number; cadence: "monthly" | "once"; month?: number }[] = [];
    if (num(v, "monthly") > 0) items.push({ id: p(a, "monthly"), label: "Fixed monthly cost", amountCad: num(v, "monthly"), cadence: "monthly" });
    if (num(v, "once") > 0) items.push({ id: p(a, "once"), label: "One-time cost", amountCad: num(v, "once"), cadence: "once", month: GOLIVE(a) });
    if (items.length) {
      const w = o.add({ kind: "fixed", id: p(a, "fixed"), label: `${a.label} fixed costs`, group: "Non-AI", items } as Workload);
      o.note("monthly", "Fixed cost per month", num(v, "monthly"), "C$", YOU, { collection: "workloads", id: w.id, field: ["items", "0", "amountCad"] });
    }
    return o.finish({ monthlyItems: 0, oneTimeItems: 0, unit: "items" }, { workloadIds: [] });
  },
};

export const RECIPES: Recipe[] = [book, extraction, rag, search, chat, agent, multi, spreadsheet, batchJobs, email, voice, snowflake, content, translation, nonAi];
export const recipeById = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);
void batchQ;

// ---------------------------------------------------------------- models

export interface ModelChoice { id: string; label: string; vendor: string; inputPer1M: number; outputPer1M: number; batchOk: boolean; reasoning: boolean; note?: string }

const LADDER: Record<"azure" | "snowflake", string[][]> = {
  azure: [
    ["gpt-5.4-nano", "gpt-4.1-nano", "gpt-5-nano"],
    ["gpt-5.4-mini", "gpt-4.1-mini", "gpt-5-mini", "gpt-4o-mini"],
    ["gpt-5.4", "gpt-4.1", "gpt-5.2", "gpt-5", "gpt-4o"],
    ["gpt-5.5", "claude-opus-5-5", "claude-sonnet-5-5", "gpt-5.4"],
  ],
  snowflake: [["sf:llama3.1-8b"], ["sf:openai-gpt-5-mini", "sf:claude-haiku-4-5"], ["sf:openai-gpt-5.4", "sf:openai-gpt-5", "sf:claude-sonnet-5-5"], ["sf:claude-opus-5-5", "sf:claude-sonnet-5-5"]],
};
const RANK: Record<ModelNeed, number> = { light: 1, balanced: 2, strong: 3, snowflake: 1, realtime: 0 };
const QUALITY_SHIFT: Record<Quality, number> = { cost: -1, balanced: 0, quality: 1 };

const batchPossible = (m: ChatModel, d: AzureDeployment) => m.platform === "azure" && d !== "regional" && (m.batchDiscount > 0 || m.tiers?.batch !== undefined);
const usable = (m: ChatModel) => m.lifecycle.status === "ga" || m.lifecycle.status === "preview";

/** Whether the Batch tier exists for a deployment at all. */
export const batchOfferedUnder = (d: AzureDeployment): boolean => d !== "regional";

/** Models a recipe role can choose from under a deployment, cheapest first. Snowflake roles list Cortex models; the voice role lists real-time models. */
export function modelOptions(cat: Catalog, role: ModelRole, deployment: AzureDeployment, date = cat.meta.asOf): ModelChoice[] {
  if (role.need === "realtime") {
    return cat.realtimeModels.filter((m) => usable(m as unknown as ChatModel) && availableIn(m, deployment))
      .map((m) => ({ id: m.id, label: m.label, vendor: "openai", inputPer1M: m.text.input, outputPer1M: m.text.output, batchOk: false, reasoning: false, note: "Text prices shown; audio is priced separately." }))
      .sort((x, y) => x.inputPer1M - y.inputPer1M);
  }
  const snow = role.need === "snowflake";
  const book = new PriceBook(cat, { azureDeployment: deployment, snowflake: { routing: "global", edition: "enterprise" } });
  return cat.chatModels.filter((m) => (snow ? m.platform === "snowflake" : m.platform === "azure" && availableIn(m, deployment)) && usable(m))
    .map((m) => {
      let pr = { input: 0, output: 0 };
      try { pr = book.tokenPrices(m.id, date); } catch { /* unpriced entries sort first and show zero */ }
      return { id: m.id, label: m.label, vendor: m.vendor, inputPer1M: pr.input, outputPer1M: pr.output, batchOk: batchPossible(m, deployment), reasoning: m.reasoning === true };
    })
    .sort((x, y) => x.inputPer1M - y.inputPer1M);
}

/** The model to suggest for a role, with the reason in plain words. It is a suggestion only; nothing is preselected. */
export function recommendModel(cat: Catalog, role: ModelRole, o: { deployment: AzureDeployment; quality: Quality; batch: boolean }): { modelId: string; reason: string } | null {
  const options = modelOptions(cat, role, o.deployment);
  if (!options.length) return null;
  const ids = new Set(options.map((m) => m.id));
  let pick: ModelChoice | undefined;
  if (role.need === "realtime") {
    pick = options.find((m) => m.id === (o.quality === "quality" ? "gpt-realtime-2.1" : "gpt-realtime-2.1-mini")) ?? options[0];
  } else {
    const ladder = LADDER[role.need === "snowflake" ? "snowflake" : "azure"];
    const start = Math.max(0, Math.min(3, RANK[role.need] + QUALITY_SHIFT[o.quality]));
    const order = [start, ...Array.from({ length: 3 }, (_, i) => start - 1 - i), ...Array.from({ length: 3 }, (_, i) => start + 1 + i)].filter((r) => r >= 0 && r <= 3);
    const id = order.flatMap((r) => ladder[r]!).find((x) => ids.has(x));
    pick = options.find((m) => m.id === id) ?? options[0];
  }
  if (!pick) return null;
  const q = { cost: "You asked for lower cost, so this leans small.", balanced: "Quality and cost are balanced.", quality: "You asked for higher quality, so this leans large." }[o.quality];
  const price = pick.inputPer1M > 0 ? ` It costs C$${pick.inputPer1M.toFixed(2)} in and C$${pick.outputPer1M.toFixed(2)} out per million tokens.` : "";
  const platform = role.need === "snowflake" ? "Offered in Snowflake Cortex" : role.need === "realtime" ? `Offered as ${DEPLOYMENT_LABEL[o.deployment]}` : `Offered as ${DEPLOYMENT_LABEL[o.deployment]}`;
  const batch = o.batch && role.need !== "snowflake" && role.need !== "realtime" ? (pick.batchOk ? " Batch is available for it." : " Batch is not available for it here.") : "";
  return { modelId: pick.id, reason: `${role.label}: ${role.reason}. ${q} ${platform}.${price}${batch}` };
}

// ---------------------------------------------------------------- combining

export interface WizardSelection {
  recipeId: string;
  /** Feature name; defaults to the recipe label. */
  label?: string;
  values?: Values;
  models?: Record<string, string>;
  /** Run this feature somewhere other than the project's deployment. */
  deployment?: AzureDeployment;
  benefit?: BenefitInput;
}

export interface WizardInput {
  name: string;
  deployment: AzureDeployment;
  tier?: ProcessingTier;
  quality: Quality;
  batchAllowed: boolean;
  build: { people: number; months: number; architects?: number };
  devKinds: DevKind[];
  selections: WizardSelection[];
  /** Model for judges in Dev Lab; defaults to a small recommended one. */
  judgeModelId?: string;
}

/** A sensible team and build length for the features picked: bigger sets get more people and months. */
export function defaultBuild(recipeIds: string[]): { people: number; months: number } {
  const ai = recipeIds.filter((id) => id !== "nonai");
  const weight = ai.reduce((s, id) => s + (id === "multi" ? 2 : id === "agent" ? 1.5 : 1), 0);
  return { people: weight <= 2 ? 2 : weight <= 4 ? 3 : 4, months: Math.min(12, Math.max(2, Math.round(2 + weight * 1.5))) };
}

/** Dev Lab kinds ticked by default for the recipes chosen. */
export function defaultDevKinds(recipeIds: string[]): DevKind[] {
  return [...new Set(recipeIds.flatMap((id) => recipeById(id)?.devKinds.filter((k) => k.default).map((k) => k.kind) ?? []))];
}

/** Dev Lab kinds offered for the recipes chosen, each with the recipes that make it applicable. */
export function applicableDevKinds(recipeIds: string[]): { kind: DevKind; label: string; why: string; default: boolean }[] {
  const seen = new Map<DevKind, { kind: DevKind; label: string; why: string; default: boolean }>();
  for (const id of recipeIds) for (const k of recipeById(id)?.devKinds ?? []) {
    const prev = seen.get(k.kind);
    seen.set(k.kind, { kind: k.kind, label: ACTIVITY_KINDS.find((x) => x.kind === k.kind)!.label, why: prev?.why ?? k.why, default: (prev?.default ?? false) || k.default });
  }
  return [...seen.values()];
}

/** Model roles the selection still needs the user to pick (unpicked and required by the answers). */
export function missingModels(s: WizardSelection): ModelRole[] {
  const r = recipeById(s.recipeId);
  if (!r) return [];
  const values = withDefaults(r, s.values);
  return r.modelRoles.filter((m) => (m.when ? m.when(values) : true) && !s.models?.[m.id]);
}

export interface WizardResult { project: Project; assumptions: Assumption[]; features: { id: string; label: string; recipeId: string }[] }

/**
 * Turns the wizard's answers into a validated project. Throws `MissingChoice` when a needed model has not been picked.
 * Each selection becomes a feature; ids are prefixed with the feature id so combined recipes never collide.
 */
export function buildWizardProject(cat: Catalog, input: WizardInput): WizardResult {
  const p0 = blankProject(input.name.trim() || "New estimate");
  p0.settings.azureDeployment = input.deployment;
  if (input.tier) p0.settings.processingTier = input.tier;
  p0.timeline.buildMonths = Math.min(24, Math.max(1, Math.round(input.build.months)));
  p0.build.team = [
    { roleId: "dev", people: input.build.people, hoursPerMonth: 160, experiments: true },
    { roleId: "architect", people: input.build.architects ?? 0.5, hoursPerMonth: 160, experiments: false },
  ];
  const batch = input.batchAllowed && batchOfferedUnder(input.deployment);
  const light = recommendModel(cat, { id: "judge", label: "Judge", need: "light", reason: "judging is a short, repeated job" }, { deployment: input.deployment, quality: "balanced", batch });
  const judge = input.judgeModelId ?? light?.modelId ?? modelOptions(cat, { id: "judge", label: "Judge", need: "light", reason: "" }, input.deployment)[0]?.id;
  const taken = new Set<string>();
  const assumptions: Assumption[] = [];
  const features: WizardResult["features"] = [];
  const effortShare = 1 / Math.max(1, input.selections.filter((s) => s.recipeId !== "nonai").length);
  input.selections.forEach((sel, i) => {
    const r = recipeById(sel.recipeId);
    if (!r) throw new Error(`Unknown recipe "${sel.recipeId}"`);
    let fid = r.id, n = 1;
    while (taken.has(fid)) fid = `${r.id}-${++n}`;
    taken.add(fid);
    const label = sel.label?.trim() || (n > 1 ? `${r.label} ${n}` : r.label);
    const res = r.build({
      featureId: fid, label, values: withDefaults(r, sel.values), models: sel.models ?? {}, deployment: sel.deployment ?? input.deployment, projectDeployment: input.deployment,
      batch, quality: input.quality, judgeModelId: judge, dev: { kinds: input.devKinds, effortShare, buildMonths: p0.timeline.buildMonths, primary: i === 0 },
      benefit: sel.benefit ?? r.benefit(withDefaults(r, sel.values)), benchmarks: cat.benchmarks, rateCad: p0.rateCard.find((x) => x.id === "knowledgeWorker")?.hourlyRate,
    });
    p0.features.push({ ...res.feature, description: r.description });
    p0.workloads.push(...res.workloads);
    p0.harnesses.push(...res.harnesses);
    p0.build.workstreams.push(...res.workstreams);
    p0.build.activities.push(...res.activities);
    for (const c of res.capabilities) {
      if (!p0.rateCard.some((x) => x.id === c.roleId)) {
        const role = cat.benchmarks.roles.find((x) => x.id === c.roleId);
        if (role) p0.rateCard.push({ id: role.id, label: role.label, hourlyRate: role.hourlyRate });
      }
      p0.benefits.capabilities.push(c);
    }
    p0.benefits.avoidedCosts.push(...res.avoidedCosts);
    p0.benefits.oneOff.push(...res.oneOff);
    p0.benefits.value.push(...res.value);
    assumptions.push(...res.assumptions);
    features.push({ id: fid, label, recipeId: r.id });
  });
  assumptions.push(
    { id: "project-build-people", featureId: "", label: "Developers on the build", value: input.build.people, unit: "people", source: "Starting size for the features picked; change it on the Building it step." },
    { id: "project-build-months", featureId: "", label: "Build length", value: p0.timeline.buildMonths, unit: "months", source: "Starting length for the features picked; change it on the Building it step." },
    { id: "project-judge-model", featureId: "", label: "Judge model in Dev Lab", value: judge ?? "none", unit: "model", source: "A small recommended model for judging; change it on the Build page." },
  );
  return { project: ProjectSchema.parse(p0), assumptions, features };
}

/** Applies an edit from the review step to the project. Returns false when the target is gone. */
export function applyAssumption(p: Project, a: Assumption, value: number | string | boolean): boolean {
  const t = a.target;
  if (!t) return false;
  const lists = { workloads: p.workloads, harnesses: p.harnesses, activities: p.build.activities, capabilities: p.benefits.capabilities, value: p.benefits.value, avoidedCosts: p.benefits.avoidedCosts };
  const list = lists[t.collection] as unknown as Record<string, unknown>[];
  let cur: Record<string, unknown> | undefined = list.find((x) => x.id === t.id);
  if (!cur) return false;
  for (const k of t.field.slice(0, -1)) {
    const next: unknown = Array.isArray(cur) ? (cur as unknown[])[Number(k)] : cur[k];
    if (typeof next !== "object" || next === null) return false;
    cur = next as Record<string, unknown>;
  }
  const last = t.field.at(-1)!;
  if (Array.isArray(cur)) (cur as unknown[])[Number(last)] = value; else cur[last] = value;
  return true;
}
