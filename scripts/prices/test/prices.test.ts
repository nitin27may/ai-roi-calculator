import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { one, per1M, PriceMatchError, type RetailRow } from "../retail.js";
import { updateAzure, report } from "../azure.js";
import { applySnowflake, findNumbers } from "../snowflake.js";

const row = (o: Partial<RetailRow>): RetailRow => ({ currencyCode: "CAD", retailPrice: 1, armRegionName: "", productName: "Azure OpenAI GPT5", skuName: "", meterName: "", serviceName: "Foundry Models", unitOfMeasure: "1M", tierMinimumUnits: 0, type: "Consumption", ...o });
const data = (f: string) => JSON.parse(readFileSync(new URL(`../../../packages/catalog/data/${f}.json`, import.meta.url), "utf8"));

describe("retail matching", () => {
  it("normalises 1K token meters to per 1M", () => {
    expect(per1M(row({ retailPrice: 0.0035, unitOfMeasure: "1K" }))).toBe(3.5);
  });
  it("refuses ambiguous matches", () => {
    const rows = [row({ meterName: "5.4 inp Gl 1M", retailPrice: 3.4 }), row({ meterName: "5.4 inp glbl 1M", retailPrice: 3.5 })];
    expect(() => one(rows, { meterName: "^5\\.4 inp (Gl|glbl) 1M" })).toThrow(PriceMatchError);
  });
});

describe("Azure refresh", () => {
  it("updates mapped prices, reports changes and unmapped meters", async () => {
    const rows: RetailRow[] = [
      row({ meterName: "5.4 inp Gl 1M", retailPrice: 3.6 }),
      row({ meterName: "5.4 cd inp Gl 1M", retailPrice: 0.36 }),
      row({ meterName: "5.4 opt Gl 1M", retailPrice: 21.5 }),
      row({ meterName: "6.2 nova inp Gl 1M", retailPrice: 2.9 }),
      row({ productName: "Azure Cognitive Search", serviceName: "Azure AI Search", armRegionName: "canadacentral", meterName: "Basic Unit", retailPrice: 0.14, unitOfMeasure: "1 Hour" }),
    ];
    const source = async (filter: string) => rows.filter((r) => (filter.includes("Search") ? r.serviceName === "Azure AI Search" : filter.includes(`'${r.productName}'`)));
    const chat = data("chat-models"), search = data("search-tiers"), units = data("unit-prices");
    const r = await updateAzure({ chat, embeddings: data("embedding-models"), speech: data("speech-engines"), search, units }, source, "canadacentral", "2026-10-02");
    const g = chat.find((m: any) => m.id === "gpt-5.4");
    expect(g.prices.global).toMatchObject({ input: 3.6, cachedInput: 0.36, output: 21.5 });
    expect(g.source.kind).toBe("azure-retail-api");
    expect(search.find((t: any) => t.id === "basic").perSUMonth).toBe(102.2);
    expect(units.find((u: any) => u.id === "search-su-basic").price).toBe(102.2);
    expect(r.unmapped).toEqual(["Azure OpenAI GPT5 · 6.2 nova inp Gl 1M"]);
    expect(r.errors.length).toBeGreaterThan(0); // other models have no fixture meters
    expect(report(r, "2026-10-02", "canadacentral")).toContain("6.2 nova");
  });
});

describe("Snowflake consumption table parsing", () => {
  const text = `Table 6(a): AI Functions  Model  Input  Output  claude-sonnet-4-5 1.65 8.25  openai-gpt-5 0.69 5.50
    llama3.1-8b 0.11 0.11  snowflake-arctic-embed-l-v2.0 0.05  AI_PARSE_DOCUMENT (LAYOUT) 3.33  AI_PARSE_DOCUMENT (OCR) 0.50  AI_EXTRACT 5.00 Cortex Guard 0.25`;
  it("finds the credit numbers after a name", () => {
    expect(findNumbers(text, ["claude-sonnet-4-5"], 2)?.values).toEqual([1.65, 8.25]);
    expect(findNumbers(text, ["llama3.1-8b"], 2)?.values).toEqual([0.11, 0.11]);
  });
  it("does not confuse prefixes", () => {
    expect(findNumbers(text, ["openai-gpt-5-mini"], 2)).toBeNull();
  });
  it("updates catalogue entries and lists what it could not find", () => {
    const chat = data("chat-models"), emb = data("embedding-models"), units = data("unit-prices");
    const r = applySnowflake(text, chat, emb, units, "2026-10-02");
    expect(chat.find((m: any) => m.id === "sf:openai-gpt-5").credits).toMatchObject({ input: 0.69, output: 5.5 });
    expect(units.find((u: any) => u.id === "sf-parse-layout").credits).toBe(3.33);
    expect(r.missing).toContain("claude-opus-5-5");
  });
});
