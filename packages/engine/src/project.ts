import { z } from "zod";
import { ProcessingTier } from "@roi-calculator/catalog";

/** Project file schema (`*.aicost.json`). All money is CAD. */

const id = z.string().min(1);
const n0 = z.number().nonnegative();
const share = z.number().min(0).max(1);

/** Same shape as the harness's reasoning effort; billed as output tokens, only for models the catalogue marks as reasoning models. Defaults to "none" so existing saved projects don't silently change cost. */
const ReasoningSetting = z.union([z.enum(["none", "low", "medium", "high"]), n0]).default("none");
/** ISO 639-1 code into `heuristics.tokens.language`; absent means the project's (or English's) default. */
const LanguageSetting = z.string().optional();

export const HarnessSchema = z.object({
  id, label: z.string(),
  systemPromptTokens: n0, tools: z.number().int().nonnegative(), tokensPerTool: n0, userInputTokens: n0,
  steps: z.number().positive(), toolCallsPerStep: n0, toolResultTokens: n0, outputPerStep: n0, finalOutputTokens: n0,
  reasoning: z.union([z.enum(["none", "low", "medium", "high"]), n0]), keepReasoning: z.boolean(),
  maxTurns: z.number().int().positive(), maxTokensPerCall: z.number().int().positive(),
  compactAtTokens: n0, compactSummaryTokens: n0, retryRate: share,
  /** Total tokens (input plus output) one task may spend before the loop stops. Absent or 0 means no budget. */
  tokenBudget: n0.optional(),
  /** Code the model writes on each step, billed as output and kept in the history. Absent means 0 (a plain tool caller). */
  codeTokensPerStep: n0.optional(),
  /** What running that code prints back (stdout, tracebacks), added to the history on each step. Absent means 0. */
  execOutputTokensPerStep: n0.optional(),
});

/** Optional workstream the activity belongs to; absent means project-wide. `featureId` is for an activity with no workstream that still belongs to one feature (a workstream's own feature wins). */
const Scope = { workstreamId: id.optional(), featureId: id.optional() };
/**
 * Optional hand-typed cost for single months: build month (as a string, "1" is the first) to CAD. A month present here replaces
 * the calculated cost of this activity for that month; a month absent uses the calculation. See devlab.ts.
 */
const Overrides = { monthlyOverrideCad: z.record(z.string().regex(/^[1-9]\d*$/), n0).optional() };
const Window = { fromMonth: z.number().int().positive().default(1), toMonth: z.number().int().positive().optional() };

export const DevActivitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bakeoff"), id, label: z.string(), ...Scope, ...Overrides, harnessId: id,
    candidates: z.array(z.object({ modelId: id, ...Window })),
    cases: z.number().int().positive(), repeats: z.number().int().positive(),
    /** Sweeps per month; the last value repeats for later months. */
    sweepsPerMonth: z.array(n0).min(1), cacheHit: share, batchShare: share,
  }),
  z.object({
    kind: z.literal("iterations"), id, label: z.string(), ...Scope, ...Overrides, harnessId: id, modelId: id,
    runsPerDevPerDay: n0, subsetCases: z.number().int().positive(), workingDays: n0, cacheHit: share,
    /** Intensity per month (1 = full); last value repeats. */
    monthFactors: z.array(n0).default([1]),
  }),
  z.object({
    kind: z.literal("regression"), id, label: z.string(), ...Scope, ...Overrides, harnessId: id, modelIds: z.array(id).min(1),
    runsPerMonth: n0, cases: z.number().int().positive(), cacheHit: share, batchShare: share, ...Window,
    /** Intensity per month (1 = full); last value repeats. */
    monthFactors: z.array(n0).default([1]),
  }),
  z.object({
    kind: z.literal("evaluation"), id, label: z.string(), ...Scope, ...Overrides, judgeModelId: id, evaluators: z.array(z.string()),
    queryTokens: n0, contextTokens: n0, responseTokens: n0,
    /** Share of the runs from other activities that are scored. An absent kind is not scored: nothing is assumed about activities the project does not have. */
    scoredShare: z.object({ bakeoff: share.default(0), iterations: share.default(0), regression: share.default(0) }).default({}),
    safetyEvaluators: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("redteam"), id, label: z.string(), ...Scope, ...Overrides, targetModelId: id, scansPerMonth: n0,
    categories: z.number().int().positive(), objectivesPerCategory: z.number().int().positive(), strategies: z.number().int().nonnegative(),
    multiTurnShare: share, ...Window,
    /** Intensity per month (1 = full); last value repeats. */
    monthFactors: z.array(n0).default([1]),
  }),
  z.object({
    kind: z.literal("playground"), id, label: z.string(), ...Scope, ...Overrides, modelId: id,
    callsPerDevPerDay: n0, inputTokens: n0, outputTokens: n0, workingDays: n0, reasoning: ReasoningSetting,
    /** Intensity per month (1 = full); last value repeats. */
    monthFactors: z.array(n0).default([1]),
  }),
  z.object({
    /** Synthetic test or training data: generate, then keep what a judge model accepts. */
    kind: z.literal("synthetic"), id, label: z.string(), ...Scope, ...Overrides,
    generatorModelId: id, acceptedPerMonth: n0, passRate: z.number().min(0.01).max(1),
    genInputTokens: n0, genOutputTokens: n0, reasoning: ReasoningSetting,
    /** Optional judge pass that filters the generated examples. */
    judgeModelId: id.optional(), judgeInputTokens: n0, judgeOutputTokens: n0,
    batchShare: share,
    monthFactors: z.array(n0).default([1]),
  }),
  z.object({
    /** Fine-tuning runs (training priced per 1M tokens, or per hour for reinforcement fine-tuning) and hosting of the tuned deployments. */
    kind: z.literal("finetune"), id, label: z.string(), ...Scope, ...Overrides,
    trainingPriceId: id, runsPerMonth: n0,
    examples: n0, tokensPerExample: n0, epochs: z.number().int().positive(),
    hoursPerRun: n0,
    deployments: n0, hostingHoursPerMonth: n0,
    monthFactors: z.array(n0).default([1]),
  }),
  z.object({
    kind: z.literal("tooling"), id, label: z.string(), ...Scope, ...Overrides,
    copilotSeatsPerDev: n0, copilotPlan: z.enum(["copilot-business", "copilot-enterprise"]),
    codingModelId: id, codingTokensPerDevPerDay: z.object({ input: n0, cachedInput: n0, output: n0 }), workingDays: n0,
    /** Intensity per month (1 = full); last value repeats. */
    monthFactors: z.array(n0).default([1]),
  }),
]);
export type DevActivity = z.infer<typeof DevActivitySchema>;
export type Workstream = z.infer<typeof WorkstreamSchema>;

