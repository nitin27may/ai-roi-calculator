import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { PriceBook, cascadeCall, harnessUsage, meetingIntelligence, newHarness, voiceCall, type Workload } from "../src/index.js";

const cat = loadCatalog();
const book = new PriceBook(cat, { azureDeployment: "dataZone", snowflake: { routing: "global", edition: "enterprise" } });
type Voice = Extract<Workload, { kind: "voiceAgent" }>;
const base: Voice = { kind: "voiceAgent", id: "v", label: "Voice", modelId: "gpt-realtime-2.1-mini", callsPerMonth: 1000, minutesPerCall: 5, turnsPerCall: 1, agentTalkShare: 0.5, systemPromptTokens: 1500, cacheHit: 0, telephonyPerMinute: 0 };

describe("voice agent", () => {
  it("prices a single-turn call from audio seconds", () => {
    const m = cat.realtimeModels.find((x) => x.id === base.modelId)!;
    const expected = (150 * 10 * m.audio.input + 150 * 20 * m.audio.output + 1500 * m.text.input) / 1e6;
    expect(voiceCall(base, book).cost).toBeCloseTo(expected, 8);
  });
  it("grows with turns because history is re-read, and caching softens it", () => {
    const many = voiceCall({ ...base, turnsPerCall: 12 }, book).cost;
    const cached = voiceCall({ ...base, turnsPerCall: 12, cacheHit: 0.8 }, book).cost;
    expect(many).toBeGreaterThan(voiceCall(base, book).cost);
    expect(cached).toBeLessThan(many);
  });
  it("compares with a cascade of speech-to-text, LLM and text-to-speech", () => {
    const c = cascadeCall({ ...base, turnsPerCall: 12, cacheHit: 0.8 }, book, "2027-01-01", { sttId: "speech-batch", llmId: "gpt-5.4-mini", ttsId: "tts-neural" });
    expect(c.stt).toBeGreaterThan(0);
    expect(c.llm).toBeGreaterThan(0);
    expect(c.tts).toBeGreaterThan(0);
    expect(c.cost).toBeCloseTo(c.stt + c.llm + c.tts, 10);
  });

  it("applies the LLM model's own tokenizer multiplier in the cascade leg (E5)", () => {
    const v: Voice = { ...base, turnsPerCall: 1, cacheHit: 0 };
    const c = cascadeCall(v, book, "2027-01-01", { sttId: "speech-batch", llmId: "claude-sonnet-5-5", ttsId: "tts-neural" });
    const tk = 1.33 * book.tokenizerMultiplier("claude-sonnet-5-5");
    const words = 2.5 * 140; // callerMin × wordsPerMinute, one turn
    const expected = book.chatCost("claude-sonnet-5-5", { input: 1500 + words * tk, cachedInput: 0, output: words * tk }, "2027-01-01");
    expect(c.llm).toBeCloseTo(expected, 8);
  });
});

describe("harness management", () => {
  it("creates uniquely named harnesses and reports where one is used", () => {
    const p = structuredClone(meetingIntelligence);
    const h = newHarness(p);
    expect(p.harnesses.some((x) => x.id === h.id)).toBe(false);
    expect(harnessUsage(p, "followup").length).toBeGreaterThan(2);
    expect(harnessUsage(p, h.id)).toEqual([]);
  });
});
