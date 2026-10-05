import type { Percentile } from "./harness.js";

/**
 * How far a percentile moves a workload away from its typical (P50) size. These are documented assumptions, not measurements:
 * - Agents use the harness simulation (`heuristics.agents.p90`), plus `AGENT_P10` for the low end.
 * - Chat and LLM-call workloads scale every token count by `TOKEN_SPREAD`: P10 is a lean day, P90 a heavy one.
 * Workloads priced per page, hour, request or row have no token spread and stay at their entered size.
 */
export const TOKEN_SPREAD: Record<Percentile, number> = { p10: 0.7, p50: 1, p90: 1.4, worst: 1.4 };

/** Low end of an agent run: fewer steps and smaller tool results than typical. */
export const AGENT_P10 = { steps: 0.6, toolResult: 0.75 } as const;

export const tokenSpread = (p: Percentile): number => TOKEN_SPREAD[p];
