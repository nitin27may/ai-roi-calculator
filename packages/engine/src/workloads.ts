import { heuristics } from "@studio/catalog";
import { DEPLOYMENT_LABEL, type PriceBook } from "./pricing.js";
import { isCashItem, type CashItem, type Harness, type Workload } from "./project.js";
import { simulateHarness, reasoningTokens, type Percentile, type ReasoningEffort } from "./harness.js";
import { fmtInt, line, type Line } from "./lines.js";
import { tokenSpread } from "./spread.js";
import { imageCost } from "./images.js";
import { ASSUMPTION_DEFAULTS, type Assumptions } from "./assumptions.js";
import { HOURS_PER_MONTH, MINUTES_PER_MONTH, sizePtu } from "./ptu-size.js";

export interface WorkloadContext {
  book: PriceBook;
  date: string;
  harnesses: Map<string, Harness>;
  percentile: Percentile;
  /** Project default text language (heuristics.tokens.language); a workload can override it. Defaults to "en". */
  language?: string;
  /** The project's editable assumptions (planner tokens, scoring, voice function calls, peak factor); defaults when absent. */
  assumptions?: Assumptions;
  /** Requests a month by workload id, for hosting items that take their volume from another workload. */
  volumes?: Map<string, number>;
}

const H = heuristics;
const SHIELDS = "safety-prompt-shields";
const tokensForPages = (pages: number, type: keyof typeof H.pages.wordsPerPage) => pages * H.pages.wordsPerPage[type] * H.tokens.perWord;
const LANG = H.tokens.language;

/** Reasoning tokens for a call, billed as output, and only for models the catalogue marks as reasoning models (E2). */
function reasoningOut(book: PriceBook, modelId: string, r: ReasoningEffort | number | undefined): number {
  return r !== undefined && book.isReasoningModel(modelId) ? reasoningTokens(r) : 0;
}

/** Multiplier for a workload's (or the project's) text language; 1 for English or an unknown code (E3). */
function languageFactor(w: { language?: string }, c: { language?: string }): number {
  const lang = w.language ?? c.language ?? "en";
  return LANG[lang as keyof typeof LANG] ?? 1;
}

/** A free-text CAD cost as a ledger line: fixed monthly, or one-time (landing in the item's month, or the owner's first month). */
export function cashLine(lineId: string, componentId: string, it: CashItem, stream: Line["stream"]): Line {
  const once = it.cadence === "once";
  return line({
    id: lineId, componentId, label: once ? `${it.label} (one-time)` : it.label, stream, behaviour: "fixed", meter: `cad:${it.id}`,
    quantity: 1, unit: once ? "once" : "month", unitPrice: it.amountCad, formula: `CAD ${it.amountCad.toLocaleString("en-CA")} ${once ? "once" : "per month"}`,
    ...(once ? { once: true } : {}), ...(once && it.month !== undefined ? { onceMonth: it.month } : {}),
  });
}

