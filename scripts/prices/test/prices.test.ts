import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { one, per1M, PriceMatchError, type RetailRow } from "../retail.js";
import { updateAzure, report } from "../azure.js";
import { applyUsdList, fxFromRows } from "../fx.js";
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

  it("matches the speech, embedding and language meter names live on 2026-10-02", async () => {
    const rows: RetailRow[] = [
      row({ productName: "Azure OpenAI", armRegionName: "canadaeast", meterName: "embedding-ada-glbl Tokens", retailPrice: 0.0001, unitOfMeasure: "1K" }),
      row({ productName: "Azure OpenAI", armRegionName: "eastus2", meterName: "embedding-ada-glbl Tokens", retailPrice: 0.0001, unitOfMeasure: "1K" }),
      row({ productName: "Azure OpenAI", armRegionName: "canadaeast", meterName: "gpt-4o-transcribe-aud-inp-glbl Tokens", retailPrice: 0.0085, unitOfMeasure: "1K" }),
      row({ productName: "Azure OpenAI", armRegionName: "canadaeast", meterName: "gpt-4o-transcribe-txt-out-glbl Tokens", retailPrice: 0.0142, unitOfMeasure: "1K" }),
      row({ productName: "Azure OpenAI Media", armRegionName: "eastus2", meterName: "gpt-transcribe Gl Unit", retailPrice: 0.38, unitOfMeasure: "1 Hour" }),
      row({ productName: "Azure Language", serviceName: "Azure Language", armRegionName: "canadacentral", skuName: "Standard", meterName: "Standard Text Records", retailPrice: 1.4166, unitOfMeasure: "1K" }),
      row({ productName: "Azure Language", serviceName: "Azure Language", armRegionName: "canadacentral", skuName: "Standard", meterName: "Standard Text Records", retailPrice: 1.0624, unitOfMeasure: "1K", tierMinimumUnits: 500 }),
    ];
    const source = async (filter: string) => rows.filter((r) => (filter.includes("Language") ? r.productName === "Azure Language" : filter.includes(`'${r.productName}'`)));
    const embeddings = data("embedding-models"), speech = data("speech-engines"), units = data("unit-prices");
    const r = await updateAzure({ chat: [], embeddings, speech, search: [], units }, source, "canadacentral", "2026-10-02");
    const failed = (id: string) => r.errors.some((e) => e.startsWith(`${id}:`));
    for (const id of ["text-embedding-ada-002", "gpt-4o-transcribe", "gpt-transcribe", "language-records"]) expect(failed(id)).toBe(false);
    expect(embeddings.find((e: any) => e.id === "text-embedding-ada-002").per1M).toBe(0.1);
    expect(speech.find((s: any) => s.id === "gpt-4o-transcribe").tokens).toMatchObject({ audioInputPer1M: 8.5, textOutputPer1M: 14.2 });
    expect(speech.find((s: any) => s.id === "gpt-transcribe").perAudioHour).toBe(0.38);
    expect(units.find((u: any) => u.id === "language-records").price).toBe(1.4166);
    expect(r.unmapped).toEqual([]); // mapped embedding and speech meters are not new models
  });
});

