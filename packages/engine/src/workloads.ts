import { heuristics } from "@studio/catalog";
import type { PriceBook } from "./pricing.js";
import type { Harness, Workload } from "./project.js";
import { simulateHarness, type Percentile } from "./harness.js";
import { fmtInt, line, type Line } from "./lines.js";

export interface WorkloadContext {
  book: PriceBook;
  date: string;
  harnesses: Map<string, Harness>;
  percentile: Percentile;
}

const H = heuristics;
const tokensForPages = (pages: number, type: keyof typeof H.pages.wordsPerPage) => pages * H.pages.wordsPerPage[type] * H.tokens.perWord;

/** Monthly lines for one production workload at full adoption. */
export function workloadLines(w: Workload, c: WorkloadContext): Line[] {
  const { date } = c;
  const book = "deployment" in w ? c.book.withDeployment(w.deployment) : c.book;
  const id = w.id;
  const llm = (part: string, label: string, modelId: string, calls: number, inTok: number, cachedTok: number, outTok: number, behaviour: "usage" | "fixed" = "usage", batch = 0): Line => {
    const tk = book.tokenizerMultiplier(modelId);
    const per = book.chatCost(modelId, { input: inTok * tk, cachedInput: cachedTok * tk, output: outTok * tk }, date, (inTok + cachedTok) * tk);
    const disc = 1 - batch * book.chatModel(modelId).batchDiscount;
    return line({ id: `${id}:${part}`, componentId: id, label, stream: "run", behaviour, meter: modelId, quantity: calls, unit: "call", unitPrice: per * disc,
      tokens: { input: inTok * tk, cachedInput: cachedTok * tk, output: outTok * tk },
      formula: `${fmtInt(calls)} calls × (${fmtInt(inTok * tk)} in + ${fmtInt(cachedTok * tk)} cached + ${fmtInt(outTok * tk)} out tokens) on ${book.chatModel(modelId).label}${batch ? ` · ${Math.round(batch * 100)}% via Batch` : ""}` });
  };
  const unit = (part: string, label: string, unitPriceId: string, qty: number, behaviour: "usage" | "fixed" = "usage", stream: Line["stream"] = "run"): Line => {
    const u = book.unit(unitPriceId);
    const per = book.unitPrice(unitPriceId);
    return line({ id: `${id}:${part}`, componentId: id, label, stream, behaviour, meter: unitPriceId, quantity: qty, unit: u.unit, unitPrice: per, formula: `${qty.toLocaleString("en-CA", { maximumFractionDigits: 2 })} × ${u.unit} at CAD ${per.toFixed(4)}` });
  };

  switch (w.kind) {
    case "transcription": {
      const rate = book.speechPerHour(w.engineId, date, w.diarize);
      const out: Line[] = [line({ id: `${id}:stt`, componentId: id, label: w.label, stream: "run", behaviour: "usage", meter: w.engineId, quantity: w.hoursPerMonth, unit: "audio hour", unitPrice: rate, formula: `${fmtInt(w.hoursPerMonth)} h × CAD ${rate.toFixed(3)}/h` })];
      if (w.summary) {
        const transcript = H.speech.wordsPerMinute * 60 * H.tokens.perWord * (1 + (w.diarize ? H.speech.diarizationOverhead.names : 0));
        out.push(llm("summary", `${w.label}: summaries`, w.summary.modelId, w.hoursPerMonth, transcript + H.chat.systemPrompt, 0, w.summary.outputTokens));
      }
      return out;
    }
    case "documents": {
      const out: Line[] = [];
      if (w.route.type === "extract") {
        out.push(unit("extract", w.label, w.route.extractorId, w.pagesPerMonth / 1000));
        for (const a of w.route.addOnIds) out.push(unit(`addon-${a}`, `${w.label}: ${book.unit(a).label}`, a, w.pagesPerMonth / 1000));
      } else {
        const perPage = H.pages.directPdfTokensPerPage[book.chatModel(w.route.modelId).tokenizer] / book.tokenizerMultiplier(w.route.modelId);
        out.push(llm("direct", `${w.label}: direct to model`, w.route.modelId, w.pagesPerMonth, perPage, 0, 0));
      }
      if (w.warehouse) out.push(warehouseLine(id, w.label, w.warehouse, book, "usage"));
      if (w.enrich) {
        const docs = w.pagesPerMonth / w.enrich.pagesPerDoc;
        const inTok = tokensForPages(w.enrich.pagesPerDoc, w.pageType) * H.pages.layoutMarkdownOverhead + H.chat.systemPrompt;
        out.push(llm("enrich", `${w.label}: enrichment`, w.enrich.modelId, docs, inTok, 0, w.enrich.outputTokensPerDoc));
      }
      return out;
    }
    case "email": {
      const bodyChars = (H.email.bodyWords * 6 + H.email.overheadTokens * 4);
      const bodyPages = w.emailsPerMonth * Math.ceil(bodyChars / H.pages.charsPerBilledPage);
      const attPages = w.emailsPerMonth * w.attachmentShare * w.attachmentsPerEmail * w.pagesPerAttachment * w.dedupe;
      const out = [unit("bodies", `${w.label}: bodies`, w.bodyExtractorId, bodyPages / 1000), unit("attachments", `${w.label}: attachments`, w.attachmentExtractorId, attPages / 1000)];
      if (w.triage) {
        const inTok = H.email.bodyWords * H.tokens.perWord + H.email.overheadTokens + H.chat.systemPrompt;
        out.push(llm("triage", `${w.label}: triage`, w.triage.modelId, w.emailsPerMonth, inTok, 0, w.triage.outputTokens));
      }
      return out;
    }
    case "embeddings": {
      const per = book.embeddingPer1M(w.modelId);
      return [line({ id: `${id}:embed`, componentId: id, label: w.label, stream: "run", behaviour: "usage", meter: w.modelId, quantity: w.tokensPerMonth / 1e6, unit: "1M tokens", unitPrice: per, formula: `${fmtInt(w.tokensPerMonth)} tokens × CAD ${per}/1M` })];
    }
    case "aiSearch": {
      const s = sizeSearch(w, book);
      const t = book.searchTier(s.tier);
      return [line({ id: `${id}:su`, componentId: id, label: `${w.label} (${t.label})`, stream: "platform", behaviour: "fixed", meter: `search-${s.tier}`, quantity: s.replicas * s.partitions, unit: "SU-month", unitPrice: t.perSUMonth,
        formula: `${s.replicas} replicas × ${s.partitions} partitions · vectors ${s.vectorGB.toFixed(2)} GB, storage ${s.storageGB.toFixed(1)} GB` })];
    }
    case "retrieval": {
      const out = [unit("semantic", `${w.label}: semantic ranker`, "search-semantic", (w.queriesPerMonth * w.semanticShare) / 1000)];
      if (w.rerankerId) out.push(unit("rerank", `${w.label}: reranker`, w.rerankerId, w.queriesPerMonth / 1000));
      if (w.agentic) {
        const a = w.agentic;
        out.push(unit("agentic", `${w.label}: agentic retrieval`, "search-agentic", (w.queriesPerMonth * a.subqueries * a.chunksPerSubquery * a.tokensPerChunk) / 1e6));
        out.push(llm("planner", `${w.label}: query planning`, a.plannerModelId, w.queriesPerMonth, 2000, 0, 350));
      }
      return out;
    }
    case "chat": {
      const turnsMonth = w.users * w.conversationsPerUser * w.turns;
      // Average prompt over a conversation: history grows by one exchange per turn.
      const avgHistory = ((w.turns - 1) / 2) * (w.userTurnTokens + w.assistantTurnTokens);
      const prompt = w.systemPromptTokens + H.chat.ragTemplate + w.topK * w.chunkTokens + avgHistory + w.userTurnTokens;
      const cached = Math.min(prompt, w.systemPromptTokens + avgHistory) * w.cacheHit;
      const split = w.router?.share ?? 0;
      const out = [llm("main", w.label, w.modelId, turnsMonth * (1 - split), prompt - cached, cached, w.assistantTurnTokens)];
      if (w.router && split > 0) out.push(llm("routed", `${w.label}: routed turns`, w.router.modelId, turnsMonth * split, prompt - cached, cached, w.assistantTurnTokens));
      return out;
    }
    case "agent": {
      const h = c.harnesses.get(w.harnessId);
      if (!h) throw new Error(`Workload ${id} references unknown harness ${w.harnessId}`);
      const r = simulateHarness(h, book, { modelId: w.modelId, cacheHit: w.cacheHit, percentile: c.percentile, date });
      const out = [line({ id: `${id}:runs`, componentId: id, label: w.label, stream: "run", behaviour: "usage", meter: w.modelId, quantity: w.tasksPerMonth, unit: "task", unitPrice: r.cost,
        tokens: { input: r.inputTokens, cachedInput: r.cachedTokens, output: r.outputTokens },
        formula: `${fmtInt(w.tasksPerMonth)} tasks × ${r.steps} steps · ${fmtInt(r.inputTokens + r.cachedTokens)} in (${fmtInt(r.cachedTokens)} cached) + ${fmtInt(r.outputTokens)} out per task at ${c.percentile.toUpperCase()}` })];
      for (const f of w.toolFees) out.push(unit(`fee-${f.unitPriceId}`, `${w.label}: ${book.unit(f.unitPriceId).label}`, f.unitPriceId, (w.tasksPerMonth * f.perTask) / unitDivisor(book.unit(f.unitPriceId).unit)));
      return out;
    }
    case "continuousEval": {
      const n = w.interactionsPerMonth * w.sampleShare;
      return evaluationLines(id, w.label, "run", n, w.judgeModelId, w.evaluators, 100, w.contextTokens, w.responseTokens, w.safetyEvaluators, book, date);
    }
    case "contentSafety": {
      const records = w.requestsPerMonth * Math.ceil(w.charsPerRequest / 1000);
      return w.unitPriceIds.map((u) => unit(u, `${w.label}: ${book.unit(u).label}`, u, records / 1000));
    }
    case "llm":
      return [llm("calls", w.label, w.modelId, w.callsPerMonth, w.inputTokens, w.cachedInputTokens, w.outputTokens, "usage", w.batchShare)];
    case "fixed":
      return w.items.map((it) => unit(it.id, it.label, it.unitPriceId, it.quantity, "fixed", "platform"));
    case "voiceAgent": {
      const v = voiceCall(w, book);
      const out = [line({ id: `${id}:realtime`, componentId: id, label: `${w.label}: ${book.realtimeModel(w.modelId).label}`, stream: "run", behaviour: "usage", meter: w.modelId, quantity: w.callsPerMonth, unit: "call", unitPrice: v.cost,
        formula: `${fmtInt(w.callsPerMonth)} calls × ${w.minutesPerCall} min, ${w.turnsPerCall} turns · ${fmtInt(v.audioIn)} audio in (${fmtInt(v.cachedAudio)} cached) + ${fmtInt(v.audioOut)} audio out + ${fmtInt(v.textIn)} text in per call` })];
      if (w.telephonyPerMinute > 0) out.push(line({ id: `${id}:telephony`, componentId: id, label: `${w.label}: telephony`, stream: "run", behaviour: "usage", meter: "telephony", quantity: w.callsPerMonth * w.minutesPerCall, unit: "minute", unitPrice: w.telephonyPerMinute, formula: `${fmtInt(w.callsPerMonth * w.minutesPerCall)} minutes × CAD ${w.telephonyPerMinute}` }));
      return out;
    }
    case "snowflakeComplete": {
      const m = book.chatModel(w.modelId);
      if (m.platform !== "snowflake") throw new Error(`${w.label}: ${m.label} is not a Snowflake Cortex model`);
      return [llm("complete", `${w.label}: AI_COMPLETE`, w.modelId, w.rowsPerMonth, w.inputTokens, 0, w.outputTokens), warehouseLine(id, w.label, w.warehouse, book, "usage")];
    }
    case "snowflakeFunction": {
      const u = book.unit(w.functionId);
      const tokens = w.rowsPerMonth * (w.tokensPerRow + w.hiddenPromptTokens + w.outputTokensPerRow);
      return [
        line({ id: `${id}:fn`, componentId: id, label: `${w.label}: ${u.label}`, stream: "run", behaviour: "usage", meter: w.functionId, quantity: tokens / unitDivisor(u.unit), unit: u.unit, unitPrice: book.unitPrice(w.functionId),
          formula: `${fmtInt(w.rowsPerMonth)} rows × (${fmtInt(w.tokensPerRow)} input + ${fmtInt(w.hiddenPromptTokens)} hidden prompt + ${fmtInt(w.outputTokensPerRow)} output) tokens × ${u.credits} AI credits per ${u.unit}` }),
        warehouseLine(id, w.label, w.warehouse, book, "usage"),
      ];
    }
    case "cortexSearch": {
      const dims = book.embeddingDims(w.embeddingModelId);
      const gb = (w.rows * (w.vectorColumns * dims * 4 + w.avgRowBytes)) / 1e9;
      const serving = book.unitPrice("sf-search-serving");
      const embedTokens = w.rows * w.changedShareMonthly * w.tokensPerRow;
      return [
        line({ id: `${id}:serving`, componentId: id, label: `${w.label}: serving`, stream: "platform", behaviour: "fixed", meter: "sf-search-serving", quantity: gb, unit: "GB-month", unitPrice: serving,
          formula: `${fmtInt(w.rows)} rows × (${w.vectorColumns} × ${dims} dims × 4 B + ${fmtInt(w.avgRowBytes)} B) = ${gb.toFixed(2)} GB × 6.3 AI credits` }),
        line({ id: `${id}:embed`, componentId: id, label: `${w.label}: embedding changed rows`, stream: "run", behaviour: "usage", meter: w.embeddingModelId, quantity: embedTokens / 1e6, unit: "1M tokens", unitPrice: book.embeddingPer1M(w.embeddingModelId),
          formula: `${Math.round(w.changedShareMonthly * 100)}% of ${fmtInt(w.rows)} rows × ${fmtInt(w.tokensPerRow)} tokens re-embedded per month` }),
        warehouseLine(id, `${w.label}: refresh`, w.warehouse, book, "fixed"),
      ];
    }
  }
}

