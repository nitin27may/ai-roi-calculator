import type { ProcessingTier } from "@studio/catalog";

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
  /** Processing tier this line billed at (Standard when absent); keeps PTU and other per-meter grouping from merging tiers. */
  tier?: ProcessingTier;
}

export const line = (l: Omit<Line, "cost"> & { cost?: number }): Line => ({ ...l, cost: l.cost ?? l.quantity * l.unitPrice });

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-CA");

const fmtNum = (v: number, d = 0) => v.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (v: number) => (v < 0 ? "−" : "");

/** CAD, always shown as C$ so a screenshot or printout can never be mistaken for USD. */
export const cad = (v: number, d = 0) => `${sign(v)}C$${fmtNum(Math.abs(v), d)}`;

/** CAD in millions, e.g. C$1.2M. */
export const compactCad = (v: number) => `${sign(v)}C$${fmtNum(Math.abs(v) / 1_000_000, 1)}M`;

/** Compact CAD: thousands as C$Nk, millions and above as compactCad, otherwise the full amount. */
export const kcad = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return compactCad(v);
  if (a >= 1000) return `${sign(v)}C$${fmtNum(a / 1000)}k`;
  return cad(v);
};
