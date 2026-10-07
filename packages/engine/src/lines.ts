import type { ProcessingTier } from "@roi-calculator/catalog";

/** Which part of the lifecycle a cost belongs to. `env` is the cost of non-production environments (A6); `delivery` is non-labour delivery cost (A9). */
export type Stream = "labour" | "devlab" | "devenv" | "run" | "platform" | "maint" | "transition" | "env" | "delivery";

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
  tokens?: { input: number; cachedInput: number; output: number; cacheWrite?: number };
  /** Processing tier this line billed at (Standard when absent); keeps PTU and other per-meter grouping from merging tiers. */
  tier?: ProcessingTier;
  /** A one-time cost (backfill, set-up fee), billed once rather than every month; excluded from run-rate figures. */
  once?: boolean;
  /** Project month a one-time line lands in, when its own item names one; otherwise the owner's first month. */
  onceMonth?: number;
  /** The Azure deployment an LLM line was priced for; lets PTU analysis compare against that deployment's own price. */
  deployment?: "global" | "regional" | "dataZone";
  /** Snowflake lines only: the credits behind the CAD figure. Credits for a line = quantity x creditsPerUnit. */
  credit?: { type: "ai" | "platform"; creditsPerUnit: number; cadPerCredit: number; manual: boolean };
  /** A hand-typed amount (Dev Lab cell or monthly allowance): final as typed, so contingency and the AI dev-cost cut are not applied on top. */
  manual?: boolean;
  /** For a typed cell: what the calculation gave for it, so the screen can show what was replaced. */
  calculated?: number;
  /** Pay-as-you-go spillover of a workload in PTU mode; the rest of its load runs on the provisioned capacity. */
  onPtu?: boolean;
}

export const line = (l: Omit<Line, "cost"> & { cost?: number }): Line => ({ ...l, cost: l.cost ?? l.quantity * l.unitPrice });

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-CA");

const fmtNum = (v: number, d = 0) => v.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (v: number) => (v < 0 ? "−" : "");

/** CAD, always shown as C$ so a screenshot or printout can never be mistaken for USD. */
export const cad = (v: number, d = 0) => `${sign(v)}C$${fmtNum(Math.abs(v), d)}`;

/**
 * CAD for small per-unit amounts, which `cad()`'s default 0 decimals would round to C$0: two
 * decimals under C$10 (C$0.26), four decimals under C$0.01 (C$0.0021), otherwise `cad()` as usual.
 */
export const cadUnit = (v: number) => {
  const a = Math.abs(v);
  if (a > 0 && a < 0.01) return cad(v, 4);
  if (a > 0 && a < 10) return cad(v, 2);
  return cad(v);
};

/** CAD in millions, e.g. C$1.2M. */
export const compactCad = (v: number) => `${sign(v)}C$${fmtNum(Math.abs(v) / 1_000_000, 1)}M`;

/** Compact CAD: thousands as C$Nk, millions and above as compactCad, otherwise the full amount. */
export const kcad = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return compactCad(v);
  if (a >= 1000) return `${sign(v)}C$${fmtNum(a / 1000)}k`;
  return cad(v);
};
