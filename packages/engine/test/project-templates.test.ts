import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PROJECT_TEMPLATES, ProjectSchema, buildLedger, computeRoi } from "../src/index.js";

const cat = loadCatalog();

describe("project templates", () => {
  for (const t of PROJECT_TEMPLATES) {
    it(`${t.label} is valid and prices`, () => {
      const p = t.make(`Test ${t.label}`);
      const parsed = ProjectSchema.safeParse(p);
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues[0])).toBe(true);
      const L = buildLedger(parsed.data!, cat);
      expect(L.totals.build).toBeGreaterThan(0);
      if (t.id !== "blank") {
        expect(L.totals.runRate).toBeGreaterThan(0);
        expect(computeRoi(L, "full").totalBenefit).toBeGreaterThan(0);
      }
      expect(p.name).toBe(`Test ${t.label}`);
    });
  }
});

describe("sample project Dev Lab coverage", () => {
  it("includes every Dev Lab activity kind and each one costs something", async () => {
    const { loadCatalog } = await import("@studio/catalog");
    const { PriceBook, devLabLines, meetingIntelligence, ACTIVITY_KINDS } = await import("../src/index.js");
    const book = new PriceBook(loadCatalog(), meetingIntelligence.settings);
    const have = new Set(meetingIntelligence.build.activities.map((a) => a.kind));
    for (const k of ACTIVITY_KINDS) expect(have.has(k.kind), `missing ${k.kind}`).toBe(true);
    for (const a of meetingIntelligence.build.activities) {
      let total = 0;
      for (let m = 1; m <= meetingIntelligence.timeline.buildMonths; m++) total += devLabLines(meetingIntelligence, m, book, meetingIntelligence.startDate).filter((l) => l.componentId === a.id).reduce((s, l) => s + l.cost, 0);
      expect(total, a.id).toBeGreaterThan(0);
    }
  });
});
