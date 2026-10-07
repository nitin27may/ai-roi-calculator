import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/index.js";
import compute from "../data/resources/compute.json" with { type: "json" };

const cat = loadCatalog();
const byId = new Map(cat.unitPrices.map((u) => [u.id, u]));
const skus = cat.resourceTypes.flatMap((t) => t.skus.map((s) => ({ t, s })));

describe("resource catalogue coverage", () => {
  it("has resource types", () => {
    expect(cat.resourceTypes.length).toBeGreaterThan(0);
    expect(skus.length).toBeGreaterThanOrEqual(3);
  });

  it("points every SKU and meter at an existing unit price of 0 or more (0 only when free)", () => {
    const bad: string[] = [];
    for (const { t, s } of skus) {
      for (const m of t.meters) {
        const id = s.prices[m.id];
        const u = id ? byId.get(id) : undefined;
        const price = u?.manual?.price ?? u?.price;
        if (!u || price === undefined || price < 0) bad.push(`${t.id}/${s.id}/${m.id} -> ${id}`);
        else if (price === 0 && u.attrs?.free !== true) bad.push(`${t.id}/${s.id}/${m.id} is 0 but not marked free`);
      }
      for (const k of Object.keys(s.prices)) if (!t.meters.some((m) => m.id === k)) bad.push(`${t.id}/${s.id} prices unknown meter ${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("gives every declared option a price or an explicit fallback note", () => {
    const bad: string[] = [];
    for (const { t, s } of skus) {
      for (const opt of t.options.filter((o) => o !== "payg")) {
        for (const m of t.meters) {
          const u = byId.get(s.prices[m.id] ?? "");
          if (u && !u.options?.[opt] && typeof u.attrs?.[`fallback.${opt}`] !== "string") bad.push(`${t.id}/${s.id}/${m.id}: ${opt}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("dates every price and option price", () => {
    const bad: string[] = [];
    for (const { t, s } of skus) {
      for (const id of Object.values(s.prices)) {
        const u = byId.get(id);
        if (!u?.source.retrievedAt) bad.push(`${t.id}/${s.id}: ${id}`);
        for (const [k, o] of Object.entries(u?.options ?? {})) if (!o?.source.retrievedAt) bad.push(`${id}.${k}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("leaves no orphan unit price in a resource file", () => {
    const used = new Set(skus.flatMap(({ s }) => Object.values(s.prices)));
    expect(compute.unitPrices.map((u) => u.id).filter((id) => !used.has(id))).toEqual([]);
  });
});
