/** Which part of the lifecycle a cost belongs to. */
export type Stream = "labour" | "devlab" | "devenv" | "run" | "platform" | "maint" | "transition";

/** usage: scales with adoption in production. fixed: billed in full from go-live. */
export type Behaviour = "usage" | "fixed";

export interface Line {
  /** Stable id: `${componentId}:${part}`. */
  id: string;
  componentId: string;
  label: string;
  stream: Stream;
  behaviour: Behaviour;
  /** Catalogue id of the price used, for aggregation and free tiers. */
  meter: string;
  quantity: number;
  unit: string;
  /** CAD per unit. */
  unitPrice: number;
  /** CAD. */
  cost: number;
  formula: string;
  /** Workstream the cost belongs to (build lines only); absent means project-wide. */
  workstreamId?: string;
  /** Index of the build team line a labour line comes from. */
  seat?: number;
  /** For LLM lines: tokens per unit of quantity (per call, task or run). */
  tokens?: { input: number; cachedInput: number; output: number };
}

export const line = (l: Omit<Line, "cost"> & { cost?: number }): Line => ({ ...l, cost: l.cost ?? l.quantity * l.unitPrice });

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-CA");
