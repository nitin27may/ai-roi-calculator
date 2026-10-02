"use client";
import { useEffect, useMemo, useState } from "react";
import { PriceBook, WORKLOAD_KINDS, cascadeCall, harnessUsage, newHarness, newWorkload, removeWorkload, simulateHarness, sizeSearch, voiceCall, type Workload } from "@studio/engine";
import { Card, CardHead, Field, GroupHead, ListRow, Pill, Seg, Select } from "@/components/ui";
import { Explain } from "@/components/explain";
import { AddMenu, ItemHeader } from "@/components/add-menu";
import { Fields, HARNESS_SPECS, WAREHOUSE_SPECS, WORKLOAD_SPECS } from "@/components/fields";
import { catalog, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";

const GROUP: Record<Workload["kind"], string> = {
  transcription: "Ingestion", documents: "Ingestion", email: "Ingestion", embeddings: "Retrieval", aiSearch: "Retrieval", retrieval: "Retrieval",
  chat: "Conversation", agent: "Agents", continuousEval: "Quality & safety", contentSafety: "Quality & safety", llm: "Other AI usage", fixed: "Platform",
  voiceAgent: "Voice", snowflakeComplete: "Snowflake", snowflakeFunction: "Snowflake", cortexSearch: "Snowflake",
};
const ORDER = ["Ingestion", "Retrieval", "Conversation", "Voice", "Agents", "Quality & safety", "Snowflake", "Other AI usage", "Platform"];

export default function Run() {
  const { project, ledger } = useLedger();
  const percentile = useStudio((s) => s.percentile);
  const setPercentile = useStudio((s) => s.setPercentile);
  const [sel, setSel] = useState(() => {
    const f = useStudio.getState().focus;
    if (f) useStudio.setState({ focus: null });
    return f ?? project.workloads[0]?.id ?? "maintenance";
  });
  const steady = ledger.months.find((m) => m.phase === "production" && m.adoption >= 1) ?? ledger.months.at(-1)!;
  const costOf = (id: string) => steady.lines.filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0);
  const groups = ORDER.map((g) => [g, project.workloads.filter((w) => GROUP[w.kind] === g)] as const).filter(([, ws]) => ws.length);

  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Card>
        <CardHead title="Production, per month" sub="At full adoption">
          <Seg label="Agent estimate" value={percentile} onChange={setPercentile} options={[{ value: "p50", label: "P50" }, { value: "p90", label: "P90" }, { value: "worst", label: "Worst" }]} />
        </CardHead>
        <div role="listbox" aria-label="Production workloads" className="min-h-0 flex-1 overflow-auto">
          {groups.map(([g, ws]) => (
            <div key={g}>
              <GroupHead>{g}</GroupHead>
              {ws.map((w) => {
                const usage = steady.lines.some((l) => l.componentId === w.id && l.behaviour === "usage");
                return <ListRow key={w.id} selected={sel === w.id} onClick={() => setSel(w.id)} title={w.label} sub={summary(w)} aside={<Pill>{usage ? "usage" : "fixed"}</Pill>} value={cad(costOf(w.id))} />;
              })}
            </div>
          ))}
          <div className="px-3.5 py-2.5"><AddWorkload onAdded={setSel} /></div>
          <GroupHead>Agent harnesses</GroupHead>
          {project.harnesses.map((h) => <ListRow key={h.id} selected={sel === `h:${h.id}`} onClick={() => setSel(`h:${h.id}`)} title={h.label} sub={`${h.tools} tools · ${h.steps} steps · max ${h.maxTurns} turns`} value="" />)}
          <div className="px-3.5 py-2.5"><AddHarness onAdded={(id) => setSel(`h:${id}`)} /></div>
          <GroupHead>Operations</GroupHead>
          <ListRow selected={sel === "maintenance"} onClick={() => setSel("maintenance")} title="Maintenance" sub={project.maintenance.mode === "team" ? "support team" : `${project.maintenance.pctPerYear}% of build per year`} aside={<Pill>fixed</Pill>} value={cad(ledger.totals.maintRate)} />
        </div>
      </Card>
      <Card>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">
          <Inspector sel={sel} onRemoved={() => setSel("maintenance")} />
        </div>
      </Card>
    </div>
  );
}

