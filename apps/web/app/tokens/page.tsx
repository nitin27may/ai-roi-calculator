"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { heuristics } from "@roi-calculator/catalog";
import { creditSummary, DEFAULT_HARNESS, FILE_TYPES, IMAGE_SIZES, PriceBook, fileTokens, fileType, simulateHarness, uniqueId, workloadLines, type FileInput, type HarnessDef, type Workload } from "@roi-calculator/engine";
import { useRouter } from "next/navigation";
import { Bar, Card, CardHead, Field, NumberInput, Pill, Seg, Select } from "@/components/ui";
import { catalog, modelOptions } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";
import { Explain } from "@/components/explain";
import { TokenGuide } from "@/components/token-guide";
import { DEFAULT_SHEET, STOP_TEXT, agentGuide, fileGuide } from "@/lib/walkthrough";

type Mode = "text" | "docs" | "audio" | "agent";

export default function Tokens() {
  const [mode, setMode] = useState<Mode>("docs");
  const modeSwitch = <Seg label="Input type" value={mode} onChange={setMode} options={[{ value: "text", label: "Text" }, { value: "docs", label: "Documents" }, { value: "audio", label: "Audio" }, { value: "agent", label: "Agent run" }]} />;
  return mode === "text" ? <TextCount top={modeSwitch} /> : mode === "docs" ? <Docs top={modeSwitch} /> : mode === "audio" ? <Audio top={modeSwitch} /> : <AgentRun top={modeSwitch} />;
}

type NewWorkload = Workload extends infer W ? (W extends { id: string } ? Omit<W, "id"> : never) : never;

/** Adds a workload to the open project and shows it on the Run page. */
function useAddToProject() {
  const edit = useStudio((s) => s.edit);
  const name = useStudio((s) => s.project.name);
  const router = useRouter();
  const add = (w: NewWorkload, harness?: HarnessDef) => {
    let id = "";
    edit((d) => {
      let wl = w;
      if (harness) { const hid = uniqueId(d, "agent"); d.harnesses.push({ ...harness, id: hid }); wl = { ...w, harnessId: hid } as NewWorkload; }
      id = uniqueId(d, wl.kind);
      d.workloads.push({ ...wl, id } as Workload);
    });
    if (id) { useStudio.setState({ focus: id }); router.push("/run"); }
  };
  return { add, name };
}

function AddButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="whitespace-nowrap min-h-6 rounded border border-line px-2 text-xs hover:bg-surface-2" onClick={onClick}>Add</button>;
}

/** Inputs on the left (with the mode switch), results on the right. */
function Split({ top, inputs, children }: { top: ReactNode; inputs: ReactNode; children: ReactNode }) {
  const projectName = useStudio((s) => s.project.name);
  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Card>
        <CardHead title="What are you estimating?" sub="A quick calculation without a project" />
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-3.5 pb-3.5">
          {top}
          <div className="flex flex-col gap-2.5">{inputs}</div>
          <p className="text-xs text-muted"><b className="text-ink-2">Add</b> on any result puts it in <b className="text-ink-2">{projectName}</b> as a monthly workload; adjust the volume on the Run page.</p>
          <p className="mt-auto text-xs text-muted">Every route uses Azure (Foundry, Speech, Document Intelligence, Content Understanding) or Snowflake Cortex, priced in CAD from the local catalogue.</p>
        </div>
      </Card>
      <Card>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto scroll-hint p-3.5">{children}</div>
      </Card>
    </div>
  );
}

function useBook() {
  const settings = useStudio((s) => s.project.settings);
  return useMemo(() => new PriceBook(catalog, settings), [settings]);
}

