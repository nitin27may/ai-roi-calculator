import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PriceBook, creditSummary, newWorkload, meetingIntelligence, warehouseLine, workloadLines, type Workload } from "../src/index.js";

const cat = loadCatalog();
const book = new PriceBook(cat, { azureDeployment: "dataZone", snowflake: { routing: "global", edition: "enterprise" } });
const ctx = { book, date: "2027-01-01", harnesses: new Map(), percentile: "p50" as const };
const lines = (w: Workload) => workloadLines(w, ctx);
const platform = cat.snowflake.platformCredit.enterprise!;
const rate = (id: string) => cat.unitPrices.find((u) => u.id === id)!.credits!;

describe("Snowflake workloads", () => {
  it("prices warehouse time in platform credits (MEDIUM = 4 credits/hour)", () => {
    const w = newWorkload(structuredClone(meetingIntelligence), "snowflakeComplete");
    const wh = lines(w).find((l) => l.id.endsWith(":warehouse"))!;
    expect(wh.cost).toBeCloseTo(20 * 4 * platform, 6);
  });

  it("bills AI functions on input + hidden prompt + output tokens in AI credits", () => {
    const w = newWorkload(structuredClone(meetingIntelligence), "snowflakeFunction") as Extract<Workload, { kind: "snowflakeFunction" }>;
    const fn = lines(w).find((l) => l.id.endsWith(":fn"))!;
    const credits = (w.rowsPerMonth * (w.tokensPerRow + w.hiddenPromptTokens + w.outputTokensPerRow)) / 1e6 * rate("sf-ai-classify");
    expect(fn.cost).toBeCloseTo(credits * cat.snowflake.aiCreditGlobal, 6);
  });

  it("matches the Cortex Search docs example: 10M rows × (768 × 4 + 1,000 B) ≈ 256.5 credits", () => {
    const w: Workload = { kind: "cortexSearch", id: "cs", label: "Search", rows: 10_000_000, vectorColumns: 1, embeddingModelId: "sf:snowflake-arctic-embed-m-v1.5", avgRowBytes: 1000, tokensPerRow: 500, changedShareMonthly: 0, warehouse: { size: "m", hoursPerMonth: 0 } };
    const serving = lines(w).find((l) => l.id.endsWith(":serving"))!;
    expect(serving.quantity * 6.3).toBeCloseTo(256.5, 0); // the docs example's own rate, not the catalogue's
    expect(serving.behaviour).toBe("fixed");
  });

  it("rejects an Azure model in AI_COMPLETE", () => {
    const w: Workload = { kind: "snowflakeComplete", id: "x", label: "x", modelId: "gpt-5.4", rowsPerMonth: 1, inputTokens: 1, outputTokens: 1, warehouse: { size: "xs", hoursPerMonth: 1 } };
    expect(() => lines(w)).toThrow(/not a Snowflake Cortex model/);
  });

  it("adds warehouse time to Snowflake document parsing", () => {
    const w: Workload = { kind: "documents", id: "d", label: "Docs", pagesPerMonth: 10000, pageType: "dense", route: { type: "extract", extractorId: "sf-parse-layout", addOnIds: [] }, warehouse: { size: "m", hoursPerMonth: 5 } };
    const ls = lines(w);
    expect(ls.find((l) => l.id === "d:extract")!.cost).toBeCloseTo(10 * rate("sf-parse-layout") * cat.snowflake.aiCreditGlobal, 6);
    expect(ls.find((l) => l.id === "d:warehouse")!.cost).toBeCloseTo(5 * 4 * platform, 6);
  });
});

describe("Snowflake credits to CAD", () => {
  const fnWorkload = () => {
    const w = newWorkload(structuredClone(meetingIntelligence), "snowflakeFunction") as Extract<Workload, { kind: "snowflakeFunction" }>;
    return w;
  };
  const withSettings = (snowflake: { aiCreditCad?: number; platformCreditCad?: number }) =>
    new PriceBook(cat, { azureDeployment: "dataZone", snowflake: { routing: "global", edition: "enterprise", ...snowflake } });

  it("carries credits, rate and the conversion in the formula on a Cortex function line", () => {
    const w = fnWorkload();
    const fn = lines(w).find((l) => l.id.endsWith(":fn"))!;
    const credits = (w.rowsPerMonth * (w.tokensPerRow + w.hiddenPromptTokens + w.outputTokensPerRow)) / 1e6 * rate("sf-ai-classify");
    expect(fn.credit).toEqual({ type: "ai", creditsPerUnit: rate("sf-ai-classify"), cadPerCredit: cat.snowflake.aiCreditGlobal, manual: false });
    expect(fn.quantity * fn.credit!.creditsPerUnit).toBeCloseTo(credits, 6);
    expect(fn.cost).toBeCloseTo(credits * cat.snowflake.aiCreditGlobal, 6);
    expect(fn.formula).toContain(`AI credits × C$${cat.snowflake.aiCreditGlobal.toFixed(2)}/credit = C$`);
    expect(fn.formula).toContain("catalogue rate");
  });

  it("gives known credits a known CAD figure on a warehouse line (4 credits/h x 10 h x C$ rate)", () => {
    const b = withSettings({ platformCreditCad: 4 });
    const wh = warehouseLine("x", "Test", { size: "m", hoursPerMonth: 10 }, b, "usage");
    expect(wh.cost).toBeCloseTo(160, 9);
    expect(wh.credit).toEqual({ type: "platform", creditsPerUnit: 4, cadPerCredit: 4, manual: true });
    expect(wh.formula).toContain("40 platform credits × C$4.00/credit = C$160.00 (manual rate)");
  });

  it("override changes the rate and tag but not the credits; default is tagged catalogue", () => {
    const w = fnWorkload();
    const base = workloadLines(w, { ...ctx, book: withSettings({}) }).find((l) => l.id.endsWith(":fn"))!;
    const over = workloadLines(w, { ...ctx, book: withSettings({ aiCreditCad: 3 }) }).find((l) => l.id.endsWith(":fn"))!;
    expect(over.credit!.manual).toBe(true);
    expect(base.credit!.manual).toBe(false);
    expect(over.quantity * over.credit!.creditsPerUnit).toBeCloseTo(base.quantity * base.credit!.creditsPerUnit, 9);
    expect(over.cost).toBeCloseTo(over.quantity * over.credit!.creditsPerUnit * 3, 9);
    expect(over.formula).toContain("C$3.00/credit");
    expect(over.formula).toContain("manual rate");
  });

  it("leaves cost identical to credits x rate on every Snowflake line, and puts no credit data on Azure lines", () => {
    const w = newWorkload(structuredClone(meetingIntelligence), "snowflakeComplete");
    for (const l of lines(w)) {
      expect(l.credit).toBeDefined();
      expect(l.cost).toBeCloseTo(l.quantity * l.credit!.creditsPerUnit * l.credit!.cadPerCredit, 6);
    }
    const az = lines({ kind: "llm", id: "a", label: "a", callsPerMonth: 10, modelId: "gpt-5.4", inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, batchShare: 0, reasoning: "none" } as Workload);
    expect(az.every((l) => l.credit === undefined)).toBe(true);
  });

  it("summarises credits per type and exports them as appended line-item columns", () => {
    const w = newWorkload(structuredClone(meetingIntelligence), "snowflakeFunction");
    const s = creditSummary(lines(w));
    expect(s.map((x) => x.type).sort()).toEqual(["ai", "platform"]);
    expect(s.reduce((t, x) => t + x.cad, 0)).toBeCloseTo(lines(w).reduce((t, l) => t + l.cost, 0), 6);
  });
});
