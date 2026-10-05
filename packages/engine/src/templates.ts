import type { DevActivity, Harness, Project, Workload } from "./project.js";
import { workloadVolume } from "./benefits.js";

/** Default model per role, used when a template needs one. */
const DEFAULT_MODEL = "gpt-5.4";
const JUDGE_MODEL = "gpt-5.4-mini";

export const DEFAULT_HARNESS: Harness = {
  id: "agent", label: "Agent", systemPromptTokens: 1500, tools: 8, tokensPerTool: 250, userInputTokens: 800,
  steps: 6, toolCallsPerStep: 1.3, toolResultTokens: 1500, outputPerStep: 300, finalOutputTokens: 600,
  reasoning: "low", keepReasoning: false, maxTurns: 10, maxTokensPerCall: 4096, compactAtTokens: 0, compactSummaryTokens: 3000, retryRate: 0.05,
};

export const ACTIVITY_KINDS: { kind: DevActivity["kind"]; label: string; detail: string }[] = [
  { kind: "bakeoff", label: "Model bake-off", detail: "Run the same evaluation set on several candidate models" },
  { kind: "iterations", label: "Harness iterations", detail: "Developers re-running the agent while they change it" },
  { kind: "regression", label: "Automated regression", detail: "Scheduled full-set runs, e.g. nightly" },
  { kind: "evaluation", label: "Foundry evaluation", detail: "LLM-judge and safety evaluators scoring the runs above" },
  { kind: "redteam", label: "AI red teaming", detail: "Adversarial scans by risk category and attack strategy" },
  { kind: "playground", label: "Playground & prompt work", detail: "Ad-hoc calls while designing prompts" },
  { kind: "tooling", label: "AI coding tools", detail: "Copilot seats and coding-agent tokens" },
  { kind: "synthetic", label: "Synthetic data", detail: "Generate test or training examples, keep what a judge accepts" },
  { kind: "finetune", label: "Fine-tuning", detail: "Training runs plus hosting of the tuned deployments (prices unverified)" },
];

export const WORKLOAD_KINDS: { kind: Workload["kind"]; label: string; detail: string }[] = [
  { kind: "transcription", label: "Speech to text", detail: "Meetings, calls or recordings, with optional summaries" },
  { kind: "documents", label: "Document ingestion", detail: "OCR / layout extraction, or PDFs straight to a model" },
  { kind: "email", label: "Email ingestion", detail: "Bodies and attachments" },
  { kind: "embeddings", label: "Embeddings", detail: "Vectorising new content" },
  { kind: "aiSearch", label: "Azure AI Search index", detail: "Sized from chunks and vector dimensions" },
  { kind: "retrieval", label: "Retrieval", detail: "Semantic ranker, rerankers, agentic retrieval" },
  { kind: "chat", label: "Chat / RAG assistant", detail: "Users, conversations and turns with history growth" },
  { kind: "agent", label: "Agent in production", detail: "Tasks per month through an agent harness" },
  { kind: "continuousEval", label: "Continuous evaluation", detail: "Sampled production traffic scored by evaluators" },
  { kind: "contentSafety", label: "Content Safety", detail: "Moderation and Prompt Shields per request" },
  { kind: "llm", label: "Other LLM calls", detail: "Any calls with known token sizes; Batch optional" },
  { kind: "fixed", label: "Platform & infrastructure", detail: "Fixed monthly services (APIM, storage, logs…)" },
  { kind: "voiceAgent", label: "Voice agent (real time)", detail: "Speech-to-speech calls with gpt-realtime, compared with a cascade" },
  { kind: "snowflakeComplete", label: "Snowflake AI_COMPLETE", detail: "Cortex LLM calls over table rows, plus warehouse time" },
  { kind: "snowflakeFunction", label: "Snowflake AI function", detail: "AI_CLASSIFY, AI_EXTRACT, AI_TRANSLATE… plus warehouse time" },
  { kind: "cortexSearch", label: "Snowflake Cortex Search", detail: "Serving per GB, re-embedding and refresh warehouse" },
];