function TextCount({ top }: { top: ReactNode }) {
  const { add } = useAddToProject();
  const [text, setText] = useState("Please summarise the attached supplier agreement, list renewal dates and termination clauses, and flag indemnity terms that differ from our standard template.");
  const [count, setCount] = useState<((s: string) => number) | null>(null);
  useEffect(() => { import("gpt-tokenizer/encoding/o200k_base").then((m) => setCount(() => m.countTokens)); }, []);
  const book = useBook();
  const base = count ? count(text) : Math.round(text.length / heuristics.tokens.charsPerToken);
  const models = ["gpt-5.4", "gpt-5.4-mini", "claude-sonnet-5-5", "claude-haiku-4-5", "sf:openai-gpt-5.4", "sf:claude-sonnet-4-5"];
  return (
    <Split top={top} inputs={<textarea aria-label="Text to count" className="min-h-[220px] w-full rounded-md border border-line bg-surface-2 p-2 text-[13px]" value={text} onChange={(e) => setText(e.target.value)} />}>
      <h2 className="text-base font-bold">Count tokens</h2>
      <div className="text-xs text-muted">{fmt(text.length)} characters · o200k count is {count ? "exact (in-browser tokenizer)" : "estimated while the tokenizer loads"}; other families apply a multiplier.</div>
      <table className="data">
        <thead><tr><th>Model</th><th>Tokenizer</th><th className="n">Tokens</th><th className="n">CAD per 1,000 calls (input)</th><th /></tr></thead>
        <tbody>
          {models.map((id) => {
            const m = book.chatModel(id), t = Math.round(base * book.tokenizerMultiplier(id));
            return <tr key={id}><td>{m.label}</td><td>{m.tokenizer} ×{book.tokenizerMultiplier(id).toFixed(2)}</td><td className="n">{fmt(t)}</td><td className="n">{cad(book.chatCost(id, { input: t * 1000, output: 0 }, catalog.meta.asOf), 2)}{m.platform === "snowflake" && <div className="text-xs text-muted">{fmt(book.chatCost(id, { input: t * 1000, output: 0 }, catalog.meta.asOf) / book.aiCreditCad())} AI credits at {cad(book.aiCreditCad(), 2)}</div>}</td><td><AddButton onClick={() => add(m.platform === "snowflake"
              ? { kind: "snowflakeComplete", label: `AI_COMPLETE on ${m.label}`, modelId: id, rowsPerMonth: 10000, inputTokens: base, outputTokens: 300, warehouse: { size: "m", hoursPerMonth: 10 } }
              : { kind: "llm", label: `LLM calls on ${m.label}`, callsPerMonth: 10000, modelId: id, inputTokens: base, cachedInputTokens: 0, outputTokens: 300, batchShare: 0, reasoning: "none" })} /></td></tr>;
          })}
        </tbody>
      </table>
    </Split>
  );
}

