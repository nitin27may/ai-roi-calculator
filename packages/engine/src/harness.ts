import { heuristics } from "@studio/catalog";
import type { PriceBook } from "./pricing.js";
import { AGENT_P10 } from "./spread.js";

export type Percentile = "p10" | "p50" | "p90" | "worst";
export type ReasoningEffort = "none" | "low" | "medium" | "high";

/** One agent loop. Token sizes are in o200k tokens; the model's tokenizer multiplier is applied on top. */
export interface HarnessDef {
  id: string;
  label: string;
  systemPromptTokens: number;
  tools: number;
  tokensPerTool: number;
  userInputTokens: number;
  /** Typical (P50) LLM calls per task. */
  steps: number;
  toolCallsPerStep: number;
  toolResultTokens: number;
  outputPerStep: number;
  finalOutputTokens: number;
  reasoning: ReasoningEffort | number;
  /** Newer Claude and stored-reasoning setups keep prior reasoning in context (billed as input). */
  keepReasoning: boolean;
  maxTurns: number;
  maxTokensPerCall: number;
  /** Compaction trigger; 0 disables compaction (the model context window is then the cap). */
  compactAtTokens: number;
  compactSummaryTokens: number;
  retryRate: number;
  /** Total tokens (input plus output) one task may spend; the loop stops after the call that crosses it. Absent or 0 means no budget. */
  tokenBudget?: number;
  /** Code the model writes per step (billed as output, kept in history). Absent means 0. */
  codeTokensPerStep?: number;
  /** What running that code prints back per step (kept in history). Absent means 0. */
  execOutputTokensPerStep?: number;
}

/**
 * Why a run ended.
 * - finished: the task needed no more steps than `maxTurns` allows.
 * - maxTurns: the task wanted more steps than `maxTurns` (or this is the worst case, which always runs to the cap).
 * - tokenBudget: the task's total tokens reached `tokenBudget`, so the loop stopped early.
 * - contextWindow: the history outgrew the model's context window (or the compaction trigger had nothing to fall back on)
 *   and was cut off. The run keeps going on the cut history, as it always has, so saved totals do not change.
 */
export type StopReason = "finished" | "maxTurns" | "tokenBudget" | "contextWindow";

export interface RunOptions {
  modelId: string;
  /** Probability the previous request's prompt is still cached. */
  cacheHit: number;
  /** Share of the static prefix (system + tools) that is warm from other tasks. */
  warmPrefix?: number;
  percentile: Percentile;
  date: string;
}

export interface StepTrace {
  step: number;
  promptTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  cost: number;
  compacted: boolean;
}

export interface RunResult {
  steps: number;
  inputTokens: number;
  cachedTokens: number;
  /** Tokens written to cache for later reuse (billed at the model's cacheWrite rate, or input if it has none). */
  cacheWriteTokens: number;
  outputTokens: number;
  /** CAD per task, including expected retries for P50/P90. */
  cost: number;
  trace: StepTrace[];
  stopReason: StopReason;
  /** Tokens counted against `tokenBudget`: every prompt token (cached or not) plus every output token, before the retry multiplier. */
  budgetTokens: number;
}

/** Reasoning tokens for an effort level (or an explicit count); shared by the agent harness and the chat/llm workloads. */
export const reasoningTokens = (r: ReasoningEffort | number) => (typeof r === "number" ? r : heuristics.agents.reasoningPerStep[r]);

/**
 * Step-by-step simulation of an agent loop: every call re-sends the prefix plus the growing
 * history, so input grows roughly quadratically with steps. Caching, compaction and caps are
 * applied per step, which a closed form cannot do exactly.
 */
