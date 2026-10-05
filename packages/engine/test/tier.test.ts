import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import {
  PriceBook,
  PROJECT_TEMPLATES,
  ProjectSchema,
  buildLedger,
  meetingIntelligence,
  ptuAnalysis,
  workloadLines,
  type Project,
  type Workload,
} from "../src/index.js";

const cat = loadCatalog();
const DATE = "2026-11-01";
const settings = { azureDeployment: "dataZone" as const, snowflake: { routing: "global" as const, edition: "enterprise" as const } };
const book = new PriceBook(cat, settings);
const model = (id: string) => cat.chatModels.find((m) => m.id === id)!;

describe("withPricing / tier", () => {
  it("defaults to Standard and applies the Batch factor when asked", () => {
    const standard = book.tokenPrices("gpt-5.4", DATE);
    const batch = book.withPricing({ tier: "batch" }).tokenPrices("gpt-5.4", DATE);
    const m = model("gpt-5.4");
    expect(batch.input).toBeCloseTo(standard.input * (1 - m.batchDiscount), 9);
    expect(batch.output).toBeCloseTo(standard.output * (1 - m.batchDiscount), 9);
  });

  it("withDeployment keeps acting as a thin wrapper over withPricing", () => {
    const a = book.withDeployment("regional");
    const b = book.withPricing({ deployment: "regional" });
    expect(a.settings.azureDeployment).toBe(b.settings.azureDeployment);
  });

  it("falls back to Standard with a visible note when Batch isn't offered under Canada Regional", () => {
    const regional = new PriceBook(cat, { ...settings, azureDeployment: "regional" });
    const m = model("gpt-4o"); // has a Regional Standard price, so this isolates the tier (not deployment) fallback
    const standard = regional.tokenPrices("gpt-4o", DATE);
    const batchBook = regional.withPricing({ tier: "batch" });
    const batch = batchBook.tokenPrices("gpt-4o", DATE);
    expect(batch).toEqual(standard);
    expect([...batchBook.notes.values()]).toContainEqual({
      kind: "tier-unavailable",
      message: expect.stringContaining(`${m.label} Batch is not offered as Canada Regional Standard`),
    });
  });

  it("batchFactor mirrors the legacy batchDiscount math for Dev Lab lines", () => {
    const m = model("gpt-5.4-mini");
    expect(book.batchFactor("gpt-5.4-mini")).toBeCloseTo(1 - m.batchDiscount, 9);
    expect(book.batchFactor("gpt-5.4-mini")).toBe(1 - book.chatModel("gpt-5.4-mini").batchDiscount);
  });
});

describe("workload batch share", () => {
  const harnesses = new Map();
  const w: Workload = {
    kind: "llm", id: "classify", label: "Classify", callsPerMonth: 1000, modelId: "gpt-5.4-mini",
    inputTokens: 900, cachedInputTokens: 0, outputTokens: 60, batchShare: 0.8,
  } as Workload;

  it("splits tokens between a standard-tier and a batch-tier line whose blended cost equals the old scalar discount", () => {
    const lines = workloadLines(w, { book, date: DATE, harnesses, percentile: "p50" });
    expect(lines).toHaveLength(2);
    const [std, batch] = lines;
    expect(std!.tier).toBe("standard");
    expect(batch!.tier).toBe("batch");
    expect(std!.quantity).toBeCloseTo(1000 * 0.2, 9);
    expect(batch!.quantity).toBeCloseTo(1000 * 0.8, 9);

    const totalCost = std!.cost + batch!.cost;
    const tk = book.tokenizerMultiplier("gpt-5.4-mini");
    const per = book.chatCost("gpt-5.4-mini", { input: 900 * tk, cachedInput: 0, output: 60 * tk }, DATE, 900 * tk);
    const m = model("gpt-5.4-mini");
    const legacyDisc = 1 - 0.8 * m.batchDiscount;
    expect(totalCost).toBeCloseTo(1000 * per * legacyDisc, 6);
  });

  it("emits a single standard-tier line when batchShare is 0", () => {
    const lines = workloadLines({ ...w, batchShare: 0 } as Workload, { book, date: DATE, harnesses, percentile: "p50" });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.tier).toBe("standard");
  });
});

