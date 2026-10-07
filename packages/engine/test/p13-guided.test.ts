import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import {
  FILE_TYPES, MissingChoice, PriceBook, ProjectSchema, SHEET, buildLedger, buildWizardProject, deriveSpreadsheet, fileTokens, projectIssues, recipeById, simulateHarness,
  withDefaults, workloadLines, type HarnessDef, type RunOptions,
} from "../src/index.js";

const cat = loadCatalog();
const book = new PriceBook(cat, { azureDeployment: "dataZone", snowflake: { routing: "global", edition: "enterprise" } });
const opts = (o: Partial<RunOptions> = {}): RunOptions => ({ modelId: "gpt-5", cacheHit: 0, percentile: "p50", date: "2026-11-01", ...o });

// Same worked example as harness.test.ts (P = 5,000 prompt, 8 steps), with no reasoning so the arithmetic below is exact.
const h: HarnessDef = {
  id: "ex", label: "example", systemPromptTokens: 1500, tools: 10, tokensPerTool: 280, userInputTokens: 700,
  steps: 8, toolCallsPerStep: 1.3, toolResultTokens: 1500, outputPerStep: 300, finalOutputTokens: 300,
  reasoning: "none", keepReasoning: false, maxTurns: 25, maxTokensPerCall: 16000, compactAtTokens: 0, compactSummaryTokens: 3000, retryRate: 0,
};

describe("file tokens: text and images counted separately", () => {
  const id = (m: string) => cat.chatModels.find((x) => x.id === m)!;
  const base = { fileType: "pdf" as const, pages: 10, imagesPerPage: 2, sizeId: "photo" as const, detail: "high" as const };

  it("PDF, 10 pages, 2 phone photos per page on gpt-5.4 (32 px patches x 1.2)", () => {
    // Text: 10 x 700 words x 1.33 = 9,310. Image: ceil(1024/32) x ceil(768/32) = 32 x 24 = 768 patches x 1.2 = 921.6; 20 images.
    const r = fileTokens(id("gpt-5.4"), 1, base);
    expect(r.textTokens).toBeCloseTo(9310, 6);
    expect(r.imagesTotal).toBe(20);
    expect(r.imageTokensEach).toBeCloseTo(921.6, 6);
    expect(r.imageTokens).toBeCloseTo(18432, 6);
    expect(r.total).toBeCloseTo(27742, 6);
  });

  it("Word, 5 pages, 3 images per page on gpt-4o (tiles: 85 + 170 x 4 = 765)", () => {
    const r = fileTokens(id("gpt-4o"), 1, { ...base, fileType: "word", pages: 5, imagesPerPage: 3 });
    expect(r.textTokens).toBeCloseTo(5 * 500 * 1.33, 6);
    expect(r.imageTokens).toBe(15 * 765);
    expect(fileTokens(id("gpt-4o"), 1, { ...base, fileType: "word", pages: 5, imagesPerPage: 3, detail: "low" }).imageTokens).toBe(15 * 85);
  });

  it("Claude uses width x height / 750 and the tokenizer multiplier applies to text only", () => {
    const r = fileTokens(id("claude-sonnet-5-5"), 1.35, base);
    expect(r.imageTokens).toBeCloseTo(20 * (1024 * 768) / 750, 6);
    expect(r.textTokens).toBeCloseTo(9310 * 1.35, 6);
  });

  it("an image-only file is one picture per page and no text", () => {
    const r = fileTokens(id("gpt-4o"), 1, { ...base, fileType: "image", pages: 4, imagesPerPage: 9 });
    expect(r.textTokens).toBe(0);
    expect(r.imagesTotal).toBe(4);
    expect(r.imageTokens).toBe(4 * 765);
  });

  it("a model with no verified image formula adds no image tokens and says so", () => {
    const r = fileTokens(id("llama-4-maverick"), 1, base);
    expect(r.imageSupported).toBe(false);
    expect(r.imageTokens).toBe(0);
    expect(r.imageFormula).toMatch(/no image formula/);
  });

  it("every file type has a text size or is image-only", () => {
    expect(FILE_TYPES.map((f) => f.id)).toEqual(["word", "pdf", "excel", "powerpoint", "image"]);
  });

  it("the documents workload bills embedded pictures on the direct route and raises an alert for an unpriced model", () => {
    const w = (modelId: string, images?: { perCall: number; widthPx: number; heightPx: number; detail: "low" | "high" }) => ({
      kind: "documents" as const, id: "d", label: "d", pagesPerMonth: 100, pageType: "dense" as const, route: { type: "direct" as const, modelId, outputTokens: 50 }, ...(images ? { images } : {}),
    });
    const ctx = { book: new PriceBook(cat, book.settings), date: "2026-11-01", harnesses: new Map(), percentile: "p50" as const };
    const sum = (x: ReturnType<typeof w>) => workloadLines(x, ctx).reduce((s, l) => s + l.cost, 0);
    const none = sum(w("gpt-4o")), withImg = sum(w("gpt-4o", { perCall: 2, widthPx: 1024, heightPx: 768, detail: "high" }));
    expect(withImg).toBeGreaterThan(none);
    // 100 pages x 2 images x 765 tokens at the model's input price.
    const price = cat.chatModels.find((m) => m.id === "gpt-4o")!.prices!.dataZone!.input;
    expect(withImg - none).toBeCloseTo((100 * 2 * 765 * price) / 1e6, 8);
  });
});

