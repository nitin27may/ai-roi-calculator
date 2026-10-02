import type { DevActivity, Harness, Project, Workload } from "./project.js";

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
  { kind: "snowflakeComplete", label: "Snowflake AI_COMPLETE", detail: "Cortex LLM calls over table rows, plus warehouse time" },
  { kind: "snowflakeFunction", label: "Snowflake AI function", detail: "AI_CLASSIFY, AI_EXTRACT, AI_TRANSLATE… plus warehouse time" },
  { kind: "cortexSearch", label: "Snowflake Cortex Search", detail: "Serving per GB, re-embedding and refresh warehouse" },
];

/** An id not used by any activity, workload or harness in the project. */
export function uniqueId(p: Project, base: string): string {
  const taken = new Set([...p.build.activities.map((a) => a.id), ...p.workloads.map((w) => w.id), ...p.harnesses.map((h) => h.id)]);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Ensure the project has a harness to point at; returns its id (adds the default if none). */
export function ensureHarness(p: Project): string {
  if (!p.harnesses.length) p.harnesses.push({ ...DEFAULT_HARNESS });
  return p.harnesses[0]!.id;
}

/** A new activity of the given kind with sensible defaults. Mutates `p` only to add a harness when needed. */
export function newActivity(p: Project, kind: DevActivity["kind"]): DevActivity {
  const label = ACTIVITY_KINDS.find((k) => k.kind === kind)!.label;
  const id = uniqueId(p, kind);
  const B = p.timeline.buildMonths;
  switch (kind) {
    case "bakeoff": return { kind, id, label, harnessId: ensureHarness(p), candidates: [{ modelId: DEFAULT_MODEL, fromMonth: 1 }, { modelId: "claude-sonnet-5-5", fromMonth: 1, toMonth: Math.min(2, B) }], cases: 200, repeats: 3, sweepsPerMonth: [4, 4, 2], cacheHit: 0.3, batchShare: 0 };
    case "iterations": return { kind, id, label, harnessId: ensureHarness(p), modelId: DEFAULT_MODEL, runsPerDevPerDay: 10, subsetCases: 20, workingDays: 21, cacheHit: 0.3, monthFactors: [1] };
    case "regression": return { kind, id, label, harnessId: ensureHarness(p), modelIds: [DEFAULT_MODEL], runsPerMonth: 30, cases: 200, cacheHit: 0.5, batchShare: 1, fromMonth: Math.min(3, B) };
    case "evaluation": return { kind, id, label, judgeModelId: JUDGE_MODEL, evaluators: ["groundedness", "relevance", "coherence", "taskAdherence"], queryTokens: 150, contextTokens: 2500, responseTokens: 600, scoredShare: { bakeoff: 1, iterations: 0.3, regression: 1 }, safetyEvaluators: 4 };
    case "redteam": return { kind, id, label, targetModelId: DEFAULT_MODEL, scansPerMonth: 4, categories: 4, objectivesPerCategory: 10, strategies: 5, multiTurnShare: 0.2, fromMonth: Math.max(1, B - 1) };
    case "playground": return { kind, id, label, modelId: DEFAULT_MODEL, callsPerDevPerDay: 40, inputTokens: 3000, outputTokens: 600, workingDays: 21 };
    case "tooling": return { kind, id, label, copilotSeatsPerDev: 1, copilotPlan: "copilot-business", codingModelId: "claude-sonnet-5-5", codingTokensPerDevPerDay: { input: 400000, cachedInput: 2400000, output: 60000 }, workingDays: 21 };
  }
}

export function newWorkload(p: Project, kind: Workload["kind"]): Workload {
  const label = WORKLOAD_KINDS.find((k) => k.kind === kind)!.label;
  const id = uniqueId(p, kind);
  switch (kind) {
    case "transcription": return { kind, id, label, hoursPerMonth: 500, engineId: "speech-batch", diarize: true, summary: { modelId: JUDGE_MODEL, outputTokens: 800 } };
    case "documents": return { kind, id, label, pagesPerMonth: 10000, pageType: "dense", route: { type: "extract", extractorId: "di-layout", addOnIds: [] } };
    case "email": return { kind, id, label, emailsPerMonth: 50000, bodyExtractorId: "cu-doc-minimal", attachmentExtractorId: "di-read", attachmentShare: 0.25, attachmentsPerEmail: 1.5, pagesPerAttachment: 5, dedupe: 0.7 };
    case "embeddings": return { kind, id, label, tokensPerMonth: 20_000_000, modelId: "text-embedding-3-small" };
    case "aiSearch": return { kind, id, label, chunks: 200_000, embeddingModelId: "text-embedding-3-small", bytesPerDim: 4, chunkTokens: 512, replicas: 2 };
    case "retrieval": return { kind, id, label, queriesPerMonth: 50_000, semanticShare: 1 };
    case "chat": return { kind, id, label, users: 500, conversationsPerUser: 20, turns: 4, modelId: DEFAULT_MODEL, systemPromptTokens: 600, userTurnTokens: 100, assistantTurnTokens: 400, topK: 5, chunkTokens: 512, cacheHit: 0.4 };
    case "agent": return { kind, id, label, harnessId: ensureHarness(p), modelId: DEFAULT_MODEL, tasksPerMonth: 2000, cacheHit: 0.8, toolFees: [] };
    case "continuousEval": return { kind, id, label, interactionsPerMonth: 50_000, sampleShare: 0.05, judgeModelId: JUDGE_MODEL, evaluators: ["groundedness", "relevance", "coherence"], contextTokens: 2500, responseTokens: 400, safetyEvaluators: 0 };
    case "contentSafety": return { kind, id, label, requestsPerMonth: 50_000, charsPerRequest: 3000, unitPriceIds: ["safety-text", "safety-prompt-shields"] };
    case "llm": return { kind, id, label, callsPerMonth: 10_000, modelId: DEFAULT_MODEL, inputTokens: 2000, cachedInputTokens: 0, outputTokens: 500, batchShare: 0 };
    case "snowflakeComplete": return { kind, id, label, modelId: "sf:openai-gpt-5", rowsPerMonth: 50_000, inputTokens: 800, outputTokens: 200, warehouse: { size: "m", hoursPerMonth: 20 } };
    case "snowflakeFunction": return { kind, id, label, functionId: "sf-ai-classify", rowsPerMonth: 100_000, tokensPerRow: 300, hiddenPromptTokens: 150, outputTokensPerRow: 10, warehouse: { size: "m", hoursPerMonth: 10 } };
    case "cortexSearch": return { kind, id, label, rows: 1_000_000, vectorColumns: 1, embeddingModelId: "sf:snowflake-arctic-embed-m-v1.5", avgRowBytes: 1000, tokensPerRow: 400, changedShareMonthly: 0.05, warehouse: { size: "m", hoursPerMonth: 8 } };
    case "fixed": return { kind, id, label, group: "Platform", items: [{ id: "apim", label: "API Management Basic v2", unitPriceId: "apim-basic-v2", quantity: 1 }, { id: "logs", label: "Application Insights ingestion", unitPriceId: "log-analytics-ingest", quantity: 20 }] };
  }
}

/** Remove a workload and unlink it from capabilities. Scenarios that reference it report an error instead of failing silently. */
export function removeWorkload(p: Project, id: string): void {
  p.workloads = p.workloads.filter((w) => w.id !== id);
  for (const c of p.benefits.capabilities) c.componentIds = c.componentIds.filter((x) => x !== id);
}