describe("USD list prices", () => {
  const pair = (i: number, cad: number, usd: number) => [
    row({ meterId: `m${i}`, armRegionName: "eastus2", retailPrice: cad }),
    row({ meterId: `m${i}`, armRegionName: "eastus2", retailPrice: usd, currencyCode: "USD" }),
  ];
  it("measures Azure's CAD/USD rate from matched meters", () => {
    const rows = Array.from({ length: 30 }, (_, i) => pair(i, (i + 1) * 1.41655, i + 1));
    const fx = fxFromRows(rows.map((r) => r[0]!), rows.map((r) => r[1]!), "2026-10-02");
    expect(fx.usdToCad).toBe(1.41655);
    expect(fx.meters).toBe(30);
  });
  it("refuses to guess when too few meters match or ratios disagree", () => {
    const few = Array.from({ length: 5 }, (_, i) => pair(i, 1.4, 1));
    expect(() => fxFromRows(few.map((r) => r[0]!), few.map((r) => r[1]!), "2026-10-02")).toThrow(/Only 5 meters/);
    const odd = Array.from({ length: 30 }, (_, i) => pair(i, i === 0 ? 2 : 1.41, 1));
    expect(() => fxFromRows(odd.map((r) => r[0]!), odd.map((r) => r[1]!), "2026-10-02")).toThrow(/disagree/);
  });
  it("converts every listed field and keeps a Retail API source for promo list prices", () => {
    const chat = [
      { id: "claude-x", prices: { global: { input: 0 } }, source: { kind: "derived" } },
      { id: "gpt-promo", prices: { global: { input: 5.6662 } }, source: { kind: "azure-retail-api" } },
    ];
    const r = applyUsdList({ "chat-models": chat }, [
      { file: "chat-models", id: "claude-x", note: "Anthropic list price", usd: { "prices.global.input": 3, "prices.dataZone.input": 3.3 } },
      { file: "chat-models", id: "gpt-promo", usd: { "prices.globalList.input": 5 } },
      { file: "chat-models", id: "gone", usd: { per1M: 1 } },
    ], { usdToCad: 1.41655, meters: 30, asOf: "2026-10-02", source: "test" });
    expect(chat[0]!.prices).toMatchObject({ global: { input: 4.2497 }, dataZone: { input: 4.6746 } });
    expect(chat[0]!.source).toMatchObject({ kind: "derived", note: expect.stringContaining("× 1.41655") });
    expect(chat[1]!.prices).toMatchObject({ globalList: { input: 7.0828 } });
    expect(chat[1]!.source.kind).toBe("azure-retail-api");
    expect(r.missing).toEqual(["chat-models/gone"]);
  });
  it("every usd-list entry points at a catalogue entry and a priced field", () => {
    const list = data("usd-list") as { file: string; id: string; usd: Record<string, number> }[];
    for (const u of list) {
      const entry = data(u.file).find((e: any) => e.id === u.id);
      expect(entry, `${u.file}/${u.id}`).toBeDefined();
      for (const field of Object.keys(u.usd)) expect(field.split(".").reduce((o: any, k) => o?.[k], entry), `${u.id} ${field}`).toBeTypeOf("number");
    }
  });
});

