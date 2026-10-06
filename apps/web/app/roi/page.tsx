"use client";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { LEVERS, applyScenario, avoidedMonthly, beforeAfter, capabilityFromBenchmark, capabilityVolume, workloadVolume, sensitivity, capabilityHours, compareScenarios, computeAllocation, linkCapabilityToFeature, ensureBenchmarkRole, roiAssumptions, type Capability, type ScenarioEdit } from "@studio/engine";
import { Card, CardHead, Field, NumberInput, Pill, Seg, Select, TextInput, TrashButton } from "@/components/ui";
import type { HelpId } from "@/lib/help";
import { CumulativeLine, Legend } from "@/components/charts";
import { catalog, deploymentOptions, modelOptions, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { AddMenu } from "@/components/add-menu";
import { MonthLegend } from "@/components/months";
import { ConfidenceField, FinanceInputs, ValueItems } from "@/components/roi-extras";
import { cad, cn, fmt } from "@/lib/format";

const BASES = [
  { value: "run", label: "Running cost only", hint: "Production AI usage + platform. Use this for an app that already exists." },
  { value: "runMaint", label: "Running + maintenance", hint: "Adds the support team and transition costs." },
  { value: "full", label: "Full lifecycle", hint: "Build labour + AI Dev Lab + dev environment + run + maintenance + transition." },
] as const;

type Tab = "cash" | "years" | "capabilities" | "beforeAfter" | "sensitivity" | "scenarios";

export default function Roi() {
  const [tab, setTab] = useState<Tab>("cash");
  const { project, roi } = useLedger();
  return (
    <div data-tour="roi-view" className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Assumptions />
      <Card className="order-first lg:order-none">
        <CardHead title={{ cash: "Cumulative cash position", years: "By year", capabilities: "ROI by capability", beforeAfter: "Today vs with AI", sensitivity: "What moves NPV most", scenarios: "Scenarios" }[tab]}
          sub={tab === "scenarios" ? "What-ifs compared with the baseline on the selected cost basis" : `Benefit minus ${BASES.find((b) => b.value === project.roi.basis)!.label.toLowerCase()} · NPV at ${project.roi.discountRatePct}%: ${cad(roi.npv)}`}>
          <Seg label="View" value={tab} onChange={setTab} options={[{ value: "cash", label: "Cash" }, { value: "years", label: "By year" }, { value: "capabilities", label: "By capability" }, { value: "beforeAfter", label: "Before / after" }, { value: "sensitivity", label: "Sensitivity" }, { value: "scenarios", label: "Scenarios" }]} />
        </CardHead>
        {tab === "cash" ? <><div className="flex min-h-0 flex-1 px-1.5 pb-1.5"><CumulativeLine values={roi.cumulative} payback={roi.paybackMonth} /></div><MonthLegend className="px-3.5 pb-3" /></>
          : <div className="min-h-0 flex-1 overflow-auto scroll-hint px-3.5 pb-3.5">{tab === "years" ? <Years /> : tab === "capabilities" ? <Capabilities /> : tab === "beforeAfter" ? <BeforeAfterView /> : tab === "sensitivity" ? <Tornado /> : <Scenarios />}</div>}
      </Card>
    </div>
  );
}

function Assumptions() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  // Below 1024px the chart comes first and this long form folds away until asked for; on desktop it is always open.
  const [open, setOpen] = useState(false);
  const H = project.timeline.horizonMonths, B = project.timeline.buildMonths;
  const slider = (label: string, value: number, set: (n: number) => void, id: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-[12.5px] text-ink-2">{label}<span className="num">{value}%</span></label>
      <input id={id} type="range" min={0} max={60} value={value} onChange={(e) => set(+e.target.value)} className="h-6 w-full accent-[var(--accent)]" />
    </div>
  );
  const addBtn = "flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2";
  const textIn = "min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";
  return (
    <Card className="self-start lg:self-auto">
      <CardHead title="Assumptions">
        <button type="button" aria-expanded={open} aria-controls="roi-assumptions" onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 lg:hidden">{open ? "Hide assumptions" : "Show assumptions"}</button>
      </CardHead>
      <div id="roi-assumptions" className={cn("min-h-0 flex-1 flex-col gap-4 overflow-auto px-3.5 pb-3.5 lg:flex", open ? "flex" : "hidden")}>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">Measure ROI against</legend>
          {BASES.map((b) => (
            <label key={b.value} className={cn("grid cursor-pointer grid-cols-[auto_1fr] gap-2 rounded-md border px-2.5 py-2 text-[12.5px]", project.roi.basis === b.value ? "border-accent bg-accent-soft" : "border-line")}>
              <input type="radio" name="basis" checked={project.roi.basis === b.value} onChange={() => edit((d) => { d.roi.basis = b.value; })} />
              <span>{b.label}<small className="block text-muted">{b.hint}</small></span>
            </label>
          ))}
        </fieldset>
        <BenefitAssumptions />
        <div className="grid grid-cols-3 gap-2">
          <Field label="Growth / year" help="growth"><NumberInput value={project.roi.growthPctPerYear} min={-50} max={500} suffix="%" onChange={(v) => edit((d) => { d.roi.growthPctPerYear = v; })} /></Field>
          <Field label="Rate escalation" help="escalation"><NumberInput value={project.roi.rateEscalationPctPerYear} max={50} suffix="%" onChange={(v) => edit((d) => { d.roi.rateEscalationPctPerYear = v; })} /></Field>
          <Field label="Discount rate" help="discount"><NumberInput value={project.roi.discountRatePct} max={50} suffix="%" onChange={(v) => edit((d) => { d.roi.discountRatePct = v; })} /></Field>
        </div>
        <FinanceInputs />
        <div className="flex flex-col gap-2.5">
          {slider("Reduce development cost", project.roi.devCutPct, (n) => edit((d) => { d.roi.devCutPct = n; }), "dev-cut")}
          {slider("Reduce maintenance cost", project.roi.maintCutPct, (n) => edit((d) => { d.roi.maintCutPct = n; }), "maint-cut")}
          <p className="text-xs text-muted">Blunt what-ifs. The savings levers on the Overview and the Scenarios tab model concrete changes.</p>
        </div>

        <CapabilityEditor />

        <section>
          <h3 className="mb-1.5 text-sm font-semibold">Avoided costs</h3>
          {project.benefits.avoidedCosts.map((a, i) => {
            const headcount = a.fte !== undefined;
            const upd = (fn: (x: typeof a) => void) => edit((d) => { const x = d.benefits.avoidedCosts[i]; if (x) fn(x); });
            const overlap = headcount && project.benefits.capabilities.some((c) => c.roleId === a.roleId);
            return (
              <div key={a.id} className="mb-2 flex flex-col gap-2 rounded-md border border-line p-2">
                <div className="flex items-center gap-2">
                  <input className={cn(textIn, "flex-1")} value={a.label} aria-label="Avoided cost" onChange={(e) => upd((x) => { x.label = e.target.value; })} />
                  <TrashButton label="Remove avoided cost" onClick={() => edit((d) => { d.benefits.avoidedCosts.splice(i, 1); })} />
                </div>
                <Seg label="Avoided cost type" value={headcount ? "fte" : "fixed"} onChange={(v) => upd((x) => { if (v === "fte") { x.fte = 1; x.roleId = project.benefits.capabilities[0]?.roleId ?? project.rateCard.at(-1)!.id; x.hoursPerMonth = 160; } else { delete x.fte; delete x.roleId; delete x.hoursPerMonth; } })}
                  options={[{ value: "fixed", label: "Fixed amount" }, { value: "fte", label: "Headcount" }]} />
                <div className="grid grid-cols-2 gap-2">
                  {headcount ? (
                    <>
                      <Field label="FTE avoided" help="fteAvoided"><NumberInput value={a.fte ?? 0} step={0.1} onChange={(v) => upd((x) => { x.fte = v; })} /></Field>
                      <Field label="Hours per FTE / month" help="hoursPerFte"><NumberInput value={a.hoursPerMonth ?? 160} onChange={(v) => upd((x) => { x.hoursPerMonth = v; })} /></Field>
                      <Field label="Role" help="role"><Select value={a.roleId ?? ""} options={project.rateCard.map((r) => ({ value: r.id, label: `${r.label} (${cad(r.hourlyRate)}/h)` }))} onChange={(v) => upd((x) => { x.roleId = v; })} /></Field>
                    </>
                  ) : (
                    <Field label="CAD per month" help="avoidedMonthly"><NumberInput value={a.monthly} onChange={(v) => upd((x) => { x.monthly = v; })} /></Field>
                  )}
                  <Field label={`From month (go-live ${B + 1})`} help="capLiveFrom"><NumberInput value={a.startMonth ?? B + 1} min={1} max={H} onChange={(v) => upd((x) => { x.startMonth = Math.round(v); })} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ConfidenceField value={a.confidencePct} onChange={(v) => upd((x) => { if (v === undefined) delete x.confidencePct; else x.confidencePct = v; })} />
                  <Field label="Count it under capability" help="valueCapability">
                    <Select value={a.capabilityId ?? ""} options={[{ value: "", label: "Whole project" }, ...project.benefits.capabilities.map((c) => ({ value: c.id, label: c.label }))]} onChange={(v) => upd((x) => { if (v) x.capabilityId = v; else delete x.capabilityId; })} />
                  </Field>
                </div>
                {headcount && <div className="text-xs text-muted"><span className="num font-semibold text-ink">{cad(avoidedMonthly(project, a))}/month</span>, rising with rate escalation. Count it only if the role is actually not hired, or is redeployed to funded work.</div>}
                {overlap && <div role="note" className="rounded bg-warn-soft px-2 py-1.5 text-xs text-warn">A time-saving capability is valued at the same role. If those saved hours are what lets you avoid this headcount, you are counting the same benefit twice.</div>}
              </div>
            );
          })}
          <button type="button" className={addBtn} onClick={() => edit((d) => { d.benefits.avoidedCosts.push({ id: `av-${Date.now()}`, label: "Licence or service retired", monthly: 1000 }); })}><Plus size={14} />Add avoided cost</button>
        </section>

        <ValueItems />

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

function Tornado() {
  const project = useStudio((s) => s.project);
  const { base, rows, combined } = useMemo(() => sensitivity(project, catalog), [project]);
  const lo = Math.min(base, ...rows.map((r) => Math.min(r.low, r.high)), 0);
  const hi = Math.max(base, ...rows.map((r) => Math.max(r.low, r.high)), 0);
  // Pad the range so the end labels fit inside the plot.
  const pad = (hi - lo || 1) * 0.17;
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad || 1)) * 100;
  const top = rows[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px]">
        NPV is <b>{cad(base)}</b>. Each bar moves one input to a low and a high value with everything else held. {top && <>The biggest lever is <b>{top.label.toLowerCase()}</b>: NPV runs from {cad(Math.min(top.low, top.high))} to {cad(Math.max(top.low, top.high))}.</>}
        {rows.some((r) => Math.min(r.low, r.high) < 0) && <> Inputs whose bar crosses zero can turn the case negative on their own.</>}
      </div>
      <div className="grid grid-cols-[minmax(150px,240px)_1fr] gap-x-3 gap-y-1.5 text-[12px]">
        <span />
        <div className="relative h-4 text-xs text-muted">
          <span className="absolute -translate-x-1/2" style={{ left: `${x(base)}%` }}>base {cad(base)}</span>
          {lo < 0 && <span className="absolute -translate-x-1/2" style={{ left: `${x(0)}%`, top: 0 }}>{x(base) - x(0) > 12 ? "0" : ""}</span>}
        </div>
        {rows.map((r) => {
          const down = Math.min(r.low, r.high), up = Math.max(r.low, r.high);
          return (
            <div key={r.id} className="contents">
              <span className="truncate py-1 text-ink-2" title={r.label}>{r.label}</span>
              <div className="relative h-7" title={`${r.lowLabel}: ${cad(r.low)} · ${r.highLabel}: ${cad(r.high)}`}>
                <div className="absolute inset-y-0 w-px bg-line" style={{ left: `${x(0)}%` }} />
                <div className="absolute top-1 bottom-1 rounded-l" style={{ left: `${x(down)}%`, width: `${Math.max(0.3, x(Math.min(base, up)) - x(down))}%`, background: "var(--crit)", opacity: 0.75 }} />
                <div className="absolute top-1 bottom-1 rounded-r" style={{ left: `${x(Math.max(base, down))}%`, width: `${Math.max(0.3, x(up) - x(Math.max(base, down)))}%`, background: "var(--good)", opacity: 0.75 }} />
                <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${x(base)}%` }} />
                <span className="num absolute top-1.5 -translate-x-full pr-1 text-xs text-ink-2" style={{ left: `${x(down)}%` }}>{r.low <= r.high ? r.lowLabel : r.highLabel}</span>
                <span className="num absolute top-1.5 pl-1 text-xs text-ink-2" style={{ left: `${x(up)}%` }}>{r.low <= r.high ? r.highLabel : r.lowLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[12.5px]">
        <div className="rounded-md border border-line p-2.5"><div className="text-muted">Everything at its low end</div><div className="num text-lg font-bold" style={{ color: combined.low < 0 ? "var(--crit)" : undefined }}>{cad(combined.low)}</div></div>
        <div className="rounded-md border border-line p-2.5"><div className="text-muted">Base case</div><div className="num text-lg font-bold">{cad(base)}</div></div>
        <div className="rounded-md border border-line p-2.5"><div className="text-muted">Everything at its high end</div><div className="num text-lg font-bold" style={{ color: "var(--good)" }}>{cad(combined.high)}</div></div>
      </div>
      <p className="-mt-1 text-xs text-muted">The corners: all inputs moved together. Inputs compound (more users × more time saved × higher realisation), so these are wider than any single bar. Real outcomes rarely hit every extreme at once; treat them as bounds, not forecasts.</p>
      <table className="data">
        <thead><tr><th>Input</th><th className="n">Low</th><th className="n">NPV</th><th className="n">High</th><th className="n">NPV</th><th className="n">Swing</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.label}</td><td className="n">{r.lowLabel}</td><td className="n">{cad(r.low)}</td><td className="n">{r.highLabel}</td><td className="n">{cad(r.high)}</td><td className="n font-semibold">{cad(r.swing)}</td></tr>)}</tbody>
      </table>
      <p className="text-xs text-muted">Red: NPV below the base; green: above. Benefit inputs use the benchmark library&apos;s conservative and optimistic values; others move by the amounts shown. AI run volume scales production usage with the benefit held, so it isolates token and service cost.</p>
    </div>
  );
}

function BeforeAfterView() {
  const { project, ledger } = useLedger();
  const ba = beforeAfter(project, catalog.benchmarks, ledger.totals);
  const withBase = ba.rows.filter((r) => r.baselineHours !== null);
  const max = Math.max(ba.before, ba.after, 1);
  const bar = (parts: { label: string; value: number; color: string }[]) => (
    <div className="flex h-7 w-full overflow-hidden rounded bg-surface-2">
      {parts.filter((x) => x.value > 0).map((x) => <div key={x.label} title={`${x.label}: ${cad(x.value)}`} style={{ width: `${(x.value / max) * 100}%`, background: x.color }} className="border-r-2 border-surface last:border-r-0" />)}
    </div>
  );
  const labourBefore = withBase.reduce((s, r) => s + r.before, 0), labourAfter = withBase.reduce((s, r) => s + r.after, 0);
  const change = ba.before > 0 ? (ba.after - ba.before) / ba.before : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px]">
        At full rollout the work costs <b>{cad(ba.before)}/month today</b> and <b>{cad(ba.after)}/month with AI</b>{ba.before > 0 ? <> ({change <= 0 ? "" : "+"}{fmt(change * 100)}%)</> : null}, AI usage and maintenance included. Build cost is not in this view; the Cash tab pays it back.
      </div>
      <div className="grid grid-cols-[90px_1fr_auto] items-center gap-x-3 gap-y-2 text-[12.5px]">
        <span className="text-muted">Today</span>
        {bar([{ label: "People's time", value: labourBefore, color: "var(--s1)" }, { label: "Avoidable costs", value: ba.avoided, color: "var(--platform)" }])}
        <span className="num font-semibold">{cad(ba.before)}</span>
        <span className="text-muted">With AI</span>
        {bar([{ label: "People's time", value: Math.max(0, labourAfter - ba.savedWithoutBaseline), color: "var(--s1)" }, { label: "AI usage and platform", value: ba.ai, color: "var(--run)" }, { label: "Maintenance", value: ba.maint, color: "var(--maint)" }])}
        <span className="num font-semibold">{cad(ba.after)}</span>
      </div>
      <Legend items={[{ label: "People's time", color: "var(--s1)" }, { label: "Avoidable costs", color: "var(--platform)" }, { label: "AI usage and platform", color: "var(--run)" }, { label: "Maintenance", color: "var(--maint)" }]} />
      <table className="data">
        <thead><tr><th>Capability</th><th className="n">Hours today</th><th className="n">Hours saved</th><th className="n">Reduction</th><th className="n">Today</th><th className="n">With AI</th></tr></thead>
        <tbody>
          {withBase.map((r) => (
            <tr key={r.id}><td>{r.label}</td><td className="n">{fmt(r.baselineHours!)}</td><td className="n">{fmt(r.savedHours)}</td><td className="n">{fmt((r.savedHours / Math.max(1, r.baselineHours!)) * 100)}%</td><td className="n">{cad(r.before)}</td><td className="n">{cad(r.after)}</td></tr>
          ))}
          {ba.avoided > 0 && <tr><td>Avoided costs</td><td /><td /><td /><td className="n">{cad(ba.avoided)}</td><td className="n">{cad(0)}</td></tr>}
          <tr><td>AI usage and platform</td><td /><td /><td /><td className="n">–</td><td className="n">{cad(ba.ai)}</td></tr>
          <tr><td>Maintenance</td><td /><td /><td /><td className="n">–</td><td className="n">{cad(ba.maint)}</td></tr>
          {ba.savedWithoutBaseline > 0 && <tr><td>Time saved without a baseline<small className="block text-muted">{ba.rows.filter((r) => r.baselineHours === null).map((r) => r.label).join(", ")}</small></td><td /><td /><td /><td className="n">–</td><td className="n">−{cad(ba.savedWithoutBaseline)}</td></tr>}
          <tr className="total"><td>Total per month</td><td /><td /><td /><td className="n">{cad(ba.before)}</td><td className="n">{cad(ba.after)}</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-muted">Today&apos;s hours come from each capability&apos;s baseline minutes across all its users or items (not only adopters). Capabilities entered as net hours have no baseline: their saving is shown as a single line. Growth and rate escalation are left out so the two sides compare like for like.</p>
    </div>
  );
}

const PRESETS = [{ value: "conservative", label: "Conservative" }, { value: "typical", label: "Typical" }, { value: "optimistic", label: "Optimistic" }] as const;

function BenefitAssumptions() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const a = roiAssumptions(project, catalog.benchmarks);
  const overridden = project.roi.adoptionPct !== undefined || project.roi.realisationPct !== undefined;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Benefit evidence</h3>
      <Seg label="Benefit preset" value={project.roi.benefitPreset} onChange={(v) => edit((d) => { d.roi.benefitPreset = v; })} options={PRESETS.map((p) => ({ ...p }))} />
      <p className="text-xs text-muted">Picks each benchmark&apos;s saving and the default adoption and realisation. {a.rationale} Capabilities entered as hours are not affected.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Adoption (active users)" help="adoption"><NumberInput value={a.adoptionPct} max={100} suffix="%" onChange={(v) => edit((d) => { d.roi.adoptionPct = v; })} /></Field>
        <Field label="Realisation (time that becomes value)" help="realisation"><NumberInput value={a.realisationPct} max={100} suffix="%" onChange={(v) => edit((d) => { d.roi.realisationPct = v; })} /></Field>
        <Field label="Users already licensed (e.g. M365 Copilot)" help="licensed"><NumberInput value={project.roi.licensedPct ?? 0} max={100} suffix="%" onChange={(v) => edit((d) => { d.roi.licensedPct = v || undefined; })} /></Field>
        <Field label="Working days / month" help="roiWorkingDays"><NumberInput value={project.roi.workingDaysPerMonth ?? 21} min={1} max={31} onChange={(v) => edit((d) => { d.roi.workingDaysPerMonth = v; })} /></Field>
      </div>
      {overridden && <button type="button" className="w-fit text-xs text-accent underline" onClick={() => edit((d) => { delete d.roi.adoptionPct; delete d.roi.realisationPct; })}>Reset adoption and realisation to the preset</button>}
    </div>
  );
}

const DRIVERS = [
  { value: "hours", label: "Net hours" },
  { value: "perTask", label: "Per task" },
  { value: "perUserWeek", label: "Per user-week" },
  { value: "perVolume", label: "Per queue item" },
];
const CONFIDENCE_TONE = { high: "ok", medium: "ok", low: "warn", none: "crit" } as const;

function CapabilityEditor() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const lib = catalog.benchmarks;
  const defaultUsers = project.workloads.find((w) => w.kind === "chat")?.kind === "chat" ? (project.workloads.find((w) => w.kind === "chat") as { users: number }).users : 100;
  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">Time saved</h3>
      {project.benefits.capabilities.map((c, i) => <CapabilityCard key={c.id} c={c} i={i} />)}
      <div className="flex flex-wrap gap-2">
        <AddMenu label="Add from benchmarks" items={lib.capabilities.map((b) => ({ kind: b.id, label: b.label, detail: `${b.confidence} confidence${b.vendorFunded ? " · vendor-funded" : ""} · ${b.sourceLabel}` }))}
          onPick={(id) => edit((d) => { const c = capabilityFromBenchmark(d, id, lib, defaultUsers); ensureBenchmarkRole(d, c.roleId, lib); d.benefits.capabilities.push(c); })} />
        <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { d.benefits.capabilities.push({ id: `cap-${Date.now()}`, label: "New capability", hoursSavedPerMonth: 100, roleId: d.rateCard.at(-1)!.id, workloadIds: [], workstreamIds: [] }); })}><Plus size={14} />Enter hours</button>
      </div>
    </section>
  );
}

function CapabilityCard({ c, i }: { c: Capability; i: number }) {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const lib = catalog.benchmarks;
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  const upd = (fn: (x: Capability) => void) => edit((d) => { const x = d.benefits.capabilities[i]; if (x) fn(x); });
  const h = capabilityHours(project, c, lib);
  const rate = project.rateCard.find((r) => r.id === c.roleId)?.hourlyRate ?? 0;
  const bench = c.benchmarkId ? lib.capabilities.find((b) => b.id === c.benchmarkId) : undefined;
  const driver = c.driver ?? "hours";
  const textIn = "min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";
  const num = (label: string, help: HelpId, value: number | undefined, set: (x: Capability, v: number) => void, opts: { max?: number; suffix?: string } = {}) => (
    <Field label={label} help={help}><NumberInput value={value ?? 0} max={opts.max} suffix={opts.suffix} onChange={(v) => upd((x) => set(x, v))} /></Field>
  );
  const unit = c.unit ?? bench?.unit ?? "minutes";
  const savings = c.savings ?? bench?.savings ?? { conservative: 0, typical: 0, optimistic: 0 };
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border border-line p-2">
      <div className="flex items-center gap-2">
        <input className={cn(textIn, "flex-1")} value={c.label} aria-label="Capability" onChange={(e) => upd((x) => { x.label = e.target.value; })} />
        <TrashButton label="Remove capability" onClick={() => edit((d) => { d.benefits.capabilities.splice(i, 1); })} />
      </div>
      {bench && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Pill tone={CONFIDENCE_TONE[bench.confidence]}>{bench.confidence} confidence</Pill>
          {bench.vendorFunded && <Pill tone="warn">vendor-funded</Pill>}
          {bench.sourceUrl ? <a className="underline" href={bench.sourceUrl} target="_blank" rel="noreferrer">{bench.sourceLabel}</a> : <span>{bench.sourceLabel}</span>}
          {bench.note && <span className="block w-full">{bench.note}</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Worked out" help="capDriver"><Select value={driver} options={DRIVERS} onChange={(v) => upd((x) => { x.driver = v as Capability["driver"]; if (v !== "hours") { x.users ??= 100; x.tasksPerUserPerDay ??= 1; x.baselineMinutes ??= 30; x.savings ??= { conservative: 5, typical: 10, optimistic: 15 }; x.unit ??= "minutes"; } })} /></Field>
        <Field label="Valued at" help="capRole"><Select value={c.roleId} options={project.rateCard.map((r) => ({ value: r.id, label: `${r.label} (${cad(r.hourlyRate)}/h)` }))} onChange={(v) => upd((x) => { x.roleId = v; })} /></Field>
        {driver === "hours" && num("Net hours saved / month", "capNetHours", c.hoursSavedPerMonth, (x, v) => { x.hoursSavedPerMonth = v; })}
        {driver !== "hours" && (() => {
          const perUser = driver !== "perVolume";
          const sources = project.workloads.filter((w) => { const v = workloadVolume(w); return perUser ? v.users !== undefined : v.items !== undefined; });
          return (
            <Field label={perUser ? "Take users from" : "Take items from"} help="capVolumeFrom">
              <Select value={c.volumeFrom ?? ""} options={[{ value: "", label: "Entered here" }, ...sources.map((w) => ({ value: w.id, label: `${w.label}${perUser ? "" : ` (${workloadVolume(w).itemsKey})`}` }))]}
                onChange={(v) => upd((x) => { if (v) x.volumeFrom = v; else { const cur = capabilityVolume(project, x); x.users = cur.users; x.itemsPerMonth = cur.items; delete x.volumeFrom; } })} />
            </Field>
          );
        })()}
        {(driver === "perTask" || driver === "perUserWeek") && (c.volumeFrom
          ? <Field label="Users (from the workload)" help="capUsers"><span className="num py-1.5 text-[13px]">{fmt(capabilityVolume(project, c).users)}</span></Field>
          : num("Users", "capUsersIn", c.users, (x, v) => { x.users = v; }))}
        {driver === "perTask" && num("Tasks per user per day", "capTasksPerDay", c.tasksPerUserPerDay, (x, v) => { x.tasksPerUserPerDay = v; })}
        {driver === "perVolume" && (c.volumeFrom
          ? <Field label="Items per month (from the workload)" help="capItems"><span className="num py-1.5 text-[13px]">{fmt(capabilityVolume(project, c).items)}</span></Field>
          : num("Items per month", "capItemsIn", c.itemsPerMonth, (x, v) => { x.itemsPerMonth = v; }))}
        {driver === "perVolume" && num("Share handled", "capHandled", c.handledPct ?? 100, (x, v) => { x.handledPct = v; }, { max: 100, suffix: "%" })}
        {driver !== "hours" && num(driver === "perUserWeek" ? "Baseline min / week" : "Baseline minutes", "capBaseline", c.baselineMinutes ?? bench?.baselineMinutes, (x, v) => { x.baselineMinutes = v; })}
        {driver !== "hours" && <Field label="Saving is in" help="capSavingUnit"><Select value={unit} options={[{ value: "minutes", label: driver === "perUserWeek" ? "minutes / week" : "minutes" }, { value: "pct", label: "% of baseline" }]} onChange={(v) => upd((x) => { x.unit = v as "minutes" | "pct"; })} /></Field>}
      </div>
      {driver !== "hours" && (
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <Field key={p.value} label={`${p.label}${project.roi.benefitPreset === p.value ? " (in use)" : ""}`} help="capSavings">
              <NumberInput value={savings[p.value]} suffix={unit === "pct" ? "%" : "min"} onChange={(v) => upd((x) => { x.savings = { ...(x.savings ?? savings), [p.value]: v }; })} />
            </Field>
          ))}
        </div>
      )}
      {driver !== "hours" && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-2">Adoption, realisation and timing for this capability</summary>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {driver !== "perVolume" && num("Adoption", "adoption", h.adoptionPct, (x, v) => { x.adoptionPct = v; }, { max: 100, suffix: "%" })}
            {num("Realisation", "realisation", h.realisationPct, (x, v) => { x.realisationPct = v; }, { max: 100, suffix: "%" })}
            {driver === "perUserWeek" && num("Licence overlap", "capOverlap", Math.round((c.licenceOverlap ?? bench?.licenceOverlap ?? 0) * 100), (x, v) => { x.licenceOverlap = v / 100; }, { max: 100, suffix: "%" })}
            <Field label={`Live from month (go-live ${B + 1})`} help="capLiveFrom"><NumberInput value={c.liveFromMonth ?? B + 1} min={B + 1} max={H} onChange={(v) => upd((x) => { x.liveFromMonth = Math.round(v) > B + 1 ? Math.round(v) : undefined; })} /></Field>
          </div>
          {(c.adoptionPct !== undefined || c.realisationPct !== undefined) && <button type="button" className="mt-1 text-accent underline" onClick={() => upd((x) => { delete x.adoptionPct; delete x.realisationPct; })}>Use the project&apos;s adoption and realisation</button>}
        </details>
      )}
      {driver === "hours" && <Field label={`Live from month (go-live ${B + 1})`} help="capLiveFrom"><NumberInput value={c.liveFromMonth ?? B + 1} min={B + 1} max={H} onChange={(v) => upd((x) => { x.liveFromMonth = Math.round(v) > B + 1 ? Math.round(v) : undefined; })} /></Field>}
      <div className="max-w-[200px]"><ConfidenceField value={c.confidencePct} onChange={(v) => upd((x) => { if (v === undefined) delete x.confidencePct; else x.confidencePct = v; })} /></div>
      {project.features.length > 0 && (
        <Field label="Feature" help="featureId">
          <Select value={c.featureId ?? ""} options={[{ value: "", label: "Shared by the project" }, ...project.features.map((f) => ({ value: f.id, label: f.label }))]}
            onChange={(v) => edit((d) => { if (v) linkCapabilityToFeature(d, c.id, v); else { const x = d.benefits.capabilities.find((y) => y.id === c.id); if (x) delete x.featureId; } })} />
        </Field>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-ink-2">Uses {c.workloadIds.length + c.workstreamIds.length} workload{c.workloadIds.length + c.workstreamIds.length === 1 ? "" : "s"} or workstream{c.workloadIds.length + c.workstreamIds.length === 1 ? "" : "s"} (for ROI by capability)</summary>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {project.workloads.filter((w) => w.kind !== "fixed").map((w) => (
            <label key={w.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={c.workloadIds.includes(w.id)} onChange={(e) => upd((x) => { x.workloadIds = e.target.checked ? [...x.workloadIds, w.id] : x.workloadIds.filter((y) => y !== w.id); })} />
              <span className="truncate">{w.label}</span>
            </label>
          ))}
          {project.build.workstreams.map((w) => (
            <label key={w.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={c.workstreamIds.includes(w.id)} onChange={(e) => upd((x) => { x.workstreamIds = e.target.checked ? [...x.workstreamIds, w.id] : x.workstreamIds.filter((y) => y !== w.id); })} />
              <span className="truncate">{`Build: ${w.label}`}</span>
            </label>
          ))}
        </div>
      </details>
      <div className="rounded bg-surface-2 px-2 py-1.5 text-xs">
        <div className="num">{h.formula}</div>
        <div className="mt-0.5 font-semibold">{fmt(h.net)} h × {cad(rate)}/h = {cad(h.net * rate)} / month at full rollout</div>
      </div>
    </div>
  );
}

function MonthItems({ title, hint, items, onAdd, onChange, onRemove, amountLabel, H }: {
  title: string; hint: string; items: { id: string; label: string; amount: number; from: number; to?: number }[]; amountLabel: string; H: number;
  onAdd: () => void; onChange: (i: number, k: "label" | "amount" | "from" | "to", v: string | number) => void; onRemove: (i: number) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-1.5 text-xs text-muted">{hint}</p>
      {items.map((it, i) => (
        <div key={it.id} className="mb-2 grid grid-cols-[1fr_auto] items-end gap-2 rounded-md border border-line p-2">
          <input className="col-span-2 min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={it.label} aria-label={title} onChange={(e) => onChange(i, "label", e.target.value)} />
          <div className={cn("grid gap-2", it.to !== undefined ? "grid-cols-3" : "grid-cols-2")}>
            <Field label={amountLabel} help="itemAmount"><NumberInput value={it.amount} onChange={(v) => onChange(i, "amount", v)} /></Field>
            <Field label={it.to !== undefined ? "From month" : "Month"} help="itemFrom"><NumberInput value={it.from} min={1} max={H} onChange={(v) => onChange(i, "from", v)} /></Field>
            {it.to !== undefined && <Field label="To month" help="itemTo"><NumberInput value={it.to} min={1} max={H} onChange={(v) => onChange(i, "to", v)} /></Field>}
          </div>
          <TrashButton label={`Remove ${title}`} onClick={() => onRemove(i)} />
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
  const modelChoices = (id: string) => (llmWorkloads.find((w) => w.id === id)?.kind === "embeddings" ? deploymentOptions(catalog.embeddingModels) : modelOptions());
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
    return <div className={cn("text-xs", good ? "text-good" : "text-crit")}>{dlt > 0 ? "+" : "−"}{cad(Math.abs(dlt))}</div>;
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-auto">
        <table className="data">
          <thead><tr><th>Scenario</th><th className="n">Build</th><th className="n">Run / month</th><th className="n">Payback</th><th className="n">ROI</th><th className="n">NPV</th><th /></tr></thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.id} style={i === 0 ? { background: "var(--surface-2)" } : undefined}>
                <td>{r.label}{r.error && <div className="text-xs text-crit">{r.error}</div>}</td>
                <td className="n">{cad(r.ledger.totals.build)}{i > 0 && delta(r.ledger.totals.build, base.ledger.totals.build, true)}</td>
                <td className="n">{cad(r.ledger.totals.runRate)}{i > 0 && delta(r.ledger.totals.runRate, base.ledger.totals.runRate, true)}</td>
                <td className="n">{r.roi.paybackMonth ? `M${r.roi.paybackMonth}` : "–"}</td>
                <td className="n">{fmt(r.roi.roi * 100)}%</td>
                <td className="n">{cad(r.roi.npv)}{i > 0 && delta(r.roi.npv, base.roi.npv)}</td>
                <td className="whitespace-nowrap">{i > 0 && !r.error && (
                  <>
                    <button type="button" className="rounded border border-line px-1.5 text-xs hover:bg-surface-2" title="Make this the project" onClick={() => { const s = project.scenarios.find((x) => x.id === r.id)!; const q = applyScenario(project, s, catalog); q.scenarios = project.scenarios.filter((x) => x.id !== r.id); replace(q); }}>Adopt</button>{" "}
                  </>
                )}{i > 0 && <TrashButton label={`Delete ${r.label}`} onClick={() => edit((d) => { d.scenarios = d.scenarios.filter((x) => x.id !== r.id); })} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-md border border-line p-3">
        <h3 className="mb-2 text-sm font-semibold">New scenario</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] items-end gap-2.5">
          <Field label="Change" help="scnChange"><Select value={kind} onChange={(v) => setKind(v as EditKind)} options={[{ value: "model", label: "Model for a workload" }, { value: "scale", label: "Usage volume (%)" }, { value: "buildMonths", label: "Build months" }, { value: "developers", label: "Experimenting developers" }, { value: "lever", label: "Apply a savings lever" }, { value: "preset", label: "Benefit preset" }]} /></Field>
          {kind === "model" && <><Field label="Workload" help="scnWorkload"><Select value={wid} onChange={(v) => { setWid(v); setModel(modelChoices(v)[0]?.value ?? ""); }} options={llmWorkloads.map((w) => ({ value: w.id, label: w.label }))} /></Field><Field label="Model" help="scnModel"><Select value={modelChoices(wid).some((o) => o.value === model) ? model : (modelChoices(wid)[0]?.value ?? "")} onChange={setModel} options={modelChoices(wid)} /></Field></>}
          {(kind === "scale" || kind === "buildMonths" || kind === "developers") && <Field label={kind === "scale" ? "Percent of baseline" : kind === "buildMonths" ? "Months" : "People"} help="scnValue"><NumberInput value={num} min={kind === "scale" ? 1 : 1} max={kind === "scale" ? 1000 : 24} onChange={setNum} /></Field>}
          {kind === "lever" && <Field label="Lever" help="scnLever"><Select value={lever} onChange={setLever} options={LEVERS.map((l) => ({ value: l.id, label: l.label }))} /></Field>}
          {kind === "preset" && <Field label="Preset" help="scnPreset"><Select value={preset} onChange={(v) => setPreset(v as typeof preset)} options={[{ value: "conservative", label: "Conservative" }, { value: "typical", label: "Typical" }, { value: "optimistic", label: "Optimistic" }]} /></Field>}
          <button type="button" className="flex h-[30px] w-fit items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium hover:bg-surface-2" onClick={addEdit}><Plus size={14} />Add change</button>
        </div>
        {draft.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">{draft.map((d, i) => <Pill key={i}>{d.text}</Pill>)}</div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Name" help="scnName"><TextInput placeholder={draft.map((x) => x.text).join(", ")} value={label} onChange={setLabel} /></Field>
              <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink" onClick={save}>Save scenario</button>
              <button type="button" className="rounded-md border border-line px-3 py-1.5 text-xs" onClick={() => setDraft([])}>Clear</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
