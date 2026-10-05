import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PriceBook, buildLedger, meetingIntelligence, workloadLines, type Workload } from "../src/index.js";

const cat = loadCatalog();
const DATE = "2026-11-01";
const settings = { azureDeployment: "dataZone" as const, language: "en", snowflake: { routing: "global" as const, edition: "enterprise" as const } };
const book = new PriceBook(cat, settings);
const ctx = { book, date: DATE, harnesses: new Map(), percentile: "p50" as const };
const cost = (lines: ReturnType<typeof workloadLines>) => lines.reduce((a, l) => a + l.cost, 0);

describe("E16: embeddings, continuousEval, contentSafety and llm workloads", () => {
  it("prices embeddings at the model's per-1M rate", () => {
    const w: Workload = { kind: "embeddings", id: "embed", label: "Embeddings", tokensPerMonth: 10_000_000, modelId: "text-embedding-3-small" };
    const [l] = workloadLines(w, ctx);
    const per = book.embeddingPer1M("text-embedding-3-small");
    expect(l!.cost).toBeCloseTo(10 * per, 6);
  });

  it("prices continuousEval as a judge line (plus safety evaluators when asked)", () => {
    const w: Workload = {
      kind: "continuousEval", id: "ceval", label: "Eval", interactionsPerMonth: 10_000, sampleShare: 0.1, judgeModelId: "gpt-5.4-mini",
      evaluators: ["groundedness", "relevance"], contextTokens: 1000, responseTokens: 300, safetyEvaluators: 2,
    };
    const lines = workloadLines(w, ctx);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.id).toBe("ceval:judge");
    expect(lines[1]!.id).toBe("ceval:safety");
    expect(lines[0]!.quantity).toBeCloseTo(1000, 6);
    expect(cost(lines)).toBeGreaterThan(0);
  });

  it("prices contentSafety per 1K-record unit across every listed meter", () => {
    const w: Workload = { kind: "contentSafety", id: "safety", label: "Safety", requestsPerMonth: 50_000, charsPerRequest: 1500, unitPriceIds: ["safety-text", "safety-prompt-shields"] };
    const lines = workloadLines(w, ctx);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.meter)).toEqual(["safety-text", "safety-prompt-shields"]);
    for (const l of lines) expect(l.cost).toBeGreaterThan(0);
  });

  it("prices llm calls from explicit token counts, split by batchShare", () => {
    const w: Workload = { kind: "llm", id: "calls", label: "Calls", callsPerMonth: 1000, modelId: "gpt-5.4-mini", inputTokens: 900, cachedInputTokens: 100, outputTokens: 60, batchShare: 0, reasoning: "none" };
    const [l] = workloadLines(w, ctx);
    const tk = book.tokenizerMultiplier("gpt-5.4-mini");
    const per = book.chatCost("gpt-5.4-mini", { input: 900 * tk, cachedInput: 100 * tk, output: 60 * tk }, DATE, 1000 * tk);
    expect(l!.cost).toBeCloseTo(1000 * per, 6);
  });
});

describe("E2: reasoning tokens bill as output, only for reasoning models", () => {
  it("adds reasoning tokens for an llm workload on a reasoning model", () => {
    const base: Workload = { kind: "llm", id: "calls", label: "Calls", callsPerMonth: 100, modelId: "gpt-5.4", inputTokens: 500, cachedInputTokens: 0, outputTokens: 200, batchShare: 0, reasoning: "none" };
    const none = cost(workloadLines(base, ctx));
    const low = cost(workloadLines({ ...base, reasoning: "low" }, ctx));
    expect(low).toBeGreaterThan(none);
  });

  it("does not add reasoning tokens for a non-reasoning model", () => {
    const base: Workload = { kind: "llm", id: "calls", label: "Calls", callsPerMonth: 100, modelId: "gpt-4.1", inputTokens: 500, cachedInputTokens: 0, outputTokens: 200, batchShare: 0, reasoning: "none" };
    const none = cost(workloadLines(base, ctx));
    const high = cost(workloadLines({ ...base, reasoning: "high" }, ctx));
    expect(high).toBeCloseTo(none, 9);
  });
});