/**
 * One speech-to-speech call. Each turn the model re-reads the conversation so far (audio
 * history, mostly cached) plus the caller's new audio, and speaks its reply.
 */
export function voiceCall(w: Extract<Workload, { kind: "voiceAgent" }>, book: PriceBook) {
  const m = book.realtimeModel(w.modelId);
  const secs = w.minutesPerCall * 60;
  const callerPerTurn = (secs * (1 - w.agentTalkShare) / w.turnsPerCall) * m.audioTokensPerSecondIn;
  const agentPerTurn = (secs * w.agentTalkShare / w.turnsPerCall) * m.audioTokensPerSecondOut;
  let history = 0, audioIn = 0, cachedAudio = 0, audioOut = 0, textIn = 0, cachedText = 0;
  for (let t = 1; t <= w.turnsPerCall; t++) {
    const cached = history * w.cacheHit;
    audioIn += history - cached + callerPerTurn;
    cachedAudio += cached;
    audioOut += agentPerTurn;
    const sysCached = t === 1 ? 0 : w.systemPromptTokens * w.cacheHit;
    textIn += w.systemPromptTokens - sysCached;
    cachedText += sysCached;
    history += callerPerTurn + agentPerTurn;
  }
  const cost = (audioIn * m.audio.input + cachedAudio * m.audio.cachedInput + audioOut * m.audio.output + textIn * m.text.input + cachedText * m.text.cachedInput) / 1e6;
  return { cost, audioIn, cachedAudio, audioOut, textIn };
}

