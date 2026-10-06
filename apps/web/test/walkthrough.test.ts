import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { PriceBook, blankProject } from "@studio/engine";
import { GLOSSARY } from "../lib/glossary";
import { HELP } from "../lib/help";
import { INTROS } from "../lib/intros";
import { DEFAULT_FILE, DEFAULT_SHEET, agentGuide, fileGuide } from "../lib/walkthrough";

const cat = loadCatalog();
const settings = blankProject("t").settings;
const dump = (g: { steps: { title: string; rows: { label: string; value: string }[] }[] }) => JSON.stringify(g.steps);

describe("worked example: file", () => {
  const g = fileGuide(cat, settings, "gpt-5.4", DEFAULT_FILE);
  it("has the five steps in order", () => {
    expect(g.steps.map((s) => s.id)).toEqual(["input", "text", "images", "total", "cost"]);
  });
  it("counts text and pictures separately and adds them (PDF, 10 pages, 2 phone photos each)", () => {
    expect(g.facts.textTokens).toBeCloseTo(9310, 6);
    expect(g.facts.imageTokensEach).toBeCloseTo(921.6, 6);
    expect(g.facts.imageTokens).toBeCloseTo(18432, 6);
    expect(g.facts.total).toBeCloseTo(27742, 6);
    expect(dump(g)).toContain("27,742");
  });
  it("cost is input tokens x price plus output tokens x price", () => {
    const m = cat.chatModels.find((x) => x.id === "gpt-5.4")!;
    const p = m.prices![settings.azureDeployment]!;
    expect(g.totalCad).toBeCloseTo((27742 * p.input + 500 * p.output) / 1e6, 8);
  });
  it("says so when a model has no image formula and invents no picture cost", () => {
    const u = fileGuide(cat, settings, "llama-4-maverick", DEFAULT_FILE);
    expect(u.facts.imageTokens).toBe(0);
    expect(dump(u)).toMatch(/unverified/);
  });
});

describe("worked example: agent", () => {
  const g = agentGuide(cat, settings, { modelId: "gpt-5.4", cacheHit: 0.8, values: DEFAULT_SHEET });
  it("has the five steps in order", () => {
    expect(g.steps.map((s) => s.id)).toEqual(["input", "tokens", "loops", "resend", "cost"]);
  });
  it("shows the derived tool-result size and loop count", () => {
    expect(g.facts.toolResultTokens).toBe(412);
    expect(g.facts.steps).toBe(5);
    expect(dump(g)).toContain("560");
    expect(dump(g)).toContain("708");
    expect(dump(g)).toContain("378");
  });
  it("model cost reconciles: new input + cache write + cached + output, times the retry allowance", () => {
    const p = new PriceBook(cat, settings).tokenPrices("gpt-5.4", cat.meta.asOf);
    const r = g.run;
    const parts = (r.inputTokens * p.input + r.cacheWriteTokens * (p.cacheWrite ?? p.input) + r.cachedTokens * p.cachedInput + r.outputTokens * p.output) / 1e6;
    expect(parts * 1.05).toBeCloseTo(r.cost, 8);
    expect(r.inputTokens + r.cachedTokens + r.cacheWriteTokens).toBe(r.trace.reduce((x, t) => x + t.promptTokens, 0));
  });
  it("re-sends a longer prompt on every loop", () => {
    const p = g.run.trace.map((t) => t.promptTokens);
    expect(p.length).toBe(5);
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThan(p[i - 1]!);
  });
  it("total is the model cost plus one code-interpreter session", () => {
    expect(g.totalCad).toBeCloseTo(Number(g.facts.llmCost) + 0.0467, 8);
    expect(g.run.stopReason).toBe("finished");
  });
  it("reading whole tabs blows through the budget or the window, and the guide says why", () => {
    const w = agentGuide(cat, settings, { modelId: "gpt-5.4", cacheHit: 0.8, values: { ...DEFAULT_SHEET, readMode: "whole" } });
    expect(w.run.stopReason).not.toBe("finished");
    expect(w.totalCad).toBeGreaterThan(g.totalCad);
  });
});

describe("guidance copy", () => {
  it("has glossary entries for the new terms", () => {
    const ids = GLOSSARY.map((t) => t.id);
    for (const id of ["image-tokens", "tool-result", "agent-loop", "history-growth", "code-interpreter", "token-budget"]) expect(ids).toContain(id);
  });
  it("has help for every new field", () => {
    for (const id of ["tokFileType", "tokImagesPerPage", "tokImageSize", "tokImageDetail", "tokAgentSource", "tokenBudget", "codeTokensPerStep", "execOutputTokensPerStep"]) expect(HELP, id).toHaveProperty(id);
  });
  it("introduces the Tokens page", () => {
    expect(INTROS["/tokens"]).toMatch(/token/i);
  });
});