function Docs({ top }: { top: ReactNode }) {
  const book = useBook();
  const settings = useStudio((s) => s.project.settings);
  const { add } = useAddToProject();
  const [file, setFile] = useState<FileInput>({ fileType: "pdf", pages: 10, imagesPerPage: 2, sizeId: "photo", detail: "high" });
  const [summaryModel, setSummaryModel] = useState("gpt-5.4-mini");
  const [readModel, setReadModel] = useState("gpt-5.4");
  const set = (p: Partial<FileInput>) => setFile((f) => ({ ...f, ...p }));
  const ft = fileType(file.fileType);
  const imageOnly = file.fileType === "image";
  const pages = file.pages;
  const pageType = ft.pageType ?? "plain";
  const date = catalog.meta.asOf, out = 1500;
  // The direct route already bills one page image per page; a picture-only file is that image, so only embedded pictures are added on top.
  const size = IMAGE_SIZES.find((x) => x.id === file.sizeId) ?? IMAGE_SIZES[1];
  const images = !imageOnly && file.imagesPerPage > 0 ? { perCall: file.imagesPerPage, widthPx: size.widthPx, heightPx: size.heightPx, detail: file.detail } : undefined;
  const routes = useMemo(() => {
    const harnesses = new Map();
    const run = (w: Workload) => workloadLines(w, { book, date, harnesses, percentile: "p50" });
    const sum = (w: Workload) => run(w).reduce((s, l) => s + l.cost, 0);
    const enrich = (modelId: string) => ({ modelId, pagesPerDoc: pages, outputTokensPerDoc: out, reasoning: "none" as const });
    const extract = (extractorId: string, modelId: string): Workload => ({ kind: "documents", id: "q", label: "q", pagesPerMonth: pages, pageType, route: { type: "extract", extractorId, addOnIds: [] }, enrich: enrich(modelId) });
    const direct = (modelId: string): Workload => ({ kind: "documents", id: "q", label: "q", pagesPerMonth: pages, pageType, route: { type: "direct", modelId, outputTokens: 50 }, ...(images ? { images } : {}) });
    const rows = [
      ...["di-read", "di-layout", "cu-doc-basic", "cu-doc-standard"].map((x) => ({ route: `${book.unit(x).label} → ${book.chatModel(summaryModel).label}`, via: "Azure", cost: sum(extract(x, summaryModel)), tag: book.unit(x).confidence, w: extract(x, summaryModel), make: () => ({ ...extract(x, summaryModel), label: `Documents: ${book.unit(x).label}` }) })),
      ...["gpt-5.4", "gpt-5.4-mini", "claude-sonnet-5-5", "claude-opus-5-5"].map((m) => ({ route: `${imageOnly ? "Images" : "PDF"} straight to ${book.chatModel(m).label}`, via: "Azure", cost: sum(direct(m)) + book.chatCost(m, { input: 0, output: out * book.tokenizerMultiplier(m) }, date), tag: "", w: direct(m), make: () => ({ ...direct(m), label: `Documents: straight to ${book.chatModel(m).label}` }) })),
      ...["sf-parse-ocr", "sf-parse-layout"].map((x) => ({ route: `${book.unit(x).label} → GPT-5.4 (Snowflake)`, via: "Snowflake", cost: sum(extract(x, "sf:openai-gpt-5.4")), tag: "plus warehouse time", w: extract(x, "sf:openai-gpt-5.4"), make: () => ({ ...extract(x, "sf:openai-gpt-5.4"), label: `Documents: ${book.unit(x).label}`, warehouse: { size: "m" as const, hoursPerMonth: 5 } }) })),
    ];
    return rows.sort((a, b) => a.cost - b.cost).map((r) => ({ ...r, lines: run({ ...r.w, label: r.route } as Workload) }));
  }, [book, pages, pageType, summaryModel, date, images, imageOnly]);
  const max = Math.max(...routes.map((r) => r.cost));
  const cheapest = routes[0]!;
  const breakdown = ["gpt-5.4", "gpt-5.4-mini", "gpt-4o", "claude-sonnet-5-5", "claude-opus-5-5", "llama-4-maverick"].filter((id) => catalog.chatModels.some((m) => m.id === id)).map((id) => ({ id, m: book.chatModel(id), t: fileTokens(book.chatModel(id), book.tokenizerMultiplier(id), file) }));
  const guide = useMemo(() => fileGuide(catalog, settings, readModel, file), [settings, readModel, file]);
  const unitName = ft.unit === "image" ? "image" : ft.unit;
  return (
    <Split top={top} inputs={<>
        <Field label="File type" help="tokFileType"><Select value={file.fileType} options={FILE_TYPES.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => set({ fileType: v as FileInput["fileType"] })} /></Field>
        <Field label={`Number of ${unitName}s`} help="tokPages"><NumberInput value={pages} min={1} onChange={(v) => set({ pages: v })} /></Field>
        {!imageOnly && <Field label="Pictures on each page" help="tokImagesPerPage"><NumberInput value={file.imagesPerPage} min={0} max={100} onChange={(v) => set({ imagesPerPage: v })} /></Field>}
        {(imageOnly || file.imagesPerPage > 0) && <>
          <Field label="Picture size" help="tokImageSize"><Select value={file.sizeId} options={IMAGE_SIZES.map((x) => ({ value: x.id, label: x.label }))} onChange={(v) => set({ sizeId: v as FileInput["sizeId"] })} /></Field>
          <Field label="Picture detail" help="tokImageDetail"><Select value={file.detail} options={[{ value: "high", label: "High (charged by size)" }, { value: "low", label: "Low (small fixed cost)" }]} onChange={(v) => set({ detail: v as "low" | "high" })} /></Field>
        </>}
        <Field label="Summarize with" help="tokSummaryModel"><Select value={summaryModel} options={modelOptions((m) => m.platform === "azure")} onChange={setSummaryModel} /></Field>
        <Field label="Worked example model" help="docModel"><Select value={readModel} options={modelOptions((m) => m.platform === "azure")} onChange={setReadModel} /></Field>
      </>}>
      <div><h2 className="text-base font-bold">Read and summarize {fmt(pages)} {unitName}{pages === 1 ? "" : "s"}</h2><div className="text-xs text-muted">{ft.note} Cheapest first.</div></div>
      <h3 className="text-sm font-semibold">Tokens in one file, text and pictures counted separately</h3>
      <table className="data">
        <thead><tr><th>Model</th><th className="n">Text tokens</th><th className="n">Picture tokens</th><th className="n">Total</th></tr></thead>
        <tbody>{breakdown.map(({ id, m, t }) => (
          <tr key={id}><td>{m.label} {t.imagesTotal > 0 && !t.imageSupported && <Pill>unverified</Pill>}<div className="text-xs text-muted">{t.imagesTotal > 0 ? t.imageFormula : "No pictures entered"}</div></td><td className="n">{fmt(t.textTokens)}</td><td className="n">{t.imagesTotal > 0 && !t.imageSupported ? "no formula" : fmt(t.imageTokens)}</td><td className="n">{fmt(t.total)}</td></tr>
        ))}</tbody>
      </table>
      <table className="data">
        <thead><tr><th>Route</th><th>Via</th><th className="n">CAD</th><th className="w-[28%]" /><th /></tr></thead>
        <tbody>{routes.map((r) => <tr key={r.route}><td>{r.route} {r.tag === "unverified" && <Pill>unverified</Pill>}{r.tag === "plus warehouse time" && <Pill>+ warehouse</Pill>}</td><td>{r.via}</td><td className="n">{cad(r.cost, 2)}{creditSummary(r.lines).map((t) => <div key={t.type} className="text-xs text-muted">{fmt(t.credits)} {t.type === "ai" ? "AI" : "platform"} credits at {cad(t.cadPerCredit, 2)}</div>)}</td><td><div className="pt-1.5"><Bar ratio={r.cost / max} /></div></td><td><AddButton onClick={() => { const { id: _id, ...w } = r.make(); add(w as NewWorkload); }} /></td></tr>)}</tbody>
      </table>
      <p className="text-xs text-muted">Cheapest here: <b className="text-ink-2">{cheapest.route}</b>. Sending a PDF straight to a model bills extracted text plus an image of every page{images ? `, plus the ${fmt(file.imagesPerPage)} embedded picture${file.imagesPerPage === 1 ? "" : "s"} on each page` : ""}. Extracting first costs more per page on small models but keeps the text reusable for search and for repeated questions. Routes that extract text first do not send the pictures to the model.</p>
      <Explain title="How the cheapest route reads the file" lines={cheapest.lines} months={1} digits={4} />
      <TokenGuide guide={guide} />
    </Split>
  );
}

