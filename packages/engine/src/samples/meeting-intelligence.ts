import type { Project } from "../project.js";

/** Sample project used by the mockup, the tests and the app's "Start from a sample". */
export const meetingIntelligence: Project = {
  schema: "ai-cost-roi-studio/project",
  version: 1,
  name: "Meeting Intelligence Agent",
  startDate: "2026-11-01",
  settings: { azureDeployment: "global", snowflake: { routing: "global", edition: "enterprise" } },
  timeline: { buildMonths: 6, horizonMonths: 36, adoptionRampMonths: 6 },
  rateCard: [
    { id: "dev", label: "AI developer", hourlyRate: 95 },
    { id: "architect", label: "Solution architect", hourlyRate: 120 },
    { id: "knowledgeWorker", label: "Knowledge worker", hourlyRate: 62.5 },
  ],
  harnesses: [
    {
      id: "followup", label: "Follow-up agent", systemPromptTokens: 1800, tools: 9, tokensPerTool: 250, userInputTokens: 1200,
      steps: 6, toolCallsPerStep: 1.3, toolResultTokens: 1500, outputPerStep: 300, finalOutputTokens: 600,
      reasoning: "low", keepReasoning: false, maxTurns: 10, maxTokensPerCall: 4096, compactAtTokens: 0, compactSummaryTokens: 3000, retryRate: 0.05,
    },
  ],
  build: {
    team: [
      { roleId: "architect", people: 1, hoursPerMonth: 160, experiments: false, phase: "Discovery", fromMonth: 1, toMonth: 1 },
      { roleId: "dev", name: "Dev A", people: 1, hoursPerMonth: 160, experiments: true, phase: "Build", fromMonth: 1, toMonth: 6, allocations: [{ workstreamId: "ws-notes", share: 1 }] },
      { roleId: "dev", name: "Dev B", people: 1, hoursPerMonth: 160, experiments: true, phase: "Build", fromMonth: 1, toMonth: 6, allocations: [{ workstreamId: "ws-ask", share: 0.7 }, { workstreamId: "ws-shared", share: 0.3 }] },
      { roleId: "dev", name: "Dev C", people: 1, hoursPerMonth: 160, experiments: true, phase: "Build", fromMonth: 1, toMonth: 6, allocations: [{ workstreamId: "ws-notes", share: 0.5 }, { workstreamId: "ws-shared", share: 0.3 }] },
      { roleId: "architect", people: 0.5, hoursPerMonth: 160, experiments: false, phase: "Build", fromMonth: 2, toMonth: 6 },
    ],
    includeLabour: true,
    workstreams: [
      { id: "ws-notes", label: "Notes & follow-up agent", harnessIds: ["followup"], evaluated: true },
      { id: "ws-ask", label: "Ask-my-meetings (RAG)", harnessIds: [], evaluated: true },
      { id: "ws-shared", label: "Shared ingestion & retrieval", harnessIds: [], evaluated: false },
    ],
    contingencyPct: 0,
    activities: [
      {
        kind: "bakeoff", id: "bakeoff", label: "Model bake-off", harnessId: "followup",
        candidates: [
          { modelId: "gpt-5.4", fromMonth: 1 },
          { modelId: "claude-sonnet-5-5", fromMonth: 1, toMonth: 4 },
          { modelId: "gpt-5.6-sol", fromMonth: 1, toMonth: 2 },
          { modelId: "gpt-5.4-mini", fromMonth: 1, toMonth: 2 },
          { modelId: "claude-opus-5-5", fromMonth: 1, toMonth: 2 },
        ],
        cases: 200, repeats: 3, sweepsPerMonth: [4, 6, 4, 4, 2, 2], cacheHit: 0.3, batchShare: 0,
      },
      { kind: "iterations", id: "iterations", workstreamId: "ws-notes", label: "Harness iterations", harnessId: "followup", modelId: "gpt-5.4", runsPerDevPerDay: 12, subsetCases: 25, workingDays: 21, cacheHit: 0.3, monthFactors: [0.6, 0.6, 1] },
      { kind: "regression", id: "regression", workstreamId: "ws-notes", label: "Nightly regression", harnessId: "followup", modelIds: ["gpt-5.4"], runsPerMonth: 30, cases: 200, cacheHit: 0.5, batchShare: 0, fromMonth: 3, monthFactors: [1] },
      {
        kind: "evaluation", id: "evaluation", label: "Foundry evaluation", judgeModelId: "gpt-5.4-mini",
        evaluators: ["groundedness", "relevance", "coherence", "taskAdherence", "toolCallAccuracy"],
        queryTokens: 150, contextTokens: 2500, responseTokens: 600, scoredShare: { bakeoff: 1, iterations: 0.3, regression: 1 }, safetyEvaluators: 4,
      },
      { kind: "redteam", id: "redteam", label: "AI red teaming", targetModelId: "gpt-5.4", scansPerMonth: 8, categories: 4, objectivesPerCategory: 10, strategies: 5, multiTurnShare: 0.2, fromMonth: 5, monthFactors: [1] },
      { kind: "playground", id: "playground", label: "Playground & prompt work", modelId: "gpt-5.4", callsPerDevPerDay: 40, inputTokens: 3000, outputTokens: 600, workingDays: 21, monthFactors: [1] },
      { kind: "tooling", id: "tooling", label: "AI coding tools", copilotSeatsPerDev: 1, copilotPlan: "copilot-business", codingModelId: "claude-sonnet-5-5", codingTokensPerDevPerDay: { input: 400000, cachedInput: 2400000, output: 60000 }, workingDays: 21, monthFactors: [1] },
    ],
    environment: [
      { id: "search", label: "AI Search Basic (dev)", unitPriceId: "search-su-basic", quantity: 1 },
      { id: "apim", label: "API Management Developer", unitPriceId: "apim-developer", quantity: 1 },
      { id: "logs", label: "App Insights (dev)", unitPriceId: "log-analytics-ingest", quantity: 10 },
    ],
  },
  workloads: [
    { kind: "transcription", id: "stt", label: "Meeting transcription", hoursPerMonth: 1800, engineId: "mai-transcribe-2", diarize: true, summary: { modelId: "gpt-5.4-mini", outputTokens: 1200 } },
    { kind: "documents", id: "docs", label: "Shared documents", pagesPerMonth: 20000, pageType: "dense", route: { type: "extract", extractorId: "di-layout", addOnIds: [] } },
    { kind: "email", id: "email", label: "Email follow-ups", emailsPerMonth: 150000, bodyExtractorId: "cu-doc-minimal", attachmentExtractorId: "di-read", attachmentShare: 0.25, attachmentsPerEmail: 1.5, pagesPerAttachment: 5, dedupe: 0.7 },
    { kind: "embeddings", id: "embed", label: "Embeddings", tokensPerMonth: 45_000_000, modelId: "text-embedding-3-large" },
    { kind: "aiSearch", id: "search", label: "Azure AI Search", chunks: 410_000, embeddingModelId: "text-embedding-3-large", bytesPerDim: 4, chunkTokens: 512, replicas: 2 },
    { kind: "retrieval", id: "retrieval", label: "Retrieval", queriesPerMonth: 96_000, semanticShare: 0.65 },
    { kind: "chat", id: "chat", label: "Ask-my-meetings chat", users: 800, conversationsPerUser: 30, turns: 4, modelId: "gpt-5.4", systemPromptTokens: 600, userTurnTokens: 100, assistantTurnTokens: 400, topK: 5, chunkTokens: 512, cacheHit: 0.4 },
    { kind: "agent", id: "agent", label: "Follow-up agent", harnessId: "followup", modelId: "gpt-5.4", tasksPerMonth: 6000, cacheHit: 0.8, toolFees: [] },
    { kind: "continuousEval", id: "ceval", label: "Continuous evaluation", interactionsPerMonth: 102_000, sampleShare: 0.05, judgeModelId: "gpt-5.4-mini", evaluators: ["groundedness", "relevance", "coherence"], contextTokens: 2500, responseTokens: 400, safetyEvaluators: 0 },
    { kind: "contentSafety", id: "safety", label: "Content Safety", requestsPerMonth: 102_000, charsPerRequest: 3000, unitPriceIds: ["safety-text", "safety-prompt-shields"] },
    {
      kind: "fixed", id: "platform", label: "Platform", group: "Platform",
      items: [
        { id: "apim", label: "API Management Basic v2", unitPriceId: "apim-basic-v2", quantity: 1 },
        { id: "logs", label: "Application Insights ingestion", unitPriceId: "log-analytics-ingest", quantity: 38 },
        { id: "blob", label: "Blob Storage (transcripts, documents)", unitPriceId: "blob-hot", quantity: 900 },
        { id: "aca-cpu", label: "Container Apps vCPU", unitPriceId: "container-apps-vcpu-s", quantity: 2_600_000 },
        { id: "aca-mem", label: "Container Apps memory", unitPriceId: "container-apps-gib-s", quantity: 5_200_000 },
      ],
    },
  ],
  maintenance: { mode: "team", team: [{ roleId: "dev", people: 0.4, hoursPerMonth: 160, experiments: false }] },
  benefits: {
    capabilities: [
      { id: "notes", label: "Meeting notes and action items", hoursSavedPerMonth: 0, roleId: "knowledgeWorker",
        driver: "perTask", benchmarkId: "meeting_prep", users: 800, tasksPerUserPerDay: 0.5, baselineMinutes: 30, savings: { conservative: 5, typical: 17, optimistic: 50 }, unit: "minutes", licenceOverlap: 0.4, componentIds: ["stt", "agent", "email", "ws-notes", "ws-shared"] },
      { id: "ask", label: "Ask-my-meetings answers", hoursSavedPerMonth: 140, roleId: "knowledgeWorker", componentIds: ["chat", "retrieval", "search", "embed", "docs", "ws-ask", "ws-shared"] },
    ],
    avoidedCosts: [{ id: "licence", label: "Retire third-party transcription licence", monthly: 4000, startMonth: 10 }],
    oneOff: [],
  },
  roi: {
    basis: "full", benefitPreset: "typical", devCutPct: 0, maintCutPct: 0,
    transitionCosts: [{ id: "dual", label: "Dual running and training", monthly: 3000, fromMonth: 7, toMonth: 9 }],
    growthPctPerYear: 10, rateEscalationPctPerYear: 2, discountRatePct: 8,
  },
  scenarios: [
    { id: "mini-chat", label: "Chat on GPT-5.4-mini", edits: [{ kind: "set", path: ["workloads", "chat", "modelId"], value: "gpt-5.4-mini" }] },
    { id: "lean-build", label: "Lean build: 5 months, narrow bake-off, Batch regression", edits: [{ kind: "set", path: ["timeline", "buildMonths"], value: 5 }, { kind: "lever", leverId: "narrowBakeoff" }, { kind: "lever", leverId: "batchRegression" }] },
    { id: "half-usage", label: "Half the expected usage", edits: [{ kind: "scaleUsage", factor: 0.5 }] },
  ],
};