/**
 * The same call as a cascade: speech-to-text on the caller's audio, an LLM turn per exchange
 * on the transcript, and text-to-speech for the agent's words.
 */
export function cascadeCall(w: Extract<Workload, { kind: "voiceAgent" }>, book: PriceBook, date: string, o: { sttId: string; llmId: string; ttsId: string }) {
  const H = heuristics;
  const callerMin = w.minutesPerCall * (1 - w.agentTalkShare), agentMin = w.minutesPerCall * w.agentTalkShare;
  const stt = (callerMin / 60) * book.speechPerHour(o.sttId, date);
  const wordsPerTurnCaller = (callerMin * H.speech.wordsPerMinute) / w.turnsPerCall, wordsPerTurnAgent = (agentMin * H.speech.wordsPerMinute) / w.turnsPerCall;
  const tk = H.tokens.perWord;
  let llm = 0, history = 0;
  for (let t = 1; t <= w.turnsPerCall; t++) {
    const prompt = w.systemPromptTokens + history + wordsPerTurnCaller * tk;
    const cached = (w.systemPromptTokens + history) * (t === 1 ? 0 : w.cacheHit);
    llm += book.chatCost(o.llmId, { input: prompt - cached, cachedInput: cached, output: wordsPerTurnAgent * tk }, date);
    history += (wordsPerTurnCaller + wordsPerTurnAgent) * tk;
  }
  const chars = agentMin * H.speech.wordsPerMinute * 6;
  const tts = (chars / 1e6) * book.unitPrice(o.ttsId);
  return { stt, llm, tts, cost: stt + llm + tts };
}