function Audio({ top }: { top: ReactNode }) {
  const book = useBook();
  const { add } = useAddToProject();
  const [hours, setHours] = useState(1);
  const [diarize, setDiarize] = useState(true);
  const date = catalog.meta.asOf;
  const rows = catalog.speechEngines.map((e) => ({ e, rate: book.speechPerHour(e.id, date, diarize) })).sort((a, b) => a.rate - b.rate);
  const max = Math.max(...rows.map((r) => r.rate));
  return (
    <Split top={top} inputs={<>
        <Field label="Audio hours" help="tokAudioHours"><NumberInput value={hours} min={0.1} step={0.5} onChange={setHours} /></Field>
        <Field label="Speaker diarization" help="diarize"><Select value={diarize ? "y" : "n"} options={[{ value: "y", label: "Yes" }, { value: "n", label: "No" }]} onChange={(v) => setDiarize(v === "y")} /></Field>
      </>}>
      <div><h2 className="text-base font-bold">Transcribe {fmt(hours, 1)} hour{hours === 1 ? "" : "s"} of audio</h2><div className="text-xs text-muted">About {fmt(hours * heuristics.speech.wordsPerMinute * 60)} words, or {fmt(hours * heuristics.speech.wordsPerMinute * 60 * heuristics.tokens.perWord)} transcript tokens. Prices as of {date}.</div></div>
      <table className="data">
        <thead><tr><th>Engine</th><th>Via</th><th className="n">CAD</th><th className="w-[28%]" /><th /></tr></thead>
        <tbody>{rows.map(({ e, rate }) => <tr key={e.id}><td>{e.label} {e.diarization === "none" && diarize && <Pill>no diarization</Pill>} {e.lifecycle.retiresOn && <Pill tone="crit">retires {e.lifecycle.retiresOn}</Pill>} {e.promo && <Pill tone="warn">promo to {e.promo.until}</Pill>}</td><td>{e.via}</td><td className="n">{cad(rate * hours, 2)}</td><td><div className="pt-1.5"><Bar ratio={rate / max} /></div></td><td><AddButton onClick={() => add({ kind: "transcription", label: `Transcription: ${e.label}`, hoursPerMonth: hours, engineId: e.id, diarize })} /></td></tr>)}</tbody>
      </table>
    </Split>
  );
}