export function simulateHarness(h: HarnessDef, book: PriceBook, o: RunOptions): RunResult {
  const model = book.chatModel(o.modelId);
  const tk = book.tokenizerMultiplier(o.modelId);
  const worst = o.percentile === "worst";
  const p90 = o.percentile === "p90";
  const p10 = o.percentile === "p10";

  const wanted = worst ? h.maxTurns : Math.max(1, Math.ceil(h.steps * (p90 ? heuristics.agents.p90.steps : p10 ? AGENT_P10.steps : 1)));
  const T = Math.min(h.maxTurns, wanted);
  const toolResult = h.toolResultTokens * (p90 || worst ? heuristics.agents.p90.toolResult : p10 ? AGENT_P10.toolResult : 1);
  const overhead = h.tools > 0 ? model.toolUseOverheadTokens : 0;
  const staticPrefix = (h.systemPromptTokens + h.tools * h.tokensPerTool) * tk + overhead;
  // Below the provider's minimum cacheable prompt size, nothing is ever cached or written.
  const cacheable = staticPrefix >= heuristics.agents.minCacheableTokens;
  const eta = worst || !cacheable ? 0 : o.cacheHit;
  const warm = worst || !cacheable ? 0 : (o.warmPrefix ?? 0);
  const P = staticPrefix + h.userInputTokens * tk;
  const reason = reasoningTokens(h.reasoning);
  const code = h.codeTokensPerStep ?? 0;
  const exec = h.execOutputTokensPerStep ?? 0;
  const budget = h.tokenBudget && h.tokenBudget > 0 ? h.tokenBudget : Infinity;
  const cap = Math.min(h.compactAtTokens > 0 ? h.compactAtTokens : Infinity, model.contextWindow - h.maxTokensPerCall);

  let hist = 0;
  let prevPrompt = 0;
  let cacheBroken = false;
  const trace: StepTrace[] = [];
  let inT = 0, cachedT = 0, cacheWriteT = 0, outT = 0, cost = 0;
  let used = 0, clipped = false, stoppedByBudget = false;

  for (let k = 1; k <= T; k++) {
    // The budget is checked between calls: the call that crosses it finishes, then the loop stops.
    if (k > 1 && used >= budget) { stoppedByBudget = true; break; }
    let compacted = false;
    let prompt = P + hist;
    if (prompt > cap) {
      if (h.compactAtTokens > 0 && !worst) {
        // Summarise the history in a separate call, then continue from the summary.
        const sumOut = h.compactSummaryTokens * tk;
        cost += book.chatCost(o.modelId, { input: prompt, output: sumOut }, o.date, prompt);
        inT += prompt;
        outT += sumOut;
        used += prompt + sumOut;
        hist = sumOut;
        prompt = P + hist;
        cacheBroken = true;
        compacted = true;
      } else { prompt = cap; clipped = true; }
    }
    const cached = k === 1 ? warm * staticPrefix : cacheBroken ? 0 : eta * Math.min(prevPrompt, prompt);
    // The static prefix is written once per cache lifetime: on the first call, for the share that isn't already warm.
    const write = k === 1 && (eta > 0 || warm > 0) ? (1 - warm) * staticPrefix : 0;
    cacheBroken = false;
    const last = k === T;
    const visible = (last ? h.finalOutputTokens : h.outputPerStep + code) * tk;
    const out = Math.min(h.maxTokensPerCall, visible + reason);
    const stepCost = book.chatCost(o.modelId, { input: prompt - cached - write, cachedInput: cached, output: out, cacheWrite: write }, o.date, prompt);
    trace.push({ step: k, promptTokens: prompt, cachedTokens: cached, cacheWriteTokens: write, outputTokens: out, cost: stepCost, compacted });
    inT += prompt - cached - write;
    cachedT += cached;
    cacheWriteT += write;
    outT += out;
    used += prompt + out;
    cost += stepCost;
    prevPrompt = prompt;
    hist += (h.outputPerStep + (last ? 0 : code)) * tk + (h.keepReasoning ? reason : 0) + (last ? 0 : (h.toolCallsPerStep * toolResult + exec) * tk);
  }
  const retry = worst ? 1 : 1 + h.retryRate;
  const stopReason: StopReason = stoppedByBudget ? "tokenBudget" : clipped ? "contextWindow" : wanted > h.maxTurns || worst ? "maxTurns" : "finished";
  return { steps: trace.length, inputTokens: inT, cachedTokens: cachedT, cacheWriteTokens: cacheWriteT, outputTokens: outT, cost: cost * retry, trace, stopReason, budgetTokens: used };
}
