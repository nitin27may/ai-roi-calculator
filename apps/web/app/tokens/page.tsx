"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { heuristics } from "@studio/catalog";
import { PriceBook, simulateHarness, uniqueId, workloadLines, type Workload } from "@studio/engine";
import { useRouter } from "next/navigation";
import { Bar, Card, CardHead, Field, NumberInput, Pill, Seg, Select } from "@/components/ui";
import { catalog, modelOptions } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";

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
  const add = (w: NewWorkload) => {
    let id = "";
    edit((d) => { id = uniqueId(d, w.kind); d.workloads.push({ ...w, id } as Workload); });
    if (id) { useStudio.setState({ focus: id }); router.push("/run"); }
  };
  return { add, name };
}

function AddButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="whitespace-nowrap rounded border border-line px-1.5 text-xs hover:bg-surface-2" onClick={onClick}>Add</button>;
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
          <p className="text-[11.5px] text-muted"><b className="text-ink-2">Add</b> on any result puts it in <b className="text-ink-2">{projectName}</b> as a monthly workload; adjust the volume on the Run page.</p>
          <p className="mt-auto text-[11.5px] text-muted">Every route uses Azure (Foundry, Speech, Document Intelligence, Content Understanding) or Snowflake Cortex, priced in CAD from the local catalogue.</p>
        </div>
      </Card>
      <Card>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">{children}</div>
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
      <div className="text-[11.5px] text-muted">{fmt(text.length)} characters · o200k count is {count ? "exact (in-browser tokenizer)" : "estimated while the tokenizer loads"}; other families apply a multiplier.</div>
      <table className="data">
        <thead><tr><th>Model</th><th>Tokenizer</th><th className="n">Tokens</th><th className="n">CAD per 1,000 calls (input)</th><th /></tr></thead>
        <tbody>
          {models.map((id) => {
            const m = book.chatModel(id), t = Math.round(base * book.tokenizerMultiplier(id));
            return <tr key={id}><td>{m.label}</td><td>{m.tokenizer} ×{book.tokenizerMultiplier(id).toFixed(2)}</td><td className="n">{fmt(t)}</td><td className="n">{cad(book.chatCost(id, { input: t * 1000, output: 0 }, catalog.meta.asOf), 2)}</td><td><AddButton onClick={() => add(m.platform === "snowflake"
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
  const { add } = useAddToProject();
  const [pages, setPages] = useState(100);
  const [pageType, setPageType] = useState<"plain" | "dense" | "slide" | "spreadsheet">("dense");
  const [summaryModel, setSummaryModel] = useState("gpt-5.4-mini");
  const date = catalog.meta.asOf, out = 1500;
  const routes = useMemo(() => {
    const harnesses = new Map();
    const run = (w: Workload) => workloadLines(w, { book, date, harnesses, percentile: "p50" }).reduce((s, l) => s + l.cost, 0);
    const enrich = (modelId: string) => ({ modelId, pagesPerDoc: pages, outputTokensPerDoc: out, reasoning: "none" as const });
    const extract = (extractorId: string, modelId: string): Workload => ({ kind: "documents", id: "q", label: "q", pagesPerMonth: pages, pageType, route: { type: "extract", extractorId, addOnIds: [] }, enrich: enrich(modelId) });
    const direct = (modelId: string): Workload => ({ kind: "documents", id: "q", label: "q", pagesPerMonth: pages, pageType, route: { type: "direct", modelId, outputTokens: 50 } });
    const rows = [
      ...["di-read", "di-layout", "cu-doc-basic", "cu-doc-standard"].map((x) => ({ route: `${book.unit(x).label} → ${book.chatModel(summaryModel).label}`, via: "Azure", cost: run(extract(x, summaryModel)), tag: book.unit(x).confidence, make: () => ({ ...extract(x, summaryModel), label: `Documents: ${book.unit(x).label}` }) })),
      ...["gpt-5.4", "gpt-5.4-mini", "claude-sonnet-5-5", "claude-opus-5-5"].map((m) => ({ route: `PDF straight to ${book.chatModel(m).label}`, via: "Azure", cost: run(direct(m)) + book.chatCost(m, { input: 0, output: out * book.tokenizerMultiplier(m) }, date), tag: "", make: () => ({ ...direct(m), label: `Documents: straight to ${book.chatModel(m).label}` }) })),
      ...["sf-parse-ocr", "sf-parse-layout"].map((x) => ({ route: `${book.unit(x).label} → GPT-5.4 (Snowflake)`, via: "Snowflake", cost: run(extract(x, "sf:openai-gpt-5.4")), tag: "plus warehouse time", make: () => ({ ...extract(x, "sf:openai-gpt-5.4"), label: `Documents: ${book.unit(x).label}`, warehouse: { size: "m" as const, hoursPerMonth: 5 } }) })),
    ];
    return rows.sort((a, b) => a.cost - b.cost);
  }, [book, pages, pageType, summaryModel, date]);
  const max = Math.max(...routes.map((r) => r.cost));
  const words = heuristics.pages.wordsPerPage[pageType];
  const cheapest = routes[0]!;
  return (
    <Split top={top} inputs={<>
        <Field label="Pages"><NumberInput value={pages} min={1} onChange={setPages} /></Field>
        <Field label="Page type"><Select value={pageType} options={[["plain", "Plain (500 words)"], ["dense", "Dense PDF (700 words)"], ["slide", "Slide (40 words)"], ["spreadsheet", "Spreadsheet page"]].map(([value, label]) => ({ value: value!, label: label! }))} onChange={(v) => setPageType(v as typeof pageType)} /></Field>
        <Field label="Summarize with"><Select value={summaryModel} options={modelOptions((m) => m.platform === "azure")} onChange={setSummaryModel} /></Field>
      </>}>
      <div><h2 className="text-base font-bold">Read and summarize {fmt(pages)} pages</h2><div className="text-xs text-muted">About {fmt(pages * words)} words, or {fmt(pages * words * heuristics.tokens.perWord)} o200k tokens of text. Cheapest first.</div></div>
      <table className="data">
        <thead><tr><th>Route</th><th>Via</th><th className="n">CAD</th><th className="w-[28%]" /><th /></tr></thead>
        <tbody>{routes.map((r) => <tr key={r.route}><td>{r.route} {r.tag === "unverified" && <Pill>unverified</Pill>}{r.tag === "plus warehouse time" && <Pill>+ warehouse</Pill>}</td><td>{r.via}</td><td className="n">{cad(r.cost, 2)}</td><td><div className="pt-1.5"><Bar ratio={r.cost / max} /></div></td><td><AddButton onClick={() => { const { id: _id, ...w } = r.make(); add(w as NewWorkload); }} /></td></tr>)}</tbody>
      </table>
      <p className="text-[11.5px] text-muted">Cheapest here: <b className="text-ink-2">{cheapest.route}</b>. Sending a PDF straight to a model bills extracted text plus an image of every page, and Claude 4.7+ counts about 35% more tokens for the same text. Extracting first costs more per page on small models but keeps the text reusable for search and for repeated questions.</p>
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
        <Field label="Audio hours"><NumberInput value={hours} min={0.1} step={0.5} onChange={setHours} /></Field>
        <Field label="Speaker diarization"><Select value={diarize ? "y" : "n"} options={[{ value: "y", label: "Yes" }, { value: "n", label: "No" }]} onChange={(v) => setDiarize(v === "y")} /></Field>
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
  const { add } = useAddToProject();
  const harnesses = useStudio((s) => s.project.harnesses);
  const [hid, setHid] = useState(harnesses[0]?.id ?? "");
  const [modelId, setModelId] = useState("gpt-5.4");
  const [cacheHit, setCacheHit] = useState(80);
  const h = harnesses.find((x) => x.id === hid);
  if (!h) return <Split top={top} inputs={null}><p className="text-sm text-muted">Add an agent harness to a project first.</p></Split>;
  const date = catalog.meta.asOf;
  const rows = (["p50", "p90", "worst"] as const).map((p) => ({ p, r: simulateHarness(h, book, { modelId, cacheHit: cacheHit / 100, percentile: p, date }) }));
  return (
    <Split top={top} inputs={<>
        <Field label="Harness"><Select value={hid} options={harnesses.map((x) => ({ value: x.id, label: x.label }))} onChange={setHid} /></Field>
        <Field label="Model"><Select value={modelId} options={modelOptions()} onChange={setModelId} /></Field>
        <Field label="Cache hit"><NumberInput value={cacheHit} max={100} suffix="%" onChange={setCacheHit} /></Field>
      </>}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">One run of {h.label}</h2><AddButton onClick={() => add({ kind: "agent", label: h.label, harnessId: h.id, modelId, tasksPerMonth: 1000, cacheHit: cacheHit / 100, toolFees: [] })} /></div>
      <table className="data">
        <thead><tr><th>Estimate</th><th className="n">Steps</th><th className="n">Input</th><th className="n">Cached</th><th className="n">Output</th><th className="n">CAD</th></tr></thead>
        <tbody>{rows.map(({ p, r }) => <tr key={p}><td>{{ p50: "Typical (P50)", p90: "P90", worst: "Worst under caps" }[p]}</td><td className="n">{r.steps}</td><td className="n">{fmt(r.inputTokens)}</td><td className="n">{fmt(r.cachedTokens)}</td><td className="n">{fmt(r.outputTokens)}</td><td className="n">{cad(r.cost, 3)}</td></tr>)}</tbody>
      </table>
      <h3 className="text-sm font-semibold">Prompt size by step (P50)</h3>
      <div className="flex flex-col gap-1">
        {rows[0]!.r.trace.map((t) => (
          <div key={t.step} className="grid grid-cols-[48px_1fr_90px] items-center gap-2 text-xs">
            <span className="text-muted">Step {t.step}</span>
            <div className="flex h-3 overflow-hidden rounded bg-surface-2"><i className="bg-[var(--s1)]" style={{ width: `${(t.cachedTokens / rows[0]!.r.trace.at(-1)!.promptTokens) * 100}%` }} /><i className="bg-[var(--s2)]" style={{ width: `${((t.promptTokens - t.cachedTokens) / rows[0]!.r.trace.at(-1)!.promptTokens) * 100}%` }} /></div>
            <span className="num text-right">{fmt(t.promptTokens)} tok</span>
          </div>
        ))}
        <div className="flex gap-3 text-[11.5px] text-ink-2"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--s1)]" />cached</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--s2)]" />new input</span></div>
      </div>
    </Split>
  );
}