/** A fixed or metered catalogue item: quantity of unitPriceId per month. */
export const CatalogItemSchema = z.object({ id, label: z.string(), unitPriceId: id, quantity: n0 });
/**
 * A free-text cost with no catalogue price: a CAD amount a month, or once. `month` is the project
 * month a one-time amount lands in (defaults to the first month of the workload, or of the build for the dev environment).
 */
export const CashItemSchema = z.object({ id, label: z.string(), amountCad: n0, cadence: z.enum(["monthly", "once"]).default("monthly"), month: z.number().int().positive().optional() });
export const FixedItemSchema = z.union([CatalogItemSchema, CashItemSchema]);
export type FixedItem = z.infer<typeof FixedItemSchema>;
export type CashItem = z.infer<typeof CashItemSchema>;
export const isCashItem = (it: FixedItem): it is CashItem => "amountCad" in it;

/** A Snowflake virtual warehouse: size and running hours per month at full volume. */
export const Warehouse = z.object({ size: z.enum(["xs", "s", "m", "l", "xl"]), hoursPerMonth: n0 });

/** A workload's own Azure deployment; absent = the project's default (Settings). */
const deployment = z.enum(["global", "regional", "dataZone"]).optional();
/** A workload's own processing tier; absent = the project's default (Settings, itself defaulting to Standard). */
const tier = ProcessingTier.optional();

/**
 * Fields every workload shares. Timing is in project months and defaults to go-live and the project's adoption ramp:
 * `startMonth`/`endMonth` bound when it bills (months before go-live count as go-live), `rampMonths` is its own ramp
 * to full volume, `oneTime` is a volume (in the units of its main monthly field) billed once in `month`.
 */
const Common = {
  featureId: id.optional(),
  startMonth: z.number().int().positive().optional(),
  endMonth: z.number().int().positive().optional(),
  rampMonths: z.number().int().min(0).max(24).optional(),
  oneTime: z.object({ volume: n0, month: z.number().int().positive().optional() }).optional(),
};

/**
 * Optional extras for chat and llm workloads. `resendShare` is the share of calls sent a second time after a 429 or a
 * timeout (billed again in full); absent means 0. `promptShields` adds Azure Content Safety Prompt Shields per request
 * when the catalogue has a price for it.
 */
const Resilience = { resendShare: share.optional(), promptShields: z.boolean().optional() };

/**
 * A fee for a built-in tool a model calls (web search, file search, code interpreter, computer use). Either a catalogue
 * price (`unitPriceId`) or your own price per 1,000 calls (`cadPer1KCalls`) when the catalogue has no verified one.
 * `perTask` is calls per agent task, or per chat turn.
 */
