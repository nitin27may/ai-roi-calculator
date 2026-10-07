import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, blankProject, type Project } from "@roi-calculator/engine";
import {
  ENV_QUICK_ADDS, filterSkus, newEnvironment, newResource, pickerCategories, removeEnvironment, resourceEnvIds, setMonthBound, setResourceSku,
  setScheduleMode, supportsAhb, termOptions, toggleResourceEnv,
} from "../lib/infrastructure";

const catalog = loadCatalog();
const vm = catalog.resourceTypes.find((t) => t.id === "vm")!;
const asp = catalog.resourceTypes.find((t) => t.id === "app-service-plan")!;
const blank = () => ProjectSchema.parse(blankProject("x")) as Project;

describe("environments", () => {
  it("a blank project has none, so nothing is preselected", () => {
    expect(blank().environments ?? []).toEqual([]);
    expect(blank().resources ?? []).toEqual([]);
  });

  it("quick-adds set a name and production flag only", () => {
    const e = newEnvironment("dev", []);
    expect(e).toMatchObject({ label: "Development", production: false, sizeFactor: 1, schedule: { hoursPerMonth: 730 }, pricing: "payg" });
    expect(e.fromMonth).toBeUndefined();
    expect(newEnvironment("prod", [e]).production).toBe(true);
    expect(newEnvironment("dr", []).production).toBe(true);
    expect(newEnvironment("custom", []).label).toBe("");
    expect(ENV_QUICK_ADDS.map((q) => q.label)).toEqual(["Development", "Test", "UAT", "Production", "Disaster recovery", "Custom"]);
  });

  it("gives unique ids when the same kind is added twice", () => {
    const a = newEnvironment("test", []);
    const b = newEnvironment("test", [a]);
    expect(a.id).not.toBe(b.id);
  });

  it("converts the schedule between modes and keeps the hours", () => {
    const e = newEnvironment("dev", []);
    setScheduleMode(e, "perDay");
    expect(e.schedule).toEqual({ hoursPerDay: 24, daysPerMonth: 30.42 });
    e.schedule = { hoursPerDay: 10, daysPerMonth: 22 };
    setScheduleMode(e, "perMonth");
    expect(e.schedule).toEqual({ hoursPerMonth: 220 });
  });

  it("sets and clears month bounds", () => {
    const e = newEnvironment("uat", []);
    setMonthBound(e, "fromMonth", "5");
    setMonthBound(e, "toMonth", "6");
    expect(e).toMatchObject({ fromMonth: 5, toMonth: 6 });
    setMonthBound(e, "fromMonth", "");
    expect(e.fromMonth).toBeUndefined();
    setMonthBound(e, "toMonth", "0");
    expect(e.toMonth).toBeUndefined();
  });

  it("removing an environment drops it from resource selections", () => {
    const p = blank();
    p.environments = [newEnvironment("dev", []), { ...newEnvironment("prod", []), id: "prod-2" }];
    const r = newResource(vm, "d4s-v5-windows", []);
    r.envIds = [p.environments[0]!.id, "prod-2"];
    p.resources = [r];
    removeEnvironment(p, p.environments[0]!.id);
    expect(p.environments.map((e) => e.id)).toEqual(["prod-2"]);
    expect(p.resources[0]!.envIds).toBeUndefined();
  });
});

describe("resources", () => {
  it("a new resource is pay-as-you-go, no Hybrid Benefit, no inputs, all environments", () => {
    const r = newResource(vm, "d4s-v5-windows", []);
    expect(r).toMatchObject({ typeId: "vm", skuId: "d4s-v5-windows", inputs: {}, term: "payg", ahb: false, label: "Virtual machine" });
    expect(r.envIds).toBeUndefined();
    expect(newResource(vm, "d4s-v5-windows", [r]).label).toBe("Virtual machine 2");
  });

  it("selects environments, storing all as absent", () => {
    const envs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const r = newResource(vm, "d4s-v5-windows", []);
    expect(resourceEnvIds(r, envs)).toEqual(["a", "b", "c"]);
    toggleResourceEnv(r, envs, "b", false);
    expect(r.envIds).toEqual(["a", "c"]);
    toggleResourceEnv(r, envs, "a", false);
    toggleResourceEnv(r, envs, "c", false);
    expect(r.envIds).toEqual([]);
    toggleResourceEnv(r, envs, "b", true);
    expect(r.envIds).toEqual(["b"]);
    toggleResourceEnv(r, envs, "a", true);
    toggleResourceEnv(r, envs, "c", true);
    expect(r.envIds).toBeUndefined();
  });

  it("offers only the terms the SKU has prices for", () => {
    expect(termOptions(catalog, vm, "d4s-v5-windows")).toEqual(["payg", "ri1", "ri3"]);
    expect(termOptions(catalog, asp, "p1v3-linux").includes("payg")).toBe(true);
    expect(termOptions(catalog, vm, "no-such-sku")).toEqual(["payg"]);
    const noRi = { ...vm, options: ["payg" as const] };
    expect(termOptions(catalog, noRi, "d4s-v5-windows")).toEqual(["payg"]);
  });

  it("shows Hybrid Benefit only for types that declare it", () => {
    expect(supportsAhb(vm)).toBe(true);
    expect(supportsAhb(asp)).toBe(false);
  });

  it("resets a term the new SKU cannot use", () => {
    const r = newResource(vm, "d4s-v5-windows", []);
    r.term = "ri3";
    const limited = { ...vm, skus: vm.skus.map((s) => ({ ...s })), options: ["payg" as const] };
    setResourceSku(catalog, r, limited, "d4s-v5-linux");
    expect(r.term).toBe("payg");
    expect(r.skuId).toBe("d4s-v5-linux");
  });
});

describe("picker", () => {
  it("groups types by category and filters SKUs by words", () => {
    const cats = pickerCategories(catalog.resourceTypes);
    expect(cats.find((c) => c.category === "compute")!.types.map((t) => t.id)).toContain("vm");
    const windows = vm.skus.filter((s) => /windows/i.test(s.label));
    expect(windows.length).toBeGreaterThan(0);
    expect(filterSkus(vm, "windows").shown.map((s) => s.id)).toEqual(windows.slice(0, 50).map((s) => s.id));
    expect(filterSkus(vm, "windows").total).toBe(windows.length);
    const d4sLinux = vm.skus.filter((s) => /d4s/i.test(s.label) && /linux/i.test(s.label));
    expect(d4sLinux.some((s) => s.id === "d4s-v5-linux")).toBe(true);
    expect(filterSkus(vm, "d4s linux").total).toBe(d4sLinux.length);
    expect(filterSkus(vm, "").total).toBe(vm.skus.length);
    expect(filterSkus(vm, "zzz").total).toBe(0);
    const big = { ...vm, skus: Array.from({ length: 300 }, (_, i) => ({ id: `s${i}`, label: `Size ${i}`, attrs: {}, prices: {} })) };
    const f = filterSkus(big, "size");
    expect(f.shown).toHaveLength(50);
    expect(f.total).toBe(300);
  });
});
