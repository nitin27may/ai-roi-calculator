"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LEVERS, applyScenario, compareScenarios, computeAllocation, type ScenarioEdit } from "@studio/engine";
import { Card, CardHead, Field, NumberInput, Pill, Seg, Select } from "@/components/ui";
import { CumulativeLine } from "@/components/charts";
import { catalog, modelOptions, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, cn, fmt } from "@/lib/format";

const BASES = [
  { value: "run", label: "Running cost only", hint: "Production AI usage + platform. Use this for an app that already exists." },
  { value: "runMaint", label: "Running + maintenance", hint: "Adds the support team and transition costs." },
  { value: "full", label: "Full lifecycle", hint: "Build labour + AI Dev Lab + dev environment + run + maintenance + transition." },
] as const;

type Tab = "cash" | "years" | "capabilities" | "scenarios";

export default function Roi() {
  const [tab, setTab] = useState<Tab>("cash");
  const { project, roi } = useLedger();
  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Assumptions />
      <Card>
        <CardHead title={{ cash: "Cumulative cash position", years: "By year", capabilities: "ROI by capability", scenarios: "Scenarios" }[tab]}
          sub={tab === "scenarios" ? "What-ifs compared with the baseline on the selected cost basis" : `Benefit minus ${BASES.find((b) => b.value === project.roi.basis)!.label.toLowerCase()} · NPV at ${project.roi.discountRatePct}%: ${cad(roi.npv)}`}>
          <Seg label="View" value={tab} onChange={setTab} options={[{ value: "cash", label: "Cash" }, { value: "years", label: "By year" }, { value: "capabilities", label: "By capability" }, { value: "scenarios", label: "Scenarios" }]} />
        </CardHead>
        {tab === "cash" ? <div className="flex min-h-0 flex-1 px-1.5 pb-1.5"><CumulativeLine values={roi.cumulative} payback={roi.paybackMonth} /></div>
          : <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">{tab === "years" ? <Years /> : tab === "capabilities" ? <Capabilities /> : <Scenarios />}</div>}
      </Card>
    </div>
  );
}

