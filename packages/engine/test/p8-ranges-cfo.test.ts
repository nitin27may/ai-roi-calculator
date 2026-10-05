import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import {
  CURRENT_PROJECT_VERSION, PROJECT_TEMPLATES, PriceBook, ProjectSchema, applyEdit, buildLedger, computeAllocation, computeRoi, irr, meetingIntelligence,
  migrateProject, newWorkload, projectRange, roiOptions, sensitivity, summarize, valueItemMonthly, workloadLines, workloadRange,
  type Project, type ValueItem, type Workload,
} from "../src/index.js";

const cat = loadCatalog();
const sample = (): Project => structuredClone(meetingIntelligence);
const book = (p: Project) => new PriceBook(cat, p.settings);
const lines = (p: Project, w: Workload, percentile: "p10" | "p50" | "p90" = "p50") =>
  workloadLines(w, { book: book(p), date: p.startDate, harnesses: new Map(p.harnesses.map((h) => [h.id, h])), percentile });
const cost = (p: Project, w: Workload, percentile: "p10" | "p50" | "p90" = "p50") => lines(p, w, percentile).reduce((s, l) => s + l.cost, 0);
const roiOf = (p: Project) => computeRoi(buildLedger(p, cat), p.roi.basis, p.roi.discountRatePct, roiOptions(p));

const llmWorkload = (): Workload => ({ kind: "llm", id: "calls", label: "Calls", callsPerMonth: 10_000, modelId: "gpt-5.4-mini", inputTokens: 900, cachedInputTokens: 100, outputTokens: 120, batchShare: 0, reasoning: "none" });
const chatWorkload = (p: Project) => p.workloads.find((w) => w.kind === "chat")!;

describe("IRR", () => {
  it("matches the known cash flows: -100, +60, +60 is 13.07% a period", () => {
    expect(irr([-100, 60, 60])! * 100).toBeCloseTo(13.07, 2);
  });
  it("is undefined when the flows never change sign", () => {
    expect(irr([10, 20, 30])).toBeNull();
    expect(irr([-10, -20])).toBeNull();
  });
  it("can be negative when the money is not recovered", () => {
    expect(irr([-100, 40, 40])!).toBeLessThan(0);
  });
  it("is the rate at which the project's NPV is zero (annual, monthly compounding of the equivalent rate)", () => {
    const p = sample();
    const base = roiOf(p);
    expect(base.irrPct).not.toBeNull();
    const at = structuredClone(p);
    at.roi.discountRatePct = base.irrPct!;
    expect(Math.abs(roiOf(at).npv)).toBeLessThan(1);
  });
});

describe("CFO measures", () => {
  it("discounted payback is never earlier than payback, and equals it at a 0% rate", () => {
    const p = sample();
    p.roi.discountRatePct = 0;
    const flat = roiOf(p);
    expect(flat.discountedPaybackMonth).toBe(flat.paybackMonth);
    p.roi.discountRatePct = 12;
    const r = roiOf(p);
    if (r.paybackMonth !== null && r.discountedPaybackMonth !== null) expect(r.discountedPaybackMonth).toBeGreaterThanOrEqual(r.paybackMonth);
  });
  it("compares IRR with the hurdle rate", () => {
    const p = sample();
    const irrPct = roiOf(p).irrPct!;
    p.roi.hurdleRatePct = Math.floor(irrPct) - 5;
    expect(roiOf(p).clearsHurdle).toBe(true);
    p.roi.hurdleRatePct = Math.ceil(irrPct) + 5;
    expect(roiOf(p).clearsHurdle).toBe(false);
    delete p.roi.hurdleRatePct;
    expect(roiOf(p).clearsHurdle).toBeNull();
  });
  it("adds a terminal value of N years of the last 12 months' net flow to NPV and IRR", () => {
    const p = sample();
    const base = roiOf(p);
    p.roi.terminalValueYears = 2;
    const withTv = roiOf(p);
    const n = base.monthlyCost.length;
    const last12 = base.monthlyBenefit.slice(n - 12).reduce((a, b) => a + b, 0) - base.monthlyCost.slice(n - 12).reduce((a, b) => a + b, 0);
    expect(withTv.terminalValue).toBeCloseTo(2 * last12, 4);
    const r = (1 + p.roi.discountRatePct / 100) ** (1 / 12) - 1;
    expect(withTv.npv - base.npv).toBeCloseTo(withTv.terminalValue / (1 + r) ** n, 4);
    expect(withTv.irrPct!).toBeGreaterThan(base.irrPct!);
    expect(withTv.totalBenefit).toBeCloseTo(base.totalBenefit, 6);
  });
  it("splits capex and opex and amortises capex from go-live without moving cash figures", () => {
    const p = sample();
    const base = roiOf(p);
    p.roi.capexPct = 60;
    p.roi.amortiseMonths = 12;
    const r = roiOf(p);
    const L = buildLedger(p, cat);
    expect(r.accounting).not.toBeNull();
    const a = r.accounting!;
    expect(a.capex).toBeCloseTo(L.totals.build * 0.6, 4);
    expect(a.capex + a.opex).toBeCloseTo(r.totalCost, 4);
    expect(a.amortisation.slice(0, p.timeline.buildMonths).every((x) => x === 0)).toBe(true);
    expect(a.amortisation[p.timeline.buildMonths]).toBeCloseTo(a.capex / 12, 6);
    expect(a.amortisedInHorizon + a.unamortised).toBeCloseTo(a.capex, 6);
    expect(a.bookCost).toBeCloseTo(a.opex + a.amortisedInHorizon, 6);
    expect(r.npv).toBeCloseTo(base.npv, 6);
    expect(r.totalCost).toBeCloseTo(base.totalCost, 6);
  });
  it("has no accounting view until capex is set", () => {
    expect(roiOf(sample()).accounting).toBeNull();
  });
});

