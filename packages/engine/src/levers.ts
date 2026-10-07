import type { Catalog } from "@roi-calculator/catalog";
import type { Project } from "./project.js";
import { buildLedger } from "./ledger.js";
import { computeRoi } from "./roi.js";
import { PriceBook, monthDate } from "./pricing.js";

/**
 * Concrete ways to cut cost, each a pure transform of the project. The app shows the saving
 * each one would give on the project's current cost basis and lets the user apply it.
 */
export interface Lever {
  id: string;
  label: string;
  detail: string;
  phase: "build" | "production";
  applies: (p: Project, cat: Catalog) => boolean;
  apply: (p: Project, cat: Catalog) => Project;
}

const clone = (p: Project): Project => structuredClone(p);
const mapActs = (p: Project, f: (a: Project["build"]["activities"][number]) => Project["build"]["activities"][number]) => {
  const q = clone(p);
  q.build.activities = q.build.activities.map(f);
  return q;
};

export const LEVERS: Lever[] = [
  {
    id: "narrowBakeoff", phase: "build", label: "Narrow the bake-off after month 1",
    detail: "Keep the first two candidate models from month 2; drop the rest after one month of results.",
    applies: (p) => p.build.activities.some((a) => a.kind === "bakeoff" && a.candidates.length > 2 && a.candidates.slice(2).some((c) => (c.toMonth ?? p.timeline.buildMonths) > 1)),
    apply: (p) => mapActs(p, (a) => (a.kind === "bakeoff" ? { ...a, candidates: a.candidates.map((c, i) => (i < 2 ? c : { ...c, toMonth: Math.min(c.toMonth ?? 99, 1) })) } : a)),
  },
  {
    id: "batchRegression", phase: "build", label: "Send nightly regression through Batch",
    detail: "Overnight runs tolerate a 24-hour turnaround; Batch is 50% off on supported models.",
    applies: (p) => p.build.activities.some((a) => a.kind === "regression" && a.batchShare < 1),
    apply: (p) => mapActs(p, (a) => (a.kind === "regression" ? { ...a, batchShare: 1 } : a)),
  },
  {
    id: "batchBakeoff", phase: "build", label: "Run bake-off sweeps through Batch",
    detail: "Bake-off sweeps are offline comparisons; Batch halves the token price where supported.",
    applies: (p) => p.build.activities.some((a) => a.kind === "bakeoff" && a.batchShare < 1),
    apply: (p) => mapActs(p, (a) => (a.kind === "bakeoff" ? { ...a, batchShare: 1 } : a)),
  },
  {
    id: "devCache", phase: "build", label: "Stabilise the prompt prefix in dev",
    detail: "Keep system prompt and tool definitions fixed between runs to lift dev cache hits to 60%.",
    applies: (p) => p.build.activities.some((a) => (a.kind === "iterations" || a.kind === "bakeoff") && a.cacheHit < 0.6),
    apply: (p) => mapActs(p, (a) => (a.kind === "iterations" || a.kind === "bakeoff" ? { ...a, cacheHit: Math.max(a.cacheHit, 0.6) } : a)),
  },
  {
    id: "sampleEval", phase: "build", label: "Score 40% of iteration and bake-off runs",
    detail: "Judge a stratified sample during development; keep full scoring for regression and release candidates.",
    applies: (p) => p.build.activities.some((a) => a.kind === "evaluation" && (a.scoredShare.bakeoff > 0.4 || a.scoredShare.iterations > 0.4)),
    apply: (p) => mapActs(p, (a) => (a.kind === "evaluation" ? { ...a, scoredShare: { ...a.scoredShare, bakeoff: Math.min(0.4, a.scoredShare.bakeoff), iterations: Math.min(0.4, a.scoredShare.iterations) } } : a)),
  },
  {
    id: "routeChat", phase: "production", label: "Route simple chat turns to a mini model",
    detail: "A model router sends about 60% of turns to gpt-5.4-mini.",
    applies: (p, cat) => cat.chatModels.some((m) => m.id === "gpt-5.4-mini") && p.workloads.some((w) => w.kind === "chat" && !w.router && w.modelId !== "gpt-5.4-mini"),
    apply: (p) => {
      const q = clone(p);
      q.workloads = q.workloads.map((w) => (w.kind === "chat" && !w.router ? { ...w, router: { modelId: "gpt-5.4-mini", share: 0.6 } } : w));
      return q;
    },
  },
  {
    id: "cheapestStt", phase: "production", label: "Use the cheapest transcription engine",
    detail: "Switch to the lowest-cost engine that is not retiring during the plan and supports diarization.",
    applies: (p, cat) => p.workloads.some((w) => w.kind === "transcription" && cheapestStt(p, cat) !== w.engineId),
    apply: (p, cat) => {
      const q = clone(p);
      const best = cheapestStt(p, cat);
      q.workloads = q.workloads.map((w) => (w.kind === "transcription" ? { ...w, engineId: best } : w));
      return q;
    },
  },
];

function cheapestStt(p: Project, cat: Catalog): string {
  const book = new PriceBook(cat, p.settings);
  const end = monthDate(p.startDate, p.timeline.horizonMonths);
  const mid = monthDate(p.startDate, p.timeline.buildMonths + 1);
  const ok = cat.speechEngines.filter((e) => e.diarization !== "none" && e.mode === "batch" && (!e.lifecycle.retiresOn || e.lifecycle.retiresOn > end));
  ok.sort((a, b) => book.speechPerHour(a.id, end) + book.speechPerHour(a.id, mid) - (book.speechPerHour(b.id, end) + book.speechPerHour(b.id, mid)));
  return ok[0]?.id ?? "speech-batch";
}

export interface LeverOption { lever: Lever; saving: number }

/** Savings each applicable lever would give over the horizon on the project's cost basis. */
export function evaluateLevers(p: Project, cat: Catalog): LeverOption[] {
  const base = computeRoi(buildLedger(p, cat), p.roi.basis).totalCost;
  return LEVERS.filter((l) => l.applies(p, cat))
    .map((lever) => ({ lever, saving: base - computeRoi(buildLedger(lever.apply(p, cat), cat), p.roi.basis).totalCost }))
    .sort((a, b) => b.saving - a.saving);
}