export const ToolFeeSchema = z.object({
  unitPriceId: id.optional(), label: z.string().optional(), cadPer1KCalls: n0.optional(), perTask: n0,
}).refine((f) => f.unitPriceId !== undefined || f.cadPer1KCalls !== undefined, { message: "A tool fee needs a catalogue price or your own price per 1,000 calls" });
export type ToolFee = z.infer<typeof ToolFeeSchema>;

/** Image input for a vision-capable model: images attached to each call (or chat turn), at a size and detail level. Tokens come from the model's documented formula (see images.ts). */
export const ImageInputSchema = z.object({
  perCall: n0, widthPx: z.number().int().positive(), heightPx: z.number().int().positive(), detail: z.enum(["low", "high"]).default("high"),
});
export type ImageInput = z.infer<typeof ImageInputSchema>;

/**
 * Provisioned throughput (PTU) for a workload's main model: a reserved base plus pay-as-you-go spillover. `ptus` absent
 * means sized for the peak (average x peak-to-average factor). `spilloverShare` absent means the share of average load
 * above the reserved capacity. The price is the workload's own deployment (Global, Data Zone or Regional).
 */
export const PtuSettingSchema = z.object({
  ptus: z.number().int().positive().optional(),
  term: z.enum(["hourly", "monthly", "yearly"]).default("monthly"),
  spilloverShare: share.optional(),
});
export type PtuSetting = z.infer<typeof PtuSettingSchema>;

/** Capacity options for chat, llm and agent workloads. All absent = pay-as-you-go with no quota check. */
const Capacity = {
  ptu: PtuSettingSchema.optional(),
  /** Stay pay-as-you-go even when the project's pricing model is PTU. Ignored when `ptu` is set. */
  payg: z.boolean().optional(),
  tpmQuota: n0.optional(),
};

/**
 * One line of a hosting stack. `fixed`: a catalogue quantity a month. `perRequests`: catalogue units per 1,000 requests
 * (monitoring, egress, gateway calls), so it follows volume. `cash`: your own CAD a month where the catalogue has no verified price.
 */
export const HostingItemSchema = z.discriminatedUnion("basis", [
  z.object({ basis: z.literal("fixed"), id, label: z.string(), unitPriceId: id, quantity: n0 }),
  z.object({ basis: z.literal("perRequests"), id, label: z.string(), unitPriceId: id, unitsPer1KRequests: n0 }),
  z.object({ basis: z.literal("cash"), id, label: z.string(), amountCad: n0, note: z.string().optional() }),
]);
export type HostingItem = z.infer<typeof HostingItemSchema>;