describe("harness: budget, stop reason, code and output tokens", () => {
  it("finished: the task needs no more steps than the cap allows", () => {
    const r = simulateHarness(h, book, opts());
    expect(r.stopReason).toBe("finished");
    expect(r.steps).toBe(8);
  });

  it("maxTurns: the cap is below the steps the task wants, and the worst case always runs to the cap", () => {
    const r = simulateHarness({ ...h, maxTurns: 5 }, book, opts());
    expect(r.stopReason).toBe("maxTurns");
    expect(r.steps).toBe(5);
    expect(simulateHarness(h, book, opts({ percentile: "worst" })).stopReason).toBe("maxTurns");
  });

  it("tokenBudget: stops after the call that crosses the budget", () => {
    const free = simulateHarness(h, book, opts());
    const r = simulateHarness({ ...h, tokenBudget: 30_000 }, book, opts());
    expect(r.stopReason).toBe("tokenBudget");
    expect(r.steps).toBeLessThan(free.steps);
    expect(r.budgetTokens).toBeGreaterThanOrEqual(30_000);
    // Without the last call it was still under budget, so the loop stopped at the first call that crossed it.
    const last = r.trace.at(-1)!;
    expect(r.budgetTokens - last.promptTokens - last.outputTokens).toBeLessThan(30_000);
    expect(r.cost).toBeLessThan(free.cost);
  });

  it("a budget the task never reaches changes nothing", () => {
    const free = simulateHarness(h, book, opts());
    const r = simulateHarness({ ...h, tokenBudget: 10_000_000 }, book, opts());
    expect(r.stopReason).toBe("finished");
    expect(r.cost).toBe(free.cost);
    expect(simulateHarness({ ...h, tokenBudget: 0 }, book, opts()).cost).toBe(free.cost);
  });

  it("contextWindow: history outgrows the model's window with no compaction", () => {
    const model = book.chatModel("gpt-4o");
    const r = simulateHarness({ ...h, toolResultTokens: model.contextWindow }, book, opts({ modelId: "gpt-4o" }));
    expect(r.stopReason).toBe("contextWindow");
    expect(Math.max(...r.trace.map((t) => t.promptTokens))).toBeLessThanOrEqual(model.contextWindow);
    // With compaction on, the same run does not hit the window.
    expect(simulateHarness({ ...h, toolResultTokens: model.contextWindow / 4, compactAtTokens: model.contextWindow / 2 }, book, opts({ modelId: "gpt-4o" })).stopReason).toBe("finished");
  });

  it("generated code is output and execution output is re-sent: hand-computed deltas", () => {
    const base = simulateHarness(h, book, opts());
    const r = simulateHarness({ ...h, codeTokensPerStep: 100, execOutputTokensPerStep: 50 }, book, opts());
    // 8 steps, 7 of them non-final: 100 more output tokens on each of those 7.
    expect(r.outputTokens - base.outputTokens).toBe(700);
    // History grows by 150 per non-final step, so step k re-sends 150 x (k - 1) more: 150 x (0 + 1 + ... + 7) = 4,200.
    expect(r.inputTokens - base.inputTokens).toBe(4200);
    expect(r.cost).toBeGreaterThan(base.cost);
  });

  it("leaves a harness without the new fields exactly as before", () => {
    const base = simulateHarness(h, book, opts());
    const zero = simulateHarness({ ...h, codeTokensPerStep: 0, execOutputTokensPerStep: 0, tokenBudget: 0 }, book, opts());
    expect(zero.cost).toBe(base.cost);
    expect(zero.inputTokens).toBe(base.inputTokens);
    expect(zero.outputTokens).toBe(base.outputTokens);
    expect(base.inputTokens).toBeCloseTo(103000, 0);
  });
});

