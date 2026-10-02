import type { Ledger } from "./ledger.js";
import type { Project } from "./project.js";
import type { CostBasis } from "./roi.js";
import type { Stream } from "./lines.js";

export interface CapabilityRoi {
  id: string;
  label: string;
  benefit: number;
  /** Cost of the workloads this capability uses (split evenly when several capabilities share one). */
  direct: number;
  /** Its share of build, platform, maintenance and transition cost, pro rata to direct cost. */
  shared: number;
  cost: number;
  net: number;
  roi: number | null;
}

export interface Allocation {
  capabilities: CapabilityRoi[];
  /** Avoided costs and one-off benefits belong to the project, not to one capability. */
  projectBenefit: number;
  unallocated: { cost: number; reason: "noLinks" | "noDirectCost" | null; items: { componentId: string; label: string; cost: number }[] };
  sharedPool: number;
}

const SHARED: Stream[] = ["labour", "devlab", "devenv", "platform", "maint", "transition"];

/**
 * Splits the horizon's cost (under the chosen basis) across capabilities so each one gets its
 * own ROI. Workload costs follow the capability links; shared costs follow direct cost.
 * Usage workloads nobody links are reported as unallocated rather than spread silently.
 * Allocated + unallocated always equals the total cost.
 */
export function computeAllocation(p: Project, ledger: Ledger, basis: CostBasis): Allocation {
  const included = new Set<Stream>(basis === "run" ? ["run", "platform"] : basis === "runMaint" ? ["run", "platform", "maint", "transition"] : [...SHARED, "run"]);
  const byComponent = new Map<string, { label: string; cost: number; stream: Stream }>();
  for (const mo of ledger.months) {
    for (const l of mo.lines) {
      if (!included.has(l.stream)) continue;
      const key = l.stream === "run" ? l.componentId : `shared:${l.stream}`;
      const e = byComponent.get(key) ?? { label: l.stream === "run" ? (p.workloads.find((w) => w.id === l.componentId)?.label ?? l.componentId) : l.stream, cost: 0, stream: l.stream };
      e.cost += l.cost;
      byComponent.set(key, e);
    }
  }
  const linkCount = new Map<string, number>();
  for (const c of p.benefits.capabilities) for (const id of c.componentIds) linkCount.set(id, (linkCount.get(id) ?? 0) + 1);

  const benefitOf = (id: string) => ledger.months.reduce((s, mo) => s + (mo.benefitBy.capabilities[id] ?? 0), 0);
  const caps = p.benefits.capabilities.map((c) => ({
    id: c.id, label: c.label, benefit: benefitOf(c.id),
    direct: c.componentIds.reduce((s, id) => s + (byComponent.get(id)?.cost ?? 0) / (linkCount.get(id) ?? 1), 0),
  }));

  const sharedPool = [...byComponent.entries()].filter(([k]) => k.startsWith("shared:")).reduce((s, [, v]) => s + v.cost, 0);
  const unlinked = [...byComponent.entries()].filter(([k]) => !k.startsWith("shared:") && !linkCount.has(k)).map(([componentId, v]) => ({ componentId, label: v.label, cost: v.cost }));
  const directTotal = caps.reduce((s, c) => s + c.direct, 0);

  let reason: Allocation["unallocated"]["reason"] = null;
  let unallocatedShared = 0;
  if (linkCount.size === 0) { reason = "noLinks"; unallocatedShared = sharedPool; }
  else if (directTotal <= 0) { reason = "noDirectCost"; unallocatedShared = sharedPool; }

  const capabilities: CapabilityRoi[] = caps.map((c) => {
    const shared = unallocatedShared > 0 ? 0 : sharedPool * (c.direct / directTotal);
    const cost = c.direct + shared;
    return { ...c, shared, cost, net: c.benefit - cost, roi: cost > 0 ? (c.benefit - cost) / cost : null };
  });
  const items = [...unlinked, ...(unallocatedShared > 0 ? [{ componentId: "shared", label: "Shared build, platform and support cost", cost: unallocatedShared }] : [])];
  return {
    capabilities,
    projectBenefit: ledger.months.reduce((s, mo) => s + mo.benefitBy.avoided + mo.benefitBy.oneOff, 0),
    unallocated: { cost: items.reduce((s, i) => s + i.cost, 0), reason, items },
    sharedPool,
  };
}