export const WorkloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("transcription"), id, label: z.string(), ...Common, deployment, tier, hoursPerMonth: n0, engineId: id, diarize: z.boolean(),
    summary: z.object({ modelId: id, outputTokens: n0, reasoning: ReasoningSetting }).optional(),
  }),
  z.object({
    kind: z.literal("documents"), id, label: z.string(), ...Common, deployment, tier, pagesPerMonth: n0,
    pageType: z.enum(["plain", "dense", "slide", "spreadsheet"]),
    route: z.discriminatedUnion("type", [
      z.object({ type: z.literal("extract"), extractorId: id, addOnIds: z.array(id).default([]) }),
      /** `outputTokens`: per-page output (extracted fields/summary); 0 kept the old (undercounted) behaviour. */
      z.object({ type: z.literal("direct"), modelId: id, outputTokens: n0.default(50) }),
    ]),
    /** Pictures embedded in the pages (`perCall` is images per page). Billed as image input on the direct route, on top of the page itself. */
    images: ImageInputSchema.optional(),
    enrich: z.object({ modelId: id, pagesPerDoc: z.number().positive(), outputTokensPerDoc: n0, reasoning: ReasoningSetting }).optional(),
    /** Snowflake virtual warehouse that runs AI_PARSE_DOCUMENT (platform credits). */
    warehouse: Warehouse.optional(),
  }),
  z.object({
    kind: z.literal("email"), id, label: z.string(), ...Common, deployment, tier, emailsPerMonth: n0, bodyExtractorId: id, attachmentExtractorId: id,
    attachmentShare: share, attachmentsPerEmail: n0, pagesPerAttachment: n0, dedupe: share,
    triage: z.object({ modelId: id, outputTokens: n0, reasoning: ReasoningSetting }).optional(),
  }),
  z.object({ kind: z.literal("embeddings"), id, label: z.string(), ...Common, deployment, tier, tokensPerMonth: n0, modelId: id }),
  z.object({
    kind: z.literal("aiSearch"), id, label: z.string(), ...Common, tier: z.enum(["basic", "s1", "s2", "s3", "s3hd", "l1", "l2"]).optional(),
    chunks: n0, embeddingModelId: id, bytesPerDim: z.number().positive(), chunkTokens: n0, replicas: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("retrieval"), id, label: z.string(), ...Common, deployment, tier, queriesPerMonth: n0, semanticShare: share,
    rerankerId: id.optional(), agentic: z.object({ subqueries: n0, chunksPerSubquery: n0, tokensPerChunk: n0, plannerModelId: id, reasoning: ReasoningSetting }).optional(),
  }),
  z.object({
    kind: z.literal("chat"), id, label: z.string(), ...Common, deployment, tier, users: n0, conversationsPerUser: n0, turns: z.number().positive(), modelId: id,
    systemPromptTokens: n0, userTurnTokens: n0, assistantTurnTokens: n0, topK: n0, chunkTokens: n0, cacheHit: share,
    reasoning: ReasoningSetting, language: LanguageSetting,
    /** Share of turns routed to a cheaper model. */
    router: z.object({ modelId: id, share }).optional(),
    ...Resilience,
    /** Tool calls per turn, and images attached per turn. */
    toolFees: z.array(ToolFeeSchema).optional(), images: ImageInputSchema.optional(),
    ...Capacity,
  }),
  z.object({
    kind: z.literal("agent"), id, label: z.string(), ...Common, deployment, tier, harnessId: id, modelId: id, tasksPerMonth: n0, cacheHit: share,
    toolFees: z.array(ToolFeeSchema).default([]),
    ...Capacity,
  }),
  z.object({
    kind: z.literal("continuousEval"), id, label: z.string(), ...Common, deployment, tier, interactionsPerMonth: n0, sampleShare: share, judgeModelId: id,
    evaluators: z.array(z.string()), contextTokens: n0, responseTokens: n0, safetyEvaluators: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal("contentSafety"), id, label: z.string(), ...Common, requestsPerMonth: n0, charsPerRequest: n0, unitPriceIds: z.array(id) }),
  z.object({
    kind: z.literal("llm"), id, label: z.string(), ...Common, deployment, tier, callsPerMonth: n0, modelId: id,
    inputTokens: n0, cachedInputTokens: n0, outputTokens: n0, batchShare: share,
    reasoning: ReasoningSetting, language: LanguageSetting,
    ...Resilience,
    images: ImageInputSchema.optional(),
    ...Capacity,
  }),
  z.object({ kind: z.literal("fixed"), id, label: z.string(), ...Common, group: z.string(), items: z.array(FixedItemSchema) }),
  z.object({
    /** Hosting and platform stack (Cosmos DB, App Service, AKS, Container Apps, APIM, monitoring, egress, Defender) with volume-driven items. */
    kind: z.literal("hosting"), id, label: z.string(), ...Common,
    /** Requests a month that per-request items scale with; `volumeFrom` takes it from another workload instead. */
    requestsPerMonth: n0, volumeFrom: id.optional(), items: z.array(HostingItemSchema),
  }),
  z.object({
    kind: z.literal("voiceAgent"), id, label: z.string(), ...Common, deployment, tier, modelId: id, callsPerMonth: n0, minutesPerCall: z.number().positive(),
    turnsPerCall: z.number().int().positive(), agentTalkShare: share, systemPromptTokens: n0, cacheHit: share,
    /** Phone or ACS calling cost per minute in CAD (0 for web/app voice). */
    telephonyPerMinute: n0,
  }),
  z.object({
    kind: z.literal("snowflakeComplete"), id, label: z.string(), ...Common, modelId: id, rowsPerMonth: n0,
    inputTokens: n0, outputTokens: n0, warehouse: Warehouse,
  }),
  z.object({
    kind: z.literal("snowflakeFunction"), id, label: z.string(), ...Common, functionId: id, rowsPerMonth: n0,
    /** Billed tokens per row: your text plus labels/examples; the function's hidden prompt is added on top. */
    tokensPerRow: n0, hiddenPromptTokens: n0, outputTokensPerRow: n0, warehouse: Warehouse,
  }),
  z.object({
    kind: z.literal("cortexSearch"), id, label: z.string(), ...Common, rows: n0, vectorColumns: z.number().int().positive(),
    embeddingModelId: id, avgRowBytes: n0, tokensPerRow: n0, changedShareMonthly: share, warehouse: Warehouse,
  }),
]);
export type Workload = z.infer<typeof WorkloadSchema>;

const pct = z.number().min(0).max(100);