describe("spreadsheet recipe", () => {
  const recipe = recipeById("spreadsheet")!;
  const defaults = withDefaults(recipe);

  it("derives tool-result tokens from tabs, rows and columns (10 tabs x 12 columns, 3 tabs read, 5-row sample)", () => {
    const d = deriveSpreadsheet(defaults);
    // Schema listing: 10 tabs x (12 columns x 3 tokens + 20) = 560.
    expect(d.schemaListing).toBe(560);
    // Inspect 3 tabs: 3 x ((5 rows + header) x 12 x 3 + 20) = 708.
    expect(d.inspect).toBe(708);
    // Result table: (20 rows + header) x 6 columns x 3 = 378.
    expect(d.resultTable).toBe(378);
    // 30% fail x 2 rounds = 0.6, rounded up to 1 fix call: 4 + 1 = 5 calls, 4 of them return tool output.
    expect(d.fixSteps).toBe(1);
    expect(d.steps).toBe(5);
    expect(d.toolSteps).toBe(4);
    expect(d.toolResultTotal).toBe(560 + 708 + 378);
    expect(d.toolResultTokens).toBe(412);
    expect(d.execOutputTokens).toBe(100);
    expect(d.codeTokens).toBe(308);
  });

  it("reading the whole tab prints every row: 3 x ((2,000 + 1) x 12 x 3 + 20) = 216,168 tokens", () => {
    expect(deriveSpreadsheet({ ...defaults, readMode: "whole" }).inspect).toBe(216_168);
  });

  it("a sample never exceeds the rows a tab has, and no failures means no fix calls", () => {
    const d = deriveSpreadsheet({ ...defaults, rows: 3, failPct: 0 });
    expect(d.inspectRows).toBe(3);
    expect(d.fixSteps).toBe(0);
    expect(d.steps).toBe(4);
    expect(d.execOutputTokens).toBe(0);
  });

  const input = (values = {}, models: Record<string, string> = { main: "gpt-5.4" }) => ({
    name: "Sheets", deployment: "global" as const, quality: "balanced" as const, batchAllowed: false, build: { people: 2, months: 3 }, devKinds: [] as never[],
    selections: [{ recipeId: "spreadsheet", values, models }],
  });

  it("throws MissingChoice until a model is picked: nothing is preselected", () => {
    expect(() => buildWizardProject(cat, input({}, {}))).toThrow(MissingChoice);
  });

  it("builds a project that validates, with the harness fields, step cap, budget and a code-interpreter fee", () => {
    const res = buildWizardProject(cat, input());
    expect(projectIssues(res.project)).toEqual([]);
    expect(ProjectSchema.safeParse(res.project).success).toBe(true);
    const sh = res.project.harnesses[0]!;
    expect(sh).toMatchObject({ steps: 5, toolResultTokens: 412, codeTokensPerStep: 308, execOutputTokensPerStep: 100, maxTurns: 12, tokenBudget: 150_000, tools: 1 });
    const w = res.project.workloads.find((x) => x.kind === "agent")!;
    expect(w.kind === "agent" && w.toolFees).toEqual([{ unitPriceId: "code-interpreter", label: "Code interpreter session", perTask: 1 }]);
    // The fee line is the catalogue price x tasks a month.
    const lines = buildLedger(res.project, cat).months.at(-1)!.lines;
    const fee = lines.find((l) => l.meter === "code-interpreter")!;
    expect(fee.quantity).toBe(500);
    expect(fee.unitPrice).toBeCloseTo(cat.unitPrices.find((u) => u.id === "code-interpreter")!.price!, 8);
    // Every derived default is an editable assumption with a source.
    const notes = res.assumptions.filter((a) => a.id.includes("harness."));
    expect(notes.length).toBeGreaterThanOrEqual(5);
    for (const a of notes) { expect(a.source.length).toBeGreaterThan(10); expect(a.target?.collection).toBe("harnesses"); }
  });

  it("a budget of 0 leaves the budget out, and reading whole tabs costs far more than sampling", () => {
    const none = buildWizardProject(cat, input({ budget: 0 }));
    expect(none.project.harnesses[0]!.tokenBudget).toBeUndefined();
    const sample = buildLedger(none.project, cat).totals.runRate;
    const whole = buildLedger(buildWizardProject(cat, input({ budget: 0, readMode: "whole" })).project, cat).totals.runRate;
    expect(whole).toBeGreaterThan(sample * 5);
  });

  it("uses the SHEET constants it documents", () => {
    expect(SHEET.cellTokens).toBe(3);
  });
});

describe("extraction recipe: pictures", () => {
  const ex = (values = {}) => ({
    name: "Docs", deployment: "global" as const, quality: "balanced" as const, batchAllowed: false, build: { people: 2, months: 3 }, devKinds: [] as never[],
    selections: [{ recipeId: "extraction", values: { route: "model", ...values }, models: { main: "gpt-4o" } }],
  });
  it("adds pictures to the direct route only when asked, and the cost rises", () => {
    const plain = buildWizardProject(cat, ex());
    expect(plain.project.workloads.some((w) => w.kind === "documents" && w.images)).toBe(false);
    const pics = buildWizardProject(cat, ex({ imagesPerPage: 2 }));
    expect(projectIssues(pics.project)).toEqual([]);
    expect(buildLedger(pics.project, cat).totals.runRate).toBeGreaterThan(buildLedger(plain.project, cat).totals.runRate);
  });
  it("ignores pictures when a reading service does the extraction", () => {
    const r = buildWizardProject(cat, { ...ex({ route: "service", imagesPerPage: 2 }), selections: [{ recipeId: "extraction", values: { route: "service", imagesPerPage: 2 } }] });
    expect(r.project.workloads.some((w) => w.kind === "documents" && w.images)).toBe(false);
  });
});