/** Platform-credit cost of a Snowflake warehouse running `hoursPerMonth` (per-second billing, so hours are averages). */
export function warehouseLine(id: string, label: string, wh: { size: "xs" | "s" | "m" | "l" | "xl"; hoursPerMonth: number }, book: PriceBook, behaviour: "usage" | "fixed"): Line {
  const cph = book.catalog.snowflake.warehouseCreditsPerHour[wh.size] ?? 4;
  const credit = book.platformCreditCad();
  return line({ id: `${id}:warehouse`, componentId: id, label: `${label}: ${wh.size.toUpperCase()} warehouse`, stream: "run", behaviour, meter: `sf-warehouse-${wh.size}`, quantity: wh.hoursPerMonth, unit: "warehouse hour", unitPrice: cph * credit,
    formula: `${wh.hoursPerMonth} h × ${cph} credits/h × CAD ${credit.toFixed(2)} per platform credit` });
}

/** Divisor that turns a raw count into catalogue units ("1K transactions" → 1000). */
export function unitDivisor(u: string): number {
  if (u.startsWith("1M")) return 1e6;
  if (u.startsWith("10K")) return 1e4;
  if (u.startsWith("1K")) return 1e3;
  return 1;
}

/** LLM-judge and safety-meter lines for n scored interactions. */
export function evaluationLines(id: string, label: string, stream: Line["stream"], n: number, judgeModelId: string, evaluators: string[], queryTokens: number, contextTokens: number, responseTokens: number, safetyEvaluators: number, book: PriceBook, date: string): Line[] {
  const t = H.evaluation.templateTokens as Record<string, number>;
  const judgeIn = evaluators.reduce((s, e) => s + (t[e] ?? 2000) + queryTokens + responseTokens + (e === "groundedness" || e === "retrieval" ? contextTokens : 0), 0);
  const judgeOut = evaluators.length * H.evaluation.judgeOutputTokens;
  const tk = book.tokenizerMultiplier(judgeModelId);
  const per = book.chatCost(judgeModelId, { input: judgeIn * tk, output: judgeOut * tk }, date);
  const out: Line[] = [line({ id: `${id}:judge`, componentId: id, label: `${label}: judge`, stream, behaviour: "usage", meter: judgeModelId, quantity: n, unit: "scored item", unitPrice: per,
    tokens: { input: judgeIn * tk, cachedInput: 0, output: judgeOut * tk },
    formula: `${fmtInt(n)} items × ${evaluators.length} evaluators · ${fmtInt(judgeIn)} in + ${fmtInt(judgeOut)} out judge tokens per item` })];
  if (safetyEvaluators > 0) {
    const s = H.evaluation.safetyEvaluatorTokens;
    const perS = safetyEvaluators * ((s.input * book.unitPrice("eval-safety-input")) + s.output * book.unitPrice("eval-safety-output")) / 1e6;
    out.push(line({ id: `${id}:safety`, componentId: id, label: `${label}: safety evaluators`, stream, behaviour: "usage", meter: "eval-safety-input", quantity: n, unit: "scored item", unitPrice: perS,
      formula: `${fmtInt(n)} items × ${safetyEvaluators} safety evaluators on the AI evaluations meter` }));
  }
  return out;
}

