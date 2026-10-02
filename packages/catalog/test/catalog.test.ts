import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/index.js";

describe("price catalogue", () => {
  const cat = loadCatalog();

  it("is CAD and validates", () => {
    expect(cat.meta.currency).toBe("CAD");
    expect(cat.chatModels.length).toBeGreaterThan(20);
  });

  it("prices every Azure chat model and credits every Snowflake model", () => {
    for (const m of cat.chatModels) {
      if (m.platform === "azure") expect(m.prices?.global.input, m.id).toBeGreaterThan(0);
      else expect(m.credits?.input, m.id).toBeGreaterThan(0);
    }
  });

  it("keeps cached input at or below input", () => {
    for (const m of cat.chatModels.filter((x) => x.prices)) {
      expect(m.prices!.global.cachedInput, m.id).toBeLessThanOrEqual(m.prices!.global.input);
    }
  });

  it("gives every speech engine a way to price an hour", () => {
    for (const e of cat.speechEngines) {
      expect(Boolean(e.perAudioHour ?? e.tokens ?? e.creditsPerHour), e.id).toBe(true);
    }
  });

  it("only uses Azure and Snowflake", () => {
    const platforms = new Set([...cat.chatModels, ...cat.embeddingModels, ...cat.speechEngines, ...cat.unitPrices].map((x) => x.platform));
    expect([...platforms].sort()).toEqual(["azure", "snowflake"]);
  });
});