/** An id not used by any activity, workload or harness in the project. */
export function uniqueId(p: Project, base: string): string {
  const taken = new Set([...p.features.map((f) => f.id), ...p.build.activities.map((a) => a.id), ...p.workloads.map((w) => w.id), ...p.harnesses.map((h) => h.id), ...p.build.workstreams.map((w) => w.id), ...p.benefits.capabilities.map((c) => c.id)]);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Activity and workload kinds that run an agent harness. Nothing else ever adds one. */
export const HARNESS_ACTIVITY_KINDS: DevActivity["kind"][] = ["bakeoff", "iterations", "regression"];
export const HARNESS_WORKLOAD_KINDS: Workload["kind"][] = ["agent"];

/** Whether adding this kind needs an agent harness the project may not have yet. */
export function needsHarness(kind: DevActivity["kind"] | Workload["kind"]): boolean {
  return (HARNESS_ACTIVITY_KINDS as string[]).includes(kind) || (HARNESS_WORKLOAD_KINDS as string[]).includes(kind);
}

/**
 * The harness a harness-driven activity or workload points at. Only called for kinds that need one
 * (see `needsHarness`); adds the default agent when the project has none. Callers that add such an item
 * should tell the user, since the agent is a new assumption (see `agentAddedFor`).
 */
export function ensureHarness(p: Project): string {
  if (!p.harnesses.length) p.harnesses.push({ ...DEFAULT_HARNESS });
  return p.harnesses[0]!.id;
}

/** True when adding an item of this kind to the project will add an agent, so the UI can say so first. */
export const agentAddedFor = (p: Project, kind: DevActivity["kind"] | Workload["kind"]): boolean => needsHarness(kind) && p.harnesses.length === 0;

/** A new activity of the given kind with sensible defaults. Mutates `p` only to add a harness when needed. */
export function newActivity(p: Project, kind: DevActivity["kind"]): DevActivity {
  const label = ACTIVITY_KINDS.find((k) => k.kind === kind)!.label;
  const id = uniqueId(p, kind);
  const B = p.timeline.buildMonths;
  switch (kind) {
    case "bakeoff": return { kind, id, label, harnessId: ensureHarness(p), candidates: [{ modelId: DEFAULT_MODEL, fromMonth: 1 }, { modelId: "claude-sonnet-5-5", fromMonth: 1, toMonth: Math.min(2, B) }], cases: 200, repeats: 3, sweepsPerMonth: [4, 4, 2], cacheHit: 0.3, batchShare: 0 };
    case "iterations": return { kind, id, label, harnessId: ensureHarness(p), modelId: DEFAULT_MODEL, runsPerDevPerDay: 10, subsetCases: 20, workingDays: 21, cacheHit: 0.3, monthFactors: [1] };
    case "regression": return { kind, id, label, harnessId: ensureHarness(p), modelIds: [DEFAULT_MODEL], runsPerMonth: 30, cases: 200, cacheHit: 0.5, batchShare: 1, fromMonth: Math.min(3, B), monthFactors: [1] };
    case "evaluation": {
      // Score only what the project actually runs: no bake-off, iterations or regression is assumed.
      const has = (k: DevActivity["kind"]) => p.build.activities.some((a) => a.kind === k);
      return { kind, id, label, judgeModelId: JUDGE_MODEL, evaluators: ["groundedness", "relevance", "coherence", "taskAdherence"], queryTokens: 150, contextTokens: 2500, responseTokens: 600,
        scoredShare: { bakeoff: has("bakeoff") ? 1 : 0, iterations: has("iterations") ? 0.3 : 0, regression: has("regression") ? 1 : 0 }, safetyEvaluators: 4 };
    }
    case "redteam": return { kind, id, label, targetModelId: DEFAULT_MODEL, scansPerMonth: 4, categories: 4, objectivesPerCategory: 10, strategies: 5, multiTurnShare: 0.2, fromMonth: Math.max(1, B - 1), monthFactors: [1] };
    case "playground": return { kind, id, label, modelId: DEFAULT_MODEL, callsPerDevPerDay: 40, inputTokens: 3000, outputTokens: 600, workingDays: 21, reasoning: "none", monthFactors: [1] };
    case "synthetic": return { kind, id, label, generatorModelId: DEFAULT_MODEL, acceptedPerMonth: 2000, passRate: 0.6, genInputTokens: 1500, genOutputTokens: 700, reasoning: "none", judgeModelId: JUDGE_MODEL, judgeInputTokens: 1200, judgeOutputTokens: 150, batchShare: 1, monthFactors: [1, 0.5, 0] };
    case "finetune": return { kind, id, label, trainingPriceId: "ft-train-gpt-4.1-mini", runsPerMonth: 3, examples: 5000, tokensPerExample: 1500, epochs: 3, hoursPerRun: 0, deployments: 1, hostingHoursPerMonth: 160, monthFactors: [0, 1] };
    case "tooling": return { kind, id, label, copilotSeatsPerDev: 1, copilotPlan: "copilot-business", codingModelId: "claude-sonnet-5-5", codingTokensPerDevPerDay: { input: 400000, cachedInput: 2400000, output: 60000 }, workingDays: 21, monthFactors: [1] };
  }
}

export function newWorkload(p: Project, kind: Workload["kind"]): Workload {
  const label = WORKLOAD_KINDS.find((k) => k.kind === kind)!.label;
  const id = uniqueId(p, kind);
  switch (kind) {
    case "transcription": return { kind, id, label, hoursPerMonth: 500, engineId: "speech-batch", diarize: true, summary: { modelId: JUDGE_MODEL, outputTokens: 800, reasoning: "none" } };
    case "documents": return { kind, id, label, pagesPerMonth: 10000, pageType: "dense", route: { type: "extract", extractorId: "di-layout", addOnIds: [] } };
    case "email": return { kind, id, label, emailsPerMonth: 50000, bodyExtractorId: "cu-doc-minimal", attachmentExtractorId: "di-read", attachmentShare: 0.25, attachmentsPerEmail: 1.5, pagesPerAttachment: 5, dedupe: 0.7 };
    case "embeddings": return { kind, id, label, tokensPerMonth: 20_000_000, modelId: "text-embedding-3-small" };
    case "aiSearch": return { kind, id, label, chunks: 200_000, embeddingModelId: "text-embedding-3-small", bytesPerDim: 4, chunkTokens: 512, replicas: 2 };
    case "retrieval": return { kind, id, label, queriesPerMonth: 50_000, semanticShare: 1 };
    case "chat": return { kind, id, label, users: 500, conversationsPerUser: 20, turns: 4, modelId: DEFAULT_MODEL, systemPromptTokens: 600, userTurnTokens: 100, assistantTurnTokens: 400, topK: 5, chunkTokens: 512, cacheHit: 0.4, reasoning: "low" };
    case "agent": return { kind, id, label, harnessId: ensureHarness(p), modelId: DEFAULT_MODEL, tasksPerMonth: 2000, cacheHit: 0.8, toolFees: [] };
    case "continuousEval": return { kind, id, label, interactionsPerMonth: 50_000, sampleShare: 0.05, judgeModelId: JUDGE_MODEL, evaluators: ["groundedness", "relevance", "coherence"], contextTokens: 2500, responseTokens: 400, safetyEvaluators: 0 };
    case "contentSafety": return { kind, id, label, requestsPerMonth: 50_000, charsPerRequest: 3000, unitPriceIds: ["safety-text", "safety-prompt-shields"] };
    case "llm": return { kind, id, label, callsPerMonth: 10_000, modelId: DEFAULT_MODEL, inputTokens: 2000, cachedInputTokens: 0, outputTokens: 500, batchShare: 0, reasoning: "none" };
    case "voiceAgent": return { kind, id, label, modelId: "gpt-realtime-2.1-mini", callsPerMonth: 5000, minutesPerCall: 5, turnsPerCall: 12, agentTalkShare: 0.5, systemPromptTokens: 1500, cacheHit: 0.8, telephonyPerMinute: 0 };
    case "snowflakeComplete": return { kind, id, label, modelId: "sf:openai-gpt-5", rowsPerMonth: 50_000, inputTokens: 800, outputTokens: 200, warehouse: { size: "m", hoursPerMonth: 20 } };
    case "snowflakeFunction": return { kind, id, label, functionId: "sf-ai-classify", rowsPerMonth: 100_000, tokensPerRow: 300, hiddenPromptTokens: 150, outputTokensPerRow: 10, warehouse: { size: "m", hoursPerMonth: 10 } };
    case "cortexSearch": return { kind, id, label, rows: 1_000_000, vectorColumns: 1, embeddingModelId: "sf:snowflake-arctic-embed-m-v1.5", avgRowBytes: 1000, tokensPerRow: 400, changedShareMonthly: 0.05, warehouse: { size: "m", hoursPerMonth: 8 } };
    case "fixed": return { kind, id, label, group: "Platform", items: [{ id: "apim", label: "API Management Basic v2", unitPriceId: "apim-basic-v2", quantity: 1 }, { id: "logs", label: "Application Insights ingestion", unitPriceId: "log-analytics-ingest", quantity: 20 }] };
  }
}

/** Remove a workload and unlink it from capabilities. Scenarios that reference it report an error instead of failing silently. */
export function removeWorkload(p: Project, id: string): void {
  const w = p.workloads.find((x) => x.id === id);
  p.workloads = p.workloads.filter((x) => x.id !== id);
  for (const c of p.benefits.capabilities) {
    c.workloadIds = c.workloadIds.filter((x) => x !== id);
    // A capability that took its volume from this workload keeps the last numbers as its own.
    if (c.volumeFrom === id && w) {
      const v = workloadVolume(w);
      if (v.users !== undefined) c.users = v.users;
      if (v.items !== undefined) c.itemsPerMonth = v.items;
      delete c.volumeFrom;
    }
  }
}

/** A new harness with default sizes and a unique id. */
export function newHarness(p: Project): Harness {
  return { ...DEFAULT_HARNESS, id: uniqueId(p, "agent"), label: p.harnesses.length ? `Agent ${p.harnesses.length + 1}` : "Agent" };
}

/** Where a harness is used; a harness can only be removed when this is empty. */
export function harnessUsage(p: Project, id: string): string[] {
  return [
    ...p.build.activities.filter((a) => "harnessId" in a && a.harnessId === id).map((a) => `Build: ${a.label}`),
    ...p.workloads.filter((w) => w.kind === "agent" && w.harnessId === id).map((w) => `Run: ${w.label}`),
  ];
}

/** A new, empty workstream (feature). */
export function newWorkstream(p: Project, label = "New workstream"): Project["build"]["workstreams"][number] {
  return { id: uniqueId(p, "ws"), label, harnessIds: [], evaluated: true };
}

/** Remove a workstream and every reference to it: activities become project-wide, allocations and capability links go. */
export function removeWorkstream(p: Project, id: string): void {
  p.build.workstreams = p.build.workstreams.filter((w) => w.id !== id);
  for (const a of p.build.activities) if (a.workstreamId === id) delete a.workstreamId;
  for (const t of p.build.team) if (t.allocations) t.allocations = t.allocations.filter((x) => x.workstreamId !== id);
  for (const c of p.benefits.capabilities) c.workstreamIds = c.workstreamIds.filter((x) => x !== id);
}

/** Set one team line's share of a workstream (0 removes the allocation). */
/**
 * Set a team line's share of a workstream. When the person has several periods on it, every
 * period takes the new share; 0 removes them all.
 */
export function setAllocation(p: Project, seat: number, workstreamId: string, share: number): void {
  const t = p.build.team[seat];
  if (!t) return;
  const mine = (t.allocations ?? []).filter((x) => x.workstreamId === workstreamId);
  const rest = (t.allocations ?? []).filter((x) => x.workstreamId !== workstreamId);
  if (share <= 0) { t.allocations = rest; return; }
  // Keep the month windows when only the share changes.
  t.allocations = [...rest, ...(mine.length ? mine.map((a) => ({ ...a, share })) : [{ workstreamId, share }])];
}

/** The periods (allocation entries) a team line has on a workstream, with their index in `allocations`. */
export function allocationPeriods(p: Project, seat: number, workstreamId: string): { index: number; share: number; fromMonth: number; toMonth: number }[] {
  const B = p.timeline.buildMonths;
  return (p.build.team[seat]?.allocations ?? []).flatMap((a, index) => (a.workstreamId === workstreamId ? [{ index, share: a.share, fromMonth: a.fromMonth ?? 1, toMonth: Math.min(a.toMonth ?? B, B) }] : []))
    .sort((x, y) => x.fromMonth - y.fromMonth);
}

/** Edit one period: its share, or its months (1 and the last build month are stored as open ends). */
export function updateAllocationPeriod(p: Project, seat: number, index: number, patch: { share?: number; fromMonth?: number; toMonth?: number }): void {
  const a = p.build.team[seat]?.allocations?.[index];
  if (!a) return;
  if (patch.share !== undefined) a.share = patch.share;
  if (patch.fromMonth !== undefined) { if (patch.fromMonth > 1) a.fromMonth = patch.fromMonth; else delete a.fromMonth; }
  if (patch.toMonth !== undefined) { if (patch.toMonth < p.timeline.buildMonths) a.toMonth = patch.toMonth; else delete a.toMonth; }
}

/** Remove one period. */
export function removeAllocationPeriod(p: Project, seat: number, index: number): void {
  const t = p.build.team[seat];
  if (t?.allocations) t.allocations.splice(index, 1);
}

/**
 * Add another period on a workstream for a team line (someone who comes back to a feature).
 * It starts after the person's last period there, runs to the end of the build, and keeps the share.
 * Returns false when there is no room left in the build.
 */
export function addAllocationPeriod(p: Project, seat: number, workstreamId: string): boolean {
  const t = p.build.team[seat];
  if (!t) return false;
  const B = p.timeline.buildMonths;
  const periods = allocationPeriods(p, seat, workstreamId);
  const last = periods.at(-1);
  // Leave at least a month away, then start at the first month the person has time free.
  const earliest = last ? last.toMonth + 2 : 1;
  if (earliest > B) return false;
  const busy = (m: number) => (t.allocations ?? []).filter((a) => a.workstreamId !== workstreamId && m >= (a.fromMonth ?? 1) && m <= (a.toMonth ?? Infinity)).reduce((x, a) => x + a.share, 0);
  let from = earliest;
  while (from <= B && busy(from) >= 1 - 1e-9) from++;
  if (from > B) from = earliest;
  t.allocations = [...(t.allocations ?? []), { workstreamId, share: last?.share ?? 1, ...(from > 1 ? { fromMonth: from } : {}) }];
  return true;
}

/** Months in which two periods of the same team line on the same workstream overlap. */
export function overlappingPeriods(p: Project, seat: number, workstreamId: string): boolean {
  const ps = allocationPeriods(p, seat, workstreamId);
  return ps.some((a, i) => ps.slice(i + 1).some((b) => a.fromMonth <= b.toMonth && b.fromMonth <= a.toMonth));
}

export const WORKSTREAM_TEMPLATES = [
  { id: "empty", label: "Empty", detail: "Just the workstream; add people and activities yourself" },
  { id: "agent", label: "Single agent", detail: "New agent harness, harness iterations and nightly regression" },
  { id: "rag", label: "RAG feature", detail: "Prompt work and a synthetic question set for evaluation" },
  { id: "multiAgent", label: "Multi-agent feature", detail: "Planner and worker harnesses, iterations on each, regression and red teaming" },
  { id: "shared", label: "Shared component", detail: "A tool or service several features use; not evaluated on its own" },
] as const;
export type WorkstreamTemplateId = (typeof WORKSTREAM_TEMPLATES)[number]["id"];

/**
 * Add a workstream from a template: its harnesses and scoped activities, laid out over the build
 * (iterations ramp up, regression from the middle, red teaming in the final third).
 * Returns the new workstream's id. People are not allocated: that stays a deliberate choice.
 */
export function addWorkstreamFromTemplate(p: Project, templateId: WorkstreamTemplateId, label: string): string {
  const B = p.timeline.buildMonths;
  const w = { ...newWorkstream(p, label), evaluated: templateId !== "shared" };
  p.build.workstreams.push(w);
  const harness = (name: string, over: Partial<Harness> = {}) => {
    const h = { ...newHarness(p), label: `${label}: ${name}`, ...over };
    p.harnesses.push(h);
    w.harnessIds.push(h.id);
    return h.id;
  };
  const add = <K extends DevActivity["kind"]>(kind: K, name: string, patch: (a: Extract<DevActivity, { kind: K }>) => void = () => {}) => {
    const a = newActivity(p, kind) as Extract<DevActivity, { kind: K }>;
    a.workstreamId = w.id;
    a.label = `${name} (${label})`;
    patch(a);
    p.build.activities.push(a);
  };
  const ramp = (n: number) => Array.from({ length: n }, (_, i) => Math.round((0.4 + (0.6 * i) / Math.max(1, n - 1)) * 100) / 100);
  const fromMid = Math.max(1, Math.ceil(B / 2));
  const lastThird = Math.max(1, B - Math.floor(B / 3) + 1);
  switch (templateId) {
    case "agent": {
      const h = harness("agent");
      add("iterations", "Harness iterations", (a) => { a.harnessId = h; a.monthFactors = ramp(B); });
      add("regression", "Nightly regression", (a) => { a.harnessId = h; a.fromMonth = fromMid; });
      break;
    }
    case "rag":
      add("playground", "Prompt & retrieval tuning");
      add("synthetic", "Synthetic question set", (a) => { a.acceptedPerMonth = 500; a.monthFactors = [1, 0.5, 0]; });
      break;
    case "multiAgent": {
      const planner = harness("planner", { steps: 4, tools: 4, outputPerStep: 400 });
      const worker = harness("worker", { steps: 8, tools: 10 });
      add("iterations", "Planner iterations", (a) => { a.harnessId = planner; a.monthFactors = ramp(B); });
      add("iterations", "Worker iterations", (a) => { a.harnessId = worker; a.monthFactors = ramp(B); });
      add("regression", "End-to-end regression", (a) => { a.harnessId = planner; a.fromMonth = fromMid; });
      add("redteam", "Red teaming", (a) => { a.fromMonth = lastThird; });
      break;
    }
    case "shared":
    case "empty":
      break;
  }
  return w.id;
}

/** The highest total share a team line is allocated in any one build month (only months it works). */
export function peakAllocation(p: Project, seat: number): number {
  const t = p.build.team[seat];
  if (!t) return 0;
  let peak = 0;
  for (let m = 1; m <= p.timeline.buildMonths; m++) {
    const s = (t.allocations ?? []).filter((a) => m >= (a.fromMonth ?? 1) && m <= (a.toMonth ?? Infinity)).reduce((x, a) => x + a.share, 0);
    peak = Math.max(peak, s);
  }
  return peak;
}
