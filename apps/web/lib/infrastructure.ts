import type { Catalog, PricingOption, ResourceType } from "@roi-calculator/catalog";
import { environmentHours, type Environment, type Project, type Resource } from "@roi-calculator/engine";

/** Quick-add environments. Adding one only creates a row with these names and flags; every figure stays at its neutral default. */
export const ENV_QUICK_ADDS = [
  { kind: "dev", label: "Development", detail: "Where the team builds. Billed in the build months.", production: false },
  { kind: "test", label: "Test", detail: "Where the team checks the build. Billed in the build months.", production: false },
  { kind: "uat", label: "UAT", detail: "Where the business signs off. Billed in the build months unless you set months.", production: false },
  { kind: "prod", label: "Production", detail: "Real use. Running cost, billed from go-live.", production: true },
  { kind: "dr", label: "Disaster recovery", detail: "A second production copy. Running cost, billed from go-live.", production: true },
  { kind: "custom", label: "Custom", detail: "An empty environment you name yourself.", production: false },
] as const;
export type EnvQuickKind = (typeof ENV_QUICK_ADDS)[number]["kind"];

const uniqueId = (taken: Set<string>, base: string) => {
  let i = taken.size + 1;
  let id = `${base}-${i}`;
  while (taken.has(id)) id = `${base}-${++i}`;
  return id;
};

/** A new environment for a quick-add: its name and production flag, size 1, always on, pay-as-you-go, no month bounds. */
export function newEnvironment(kind: EnvQuickKind, existing: readonly { id: string }[]): Environment {
  const q = ENV_QUICK_ADDS.find((x) => x.kind === kind)!;
  return {
    id: uniqueId(new Set(existing.map((e) => e.id)), kind === "custom" ? "env" : kind),
    label: kind === "custom" ? "" : q.label,
    production: q.production, sizeFactor: 1, schedule: { hoursPerMonth: 730 }, pricing: "payg",
  };
}

/** Switch between "hours a day x days a month" and "hours a month", keeping the monthly hours. */
export function setScheduleMode(env: Environment, mode: "perDay" | "perMonth"): void {
  const s = env.schedule;
  if (mode === "perDay" && "hoursPerMonth" in s) env.schedule = { hoursPerDay: 24, daysPerMonth: Math.round((s.hoursPerMonth / 24) * 100) / 100 };
  else if (mode === "perMonth" && "hoursPerDay" in s) env.schedule = { hoursPerMonth: Math.round(environmentHours(env) * 100) / 100 };
}

/** A month field that may be empty: empty removes the bound. */
export function setMonthBound(env: Environment, which: "fromMonth" | "toMonth", text: string): void {
  const v = Math.round(Number(text));
  if (text.trim() === "" || !Number.isFinite(v) || v < 1) delete env[which];
  else env[which] = v;
}

/**
 * Remove an environment. Resources that listed it lose it from `envIds`; a resource left listing every remaining
 * environment goes back to "all" so it follows environments added later.
 */
export function removeEnvironment(p: Project, id: string): void {
  p.environments = (p.environments ?? []).filter((e) => e.id !== id);
  for (const r of p.resources ?? []) {
    if (!r.envIds) continue;
    r.envIds = r.envIds.filter((x) => x !== id);
    if (p.environments.every((e) => r.envIds!.includes(e.id))) delete r.envIds;
  }
}

/** The environments a resource exists in, as ids. */
export const resourceEnvIds = (r: Pick<Resource, "envIds">, envs: readonly { id: string }[]): string[] => r.envIds ?? envs.map((e) => e.id);

/** Tick or untick one environment for a resource. Every environment ticked is stored as absent (all). */
export function toggleResourceEnv(r: Resource, envs: readonly { id: string }[], envId: string, on: boolean): void {
  const cur = new Set(resourceEnvIds(r, envs));
  if (on) cur.add(envId); else cur.delete(envId);
  const next = envs.map((e) => e.id).filter((id) => cur.has(id));
  if (next.length === envs.length) delete r.envIds; else r.envIds = next;
}

/** Terms the SKU can be bought on: pay-as-you-go always, a reservation only when the type offers it and every meter's price has it. */
export function termOptions(catalog: Pick<Catalog, "unitPrices">, type: ResourceType, skuId: string): ("payg" | "ri1" | "ri3")[] {
  const sku = type.skus.find((s) => s.id === skuId);
  const out: ("payg" | "ri1" | "ri3")[] = ["payg"];
  if (!sku) return out;
  for (const t of ["ri1", "ri3"] as const) {
    if (!type.options.includes(t)) continue;
    const all = type.meters.every((m) => {
      const u = catalog.unitPrices.find((x) => x.id === sku.prices[m.id]);
      return u?.options?.[t] !== undefined;
    });
    if (all) out.push(t);
  }
  return out;
}

export const TERM_LABEL: Record<"payg" | "ri1" | "ri3", string> = { payg: "Pay-as-you-go", ri1: "1-year reserved", ri3: "3-year reserved" };

/** Whether the type declares Azure Hybrid Benefit. */
export const supportsAhb = (type: ResourceType): boolean => type.options.includes("ahb" as PricingOption);

/** A new resource for a chosen SKU. Inputs start empty (counted as 0), pay-as-you-go, no Hybrid Benefit, all environments. */
export function newResource(type: ResourceType, skuId: string, existing: readonly { id: string; label: string }[]): Resource {
  const same = existing.filter((r) => r.label === type.label || r.label.startsWith(`${type.label} `)).length;
  return {
    id: uniqueId(new Set(existing.map((r) => r.id)), "res"),
    label: same ? `${type.label} ${same + 1}` : type.label,
    typeId: type.id, skuId, inputs: {}, term: "payg", ahb: false,
  };
}

/** Change a resource's SKU. A term or Hybrid Benefit the new SKU cannot use is reset. */
export function setResourceSku(catalog: Pick<Catalog, "unitPrices">, r: Resource, type: ResourceType, skuId: string): void {
  r.skuId = skuId;
  if (!termOptions(catalog, type, skuId).includes(r.term)) r.term = "payg";
}

/** Catalogue categories that have at least one type, with their types, for the picker. */
export function pickerCategories(types: readonly ResourceType[]): { category: string; types: ResourceType[] }[] {
  const by = new Map<string, ResourceType[]>();
  for (const t of types) by.set(t.category, [...(by.get(t.category) ?? []), t]);
  return [...by].map(([category, ts]) => ({ category, types: ts }));
}

/** SKUs matching a typed filter (every word must appear in the label), capped for display. */
export function filterSkus(type: ResourceType, text: string, cap = 50): { shown: ResourceType["skus"]; total: number } {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const all = type.skus.filter((s) => words.every((w) => s.label.toLowerCase().includes(w)));
  return { shown: all.slice(0, cap), total: all.length };
}

export const CATEGORY_LABEL: Record<string, string> = {
  compute: "Compute", database: "Databases", storage: "Storage", messaging: "Messaging", network: "Network",
  security: "Security", monitoring: "Monitoring", data: "Data and analytics", licences: "Licences",
};
