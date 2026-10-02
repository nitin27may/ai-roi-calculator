import type { Catalog } from "@studio/catalog";
import type { Project } from "./project.js";
import { buildLedger } from "./ledger.js";
import { computeRoi } from "./roi.js";
import { applyEdit } from "./scenarios.js";
import { roiAssumptions } from "./benefits.js";

export interface SensitivityRow {
  id: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  /** NPV with the input at its low and high value (CAD). */
  low: number;
  high: number;
  /** |high − low|: how far this input alone can move NPV. */
  swing: number;
}

type Driver = { id: string; label: string; low: [string, (p: Project) => void]; high: [string, (p: Project) => void]; applies?: (p: Project) => boolean };

const scaleRates = (p: Project, ids: Set<string>, f: number) => { for (const r of p.rateCard) if (ids.has(r.id)) r.hourlyRate *= f; };
const benefitRoles = (p: Project) => new Set([...p.benefits.capabilities.map((c) => c.roleId), ...p.benefits.avoidedCosts.flatMap((a) => (a.roleId ? [a.roleId] : []))]);
const deliveryRoles = (p: Project) => new Set([...p.build.team.map((t) => t.roleId), ...(p.maintenance.mode === "team" ? p.maintenance.team.map((t) => t.roleId) : [])]);
const scaleCapabilityVolume = (p: Project, f: number) => {
  for (const c of p.benefits.capabilities) {
    if ((c.driver ?? "hours") === "hours") c.hoursSavedPerMonth *= f;
    if (c.users !== undefined) c.users *= f;
    if (c.itemsPerMonth !== undefined) c.itemsPerMonth *= f;
  }
};

/** Change the build length; team lines that ran to the end of the build keep running to the new end. */
function setBuildLength(q: Project, n: number) {
  const B = q.timeline.buildMonths;
  for (const t of q.build.team) {
    if (t.toMonth === undefined || t.toMonth >= B) t.toMonth = n;
    if (t.fromMonth !== undefined && t.fromMonth > n) t.fromMonth = n;
  }
  q.timeline.buildMonths = n;
}

/**
 * One-at-a-time sensitivity of NPV (on the project's cost basis and discount rate) to the inputs
 * that usually decide an AI business case. Rows are sorted by swing, largest first, for a tornado.
 */
export function sensitivity(p: Project, cat: Catalog): { base: number; rows: SensitivityRow[] } {
  const lib = cat.benchmarks;
  const a = roiAssumptions(p, lib);
  const npv = (q: Project) => computeRoi(buildLedger(q, cat), q.roi.basis, q.roi.discountRatePct).npv;
  const hasBenchmarked = p.benefits.capabilities.some((c) => (c.driver ?? "hours") !== "hours");
  const B = p.timeline.buildMonths;
  const drivers: Driver[] = [
    {
      id: "evidence", label: "Time saved per task (benchmark column)", applies: () => hasBenchmarked,
      // Keep adoption and realisation where they are; only the savings column moves.
      low: ["conservative", (q) => { q.roi.adoptionPct = a.adoptionPct; q.roi.realisationPct = a.realisationPct; q.roi.benefitPreset = "conservative"; }],
      high: ["optimistic", (q) => { q.roi.adoptionPct = a.adoptionPct; q.roi.realisationPct = a.realisationPct; q.roi.benefitPreset = "optimistic"; }],
    },
    { id: "adoption", label: "Adoption", applies: () => hasBenchmarked, low: [`${lib.presets.conservative.adoptionPct}%`, (q) => { q.roi.adoptionPct = lib.presets.conservative.adoptionPct; }], high: [`${lib.presets.optimistic.adoptionPct}%`, (q) => { q.roi.adoptionPct = lib.presets.optimistic.adoptionPct; }] },
    { id: "realisation", label: "Realisation", applies: () => hasBenchmarked, low: [`${lib.presets.conservative.realisationPct}%`, (q) => { q.roi.realisationPct = lib.presets.conservative.realisationPct; }], high: [`${lib.presets.optimistic.realisationPct}%`, (q) => { q.roi.realisationPct = lib.presets.optimistic.realisationPct; }] },
    { id: "users", label: "Users / volume of the work", low: ["−30%", (q) => scaleCapabilityVolume(q, 0.7)], high: ["+30%", (q) => scaleCapabilityVolume(q, 1.3)] },
    { id: "valueOfTime", label: "Value of an hour saved (benefit roles' rates)", low: ["−20%", (q) => scaleRates(q, benefitRoles(p), 0.8)], high: ["+20%", (q) => scaleRates(q, benefitRoles(p), 1.2)] },
    { id: "deliveryRates", label: "Delivery team rates", applies: () => p.build.includeLabour, low: ["+20%", (q) => scaleRates(q, deliveryRoles(p), 1.2)], high: ["−20%", (q) => scaleRates(q, deliveryRoles(p), 0.8)] },
    { id: "runVolume", label: "AI run volume (same benefit)", low: ["×1.5", (q) => Object.assign(q, applyEdit(q, { kind: "scaleUsage", factor: 1.5 }, cat))], high: ["×0.7", (q) => Object.assign(q, applyEdit(q, { kind: "scaleUsage", factor: 0.7 }, cat))] },
    { id: "buildLength", label: "Build length (team stays on)", low: [`${Math.min(24, B + 2)} months`, (q) => setBuildLength(q, Math.min(24, B + 2))], high: [`${Math.max(1, B - 2)} months`, (q) => setBuildLength(q, Math.max(1, B - 2))] },
    { id: "ramp", label: "Adoption ramp", low: [`${p.timeline.adoptionRampMonths * 2 || 6} months`, (q) => { q.timeline.adoptionRampMonths = Math.min(24, p.timeline.adoptionRampMonths * 2 || 6); }], high: [`${Math.floor(p.timeline.adoptionRampMonths / 2)} months`, (q) => { q.timeline.adoptionRampMonths = Math.floor(p.timeline.adoptionRampMonths / 2); }] },
    { id: "growth", label: "Usage growth per year", low: ["0%", (q) => { q.roi.growthPctPerYear = 0; }], high: [`${Math.max(20, p.roi.growthPctPerYear * 2)}%`, (q) => { q.roi.growthPctPerYear = Math.max(20, p.roi.growthPctPerYear * 2); }] },
  ];
  const base = npv(p);
  const rows = drivers.filter((d) => d.applies?.(p) ?? true).map((d) => {
    const run = (f: (q: Project) => void) => { const q = structuredClone(p); f(q); return npv(q); };
    const low = run(d.low[1]), high = run(d.high[1]);
    return { id: d.id, label: d.label, lowLabel: d.low[0], highLabel: d.high[0], low, high, swing: Math.abs(high - low) };
  });
  return { base, rows: rows.sort((x, y) => y.swing - x.swing) };
}
