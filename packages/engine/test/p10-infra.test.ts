import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import {
  ASSUMPTION_DEFAULTS, HOSTING_PRESETS, type Assumptions, PriceBook, ProjectSchema, WorkloadSchema, buildLedger, hostingItemMeta, imageCost, imageFormula, imageTokens,
  meetingIntelligence, newWorkload, projectIssues, ptuAnalysis, resolveAssumptions, sizePtu, voiceCall, cascadeCall, workloadLines,
  type Project, type Workload, type WorkloadContext,
} from "../src/index.js";

const cat = loadCatalog();
const book = new PriceBook(cat, { azureDeployment: "global", snowflake: { routing: "global", edition: "enterprise" } });
const ctx = (over: Partial<WorkloadContext> = {}): WorkloadContext => ({ book, date: "2027-01-01", harnesses: new Map(), percentile: "p50", ...over });
const sample = () => structuredClone(meetingIntelligence) as Project;
type Of<K extends Workload["kind"]> = Extract<Workload, { kind: K }>;
const chatOf = (p: Project) => p.workloads.find((w) => w.kind === "chat") as Of<"chat">;
const withChat = (patch: Partial<Of<"chat">>): Project => {
  const p = sample();
  Object.assign(chatOf(p), patch);
  return ProjectSchema.parse(p);
};
const sumCost = (ls: { cost: number }[]) => ls.reduce((s, l) => s + l.cost, 0);

describe("hosting stacks (E7)", () => {
  const base = (items: Of<"hosting">["items"], over: Partial<Of<"hosting">> = {}): Of<"hosting"> => ({ kind: "hosting", id: "host", label: "Hosting", requestsPerMonth: 2_000_000, items, ...over });

  it("prices fixed items from the catalogue and volume items per 1,000 requests", () => {
    const w = base([
      { basis: "fixed", id: "app", label: "App Service", unitPriceId: "app-service-p1v3-linux", quantity: 2 },
      { basis: "perRequests", id: "logs", label: "Logs", unitPriceId: "log-analytics-ingest", unitsPer1KRequests: 0.002 },
    ]);
    const ls = workloadLines(w, ctx());
    expect(ls).toHaveLength(2);
    expect(ls[0]!.cost).toBeCloseTo(2 * 173.74, 6);
    expect(ls[0]!.behaviour).toBe("fixed");
    expect(ls[0]!.stream).toBe("platform");
    // 2,000,000 requests = 2,000 thousands x 0.002 GB = 4 GB of ingestion
    expect(ls[1]!.quantity).toBeCloseTo(4, 9);
    expect(ls[1]!.cost).toBeCloseTo(4 * 3.9097, 6);
    expect(ls[1]!.behaviour).toBe("usage");
  });

  it("an 'enter your own' item is a monthly cash line that starts at zero", () => {
    const p = HOSTING_PRESETS.find((x) => x.id === "private-endpoints")!;
    const ls = workloadLines(base(p.items), ctx());
    expect(ls.every((l) => l.cost === 0)).toBe(true);
    const own = workloadLines(base([{ basis: "cash", id: "pe", label: "Private endpoints", amountCad: 120 }]), ctx());
    expect(own[0]!.cost).toBe(120);
    expect(own[0]!.unit).toBe("month");
  });

  it("takes its volume from another workload when volumeFrom is set, and flags an unknown one", () => {
    const p = sample();
    const chat = chatOf(p);
    const turns = chat.users * chat.conversationsPerUser * chat.turns;
    p.workloads.push({ ...base([{ basis: "perRequests", id: "calls", label: "Calls", unitPriceId: "apim-consumption-calls", unitsPer1KRequests: 0.1 }], { volumeFrom: chat.id }), featureId: chat.featureId });
    const parsed = ProjectSchema.parse(p);
    expect(projectIssues(parsed)).toEqual([]);
    const l = buildLedger(parsed, cat).months.at(-1)!.lines.find((x) => x.id === "host:calls")!;
    expect(l.formula).toContain(turns.toLocaleString("en-CA"));
    const bad = structuredClone(parsed);
    (bad.workloads.find((x) => x.id === "host") as Of<"hosting">).volumeFrom = "nope";
    expect(projectIssues(bad).map((i) => i.message).join()).toContain("nope");
  });

  it("every preset parses, prices against real catalogue ids and carries source and confidence", () => {
    expect(HOSTING_PRESETS.map((x) => x.id)).toEqual(expect.arrayContaining(["agent-service", "cosmos", "app-service", "aks", "container-apps", "private-endpoints", "apim-consumption", "apim-premium", "monitoring", "egress"]));
    for (const preset of HOSTING_PRESETS) {
      const w = base(structuredClone(preset.items));
      expect(() => WorkloadSchema.parse({ ...w, featureId: undefined })).not.toThrow();
      expect(() => workloadLines(w, ctx())).not.toThrow();
      for (const it of preset.items) {
        const m = hostingItemMeta(it, cat);
        expect(m.source.length).toBeGreaterThan(0);
        if (it.basis === "cash") { expect(m.enterYourOwn).toBe(true); expect(it.amountCad).toBe(0); }
        else expect(["verified", "cross-checked", "single-source"]).toContain(m.confidence);
      }
    }
  });

  it("Container Apps no longer prices at zero", () => {
    const preset = HOSTING_PRESETS.find((x) => x.id === "container-apps")!;
    const ls = workloadLines(base(preset.items), ctx());
    expect(ls.find((l) => l.id === "host:ca-vcpu")!.cost).toBeGreaterThan(0);
    expect(ls.find((l) => l.id === "host:ca-memory")!.cost).toBeGreaterThan(0);
  });

  it("the new-workload default is valid", () => {
    const p = sample();
    const w = newWorkload(p, "hosting");
    expect(w.kind).toBe("hosting");
    expect(() => WorkloadSchema.parse({ ...w, featureId: undefined })).not.toThrow();
  });
});