/** Monthly lines for one production workload at full adoption. */
export function workloadLines(w: Workload, c: WorkloadContext): Line[] {
  const { date } = c;
  const book = "deployment" in w ? c.book.withPricing({ deployment: w.deployment, tier: w.tier }) : c.book;
  const id = w.id;
  /**
   * One line per processing tier the calls split across. `batchShare` of the calls price at the
   * Batch tier (if offered — see `PriceBook.applyTier`); the rest stay at the book's own tier.
   * Splitting by tier (rather than blending into one line) keeps PTU sizing from counting Batch
   * tokens, which never run on provisioned capacity.
   */
  const llm = (part: string, label: string, modelId: string, calls: number, inTok: number, cachedTok: number, outTok: number, behaviour: "usage" | "fixed" = "usage", batchShare = 0, writeTok = 0, note = ""): Line[] => {
    const tk = book.tokenizerMultiplier(modelId);
    const tokens = { input: inTok * tk, cachedInput: cachedTok * tk, output: outTok * tk, ...(writeTok ? { cacheWrite: writeTok * tk } : {}) };
    const reqTokens = (inTok + cachedTok + writeTok) * tk;
    const modelLabel = book.chatModel(modelId).label;
    const tierLine = (tier: "standard" | "batch", qty: number): Line => {
      const b = tier === "standard" ? book : book.withPricing({ tier });
      const per = b.chatCost(modelId, tokens, date, reqTokens);
      const idSuffix = tier === "batch" ? ":batch" : "";
      const batchNote = tier === "batch" ? ` · ${Math.round(batchShare * 100)}% via Batch` : "";
      const writeNote = writeTok ? ` + ${fmtInt(tokens.cacheWrite ?? 0)} cache write` : "";
      return line({ id: `${id}:${part}${idSuffix}`, componentId: id, label, stream: "run", behaviour, meter: modelId, tier, quantity: qty, unit: "call", unitPrice: per, tokens, deployment: book.settings.azureDeployment,
        formula: `${fmtInt(qty)} calls × (${fmtInt(tokens.input)} in + ${fmtInt(tokens.cachedInput)} cached${writeNote} + ${fmtInt(tokens.output)} out tokens) on ${modelLabel}${batchNote}${note}` });
    };
    if (!batchShare) return [tierLine("standard", calls)];
    const out: Line[] = [];
    const standardCalls = calls * (1 - batchShare);
    if (standardCalls > 0) out.push(tierLine("standard", standardCalls));
    const batchCalls = calls * batchShare;
    if (batchCalls > 0) out.push(tierLine("batch", batchCalls));
    return out;
  };
  const unit = (part: string, label: string, unitPriceId: string, qty: number, behaviour: "usage" | "fixed" = "usage", stream: Line["stream"] = "run"): Line => {
    const u = book.unit(unitPriceId);
    const per = book.unitPrice(unitPriceId);
    return line({ id: `${id}:${part}`, componentId: id, label, stream, behaviour, meter: unitPriceId, quantity: qty, unit: u.unit, unitPrice: per, formula: `${qty.toLocaleString("en-CA", { maximumFractionDigits: 2 })} × ${u.unit} at CAD ${per.toFixed(4)}` });
  };

  /**
   * Prompt Shields screening of each request, billed per 1K text records. Only added when the catalogue has the price, so a
   * missing meter never invents a cost. Groundedness detection has no catalogue price and is not modelled.
   */
  const shieldLines = (requests: number, chars: number): Line[] =>
    book.catalog.unitPrices.some((u) => u.id === SHIELDS) ? [unit("shields", `${w.label}: Prompt Shields`, SHIELDS, (requests * Math.ceil(chars / 1000)) / 1000)] : [];

  const A = c.assumptions ?? ASSUMPTION_DEFAULTS;

  /** Image tokens as extra uncached input on `modelId`, already divided by its tokenizer multiplier (image tokens are billed as counted, not re-tokenized). */
  const imageInput = (modelId: string, img: Extract<Workload, { kind: "chat" | "llm" }>["images"]): { tokens: number; note: string } => {
    if (!img || img.perCall === 0) return { tokens: 0, note: "" };
    const m = book.chatModel(modelId);
    const r = imageCost(m, img);
    if (!r.supported) book.alert(`images:${m.id}`, { kind: "unverified", message: r.formula });
    return { tokens: r.perCall / book.tokenizerMultiplier(modelId), note: r.supported ? ` · ${r.formula}` : "" };
  };

  /** Built-in tool fees: a catalogue price or the user's own price per 1,000 calls, times calls per task (or per chat turn). */
  const toolFeeLines = (fees: readonly import("./project.js").ToolFee[], volume: number): Line[] =>
    fees.flatMap((f, i): Line[] => {
      if (f.unitPriceId !== undefined) {
        const u = book.unit(f.unitPriceId);
        return [unit(`fee-${f.unitPriceId}`, `${w.label}: ${f.label ?? u.label}`, f.unitPriceId, (volume * f.perTask) / unitDivisor(u.unit))];
      }
      const price = f.cadPer1KCalls ?? 0;
      const label = f.label ?? "Tool calls";
      return [line({ id: `${id}:fee-own-${i}`, componentId: id, label: `${w.label}: ${label}`, stream: "run", behaviour: "usage", meter: `cad:tool:${i}`, quantity: (volume * f.perTask) / 1000, unit: "1K calls", unitPrice: price,
        formula: `${fmtInt(volume * f.perTask)} calls × CAD ${price} per 1K (your own price)` })];
    });

  /**
   * PTU mode and the TPM quota check for chat, llm and agent workloads (E8). With `ptu`, the workload's main-model load moves
   * onto provisioned capacity: one fixed PTU line at the workload's own deployment rate, plus the share that spills past the
   * capacity at pay-as-you-go. `ptus` absent sizes for the peak (average × peak-to-average), which leaves no spillover.
   * Spill share defaults to the part of average load above capacity. It is fixed at full-adoption volume, so ramp months
   * over-bill spillover slightly. Batch lines never run on provisioned capacity and are left alone.
   */
  const capacity = (cw: Extract<Workload, { kind: "chat" | "llm" | "agent" }>, modelId: string, lines: Line[]): Line[] => {
    if (!cw.ptu && cw.tpmQuota === undefined) return lines;
    const cat = book.catalog;
    const deployment = book.settings.azureDeployment;
    const peakX = A.peakToAverage;
    const onModel = (l: Line) => l.meter === modelId && l.stream === "run" && l.tokens !== undefined && (!l.tier || l.tier === "standard");
    const total = { input: 0, cachedInput: 0, output: 0 };
    for (const l of lines) if (onModel(l)) {
      total.input += l.tokens!.input * l.quantity; total.cachedInput += l.tokens!.cachedInput * l.quantity; total.output += l.tokens!.output * l.quantity;
    }
    const avg = { input: total.input / MINUTES_PER_MONTH, cachedInput: total.cachedInput / MINUTES_PER_MONTH, output: total.output / MINUTES_PER_MONTH };
    const modelLabel = book.chatModel(modelId).label;
    let out = lines;
    let spill = 1;
    if (cw.ptu) {
      const t = cat.ptu.models.find((m) => m.modelId === modelId);
      if (!t) {
        book.alert(`ptu-model:${id}`, { kind: "capacity", message: `${cw.label}: ${modelLabel} is not offered on provisioned throughput, so it stays pay-as-you-go` });
      } else {
        const need = sizePtu(cat, modelId, { input: avg.input * peakX, cachedInput: avg.cachedInput * peakX, output: avg.output * peakX }, deployment)!;
        const requested = cw.ptu.ptus ?? need.ptus;
        const ptus = Math.max(need.min, requested);
        if (requested < need.min) book.alert(`ptu-min:${id}`, { kind: "capacity", message: `${cw.label}: ${requested} PTUs is below the ${need.min}-PTU minimum for ${modelLabel} on ${DEPLOYMENT_LABEL[deployment]}; priced at ${need.min}` });
        const capacityTpm = ptus * need.inputTpmPerPtu;
        const avgNorm = avg.input + avg.output * need.outputRatio;
        const defaultSpill = avgNorm > 0 ? Math.max(0, 1 - capacityTpm / avgNorm) : 0;
        spill = cw.ptu.spilloverShare ?? defaultSpill;
        if (cw.ptu.ptus !== undefined && capacityTpm < need.normTpm) {
          book.alert(`ptu-peak:${id}`, { kind: "capacity", message: `${cw.label}: ${ptus} PTUs cover ${Math.round((capacityTpm / need.normTpm) * 100)}% of the peak load (${peakX}× average); peaks above that get throttled or spill to pay-as-you-go` });
        }
        const rate = cat.ptu.rates[deployment];
        const perPtu = cw.ptu.term === "hourly" ? rate.hourly * HOURS_PER_MONTH : cw.ptu.term === "yearly" ? rate.yearlyReservationPerMonth : rate.monthlyReservation;
        const termLabel = cw.ptu.term === "hourly" ? "hourly" : cw.ptu.term === "yearly" ? "1-year reservation" : "1-month reservation";
        const base = line({ id: `${id}:ptu`, componentId: id, label: `${cw.label}: provisioned throughput (${ptus} PTU, ${termLabel})`, stream: "run", behaviour: "fixed", meter: `ptu:${modelId}`, quantity: ptus, unit: "PTU-month", unitPrice: perPtu,
          formula: `${ptus} PTUs × CAD ${perPtu.toFixed(2)} per PTU-month (${termLabel}, ${DEPLOYMENT_LABEL[deployment]}) on ${modelLabel}; ${Math.round(Math.min(1, capacityTpm / Math.max(avgNorm, 1)) * 100)}% of average load fits` });
        const rest: Line[] = [];
        for (const l of lines) {
          if (!onModel(l)) { rest.push(l); continue; }
          if (spill <= 0) continue;
          rest.push({ ...l, label: `${l.label} (pay-as-you-go spillover)`, quantity: l.quantity * spill, cost: l.cost * spill, onPtu: true,
            formula: `${Math.round(spill * 100)}% of the load spills past the provisioned capacity: ${l.formula}` });
        }
        out = [base, ...rest];
      }
    }
    if (cw.tpmQuota !== undefined) {
      const share = cw.ptu ? spill : 1;
      const peakTpm = (avg.input + avg.cachedInput + avg.output) * share * peakX;
      if (peakTpm > cw.tpmQuota) {
        book.alert(`quota:${id}`, { kind: "quota", message: `${cw.label}: peak about ${fmtInt(peakTpm)} tokens a minute on ${modelLabel} (${peakX}× average) is over your ${fmtInt(cw.tpmQuota)} TPM quota. Ask for more quota or split the load across deployments` });
      }
    }
    return out;
  };

  switch (w.kind) {
    case "transcription": {
      const rate = book.speechPerHour(w.engineId, date, w.diarize);
      const out: Line[] = [line({ id: `${id}:stt`, componentId: id, label: w.label, stream: "run", behaviour: "usage", meter: w.engineId, quantity: w.hoursPerMonth, unit: "audio hour", unitPrice: rate, formula: `${fmtInt(w.hoursPerMonth)} h × CAD ${rate.toFixed(3)}/h` })];
      if (w.summary) {
        const transcript = H.speech.wordsPerMinute * 60 * H.tokens.perWord * (1 + (w.diarize ? H.speech.diarizationOverhead.names : 0));
        const outTok = w.summary.outputTokens + reasoningOut(book, w.summary.modelId, w.summary.reasoning);
        out.push(...llm("summary", `${w.label}: summaries`, w.summary.modelId, w.hoursPerMonth, transcript + H.chat.systemPrompt, 0, outTok));
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
        out.push(...llm("direct", `${w.label}: direct to model`, w.route.modelId, w.pagesPerMonth, perPage, 0, w.route.outputTokens));
      }
      if (w.warehouse) out.push(warehouseLine(id, w.label, w.warehouse, book, "usage"));
      if (w.enrich) {
        const docs = w.pagesPerMonth / w.enrich.pagesPerDoc;
        const inTok = tokensForPages(w.enrich.pagesPerDoc, w.pageType) * H.pages.layoutMarkdownOverhead + H.chat.systemPrompt;
        const outTok = w.enrich.outputTokensPerDoc + reasoningOut(book, w.enrich.modelId, w.enrich.reasoning);
        out.push(...llm("enrich", `${w.label}: enrichment`, w.enrich.modelId, docs, inTok, 0, outTok));
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
        const outTok = w.triage.outputTokens + reasoningOut(book, w.triage.modelId, w.triage.reasoning);
        out.push(...llm("triage", `${w.label}: triage`, w.triage.modelId, w.emailsPerMonth, inTok, 0, outTok));
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
        const outTok = A.plannerOutputTokens + reasoningOut(book, a.plannerModelId, a.reasoning);
        out.push(...llm("planner", `${w.label}: query planning`, a.plannerModelId, w.queriesPerMonth, A.plannerInputTokens, 0, outTok));
      }
      return out;
    }
    case "chat": {
      const resend = 1 + (w.resendShare ?? 0);
      const turnsMonth = w.users * w.conversationsPerUser * w.turns * resend;
      const perTurn = w.userTurnTokens + w.assistantTurnTokens;
      // Average prompt over a conversation: history grows by one exchange per turn.
      const avgHistory = ((w.turns - 1) / 2) * perTurn;
      const basePrompt = w.systemPromptTokens + H.chat.ragTemplate + w.topK * w.chunkTokens + w.userTurnTokens;
      const prompt = basePrompt + avgHistory;
      const cached = Math.min(prompt, w.systemPromptTokens + avgHistory) * w.cacheHit;
      // The system prompt is written to cache once per conversation (the first turn); later turns read it back (above). Averaged per call since turns are blended into one line.
      const write = w.cacheHit > 0 ? w.systemPromptTokens / w.turns : 0;
      const split = w.router?.share ?? 0;
      const lang = languageFactor(w, c) * tokenSpread(c.percentile);
      const outTok = (w.assistantTurnTokens + reasoningOut(book, w.modelId, w.reasoning)) * lang;
      const mainCalls = turnsMonth * (1 - split);
      const img = imageInput(w.modelId, w.images);
      // Late turns can cross the model's long-context threshold even though the conversation's average prompt doesn't (E6): bill the share of turns at/after that point at the long-context rate.
      const lc = book.chatModel(w.modelId).longContext;
      let out: Line[];
      if (lc && w.turns > 1 && basePrompt + (w.turns - 1) * perTurn > lc.threshold) {
        const crossesAt = Math.max(1, Math.ceil((lc.threshold - basePrompt) / perTurn) + 1);
        const shareOver = Math.max(0, Math.min(1, (w.turns - crossesAt + 1) / w.turns));
        const overPrompt = basePrompt + (w.turns - 1) * perTurn;
        out = [];
        const belowCalls = mainCalls * (1 - shareOver), aboveCalls = mainCalls * shareOver;
        if (belowCalls > 0) out.push(...llm("main", w.label, w.modelId, belowCalls, (prompt - cached - write) * lang + img.tokens, cached * lang, outTok, "usage", 0, write * lang, img.note));
        if (aboveCalls > 0) out.push(...llm("main-longctx", `${w.label}: long-context turns`, w.modelId, aboveCalls, (overPrompt - cached - write) * lang + img.tokens, cached * lang, outTok, "usage", 0, write * lang, img.note));
      } else {
        out = llm("main", w.label, w.modelId, mainCalls, (prompt - cached - write) * lang + img.tokens, cached * lang, outTok, "usage", 0, write * lang, img.note);
      }
      if (w.router && split > 0) {
        const imgR = imageInput(w.router.modelId, w.images);
        out.push(...llm("routed", `${w.label}: routed turns`, w.router.modelId, turnsMonth * split, (prompt - cached - write) * lang + imgR.tokens, cached * lang, outTok, "usage", 0, write * lang, imgR.note));
      }
      if (w.promptShields) out.push(...shieldLines(turnsMonth, (w.userTurnTokens + w.topK * w.chunkTokens) * 4));
      if (w.toolFees?.length) out.push(...toolFeeLines(w.toolFees, turnsMonth));
      return capacity(w, w.modelId, out);
    }
    case "agent": {
      const h = c.harnesses.get(w.harnessId);
      if (!h) throw new Error(`Workload ${id} references unknown harness ${w.harnessId}`);
      // At high enough production volume, tasks run close enough together to keep the harness's static prefix warm across tasks (E4).
      const warmPrefix = w.tasksPerMonth >= H.agents.warmPrefix.tasksPerMonthThreshold ? H.agents.warmPrefix.share : 0;
      const r = simulateHarness(h, book, { modelId: w.modelId, cacheHit: w.cacheHit, warmPrefix, percentile: c.percentile, date });
      const out = [line({ id: `${id}:runs`, componentId: id, label: w.label, stream: "run", behaviour: "usage", meter: w.modelId, quantity: w.tasksPerMonth, unit: "task", unitPrice: r.cost, deployment: book.settings.azureDeployment,
        tokens: { input: r.inputTokens, cachedInput: r.cachedTokens, output: r.outputTokens, cacheWrite: r.cacheWriteTokens },
        formula: `${fmtInt(w.tasksPerMonth)} tasks × ${r.steps} steps · ${fmtInt(r.inputTokens + r.cachedTokens + r.cacheWriteTokens)} in (${fmtInt(r.cachedTokens)} cached, ${fmtInt(r.cacheWriteTokens)} written) + ${fmtInt(r.outputTokens)} out per task at ${c.percentile.toUpperCase()}` })];
      out.push(...toolFeeLines(w.toolFees, w.tasksPerMonth));
      return capacity(w, w.modelId, out);
    }
    case "continuousEval": {
      const n = w.interactionsPerMonth * w.sampleShare;
      return evaluationLines(id, w.label, "run", n, w.judgeModelId, w.evaluators, 100, w.contextTokens, w.responseTokens, w.safetyEvaluators, book, date);
    }
    case "contentSafety": {
      const records = w.requestsPerMonth * Math.ceil(w.charsPerRequest / 1000);
      return w.unitPriceIds.map((u) => unit(u, `${w.label}: ${book.unit(u).label}`, u, records / 1000));
    }
    case "llm": {
      const lang = languageFactor(w, c) * tokenSpread(c.percentile);
      const outTok = (w.outputTokens + reasoningOut(book, w.modelId, w.reasoning)) * lang;
      const calls = w.callsPerMonth * (1 + (w.resendShare ?? 0));
      const img = imageInput(w.modelId, w.images);
      return capacity(w, w.modelId, [...llm("calls", w.label, w.modelId, calls, w.inputTokens * lang + img.tokens, w.cachedInputTokens * lang, outTok, "usage", w.batchShare, 0, img.note), ...(w.promptShields ? shieldLines(calls, w.inputTokens * 4) : [])]);
    }
    case "fixed":
      return w.items.map((it) => (isCashItem(it)
        ? cashLine(`${id}:${it.id}`, id, it, "platform")
        : unit(it.id, it.label, it.unitPriceId, it.quantity, "fixed", "platform")));
    case "hosting": {
      const volume = (w.volumeFrom !== undefined ? c.volumes?.get(w.volumeFrom) : undefined) ?? w.requestsPerMonth;
      return w.items.map((it): Line => {
        if (it.basis === "cash") return cashLine(`${id}:${it.id}`, id, { id: it.id, label: `${w.label}: ${it.label}`, amountCad: it.amountCad, cadence: "monthly" }, "platform");
        if (it.basis === "fixed") return { ...unit(it.id, `${w.label}: ${it.label}`, it.unitPriceId, it.quantity, "fixed", "platform") };
        const qty = (volume / 1000) * it.unitsPer1KRequests;
        const l = unit(it.id, `${w.label}: ${it.label}`, it.unitPriceId, qty, "usage", "platform");
        return { ...l, formula: `${fmtInt(volume)} requests × ${it.unitsPer1KRequests} ${book.unit(it.unitPriceId).unit} per 1K requests at CAD ${l.unitPrice.toFixed(4)}` };
      });
    }
    case "voiceAgent": {
      const v = voiceCall(w, book, { input: A.voiceFunctionCallInputTokens, output: A.voiceFunctionCallOutputTokens });
      const out = [line({ id: `${id}:realtime`, componentId: id, label: `${w.label}: ${book.realtimeModel(w.modelId).label}`, stream: "run", behaviour: "usage", meter: w.modelId, quantity: w.callsPerMonth, unit: "call", unitPrice: v.cost,
        formula: `${fmtInt(w.callsPerMonth)} calls × ${w.minutesPerCall} min, ${w.turnsPerCall} turns · ${fmtInt(v.audioIn)} audio in (${fmtInt(v.cachedAudio)} cached) + ${fmtInt(v.audioOut)} audio out + ${fmtInt(v.textIn)} text in per call` })];
      if (w.telephonyPerMinute > 0) out.push(line({ id: `${id}:telephony`, componentId: id, label: `${w.label}: telephony`, stream: "run", behaviour: "usage", meter: "telephony", quantity: w.callsPerMonth * w.minutesPerCall, unit: "minute", unitPrice: w.telephonyPerMinute, formula: `${fmtInt(w.callsPerMonth * w.minutesPerCall)} minutes × CAD ${w.telephonyPerMinute}` }));
      return out;
    }
    case "snowflakeComplete": {
      const m = book.chatModel(w.modelId);
      if (m.platform !== "snowflake") throw new Error(`${w.label}: ${m.label} is not a Snowflake Cortex model`);
      return [...llm("complete", `${w.label}: AI_COMPLETE`, w.modelId, w.rowsPerMonth, w.inputTokens, 0, w.outputTokens), warehouseLine(id, w.label, w.warehouse, book, "usage")];
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
export function voiceCall(w: Extract<Workload, { kind: "voiceAgent" }>, book: PriceBook, functionCall: { input: number; output: number } = { input: 0, output: 0 }) {
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
  // Tool (function) calling adds text tokens each turn: the call and its result in, the call out.
  const fcIn = functionCall.input * w.turnsPerCall, fcOut = functionCall.output * w.turnsPerCall;
  const cost = (audioIn * m.audio.input + cachedAudio * m.audio.cachedInput + audioOut * m.audio.output + (textIn + fcIn) * m.text.input + cachedText * m.text.cachedInput + fcOut * m.text.output) / 1e6;
  return { cost, audioIn, cachedAudio, audioOut, textIn };
}

/**
 * The same call as a cascade: speech-to-text on the caller's audio, an LLM turn per exchange
 * on the transcript, and text-to-speech for the agent's words.
 */
export function cascadeCall(w: Extract<Workload, { kind: "voiceAgent" }>, book: PriceBook, date: string, o: { sttId: string; llmId: string; ttsId: string }, functionCall: { input: number; output: number } = { input: 0, output: 0 }) {
  const H = heuristics;
  const callerMin = w.minutesPerCall * (1 - w.agentTalkShare), agentMin = w.minutesPerCall * w.agentTalkShare;
  const stt = (callerMin / 60) * book.speechPerHour(o.sttId, date);
  const wordsPerTurnCaller = (callerMin * H.speech.wordsPerMinute) / w.turnsPerCall, wordsPerTurnAgent = (agentMin * H.speech.wordsPerMinute) / w.turnsPerCall;
  // Words→tokens, then the LLM model's own tokenizer multiplier (E5): Claude tokenizes the same transcript into more tokens.
  const tk = H.tokens.perWord * book.tokenizerMultiplier(o.llmId);
  let llm = 0, history = 0;
  for (let t = 1; t <= w.turnsPerCall; t++) {
    const prompt = w.systemPromptTokens + history + wordsPerTurnCaller * tk;
    const cached = (w.systemPromptTokens + history) * (t === 1 ? 0 : w.cacheHit);
    llm += book.chatCost(o.llmId, { input: prompt - cached + functionCall.input, cachedInput: cached, output: wordsPerTurnAgent * tk + functionCall.output }, date);
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
