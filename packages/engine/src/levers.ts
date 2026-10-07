import type { Catalog } from "@roi-calculator/catalog";
import type { Project } from "./project.js";
import { buildLedger } from "./ledger.js";
import { computeRoi, roiOptions } from "./roi.js";
import { PriceBook, monthDate } from "./pricing.js";
import { hidesAiChoices, usesAi } from "./types.js";
import {
  hasDecommissionLines, hasDeliveryRates, hasNonProdEnvironments, hasReservable, hasSeatVolume, hasSkuStep, hasTransactionVolume,
  reserveCoverage, scaleDeliveryLength, scaleNonProdHours, scaleRatesBy, scaleVolumes, shiftDecommission, shiftGoLive, stepSkus,
} from "./transforms.js";

/**
 * Concrete ways to cut cost, each a pure transform of the project. The app shows the saving
 * each one would give on the project's current cost basis and lets the user apply it.
 */
export interface Lever {
  id: string;
  label: string;
  detail: string;
  phase: "build" | "production";
  /** "ai" levers act on models and AI Dev Lab runs; "generic" ones on resources, rates, volumes, timing and adoption. */
  group?: "ai" | "generic";
  /**
   * True when the lever is a way to cut cost (its saving on the cost basis is positive by construction), so Overview and the
   * Report list it. False for what-ifs that can go either way (volume, timing, rates, adoption); the scenario panel shows those too.
   */
  saves?: boolean;
  /** The lever's one setting: how far it moves. Absent for levers with a fixed effect. */
  param?: LeverParam;
  applies: (p: Project, cat: Catalog) => boolean;
  /** `amount` is the lever's setting in `param.unit`; absent means `param.default(p)`. It is clamped to `param.min`..`param.max`. */
  apply: (p: Project, cat: Catalog, amount?: number) => Project;
}

export interface LeverParam {
  label: string;
  unit: "%" | "months";
  min: number;
  max: number;
  step: number;
  default: (p: Project) => number;
  /** One line: what the number means. */
  help: string;
}

/** The setting a lever runs at: `amount` clamped to its bounds, or its default. Levers without a setting return 0. */
export function leverAmount(l: Lever, p: Project, amount?: number): number {
  if (!l.param) return 0;
  const v = amount ?? l.param.default(p);
  return Math.min(l.param.max, Math.max(l.param.min, v));
}

/** AI levers are hidden when the project has chosen types and none is AI (and uses no AI): they could not apply anyway, this keeps it explicit. */
const aiHidden = (p: Project): boolean => hidesAiChoices(p) && !usesAi(p);
/** Whether a lever is offered for a project: it applies, and it is not an AI lever on a project that excludes AI. */
export const leverApplies = (l: Lever, p: Project, cat: Catalog): boolean => !(l.group === "ai" && aiHidden(p)) && l.applies(p, cat);

const clone = (p: Project): Project => structuredClone(p);
const mapActs = (p: Project, f: (a: Project["build"]["activities"][number]) => Project["build"]["activities"][number]) => {
  const q = clone(p);
  q.build.activities = q.build.activities.map(f);
  return q;
};

