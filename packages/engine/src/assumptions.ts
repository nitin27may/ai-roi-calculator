import type { Project } from "./project.js";

/**
 * Numbers the model used to fix in code (E13). Each is a setting with the original value as its default, so a project
 * that never touches them keeps its totals. Voice function calls had no cost before, so their default is 0.
 */
export const ASSUMPTION_DEFAULTS = {
  /** Agentic retrieval: the planner model's prompt and answer for each query. */
  plannerInputTokens: 2000,
  plannerOutputTokens: 350,
  /** Red-team probes: output tokens the safety evaluator bills to score each probe. */
  redTeamScoringOutputTokens: 200,
  /** Voice agent: extra tokens a call spends on tool (function) calling, per turn. */
  voiceFunctionCallInputTokens: 0,
  voiceFunctionCallOutputTokens: 0,
  /** Peak-to-average load for PTU sizing and the TPM quota check. */
  peakToAverage: 3,
} as const;

export type Assumptions = { [K in keyof typeof ASSUMPTION_DEFAULTS]: number };

/** The project's assumptions with defaults filled in. */
export function resolveAssumptions(p: Pick<Project, "settings"> | undefined): Assumptions {
  return { ...ASSUMPTION_DEFAULTS, ...definedOnly(p?.settings.assumptions) };
}

function definedOnly<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
