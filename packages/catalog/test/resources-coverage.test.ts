import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/index.js";
import compute from "../data/resources/compute.json" with { type: "json" };
import database from "../data/resources/database.json" with { type: "json" };
import storage from "../data/resources/storage.json" with { type: "json" };

const cat = loadCatalog();
const byId = new Map(cat.unitPrices.map((u) => [u.id, u]));
const skus = cat.resourceTypes.flatMap((t) => t.skus.map((s) => ({ t, s })));

describe("resource catalogue coverage", () => {
  it("has resource types", () => {
    expect(cat.resourceTypes.length).toBeGreaterThan(0);
    expect(skus.length).toBeGreaterThanOrEqual(250);
    for (const c of ["compute", "database", "storage"]) expect(cat.resourceTypes.some((t) => t.category === c), c).toBe(true);
  });

  it("has no duplicate SKU ids inside a type", () => {
    const dup = cat.resourceTypes.flatMap((t) => t.skus.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i).map((id) => `${t.id}/${id}`));
    expect(dup).toEqual([]);
  });

  it("gives every SKU meter a Retail API rule, on the type or the SKU", () => {
    const bad: string[] = [];
    for (const { t, s } of skus) {
      if (!t.retail) { bad.push(`${t.id} has no retail block`); continue; }
      for (const m of t.meters) if (!t.retail.meters[m.id] && !s.retail?.[m.id]) bad.push(`${t.id}/${s.id}/${m.id}`);
    }
    expect(bad).toEqual([]);
  });

  it("declares a Hybrid Benefit rule for every type that offers the option, and none that cannot price it", () => {
    const bad: string[] = [];
    for (const t of cat.resourceTypes) {
      if (t.options.includes("ahb") && (!t.ahb || t.ahb.kind === "unavailable")) bad.push(`${t.id}: ahb option without a usable rule`);
      if (!t.options.includes("ahb") && t.ahb && t.ahb.kind !== "unavailable") bad.push(`${t.id}: ahb rule ${t.ahb.kind} but no ahb option`);
    }
    expect(bad).toEqual([]);
  });

  it("marks where every price comes from: an API row with meter and filter, or a vendor-doc or derived price with a note", () => {
    const bad: string[] = [];
    for (const { t, s } of skus) for (const id of Object.values(s.prices)) {
      const u = byId.get(id)!;
      if (u.source.kind === "azure-retail-api" && (!u.source.meterName || !u.source.filter)) bad.push(`${id}: retail-api source without meterName and filter`);
      if (u.source.kind === "azure-retail-api" && u.confidence !== "verified") bad.push(`${id}: retail-api price not verified`);
      if (u.source.kind !== "azure-retail-api" && !u.source.note) bad.push(`${id}: ${u.source.kind} source without a note`);
      if (u.source.kind === "vendor-doc" && u.confidence === "verified") bad.push(`${id}: vendor-doc price marked verified`);
      for (const [k, o] of Object.entries(u.options ?? {})) if (!o?.source.note && o?.source.kind !== "azure-retail-api") bad.push(`${id}.${k}: ${o?.source.kind} option without a note`);
    }
    expect(bad).toEqual([]);
  });

  it("never prices a reserved term above pay-as-you-go, or 3 years above 1 year", () => {
    const bad: string[] = [];
    for (const { s } of skus) for (const id of Object.values(s.prices)) {
      const u = byId.get(id)!;
      const ri1 = u.options?.ri1?.price, ri3 = u.options?.ri3?.price;
      if (ri1 !== undefined && ri1 > u.price! * 1.0001) bad.push(`${id}: ri1 ${ri1} above payg ${u.price}`);
      if (ri3 !== undefined && ri3 > (ri1 ?? u.price!) * 1.0001) bad.push(`${id}: ri3 ${ri3} above ${ri1 !== undefined ? "ri1" : "payg"}`);
    }
    expect(bad).toEqual([]);
  });

  it("writes a fallback note only for options the type declares", () => {
    const bad: string[] = [];
    for (const { t, s } of skus) for (const id of Object.values(s.prices)) {
      for (const k of Object.keys(byId.get(id)!.attrs ?? {})) {
        const m = /^fallback\.(.+)$/.exec(k);
        if (m && !t.options.includes(m[1] as never)) bad.push(`${t.id}/${s.id}: ${k}`);
      }
    }
    expect(bad).toEqual([]);
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
    expect([...compute.unitPrices, ...database.unitPrices, ...storage.unitPrices].map((u) => u.id).filter((id) => !used.has(id))).toEqual([]);
  });
});