export const LEVERS: Lever[] = [
  {
    id: "narrowBakeoff", group: "ai", saves: true, phase: "build", label: "Narrow the bake-off after month 1",
    detail: "Keep the first two candidate models from month 2; drop the rest after one month of results.",
    applies: (p) => p.build.activities.some((a) => a.kind === "bakeoff" && a.candidates.length > 2 && a.candidates.slice(2).some((c) => (c.toMonth ?? p.timeline.buildMonths) > 1)),
    apply: (p) => mapActs(p, (a) => (a.kind === "bakeoff" ? { ...a, candidates: a.candidates.map((c, i) => (i < 2 ? c : { ...c, toMonth: Math.min(c.toMonth ?? 99, 1) })) } : a)),
  },
  {
    id: "batchRegression", group: "ai", saves: true, phase: "build", label: "Send nightly regression through Batch",
    detail: "Overnight runs tolerate a 24-hour turnaround; Batch is 50% off on supported models.",
    applies: (p) => p.build.activities.some((a) => a.kind === "regression" && a.batchShare < 1),
    apply: (p) => mapActs(p, (a) => (a.kind === "regression" ? { ...a, batchShare: 1 } : a)),
  },
  {
    id: "batchBakeoff", group: "ai", saves: true, phase: "build", label: "Run bake-off sweeps through Batch",
    detail: "Bake-off sweeps are offline comparisons; Batch halves the token price where supported.",
    applies: (p) => p.build.activities.some((a) => a.kind === "bakeoff" && a.batchShare < 1),
    apply: (p) => mapActs(p, (a) => (a.kind === "bakeoff" ? { ...a, batchShare: 1 } : a)),
  },
  {
    id: "devCache", group: "ai", saves: true, phase: "build", label: "Stabilise the prompt prefix in dev",
    detail: "Keep system prompt and tool definitions fixed between runs to lift dev cache hits to 60%.",
    applies: (p) => p.build.activities.some((a) => (a.kind === "iterations" || a.kind === "bakeoff") && a.cacheHit < 0.6),
    apply: (p) => mapActs(p, (a) => (a.kind === "iterations" || a.kind === "bakeoff" ? { ...a, cacheHit: Math.max(a.cacheHit, 0.6) } : a)),
  },
  {
    id: "sampleEval", group: "ai", saves: true, phase: "build", label: "Score 40% of iteration and bake-off runs",
    detail: "Judge a stratified sample during development; keep full scoring for regression and release candidates.",
    applies: (p) => p.build.activities.some((a) => a.kind === "evaluation" && (a.scoredShare.bakeoff > 0.4 || a.scoredShare.iterations > 0.4)),
    apply: (p) => mapActs(p, (a) => (a.kind === "evaluation" ? { ...a, scoredShare: { ...a.scoredShare, bakeoff: Math.min(0.4, a.scoredShare.bakeoff), iterations: Math.min(0.4, a.scoredShare.iterations) } } : a)),
  },
  {
    id: "routeChat", group: "ai", saves: true, phase: "production", label: "Route simple chat turns to a mini model",
    detail: "A model router sends about 60% of turns to gpt-5.4-mini.",
    applies: (p, cat) => cat.chatModels.some((m) => m.id === "gpt-5.4-mini") && p.workloads.some((w) => w.kind === "chat" && !w.router && w.modelId !== "gpt-5.4-mini"),
    apply: (p) => {
      const q = clone(p);
      q.workloads = q.workloads.map((w) => (w.kind === "chat" && !w.router ? { ...w, router: { modelId: "gpt-5.4-mini", share: 0.6 } } : w));
      return q;
    },
  },
  {
    id: "cheapestStt", group: "ai", saves: true, phase: "production", label: "Use the cheapest transcription engine",
    detail: "Switch to the lowest-cost engine that is not retiring during the plan and supports diarization.",
    applies: (p, cat) => p.workloads.some((w) => w.kind === "transcription" && cheapestStt(p, cat) !== w.engineId),
    apply: (p, cat) => {
      const q = clone(p);
      const best = cheapestStt(p, cat);
      q.workloads = q.workloads.map((w) => (w.kind === "transcription" ? { ...w, engineId: best } : w));
      return q;
    },
  },
  ...genericLevers(),
];

function pctParam(label: string, min: number, max: number, def: number, help: string): LeverParam { return { label, unit: "%", min, max, step: 5, default: () => def, help }; }
function monthsParam(label: string, min: number, max: number, def: (p: Project) => number, help: string): LeverParam { return { label, unit: "months", min, max, step: 1, default: def, help }; }
function hasBenchmarkedCaps(p: Project): boolean { return p.benefits.capabilities.some((c) => (c.driver ?? "hours") !== "hours"); }

/**
 * The generic levers (A13). Each shows only when the project has the parts it acts on, so an AI-only project never sees a
 * reserved-instance lever and a project with no resources never sees one. Rules live in transforms.ts.
 */
