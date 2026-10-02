import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PriceBook, newWorkload, meetingIntelligence, workloadLines, type Workload } from "../src/index.js";

const cat = loadCatalog();
const book = new PriceBook(cat, { azureDeployment: "global", snowflake: { routing: "global", edition: "enterprise" } });
const ctx = { book, date: "2027-01-01", harnesses: new Map(), percentile: "p50" as const };
const lines = (w: Workload) => workloadLines(w, ctx);
const platform = cat.snowflake.platformCredit.enterprise!;

describe("Snowflake workloads", () => {
  it("prices warehouse time in platform credits (MEDIUM = 4 credits/hour)", () => {
    const w = newWorkload(structuredClone(meetingIntelligence), "snowflakeComplete");
    const wh = lines(w).find((l) => l.id.endsWith(":warehouse"))!;
    expect(wh.cost).toBeCloseTo(20 * 4 * platform, 6);
  });

  it("bills AI functions on input + hidden prompt + output tokens in AI credits", () => {
    const w = newWorkload(structuredClone(meetingIntelligence), "snowflakeFunction") as Extract<Workload, { kind: "snowflakeFunction" }>;
    const fn = lines(w).find((l) => l.id.endsWith(":fn"))!;
    const credits = (w.rowsPerMonth * (w.tokensPerRow + w.hiddenPromptTokens + w.outputTokensPerRow)) / 1e6 * 1.39;
    expect(fn.cost).toBeCloseTo(credits * cat.snowflake.aiCreditGlobal, 6);
  });

  it("matches the Cortex Search docs example: 10M rows × (768 × 4 + 1,000 B) ≈ 256.5 credits", () => {
    const w: Workload = { kind: "cortexSearch", id: "cs", label: "Search", rows: 10_000_000, vectorColumns: 1, embeddingModelId: "sf:snowflake-arctic-embed-m-v1.5", avgRowBytes: 1000, tokensPerRow: 500, changedShareMonthly: 0, warehouse: { size: "m", hoursPerMonth: 0 } };
    const serving = lines(w).find((l) => l.id.endsWith(":serving"))!;
    expect(serving.quantity * 6.3).toBeCloseTo(256.5, 0);
    expect(serving.behaviour).toBe("fixed");
  });

  it("rejects an Azure model in AI_COMPLETE", () => {
    const w: Workload = { kind: "snowflakeComplete", id: "x", label: "x", modelId: "gpt-5.4", rowsPerMonth: 1, inputTokens: 1, outputTokens: 1, warehouse: { size: "xs", hoursPerMonth: 1 } };
    expect(() => lines(w)).toThrow(/not a Snowflake Cortex model/);
  });

  it("adds warehouse time to Snowflake document parsing", () => {
    const w: Workload = { kind: "documents", id: "d", label: "Docs", pagesPerMonth: 10000, pageType: "dense", route: { type: "extract", extractorId: "sf-parse-layout", addOnIds: [] }, warehouse: { size: "m", hoursPerMonth: 5 } };
    const ls = lines(w);
    expect(ls.find((l) => l.id === "d:extract")!.cost).toBeCloseTo(10 * 3.33 * cat.snowflake.aiCreditGlobal, 6);
    expect(ls.find((l) => l.id === "d:warehouse")!.cost).toBeCloseTo(5 * 4 * platform, 6);
  });
});