/**
 * A time-saving capability. `driver` decides how hours are worked out:
 * - hours (default): `hoursSavedPerMonth` is the net saving at full rollout; presets, adoption and realisation do not apply.
 * - perTask: users × adoption × tasks per user per day × working days × minutes saved per task.
 * - perUserWeek: users × adoption × minutes saved per active user per week (less what an existing licence already delivers).
 * - perVolume: items per month × share handled × minutes saved per item (a queue, so adoption does not apply).
 * Benchmark-driven savings come per preset; gross hours × realisation = net hours valued at the role's rate.
 */
export const CapabilitySchema = z.object({
  id, label: z.string(), roleId: id,
  /** The feature this capability's benefit belongs to. */
  featureId: id.optional(),
  /** Workloads and workstreams this capability uses, for cost allocation (ids are checked against the project). */
  workloadIds: z.array(id).default([]),
  workstreamIds: z.array(id).default([]),
  hoursSavedPerMonth: n0,
  driver: z.enum(["hours", "perTask", "perUserWeek", "perVolume"]).optional(),
  benchmarkId: id.optional(),
  users: n0.optional(), tasksPerUserPerDay: n0.optional(),
  /** Take users (or items, for a queue) from this workload instead of entering them again. */
  volumeFrom: id.optional(),
  itemsPerMonth: n0.optional(), handledPct: pct.optional(),
  baselineMinutes: n0.optional(),
  savings: z.object({ conservative: n0, typical: n0, optimistic: n0 }).optional(),
  unit: z.enum(["minutes", "pct"]).optional(),
  licenceOverlap: share.optional(),
  /** Overrides of the preset (or project) adoption and realisation, in percent. */
  adoptionPct: pct.optional(), realisationPct: pct.optional(),
  /** Project month this capability goes live (defaults to go-live); its adoption ramp starts then. */
  liveFromMonth: z.number().int().positive().optional(),
  /** How sure you are the benefit will arrive, in percent. The benefit counts at this share; absent means 100. */
  confidencePct: pct.optional(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

/**
 * A benefit that is not time saved, worked out in CAD per month at full rollout:
 * - revenue: extra sales (`monthlyRevenue`) × the margin you keep (`marginPct`, default 100).
 * - quality: errors avoided = volume × (error rate before − after) × cost per error. Volume is entered or taken from a workload.
 * - risk: expected loss avoided = events per year × impact per event × share of them the solution prevents ÷ 12.
 * Revenue and quality follow the adoption ramp and usage growth unless `ramp` is false; risk follows the ramp only.
 * `capabilityId` attributes the value to a capability in the ROI by capability view.
 */
export const ValueItemSchema = z.object({
  id, label: z.string(), kind: z.enum(["revenue", "quality", "risk"]),
  capabilityId: id.optional(), featureId: id.optional(),
  monthlyRevenue: n0.optional(), marginPct: pct.optional(),
  volumePerMonth: n0.optional(), volumeFrom: id.optional(), errorRateBeforePct: pct.optional(), errorRateAfterPct: pct.optional(), costPerError: n0.optional(),
  eventsPerYear: n0.optional(), impactCad: n0.optional(), reductionPct: pct.optional(),
  startMonth: z.number().int().positive().optional(),
  ramp: z.boolean().optional(),
  confidencePct: pct.optional(),
});
export type ValueItem = z.infer<typeof ValueItemSchema>;

export const RoleSchema = z.object({ id, label: z.string(), hourlyRate: n0 });
/** `experiments`: these people run AI Dev Lab experiments (drives per-developer activity volumes). */
/** A share of a team line's time on one workstream, optionally for some build months only. */
export const AllocationSchema = z.object({ workstreamId: id, share, fromMonth: z.number().int().positive().optional(), toMonth: z.number().int().positive().optional() });

/**
 * A feature (one or more agents) built as a unit. Effort-driven Dev Lab activities in it scale
 * with the people allocated to it; artefact-driven ones (bake-off, regression, red team) run
 * once for it. A component shared by several features is its own workstream. Capabilities link
 * to workstreams through their componentIds, which carries build cost into per-capability ROI.
 */
export const WorkstreamSchema = z.object({
  id, label: z.string(), harnessIds: z.array(id).default([]),
  featureId: id.optional(),
  /** When false, no evaluation activity scores this workstream's runs. */
  evaluated: z.boolean().default(true),
});

export const TeamLineSchema = z.object({
  roleId: id, people: n0, hoursPerMonth: n0, experiments: z.boolean().default(false),
  /** A named seat ("Priya", "Dev A"); unnamed lines are role counts. */
  name: z.string().optional(),
  /** Shares of this line's time per workstream; the rest is project-wide work. */
  allocations: z.array(AllocationSchema).optional(),
  /** Delivery phase name and the build months it covers (defaults to the whole build). */
  phase: z.string().optional(),
  fromMonth: z.number().int().positive().optional(),
  toMonth: z.number().int().positive().optional(),
  /** When false, this build line is not costed (the person already exists) but still drives Dev Lab volumes. Absent means costed. */
  costed: z.boolean().optional(),
  /** Hourly rate (CAD) for this line only; absent means the role's rate-card rate. */
  rateOverride: z.number().min(0).optional(),
});

/** A what-if: edits applied to a copy of the project. Arrays in a path are addressed by element id. */
export const ScenarioEditSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set"), path: z.array(z.union([z.string(), z.number()])).min(1), value: z.unknown() }),
  z.object({ kind: z.literal("lever"), leverId: id }),
  z.object({ kind: z.literal("scaleUsage"), factor: z.number().positive() }),
]);
export const ScenarioSchema = z.object({ id, label: z.string(), edits: z.array(ScenarioEditSchema) });
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioEdit = z.infer<typeof ScenarioEditSchema>;

/** Bump when the project shape changes; add a step in migrate.ts for every bump. */
export const CURRENT_PROJECT_VERSION = 6;

/**
 * A feature: the unit an executive funds. It owns workloads (run), workstreams and Dev Lab activities (build)
 * and benefit capabilities, each pointing at it with `featureId`. Items with no `featureId` are shared by the project.
 */
export const PROJECT_TYPES = ["newApp", "enhancement", "automation", "replatform", "saas", "ai"] as const;
export const ProjectTypeSchema = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;
/** `types` is the kind of change a feature is; empty means not chosen yet (nothing is preselected). */
export const FeatureSchema = z.object({ id, label: z.string(), description: z.string().optional(), types: z.array(ProjectTypeSchema).default([]) });
export type Feature = z.infer<typeof FeatureSchema>;

/** Schema id written into every project file. The product was renamed from "AI Cost & ROI Studio" on 2026-10-06. */
export const PROJECT_SCHEMA_ID = "roi-calculator/project";
/** The id files carried before the rename. Accepted on load (see migrate.ts) and never written. */
export const LEGACY_PROJECT_SCHEMA_ID = "ai-cost-roi-studio/project";

/**
 * A catalogue resource (a VM, an App Service plan) the project runs in production. Priced at 730 hours a month in the
 * production months until environments arrive (A6). `envIds` is kept for A6 and ignored for now.
 */
export const ResourceSchema = z.object({
  id, label: z.string(),
  featureId: id.optional(),
  typeId: id, skuId: id,
  /** Values for the resource type's inputs, by input id (for example `count`). A missing input counts as 0. */
  inputs: z.record(n0).default({}),
  /** Pricing term: pay-as-you-go, or a 1- or 3-year reservation. */
  term: z.enum(["payg", "ri1", "ri3"]).default("payg"),
  /** Azure Hybrid Benefit: bring an existing Windows or SQL licence. */
  ahb: z.boolean().default(false),
  envIds: z.array(id).optional(),
});
export type Resource = z.infer<typeof ResourceSchema>;

/**
 * One line of what the work costs today. Each can be kept, reduced or retired; the saving is the part that goes away.
 * `basis`: a monthly amount, people (FTE x hours x the role's rate, escalating with pay) or a per-transaction cost x volume.
 * `change.fromMonth` is a plan month (1 is the first build month); absent means go-live.
 * `decommission`: a saving that depends on something happening (a lease ended, a system switched off). Counted only when `assumed` is true.
 */
export const CurrentLineSchema = z.object({
  id, label: z.string(),
  category: z.enum(["people", "licence", "infrastructure", "transaction", "contract", "other"]),
  featureId: id.optional(),
  /** How sure you are of the cost and the saving, in percent; absent means 100. */
  confidencePct: pct.optional(),
  basis: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("monthly"), amountCad: n0 }),
    z.object({ kind: z.literal("fte"), roleId: id, fte: n0, hoursPerMonth: n0 }),
    z.object({ kind: z.literal("perTransaction"), unitCostCad: n0, volumePerMonth: n0.optional(), volumeFrom: id.optional() }),
  ]),
  change: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("keep") }),
    z.object({ mode: z.literal("reduce"), pct, fromMonth: z.number().int().positive().optional(), followsAdoption: z.boolean() }),
    z.object({ mode: z.literal("retire"), fromMonth: z.number().int().positive().optional() }),
  ]),
  decommission: z.object({ conditional: z.literal(true), condition: z.string(), assumed: z.boolean() }).optional(),
});
export type CurrentLine = z.infer<typeof CurrentLineSchema>;

