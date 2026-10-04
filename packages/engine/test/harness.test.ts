import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PriceBook } from "../src/pricing.js";
import { simulateHarness, type HarnessDef } from "../src/harness.js";

const cat = loadCatalog();
const book = new PriceBook(cat, { azureDeployment: "dataZone", snowflake: { routing: "global", edition: "enterprise" } });
// Worked example from docs/research/06 §1.2: P = 5,000, g = 2,250, T = 8, h = 1,000.
const h: HarnessDef = {
  id: "ex", label: "example", systemPromptTokens: 1500, tools: 10, tokensPerTool: 280, userInputTokens: 700,
  steps: 8, toolCallsPerStep: 1.3, toolResultTokens: 1500, outputPerStep: 300, finalOutputTokens: 300,
  reasoning: 1000, keepReasoning: false, maxTurns: 25, maxTokensPerCall: 16000, compactAtTokens: 0, compactSummaryTokens: 3000, retryRate: 0,
};
// Read from the catalogue so a price refresh does not invalidate the token arithmetic under test.
const gpt5 = cat.chatModels.find((m) => m.id === "gpt-5")!.prices!.dataZone!;

describe("agent harness simulation", () => {
  it("reproduces the uncached worked example (103K in, 10.4K out)", () => {
    const r = simulateHarness(h, book, { modelId: "gpt-5", cacheHit: 0, percentile: "p50", date: "2026-11-01" });
    expect(r.inputTokens).toBeCloseTo(103000, 0);
    expect(r.outputTokens).toBe(10400);
    expect(r.cost).toBeCloseTo((103000 * gpt5.input + 10400 * gpt5.output) / 1e6, 6);
  });

  it("reproduces the cached example (82.25K cached, 20.75K new)", () => {
    const r = simulateHarness(h, book, { modelId: "gpt-5", cacheHit: 1, warmPrefix: 0, percentile: "p50", date: "2026-11-01" });
    expect(r.cachedTokens).toBeCloseTo(82250, 0);
    expect(r.inputTokens).toBeCloseTo(20750, 0);
  });

  it("orders P50 < P90 < worst and respects the turn cap", () => {
    const run = (percentile: "p50" | "p90" | "worst") => simulateHarness({ ...h, maxTurns: 10 }, book, { modelId: "gpt-5", cacheHit: 0.8, percentile, date: "2026-11-01" });
    const [a, b, c] = [run("p50"), run("p90"), run("worst")];
    expect(a.cost).toBeLessThan(b.cost);
    expect(b.cost).toBeLessThan(c.cost);
    expect(b.steps).toBeLessThanOrEqual(10);
    expect(c.steps).toBe(10);
  });

  it("caps output per call at maxTokensPerCall", () => {
    const r = simulateHarness({ ...h, reasoning: "high", maxTokensPerCall: 4096 }, book, { modelId: "gpt-5", cacheHit: 0, percentile: "p50", date: "2026-11-01" });
    expect(Math.max(...r.trace.map((t) => t.outputTokens))).toBe(4096);
  });

  it("compaction keeps prompts under the trigger", () => {
    const r = simulateHarness({ ...h, steps: 40, maxTurns: 40, compactAtTokens: 30000 }, book, { modelId: "gpt-5", cacheHit: 0.8, percentile: "p50", date: "2026-11-01" });
    expect(r.trace.some((t) => t.compacted)).toBe(true);
    expect(Math.max(...r.trace.map((t) => t.promptTokens))).toBeLessThanOrEqual(30000);
  });

  it("applies the Claude 4.7+ tokenizer multiplier and tool-use overhead", () => {
    const g = simulateHarness(h, book, { modelId: "gpt-5", cacheHit: 0, percentile: "p50", date: "2026-11-01" });
    const c = simulateHarness(h, book, { modelId: "claude-sonnet-5-5", cacheHit: 0, percentile: "p50", date: "2026-11-01" });
    expect(c.inputTokens / g.inputTokens).toBeGreaterThan(1.3);
  });
});
