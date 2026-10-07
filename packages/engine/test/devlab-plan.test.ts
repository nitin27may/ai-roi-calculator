import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
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

describe("synthetic data and fine-tuning", () => {
  const withActivity = async (kind: "synthetic" | "finetune") => {
    const { newActivity } = await import("../src/index.js");
    const p = structuredClone(meetingIntelligence);
    const a = newActivity(p, kind);
    p.build.activities.push(a);
    return { p, a };
  };

  it("generates accepted ÷ pass rate examples and judges each one", async () => {
    const { p, a } = await withActivity("synthetic");
    if (a.kind !== "synthetic") throw new Error();
    a.batchShare = 0;
    const lines = devLabLines(p, 1, book, date).filter((l) => l.componentId === a.id);
    const gen = lines.find((l) => l.id.endsWith(":generate"))!;
    expect(gen.quantity).toBeCloseTo(2000 / 0.6, 6);
    const tk = book.tokenizerMultiplier(a.generatorModelId);
    expect(gen.unitPrice).toBeCloseTo(book.chatCost(a.generatorModelId, { input: 1500 * tk, output: 700 * tk }, date), 9);
    expect(lines.find((l) => l.id.endsWith(":judge"))!.quantity).toBeCloseTo(gen.quantity, 6);
    delete a.judgeModelId;
    expect(devLabLines(p, 1, book, date).filter((l) => l.componentId === a.id)).toHaveLength(1);
    expect(costOf(p, a.id, 3)).toBe(0); // default plan: [1, 0.5, 0]
  });

  it("prices fine-tuning by training tokens or hours, plus hosting", async () => {
    const { p, a } = await withActivity("finetune");
    if (a.kind !== "finetune") throw new Error();
    expect(costOf(p, a.id, 1)).toBe(0); // default plan starts in month 2
    const lines = devLabLines(p, 2, book, date).filter((l) => l.componentId === a.id);
    const train = lines.find((l) => l.id.endsWith(":train"))!;
    expect(train.quantity).toBeCloseTo((3 * 5000 * 1500 * 3) / 1e6, 9);
    expect(train.unitPrice).toBeCloseTo(book.unitPrice("ft-train-gpt-4.1-mini"), 9);
    expect(lines.find((l) => l.id.endsWith(":host"))!.cost).toBeCloseTo(160 * book.unitPrice("ft-hosting"), 6);
    a.trainingPriceId = "ft-train-o4-mini-rft";
    a.hoursPerRun = 4;
    const rft = devLabLines(p, 2, book, date).find((l) => l.id === `${a.id}:train`)!;
    expect(rft.quantity).toBe(12);
    expect(rft.unit).toBe("training hour");
  });
});
