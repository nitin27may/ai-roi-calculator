/** Which part of the lifecycle a cost belongs to. */
export type Stream = "labour" | "devlab" | "devenv" | "run" | "platform" | "maint";

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
}

export const line = (l: Omit<Line, "cost"> & { cost?: number }): Line => ({ ...l, cost: l.cost ?? l.quantity * l.unitPrice });

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-CA");