function genericLevers(): Lever[] {
  const reserve = (term: "ri1" | "ri3", years: string): Lever => ({
    id: term === "ri1" ? "reserve1y" : "reserve3y", group: "generic", saves: true, phase: "production",
    label: `Reserve part of production resources for ${years}`,
    detail: `Moves the chosen share of each production resource that has a ${years} reserved price from pay-as-you-go to reserved. Reserved bills all 730 hours, so non-production environments are left alone.`,
    param: pctParam("Share reserved", 10, 100, 50, `Percent of production capacity (machines, instances, GiB) bought for ${years}.`),
    applies: (p, cat) => hasReservable(p, cat, term),
    apply: (p, cat, a) => reserveCoverage(clone(p), cat, term, leverAmount(LEVER(term === "ri1" ? "reserve1y" : "reserve3y"), p, a)),
  });
  return [
    reserve("ri1", "1 year"),
    reserve("ri3", "3 years"),
    {
      id: "skuDown", group: "generic", saves: true, phase: "production", label: "Use the next size down for resources",
      detail: "Moves every resource that has a smaller sibling SKU (same type, same operating system or series, ordered by price) to it. Resources with no smaller sibling stay as they are.",
      applies: (p, cat) => hasSkuStep(p, cat, -1),
      apply: (p, cat) => stepSkus(clone(p), cat, -1),
    },
    {
      id: "skuUp", group: "generic", phase: "production", label: "Use the next size up for resources",
      detail: "Moves every resource that has a larger sibling SKU (same type, same operating system or series, ordered by price) to it. Shows the cost of more headroom.",
      applies: (p, cat) => hasSkuStep(p, cat, 1),
      apply: (p, cat) => stepSkus(clone(p), cat, 1),
    },
    {
      id: "envHours", group: "generic", saves: true, phase: "build", label: "Run non-production environments fewer hours",
      detail: "Scales the weekly schedule of dev, test and other non-production environments, for example off at nights and weekends. Reserved resources still bill all 730 hours.",
      param: pctParam("Hours kept", 10, 100, 50, "Percent of today's hours the environments keep running."),
      applies: (p) => hasNonProdEnvironments(p),
      apply: (p, _cat, a) => scaleNonProdHours(clone(p), leverAmount(LEVER("envHours"), p, a) / 100),
    },
    {
      id: "volume", group: "generic", phase: "production", label: "Change transaction and seat volumes",
      detail: "Scales per-transaction fees, per-transaction current-state costs and seat counts. Costs and savings that depend on them move together; benefits measured in time saved do not.",
      param: pctParam("Volume", 25, 400, 120, "Percent of today's volume."),
      applies: (p) => hasTransactionVolume(p) || hasSeatVolume(p),
      apply: (p, _cat, a) => scaleVolumes(clone(p), leverAmount(LEVER("volume"), p, a) / 100),
    },
    {
      id: "deliveryLength", group: "generic", phase: "build", label: "Stretch or shrink the build",
      detail: "Changes the build length and scales team and phase windows with it. People and hours a month stay, so labour moves with the length; go-live and everything after it moves too.",
      param: pctParam("Build length", 50, 200, 120, "Percent of today's build months, rounded, between 1 and 24 months."),
      applies: (p) => p.build.includeLabour && p.build.team.some((t) => t.costed !== false),
      apply: (p, _cat, a) => scaleDeliveryLength(clone(p), leverAmount(LEVER("deliveryLength"), p, a) / 100),
    },
    {
      id: "goLive", group: "generic", phase: "build", label: "Move go-live earlier or later",
      detail: "Moves go-live by whole months. The team stays on for months added and stops for months removed; later start months and hypercare move with go-live.",
      param: monthsParam("Months later (negative is earlier)", -12, 12, () => 3, "Months to add to the build; the build stays between 1 and 24 months."),
      applies: (p) => p.timeline.buildMonths > 0,
      apply: (p, _cat, a) => shiftGoLive(clone(p), leverAmount(LEVER("goLive"), p, a)),
    },
    {
      id: "decommission", group: "generic", phase: "production", label: "Move the decommission date",
      detail: "Moves the change month of every current-state line that is reduced or retired, never before go-live. Later means the saving starts later.",
      param: monthsParam("Months later (negative is earlier)", -12, 24, () => 6, "Months to add to each line's change month."),
      applies: (p) => hasDecommissionLines(p),
      apply: (p, _cat, a) => shiftDecommission(clone(p), leverAmount(LEVER("decommission"), p, a)),
    },
    {
      id: "labourRates", group: "generic", phase: "build", label: "Change delivery labour rates",
      detail: "Scales build and maintenance team rates. The value of an hour saved and current-state people costs do not move, even for a role used in both.",
      param: pctParam("Rates", 50, 150, 110, "Percent of today's hourly rates."),
      applies: (p) => hasDeliveryRates(p),
      apply: (p, _cat, a) => scaleRatesBy(clone(p), leverAmount(LEVER("labourRates"), p, a) / 100, "delivery"),
    },
    {
      id: "adoptionRamp", group: "generic", phase: "production", label: "Change the adoption ramp length",
      detail: "Sets the months benefits, seats and current-state reductions that follow adoption take to reach full effect.",
      param: monthsParam("Ramp months", 0, 24, (p) => Math.round(p.timeline.adoptionRampMonths / 2), "Months from go-live to full adoption; 0 is immediate."),
      applies: (p) => p.timeline.adoptionRampMonths > 0 && (p.benefits.capabilities.length > 0 || (p.currentState?.lines ?? []).some((l) => l.change.mode === "reduce" && l.change.followsAdoption)),
      apply: (p, _cat, a) => { const q = clone(p); q.timeline.adoptionRampMonths = Math.round(leverAmount(LEVER("adoptionRamp"), p, a)); return q; },
    },
    {
      id: "adoptionShare", group: "generic", phase: "production", label: "Change the share of people who adopt it",
      detail: "Sets the project-wide adoption percentage used by benchmarked capabilities (time saved per task, per user week or per item).",
      param: pctParam("Adoption", 10, 100, 80, "Percent of users who use it at full rollout."),
      applies: (p) => hasBenchmarkedCaps(p),
      apply: (p, _cat, a) => { const q = clone(p); q.roi.adoptionPct = leverAmount(LEVER("adoptionShare"), p, a); return q; },
    },
  ];
}
function LEVER(id: string): Lever { return LEVERS.find((l) => l.id === id)!; }