describe("Azure tiers and regions", () => {
  const g5 = (meterName: string, retailPrice: number, armRegionName = "") => row({ productName: "Azure OpenAI GPT5", meterName, retailPrice, armRegionName });
  it("fills Global, US Data Zone, long-context and cache-write prices", async () => {
    const rows = [
      g5("5.6 luna ShortCo Inp Std Gl 1M Tokens", 0.2833), g5("5.6 luna ShortCo Cd Inp Std Gl 1M Tokens", 0.0283),
      g5("5.6 luna ShortCo Opt Std Gl 1M Tokens", 1.6999), g5("5.6 luna ShortCo Cd Wr Std Gl 1M Tokens", 0.3541),
      g5("5.6 luna LongCo Inp Std Gl 1M Tokens", 0.5666), g5("5.6 luna LongCo Cd Inp Std Gl 1M Tokens", 0.0567),
      g5("5.6 luna LongCo Opt Std Gl 1M Tokens", 2.5498), g5("5.6 luna LongCo Cd Wr Std Gl 1M Tokens", 0.7083),
      // US and EU Data Zones price differently; the US one wins.
      ...["eastus2", "westeurope"].flatMap((reg, i) => [
        g5("5.6 luna ShortCo Inp Std DZ 1M Tokens", [0.3116, 0.3896][i]!, reg), g5("5.6 luna ShortCo Cd Inp Std DZ 1M Tokens", [0.0312, 0.039][i]!, reg),
        g5("5.6 luna ShortCo Opt Std DZ 1M Tokens", [1.8698, 2.3373][i]!, reg), g5("5.6 luna ShortCo Cd Wr Std DZ 1M Tokens", [0.3896, 0.4675][i]!, reg),
      ]),
    ];
    const source = async (filter: string) => rows.filter((r) => filter.includes(`'${r.productName}'`));
    const chat = data("chat-models").filter((m: any) => m.id === "gpt-5.6-luna");
    const r = await updateAzure({ chat, embeddings: [], speech: [], search: [], units: [] }, source, "canadacentral", "2026-10-02");
    expect(r.errors).toEqual([]);
    expect(chat[0].prices.global).toEqual({ input: 0.2833, cachedInput: 0.0283, output: 1.6999, cacheWrite: 0.3541 });
    expect(chat[0].prices.dataZone).toEqual({ input: 0.3116, cachedInput: 0.0312, output: 1.8698, cacheWrite: 0.3896 });
    expect(chat[0].longContext.prices).toEqual({ input: 0.5666, cachedInput: 0.0567, output: 2.5498, cacheWrite: 0.7083 });
  });
  it("takes per-region Global prices from Canada first and reports a lost Data Zone meter", async () => {
    const mai = (meterName: string, retailPrice: number, armRegionName: string) => row({ productName: "MAI Models", meterName, retailPrice, armRegionName });
    const rows = [
      mai("MAI-Thinking-1 Inp glbl 1M Tokens", 2.8331, "canadaeast"), mai("MAI-Thinking-1 Inp glbl 1M Tokens", 3.5, "usgovarizona"),
      mai("MAI-Thinking-1 Cd Inp glbl 1M Tokens", 0.2833, "canadaeast"), mai("MAI-Thinking-1 Cd Inp glbl 1M Tokens", 0.3541, "usgovarizona"),
      mai("MAI-Thinking-1 Opt glbl 1M Tokens", 11.3324, "canadaeast"),
    ];
    const source = async (filter: string) => rows.filter((r) => filter.includes(`'${r.productName}'`));
    const chat = data("chat-models").filter((m: any) => m.id === "mai-thinking-1");
    const withDz = structuredClone(chat);
    withDz[0].prices.dataZone = { input: 1, cachedInput: 1, output: 1 };
    const r = await updateAzure({ chat: [...chat, ...withDz.map((m: any) => ({ ...m, id: "mai-thinking-1" }))], embeddings: [], speech: [], search: [], units: [] }, source, "canadacentral", "2026-10-02");
    expect(chat[0].prices.global).toEqual({ input: 2.8331, cachedInput: 0.2833, output: 11.3324 });
    expect(r.errors).toEqual([expect.stringMatching(/^mai-thinking-1: Data Zone: no meter matches/)]);
    expect(withDz[0].prices.dataZone).toEqual({ input: 1, cachedInput: 1, output: 1 }); // kept, not dropped
  });
  it("prices Azure Speech in the catalogue region and realtime models from Media meters", async () => {
    const rows = [
      row({ productName: "Azure Speech", armRegionName: "canadacentral", meterName: "S1 Speech To Text", retailPrice: 1.4166, unitOfMeasure: "1 Hour" }),
      row({ productName: "Azure Speech", armRegionName: "canadacentral", meterName: "S1 Speech to Text Enhanced Feature Audio", retailPrice: 0.425, unitOfMeasure: "1 Hour" }),
      row({ productName: "Azure OpenAI Media", meterName: "gpt-live-transcribe Gl Unit", retailPrice: 1.4449, unitOfMeasure: "1 Hour" }),
      ...[["Text inp", 5.6662], ["Text cd inp", 0.5666], ["Text opt", 33.9972], ["Audio inp", 45.3296], ["Audio cd inp", 0.5666], ["Audio opt", 90.6592]].map(([m, p]) =>
        row({ productName: "Azure OpenAI Media", meterName: `gpt-realtime-2.1 ${m} Gl 1M Tokens`, retailPrice: p as number })),
    ];
    const source = async (filter: string) => rows.filter((r) => filter.includes(`'${r.productName}'`));
    const speech = data("speech-engines"), realtime = data("realtime-models");
    await updateAzure({ chat: [], embeddings: [], speech, search: [], units: [], realtime }, source, "canadacentral", "2026-10-02");
    expect(speech.find((s: any) => s.id === "speech-realtime")).toMatchObject({ perAudioHour: 1.4166, diarizationAddOnPerHour: 0.425 });
    expect(speech.find((s: any) => s.id === "gpt-live-transcribe").perAudioHour).toBe(1.4449);
    expect(realtime.find((m: any) => m.id === "gpt-realtime-2.1")).toMatchObject({ text: { input: 5.6662, cachedInput: 0.5666, output: 33.9972 }, audio: { input: 45.3296, output: 90.6592 } });
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

  // Excerpt of the 2026-10 PDF text layout: spaced separators, footnote markers before rates, "See … below" rows.
  const live = `Table 6(a): Snowflake AI Features Table AI_COMPLETE – claude - opus - 5 5 3.00 15.00 AI_COMPLETE – claude - opus - 5 - 5 5 2.40 12.00
    AI_COMPLETE – claude - sonnet - 4 - 5 1.80 9.00 AI_COMPLETE – gemini - 3.7 - flash 5 , 22 0.45 2.25 AI_COMPLETE – openai - gpt - 5 5 0.75 6.00
    AI_COMPLETE – openai - gpt - 5 - mini 5 0.15 1.20 AI_COMPLETE – openai - gpt - 5.1 0.75 6.00 AI_EMBED – snowflake - arctic - embed - m 0.03
    AI_EMBED – snowflake - arctic - embed - m - v1.5 0.04 AI_EXTRACT – arctic - extract 5.55 AI_FILTER 1.62
    AI_PARSE_DOCUMENT – Layout See “Snowflake AI Features Table, Other” below AI_PARSE_DOCUMENT – OCR See “Snowflake AI Features Table, Other” below AI_REDACT 0.69
    Guard 0.25 Table 6(g): Other AI_PARSE_DOCUMENT – Layout 3.66 AI Credits per 1,000 pages AI_PARSE_DOCUMENT – OCR 0.68 AI Credits per 1,000 pages
    Batch Cortex Search 5 0.12 AI Credits per GB/hr of indexed data Cortex Analyst 67 Platform Credits per 1,000 messages 24 Cortex Search 6.3 AI Credits per GB/mo of indexed data`;
  it("reads names with spaced separators and skips footnote markers", () => {
    expect(findNumbers(live, ["claude-opus-5-5"], 2)?.values).toEqual([2.4, 12]);
    expect(findNumbers(live, ["claude-opus-5"], 2)?.values).toEqual([3, 15]);
    expect(findNumbers(live, ["gemini-3.7-flash"], 2)?.values).toEqual([0.45, 2.25]);
    expect(findNumbers(live, ["openai-gpt-5"], 2)?.values).toEqual([0.75, 6]);
    expect(findNumbers(live, ["snowflake-arctic-embed-m"], 1)?.values).toEqual([0.03]);
    expect(findNumbers(live, ["snowflake-arctic-embed-m-v1.5"], 1)?.values).toEqual([0.04]);
  });
  it("follows 'See … below' rows and picks the row with the expected unit", () => {
    const units = data("unit-prices");
    applySnowflake(live, [], [], units, "2026-10-02");
    const credits = (id: string) => units.find((u: any) => u.id === id).credits;
    expect([credits("sf-parse-layout"), credits("sf-parse-ocr"), credits("sf-ai-extract"), credits("sf-cortex-guard"), credits("sf-search-serving")]).toEqual([3.66, 0.68, 5.55, 0.25, 6.3]);
  });
});