const ProjectObject = z.object({
  schema: z.literal(PROJECT_SCHEMA_ID),
  version: z.literal(CURRENT_PROJECT_VERSION),
  name: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  settings: z.object({
    /** Default deployment for every Azure workload; each workload can choose its own. */
    azureDeployment: z.enum(["global", "regional", "dataZone"]),
    /** Default processing tier for every Azure chat workload; each workload can choose its own. Absent = Standard. */
    processingTier: ProcessingTier.optional(),
    /**
     * How Azure chat, LLM and agent workloads are billed by default: pay-as-you-go, or provisioned throughput (PTU) with
     * pay-as-you-go spillover. Absent means pay-as-you-go. A workload's own Capacity settings override it.
     */
    pricingModel: z.enum(["payg", "ptu"]).optional(),
    /** Default text language for token counts (heuristics.tokens.language); a workload can override it. */
    language: z.string().default("en"),
    /** Which percentile the AI Dev Lab agent runs are priced at. Absent means P50. */
    devLabPercentile: z.enum(["p50", "p90"]).optional(),
    /** Numbers the model used to fix in code. Each is optional; absent means the original value (see assumptions.ts). */
    assumptions: z.object({
      plannerInputTokens: n0.optional(), plannerOutputTokens: n0.optional(),
      redTeamScoringOutputTokens: n0.optional(),
      voiceFunctionCallInputTokens: n0.optional(), voiceFunctionCallOutputTokens: n0.optional(),
      peakToAverage: z.number().min(1).max(50).optional(),
    }).optional(),
    snowflake: z.object({
      routing: z.enum(["global", "regional"]),
      edition: z.enum(["standard", "enterprise", "businessCritical", "vps"]),
      aiCreditCad: z.number().positive().optional(),
      platformCreditCad: z.number().positive().optional(),
    }),
  }),
  timeline: z.object({
    buildMonths: z.number().int().min(1).max(24),
    horizonMonths: z.number().int().min(12).max(120),
    adoptionRampMonths: z.number().int().min(0).max(24),
  }),
  features: z.array(FeatureSchema).default([]),
  rateCard: z.array(RoleSchema),
  harnesses: z.array(HarnessSchema),
  build: z.object({
    team: z.array(TeamLineSchema),
    /** When false, the team only drives Dev Lab volumes and no build labour is costed. */
    includeLabour: z.boolean().default(true),
    workstreams: z.array(WorkstreamSchema).default([]),
    /** Optional AI Dev Lab budget per experimenting person per month (CAD). */
    devBudgetPerMonth: n0.optional(),
    /**
     * Optional fixed AI Dev Lab spend per month for the whole team (CAD). When above 0 it replaces the calculated Dev Lab cost
     * (and any typed cells) in every build month. devBudgetPerMonth is only a per-person limit the plan is compared with.
     */
    devLabMonthlyCad: n0.optional(),
    contingencyPct: n0,
    /** What contingency is added to: build labour only (default), or also Dev Lab, dev environment and one-time build costs. */
    contingencyScope: z.enum(["labour", "all"]).default("labour"),
    activities: z.array(DevActivitySchema),
    environment: z.array(FixedItemSchema),
  }),
  workloads: z.array(WorkloadSchema),
  /** Catalogue resources that run in production; absent or empty means none and adds no ledger lines. Optional so existing project literals and files stay valid. */
  resources: z.array(ResourceSchema).optional(),
  maintenance: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("team"), team: z.array(TeamLineSchema) }),
    z.object({ mode: z.literal("pctOfBuild"), pctPerYear: n0 }),
    z.object({ mode: z.literal("none") }),
  ]),
  benefits: z.object({
    /** Time saved at full adoption. `workloadIds`/`workstreamIds`: what this capability uses, for cost allocation. */
    capabilities: z.array(CapabilitySchema),
    /** Costs that stop (licences, contracts, headcount). Not scaled by adoption; start at go-live unless `startMonth` is set. */
    avoidedCosts: z.array(z.object({
      id, label: z.string(), monthly: n0, startMonth: z.number().int().positive().optional(),
      /** Headcount mode: full-time equivalents not hired or redeployed, valued at the role's rate (escalates with it). */
      fte: n0.optional(), roleId: id.optional(), hoursPerMonth: n0.optional(),
      /** The capability this avoided cost is attributed to in ROI by capability. */
      capabilityId: id.optional(),
      /** How sure you are the saving will arrive, in percent; absent means 100. */
      confidencePct: pct.optional(),
    })),
    /** Revenue, quality (errors avoided) and risk-reduction benefits. */
    value: z.array(ValueItemSchema).default([]),
    /** One-time benefits such as a decommissioned system's resale or a grant. */
    oneOff: z.array(z.object({ id, label: z.string(), amount: n0, month: z.number().int().positive() })).default([]),
  }),
  roi: z.object({
    basis: z.enum(["run", "runMaint", "full"]),
    benefitPreset: z.enum(["conservative", "typical", "optimistic"]),
    /** Project-wide overrides of the preset's adoption and realisation, in percent. */
    adoptionPct: pct.optional(), realisationPct: pct.optional(),
    /** Share of users who already hold an overlapping licence (e.g. Microsoft 365 Copilot), in percent. */
    licensedPct: pct.optional(),
    workingDaysPerMonth: z.number().positive().max(31).optional(),
    devCutPct: z.number().min(0).max(100),
    maintCutPct: z.number().min(0).max(100),
    /** Change management, training, dual running: monthly cost over a month window. */
    transitionCosts: z.array(z.object({ id, label: z.string(), monthly: n0, fromMonth: z.number().int().positive(), toMonth: z.number().int().positive() })).default([]),
    /** Yearly growth of production usage and time-saving benefits. */
    growthPctPerYear: z.number().min(-50).max(500).default(0),
    /** Yearly escalation of labour rates (benefit value and maintenance labour). */
    rateEscalationPctPerYear: z.number().min(0).max(50).default(0),
    /** Annual discount rate for NPV. */
    discountRatePct: z.number().min(0).max(50).default(0),
    /** The return the business expects before it funds anything, in percent a year. Shown against IRR; absent means none set. */
    hurdleRatePct: z.number().min(0).max(100).optional(),
    /** Terminal value: this many years of the last 12 months' net cash flow, added at the end of the plan. Absent or 0 means none. */
    terminalValueYears: z.number().min(0).max(20).optional(),
    /** Share of build cost treated as capital spend (capex), in percent. It is spread over `amortiseMonths` from go-live in the accounting view; cash figures are unchanged. Absent means 0. */
    capexPct: pct.optional(),
    /** Months the capitalised build cost is written off over. Absent means 36. */
    amortiseMonths: z.number().int().min(1).max(120).optional(),
  }),
  scenarios: z.array(ScenarioSchema).default([]),
  /** What the work costs today, itemised. Absent or empty means no current-state savings (see currentstate.ts). */
  currentState: z.object({ lines: z.array(CurrentLineSchema).default([]) }).optional(),
});