describe("built-in tool fees (E15)", () => {
  it("chat bills a catalogue tool fee per turn", () => {
    const base = buildLedger(withChat({}), cat).totals.runRate;
    const p = withChat({ toolFees: [{ unitPriceId: "mai-web-grounding", perTask: 0.5 }] });
    const chat = chatOf(p);
    const turns = chat.users * chat.conversationsPerUser * chat.turns;
    const w = workloadLines(chat, ctx({ volumes: new Map() })).find((l) => l.id === `${chat.id}:fee-mai-web-grounding`)!;
    expect(w.quantity).toBeCloseTo((turns * 0.5) / 1000, 6);
    expect(w.cost).toBeCloseTo(((turns * 0.5) / 1000) * 19.8317, 4);
    expect(buildLedger(p, cat).totals.runRate).toBeGreaterThan(base);
  });

  it("a fee with your own price per 1,000 calls bills exactly that", () => {
    const chat = chatOf(withChat({ toolFees: [{ label: "Web search", cadPer1KCalls: 14, perTask: 1 }] }));
    const turns = chat.users * chat.conversationsPerUser * chat.turns;
    const l = workloadLines(chat, ctx()).find((x) => x.id === `${chat.id}:fee-own-0`)!;
    expect(l.unitPrice).toBe(14);
    expect(l.cost).toBeCloseTo((turns / 1000) * 14, 6);
    expect(l.label).toContain("Web search");
  });

  it("rejects a fee with neither a catalogue price nor your own", () => {
    expect(() => withChat({ toolFees: [{ perTask: 1 }] })).toThrow();
  });

  it("agent tool fees keep their line ids and accept your own price", () => {
    const p = sample();
    const agent = p.workloads.find((w) => w.kind === "agent") as Of<"agent">;
    agent.toolFees = [{ unitPriceId: "code-interpreter", perTask: 2 }, { label: "Computer use", cadPer1KCalls: 50, perTask: 1 }];
    const ls = workloadLines(agent, ctx({ harnesses: new Map(p.harnesses.map((h) => [h.id, h])) }));
    expect(ls.find((l) => l.id === `${agent.id}:fee-code-interpreter`)).toBeDefined();
    expect(ls.find((l) => l.id === `${agent.id}:fee-own-1`)!.cost).toBeCloseTo((agent.tasksPerMonth / 1000) * 50, 6);
  });
});

