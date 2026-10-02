import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PriceBook, devLabLines, meetingIntelligence, type Project } from "../src/index.js";

const cat = loadCatalog();
const book = new PriceBook(cat, meetingIntelligence.settings);
const date = meetingIntelligence.startDate;
const costOf = (p: Project, id: string, m: number) => devLabLines(p, m, book, date).filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0);
const withFactors = (id: string, f: number[]) => {
  const p = structuredClone(meetingIntelligence);
  const a = p.build.activities.find((x) => x.id === id)!;
  (a as { monthFactors: number[] }).monthFactors = f;
  return p;
};

describe("Dev Lab month plan", () => {
  for (const id of ["regression", "redteam", "playground", "tooling"]) {
    it(`${id}: a factor of 0 turns the month off and a factor scales the cost`, () => {
      const m = 6; // inside every activity's window in the sample
      const base = costOf(meetingIntelligence, id, m);
      expect(base).toBeGreaterThan(0);
      expect(costOf(withFactors(id, [0]), id, m)).toBe(0);
      if (id === "tooling") {
        // Seats stay; only coding-agent tokens scale.
        const half = costOf(withFactors(id, [0.5]), id, m);
        expect(half).toBeGreaterThan(base / 2);
        expect(half).toBeLessThan(base);
      } else {
        expect(costOf(withFactors(id, [2]), id, m)).toBeCloseTo(base * 2, 6);
      }
    });
  }

  it("repeats the last factor for later months", () => {
    const p = withFactors("playground", [0, 1]);
    expect(costOf(p, "playground", 1)).toBe(0);
    expect(costOf(p, "playground", 5)).toBeCloseTo(costOf(meetingIntelligence, "playground", 5), 6);
  });
});

describe("plan helpers", () => {
  it("expands, edits and shapes a plan over the build", async () => {
    const { planValues, setPlanValue, applyShape } = await import("../src/index.js");
    const p = structuredClone(meetingIntelligence);
    const it_ = p.build.activities.find((a) => a.id === "iterations")!;
    if (it_.kind !== "iterations") throw new Error();
    expect(planValues(it_, 6)).toEqual([0.6, 0.6, 1, 1, 1, 1]);
    setPlanValue(it_, 4, 0.5, 6);
    expect(it_.monthFactors).toEqual([0.6, 0.6, 1, 0.5, 1, 1]);
    applyShape(it_, "lateOnly", 6);
    expect(it_.monthFactors).toEqual([0, 0, 0, 0, 1, 1]);
    const b = p.build.activities.find((a) => a.kind === "bakeoff")!;
    if (b.kind !== "bakeoff") throw new Error();
    applyShape(b, "frontLoaded", 6);
    expect(b.sweepsPerMonth[0]).toBe(6);
    expect(b.sweepsPerMonth[5]).toBe(2);
  });
});