/** Referential problems a saved project can have: ids that point at nothing. Empty when the project is consistent. */
export function projectIssues(p: z.infer<typeof ProjectObject>): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  const features = new Set(p.features.map((f) => f.id));
  const workloads = new Set(p.workloads.map((w) => w.id));
  const workstreams = new Set(p.build.workstreams.map((w) => w.id));
  const feat = (path: (string | number)[], fid: string | undefined) => { if (fid !== undefined && !features.has(fid)) out.push({ path, message: `Unknown feature "${fid}"` }); };
  p.workloads.forEach((w, i) => feat(["workloads", i, "featureId"], w.featureId));
  p.workloads.forEach((w, i) => { if (w.kind === "hosting" && w.volumeFrom !== undefined && !workloads.has(w.volumeFrom)) out.push({ path: ["workloads", i, "volumeFrom"], message: `Unknown workload "${w.volumeFrom}"` }); });
  p.build.workstreams.forEach((w, i) => feat(["build", "workstreams", i, "featureId"], w.featureId));
  p.build.activities.forEach((a, i) => feat(["build", "activities", i, "featureId"], a.featureId));
  p.benefits.capabilities.forEach((c, i) => {
    feat(["benefits", "capabilities", i, "featureId"], c.featureId);
    c.workloadIds.forEach((x, k) => { if (!workloads.has(x)) out.push({ path: ["benefits", "capabilities", i, "workloadIds", k], message: `Unknown workload "${x}"` }); });
    c.workstreamIds.forEach((x, k) => { if (!workstreams.has(x)) out.push({ path: ["benefits", "capabilities", i, "workstreamIds", k], message: `Unknown workstream "${x}"` }); });
  });
  (p.currentState?.lines ?? []).forEach((c, i) => {
    feat(["currentState", "lines", i, "featureId"], c.featureId);
    if (c.basis.kind === "perTransaction" && c.basis.volumeFrom !== undefined && !workloads.has(c.basis.volumeFrom)) out.push({ path: ["currentState", "lines", i, "basis", "volumeFrom"], message: `Unknown workload "${c.basis.volumeFrom}"` });
  });
  return out;
}

export const ProjectSchema = ProjectObject.superRefine((p, ctx) => {
  for (const i of projectIssues(p)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: i.path, message: i.message });
});
export type Project = z.infer<typeof ProjectSchema>;
export type Harness = z.infer<typeof HarnessSchema>;