describe("image tokens (E15)", () => {
  const formula = (id: string, vendor: "openai" | "anthropic" = "openai") => imageFormula({ id, vendor })!;

  it("tile models reproduce OpenAI's worked examples", () => {
    expect(imageTokens(formula("gpt-4o"), 1024, 1024, "high")).toBe(765);
    expect(imageTokens(formula("gpt-4o"), 2048, 4096, "high")).toBe(1105);
    expect(imageTokens(formula("gpt-4o"), 4096, 8192, "low")).toBe(85);
    expect(imageTokens(formula("gpt-4o-mini"), 1024, 1024, "high")).toBe(2833 + 5667 * 4);
  });
  it("never upscales a small image", () => {
    expect(imageTokens(formula("gpt-4.1"), 300, 200, "high")).toBe(85 + 170);
  });
  it("patch models count 32px patches times the multiplier and cap at 1,536 patches", () => {
    expect(imageTokens(formula("gpt-4.1-mini"), 1024, 1024)).toBeCloseTo(1024 * 1.62, 6);
    expect(imageTokens(formula("gpt-4.1-mini"), 4096, 4096)).toBeLessThanOrEqual(1536 * 1.62 + 1e-9);
  });
  it("Anthropic models use width x height / 750 with the long edge at 1,568 and a 1,600-token cap", () => {
    const f = formula("claude-sonnet-5-5", "anthropic");
    expect(imageTokens(f, 1092, 1092)).toBeCloseTo((1092 * 1092) / 750, 6);
    expect(imageTokens(f, 4000, 4000)).toBeLessThanOrEqual(1600);
  });
  it("a model without a formula adds nothing and says so", () => {
    const r = imageCost({ id: "deepseek-v4-pro", vendor: "deepseek" as const, label: "DeepSeek" }, { perCall: 2, widthPx: 512, heightPx: 512, detail: "high" });
    expect(r.supported).toBe(false);
    expect(r.perCall).toBe(0);
  });
  it("chat with images adds exactly the formula's tokens to the input", () => {
    const img = { perCall: 2, widthPx: 1024, heightPx: 1024, detail: "high" as const };
    const plain = chatOf(withChat({ modelId: "gpt-4o" }));
    const withImg = chatOf(withChat({ modelId: "gpt-4o", images: img }));
    const a = workloadLines(plain, ctx()).find((l) => l.id.endsWith(":main"))!;
    const b = workloadLines(withImg, ctx()).find((l) => l.id.endsWith(":main"))!;
    const tk = book.tokenizerMultiplier("gpt-4o");
    expect(b.tokens!.input - a.tokens!.input).toBeCloseTo(2 * 765, 6);
    expect(tk).toBe(1);
    expect(b.cost).toBeGreaterThan(a.cost);
    expect(b.formula).toContain("1024x1024");
  });
  it("an llm workload with no images is unchanged", () => {
    const w = newWorkload(sample(), "llm") as Of<"llm">;
    const a = workloadLines(w, ctx());
    const b = workloadLines({ ...w, images: undefined }, ctx());
    expect(b).toEqual(a);
  });
});

