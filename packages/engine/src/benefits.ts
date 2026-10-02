import type { BenchmarkLibrary } from "@studio/catalog";
import type { z } from "zod";
import type { Capability, Project } from "./project.js";

type Library = z.infer<typeof BenchmarkLibrary>;
const WEEKS_PER_MONTH = 52 / 12;
const DEFAULT_WORKING_DAYS = 21;

export interface CapabilityHours {
  driver: NonNullable<Capability["driver"]>;
  /** Minutes saved per task, per user-week or per item under the current preset. */
  minutesSaved: number;
  adoptionPct: number;
  realisationPct: number;
  /** Tasks or items per month at full rollout (perTask, perVolume). */
  volume: number;
  /** Hours saved before realisation, at full rollout. */
  gross: number;
  /** Hours that turn into value, at full rollout. */
  net: number;
  formula: string;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Monthly volume fields a capability can take its items from, in order of preference. */
const ITEM_KEYS = ["tasksPerMonth", "callsPerMonth", "emailsPerMonth", "queriesPerMonth", "interactionsPerMonth", "requestsPerMonth", "pagesPerMonth", "hoursPerMonth"] as const;

/** What a workload offers as a capability's volume: its users, and its main monthly item count. */
export function workloadVolume(w: Project["workloads"][number]): { users?: number; items?: number; itemsKey?: string } {
  const o = w as unknown as Record<string, unknown>;
  const key = ITEM_KEYS.find((k) => typeof o[k] === "number");
  return { users: typeof o.users === "number" ? (o.users as number) : undefined, items: key ? (o[key] as number) : undefined, itemsKey: key };
}

/** Users and items for a capability, from its linked workload when it has one. */
export function capabilityVolume(p: Project, c: Capability): { users: number; items: number; linked: string | null } {
  const w = c.volumeFrom ? p.workloads.find((x) => x.id === c.volumeFrom) : undefined;
  const v = w ? workloadVolume(w) : {};
  return { users: v.users ?? c.users ?? 0, items: v.items ?? c.itemsPerMonth ?? 0, linked: w ? w.label : null };
}

/** The preset's (or the project's) adoption and realisation, in percent. */
export function roiAssumptions(p: Project, lib: Library) {
  const preset = lib.presets[p.roi.benefitPreset];
  return { adoptionPct: p.roi.adoptionPct ?? preset.adoptionPct, realisationPct: p.roi.realisationPct ?? preset.realisationPct, rationale: preset.rationale };
}

/** Hours a capability saves per month at full rollout, before the adoption ramp, growth and rate escalation. */
export function capabilityHours(p: Project, c: Capability, lib: Library): CapabilityHours {
  const driver = c.driver ?? "hours";
  if (driver === "hours") {
    return { driver, minutesSaved: 0, adoptionPct: 100, realisationPct: 100, volume: 0, gross: c.hoursSavedPerMonth, net: c.hoursSavedPerMonth, formula: `${c.hoursSavedPerMonth} net hours/month, entered directly` };
  }
  const b = c.benchmarkId ? lib.capabilities.find((x) => x.id === c.benchmarkId) : undefined;
  const preset = p.roi.benefitPreset;
  const savings = c.savings ?? b?.savings ?? { conservative: 0, typical: 0, optimistic: 0 };
  const unit = c.unit ?? b?.unit ?? "minutes";
  const baseline = c.baselineMinutes ?? b?.baselineMinutes ?? 0;
  // A saving can never exceed the time the task takes today.
  const raw = unit === "pct" ? (baseline * savings[preset]) / 100 : savings[preset];
  const capped = baseline > 0 && raw > baseline;
  const minutesSaved = capped ? baseline : raw;
  const a = roiAssumptions(p, lib);
  const adoptionPct = driver === "perVolume" ? 100 : (c.adoptionPct ?? a.adoptionPct);
  const realisationPct = c.realisationPct ?? a.realisationPct;
  const vol = capabilityVolume(p, c);
  const users = vol.users;
  const days = p.roi.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS;
  const saved = unit === "pct" ? `${savings[preset]}% of ${baseline} min = ${r1(minutesSaved)} min` : `${r1(minutesSaved)} min${capped ? ` (capped at the ${baseline} min baseline)` : ""}`;
  let volume = 0, gross = 0, formula = "";
  if (driver === "perTask") {
    volume = users * (adoptionPct / 100) * (c.tasksPerUserPerDay ?? 0) * days;
    gross = (volume * minutesSaved) / 60;
    formula = `${users} users × ${adoptionPct}% adoption × ${c.tasksPerUserPerDay ?? 0} tasks/day × ${days} days × ${saved}`;
  } else if (driver === "perUserWeek") {
    const licensed = (p.roi.licensedPct ?? 0) / 100;
    const retained = 1 - licensed * (c.licenceOverlap ?? b?.licenceOverlap ?? 0);
    gross = (users * (adoptionPct / 100) * retained * minutesSaved * WEEKS_PER_MONTH) / 60;
    formula = `${users} users × ${adoptionPct}% adoption${retained < 1 ? ` × ${Math.round(retained * 100)}% not covered by existing licences` : ""} × ${saved}/week`;
  } else {
    volume = vol.items * ((c.handledPct ?? 100) / 100);
    gross = (volume * minutesSaved) / 60;
    formula = `${Math.round(vol.items)} items × ${c.handledPct ?? 100}% handled × ${saved}`;
  }
  const net = gross * (realisationPct / 100);
  if (vol.linked) formula = `${formula} (volume from ${vol.linked})`;
  return { driver, minutesSaved, adoptionPct, realisationPct, volume, gross, net, formula: `${formula} = ${r1(gross)} h gross × ${realisationPct}% realised = ${r1(net)} h` };
}

/** A capability built from a library benchmark, with its savings copied in so the project file stands alone. */
export function capabilityFromBenchmark(p: Project, benchmarkId: string, lib: Library, users = 100): Capability {
  const b = lib.capabilities.find((x) => x.id === benchmarkId);
  if (!b) throw new Error(`Unknown benchmark ${benchmarkId}`);
  const taken = new Set(p.benefits.capabilities.map((c) => c.id));
  let id = b.id, i = 2;
  while (taken.has(id)) id = `${b.id}-${i++}`;
  return {
    id, label: b.label, roleId: b.roleId, componentIds: [], hoursSavedPerMonth: 0,
    driver: b.driver, benchmarkId: b.id,
    ...(b.driver === "perVolume" ? { itemsPerMonth: 1000, handledPct: 50 } : { users }),
    ...(b.driver === "perTask" ? { tasksPerUserPerDay: 1 } : {}),
    baselineMinutes: b.baselineMinutes, savings: { ...b.savings }, unit: b.unit, licenceOverlap: b.licenceOverlap,
  };
}

/** Add any benefit role a benchmark needs that the rate card lacks, at the library's loaded rate. */
export function ensureBenchmarkRole(p: Project, roleId: string, lib: Library): void {
  if (p.rateCard.some((r) => r.id === roleId)) return;
  const r = lib.roles.find((x) => x.id === roleId);
  if (r) p.rateCard.push({ id: r.id, label: r.label, hourlyRate: r.hourlyRate });
}

/** Monthly value of an avoided cost before rate escalation: a fixed amount, or FTE × hours × the role's rate. */
export function avoidedMonthly(p: Project, a: Project["benefits"]["avoidedCosts"][number]): number {
  if (a.fte === undefined || !a.roleId) return a.monthly;
  const rate = p.rateCard.find((r) => r.id === a.roleId)?.hourlyRate ?? 0;
  return a.fte * (a.hoursPerMonth ?? 160) * rate;
}

export interface BeforeAfterRow { id: string; label: string; baselineHours: number | null; savedHours: number; before: number; after: number }
export interface BeforeAfter {
  rows: BeforeAfterRow[];
  avoided: number;
  /** Production AI usage + platform, and maintenance, at the first full-adoption month. */
  ai: number;
  maint: number;
  before: number;
  after: number;
  /** Savings from capabilities entered as hours, which have no baseline to show "before". */
  savedWithoutBaseline: number;
}

/**
 * Monthly cost of the work today against the same work with the AI solution, at full rollout
 * (no growth or escalation). Today's time comes from each capability's baseline minutes across
 * all its users or items, valued at the role's rate; avoided costs are part of today's cost.
 */
export function beforeAfter(p: Project, lib: Library, ledgerTotals: { runRate: number; maintRate: number }): BeforeAfter {
  const days = p.roi.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS;
  const rates = new Map(p.rateCard.map((r) => [r.id, r.hourlyRate]));
  const rows: BeforeAfterRow[] = p.benefits.capabilities.map((c) => {
    const h = capabilityHours(p, c, lib);
    const rate = rates.get(c.roleId) ?? 0;
    const baseline = c.baselineMinutes ?? (c.benchmarkId ? lib.capabilities.find((b) => b.id === c.benchmarkId)?.baselineMinutes : undefined) ?? 0;
    let hours: number | null = null;
    const vol = capabilityVolume(p, c);
    if (h.driver === "perTask") hours = (vol.users * (c.tasksPerUserPerDay ?? 0) * days * baseline) / 60;
    else if (h.driver === "perUserWeek") hours = (vol.users * baseline * WEEKS_PER_MONTH) / 60;
    else if (h.driver === "perVolume") hours = (vol.items * baseline) / 60;
    if (hours === null) return { id: c.id, label: c.label, baselineHours: null, savedHours: h.net, before: 0, after: -h.net * rate };
    return { id: c.id, label: c.label, baselineHours: hours, savedHours: h.net, before: hours * rate, after: Math.max(0, hours - h.net) * rate };
  });
  const avoided = p.benefits.avoidedCosts.reduce((s, a) => s + avoidedMonthly(p, a), 0);
  const withBase = rows.filter((r) => r.baselineHours !== null);
  const savedWithoutBaseline = rows.filter((r) => r.baselineHours === null).reduce((s, r) => s - r.after, 0);
  const before = withBase.reduce((s, r) => s + r.before, 0) + avoided;
  const after = withBase.reduce((s, r) => s + r.after, 0) + ledgerTotals.runRate + ledgerTotals.maintRate - savedWithoutBaseline;
  return { rows, avoided, ai: ledgerTotals.runRate, maint: ledgerTotals.maintRate, before, after, savedWithoutBaseline };
}