describe("E3: language multiplier scales chat and llm text tokens", () => {
  it("prices a French llm workload above the same English one", () => {
    const en: Workload = { kind: "llm", id: "calls", label: "Calls", callsPerMonth: 100, modelId: "gpt-5", inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200, batchShare: 0, reasoning: "none", language: "en" };
    const fr = { ...en, language: "fr" };
    expect(cost(workloadLines(fr, ctx))).toBeCloseTo(cost(workloadLines(en, ctx)) * 1.3, 6);
  });

  it("falls back to the project's default language when a workload doesn't set its own", () => {
    const w: Workload = { kind: "llm", id: "calls", label: "Calls", callsPerMonth: 100, modelId: "gpt-5", inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200, batchShare: 0, reasoning: "none" };
    expect(cost(workloadLines(w, { ...ctx, language: "fr" }))).toBeCloseTo(cost(workloadLines({ ...w, language: "fr" }, ctx)), 6);
  });
});

describe("E1: chat workload bills a cache write on the first turn of each conversation", () => {
  const base: Workload = {
    kind: "chat", id: "chat", label: "Chat", users: 100, conversationsPerUser: 10, turns: 4, modelId: "claude-sonnet-5-5",
    systemPromptTokens: 600, userTurnTokens: 100, assistantTurnTokens: 400, topK: 5, chunkTokens: 512, cacheHit: 0.4, reasoning: "none",
  };

  it("has no cacheWrite tokens when cacheHit is 0, and some when it is not", () => {
    const [cold] = workloadLines({ ...base, cacheHit: 0 }, ctx);
    const [warm] = workloadLines(base, ctx);
    expect(cold!.tokens!.cacheWrite ?? 0).toBe(0);
    expect(warm!.tokens!.cacheWrite).toBeGreaterThan(0);
  });

  it("bills the write at the model's cacheWrite rate", () => {
    const [l] = workloadLines(base, ctx);
    const m = book.chatModel("claude-sonnet-5-5");
    expect(m.prices!.dataZone!.cacheWrite).toBeDefined();
    const write = l!.tokens!.cacheWrite!;
    const expectedExtra = write * (m.prices!.dataZone!.cacheWrite! - m.prices!.dataZone!.input) / 1e6;
    expect(expectedExtra).toBeGreaterThan(0);
  });
});

describe("E4: production agent warms the harness prefix above the volume threshold", () => {
  it("costs less per task at high volume than the same harness at low volume", () => {
    const harnesses = new Map(meetingIntelligence.harnesses.map((h) => [h.id, h]));
    const low: Workload = { kind: "agent", id: "agent", label: "Agent", harnessId: "followup", modelId: "gpt-5.4", tasksPerMonth: 10, cacheHit: 0.8, toolFees: [] };
    const high = { ...low, tasksPerMonth: 5000 };
    const perTask = (w: Workload) => { const [l] = workloadLines(w, { ...ctx, harnesses }); return l!.unitPrice; };
    expect(perTask(high)).toBeLessThan(perTask(low));
  });
});

describe("ledger: free allowances", () => {
  it("reduces a meter's billed quantity by its monthly free allowance (search-semantic, 1K queries free)", () => {
    const u = cat.unitPrices.find((x) => x.id === "search-semantic")!;
    expect(u.freePerMonth).toBeGreaterThan(0);
    const L = buildLedger(meetingIntelligence, cat);
    const month = L.months.find((m) => m.phase === "production" && m.adoption >= 1)!;
    const l = month.lines.find((x) => x.meter === "search-semantic")!;
    const naive = l.quantity * l.unitPrice;
    expect(l.cost).toBeLessThan(naive);
    expect(l.cost).toBeCloseTo(naive * Math.max(0, l.quantity - u.freePerMonth!) / l.quantity, 6);
    expect(l.formula).toContain("free allowance");
  });
});
