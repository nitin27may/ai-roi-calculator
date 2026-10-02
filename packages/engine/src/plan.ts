import type { DevActivity } from "./project.js";

/**
 * The month plan of a Dev Lab activity: the value it uses each build month (sweeps for a
 * bake-off, an intensity factor for everything else) and whether the month is inside its window.
 * Evaluation has no plan of its own: it scores the runs of the other activities.
 */
export type PlannedActivity = Exclude<DevActivity, { kind: "evaluation" }>;
export const hasPlan = (a: DevActivity): a is PlannedActivity => a.kind !== "evaluation";

const planKey = (a: PlannedActivity) => (a.kind === "bakeoff" ? "sweepsPerMonth" : "monthFactors");
const at = (xs: number[], i: number) => xs[Math.min(i, xs.length - 1)] ?? 0;

export function planValues(a: PlannedActivity, buildMonths: number): number[] {
  const xs = (a as unknown as Record<string, number[]>)[planKey(a)]!;
  return Array.from({ length: buildMonths }, (_, i) => at(xs, i));
}

export function inPlanWindow(a: PlannedActivity, m: number, buildMonths: number): boolean {
  if (a.kind === "regression" || a.kind === "redteam") return m >= a.fromMonth && m <= (a.toMonth ?? buildMonths);
  if (a.kind === "bakeoff") return a.candidates.some((c) => m >= c.fromMonth && m <= (c.toMonth ?? buildMonths));
  return true;
}

/** Set month m (1-based) of the plan; the stored array is expanded to the full build length. */
export function setPlanValue(a: PlannedActivity, m: number, v: number, buildMonths: number): void {
  const xs = planValues(a, buildMonths);
  xs[m - 1] = v;
  (a as unknown as Record<string, number[]>)[planKey(a)] = xs;
}

export const PLAN_SHAPES = [
  { id: "flat", label: "Flat" },
  { id: "rampUp", label: "Ramp up" },
  { id: "frontLoaded", label: "Front-loaded" },
  { id: "lateOnly", label: "Final third only" },
] as const;
export type PlanShape = (typeof PLAN_SHAPES)[number]["id"];

/** Factors 0–1 for a shape over n months. */
export function shapeFactors(shape: PlanShape, n: number): number[] {
  const r = (x: number) => Math.round(x * 100) / 100;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 1 : i / (n - 1);
    switch (shape) {
      case "flat": return 1;
      case "rampUp": return r(0.25 + 0.75 * t);
      case "frontLoaded": return r(1 - 0.75 * t);
      case "lateOnly": return i >= Math.floor((n * 2) / 3) ? 1 : 0;
    }
  });
}

/** Apply a shape, scaled so its peak equals the activity's current peak (sweeps keep their size). */
export function applyShape(a: PlannedActivity, shape: PlanShape, buildMonths: number): void {
  const peak = Math.max(1, ...planValues(a, buildMonths));
  const xs = shapeFactors(shape, buildMonths).map((f) => (a.kind === "bakeoff" ? Math.round(f * peak) : f));
  (a as unknown as Record<string, number[]>)[planKey(a)] = xs;
}