export interface SearchSizing { tier: NonNullable<Extract<Workload, { kind: "aiSearch" }>["tier"]>; partitions: number; replicas: number; vectorGB: number; storageGB: number }

/** Smallest tier and partition count that holds the vector index and the stored text. */
export function sizeSearch(w: Extract<Workload, { kind: "aiSearch" }>, book: PriceBook): SearchSizing {
  const dims = book.embeddingDims(w.embeddingModelId);
  const s = H.search;
  const vectorGB = (w.chunks * dims * w.bytesPerDim * (1 + s.hnswOverhead) * (1 + s.deletedDocs)) / 1e9;
  const storageGB = vectorGB * s.diskToVectorRatio + (w.chunks * w.chunkTokens * s.bytesPerTextToken) / 1e9;
  const order = ["basic", "s1", "s2", "s3", "l1", "l2"] as const;
  const fits = (id: (typeof order)[number] | "s3hd") => {
    const t = book.searchTier(id);
    const p = Math.max(1, Math.ceil(vectorGB / (t.vectorGBPerPartition || Infinity)), Math.ceil(storageGB / t.storageGBPerPartition));
    return p <= t.maxPartitions && w.replicas <= t.maxReplicas ? p : null;
  };
  if (w.tier) {
    const p = fits(w.tier);
    if (p === null) throw new Error(`${w.label}: ${w.tier} cannot hold ${vectorGB.toFixed(1)} GB of vectors`);
    return { tier: w.tier, partitions: p, replicas: w.replicas, vectorGB, storageGB };
  }
  let best: SearchSizing | null = null;
  for (const t of order) {
    const p = fits(t);
    if (p === null) continue;
    const cost = p * w.replicas * book.searchTier(t).perSUMonth;
    if (!best || cost < best.partitions * best.replicas * book.searchTier(best.tier).perSUMonth) best = { tier: t, partitions: p, replicas: w.replicas, vectorGB, storageGB };
  }
  if (!best) throw new Error(`${w.label}: no AI Search tier holds ${vectorGB.toFixed(1)} GB of vectors`);
  return best;
}