function AgentRun({ top }: { top: ReactNode }) {
  const book = useBook();
  const settings = useStudio((s) => s.project.settings);
  const { add } = useAddToProject();
  const harnesses = useStudio((s) => s.project.harnesses);
  const [source, setSource] = useState<"here" | "project">("here");
  const [hid, setHid] = useState(harnesses[0]?.id ?? "");
  const [modelId, setModelId] = useState("gpt-5.4");
  const [cacheHit, setCacheHit] = useState(80);
  const [d, setD] = useState({ steps: 5, toolResultTokens: 412, codeTokensPerStep: 308, execOutputTokensPerStep: 100, maxTurns: 12, tokenBudget: 150_000 });
  const [readMode, setReadMode] = useState<"sample" | "whole">("sample");
  const upd = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const described = useMemo<HarnessDef>(() => ({ ...DEFAULT_HARNESS, id: "described", label: "Agent described here", systemPromptTokens: 1500, tools: 1, userInputTokens: 300, toolCallsPerStep: 1, outputPerStep: 80, finalOutputTokens: 500, ...d }), [d]);
  const useProject = source === "project" && harnesses.some((x) => x.id === hid);
  const h = useProject ? harnesses.find((x) => x.id === hid)! : described;
  const date = catalog.meta.asOf;
  const rows = (["p50", "p90", "worst"] as const).map((p) => ({ p, r: simulateHarness(h, book, { modelId, cacheHit: cacheHit / 100, percentile: p, date }) }));
  const fee = !useProject && h.codeTokensPerStep ? [{ unitPriceId: "code-interpreter", label: "Code interpreter session", perTask: 1 }] : [];
  const workload = { kind: "agent" as const, label: h.label, harnessId: h.id, modelId, tasksPerMonth: 1000, cacheHit: cacheHit / 100, toolFees: fee };
  const lines = useMemo(() => workloadLines({ ...workload, id: "q" } as Workload, { book, date, harnesses: new Map([[h.id, h]]), percentile: "p50" }), [book, date, h, modelId, cacheHit, fee.length]);
  const guide = useMemo(() => { try { return agentGuide(catalog, settings, { modelId, cacheHit: cacheHit / 100, values: { ...DEFAULT_SHEET, readMode } }); } catch { return null; } }, [settings, modelId, cacheHit, readMode]);
  return (
    <Split top={top} inputs={<>
        <Seg label="Agent source" value={source} onChange={setSource} options={[{ value: "here", label: "Describe it here" }, { value: "project", label: "Use a project agent" }]} />
        {source === "project" && (harnesses.length
          ? <Field label="Harness" help="harnessId"><Select value={hid} options={harnesses.map((x) => ({ value: x.id, label: x.label }))} onChange={setHid} /></Field>
          : <p className="text-xs text-muted">This project has no agent yet. Describe one here instead.</p>)}
        <Field label="Model" help="modelId"><Select value={modelId} options={modelOptions()} onChange={setModelId} /></Field>
        {!useProject && <>
          <Field label="Typical steps" help="steps"><NumberInput value={d.steps} min={1} onChange={(v) => upd({ steps: v })} /></Field>
          <Field label="Tool result per step" help="toolResultTokens"><NumberInput value={d.toolResultTokens} onChange={(v) => upd({ toolResultTokens: v })} suffix="tokens" /></Field>
          <Field label="Code written per step" help="codeTokensPerStep"><NumberInput value={d.codeTokensPerStep} onChange={(v) => upd({ codeTokensPerStep: v })} suffix="tokens" /></Field>
          <Field label="Code output per step" help="execOutputTokensPerStep"><NumberInput value={d.execOutputTokensPerStep} onChange={(v) => upd({ execOutputTokensPerStep: v })} suffix="tokens" /></Field>
          <Field label="Step cap" help="maxTurns"><NumberInput value={d.maxTurns} min={1} onChange={(v) => upd({ maxTurns: v })} /></Field>
          <Field label="Token budget (0 = none)" help="tokenBudget"><NumberInput value={d.tokenBudget} onChange={(v) => upd({ tokenBudget: v })} suffix="tokens" /></Field>
        </>}
        <Field label="Cache hit" help="cacheHit"><NumberInput value={cacheHit} max={100} suffix="%" onChange={setCacheHit} /></Field>
      </>}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">One run of {h.label}</h2><AddButton onClick={() => add(workload, useProject ? undefined : h)} /></div>
      <table className="data">
        <thead><tr><th>Estimate</th><th className="n">Steps</th><th className="n">Input</th><th className="n">Cached</th><th className="n">Output</th><th className="n">CAD</th><th>Stopped by</th></tr></thead>
        <tbody>{rows.map(({ p, r }) => <tr key={p}><td>{{ p50: "Typical (P50)", p90: "P90", worst: "Worst under caps" }[p]}</td><td className="n">{r.steps}</td><td className="n">{fmt(r.inputTokens)}</td><td className="n">{fmt(r.cachedTokens)}</td><td className="n">{fmt(r.outputTokens)}</td><td className="n">{cad(r.cost + fee.reduce((x) => x + book.unitPrice("code-interpreter"), 0), 3)}</td><td className="text-xs text-ink-2" title={STOP_TEXT[r.stopReason]}>{{ finished: "Finished", maxTurns: "Step cap", tokenBudget: "Token budget", contextWindow: "Context window" }[r.stopReason]}</td></tr>)}</tbody>
      </table>
      {fee.length > 0 && <p className="text-xs text-muted">CAD includes one code-interpreter session ({cad(book.unitPrice("code-interpreter"), 4)}). {STOP_TEXT[rows[0]!.r.stopReason]}</p>}
      <h3 className="text-sm font-semibold">Prompt size by step (P50)</h3>
      <div className="flex flex-col gap-1">
        {rows[0]!.r.trace.map((t) => (
          <div key={t.step} className="grid grid-cols-[48px_1fr_90px] items-center gap-2 text-xs">
            <span className="text-muted">Step {t.step}</span>
            <div className="flex h-3 overflow-hidden rounded bg-surface-2"><i className="bg-[var(--s1)]" style={{ width: `${(t.cachedTokens / rows[0]!.r.trace.at(-1)!.promptTokens) * 100}%` }} /><i className="bg-[var(--s2)]" style={{ width: `${((t.promptTokens - t.cachedTokens) / rows[0]!.r.trace.at(-1)!.promptTokens) * 100}%` }} /></div>
            <span className="num text-right">{fmt(t.promptTokens)} tok</span>
          </div>
        ))}
        <div className="flex gap-3 text-xs text-ink-2"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--s1)]" />cached</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--s2)]" />new input</span></div>
      </div>
      <Explain title="How 1,000 runs a month are priced on the Run page (a warm cache trims the first-call write)" lines={lines} months={1} digits={4} />
      {guide && <>
        <Seg label="How the worked example reads each tab" value={readMode} onChange={setReadMode} options={[{ value: "sample", label: "Sample rows" }, { value: "whole", label: "Whole tab" }]} />
        <TokenGuide guide={guide} heading="How this is calculated: a 10-tab workbook" />
      </>}
    </Split>
  );
}
