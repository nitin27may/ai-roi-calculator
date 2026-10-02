import { z } from "zod";

/** Project file schema (`*.aicost.json`). All money is CAD. */

const id = z.string().min(1);
const n0 = z.number().nonnegative();
const share = z.number().min(0).max(1);

export const HarnessSchema = z.object({
  id, label: z.string(),
  systemPromptTokens: n0, tools: z.number().int().nonnegative(), tokensPerTool: n0, userInputTokens: n0,
  steps: z.number().positive(), toolCallsPerStep: n0, toolResultTokens: n0, outputPerStep: n0, finalOutputTokens: n0,
  reasoning: z.union([z.enum(["none", "low", "medium", "high"]), n0]), keepReasoning: z.boolean(),
  maxTurns: z.number().int().positive(), maxTokensPerCall: z.number().int().positive(),
  compactAtTokens: n0, compactSummaryTokens: n0, retryRate: share,
});

const Window = { fromMonth: z.number().int().positive().default(1), toMonth: z.number().int().positive().optional() };

export const DevActivitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bakeoff"), id, label: z.string(), harnessId: id,
    candidates: z.array(z.object({ modelId: id, ...Window })),
    cases: z.number().int().positive(), repeats: z.number().int().positive(),
    /** Sweeps per month; the last value repeats for later months. */
    sweepsPerMonth: z.array(n0).min(1), cacheHit: share, batchShare: share,
  }),
  z.object({
    kind: z.literal("iterations"), id, label: z.string(), harnessId: id, modelId: id,
    runsPerDevPerDay: n0, subsetCases: z.number().int().positive(), workingDays: n0, cacheHit: share,
    /** Intensity per month (1 = full); last value repeats. */
    monthFactors: z.array(n0).default([1]),
  }),
  z.object({
    kind: z.literal("regression"), id, label: z.string(), harnessId: id, modelIds: z.array(id).min(1),
    runsPerMonth: n0, cases: z.number().int().positive(), cacheHit: share, batchShare: share, ...Window,
  }),
  z.object({
    kind: z.literal("evaluation"), id, label: z.string(), judgeModelId: id, evaluators: z.array(z.string()),
    queryTokens: n0, contextTokens: n0, responseTokens: n0,
    /** Share of the runs from other activities that are scored. */
    scoredShare: z.object({ bakeoff: share, iterations: share, regression: share }),
    safetyEvaluators: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("redteam"), id, label: z.string(), targetModelId: id, scansPerMonth: n0,
    categories: z.number().int().positive(), objectivesPerCategory: z.number().int().positive(), strategies: z.number().int().nonnegative(),
    multiTurnShare: share, ...Window,
  }),
  z.object({
    kind: z.literal("playground"), id, label: z.string(), modelId: id,
    callsPerDevPerDay: n0, inputTokens: n0, outputTokens: n0, workingDays: n0,
  }),
  z.object({
    kind: z.literal("tooling"), id, label: z.string(),
    copilotSeatsPerDev: n0, copilotPlan: z.enum(["copilot-business", "copilot-enterprise"]),
    codingModelId: id, codingTokensPerDevPerDay: z.object({ input: n0, cachedInput: n0, output: n0 }), workingDays: n0,
  }),
]);
export type DevActivity = z.infer<typeof DevActivitySchema>;

/** A fixed or metered catalogue item: quantity of unitPriceId per month. */
export const FixedItemSchema = z.object({ id, label: z.string(), unitPriceId: id, quantity: n0 });

/** A Snowflake virtual warehouse: size and running hours per month at full volume. */
export const Warehouse = z.object({ size: z.enum(["xs", "s", "m", "l", "xl"]), hoursPerMonth: n0 });