function Assumptions() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const roles = project.rateCard.map((r) => ({ value: r.id, label: r.label }));
  const rate = (id: string) => project.rateCard.find((r) => r.id === id)?.hourlyRate ?? 0;
  const H = project.timeline.horizonMonths, B = project.timeline.buildMonths;
  const slider = (label: string, value: number, set: (n: number) => void, id: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-[12.5px] text-ink-2">{label}<span className="num">{value}%</span></label>
      <input id={id} type="range" min={0} max={60} value={value} onChange={(e) => set(+e.target.value)} className="w-full accent-[var(--accent)]" />
    </div>
  );
  const addBtn = "flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2";
  const textIn = "min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";
  return (
    <Card>
      <CardHead title="Assumptions" />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-3.5 pb-3.5">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">Measure ROI against</legend>
          {BASES.map((b) => (
            <label key={b.value} className={cn("grid cursor-pointer grid-cols-[auto_1fr] gap-2 rounded-md border px-2.5 py-2 text-[12.5px]", project.roi.basis === b.value ? "border-accent bg-accent-soft" : "border-line")}>
              <input type="radio" name="basis" checked={project.roi.basis === b.value} onChange={() => edit((d) => { d.roi.basis = b.value; })} />
              <span>{b.label}<small className="block text-muted">{b.hint}</small></span>
            </label>
          ))}
        </fieldset>
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Benefit assumption</h3>
          <Seg label="Benefit preset" value={project.roi.benefitPreset} onChange={(v) => edit((d) => { d.roi.benefitPreset = v; })} options={[{ value: "conservative", label: "Conservative ×0.7" }, { value: "typical", label: "Typical" }, { value: "optimistic", label: "Optimistic ×1.3" }]} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Growth / year"><NumberInput value={project.roi.growthPctPerYear} min={-50} max={500} suffix="%" onChange={(v) => edit((d) => { d.roi.growthPctPerYear = v; })} /></Field>
          <Field label="Rate escalation"><NumberInput value={project.roi.rateEscalationPctPerYear} max={50} suffix="%" onChange={(v) => edit((d) => { d.roi.rateEscalationPctPerYear = v; })} /></Field>
          <Field label="Discount rate"><NumberInput value={project.roi.discountRatePct} max={50} suffix="%" onChange={(v) => edit((d) => { d.roi.discountRatePct = v; })} /></Field>
        </div>
        <div className="flex flex-col gap-2.5">
          {slider("Reduce development cost", project.roi.devCutPct, (n) => edit((d) => { d.roi.devCutPct = n; }), "dev-cut")}
          {slider("Reduce maintenance cost", project.roi.maintCutPct, (n) => edit((d) => { d.roi.maintCutPct = n; }), "maint-cut")}
          <p className="text-[11.5px] text-muted">Blunt what-ifs. The savings levers on the Overview and the Scenarios tab model concrete changes.</p>
        </div>

        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Time saved (at full adoption)</h3>
          {project.benefits.capabilities.map((c, i) => (
            <div key={c.id} className="mb-2 grid grid-cols-[1fr_1fr] gap-2 rounded-md border border-line p-2">
              <input className={cn(textIn, "col-span-2")} value={c.label} aria-label="Capability" onChange={(e) => edit((d) => { d.benefits.capabilities[i]!.label = e.target.value; })} />
              <Field label="Hours saved / month"><NumberInput value={c.hoursSavedPerMonth} onChange={(v) => edit((d) => { d.benefits.capabilities[i]!.hoursSavedPerMonth = v; })} /></Field>
              <Field label="Valued at"><Select value={c.roleId} options={roles} onChange={(v) => edit((d) => { d.benefits.capabilities[i]!.roleId = v; })} /></Field>
              <details className="col-span-2 text-xs">
                <summary className="cursor-pointer text-ink-2">Uses {c.componentIds.length} workload{c.componentIds.length === 1 ? "" : "s"} or workstream{c.componentIds.length === 1 ? "" : "s"} (for ROI by capability)</summary>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {[...project.workloads.filter((w) => w.kind !== "fixed"), ...project.build.workstreams.map((w) => ({ id: w.id, label: `Build: ${w.label}` }))].map((w) => (
                    <label key={w.id} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={c.componentIds.includes(w.id)} onChange={(e) => edit((d) => { const cap = d.benefits.capabilities[i]!; cap.componentIds = e.target.checked ? [...cap.componentIds, w.id] : cap.componentIds.filter((x) => x !== w.id); })} />
                      <span className="truncate">{w.label}</span>
                    </label>
                  ))}
                </div>
              </details>
              <div className="col-span-2 flex justify-between text-xs text-muted"><span className="num">{cad(c.hoursSavedPerMonth * rate(c.roleId))}/month before preset</span><button type="button" aria-label="Remove capability" onClick={() => edit((d) => { d.benefits.capabilities.splice(i, 1); })}><Trash2 size={14} /></button></div>
            </div>
          ))}
          <button type="button" className={addBtn} onClick={() => edit((d) => { d.benefits.capabilities.push({ id: `cap-${Date.now()}`, label: "New capability", hoursSavedPerMonth: 100, roleId: d.rateCard.at(-1)!.id, componentIds: [] }); })}><Plus size={14} />Add time saving</button>
        </section>

        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Avoided costs</h3>
          {project.benefits.avoidedCosts.map((a, i) => (
            <div key={a.id} className="mb-2 grid grid-cols-[1fr_auto] items-end gap-2 rounded-md border border-line p-2">
              <input className={cn(textIn, "col-span-2")} value={a.label} aria-label="Avoided cost" onChange={(e) => edit((d) => { d.benefits.avoidedCosts[i]!.label = e.target.value; })} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="CAD per month"><NumberInput value={a.monthly} onChange={(v) => edit((d) => { d.benefits.avoidedCosts[i]!.monthly = v; })} /></Field>
                <Field label={`From month (go-live ${B + 1})`}><NumberInput value={a.startMonth ?? B + 1} min={1} max={H} onChange={(v) => edit((d) => { d.benefits.avoidedCosts[i]!.startMonth = Math.round(v); })} /></Field>
              </div>
              <button type="button" aria-label="Remove avoided cost" className="pb-2" onClick={() => edit((d) => { d.benefits.avoidedCosts.splice(i, 1); })}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className={addBtn} onClick={() => edit((d) => { d.benefits.avoidedCosts.push({ id: `av-${Date.now()}`, label: "Licence or service retired", monthly: 1000 }); })}><Plus size={14} />Add avoided cost</button>
        </section>

        <MonthItems title="One-off benefits" hint="e.g. a decommissioned system's resale or a grant" items={project.benefits.oneOff.map((o) => ({ id: o.id, label: o.label, amount: o.amount, from: o.month }))}
          onAdd={() => edit((d) => { d.benefits.oneOff.push({ id: `one-${Date.now()}`, label: "One-off benefit", amount: 10000, month: B + 6 }); })}
          onChange={(i, k, v) => edit((d) => { const o = d.benefits.oneOff[i]!; if (k === "label") o.label = String(v); if (k === "amount") o.amount = Number(v); if (k === "from") o.month = Math.round(Number(v)); })}
          onRemove={(i) => edit((d) => { d.benefits.oneOff.splice(i, 1); })} amountLabel="CAD" H={H} />

        <MonthItems title="Transition costs" hint="Dual running, training, change management" items={project.roi.transitionCosts.map((t) => ({ id: t.id, label: t.label, amount: t.monthly, from: t.fromMonth, to: t.toMonth }))}
          onAdd={() => edit((d) => { d.roi.transitionCosts.push({ id: `tr-${Date.now()}`, label: "Training and change management", monthly: 2000, fromMonth: B + 1, toMonth: B + 3 }); })}
          onChange={(i, k, v) => edit((d) => { const t = d.roi.transitionCosts[i]!; if (k === "label") t.label = String(v); if (k === "amount") t.monthly = Number(v); if (k === "from") t.fromMonth = Math.round(Number(v)); if (k === "to") t.toMonth = Math.round(Number(v)); })}
          onRemove={(i) => edit((d) => { d.roi.transitionCosts.splice(i, 1); })} amountLabel="CAD / month" H={H} />
      </div>
    </Card>
  );
}

function MonthItems({ title, hint, items, onAdd, onChange, onRemove, amountLabel, H }: {
  title: string; hint: string; items: { id: string; label: string; amount: number; from: number; to?: number }[]; amountLabel: string; H: number;
  onAdd: () => void; onChange: (i: number, k: "label" | "amount" | "from" | "to", v: string | number) => void; onRemove: (i: number) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-1.5 text-[11.5px] text-muted">{hint}</p>
      {items.map((it, i) => (
        <div key={it.id} className="mb-2 grid grid-cols-[1fr_auto] items-end gap-2 rounded-md border border-line p-2">
          <input className="col-span-2 min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={it.label} aria-label={title} onChange={(e) => onChange(i, "label", e.target.value)} />
          <div className={cn("grid gap-2", it.to !== undefined ? "grid-cols-3" : "grid-cols-2")}>
            <Field label={amountLabel}><NumberInput value={it.amount} onChange={(v) => onChange(i, "amount", v)} /></Field>
            <Field label={it.to !== undefined ? "From month" : "Month"}><NumberInput value={it.from} min={1} max={H} onChange={(v) => onChange(i, "from", v)} /></Field>
            {it.to !== undefined && <Field label="To month"><NumberInput value={it.to} min={1} max={H} onChange={(v) => onChange(i, "to", v)} /></Field>}
          </div>
          <button type="button" aria-label={`Remove ${title}`} className="pb-2" onClick={() => onRemove(i)}><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={onAdd}><Plus size={14} />Add</button>
    </section>
  );
}

function Years() {
  const { roi, ledger } = useLedger();
  return (
    <table className="data">
      <thead><tr><th>Year</th><th className="n">Benefit</th><th className="n">Cost</th><th className="n">Net</th></tr></thead>
      <tbody>
        {roi.byYear.map((y) => <tr key={y.year}><td>Year {y.year}</td><td className="n">{cad(y.benefit)}</td><td className="n">{cad(y.cost)}</td><td className="n">{cad(y.net)}</td></tr>)}
        <tr className="total"><td>{ledger.months.length} months</td><td className="n">{cad(roi.totalBenefit)}</td><td className="n">{cad(roi.totalCost)}</td><td className="n">{cad(roi.totalBenefit - roi.totalCost)}</td></tr>
        <tr><td colSpan={3}>Net present value at {roi.discountRatePct}% a year</td><td className="n">{cad(roi.npv)}</td></tr>
      </tbody>
    </table>
  );
}

function Capabilities() {
  const { project, ledger } = useLedger();
  const a = useMemo(() => computeAllocation(project, ledger, project.roi.basis), [project, ledger]);
  return (
    <div className="flex flex-col gap-3.5">
      <table className="data">
        <thead><tr><th>Capability</th><th className="n">Benefit</th><th className="n">Direct cost</th><th className="n">Shared cost</th><th className="n">Net</th><th className="n">ROI</th></tr></thead>
        <tbody>
          {a.capabilities.map((c) => <tr key={c.id}><td>{c.label}</td><td className="n">{cad(c.benefit)}</td><td className="n">{cad(c.direct)}</td><td className="n">{cad(c.shared)}</td><td className="n">{cad(c.net)}</td><td className="n">{c.roi === null ? "–" : `${fmt(c.roi * 100)}%`}</td></tr>)}
          <tr><td>Project-level benefits <span className="text-xs text-muted">(avoided costs, one-offs)</span></td><td className="n">{cad(a.projectBenefit)}</td><td colSpan={4} /></tr>
          {a.unallocated.cost > 0 && <tr><td>Unallocated cost</td><td /><td className="n" colSpan={2}>{cad(a.unallocated.cost)}</td><td colSpan={2} /></tr>}
        </tbody>
      </table>
      <div className="rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px]">
        Workload costs, and the build cost of linked workstreams, follow the links you set on each capability (shared equally when several capabilities use one). Build, platform, maintenance and transition costs are spread in proportion to each capability's direct cost. Allocated plus unallocated always equals the total.
      </div>
      {a.unallocated.cost > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Why some cost is unallocated</h3>
          <p className="mb-2 text-[12.5px] text-ink-2">
            {a.unallocated.reason === "noLinks" ? "No capability is linked to a workload yet, so there is nothing to spread shared costs over. Link workloads under Time saved."
              : a.unallocated.reason === "noDirectCost" ? "The linked workloads cost nothing on this basis, so shared costs have no direct cost to follow."
              : "These workloads are not linked to any capability. Link them under Time saved, or treat them as a project-level overhead."}
          </p>
          <table className="data"><tbody>{a.unallocated.items.map((i) => <tr key={i.componentId}><td>{i.label}</td><td className="n">{cad(i.cost)}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}

type EditKind = "model" | "scale" | "buildMonths" | "developers" | "lever" | "preset";

function Scenarios() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const replace = useStudio((s) => s.replace);
  const results = useMemo(() => compareScenarios(project, catalog), [project]);
  const base = results[0]!;
  const [label, setLabel] = useState("");
  const [draft, setDraft] = useState<{ edit: ScenarioEdit; text: string }[]>([]);
  const [kind, setKind] = useState<EditKind>("model");
  const llmWorkloads = project.workloads.filter((w) => "modelId" in w) as { id: string; label: string; kind: string; modelId: string }[];
  const modelChoices = (id: string) => (llmWorkloads.find((w) => w.id === id)?.kind === "embeddings" ? catalog.embeddingModels.map((m) => ({ value: m.id, label: m.label })) : modelOptions());
  const [wid, setWid] = useState(llmWorkloads[0]?.id ?? "");
  const [model, setModel] = useState("gpt-5.4-mini");
  const [num, setNum] = useState(50);
  const [lever, setLever] = useState(LEVERS[0]!.id);
  const [preset, setPreset] = useState<"conservative" | "typical" | "optimistic">("conservative");
  const devIdx = project.build.team.findIndex((t) => t.experiments);

  const addEdit = () => {
    const e: { edit: ScenarioEdit; text: string } | null =
      kind === "model" && wid ? (() => { const m = modelChoices(wid).some((o) => o.value === model) ? model : modelChoices(wid)[0]!.value; return { edit: { kind: "set", path: ["workloads", wid, "modelId"], value: m } as ScenarioEdit, text: `${llmWorkloads.find((w) => w.id === wid)?.label} on ${m}` }; })()
      : kind === "scale" ? { edit: { kind: "scaleUsage", factor: num / 100 }, text: `Usage at ${num}%` }
      : kind === "buildMonths" ? { edit: { kind: "set", path: ["timeline", "buildMonths"], value: Math.round(num) }, text: `Build for ${Math.round(num)} months` }
      : kind === "developers" && devIdx >= 0 ? { edit: { kind: "set", path: ["build", "team", devIdx, "people"], value: num }, text: `${num} experimenting developers` }
      : kind === "lever" ? { edit: { kind: "lever", leverId: lever }, text: LEVERS.find((l) => l.id === lever)!.label }
      : kind === "preset" ? { edit: { kind: "set", path: ["roi", "benefitPreset"], value: preset }, text: `${preset} benefits` }
      : null;
    if (e) setDraft([...draft, e]);
  };
  const save = () => {
    if (!draft.length) return;
    edit((d) => { d.scenarios.push({ id: `sc-${Date.now()}`, label: label || draft.map((x) => x.text).join(", "), edits: draft.map((x) => x.edit) }); });
    setDraft([]); setLabel("");
  };
  const delta = (v: number, b: number, invert = false) => {
    const dlt = v - b;
    if (Math.abs(dlt) < 0.5) return null;
    const good = invert ? dlt < 0 : dlt > 0;
    return <div className={cn("text-[11px]", good ? "text-good" : "text-crit")}>{dlt > 0 ? "+" : "−"}{cad(Math.abs(dlt))}</div>;
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-auto">
        <table className="data">
          <thead><tr><th>Scenario</th><th className="n">Build</th><th className="n">Run / month</th><th className="n">Payback</th><th className="n">ROI</th><th className="n">NPV</th><th /></tr></thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.id} style={i === 0 ? { background: "var(--surface-2)" } : undefined}>
                <td>{r.label}{r.error && <div className="text-[11px] text-crit">{r.error}</div>}</td>
                <td className="n">{cad(r.ledger.totals.build)}{i > 0 && delta(r.ledger.totals.build, base.ledger.totals.build, true)}</td>
                <td className="n">{cad(r.ledger.totals.runRate)}{i > 0 && delta(r.ledger.totals.runRate, base.ledger.totals.runRate, true)}</td>
                <td className="n">{r.roi.paybackMonth ? `M${r.roi.paybackMonth}` : "–"}</td>
                <td className="n">{fmt(r.roi.roi * 100)}%</td>
                <td className="n">{cad(r.roi.npv)}{i > 0 && delta(r.roi.npv, base.roi.npv)}</td>
                <td className="whitespace-nowrap">{i > 0 && !r.error && (
                  <>
                    <button type="button" className="rounded border border-line px-1.5 text-xs hover:bg-surface-2" title="Make this the project" onClick={() => { const s = project.scenarios.find((x) => x.id === r.id)!; const q = applyScenario(project, s, catalog); q.scenarios = project.scenarios.filter((x) => x.id !== r.id); replace(q); }}>Adopt</button>{" "}
                  </>
                )}{i > 0 && <button type="button" aria-label={`Delete ${r.label}`} onClick={() => edit((d) => { d.scenarios = d.scenarios.filter((x) => x.id !== r.id); })}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-md border border-line p-3">
        <h3 className="mb-2 text-sm font-semibold">New scenario</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] items-end gap-2.5">
          <Field label="Change"><Select value={kind} onChange={(v) => setKind(v as EditKind)} options={[{ value: "model", label: "Model for a workload" }, { value: "scale", label: "Usage volume (%)" }, { value: "buildMonths", label: "Build months" }, { value: "developers", label: "Experimenting developers" }, { value: "lever", label: "Apply a savings lever" }, { value: "preset", label: "Benefit preset" }]} /></Field>
          {kind === "model" && <><Field label="Workload"><Select value={wid} onChange={(v) => { setWid(v); setModel(modelChoices(v)[0]?.value ?? ""); }} options={llmWorkloads.map((w) => ({ value: w.id, label: w.label }))} /></Field><Field label="Model"><Select value={modelChoices(wid).some((o) => o.value === model) ? model : (modelChoices(wid)[0]?.value ?? "")} onChange={setModel} options={modelChoices(wid)} /></Field></>}
          {(kind === "scale" || kind === "buildMonths" || kind === "developers") && <Field label={kind === "scale" ? "Percent of baseline" : kind === "buildMonths" ? "Months" : "People"}><NumberInput value={num} min={kind === "scale" ? 1 : 1} max={kind === "scale" ? 1000 : 24} onChange={setNum} /></Field>}
          {kind === "lever" && <Field label="Lever"><Select value={lever} onChange={setLever} options={LEVERS.map((l) => ({ value: l.id, label: l.label }))} /></Field>}
          {kind === "preset" && <Field label="Preset"><Select value={preset} onChange={(v) => setPreset(v as typeof preset)} options={[{ value: "conservative", label: "Conservative" }, { value: "typical", label: "Typical" }, { value: "optimistic", label: "Optimistic" }]} /></Field>}
          <button type="button" className="flex h-[30px] w-fit items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium hover:bg-surface-2" onClick={addEdit}><Plus size={14} />Add change</button>
        </div>
        {draft.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">{draft.map((d, i) => <Pill key={i}>{d.text}</Pill>)}</div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Name"><input className="rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" placeholder={draft.map((x) => x.text).join(", ")} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
              <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink" onClick={save}>Save scenario</button>
              <button type="button" className="rounded-md border border-line px-3 py-1.5 text-xs" onClick={() => setDraft([])}>Clear</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