describe("PTU in the ledger (E8)", () => {
  it("is off by default: no PTU line, nothing changes", () => {
    const L = buildLedger(sample(), cat);
    expect(L.months.flatMap((m) => m.lines).some((l) => l.meter.startsWith("ptu:"))).toBe(false);
  });

  it("auto-sizes for the peak at the workload's own deployment rate and leaves no spillover", () => {
    const p = withChat({ ptu: { term: "monthly" } });
    const chat = chatOf(p);
    const ls = workloadLines(chat, ctx());
    const base = ls.find((l) => l.id === `${chat.id}:ptu`)!;
    expect(base.behaviour).toBe("fixed");
    expect(base.meter).toBe("ptu:gpt-5.4");
    expect(base.unitPrice).toBeCloseTo(cat.ptu.rates.global.monthlyReservation, 6);
    const plain = workloadLines({ ...chat, ptu: undefined }, ctx()).find((l) => l.id.endsWith(":main"))!;
    const peak = (plain.tokens!.input * plain.quantity * 3) / 43_200, peakOut = (plain.tokens!.output * plain.quantity * 3) / 43_200;
    expect(base.quantity).toBe(sizePtu(cat, "gpt-5.4", { input: peak, cachedInput: 0, output: peakOut }, "global")!.ptus);
    expect(ls.some((l) => l.onPtu)).toBe(false);
    expect(ls.some((l) => l.id.endsWith(":main"))).toBe(false);
  });

  it("an undersized reservation spills the rest to pay-as-you-go and flags the peak", () => {
    const chat = chatOf(withChat({ users: 50_000, ptu: { ptus: 15, term: "monthly" } }));
    const plain = workloadLines({ ...chat, ptu: undefined }, ctx()).find((l) => l.id.endsWith(":main"))!;
    const b = new PriceBook(cat, { azureDeployment: "global", snowflake: { routing: "global", edition: "enterprise" } });
    const ls = workloadLines(chat, ctx({ book: b }));
    const spill = ls.find((l) => l.onPtu)!;
    expect(spill).toBeDefined();
    const share = spill.quantity / plain.quantity;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    expect(spill.cost).toBeCloseTo(plain.cost * share, 6);
    expect([...b.notes.values()].some((n) => n.kind === "capacity")).toBe(true);
  });

  it("an explicit spillover share overrides the default", () => {
    const chat = chatOf(withChat({ ptu: { ptus: 15, term: "monthly", spilloverShare: 0.25 } }));
    const plain = workloadLines({ ...chat, ptu: undefined }, ctx()).find((l) => l.id.endsWith(":main"))!;
    const spill = workloadLines(chat, ctx()).find((l) => l.onPtu)!;
    expect(spill.quantity / plain.quantity).toBeCloseTo(0.25, 9);
  });

  it("prices the term: hourly, 1-month and 1-year differ in that order", () => {
    const price = (term: "hourly" | "monthly" | "yearly") => workloadLines(chatOf(withChat({ ptu: { ptus: 15, term } })), ctx()).find((l) => l.id.endsWith(":ptu"))!.unitPrice;
    expect(price("yearly")).toBeLessThan(price("monthly"));
    expect(price("monthly")).toBeLessThan(price("hourly"));
    expect(price("hourly")).toBeCloseTo(cat.ptu.rates.global.hourly * 730, 6);
  });

  it("uses the workload's own deployment rate, not Global", () => {
    const chat = chatOf(withChat({ deployment: "dataZone", ptu: { ptus: 15, term: "monthly" } }));
    const l = workloadLines(chat, ctx()).find((x) => x.id.endsWith(":ptu"))!;
    expect(l.unitPrice).toBeCloseTo(cat.ptu.rates.dataZone.monthlyReservation, 6);
    expect(l.unitPrice).not.toBeCloseTo(cat.ptu.rates.global.monthlyReservation, 2);
  });

  it("a model with no PTU offering stays pay-as-you-go and says so", () => {
    const b = new PriceBook(cat, { azureDeployment: "global", snowflake: { routing: "global", edition: "enterprise" } });
    const chat = chatOf(withChat({ modelId: "claude-sonnet-5-5", ptu: { term: "monthly" } }));
    const ls = workloadLines(chat, ctx({ book: b }));
    expect(ls.some((l) => l.id.endsWith(":ptu"))).toBe(false);
    expect(ls.some((l) => l.id.endsWith(":main"))).toBe(true);
    expect([...b.notes.values()].some((n) => n.kind === "capacity")).toBe(true);
  });

  it("in the ledger the PTU line bills in full from go-live and the totals add up", () => {
    const L = buildLedger(withChat({ ptu: { term: "monthly" } }), cat);
    const first = L.months.find((m) => m.lines.some((l) => l.id.endsWith(":ptu")))!;
    const second = L.months[L.months.indexOf(first) + 1]!;
    const a = first.lines.find((l) => l.id.endsWith(":ptu"))!, b = second.lines.find((l) => l.id.endsWith(":ptu"))!;
    expect(a.cost).toBe(b.cost);
    expect(sumCost(first.lines)).toBeGreaterThan(a.cost);
  });

  it("the Capacity analysis prices break-even at each workload's own deployment", () => {
    const p = withChat({ deployment: "dataZone" });
    const L = buildLedger(p, cat);
    const own = ptuAnalysis(p, L, cat, { peakToAverage: 3 }).rows.find((r) => r.modelId === "gpt-5.4" && r.deployment === "dataZone");
    const forced = ptuAnalysis(p, L, cat, { peakToAverage: 3, deployment: "global" }).rows.find((r) => r.modelId === "gpt-5.4")!;
    expect(own).toBeDefined();
    const dz = cat.chatModels.find((m) => m.id === "gpt-5.4")!.prices!.dataZone!.input;
    const gl = cat.chatModels.find((m) => m.id === "gpt-5.4")!.prices!.global.input;
    const model = cat.ptu.models.find((m) => m.modelId === "gpt-5.4")!;
    const value = (price: number) => (model.inputTpmPerPtu * 43_200 * price) / 1e6;
    expect(own!.breakEvenMonthly).toBeCloseTo(cat.ptu.rates.dataZone.monthlyReservation / value(dz), 9);
    expect(forced.breakEvenMonthly).toBeCloseTo(cat.ptu.rates.global.monthlyReservation / value(gl), 9);
  });

  it("load already on PTU is not offered for PTU again", () => {
    const p = withChat({ ptu: { term: "monthly" } });
    const L = buildLedger(p, cat);
    const a = ptuAnalysis(p, L, cat, { peakToAverage: 3 });
    const chat = chatOf(p);
    const plain = ptuAnalysis(sample(), buildLedger(sample(), cat), cat, { peakToAverage: 3 });
    const sum = (r: typeof a) => r.rows.find((x) => x.modelId === chat.modelId)?.monthlyTokens.input ?? 0;
    expect(sum(a)).toBeLessThan(sum(plain));
  });
});

