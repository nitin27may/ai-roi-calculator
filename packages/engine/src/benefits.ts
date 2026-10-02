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
  const users = c.users ?? 0;
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
    volume = (c.itemsPerMonth ?? 0) * ((c.handledPct ?? 100) / 100);
    gross = (volume * minutesSaved) / 60;
    formula = `${c.itemsPerMonth ?? 0} items × ${c.handledPct ?? 100}% handled × ${saved}`;
  }
  const net = gross * (realisationPct / 100);
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