export const WorkloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("transcription"), id, label: z.string(), hoursPerMonth: n0, engineId: id, diarize: z.boolean(),
    summary: z.object({ modelId: id, outputTokens: n0 }).optional(),
  }),
  z.object({
    kind: z.literal("documents"), id, label: z.string(), pagesPerMonth: n0,
    pageType: z.enum(["plain", "dense", "slide", "spreadsheet"]),
    route: z.discriminatedUnion("type", [
      z.object({ type: z.literal("extract"), extractorId: id, addOnIds: z.array(id).default([]) }),
      z.object({ type: z.literal("direct"), modelId: id }),
    ]),
    enrich: z.object({ modelId: id, pagesPerDoc: z.number().positive(), outputTokensPerDoc: n0 }).optional(),
    /** Snowflake virtual warehouse that runs AI_PARSE_DOCUMENT (platform credits). */
    warehouse: Warehouse.optional(),
  }),
  z.object({
    kind: z.literal("email"), id, label: z.string(), emailsPerMonth: n0, bodyExtractorId: id, attachmentExtractorId: id,
    attachmentShare: share, attachmentsPerEmail: n0, pagesPerAttachment: n0, dedupe: share,
    triage: z.object({ modelId: id, outputTokens: n0 }).optional(),
  }),
  z.object({ kind: z.literal("embeddings"), id, label: z.string(), tokensPerMonth: n0, modelId: id }),
  z.object({
    kind: z.literal("aiSearch"), id, label: z.string(), tier: z.enum(["basic", "s1", "s2", "s3", "s3hd", "l1", "l2"]).optional(),
    chunks: n0, embeddingModelId: id, bytesPerDim: z.number().positive(), chunkTokens: n0, replicas: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("retrieval"), id, label: z.string(), queriesPerMonth: n0, semanticShare: share,
    rerankerId: id.optional(), agentic: z.object({ subqueries: n0, chunksPerSubquery: n0, tokensPerChunk: n0, plannerModelId: id }).optional(),
  }),
  z.object({
    kind: z.literal("chat"), id, label: z.string(), users: n0, conversationsPerUser: n0, turns: z.number().positive(), modelId: id,
    systemPromptTokens: n0, userTurnTokens: n0, assistantTurnTokens: n0, topK: n0, chunkTokens: n0, cacheHit: share,
    /** Share of turns routed to a cheaper model. */
    router: z.object({ modelId: id, share }).optional(),
  }),
  z.object({
    kind: z.literal("agent"), id, label: z.string(), harnessId: id, modelId: id, tasksPerMonth: n0, cacheHit: share,
    toolFees: z.array(z.object({ unitPriceId: id, perTask: n0 })).default([]),
  }),
  z.object({
    kind: z.literal("continuousEval"), id, label: z.string(), interactionsPerMonth: n0, sampleShare: share, judgeModelId: id,
    evaluators: z.array(z.string()), contextTokens: n0, responseTokens: n0, safetyEvaluators: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal("contentSafety"), id, label: z.string(), requestsPerMonth: n0, charsPerRequest: n0, unitPriceIds: z.array(id) }),
  z.object({
    kind: z.literal("llm"), id, label: z.string(), callsPerMonth: n0, modelId: id,
    inputTokens: n0, cachedInputTokens: n0, outputTokens: n0, batchShare: share,
  }),
  z.object({ kind: z.literal("fixed"), id, label: z.string(), group: z.string(), items: z.array(FixedItemSchema) }),
  z.object({
    kind: z.literal("voiceAgent"), id, label: z.string(), modelId: id, callsPerMonth: n0, minutesPerCall: z.number().positive(),
    turnsPerCall: z.number().int().positive(), agentTalkShare: share, systemPromptTokens: n0, cacheHit: share,
    /** Phone or ACS calling cost per minute in CAD (0 for web/app voice). */
    telephonyPerMinute: n0,
  }),
  z.object({
    kind: z.literal("snowflakeComplete"), id, label: z.string(), modelId: id, rowsPerMonth: n0,
    inputTokens: n0, outputTokens: n0, warehouse: Warehouse,
  }),
  z.object({
    kind: z.literal("snowflakeFunction"), id, label: z.string(), functionId: id, rowsPerMonth: n0,
    /** Billed tokens per row: your text plus labels/examples; the function's hidden prompt is added on top. */
    tokensPerRow: n0, hiddenPromptTokens: n0, outputTokensPerRow: n0, warehouse: Warehouse,
  }),
  z.object({
    kind: z.literal("cortexSearch"), id, label: z.string(), rows: n0, vectorColumns: z.number().int().positive(),
    embeddingModelId: id, avgRowBytes: n0, tokensPerRow: n0, changedShareMonthly: share, warehouse: Warehouse,
  }),
]);
export type Workload = z.infer<typeof WorkloadSchema>;

export const RoleSchema = z.object({ id, label: z.string(), hourlyRate: n0 });
/** `experiments`: these people run AI Dev Lab experiments (drives per-developer activity volumes). */
export const TeamLineSchema = z.object({
  roleId: id, people: n0, hoursPerMonth: n0, experiments: z.boolean().default(false),
  /** Delivery phase name and the build months it covers (defaults to the whole build). */
  phase: z.string().optional(),
  fromMonth: z.number().int().positive().optional(),
  toMonth: z.number().int().positive().optional(),
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

export const ProjectSchema = z.object({
  schema: z.literal("ai-cost-roi-studio/project"),
  version: z.literal(1),
  name: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  settings: z.object({
    azureDeployment: z.enum(["global", "dataZone"]),
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
  rateCard: z.array(RoleSchema),
  harnesses: z.array(HarnessSchema),
  build: z.object({
    team: z.array(TeamLineSchema),
    contingencyPct: n0,
    activities: z.array(DevActivitySchema),
    environment: z.array(FixedItemSchema),
  }),
  workloads: z.array(WorkloadSchema),
  maintenance: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("team"), team: z.array(TeamLineSchema) }),
    z.object({ mode: z.literal("pctOfBuild"), pctPerYear: n0 }),
  ]),
  benefits: z.object({
    /** Time saved at full adoption. `componentIds`: workloads this capability uses, for cost allocation. */
    capabilities: z.array(z.object({ id, label: z.string(), hoursSavedPerMonth: n0, roleId: id, componentIds: z.array(id).default([]) })),
    /** Costs that stop (licences, contracts, headcount). Not scaled by adoption; start at go-live unless `startMonth` is set. */
    avoidedCosts: z.array(z.object({ id, label: z.string(), monthly: n0, startMonth: z.number().int().positive().optional() })),
    /** One-time benefits such as a decommissioned system's resale or a grant. */
    oneOff: z.array(z.object({ id, label: z.string(), amount: n0, month: z.number().int().positive() })).default([]),
  }),
  roi: z.object({
    basis: z.enum(["run", "runMaint", "full"]),
    benefitPreset: z.enum(["conservative", "typical", "optimistic"]),
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
  }),
  scenarios: z.array(ScenarioSchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;
export type Harness = z.infer<typeof HarnessSchema>;