function cheapestStt(p: Project, cat: Catalog): string {
  const book = new PriceBook(cat, p.settings);
  const end = monthDate(p.startDate, p.timeline.horizonMonths);
  const mid = monthDate(p.startDate, p.timeline.buildMonths + 1);
  const ok = cat.speechEngines.filter((e) => e.diarization !== "none" && e.mode === "batch" && (!e.lifecycle.retiresOn || e.lifecycle.retiresOn > end));
  ok.sort((a, b) => book.speechPerHour(a.id, end) + book.speechPerHour(a.id, mid) - (book.speechPerHour(b.id, end) + book.speechPerHour(b.id, mid)));
  return ok[0]?.id ?? "speech-batch";
}

export interface LeverOption { lever: Lever; saving: number }

/** Savings each applicable cost lever would give over the horizon on the project's cost basis. What-if levers (`saves` not set) are not listed here. */
export function evaluateLevers(p: Project, cat: Catalog): LeverOption[] {
  const base = computeRoi(buildLedger(p, cat), p.roi.basis).totalCost;
  return LEVERS.filter((l) => l.group !== "generic" || l.saves).filter((l) => leverApplies(l, p, cat))
    .map((lever) => ({ lever, saving: base - computeRoi(buildLedger(lever.apply(p, cat), cat), p.roi.basis).totalCost }))
    .sort((a, b) => b.saving - a.saving);
}

/** Every lever that applies to the project, in list order (AI levers first, then generic ones). */
export const applicableLevers = (p: Project, cat: Catalog): Lever[] => LEVERS.filter((l) => leverApplies(l, p, cat));

export interface LeverEffect { amount: number; cost: number; npv: number }

/** What a lever does to total cost (on the cost basis) and NPV at the given setting, as changes from the project as it is. Positive cost is more cost. */
export function leverEffect(p: Project, cat: Catalog, l: Lever, amount?: number): LeverEffect {
  const one = (q: Project) => computeRoi(buildLedger(q, cat), q.roi.basis, q.roi.discountRatePct, roiOptions(q));
  const base = one(p), after = one(l.apply(p, cat, amount));
  return { amount: leverAmount(l, p, amount), cost: after.totalCost - base.totalCost, npv: after.npv - base.npv };
}