function summary(w: Workload): string {
  switch (w.kind) {
    case "transcription": return `${fmt(w.hoursPerMonth)} h · ${catalog.speechEngines.find((e) => e.id === w.engineId)?.label}`;
    case "documents": return `${fmt(w.pagesPerMonth)} pages · ${w.route.type === "extract" ? catalog.unitPrices.find((u) => u.id === (w.route as { extractorId: string }).extractorId)?.label : "direct to model"}`;
    case "email": return `${fmt(w.emailsPerMonth)} emails`;
    case "embeddings": return `${fmt(w.tokensPerMonth / 1e6)}M tokens`;
    case "aiSearch": return `${fmt(w.chunks)} chunks · ${w.replicas} replicas`;
    case "retrieval": return `${fmt(w.queriesPerMonth)} queries`;
    case "chat": return `${fmt(w.users)} users · ${w.modelId}`;
    case "agent": return `${fmt(w.tasksPerMonth)} tasks · ${w.modelId}`;
    case "continuousEval": return `${Math.round(w.sampleShare * 100)}% sampled · ${w.evaluators.length} evaluators`;
    case "contentSafety": return `${fmt(w.requestsPerMonth)} requests`;
    case "llm": return `${fmt(w.callsPerMonth)} calls · ${w.modelId}`;
    case "fixed": return w.items.map((i) => i.label).join(" · ");
    case "voiceAgent": return `${fmt(w.callsPerMonth)} calls × ${w.minutesPerCall} min · ${w.modelId}`;
    case "snowflakeComplete": return `${fmt(w.rowsPerMonth)} rows · ${w.modelId.replace(/^sf:/, "")}`;
    case "snowflakeFunction": return `${fmt(w.rowsPerMonth)} rows · ${catalog.unitPrices.find((u) => u.id === w.functionId)?.label}`;
    case "cortexSearch": return `${fmt(w.rows)} rows · ${w.changedShareMonthly * 100}% change monthly`;
  }
}

function AddHarness({ onAdded }: { onAdded: (id: string) => void }) {
  const edit = useStudio((s) => s.edit);
  return (
    <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
      onClick={() => { let id = ""; edit((d) => { const h = newHarness(d); id = h.id; d.harnesses.push(h); }); if (id) onAdded(id); }}>
      + Add harness
    </button>
  );
}

function AddWorkload({ onAdded }: { onAdded: (id: string) => void }) {
  const edit = useStudio((s) => s.edit);
  return (
    <AddMenu label="Add workload" items={WORKLOAD_KINDS} onPick={(kind) => {
      let id = "";
      edit((d) => { const w = newWorkload(d, kind); id = w.id; d.workloads.push(w); });
      if (id) onAdded(id);
    }} />
  );
}