describe("defaults leave existing results unchanged", () => {
  it("the sample and every template give the same ledger and ROI with every new setting at its explicit default", () => {
    const projects = [sample(), ...PROJECT_TEMPLATES.map((t) => ProjectSchema.parse(t.make("Check")))];
    for (const p of projects) {
      const before = roiOf(p);
      const q = structuredClone(p);
      q.settings.devLabPercentile = "p50";
      q.roi.terminalValueYears = 0;
      q.roi.capexPct = 0;
      for (const w of q.workloads) if (w.kind === "chat" || w.kind === "llm") { w.resendShare = 0; w.promptShields = false; }
      for (const c of q.benefits.capabilities) c.confidencePct = 100;
      for (const a of q.benefits.avoidedCosts) a.confidencePct = 100;
      const after = roiOf(q);
      expect(after.totalCost).toBeCloseTo(before.totalCost, 6);
      expect(after.totalBenefit).toBeCloseTo(before.totalBenefit, 6);
      expect(after.npv).toBeCloseTo(before.npv, 6);
      expect(after.paybackMonth).toBe(before.paybackMonth);
    }
  });
  it("the project is at the current version and v3 projects migrate with an empty value list", () => {
    expect(CURRENT_PROJECT_VERSION).toBe(4);
    const v3 = structuredClone(meetingIntelligence) as unknown as Record<string, unknown>;
    v3.version = 3;
    const benefits = { ...(v3.benefits as Record<string, unknown>) };
    delete benefits.value;
    v3.benefits = benefits;
    const m = ProjectSchema.parse(migrateProject(v3));
    expect(m.version).toBe(4);
    expect(m.benefits.value).toEqual([]);
    expect(roiOf(m).totalCost).toBeCloseTo(roiOf(sample()).totalCost, 6);
  });
});

