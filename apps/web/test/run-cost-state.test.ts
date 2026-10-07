import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { WORKLOAD_KINDS, buildLedger, newWorkload, removeWorkload, steadyState, type Workload } from "@roi-calculator/engine";

const loadCatalogForTest = () => loadCatalog();

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
const { useStudio } = await import("../lib/store");
const fresh = () => { mem.clear(); useStudio.setState({ ...useStudio.getInitialState(), hydrated: false }, true); useStudio.getState().hydrate(); };
const add = (kind: Workload["kind"]) => { let id = ""; useStudio.getState().edit((d) => { const w = newWorkload(d, kind); id = w.id; d.workloads.push(w); }); return id; };
const find = (id: string) => useStudio.getState().project.workloads.find((w) => w.id === id)!;

describe("run cost workloads in the store", () => {
  beforeEach(fresh);

  it("lists the three kinds in the add menu with the agreed labels", () => {
    const label = (k: string) => WORKLOAD_KINDS.find((x) => x.kind === k)?.label;
    expect(label("seats")).toBe("Seats and licences");
    expect(label("contract")).toBe("Vendor or support contract");
    expect(label("transactionFee")).toBe("Per-transaction fee");
  });

  it("a new item starts empty and costs nothing, with nothing chosen for the user", () => {
    for (const kind of ["seats", "contract", "transactionFee"] as const) {
      const w = newWorkload(useStudio.getState().project, kind) as Record<string, unknown>;
      expect(w.unitPriceId).toBeUndefined();
      expect(w.cadPerSeat).toBeUndefined();
      expect(w.cadPerTxn).toBeUndefined();
    }
    const before = buildLedger(useStudio.getState().project, loadCatalogForTest()).totals.runRate;
    add("seats"); add("contract"); add("transactionFee");
    expect(buildLedger(useStudio.getState().project, loadCatalogForTest()).totals.runRate).toBeCloseTo(before, 8);
  });

  it("edits flow into the ledger and persist across a reload", () => {
    const id = add("seats");
    useStudio.getState().edit((d) => { d.roi.growthPctPerYear = 0; });
    useStudio.getState().edit((d) => { const w = d.workloads.find((x) => x.id === id); if (w?.kind === "seats") { w.seats = 50; w.cadPerSeat = 30; w.followsAdoption = true; } });
    const cat = loadCatalogForTest();
    const steady = steadyState(buildLedger(useStudio.getState().project, cat));
    expect(steady.lines.find((l) => l.componentId === id)?.cost).toBeCloseTo(1500, 6);
    useStudio.setState({ hydrated: false });
    useStudio.getState().hydrate();
    const w = find(id);
    expect(w.kind === "seats" && w.followsAdoption && w.cadPerSeat === 30 && w.seats === 50).toBe(true);
  });

  it("removing an item removes its cost", () => {
    const id = add("contract");
    useStudio.getState().edit((d) => { const w = d.workloads.find((x) => x.id === id); if (w?.kind === "contract") w.amountCad = 500; });
    const cat = loadCatalogForTest();
    const cost = (): number => steadyState(buildLedger(useStudio.getState().project, cat)).lines.filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0);
    expect(cost()).toBe(500);
    useStudio.getState().edit((d) => removeWorkload(d, id));
    expect(cost()).toBe(0);
  });
});