function Inspector({ sel, onRemoved }: { sel: string; onRemoved: () => void }) {
  const edit = useStudio((s) => s.edit);
  const [blocked, setBlocked] = useState<string[]>([]);
  useEffect(() => setBlocked([]), [sel]);
  const { project, ledger } = useLedger();
  const percentile = useStudio((s) => s.percentile);
  const steady = ledger.months.find((m) => m.phase === "production" && m.adoption >= 1) ?? ledger.months.at(-1)!;
  if (sel === "maintenance") {
    return (
      <>
        <h2 className="text-base font-bold">Maintenance</h2>
        <div className="font-display text-[26px] font-bold">{cad(ledger.totals.maintRate)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">per month</span></div>
        <Explain title="How this is calculated" lines={steady.lines.filter((l) => l.stream === "maint")} months={1} />
      </>
    );
  }
  if (sel.startsWith("h:")) {
    const id = sel.slice(2), h = project.harnesses.find((x) => x.id === id);
    if (!h) return null;
    return (
      <>
        <ItemHeader label={h.label} sub="Shared by Build (bake-off, iterations, regression) and Run (agent workloads). Caps bound the worst case." removeLabel="Remove harness"
          onRename={(v) => edit((d) => { const x = d.harnesses.find((y) => y.id === id); if (x) x.label = v; })}
          onRemove={() => { const used = harnessUsage(project, id); if (used.length) { setBlocked(used); return; } edit((d) => { d.harnesses = d.harnesses.filter((y) => y.id !== id); }); onRemoved(); }} />
        {blocked.length > 0 && <div role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">This harness is still used by {blocked.join(", ")}. Point those at another harness first.</div>}
        <Fields specs={HARNESS_SPECS} value={h as unknown as Record<string, unknown>} locate={(d) => d.harnesses.find((x) => x.id === id) as unknown as Record<string, unknown>} />
        <HarnessTable harnessId={id} modelId={project.workloads.find((w) => w.kind === "agent" && w.harnessId === id)?.kind === "agent" ? (project.workloads.find((w) => w.kind === "agent" && w.harnessId === id) as { modelId: string }).modelId : "gpt-5.4"} cacheHit={0.8} tasks={0} />
      </>
    );
  }
  const w = project.workloads.find((x) => x.id === sel);
  if (!w) return null;
  const lines = steady.lines.filter((l) => l.componentId === w.id);
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const locate = (d: typeof project) => d.workloads.find((x) => x.id === w.id) as unknown as Record<string, unknown>;
  return (
    <>
      <ItemHeader label={w.label} sub={summary(w)} removeLabel="Remove workload"
        onRename={(v) => edit((d) => { const x = d.workloads.find((y) => y.id === w.id); if (x) x.label = v; })}
        onRemove={() => { edit((d) => removeWorkload(d, w.id)); onRemoved(); }} />
      <div className="font-display text-[26px] font-bold">{cad(total)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">per month at full adoption{w.kind === "agent" ? ` · ${percentile.toUpperCase()}` : ""}</span></div>
      {WORKLOAD_SPECS[w.kind] && <Fields specs={WORKLOAD_SPECS[w.kind]!} value={w as unknown as Record<string, unknown>} locate={locate} />}
      {w.kind === "documents" && <DocumentRoute id={w.id} />}
      {"warehouse" in w && w.warehouse && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Snowflake warehouse</h3>
          <Fields specs={WAREHOUSE_SPECS} value={w.warehouse as unknown as Record<string, unknown>} locate={(d) => (d.workloads.find((x) => x.id === w.id) as { warehouse?: Record<string, unknown> }).warehouse} />
          <p className="mt-1.5 text-[11.5px] text-muted">Snowflake recommends MEDIUM or smaller for AI functions; a larger warehouse does not speed them up. Hours are billed per second with a 60-second minimum per resume, in platform credits.</p>
        </div>
      )}
      {w.kind === "transcription" && <SpeechCompare hours={w.hoursPerMonth} current={w.engineId} id={w.id} diarize={w.diarize} />}
      {w.kind === "voiceAgent" && <VoiceCompare id={w.id} />}
      {w.kind === "agent" && <HarnessTable harnessId={w.harnessId} modelId={w.modelId} cacheHit={w.cacheHit} tasks={w.tasksPerMonth} />}
      {w.kind === "aiSearch" && <SearchSizing w={w} />}
      <Explain title="How this is calculated" lines={lines} months={1} />
    </>
  );
}

function VoiceCompare({ id }: { id: string }) {
  const book = useBook();
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const w = project.workloads.find((x) => x.id === id);
  if (w?.kind !== "voiceAgent") return null;
  const date = (ledger.months.find((m) => m.phase === "production") ?? ledger.months.at(-1)!).date;
  const rows = [
    ...catalog.realtimeModels.map((m) => ({ key: m.id, label: `${m.label} (speech to speech)`, perCall: voiceCall({ ...w, modelId: m.id }, book).cost, current: m.id === w.modelId, use: () => edit((d) => { const x = d.workloads.find((y) => y.id === id); if (x?.kind === "voiceAgent") x.modelId = m.id; }) })),
    ...[["speech-realtime", "Speech real-time"], ["mai-transcribe-2-streaming", "MAI-Transcribe-2 Streaming"]].flatMap(([stt, sttL]) =>
      [["gpt-5.4-mini", "GPT-5.4-mini"], ["gpt-5.4", "GPT-5.4"]].flatMap(([llm, llmL]) =>
        [["tts-neural", "Neural TTS"], ["tts-mai-voice-2-flash", "MAI-Voice-2.1-Flash"]].map(([tts, ttsL]) => ({
          key: `${stt}-${llm}-${tts}`, label: `${sttL} → ${llmL} → ${ttsL}`, perCall: cascadeCall(w, book, date, { sttId: stt!, llmId: llm!, ttsId: tts! }).cost, current: false, use: null as null | (() => void),
        })))),
  ].sort((a, b) => a.perCall - b.perCall);
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">The same {fmt(w.callsPerMonth)} calls, speech-to-speech or cascaded</h3>
      <table className="data">
        <thead><tr><th>Option</th><th className="n">CAD / call</th><th className="n">CAD / minute</th><th className="n">CAD / month</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={r.current ? { background: "var(--accent-soft)" } : undefined}>
              <td>{r.label}</td><td className="n">{cad(r.perCall, 3)}</td><td className="n">{cad(r.perCall / w.minutesPerCall, 3)}</td><td className="n">{cad(r.perCall * w.callsPerMonth)}</td>
              <td>{r.use && !r.current && <button type="button" className="rounded border border-line px-1.5 text-xs hover:bg-surface-2" onClick={r.use}>Use</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-muted">Speech-to-speech re-reads the call's audio every turn (mostly cached), so long calls with many turns cost more per minute. A cascade bills audio once but adds latency between speech recognition, the model and the synthesized voice. Telephony is not included in this comparison.</p>
    </div>
  );
}

function DocumentRoute({ id }: { id: string }) {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const w = project.workloads.find((x) => x.id === id);
  if (w?.kind !== "documents") return null;
  const extractors = catalog.unitPrices.filter((u) => u.unit === "1K pages").map((u) => ({ value: u.id, label: `${u.label}${u.platform === "snowflake" ? " (Snowflake)" : ""}` }));
  const models = catalog.chatModels.filter((m) => m.platform === "azure").map((m) => ({ value: m.id, label: m.label }));
  const set = (fn: (x: Extract<typeof w, { kind: "documents" }>) => void) => edit((d) => { const x = d.workloads.find((y) => y.id === id); if (x?.kind === "documents") fn(x); });
  const route = w.route;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
      <Field label="Route"><Select value={route.type} options={[{ value: "extract", label: "Extract text first" }, { value: "direct", label: "PDF straight to a model" }]} onChange={(v) => set((x) => { x.route = v === "direct" ? { type: "direct", modelId: "gpt-5.4-mini" } : { type: "extract", extractorId: "di-layout", addOnIds: [] }; })} /></Field>
      {route.type === "extract"
        ? <Field label="Extraction service"><Select value={route.extractorId} options={extractors} onChange={(v) => set((x) => { if (x.route.type === "extract") x.route.extractorId = v; if (v.startsWith("sf-") && !x.warehouse) x.warehouse = { size: "m", hoursPerMonth: 10 }; if (!v.startsWith("sf-")) delete x.warehouse; })} /></Field>
        : <Field label="Model"><Select value={route.modelId} options={models} onChange={(v) => set((x) => { if (x.route.type === "direct") x.route.modelId = v; })} /></Field>}
    </div>
  );
}

function useBook() {
  const project = useStudio((s) => s.project);
  return useMemo(() => new PriceBook(catalog, project.settings), [project.settings]);
}

function SpeechCompare({ hours, current, id, diarize }: { hours: number; current: string; id: string; diarize: boolean }) {
  const book = useBook();
  const { ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const date = ledger.months.at(-1)!.date;
  const rows = catalog.speechEngines.map((e) => ({ e, rate: book.speechPerHour(e.id, date, diarize) })).sort((a, b) => a.rate - b.rate);
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Every engine for the same {fmt(hours)} hours, priced at month {ledger.months.length} (end of plan)</h3>
      <table className="data">
        <thead><tr><th>Engine</th><th>Via</th><th className="n">CAD / hour</th><th className="n">CAD / month</th><th /></tr></thead>
        <tbody>
          {rows.map(({ e, rate }) => (
            <tr key={e.id} style={e.id === current ? { background: "var(--accent-soft)" } : undefined}>
              <td>{e.label} {e.diarization === "none" && <Pill>no diarization</Pill>}</td>
              <td>{e.via}</td>
              <td className="n">{cad(rate, 2)}</td>
              <td className="n">{cad(rate * hours)}</td>
              <td className="whitespace-nowrap">
                {e.lifecycle.retiresOn && <Pill tone="crit">retires {e.lifecycle.retiresOn}</Pill>} {e.promo && <Pill tone="warn">promo to {e.promo.until}</Pill>} {e.confidence === "unverified" && <Pill>unverified</Pill>}
                {e.id !== current && <button type="button" className="ml-1 rounded border border-line px-1.5 text-xs hover:bg-surface-2" onClick={() => edit((d) => { const w = d.workloads.find((x) => x.id === id); if (w?.kind === "transcription") w.engineId = e.id; })}>Use</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HarnessTable({ harnessId, modelId, cacheHit, tasks }: { harnessId: string; modelId: string; cacheHit: number; tasks: number }) {
  const book = useBook();
  const { project, ledger } = useLedger();
  const h = project.harnesses.find((x) => x.id === harnessId);
  if (!h) return null;
  const date = ledger.months.at(-1)!.date;
  const rows = (["p50", "p90", "worst"] as const).map((p) => ({ p, r: simulateHarness(h, book, { modelId, cacheHit, percentile: p, date }) }));
  const label = { p50: "Typical (P50)", p90: "P90", worst: "Worst under caps (no cache)" };
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Per task on {book.chatModel(modelId).label}</h3>
      <table className="data">
        <thead><tr><th>Estimate</th><th className="n">Steps</th><th className="n">Tokens / task</th><th className="n">CAD / task</th>{tasks > 0 && <th className="n">CAD / month</th>}</tr></thead>
        <tbody>
          {rows.map(({ p, r }) => (
            <tr key={p}><td>{label[p]}</td><td className="n">{r.steps}</td><td className="n">{fmt(r.inputTokens + r.cachedTokens + r.outputTokens)}</td><td className="n">{cad(r.cost, 3)}</td>{tasks > 0 && <td className="n">{cad(r.cost * tasks)}</td>}</tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-muted">Each step re-sends the prompt plus growing history, so input grows faster than the number of steps. The worst case assumes every task hits the turn cap with no cache hits.</p>
    </div>
  );
}

function SearchSizing({ w }: { w: Extract<Workload, { kind: "aiSearch" }> }) {
  const book = useBook();
  let s;
  try { s = sizeSearch(w, book); } catch (e) { return <p className="text-sm text-crit">{(e as Error).message}</p>; }
  const t = book.searchTier(s.tier);
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Sized to {t.label}</h3>
      <table className="data">
        <thead><tr><th>Check</th><th className="n">Needed</th><th className="n">Per partition</th><th className="n">Partitions</th></tr></thead>
        <tbody>
          <tr><td>Vector index</td><td className="n">{fmt(s.vectorGB, 2)} GB</td><td className="n">{t.vectorGBPerPartition} GB</td><td className="n" rowSpan={2}>{s.partitions}</td></tr>
          <tr><td>Storage</td><td className="n">{fmt(s.storageGB, 1)} GB</td><td className="n">{t.storageGBPerPartition} GB</td></tr>
          <tr><td>Replicas</td><td className="n">{s.replicas}</td><td className="n">max {t.maxReplicas}</td><td /></tr>
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-muted">The cheapest tier that holds the vectors and storage is chosen automatically. Quantizing vectors to int8 cuts the vector index by 4×.</p>
    </div>
  );
}