describe("retries and guardrails", () => {
  it("re-sending a share of LLM calls raises token cost by that share", () => {
    const p = sample();
    const w = llmWorkload() as Extract<Workload, { kind: "llm" }>;
    const base = cost(p, w);
    expect(cost(p, { ...w, resendShare: 0.1 })).toBeCloseTo(base * 1.1, 6);
  });
  it("re-sending a share of chat turns raises cost by that share", () => {
    const p = sample();
    const w = chatWorkload(p) as Extract<Workload, { kind: "chat" }>;
    expect(cost(p, { ...w, resendShare: 0.05 })).toBeCloseTo(cost(p, w) * 1.05, 6);
  });
  it("adds a Prompt Shields line priced from the catalogue when switched on", () => {
    const p = sample();
    const w = llmWorkload() as Extract<Workload, { kind: "llm" }>;
    const on = lines(p, { ...w, promptShields: true });
    const shield = on.find((l) => l.meter === "safety-prompt-shields")!;
    const price = cat.unitPrices.find((u) => u.id === "safety-prompt-shields")!.price!;
    expect(shield).toBeDefined();
    // 900 input tokens ≈ 3,600 characters = 4 records of 1K characters per call.
    expect(shield.cost).toBeCloseTo(((w.callsPerMonth * 4) / 1000) * price, 6);
    expect(lines(p, w).some((l) => l.meter === "safety-prompt-shields")).toBe(false);
  });
  it("adds nothing when the catalogue has no Prompt Shields price", () => {
    const p = sample();
    const w = { ...(llmWorkload() as Extract<Workload, { kind: "llm" }>), promptShields: true };
    const trimmed = { ...cat, unitPrices: cat.unitPrices.filter((u) => u.id !== "safety-prompt-shields") };
    const out = workloadLines(w, { book: new PriceBook(trimmed, p.settings), date: p.startDate, harnesses: new Map(), percentile: "p50" });
    expect(out.some((l) => l.meter === "safety-prompt-shields")).toBe(false);
  });
});

describe("percentile ranges", () => {
  it("scales chat and LLM token counts by a documented spread", () => {
    const p = sample();
    const w = llmWorkload();
    expect(cost(p, w, "p10")).toBeLessThan(cost(p, w, "p50"));
    expect(cost(p, w, "p90")).toBeGreaterThan(cost(p, w, "p50"));
    const r = workloadRange(p, cat, w);
    expect(r.spread).toBe(true);
    expect(r.low).toBeCloseTo(cost(p, w, "p10"), 6);
    expect(r.high).toBeCloseTo(cost(p, w, "p90"), 6);
  });
  it("orders an agent's P10, P50 and P90 cost", () => {
    const p = sample();
    const agent = p.workloads.find((w) => w.kind === "agent")!;
    const r = workloadRange(p, cat, agent);
    expect(r.low).toBeLessThan(r.expected);
    expect(r.expected).toBeLessThan(r.high);
  });
  it("reports no spread for a workload priced per page or hour", () => {
    const p = sample();
    const stt = p.workloads.find((w) => w.kind === "transcription")!;
    const r = workloadRange(p, cat, stt);
    expect(r.spread).toBe(false);
    expect(r.low).toBeCloseTo(r.high, 9);
  });
  it("prices Dev Lab runs at the chosen percentile", () => {
    const p = sample();
    const typical = buildLedger(p, cat).totals.devLab;
    p.settings.devLabPercentile = "p90";
    expect(buildLedger(p, cat).totals.devLab).toBeGreaterThan(typical);
  });
});