describe("TPM quota check (E8)", () => {
  const notes = (p: Project) => buildLedger(p, cat).notes.filter((n) => n.kind === "quota");
  it("raises an alert when peak tokens a minute exceed the quota", () => {
    const n = notes(withChat({ tpmQuota: 1000 }));
    expect(n).toHaveLength(1);
    expect(n[0]!.message).toContain("TPM quota");
  });
  it("stays quiet under the quota and when no quota is set", () => {
    expect(notes(withChat({ tpmQuota: 1e12 }))).toHaveLength(0);
    expect(notes(withChat({}))).toHaveLength(0);
  });
  it("a quota alone does not change any cost", () => {
    expect(buildLedger(withChat({ tpmQuota: 1000 }), cat).totals).toEqual(buildLedger(withChat({}), cat).totals);
  });
});

describe("editable assumptions (E13)", () => {
  it("the defaults are the old hard-coded numbers", () => {
    expect(ASSUMPTION_DEFAULTS.plannerInputTokens).toBe(2000);
    expect(ASSUMPTION_DEFAULTS.plannerOutputTokens).toBe(350);
    expect(ASSUMPTION_DEFAULTS.redTeamScoringOutputTokens).toBe(200);
    expect(resolveAssumptions(sample())).toEqual(ASSUMPTION_DEFAULTS);
  });

  it("planner tokens are settings", () => {
    const w = { ...(newWorkload(sample(), "retrieval") as Of<"retrieval">), agentic: { subqueries: 3, chunksPerSubquery: 5, tokensPerChunk: 400, plannerModelId: "gpt-5.4-mini", reasoning: "none" as const } };
    const planner = (a?: ReturnType<typeof resolveAssumptions>) => workloadLines(w as Workload, ctx(a ? { assumptions: a } : {})).find((l) => l.id.endsWith(":planner"))!;
    const def = planner();
    expect(def.tokens!.input).toBe(2000);
    expect(def.tokens!.output).toBe(350);
    const tuned = planner({ ...ASSUMPTION_DEFAULTS, plannerInputTokens: 5000, plannerOutputTokens: 600 });
    expect(tuned.tokens!.input).toBe(5000);
    expect(tuned.tokens!.output).toBe(600);
    expect(tuned.cost).toBeGreaterThan(def.cost);
  });

  it("red-team scoring output is a setting", () => {
    const run = (n?: number) => {
      const p = sample();
      if (n !== undefined) p.settings.assumptions = { redTeamScoringOutputTokens: n };
      return buildLedger(ProjectSchema.parse(p), cat).totals.devLab;
    };
    expect(run(200)).toBeCloseTo(run(), 9);
    expect(run(400)).toBeGreaterThan(run());
    expect(run(0)).toBeLessThan(run());
  });

  it("voice function-call tokens are a setting that defaults to nothing", () => {
    const v: Of<"voiceAgent"> = { kind: "voiceAgent", id: "v", label: "Voice", modelId: "gpt-realtime-2.1-mini", callsPerMonth: 1000, minutesPerCall: 5, turnsPerCall: 6, agentTalkShare: 0.5, systemPromptTokens: 1500, cacheHit: 0.5, telephonyPerMinute: 0 };
    const m = cat.realtimeModels.find((x) => x.id === v.modelId)!;
    const fc: { input: number; output: number } = { input: 300, output: 100 };
    const base = voiceCall(v, book).cost;
    expect(voiceCall(v, book, { input: 0, output: 0 }).cost).toBe(base);
    expect(voiceCall(v, book, fc).cost - base).toBeCloseTo((6 * (300 * m.text.input + 100 * m.text.output)) / 1e6, 10);
    const o = { sttId: "speech-batch", llmId: "gpt-5.4-mini", ttsId: "tts-neural" };
    expect(cascadeCall(v, book, "2027-01-01", o, fc).llm).toBeGreaterThan(cascadeCall(v, book, "2027-01-01", o).llm);
    const lines = (a: Assumptions) => workloadLines(v, ctx({ assumptions: a })).find((l) => l.id.endsWith(":realtime"))!.cost;
    expect(lines({ ...ASSUMPTION_DEFAULTS, voiceFunctionCallInputTokens: 300, voiceFunctionCallOutputTokens: 100 })).toBeGreaterThan(lines(ASSUMPTION_DEFAULTS));
  });

  it("a peak factor setting reaches the TPM check", () => {
    const p = withChat({ tpmQuota: 50_000 });
    const quiet = buildLedger(p, cat).notes.some((n) => n.kind === "quota");
    const q = structuredClone(p);
    q.settings.assumptions = { peakToAverage: 50 };
    expect(buildLedger(q, cat).notes.some((n) => n.kind === "quota")).toBe(true);
    expect(quiet).toBe(false);
  });
});
