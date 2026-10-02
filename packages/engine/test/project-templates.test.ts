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