describe("project range", () => {
  const p = sample();
  const r = projectRange(p, cat);
  it("keeps the expected case equal to the figures the project shows", () => {
    const shown = roiOf(p);
    expect(r.totalCost.expected).toBeCloseTo(shown.totalCost, 6);
    expect(r.npv.expected).toBeCloseTo(shown.npv, 6);
  });
  it("orders low, expected, high for every figure", () => {
    for (const x of [r.totalCost, r.build, r.annualRun, r.totalBenefit, r.npv]) {
      expect(x.low).toBeLessThanOrEqual(x.expected + 1e-6);
      expect(x.expected).toBeLessThanOrEqual(x.high + 1e-6);
    }
  });
  it("puts the pessimistic case at more cost, less benefit and a lower NPV than the optimistic one", () => {
    expect(r.cases.pessimistic.totalCost).toBeGreaterThan(r.cases.optimistic.totalCost);
    expect(r.cases.pessimistic.totalBenefit).toBeLessThan(r.cases.optimistic.totalBenefit);
    expect(r.cases.pessimistic.npv).toBeLessThan(r.cases.optimistic.npv);
  });
  it("orders payback best to worst", () => {
    if (r.payback.best !== null && r.payback.expected !== null) expect(r.payback.best).toBeLessThanOrEqual(r.payback.expected);
    if (r.payback.worst !== null && r.payback.expected !== null) expect(r.payback.worst).toBeGreaterThanOrEqual(r.payback.expected);
  });
  it("does not change the project it is given", () => {
    const before = JSON.stringify(p);
    projectRange(p, cat);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("is part of the summary", () => {
    const s = summarize(p, buildLedger(p, cat), roiOf(p), cat);
    expect(s.range.npv.low).toBeCloseTo(r.npv.low, 6);
    expect(s.irrPct).not.toBeNull();
  });
});

describe("new sensitivity drivers", () => {
  const s = sensitivity(sample(), cat);
  const ids = s.rows.map((x) => x.id);
  it("includes token price, cache hit rate, model choice and exchange rate", () => {
    for (const id of ["tokenPrice", "cacheHit", "fx"]) expect(ids).toContain(id);
  });
  it("moves NPV the right way for each new driver", () => {
    for (const id of ["tokenPrice", "cacheHit", "modelSwap", "fx"]) {
      const row = s.rows.find((x) => x.id === id);
      if (!row) continue;
      expect(row.high).toBeGreaterThanOrEqual(row.low - 1e-6);
    }
  });
  it("swaps the costliest model for a cheaper one at the favourable end", () => {
    const row = s.rows.find((x) => x.id === "modelSwap");
    if (!row) return;
    expect(row.highLabel).toMatch(/^to /);
    expect(row.high).toBeGreaterThan(s.base);
  });
  it("does not change the project or the catalogue it is given", () => {
    const p = sample();
    const before = JSON.stringify(p), catBefore = JSON.stringify(cat.chatModels[0]);
    sensitivity(p, cat);
    expect(JSON.stringify(p)).toBe(before);
    expect(JSON.stringify(cat.chatModels[0])).toBe(catBefore);
  });
});

describe("Snowflake volumes scale", () => {
  const withSnowflake = () => {
    const p = sample();
    const w = newWorkload(p, "snowflakeComplete") as Extract<Workload, { kind: "snowflakeComplete" }>;
    p.workloads.push(w);
    return { p, w };
  };
  it("a usage scenario scales rows per month", () => {
    const { p, w } = withSnowflake();
    const q = applyEdit(p, { kind: "scaleUsage", factor: 2 }, cat);
    const w2 = q.workloads.find((x) => x.id === w.id) as typeof w;
    expect(w2.rowsPerMonth).toBe(w.rowsPerMonth * 2);
  });
  it("a usage scenario scales Cortex Search rows", () => {
    const p = sample();
    const w: Workload = { kind: "cortexSearch", id: "cs", label: "Search", rows: 1_000_000, vectorColumns: 1, embeddingModelId: "sf:snowflake-arctic-embed-m-v1.5", avgRowBytes: 1000, tokensPerRow: 500, changedShareMonthly: 0.1, warehouse: { size: "m", hoursPerMonth: 10 } };
    p.workloads.push(w);
    const q = applyEdit(p, { kind: "scaleUsage", factor: 3 }, cat);
    expect((q.workloads.find((x) => x.id === "cs") as typeof w).rows).toBe(3_000_000);
  });
  it("a capability linked to a Snowflake workload scales its rows in the volume driver", () => {
    const { p, w } = withSnowflake();
    p.benefits.capabilities.push({ id: "sf", label: "SF", hoursSavedPerMonth: 0, roleId: p.rateCard[0]!.id, driver: "perVolume", volumeFrom: w.id, handledPct: 50, baselineMinutes: 5, savings: { conservative: 1, typical: 2, optimistic: 3 }, unit: "minutes", licenceOverlap: 0, workloadIds: [], workstreamIds: [] });
    const base = sensitivity(sample(), cat);
    const row = sensitivity(p, cat).rows.find((x) => x.id === "users")!;
    expect(row).toBeDefined();
    expect(base.rows.length).toBeGreaterThan(0);
  });
});

describe("new benefit types", () => {
  const item = (v: Partial<ValueItem> & Pick<ValueItem, "kind">): ValueItem => ({ id: "v", label: "Value", ...v });
  it("revenue is monthly revenue times the margin kept", () => {
    expect(valueItemMonthly(sample(), item({ kind: "revenue", monthlyRevenue: 50_000, marginPct: 40 }))).toBe(20_000);
    expect(valueItemMonthly(sample(), item({ kind: "revenue", monthlyRevenue: 50_000 }))).toBe(50_000);
  });
  it("quality is volume times the drop in error rate times the cost of an error", () => {
    expect(valueItemMonthly(sample(), item({ kind: "quality", volumePerMonth: 10_000, errorRateBeforePct: 5, errorRateAfterPct: 2, costPerError: 40 }))).toBeCloseTo(12_000, 6);
  });
  it("quality can take its volume from a workload's rows, tokens or chunks", () => {
    const p = sample();
    const w = newWorkload(p, "snowflakeComplete") as Extract<Workload, { kind: "snowflakeComplete" }>;
    p.workloads.push(w);
    expect(valueItemMonthly(p, item({ kind: "quality", volumeFrom: w.id, errorRateBeforePct: 10, errorRateAfterPct: 0, costPerError: 1 }))).toBeCloseTo(w.rowsPerMonth * 0.1, 6);
    const emb = newWorkload(p, "embeddings") as Extract<Workload, { kind: "embeddings" }>;
    p.workloads.push(emb);
    expect(valueItemMonthly(p, item({ kind: "quality", volumeFrom: emb.id, errorRateBeforePct: 100, errorRateAfterPct: 0, costPerError: 1 }))).toBeCloseTo(emb.tokensPerMonth, 6);
  });
  it("risk is expected loss avoided per month", () => {
    expect(valueItemMonthly(sample(), item({ kind: "risk", eventsPerYear: 2, impactCad: 600_000, reductionPct: 50 }))).toBeCloseTo(50_000, 6);
  });
  it("flows into the ledger from its start month, ramped, and into total benefit", () => {
    const p = sample();
    const base = roiOf(p);
    p.benefits.value.push(item({ kind: "revenue", monthlyRevenue: 10_000, ramp: false, startMonth: p.timeline.buildMonths + 1 }));
    const L = buildLedger(p, cat);
    const B = p.timeline.buildMonths;
    expect(L.months[B - 1]!.benefitBy.value.v ?? 0).toBe(0);
    expect(L.months[B]!.benefitBy.value.v).toBeCloseTo(10_000, 6);
    expect(roiOf(p).totalBenefit - base.totalBenefit).toBeCloseTo(10_000 * (p.timeline.horizonMonths - B), 4);
    expect(L.totals.benefitRate).toBeGreaterThan(buildLedger(sample(), cat).totals.benefitRate);
  });
  it("applies confidence as a share of the benefit", () => {
    const p = sample();
    p.benefits.value.push(item({ kind: "revenue", monthlyRevenue: 10_000, ramp: false }));
    const full = roiOf(p).totalBenefit;
    p.benefits.value[0]!.confidencePct = 50;
    const half = roiOf(p).totalBenefit;
    const none = roiOf(sample()).totalBenefit;
    expect(half - none).toBeCloseTo((full - none) / 2, 4);
  });
  it("risk-weights a capability's benefit by its confidence", () => {
    const p = sample();
    const base = roiOf(p).totalBenefit;
    const capBenefit = buildLedger(p, cat).months.reduce((s, m) => s + (m.benefitBy.capabilities.notes ?? 0), 0);
    p.benefits.capabilities.find((c) => c.id === "notes")!.confidencePct = 50;
    expect(base - roiOf(p).totalBenefit).toBeCloseTo(capBenefit / 2, 4);
  });
  it("attributes a value item and an avoided cost to a capability in ROI by capability", () => {
    const p = sample();
    const before = computeAllocation(p, buildLedger(p, cat), p.roi.basis);
    p.benefits.value.push(item({ kind: "risk", eventsPerYear: 1, impactCad: 120_000, reductionPct: 100, capabilityId: "ask" }));
    p.benefits.avoidedCosts[0]!.capabilityId = "notes";
    const L = buildLedger(p, cat);
    const a = computeAllocation(p, L, p.roi.basis);
    const gain = (id: string) => a.capabilities.find((c) => c.id === id)!.benefit - before.capabilities.find((c) => c.id === id)!.benefit;
    expect(gain("ask")).toBeGreaterThan(0);
    expect(gain("notes")).toBeGreaterThan(0);
    const total = a.capabilities.reduce((s, c) => s + c.benefit, 0) + a.projectBenefit;
    expect(total).toBeCloseTo(L.months.reduce((s, m) => s + m.benefit, 0), 4);
  });
});
