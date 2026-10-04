import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PriceBook, ProjectSchema, availableIn, meetingIntelligence, type AzureDeployment } from "../src/index.js";

const cat = loadCatalog();
const book = (d: AzureDeployment) => new PriceBook(cat, { azureDeployment: d, snowflake: { routing: "global", edition: "enterprise" } });
const model = (id: string) => cat.chatModels.find((m) => m.id === id)!;
const DATE = "2026-11-01";

describe("Canada Regional and US Data Zone deployments", () => {
  it("prices a model at its own deployment price", () => {
    expect(book("regional").tokenPrices("gpt-4o", DATE)).toEqual(model("gpt-4o").prices!.regional);
    expect(book("dataZone").tokenPrices("gpt-4o", DATE)).toEqual(model("gpt-4o").prices!.dataZone);
  });

  it("flags a model the deployment does not offer and prices it at the closest tier", () => {
    const b = book("regional");
    expect(b.tokenPrices("gpt-5.4", DATE)).toEqual(model("gpt-5.4").prices!.dataZone);
    expect([...b.notes.values()]).toContainEqual({ kind: "unavailable", message: expect.stringContaining("GPT-5.4 is not offered as Canada Regional Standard") });
  });

  it("flags a model with a Data Zone price that Microsoft offers only as Global", () => {
    const b = book("dataZone");
    b.tokenPrices("gpt-5.1-codex", DATE);
    expect([...b.notes.values()].map((n) => n.kind)).toContain("unavailable");
  });

  it("scales long-context prices by the deployment's ratio to Global", () => {
    const m = model("gpt-5.4"), p = book("dataZone").tokenPrices("gpt-5.4", DATE, m.longContext!.threshold + 1);
    expect(p.input).toBeCloseTo(m.longContext!.prices.input * (m.prices!.dataZone!.input / m.prices!.global.input), 6);
  });

  it("uses per-deployment embedding prices and flags speech engines not offered", () => {
    const e = cat.embeddingModels.find((x) => x.id === "text-embedding-3-large")!;
    expect(book("regional").embeddingPer1M(e.id)).toBe(e.deployments!.regional);
    expect(book("dataZone").embeddingPer1M(e.id)).toBe(e.deployments!.dataZone);
    const b = book("regional");
    b.speechPerHour("mai-transcribe-2", DATE);
    expect([...b.notes.keys()]).toContain("unavailable:mai-transcribe-2");
  });

  it("availability follows availableIn first, then prices", () => {
    expect(availableIn(model("gpt-4.1-mini"), "regional")).toBe(true);
    expect(availableIn(model("gpt-5.6-sol"), "regional")).toBe(false);
    expect(availableIn(model("claude-sonnet-5-5"), "dataZone")).toBe(true);
    expect(availableIn(model("claude-haiku-4-5"), "dataZone")).toBe(false);
    expect(availableIn({ prices: { dataZone: {} } }, "regional")).toBe(false);
    expect(availableIn({ platform: "snowflake" }, "regional")).toBe(true);
  });

  it("opens projects saved with Global Standard as US Data Zone", () => {
    const saved = { ...structuredClone(meetingIntelligence), settings: { ...meetingIntelligence.settings, azureDeployment: "global" } };
    expect(ProjectSchema.parse(saved).settings.azureDeployment).toBe("dataZone");
  });
});
