/**
 * Content for the "How this is calculated" stepper on /tokens. Pure functions over the engine, so the numbers on screen are the
 * same numbers the Run page uses and the tests can reproduce them. Each step has a title, a plain sentence and the sums behind it.
 */
import type { Catalog } from "@studio/catalog";
import {
  FILE_TYPES, IMAGE_SIZES, PriceBook, buildWizardProject, deriveSpreadsheet, fileTokens, recipeById, simulateHarness, withDefaults,
  type FileInput, type RunResult, type StopReason, type Values,
} from "@studio/engine";

export interface GuideRow { label: string; value: string; note?: string }
export interface GuideStep { id: string; title: string; plain: string; rows: GuideRow[]; formula?: string }
export interface Guide { id: "file" | "agent"; title: string; steps: GuideStep[]; totalCad: number; facts: Record<string, number | string> }

const n0 = (x: number) => Math.round(x).toLocaleString("en-CA");
const c = (x: number, d = 3) => `C$${x.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const STOP_TEXT: Record<StopReason, string> = {
  finished: "The task finished on its own, inside every limit.",
  maxTurns: "The step cap stopped it before the task was done.",
  tokenBudget: "The token budget stopped it.",
  contextWindow: "The conversation outgrew the model's context window.",
};

export const DEFAULT_FILE: FileInput = { fileType: "pdf", pages: 10, imagesPerPage: 2, sizeId: "photo", detail: "high" };
export const DEFAULT_SHEET: Values = { tabs: 10, rows: 2000, cols: 12, tabsUsed: 3, readMode: "sample", sampleRows: 5, failPct: 30, maxSteps: 12, budget: 150_000, tasks: 500 };

/** Case 1: a file with N pages and M pictures sent to one model in one call. */
export function fileGuide(cat: Catalog, settings: ConstructorParameters<typeof PriceBook>[1], modelId: string, file: FileInput, outputTokens = 500): Guide {
  const book = new PriceBook(cat, settings);
  const model = book.chatModel(modelId);
  const date = cat.meta.asOf;
  const mult = book.tokenizerMultiplier(modelId);
  const t = fileTokens(model, mult, file);
  const ft = FILE_TYPES.find((x) => x.id === file.fileType)!;
  const size = IMAGE_SIZES.find((x) => x.id === file.sizeId) ?? IMAGE_SIZES[1];
  const price = book.tokenPrices(modelId, date, t.total);
  const inCost = (t.total * price.input) / 1e6, outCost = (outputTokens * mult * price.output) / 1e6;
  const total = inCost + outCost;
  return {
    id: "file",
    title: `${file.pages} ${ft.unit}${file.pages === 1 ? "" : "s"} of ${ft.label.split(" (")[0]}, ${file.fileType === "image" ? "images only" : `${file.imagesPerPage} picture${file.imagesPerPage === 1 ? "" : "s"} each`}`,
    totalCad: total,
    facts: { textTokens: t.textTokens, imageTokens: t.imageTokens, imageTokensEach: t.imageTokensEach, total: t.total, inCost, outCost },
    steps: [
      {
        id: "input", title: "1. What goes in",
        plain: "A file is sent to the model as two things: the words on its pages, and the pictures on them. Each is counted its own way.",
        rows: [
          { label: "File type", value: ft.label.split(" (")[0]!, note: ft.note },
          { label: file.fileType === "image" ? "Images" : `${ft.unit[0]!.toUpperCase()}${ft.unit.slice(1)}s`, value: n0(file.pages) },
          ...(file.fileType === "image" ? [] : [{ label: "Pictures on each page", value: n0(file.imagesPerPage) }]),
          { label: "Picture size", value: size.label, note: file.detail === "low" ? "Low detail: a fixed small cost per picture" : "High detail: charged by size" },
          { label: "Model", value: model.label },
        ],
      },
      {
        id: "text", title: "2. Text becomes tokens",
        plain: "Words are turned into tokens. English averages about 1.33 tokens a word, and each model family counts a little differently.",
        rows: [{ label: "Text tokens", value: n0(t.textTokens) }],
        formula: t.textFormula,
      },
      {
        id: "images", title: "3. Pictures become tokens",
        plain: t.imageSupported || t.imagesTotal === 0
          ? "Each picture is charged by its size using the model's own formula. Bigger pictures cost more, up to a cap."
          : "This model has no published image formula in the catalogue, so no picture cost is invented. The price below covers the text only.",
        rows: [
          { label: "Pictures in the file", value: n0(t.imagesTotal) },
          { label: "Tokens per picture", value: t.imageSupported ? n0(t.imageTokensEach) : "unverified" },
          { label: "Picture tokens", value: n0(t.imageTokens) },
        ],
        formula: t.imageFormula,
      },
      {
        id: "total", title: "4. One call, two parts added up",
        plain: "The model reads the text and the pictures together, so the call's input is the sum. Pictures are billed at the same input rate as text.",
        rows: [
          { label: "Text tokens", value: n0(t.textTokens) },
          { label: "Picture tokens", value: n0(t.imageTokens) },
          { label: "Input tokens for the call", value: n0(t.total) },
        ],
        formula: `${n0(t.textTokens)} + ${n0(t.imageTokens)} = ${n0(t.total)} tokens`,
      },
      {
        id: "cost", title: "5. Tokens become dollars",
        plain: "Each kind of token has its own price per million. Output costs several times more than input.",
        rows: [
          { label: "Input price", value: `${c(price.input, 2)} per 1M tokens` },
          { label: "Input cost", value: c(inCost), note: `${n0(t.total)} x ${c(price.input, 2)} / 1,000,000` },
          { label: `Answer (${n0(outputTokens)} tokens)`, value: c(outCost), note: `${n0(outputTokens * mult)} tokens x ${c(price.output, 2)} / 1,000,000` },
          { label: "One file", value: c(total) },
        ],
        formula: `${c(inCost)} + ${c(outCost)} = ${c(total)} for one file`,
      },
    ],
  };
}

export interface AgentGuideInput { modelId: string; values: Values; cacheHit: number }

/** Case 2: an agent that analyses a workbook by writing and running code in loops. Uses the real recipe, so it cannot drift from the wizard. */
export function agentGuide(cat: Catalog, settings: ConstructorParameters<typeof PriceBook>[1], inp: AgentGuideInput): Guide & { run: RunResult } {
  const recipe = recipeById("spreadsheet")!;
  const v = withDefaults(recipe, inp.values);
  const d = deriveSpreadsheet(v);
  const built = buildWizardProject(cat, {
    name: "Guide", deployment: settings.azureDeployment ?? "global", quality: "balanced", batchAllowed: false, build: { people: 1, months: 1 }, devKinds: [],
    selections: [{ recipeId: "spreadsheet", values: inp.values, models: { main: inp.modelId } }],
  });
  const h = built.project.harnesses[0]!;
  const book = new PriceBook(cat, settings);
  const date = cat.meta.asOf;
  const run = simulateHarness(h, book, { modelId: inp.modelId, cacheHit: inp.cacheHit, percentile: "p50", date });
  const model = book.chatModel(inp.modelId);
  const price = book.tokenPrices(inp.modelId, date);
  const fee = book.unitPrice("code-interpreter");
  const tasks = Number(v.tasks) || 0;
  // The engine's inputTokens is the new (uncached) input only; cached reads and the one-off cache write are counted apart.
  const uncached = run.inputTokens;
  const writePrice = price.cacheWrite ?? price.input;
  const cInput = (uncached * price.input) / 1e6, cCached = (run.cachedTokens * price.cachedInput) / 1e6, cOut = (run.outputTokens * price.output) / 1e6;
  const cWrite = (run.cacheWriteTokens * writePrice) / 1e6;
  const other = run.cost - cInput - cCached - cOut - cWrite;
  const total = run.cost + fee;
  const last = run.trace.at(-1)!;
  const sample = v.readMode === "whole" ? "every row" : `${d.inspectRows} sample rows`;
  return {
    id: "agent", run,
    title: `Agent analysing a ${n0(Number(v.tabs))}-tab workbook`,
    totalCad: total,
    facts: { steps: run.steps, toolResultTokens: d.toolResultTokens, inputTokens: run.inputTokens, cachedTokens: run.cachedTokens, outputTokens: run.outputTokens, llmCost: run.cost, fee, perMonth: total * tasks, lastPrompt: last.promptTokens },
    steps: [
      {
        id: "input", title: "1. What goes in",
        plain: "The agent does not read the workbook directly. It writes small pieces of Python, runs them in a code interpreter and reads what they print back.",
        rows: [
          { label: "Workbook", value: `${n0(Number(v.tabs))} tabs, ${n0(Number(v.rows))} rows, ${n0(Number(v.cols))} columns` },
          { label: "Tabs one question reads", value: n0(d.tabsUsed) },
          { label: "How tabs are read", value: v.readMode === "whole" ? "Whole tab printed" : "A sample, then code does the work", note: v.readMode === "whole" ? "Every row goes into the conversation and is re-sent on every later loop" : `${d.inspectRows} rows shown per tab` },
          { label: "Questions a month", value: n0(tasks) },
        ],
      },
      {
        id: "tokens", title: "2. What each tool call returns",
        plain: "Whatever the code prints becomes tokens the model must read. A cell costs about 3 tokens (a number or short label plus separators).",
        rows: [
          { label: "List the tabs and columns", value: `${n0(d.schemaListing)} tokens`, note: `${n0(Number(v.tabs))} tabs x (${n0(Number(v.cols))} columns x 3 + 20)` },
          { label: `Look inside ${d.tabsUsed} tab${d.tabsUsed === 1 ? "" : "s"} (${sample})`, value: `${n0(d.inspect)} tokens`, note: `${d.tabsUsed} x ((${n0(d.inspectRows)} rows + header) x ${n0(Number(v.cols))} x 3 + 20)` },
          { label: "Print the result table", value: `${n0(d.resultTable)} tokens`, note: "21 rows x 6 columns x 3" },
          { label: "Average per tool step", value: `${n0(d.toolResultTokens)} tokens`, note: `${n0(d.toolResultTotal)} / ${d.toolSteps} tool steps` },
        ],
        formula: `(${n0(d.schemaListing)} + ${n0(d.inspect)} + ${n0(d.resultTable)}) / ${d.toolSteps} = ${n0(d.toolResultTokens)} tokens per tool step`,
      },
      {
        id: "loops", title: "3. How many loops",
        plain: "One loop is one call to the model. A clean run lists, inspects, analyses and answers. Each failed run adds a fix-and-rerun loop. A step cap and a token budget stop a runaway.",
        rows: [
          { label: "Clean run", value: "4 calls", note: "list, inspect, analyse, answer" },
          { label: "Extra fix loops", value: String(d.fixSteps), note: `${n0(Number(v.failPct))}% of tasks fail first time x 2 fix rounds, rounded up` },
          { label: "Typical loops", value: String(run.steps), note: `Cap ${n0(h.maxTurns)} steps${h.tokenBudget ? `, budget ${n0(h.tokenBudget)} tokens` : ", no token budget"}` },
          { label: "Why it stopped", value: STOP_TEXT[run.stopReason] },
        ],
      },
      {
        id: "resend", title: "4. What each loop re-sends",
        plain: "The model has no memory between calls. Every loop re-sends the instructions, the question and everything said and returned so far, so the prompt grows each time.",
        rows: [
          ...run.trace.map((t) => ({ label: `Loop ${t.step}`, value: `${n0(t.promptTokens)} tokens in`, note: `${n0(t.cachedTokens)} cached, ${n0(t.promptTokens - t.cachedTokens - t.cacheWriteTokens)} new${t.cacheWriteTokens ? `, ${n0(t.cacheWriteTokens)} written to cache` : ""}; ${n0(t.outputTokens)} out` })),
          { label: "All loops", value: `${n0(run.trace.reduce((x, t) => x + t.promptTokens, 0))} in, ${n0(run.outputTokens)} out`, note: `Loop ${last.step} alone re-sends ${n0(last.promptTokens)} tokens` },
        ],
        formula: `Loop k re-sends the opening (${n0(h.systemPromptTokens + h.tools * h.tokensPerTool + h.userInputTokens)} tokens) plus the history from loops 1 to k-1`,
      },
      {
        id: "cost", title: "5. Tokens become dollars",
        plain: "Uncached input, cached input and output each have a price per million tokens. The code interpreter adds a fee for each session.",
        rows: [
          { label: "New input", value: c(cInput), note: `${n0(uncached)} x ${c(price.input, 2)} / 1M` },
          { label: "Cached input", value: c(cCached), note: `${n0(run.cachedTokens)} x ${c(price.cachedInput, 2)} / 1M (${Math.round(inp.cacheHit * 100)}% cache hit)` },
          { label: "Output (answers and code)", value: c(cOut), note: `${n0(run.outputTokens)} x ${c(price.output, 2)} / 1M` },
          ...(run.cacheWriteTokens > 0 ? [{ label: "Cache write (first call)", value: c(cWrite), note: `${n0(run.cacheWriteTokens)} x ${c(writePrice, 2)} / 1M, once per task` }] : []),
          ...(Math.abs(other) > 0.0005 ? [{ label: "Retry allowance", value: c(other), note: `${Math.round(h.retryRate * 100)}% of the model cost, for steps that fail and run again` }] : []),
          { label: `Model total (${model.label})`, value: c(run.cost) },
          { label: "Code interpreter session", value: c(fee, 4), note: "One session per task, from the price list" },
          { label: "One task", value: c(total) },
          { label: `${n0(tasks)} tasks a month`, value: c(total * tasks, 2) },
        ],
        formula: `${c(run.cost)} + ${c(fee, 4)} = ${c(total)} per task`,
      },
    ],
  };
}