describe("PTU grouping keeps tiers apart", () => {
  it("excludes Batch-tier tokens from PTU sizing", () => {
    const p = structuredClone(meetingIntelligence) as Project;
    p.workloads.push({
      kind: "llm", id: "classify", label: "Classify", callsPerMonth: 120_000, modelId: "gpt-5.4-mini",
      inputTokens: 900, cachedInputTokens: 0, outputTokens: 60, batchShare: 0.8,
    } as Project["workloads"][number]);
    const L = buildLedger(p, cat);
    const a = ptuAnalysis(p, L, cat, { peakToAverage: 3, deployment: "dataZone" });
    const row = a.rows.find((r) => r.modelId === "gpt-5.4-mini")!;
    const month = L.months.find((m) => m.phase === "production" && m.adoption >= 1)!;
    const standardLine = month.lines.find((l) => l.componentId === "classify" && l.tier === "standard")!;
    const batchLine = month.lines.find((l) => l.componentId === "classify" && l.tier === "batch")!;
    expect(standardLine).toBeDefined();
    expect(batchLine).toBeDefined();
    // Monthly input tokens for the model equal the standard-tier share only (plus whatever else uses gpt-5.4-mini).
    const standardTokens = standardLine.tokens!.input * standardLine.quantity;
    expect(row.monthlyTokens.input).toBeGreaterThanOrEqual(standardTokens);
    expect(row.monthlyTokens.input).toBeLessThan(standardTokens + batchLine.tokens!.input * batchLine.quantity);
  });
});

describe("golden totals (P3 updates these on purpose; see the PR description for the before/after table)", () => {
  const GOLDEN: Record<string, { build: number; buildLabour: number; devLab: number; runRate: number; maintRate: number; benefitRate: number }> = {
    meeting: { build: 408406.7811147148, buildLabour: 340800, devLab: 66454.51411471477, runRate: 8167.303855634784, maintRate: 6080, benefitRate: 36550 },
    rag: { build: 185230.87201448006, buildLabour: 176000.00000000003, devLab: 9230.872014479999, runRate: 1501.70148475, maintRate: 3088.484433574667, benefitRate: 25000 },
    email: { build: 195272.98575291323, buildLabour: 176000.00000000003, devLab: 19272.985752913202, runRate: 5290.245381000001, maintRate: 3255.8529958818863, benefitRate: 56250 },
    voice: { build: 238197.24190726003, buildLabour: 220000.00000000003, devLab: 18197.24190726, runRate: 7796.544353720001, maintRate: 3971.583073454333, benefitRate: 75000 },
    blank: { build: 176000.00000000003, buildLabour: 176000.00000000003, devLab: 0, runRate: 0, maintRate: 2934.636566666667, benefitRate: 0 },
  };

  it("meeting-intelligence sample totals match the pinned golden numbers", () => {
    const L = buildLedger(meetingIntelligence, cat);
    const g = GOLDEN.meeting!;
    expect(L.totals.build).toBeCloseTo(g.build, 6);
    expect(L.totals.buildLabour).toBeCloseTo(g.buildLabour, 6);
    expect(L.totals.devLab).toBeCloseTo(g.devLab, 6);
    expect(L.totals.runRate).toBeCloseTo(g.runRate, 6);
    expect(L.totals.maintRate).toBeCloseTo(g.maintRate, 6);
  });

  for (const t of PROJECT_TEMPLATES) {
    it(`${t.label} template totals match the pinned golden numbers`, () => {
      const g = GOLDEN[t.id];
      if (!g) return;
      const p = ProjectSchema.parse(t.make(`Test ${t.label}`));
      const L = buildLedger(p, cat);
      expect(L.totals.build).toBeCloseTo(g.build, 6);
      expect(L.totals.buildLabour).toBeCloseTo(g.buildLabour, 6);
      expect(L.totals.devLab).toBeCloseTo(g.devLab, 6);
      expect(L.totals.runRate).toBeCloseTo(g.runRate, 6);
      expect(L.totals.maintRate).toBeCloseTo(g.maintRate, 6);
      expect(L.totals.benefitRate).toBeCloseTo(g.benefitRate, 6);
    });
  }
});
