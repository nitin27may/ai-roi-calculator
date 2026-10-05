"use client";
import { useEffect, useMemo, useState } from "react";
import { DEPLOYMENT_LABEL, DEPLOYMENTS, PriceBook, WORKLOAD_KINDS, availableIn, resolveAssumptions, type AzureDeployment, cascadeCall, agentAddedFor, featureBreakdown, harnessUsage, newFeature, newHarness, newWorkload, removeFeature, removeWorkload, simulateHarness, sizeSearch, steadyState, voiceCall, workloadRange, type Workload } from "@studio/engine";
import { Card, CardHead, Field, GroupHead, ListRow, NumberInput, Pill, Seg, Select, TrashButton, listboxKeys } from "@/components/ui";
import { Plus } from "lucide-react";
import { RangeBar } from "@/components/charts";
import { Explain } from "@/components/explain";
import { AddMenu, ItemHeader } from "@/components/add-menu";
import { Fields, HARNESS_SPECS, WAREHOUSE_SPECS, WORKLOAD_SPECS } from "@/components/fields";
import { catalog, modelOptions, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";
import { CostItems, FeatureSelect, WorkloadTiming } from "@/components/feature-fields";
import { CapacityPanel, HostingPanel, ImagesPanel, ToolFeesPanel } from "@/components/p10-panels";

const GROUP: Record<Workload["kind"], string> = {
  transcription: "Ingestion", documents: "Ingestion", email: "Ingestion", embeddings: "Retrieval", aiSearch: "Retrieval", retrieval: "Retrieval",
  chat: "Conversation", agent: "Agents", continuousEval: "Quality & safety", contentSafety: "Quality & safety", llm: "Other AI usage", fixed: "Platform",
  voiceAgent: "Voice", snowflakeComplete: "Snowflake", snowflakeFunction: "Snowflake", cortexSearch: "Snowflake", hosting: "Platform",
};
const ORDER = ["Ingestion", "Retrieval", "Conversation", "Voice", "Agents", "Quality & safety", "Snowflake", "Other AI usage", "Platform"];

export default function Run() {
  const { project, ledger } = useLedger();
  const percentile = useStudio((s) => s.percentile);
  const setPercentile = useStudio((s) => s.setPercentile);
  const edit = useStudio((s) => s.edit);
  const [sel, setSel] = useState(() => {
    const f = useStudio.getState().focus;
    if (f) useStudio.setState({ focus: null });
    return f ?? project.workloads[0]?.id ?? "maintenance";
  });
  const steady = steadyState(ledger);
  const costOf = (id: string) => steady.lines.filter((l) => l.componentId === id && !l.once).reduce((s, l) => s + l.cost, 0);
  const groupsOf = (ws: Workload[]) => ORDER.map((g) => [g, ws.filter((w) => GROUP[w.kind] === g)] as const).filter(([, x]) => x.length);
  const hasFeatures = project.features.length > 0;
  const sections = hasFeatures
    ? [...project.features.map((f) => ({ id: f.id, label: f.label, ws: project.workloads.filter((w) => w.featureId === f.id) })), { id: "", label: "Shared by the project", ws: project.workloads.filter((w) => !w.featureId) }]
    : [{ id: "", label: "", ws: project.workloads }];
  const selFeature = sel.startsWith("f:") ? sel.slice(2) : project.workloads.find((w) => w.id === sel)?.featureId;
  const rowOf = (w: Workload, g: string) => {
    const usage = steady.lines.some((l) => l.componentId === w.id && l.behaviour === "usage");
    const timed = w.startMonth !== undefined || w.endMonth !== undefined || w.rampMonths !== undefined || w.oneTime !== undefined;
    return <ListRow key={w.id} selected={sel === w.id} onClick={() => setSel(w.id)} title={w.label} sub={`${hasFeatures ? `${g} · ` : ""}${summary(w)}`} aside={<>{timed && <Pill>timed</Pill>} <Pill>{usage ? "usage" : "fixed"}</Pill></>} value={cad(costOf(w.id))} />;
  };

  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Card>
        <CardHead title="Production, per month" sub="At full adoption">
          <Seg label="Usage estimate" value={percentile} onChange={setPercentile} options={[{ value: "p10", label: "P10" }, { value: "p50", label: "P50" }, { value: "p90", label: "P90" }, { value: "worst", label: "Worst" }]} />
        </CardHead>
        <div data-tour="run-workloads" role="listbox" aria-label="Production workloads" aria-orientation="vertical" onKeyDown={listboxKeys} className="min-h-0 flex-1 overflow-auto">
          {sections.filter((sec) => !hasFeatures || sec.id !== "" || sec.ws.length > 0).map((sec) => (
            <div key={sec.id || "shared"}>
              {hasFeatures && sec.id !== "" && (
                <ListRow selected={sel === `f:${sec.id}`} onClick={() => setSel(`f:${sec.id}`)} title={sec.label} sub={`Feature · ${sec.ws.length} workload${sec.ws.length === 1 ? "" : "s"}`} aside={<Pill>feature</Pill>} value={cad(sec.ws.reduce((t, w) => t + costOf(w.id), 0))} />
              )}
              {hasFeatures && sec.id === "" && <GroupHead>{sec.label}</GroupHead>}
              {hasFeatures
                ? sec.ws.map((w) => rowOf(w, GROUP[w.kind]))
                : groupsOf(sec.ws).map(([g, ws]) => <div key={g}><GroupHead>{g}</GroupHead>{ws.map((w) => rowOf(w, g))}</div>)}
              {hasFeatures && sec.id !== "" && sec.ws.length === 0 && <p className="px-3.5 py-1.5 text-xs text-muted">No workloads yet. Add one below, or move one here from its panel.</p>}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 px-3.5 py-2.5">
            <AddWorkload onAdded={setSel} featureId={selFeature} />
            <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
              onClick={() => { let id = ""; edit((d) => { const f = newFeature(d); id = f.id; d.features.push(f); }); if (id) setSel(`f:${id}`); }}>
              <Plus size={14} />Add feature
            </button>
          </div>
          <GroupHead>Agent harnesses</GroupHead>
          {project.harnesses.map((h) => <ListRow key={h.id} selected={sel === `h:${h.id}`} onClick={() => setSel(`h:${h.id}`)} title={h.label} sub={`${h.tools} tools · ${h.steps} steps · max ${h.maxTurns} turns`} value="" />)}
          <div className="px-3.5 py-2.5"><AddHarness onAdded={(id) => setSel(`h:${id}`)} /></div>
          <GroupHead>Operations</GroupHead>
          <ListRow selected={sel === "maintenance"} onClick={() => setSel("maintenance")} title="Maintenance" sub={project.maintenance.mode === "team" ? "support team" : project.maintenance.mode === "none" ? "not costed" : `${project.maintenance.pctPerYear}% of build per year`} aside={<Pill>fixed</Pill>} value={cad(ledger.totals.maintRate)} />
        </div>
      </Card>
      <Card>
        <div data-tour="run-inspector" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">
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
    case "hosting": return `${w.items.length} item${w.items.length === 1 ? "" : "s"} · ${fmt(w.requestsPerMonth)} requests`;
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

function AddWorkload({ onAdded, featureId }: { onAdded: (id: string) => void; featureId?: string }) {
  const edit = useStudio((s) => s.edit);
  const [notice, setNotice] = useState("");
  return (
    <>
      <AddMenu label="Add workload" items={WORKLOAD_KINDS} onPick={(kind) => {
        let id = "";
        let agent = false;
        edit((d) => { agent = agentAddedFor(d, kind); const w = newWorkload(d, kind); id = w.id; if (featureId) w.featureId = featureId; d.workloads.push(w); });
        setNotice(agent ? "An agent workload needs a harness, so a default one was added under Agent harnesses. Review its steps and tools." : "");
        if (id) onAdded(id);
      }} />
      {notice && <div role="note" className="w-full rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{notice} <button type="button" className="underline" onClick={() => setNotice("")}>Dismiss</button></div>}
    </>
  );
}

function Inspector({ sel, onRemoved }: { sel: string; onRemoved: () => void }) {
  const edit = useStudio((s) => s.edit);
  const [blocked, setBlocked] = useState<string[]>([]);
  useEffect(() => setBlocked([]), [sel]);
  const { project, ledger } = useLedger();
  const percentile = useStudio((s) => s.percentile);
  const steady = steadyState(ledger);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setConfirmRemove(false), [sel]);
  if (sel.startsWith("f:")) {
    const id = sel.slice(2), f = project.features.find((x) => x.id === id);
    if (!f) return null;
    const row = featureBreakdown(project, ledger).find((r) => r.id === id);
    const owned = project.workloads.filter((w) => w.featureId === id).length, ws = project.build.workstreams.filter((w) => w.featureId === id).length;
    const caps = project.benefits.capabilities.filter((c) => c.featureId === id).length;
    const monthly = steady.lines.filter((l) => !l.once && project.workloads.some((w) => w.featureId === id && w.id === l.componentId)).reduce((t, l) => t + l.cost, 0);
    return (
      <>
        <ItemHeader label={f.label} sub="A feature owns its workloads (run), workstreams and activities (build) and the capabilities it delivers" removeLabel="Remove feature"
          onRename={(v) => edit((d) => { const x = d.features.find((y) => y.id === id); if (x) x.label = v; })}
          onRemove={() => setConfirmRemove(true)} />
        {confirmRemove && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            <span>Remove &quot;{f.label}&quot;? Its {owned} workload{owned === 1 ? "" : "s"}, {ws} workstream{ws === 1 ? "" : "s"} and {caps} capabilit{caps === 1 ? "y" : "ies"} stay in the project but become shared. No cost is deleted.</span>
            <button type="button" className="rounded border border-line bg-surface px-2 py-0.5 text-crit" onClick={() => { edit((d) => removeFeature(d, id)); onRemoved(); }}>Remove feature</button>
            <button type="button" className="rounded border border-line bg-surface px-2 py-0.5 text-ink-2" onClick={() => setConfirmRemove(false)}>Keep it</button>
          </div>
        )}
        <div className="font-display text-[26px] font-bold">{cad(monthly)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">per month to run at steady state</span></div>
        <Field label="What it does" help="featureDescription">
          <input aria-label="Description" className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] text-ink" value={f.description ?? ""} onChange={(e) => edit((d) => { const x = d.features.find((y) => y.id === id); if (x) { if (e.target.value) x.description = e.target.value; else delete x.description; } })} />
        </Field>
        {row && (
          <table className="data">
            <thead><tr><th>Over {project.timeline.horizonMonths} months</th><th className="n">C$</th></tr></thead>
            <tbody>
              <tr><td>Build (labour, Dev Lab, environment)</td><td className="n">{cad(row.build)}</td></tr>
              <tr><td>Run (usage and platform)</td><td className="n">{cad(row.run)}</td></tr>
              <tr><td>Benefit (time saved by its capabilities)</td><td className="n">{cad(row.benefit)}</td></tr>
              <tr><td className="font-semibold">Net</td><td className="n font-semibold">{cad(row.net)}</td></tr>
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted">Maintenance, transition costs, avoided costs and shared labour belong to the project and are not split across features. Set a workload&apos;s feature in its panel, a workstream&apos;s on the Build page and a capability&apos;s on Value &amp; ROI.</p>
      </>
    );
  }
  if (sel === "maintenance") {
    return (
      <>
        <h2 className="text-base font-bold">Maintenance</h2>
        <div className="font-display text-[26px] font-bold">{cad(ledger.totals.maintRate)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">per month</span></div>
        <Seg label="Maintenance mode" value={project.maintenance.mode} onChange={(mode) => edit((d) => {
          if (mode === d.maintenance.mode) return;
          d.maintenance = mode === "none" ? { mode } : mode === "pctOfBuild" ? { mode, pctPerYear: 20 } : { mode, team: [{ roleId: d.rateCard[0]!.id, people: 0.5, hoursPerMonth: 160, experiments: false }] };
        })} options={[{ value: "none", label: "None" }, { value: "pctOfBuild", label: "% of build" }, { value: "team", label: "Support team" }]} />
        {project.maintenance.mode === "none" && <p className="text-xs text-muted">No maintenance cost. Use this when support sits in another budget or you are costing tokens only.</p>}
        {project.maintenance.mode === "pctOfBuild" && <Field label="Per year, as a share of build cost" help="maintenancePct"><NumberInput value={project.maintenance.pctPerYear} max={100} suffix="%" onChange={(v) => edit((d) => { if (d.maintenance.mode === "pctOfBuild") d.maintenance.pctPerYear = v; })} /></Field>}
        {project.maintenance.mode === "team" && (
          <table className="data">
            <thead><tr><th>Role</th><th className="n">People</th><th className="n">Hours / month</th><th /></tr></thead>
            <tbody>
              {project.maintenance.team.map((t, i) => (
                <tr key={i}>
                  <td><Select label={`Role, maintenance row ${i + 1}`} value={t.roleId} options={project.rateCard.map((r) => ({ value: r.id, label: r.label }))} onChange={(v) => edit((d) => { if (d.maintenance.mode === "team") d.maintenance.team[i]!.roleId = v; })} /></td>
                  <td className="n w-24"><NumberInput label={`People, maintenance row ${i + 1}`} value={t.people} step={0.1} onChange={(v) => edit((d) => { if (d.maintenance.mode === "team") d.maintenance.team[i]!.people = v; })} /></td>
                  <td className="n w-28"><NumberInput label={`Hours per month, maintenance row ${i + 1}`} value={t.hoursPerMonth} onChange={(v) => edit((d) => { if (d.maintenance.mode === "team") d.maintenance.team[i]!.hoursPerMonth = v; })} /></td>
                  <td><TrashButton label="Remove line" onClick={() => edit((d) => { if (d.maintenance.mode === "team") d.maintenance.team.splice(i, 1); })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {project.maintenance.mode === "team" && <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { if (d.maintenance.mode === "team") d.maintenance.team.push({ roleId: d.rateCard[0]!.id, people: 0.5, hoursPerMonth: 160, experiments: false }); })}><Plus size={14} />Add support line</button>}
        {project.maintenance.mode !== "none" && <Explain title="How this is calculated" lines={steady.lines.filter((l) => l.stream === "maint")} months={1} />}
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
  const lines = steady.lines.filter((l) => l.componentId === w.id && !l.once);
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const locate = (d: typeof project) => d.workloads.find((x) => x.id === w.id) as unknown as Record<string, unknown>;
  return (
    <>
      <ItemHeader label={w.label} sub={summary(w)} removeLabel="Remove workload"
        onRename={(v) => edit((d) => { const x = d.workloads.find((y) => y.id === w.id); if (x) x.label = v; })}
        onRemove={() => { edit((d) => removeWorkload(d, w.id)); onRemoved(); }} />
      <div className="font-display text-[26px] font-bold">{cad(total)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">per month at full adoption{(w.kind === "agent" || w.kind === "chat" || w.kind === "llm") ? ` · ${percentile.toUpperCase()}` : ""}</span></div>
      <WorkloadRange w={w} />
      <div className="max-w-xs"><FeatureSelect value={w.featureId} onChange={(v) => edit((d) => { const x = d.workloads.find((y) => y.id === w.id); if (x) { if (v) x.featureId = v; else delete x.featureId; } })} /></div>
      {WORKLOAD_SPECS[w.kind] && <Fields specs={WORKLOAD_SPECS[w.kind]!} value={w as unknown as Record<string, unknown>} locate={locate} />}
      {w.kind === "documents" && <DocumentRoute id={w.id} />}
      {w.kind === "hosting" && <HostingPanel w={w} />}
      {(w.kind === "chat" || w.kind === "agent") && <ToolFeesPanel w={w} />}
      {(w.kind === "chat" || w.kind === "llm") && <ImagesPanel w={w} />}
      {(w.kind === "chat" || w.kind === "llm" || w.kind === "agent") && <CapacityPanel w={w} />}
      {w.kind === "fixed" && <CostItems items={w.items} locate={(d) => { const x = d.workloads.find((y) => y.id === w.id); return x?.kind === "fixed" ? x.items : undefined; }} idPrefix="item" firstMonthLabel="go-live" />}
      {"warehouse" in w && w.warehouse && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Snowflake warehouse</h3>
          <Fields specs={WAREHOUSE_SPECS} value={w.warehouse as unknown as Record<string, unknown>} locate={(d) => (d.workloads.find((x) => x.id === w.id) as { warehouse?: Record<string, unknown> }).warehouse} />
          <p className="mt-1.5 text-xs text-muted">Snowflake recommends MEDIUM or smaller for AI functions; a larger warehouse does not speed them up. Hours are billed per second with a 60-second minimum per resume, in platform credits.</p>
        </div>
      )}
      {w.kind === "transcription" && <SpeechCompare hours={w.hoursPerMonth} current={w.engineId} id={w.id} diarize={w.diarize} deployment={w.deployment} />}
      {w.kind === "voiceAgent" && <VoiceCompare id={w.id} />}
      {w.kind === "agent" && <HarnessTable harnessId={w.harnessId} modelId={w.modelId} cacheHit={w.cacheHit} tasks={w.tasksPerMonth} />}
      {w.kind === "aiSearch" && <SearchSizing w={w} />}
      <WorkloadTiming w={w} />
      <Explain title="How this is calculated" lines={lines} months={1} />
    </>
  );
}

/** Low, expected and high monthly cost of one workload, when its token counts or steps have a spread. */
function WorkloadRange({ w }: { w: Workload }) {
  const { project } = useLedger();
  const percentile = useStudio((s) => s.percentile);
  const r = useMemo(() => workloadRange(project, catalog, w, percentile), [project, w, percentile]);
  if (!r.spread) return <p className="text-xs text-muted">This workload is priced per page, hour or request, so its cost has no spread.</p>;
  return (
    <div className="max-w-md">
      <h3 className="mb-1 text-sm font-semibold">Range per month</h3>
      <RangeBar caption={`Low, expected and high monthly cost of ${w.label}`} rows={[{ id: w.id, label: "Monthly cost", low: r.low, expected: r.expected, high: r.high }]} />
      <p className="mt-1 text-xs text-muted">{w.kind === "agent" ? "P10 and P90 come from the agent harness: fewer or more steps and tool results." : "P10 and P90 scale the token counts by 0.7 and 1.4, a documented spread rather than a measurement."}</p>
    </div>
  );
}

function VoiceCompare({ id }: { id: string }) {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const w = project.workloads.find((x) => x.id === id);
  const book = useBook(w && "deployment" in w ? w.deployment : undefined);
  if (w?.kind !== "voiceAgent") return null;
  const date = (ledger.months.find((m) => m.phase === "production") ?? ledger.months.at(-1)!).date;
  const A = resolveAssumptions(project);
  const fnCall = { input: A.voiceFunctionCallInputTokens, output: A.voiceFunctionCallOutputTokens };
  const rows = [
    ...catalog.realtimeModels.map((m) => ({ key: m.id, label: `${m.label} (speech to speech)`, perCall: voiceCall({ ...w, modelId: m.id }, book, fnCall).cost, current: m.id === w.modelId, use: () => edit((d) => { const x = d.workloads.find((y) => y.id === id); if (x?.kind === "voiceAgent") x.modelId = m.id; }) })),
    ...[["speech-realtime", "Speech real-time"], ["mai-transcribe-2-streaming", "MAI-Transcribe-2 Streaming"]].flatMap(([stt, sttL]) =>
      [["gpt-5.4-mini", "GPT-5.4-mini"], ["gpt-5.4", "GPT-5.4"]].flatMap(([llm, llmL]) =>
        [["tts-neural", "Neural TTS"], ["tts-mai-voice-2-flash", "MAI-Voice-2.1-Flash"]].map(([tts, ttsL]) => ({
          key: `${stt}-${llm}-${tts}`, label: `${sttL} → ${llmL} → ${ttsL}`, perCall: cascadeCall(w, book, date, { sttId: stt!, llmId: llm!, ttsId: tts! }, fnCall).cost, current: false, use: null as null | (() => void),
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
      <p className="mt-1.5 text-xs text-muted">Speech-to-speech re-reads the call's audio every turn (mostly cached), so long calls with many turns cost more per minute. A cascade bills audio once but adds latency between speech recognition, the model and the synthesized voice. Telephony is not included in this comparison.</p>
    </div>
  );
}

function DocumentRoute({ id }: { id: string }) {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const w = project.workloads.find((x) => x.id === id);
  if (w?.kind !== "documents") return null;
  const extractors = catalog.unitPrices.filter((u) => u.unit === "1K pages").map((u) => ({ value: u.id, label: `${u.label}${u.platform === "snowflake" ? " (Snowflake)" : ""}` }));
  const models = modelOptions((m) => m.platform === "azure");
  const set = (fn: (x: Extract<typeof w, { kind: "documents" }>) => void) => edit((d) => { const x = d.workloads.find((y) => y.id === id); if (x?.kind === "documents") fn(x); });
  const route = w.route;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
      <Field label="Route" help="docRoute"><Select value={route.type} options={[{ value: "extract", label: "Extract text first" }, { value: "direct", label: "PDF straight to a model" }]} onChange={(v) => set((x) => { x.route = v === "direct" ? { type: "direct", modelId: "gpt-5.4-mini", outputTokens: 50 } : { type: "extract", extractorId: "di-layout", addOnIds: [] }; })} /></Field>
      {route.type === "extract"
        ? <Field label="Extraction service" help="docExtractor"><Select value={route.extractorId} options={extractors} onChange={(v) => set((x) => { if (x.route.type === "extract") x.route.extractorId = v; if (v.startsWith("sf-") && !x.warehouse) x.warehouse = { size: "m", hoursPerMonth: 10 }; if (!v.startsWith("sf-")) delete x.warehouse; })} /></Field>
        : <>
            <Field label="Model" help="docModel"><Select value={route.modelId} options={models} onChange={(v) => set((x) => { if (x.route.type === "direct") x.route.modelId = v; })} /></Field>
            <Field label="Output tokens / page" help="docOutputTokens"><NumberInput value={route.outputTokens} min={0} onChange={(n) => set((x) => { if (x.route.type === "direct") x.route.outputTokens = n; })} /></Field>
          </>}
    </div>
  );
}

const SHORT: Record<AzureDeployment, string> = { global: "Global", regional: "Canada Regional", dataZone: "US Data Zone" };
/** Deployments that offer an engine, e.g. "Global" or "Global, US Data Zone". */
const offeredIn = (e: Parameters<typeof availableIn>[0]) => DEPLOYMENTS.filter((x) => availableIn(e, x)).map((x) => SHORT[x]).join(", ");

/** Price book for a workload: its own deployment, else the project default. */
function useBook(deployment?: AzureDeployment) {
  const project = useStudio((s) => s.project);
  return useMemo(() => new PriceBook(catalog, project.settings).withDeployment(deployment), [project.settings, deployment]);
}

function SpeechCompare({ hours, current, id, diarize, deployment }: { hours: number; current: string; id: string; diarize: boolean; deployment?: AzureDeployment }) {
  const book = useBook(deployment);
  const d = book.settings.azureDeployment;
  const { ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const date = ledger.months.at(-1)!.date;
  const rows = catalog.speechEngines.map((e) => ({ e, rate: book.speechPerHour(e.id, date, diarize) })).sort((a, b) => a.rate - b.rate);
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Every engine for the same {fmt(hours)} hours, priced at month {ledger.months.length} (end of plan)</h3>
      <p className="mb-1.5 text-xs text-muted">This workload uses {DEPLOYMENT_LABEL[d]}. Engines it does not offer show where they are offered; &quot;Use&quot; switches the engine and, if needed, the workload&apos;s deployment.</p>
      <table className="data">
        <thead><tr><th>Engine</th><th>Via</th><th className="n">CAD / hour</th><th className="n">CAD / month</th><th /></tr></thead>
        <tbody>
          {rows.map(({ e, rate }) => (
            <tr key={e.id} style={e.id === current ? { background: "var(--accent-soft)" } : undefined}>
              <td>{e.label} {e.diarization === "none" && <Pill>no diarization</Pill>} {!availableIn(e, d) && <Pill tone="crit">{offeredIn(e) ? `${offeredIn(e)} only` : "not offered"}</Pill>}</td>
              <td>{e.via}</td>
              <td className="n">{cad(rate, 2)}</td>
              <td className="n">{cad(rate * hours)}</td>
              <td className="whitespace-nowrap">
                {e.lifecycle.retiresOn && <Pill tone="crit">retires {e.lifecycle.retiresOn}</Pill>} {e.promo && <Pill tone="warn">promo to {e.promo.until}</Pill>} {e.confidence === "unverified" && <Pill>unverified</Pill>}
                {e.id !== current && <button type="button" className="ml-1 rounded border border-line px-1.5 text-xs hover:bg-surface-2" onClick={() => edit((p) => { const w = p.workloads.find((x) => x.id === id); if (w?.kind !== "transcription") return; w.engineId = e.id; if (!availableIn(e, d)) w.deployment = DEPLOYMENTS.find((x) => availableIn(e, x)); })}>{availableIn(e, d) || !offeredIn(e) ? "Use" : `Use on ${SHORT[DEPLOYMENTS.find((x) => availableIn(e, x))!]}`}</button>}
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
      <p className="mt-1.5 text-xs text-muted">Each step re-sends the prompt plus growing history, so input grows faster than the number of steps. The worst case assumes every task hits the turn cap with no cache hits.</p>
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
      <p className="mt-1.5 text-xs text-muted">The cheapest tier that holds the vectors and storage is chosen automatically. Quantizing vectors to int8 cuts the vector index by 4×.</p>
    </div>
  );
}
