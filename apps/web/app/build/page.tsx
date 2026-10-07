"use client";
import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { envCost, showsAiExperiments, ACTIVITY_KINDS, ALLOWANCE_ID, MANUAL_METER, allowanceActive, PLAN_SHAPES, applyShape, devLabByMeter, developerBreakdown, labourExcluded, labourPartialText, hasPlan, inPlanWindow, WORKSTREAM_TEMPLATES, addWorkstreamFromTemplate, newActivity, planValues, addAllocationPeriod, allocationPeriods, overlappingPeriods, peakAllocation, removeAllocationPeriod, removeWorkstream, setAllocation, updateAllocationPeriod, setPlanValue, workstreamBreakdown, hypercareExtends, lineWindow, lineMonthlyHours, setEffort, setEffortMode, setLinePhase, type DevActivity, type PlanShape, type Workstream } from "@roi-calculator/engine";
import { RateCardEditor } from "@/components/rate-card";
import { AiAssistPanel, TestEnvironmentsPanel, ToolsPanel } from "@/components/engineering-lab";
import { DeliveryCostsPanel, PhasesPanel } from "@/components/delivery-model";
import { HelpTip } from "@/components/help-tip";
import { Card, CardHead, Field, GroupHead, ListRow, NumberInput, Seg, Select, TrashButton, listboxKeys } from "@/components/ui";
import { CostGrid } from "@/components/cost-grid";
import { Explain } from "@/components/explain";
import { MonthLegend, MonthTh, TableNote, WhereFrom } from "@/components/months";
import { MONTH_TABLE_NOTES } from "@/lib/months";
import { LabourExcludeToggle } from "@/components/labour-excluded";
import { activityKindsFor } from "@/lib/nav";
import { AddMenu, ItemHeader } from "@/components/add-menu";
import { Legend, Spark, StackedBars } from "@/components/charts";
import { ACTIVITY_SPECS, Fields } from "@/components/fields";
import { FeatureSelect } from "@/components/feature-fields";
import { catalog, modelOptions, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)"];

export default function Build() {
  const [sel, setSel] = useState("all");
  const [expOpen, setExpOpen] = useState(true);
  const { project, ledger } = useLedger();
  const B = project.timeline.buildMonths;
  const buildMonths = ledger.months.slice(0, B);
  const acts = project.build.activities.filter((a) => a.kind !== "tooling");
  const tooling = project.build.activities.find((a) => a.kind === "tooling");
  const showExperiments = showsAiExperiments(project);
  const toolCost = (id: string) => buildMonths.reduce((t, m) => t + m.lines.filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0), 0);
  const assist = project.build.aiAssist;
  const series = (id: string) => buildMonths.map((m) => m.lines.filter((l) => l.componentId === id && l.stream === "devlab").reduce((s, l) => s + l.cost, 0));
  const devEnv = buildMonths.map((m) => m.byStream.devenv);
  const envNote = buildMonths.some((m) => envCost(m) > 0) ? ` and environments (${cad(buildMonths.reduce((t, m) => t + envCost(m), 0))}, see Infrastructure)` : "";
  const deliveryTotal = buildMonths.reduce((s, m) => s + (m.byStream.delivery ?? 0), 0);
  const devTotal = ledger.totals.devLab, labTotal = ledger.totals.buildLabour;
  const allDev = buildMonths.map((m) => m.byStream.devlab);
  const edit = useStudio((s) => s.edit);
  const wsRows = workstreamBreakdown(project, ledger);
  const wsName = (id: string) => project.build.workstreams.find((w) => w.id === id)?.label ?? id;

  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Card>
        <CardHead title={`Build, months 1–${B}`} sub={labourExcluded(project) ? `Engineering tools & lab, dev environment and delivery costs${envNote}. Build labour excluded` : labourPartialText(project) ? `Labour, engineering tools & lab, dev environment and delivery costs${envNote}. ${labourPartialText(project)}` : `Labour, engineering tools & lab, dev environment and delivery costs${envNote}`}><span className="num text-sm">{cad(ledger.totals.build)}</span></CardHead>
        <div data-tour="build-list" role="listbox" aria-label="Build cost items" aria-orientation="vertical" onKeyDown={listboxKeys} className="min-h-0 flex-1 overflow-auto">
          <ListRow selected={sel === "all"} onClick={() => setSel("all")} title="Engineering tools & lab, by month" sub="tools, AI-assisted development and AI experiments while building" aside={<Spark values={allDev} color="var(--s2)" />} value={cad(devTotal)} />
          <GroupHead>Labour</GroupHead>
          <ListRow selected={sel === "team"} onClick={() => setSel("team")} title="Team & rate card" sub={!labourExcluded(project) ? project.build.team.map((t) => t.name ?? `${t.people} ${project.rateCard.find((r) => r.id === t.roleId)?.label ?? t.roleId}`).join(" · ") : "Build labour excluded: the team only drives lab volumes"} value={labourExcluded(project) ? "Excluded" : cad(labTotal)} />
          <GroupHead>Delivery</GroupHead>
          <ListRow selected={sel === "phases"} onClick={() => setSel("phases")} title="Delivery phases" sub={(project.timeline.phases ?? []).length ? (project.timeline.phases ?? []).map((x) => x.label).join(" · ") : "Not set: use the standard phases or add your own"} value={(project.timeline.phases ?? []).length ? `${(project.timeline.phases ?? []).length} phases` : "None"} />
          <ListRow selected={sel === "delivery"} onClick={() => setSel("delivery")} title="Delivery costs" sub={(project.build.deliveryCosts ?? []).length ? (project.build.deliveryCosts ?? []).map((x) => x.label).join(" · ") : "Vendor work, training, communications, data migration"} value={cad(deliveryTotal)} />
          <GroupHead>Workstreams</GroupHead>
          {wsRows.filter((r) => r.id).map((r) => (
            <ListRow key={r.id} selected={sel === `ws:${r.id}`} onClick={() => setSel(`ws:${r.id}`)} title={r.label} sub={`${fmt(r.people, 1)} people · ${acts.filter((a) => a.workstreamId === r.id).length} activities`} aside={<Spark values={r.byMonth} color="var(--s3)" />} value={cad(r.total)} />
          ))}
          <div className="px-3.5 py-2.5">
            <AddMenu label="Add workstream" items={WORKSTREAM_TEMPLATES.map((t) => ({ kind: t.id, label: t.label, detail: t.detail }))} onPick={(t) => {
              let id = "";
              edit((d) => { id = addWorkstreamFromTemplate(d, t, t === "empty" ? "New workstream" : WORKSTREAM_TEMPLATES.find((x) => x.id === t)!.label); });
              if (id) setSel(`ws:${id}`);
            }} />
            {project.build.workstreams.length === 0 && <p className="mt-1.5 text-xs text-muted">A workstream is a feature (one or more agents). Allocate people to it to cost the build per feature and per developer.</p>}
          </div>
          <GroupHead>Engineering tools & lab</GroupHead>
          <ListRow selected={sel === "env"} onClick={() => setSel("env")} title="Tools and licences" sub={project.build.environment.length ? project.build.environment.map((e) => e.label).join(" · ") : "IDE, CI/CD, test tooling, load testing, dev services"} value={cad(devEnv.reduce((x, y) => x + y, 0))} />
          <ListRow selected={sel === "testenv"} onClick={() => setSel("testenv")} title="Test environments" sub="Dev, test and UAT, modelled on Infrastructure" value={cad(buildMonths.reduce((t, m) => t + envCost(m), 0))} />
          <ListRow selected={sel === "aiassist"} onClick={() => setSel("aiassist")} title="AI-assisted development" sub={assist ? `Hours saved: ${Object.entries(assist.productivityPctByRole).map(([r, v]) => `${project.rateCard.find((x) => x.id === r)?.label ?? r} ${v}%`).join(" · ")}` : tooling ? "Seats and tokens set; no hours saved entered" : "Hours saved per role, against seat and token cost"} value={tooling ? cad(toolCost(tooling.id)) : assist ? "C$0" : "Not set"} />
          {showExperiments && (
            <>
              <button type="button" aria-expanded={expOpen} aria-controls="ai-experiments" onClick={() => setExpOpen((o) => !o)} className="flex w-full items-center justify-between px-3.5 pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:text-ink">
                <span>AI experiments ({acts.length})</span><ChevronDown size={14} className={`transition-transform motion-reduce:transition-none ${expOpen ? "" : "-rotate-90"}`} aria-hidden="true" />
              </button>
              {expOpen && (
                <div id="ai-experiments">
                  {acts.map((a) => (
                    <ListRow key={a.id} selected={sel === a.id} onClick={() => setSel(a.id)} title={a.label} sub={`${a.workstreamId ? `${wsName(a.workstreamId)} · ` : ""}${describe(a)}`} aside={<Spark values={series(a.id)} color={COLORS[project.build.activities.indexOf(a) % COLORS.length]!} />} value={cad(series(a.id).reduce((x, y) => x + y, 0))} />
                  ))}
                  <div className="px-3.5 py-2.5"><AddActivity onAdded={setSel} /></div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
      <Card>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto scroll-hint p-3.5">
          {sel === "all" ? <AllActivities /> : sel === "team" ? <Team /> : sel === "env" ? <ToolsPanel onOpenAi={() => setSel("aiassist")} /> : sel === "testenv" ? <TestEnvironmentsPanel /> : sel === "aiassist" ? <AiAssistPanel onRemoved={() => setSel("aiassist")} /> : sel === "phases" ? <PhasesPanel /> : sel === "delivery" ? <DeliveryCostsPanel /> : sel.startsWith("ws:") ? <WorkstreamPanel id={sel.slice(3)} onRemoved={() => setSel("all")} onOpen={setSel} /> : <Activity id={sel} onRemoved={() => setSel("all")} />}
        </div>
      </Card>
    </div>
  );
}

/** Which Dev Lab activities change when developers are added or removed. Labour always does. */
const SCALES_WITH_PEOPLE: ReadonlySet<DevActivity["kind"]> = new Set(["iterations", "playground", "tooling"]);

/** Plain-language inputs behind each activity's cost, for the "Where this comes from" line. */
const ACTIVITY_SOURCE: Record<DevActivity["kind"], string> = {
  bakeoff: "The candidate models and their months, the evaluation cases, repeats and sweeps per month set above, with each model's price from Prices & sources. It runs once, however many developers there are.",
  iterations: "Developers who run experiments (Team & rate card), runs per developer per day, cases per run and working days set above, priced with the harness model's rates. It grows with headcount.",
  regression: "Runs per month and cases per run set above, from the start month shown, priced with the harness model's rates. It does not change with headcount.",
  evaluation: "The judge model, token sizes and evaluators set above, applied to the runs the other activities make. It follows those runs, not headcount.",
  redteam: "Scans per month, risk categories, objectives and attack strategies set above, priced with the target model's rates. It does not change with headcount.",
  playground: "Developers who run experiments (Team & rate card), calls per developer per day and tokens per call set above. It grows with headcount.",
  tooling: "Copilot seats per developer and the coding agent's tokens per developer day set above, times the number of developers on Team & rate card. It grows with headcount.",
  synthetic: "Examples kept per month, pass rate, and the generator and judge token sizes set above. It does not change with headcount.",
  finetune: "Training runs, examples, tokens per example and epochs set above, plus tuned deployments kept and their hosting hours. It does not change with headcount.",
};

function describe(a: DevActivity): string {
  switch (a.kind) {
    case "bakeoff": return `${a.candidates.length} models × ${a.cases} cases × ${a.repeats} repeats`;
    case "iterations": return `${a.runsPerDevPerDay} runs/dev/day × ${a.subsetCases} cases`;
    case "regression": return `${a.runsPerMonth} runs/month × ${a.cases} cases from M${a.fromMonth}`;
    case "evaluation": return `${a.evaluators.length} quality + ${a.safetyEvaluators} safety evaluators`;
    case "redteam": return `${a.scansPerMonth} scans/month from M${a.fromMonth}`;
    case "playground": return `${a.callsPerDevPerDay} calls/dev/day`;
    case "tooling": return `Copilot + coding agent tokens`;
    case "synthetic": return `${a.acceptedPerMonth.toLocaleString("en-CA")} kept/month at ${Math.round(a.passRate * 100)}% pass rate`;
    case "finetune": return `${a.runsPerMonth} runs/month · ${a.deployments} hosted`;
  }
}

function AllActivities() {
  const { project, ledger } = useLedger();
  const [view, setView] = useState<"chart" | "grid" | "plan" | "ws" | "people" | "models">("chart");
  const B = project.timeline.buildMonths, months = ledger.months.slice(0, B), acts = project.build.activities;
  const allowance = allowanceActive(project);
  const parts = allowance ? [{ id: ALLOWANCE_ID, label: "Fixed monthly allowance" }] : acts;
  const rows = months.map((m) => Object.fromEntries(parts.map((a) => [a.id, m.lines.filter((l) => l.componentId === a.id && l.stream === "devlab").reduce((s, l) => s + l.cost, 0)])));
  const series = parts.map((a, i) => ({ key: a.id, label: a.label, color: COLORS[i % COLORS.length]! }));
  const runRate = ledger.totals.runRate + ledger.totals.maintRate;
  const top = [...series].sort((a, b) => rows.reduce((s, r) => s + r[b.key]!, 0) - rows.reduce((s, r) => s + r[a.key]!, 0))[0];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-bold">Engineering tools & lab by month</h2><div className="text-xs text-muted">Seats, tokens and AI experiments. Labour and tools are shown separately</div></div>
        <Seg label="View" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "plan", label: "Plan" }, { value: "grid", label: "Cost grid" }, { value: "ws", label: "Workstreams" }, { value: "people", label: "People" }, { value: "models", label: "Models" }]} />
      </div>
      <div className="rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px]">
        <b>{cad(ledger.totals.devLab)} over {B} months</b>, the same as <b>{fmt(ledger.totals.devLab / Math.max(1, runRate), 1)} months</b> of production run cost including maintenance. {top ? <>The largest activity is <b>{top.label}</b>.</> : null}
        {allowance && <> A fixed allowance of <b>{cad(project.build.devLabMonthlyCad!)}</b> a month replaces the calculated spend (change it in Settings).</>}
      </div>
      <MonthLegend />
      {(view === "chart" || view === "grid") && <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      {view === "ws" ? <ByWorkstream /> : view === "people" ? <ByPerson /> : view === "models" ? <ByModel /> : view === "plan" ? <PlanGrid /> : view === "chart" ? (
        <StackedBars rows={rows} series={series} xLabel={(i) => `Month ${i + 1}`} className="relative min-h-[280px] flex-1" />
      ) : (
        <CostGrid />
      )}
    </>
  );
}

/** Editable activity × month plan: sweeps for bake-offs, intensity (1 = full) for the rest. */
function PlanGrid() {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const B = project.timeline.buildMonths;
  const months = Array.from({ length: B }, (_, i) => i + 1);
  const cost = (id: string, m: number) => ledger.months[m - 1]!.lines.filter((l) => l.componentId === id && l.stream === "devlab").reduce((s, l) => s + l.cost, 0);
  const update = (id: string, fn: (a: Exclude<DevActivity, { kind: "evaluation" }>) => void) => edit((d) => { const a = d.build.activities.find((x) => x.id === id); if (a && hasPlan(a)) fn(a); });
  return (
    <div className="overflow-auto">
      <TableNote>
        <b>What the numbers are.</b> {MONTH_TABLE_NOTES.intensity} Bake-off rows are sweeps instead: {MONTH_TABLE_NOTES.sweeps.replace("Sweeps by month: ", "").replace(" Type a number in any cell to change it.", "")}
        {" "}The small C$ figure under each number is that month&apos;s cost. Greyed months are outside the activity&apos;s window. Use &quot;Apply...&quot; to fill a row from a shape. Evaluation follows the runs it scores, so it has no numbers to set.
      </TableNote>
      {allowanceActive(project) && <TableNote className="text-warn">A fixed monthly allowance is set in Settings, so the C$ figures below are not used in the totals while it applies.</TableNote>}
      <TableNote>{MONTH_TABLE_NOTES.headcount} Adding developers raises iterations, playground and tooling (and build labour); bake-off, regression, red teaming, synthetic data and fine-tuning stay the same.</TableNote>
      <table className="data">
        <thead><tr><th>Activity</th><th>Shape</th>{months.map((m) => <MonthTh key={m} m={m} />)}</tr></thead>
        <tbody>
          {project.build.activities.map((a) => {
            if (!hasPlan(a)) return <tr key={a.id}><td>{a.label}<small className="block text-muted">C$ per month, follows the runs it scores</small></td><td className="text-xs text-muted">follows runs</td>{months.map((m) => <td key={m} className="n text-xs text-muted">{cad(cost(a.id, m))}</td>)}</tr>;
            const vals = planValues(a, B);
            return (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{a.label}<small className="block text-muted">{a.kind === "bakeoff" ? "sweeps per month" : "intensity (1 = normal)"}</small><small className="block text-muted">{SCALES_WITH_PEOPLE.has(a.kind) ? "scales with people" : "fixed, not per person"}</small></td>
                <td className="w-32"><Select label={`Apply a shape to ${a.label}`} value="" options={[{ value: "", label: "Apply…" }, ...PLAN_SHAPES.map((s) => ({ value: s.id, label: s.label }))]} onChange={(v) => v && update(a.id, (x) => applyShape(x, v as PlanShape, B))} /></td>
                {months.map((m) => {
                  const on = inPlanWindow(a, m, B);
                  return (
                    <td key={m} className="n w-20" style={on ? undefined : { opacity: 0.4 }} title={on ? `${cad(cost(a.id, m))} in month ${m}` : "Outside the activity's window"}>
                      <NumberInput label={`${a.label}, month ${m}`} value={vals[m - 1]!} step={a.kind === "bakeoff" ? 1 : 0.1} onChange={(v) => update(a.id, (x) => setPlanValue(x, m, v, B))} />
                      <small className="block text-xs text-muted">{cad(cost(a.id, m))}</small>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ByWorkstream() {
  const { project, ledger } = useLedger();
  const rows = workstreamBreakdown(project, ledger);
  const B = project.timeline.buildMonths;
  if (project.build.workstreams.length === 0) return <p className="text-sm text-muted">No workstreams yet. Add one from the list to split the build by feature.</p>;
  return (
    <div className="overflow-auto">
      <TableNote>Build cost by feature (workstream) and month, in C$. Labour comes from the people you allocate to each workstream (Team &amp; rate card), and engineering tools & lab from the activities assigned to it. {MONTH_TABLE_NOTES.headcount}</TableNote>
      <table className="data">
        <thead><tr><th>Workstream</th><th className="n">People (avg)</th><th className="n">Labour</th><th className="n">Engineering tools & lab</th><th className="n">Total</th>{Array.from({ length: B }, (_, i) => <MonthTh key={i} m={i + 1} />)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id || "project"}>
              <td>{r.label}{!r.id && <small className="block text-muted">unallocated time, shared activities, dev environment</small>}</td>
              <td className="n">{fmt(r.people, 2)}</td><td className="n">{cad(r.labour)}</td><td className="n">{cad(r.devlab)}</td><td className="n font-semibold">{cad(r.total)}</td>
              {r.byMonth.map((v, i) => <td key={i} className="n">{cad(v)}</td>)}
            </tr>
          ))}
          <tr className="total"><td>Total</td><td /><td className="n">{cad(rows.reduce((s, r) => s + r.labour, 0))}</td><td className="n">{cad(rows.reduce((s, r) => s + r.devlab, 0))}</td><td className="n">{cad(ledger.totals.build)}</td>{Array.from({ length: B }, (_, i) => <td key={i} className="n">{cad(rows.reduce((s, r) => s + r.byMonth[i]!, 0))}</td>)}</tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Capabilities that link a workstream (on Value &amp; ROI, or in the workstream panel) carry its build cost as direct cost; project-wide cost is shared.</p>
    </div>
  );
}

function ByPerson() {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const { rows, unattributed } = developerBreakdown(project, ledger);
  const B = project.timeline.buildMonths;
  const budget = project.build.devBudgetPerMonth;
  const shown = rows.filter((r) => r.devlab > 0 || r.labour > 0);
  return (
    <div className="flex flex-col gap-3 overflow-auto">
      <TableNote className="mb-0">Spend per person by month, in C$ per person. It is the team&apos;s engineering lab spend divided by the developers running experiments, so removing a developer raises everyone else&apos;s share only for activities that do not scale with people (bake-off, regression, red teaming).</TableNote>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Engineering tools & lab budget per person per month" help="devBudget"><NumberInput value={budget ?? 0} suffix="CAD" onChange={(v) => edit((d) => { d.build.devBudgetPerMonth = v > 0 ? v : undefined; })} /></Field>
        <p className="max-w-md text-xs text-muted">Monthly columns are engineering tools & lab spend per person. Workstream activities are charged to the people on that workstream by their share; project-wide ones to everyone running experiments. 0 = no budget. This is a limit the plan is checked against; it never changes the cost. A fixed monthly engineering tools & lab allowance (Settings) does change the cost, and this per-person limit is then checked against that allowance. The same two settings are under Settings, engineering tools & lab.</p>
      </div>
      <table className="data">
        <thead><tr><th>Person / line</th><th className="n">Labour</th><th className="n">Engineering tools & lab</th>{Array.from({ length: B }, (_, i) => <MonthTh key={i} m={i + 1} />)}</tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.seat}>
              <td className="whitespace-nowrap">{r.label}</td><td className="n">{cad(r.labour)}</td><td className="n font-semibold">{cad(r.devlab)}</td>
              {r.perPersonByMonth.map((v, i) => {
                const over = r.overBudget.includes(i + 1);
                return <td key={i} className="n" style={over ? { background: "var(--crit-soft)", color: "var(--crit)", fontWeight: 600 } : undefined} title={over ? `Over the ${cad(budget!)} budget` : undefined}>{cad(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {unattributed > 0.5 && <p className="text-xs text-warn">{cad(unattributed)} of engineering lab spend is on workstreams with nobody allocated in that month.</p>}
      {budget && shown.some((r) => r.overBudget.length) ? <p className="text-xs text-crit">Red months are over the budget of {cad(budget)} per person.</p> : null}
    </div>
  );
}

function ByModel() {
  const { project, ledger } = useLedger();
  const rows = devLabByMeter(ledger, project.timeline.buildMonths);
  const total = rows.reduce((s, r) => s + r.cost, 0) || 1;
  const name = (m: string) => m === MANUAL_METER ? "Typed in by hand (cells and allowance)" : catalog.chatModels.find((c) => c.id === m)?.label ?? catalog.unitPrices.find((u) => u.id === m)?.label ?? m;
  return (
    <div className="flex flex-col gap-1.5">
      <TableNote>Total engineering tools & lab spend on each model or service over all {project.timeline.buildMonths} build months, in C$ and as a share of the engineering tools & lab total. Each bar adds up every activity that uses that model.</TableNote>
      <WhereFrom to="/prices" toLabel="Prices & sources">the models chosen on each activity, the tokens those activities use, and each model&apos;s price.</WhereFrom>
      {rows.map((r) => (
        <div key={r.meter} className="grid grid-cols-[minmax(140px,240px)_1fr_auto] items-center gap-2.5 text-[12.5px]">
          <span className="truncate">{name(r.meter)}</span>
          <span className="h-3 rounded-r" style={{ width: `${Math.max(1, (r.cost / rows[0]!.cost) * 100)}%`, background: "var(--s1)" }} />
          <span className="num w-28 text-right">{cad(r.cost)} <small className="text-muted">{fmt((r.cost / total) * 100)}%</small></span>
        </div>
      ))}
    </div>
  );
}

function WorkstreamPanel({ id, onRemoved, onOpen }: { id: string; onRemoved: () => void; onOpen: (sel: string) => void }) {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const w = project.build.workstreams.find((x) => x.id === id);
  if (!w) return null;
  const row = workstreamBreakdown(project, ledger).find((r) => r.id === id)!;
  const acts = project.build.activities.filter((a) => a.workstreamId === id);
  const rates = new Map(project.rateCard.map((r) => [r.id, r.label]));
  const upd = (fn: (x: Workstream) => void) => edit((d) => { const x = d.build.workstreams.find((y) => y.id === id); if (x) fn(x); });
  return (
    <>
      <ItemHeader label={w.label} sub="A feature built as a unit: its people, activities and the capabilities it delivers" removeLabel="Remove workstream"
        onRename={(v) => upd((x) => { x.label = v; })}
        onRemove={() => { edit((d) => removeWorkstream(d, id)); onRemoved(); }} />
      {row.people === 0 && acts.some((a) => a.kind === "iterations" || a.kind === "playground") && (
        <div role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">Nobody is allocated to this workstream yet, so its iterations and playground work cost nothing. Give people a share of their time below.</div>
      )}
      <div className="max-w-xs"><FeatureSelect value={w.featureId} onChange={(v) => upd((x) => { if (v) x.featureId = v; else delete x.featureId; })} /></div>
      <div className="font-display text-[26px] font-bold">{cad(row.total)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">{cad(row.labour)} labour · {cad(row.devlab)} engineering tools & lab · {fmt(row.people, 2)} people on average</span></div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">People</h3>
        <table className="data">
          <thead><tr><th>Team line</th><th className="n">Share of their time</th><th className="n">From month</th><th className="n">To month</th><th /></tr></thead>
          <tbody>
            {project.build.team.flatMap((t, seat) => {
              const B = project.timeline.buildMonths;
              const who = <>{t.name ? `${t.name} (${rates.get(t.roleId) ?? t.roleId})` : `${t.people} × ${rates.get(t.roleId) ?? t.roleId}`}{t.phase ? <small className="text-muted"> · {t.phase}</small> : null}</>;
              const periods = allocationPeriods(project, seat, id);
              if (!periods.length) {
                return [(
                  <tr key={`${seat}-none`} style={{ opacity: 0.6 }}>
                    <td>{who}</td>
                    <td className="n w-36"><NumberInput label={`${who} share`} value={0} max={100} suffix="%" onChange={(v) => edit((d) => setAllocation(d, seat, id, v / 100))} /></td>
                    <td /><td /><td />
                  </tr>
                )];
              }
              const total = peakAllocation(project, seat);
              const overlap = overlappingPeriods(project, seat, id);
              const roomLeft = periods.at(-1)!.toMonth + 2 <= B;
              return periods.map((a, k) => (
                <tr key={`${seat}-${a.index}`}>
                  <td>
                    {k === 0 ? who : <span className="pl-3 text-muted">↳ back on this workstream</span>}
                    {k === periods.length - 1 && total > 1.005 && <small className="block text-crit">Up to {Math.round(total * 100)}% allocated in some months, so shares are scaled down then</small>}
                    {k === periods.length - 1 && overlap && <small className="block text-crit">These periods overlap: the shares add up in the shared months</small>}
                    {k === periods.length - 1 && roomLeft && (
                      <button type="button" className="mt-0.5 block text-xs text-accent underline" onClick={() => edit((d) => { addAllocationPeriod(d, seat, id); })}>Add another period (comes back later)</button>
                    )}
                  </td>
                  <td className="n w-36"><NumberInput label={`${who} share, period ${k + 1}`} value={Math.round(a.share * 100)} max={100} suffix="%" onChange={(v) => edit((d) => { if (v > 0) updateAllocationPeriod(d, seat, a.index, { share: v / 100 }); else removeAllocationPeriod(d, seat, a.index); })} /></td>
                  <td className="n w-24"><NumberInput label={`${who} from month, period ${k + 1}`} value={a.fromMonth} min={1} max={B} onChange={(v) => edit((d) => updateAllocationPeriod(d, seat, a.index, { fromMonth: Math.round(v) }))} /></td>
                  <td className="n w-24"><NumberInput label={`${who} to month, period ${k + 1}`} value={a.toMonth} min={1} max={B} onChange={(v) => edit((d) => updateAllocationPeriod(d, seat, a.index, { toMonth: Math.round(v) }))} /></td>
                  <td>{periods.length > 1 && <TrashButton label="Remove period" onClick={() => edit((d) => removeAllocationPeriod(d, seat, a.index))} />}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
        <p className="mt-1.5 text-xs text-muted">Someone who leaves this workstream and returns later gets a second period. Months outside every period are spent elsewhere (another workstream or project-wide).</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Delivers capabilities</h3>
          {project.benefits.capabilities.length === 0 && <p className="text-xs text-muted">No capabilities yet (Value &amp; ROI).</p>}
          {project.benefits.capabilities.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-0.5 text-[12.5px]">
              <input type="checkbox" checked={c.workstreamIds.includes(id)} onChange={(e) => edit((d) => { const x = d.benefits.capabilities.find((y) => y.id === c.id)!; x.workstreamIds = e.target.checked ? [...x.workstreamIds, id] : x.workstreamIds.filter((y) => y !== id); })} />
              {c.label}
            </label>
          ))}
          <p className="mt-1 text-xs text-muted">Its build cost becomes direct cost of these capabilities (split evenly). Unlinked, it is shared across all.</p>
        </div>
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Agents and evaluation</h3>
          {project.harnesses.map((h) => (
            <label key={h.id} className="flex items-center gap-2 py-0.5 text-[12.5px]">
              <input type="checkbox" checked={w.harnessIds.includes(h.id)} onChange={(e) => upd((x) => { x.harnessIds = e.target.checked ? [...x.harnessIds, h.id] : x.harnessIds.filter((y) => y !== h.id); })} />
              {h.label}
            </label>
          ))}
          <label className="mt-2 flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={w.evaluated} onChange={(e) => upd((x) => { x.evaluated = e.target.checked; })} />Evaluated (evaluation activities score its runs)</label>
        </div>
      </div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Activities</h3>
        {acts.length === 0 && <p className="text-xs text-muted">None yet. Add one here, or set the workstream on an existing activity.</p>}
        <div className="flex flex-wrap gap-1.5">
          {acts.map((a) => <button key={a.id} type="button" className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface-2" onClick={() => onOpen(a.id)}>{a.label}</button>)}
        </div>
        <div className="mt-2">
          <AddMenu label="Add activity to this workstream" items={activityKindsFor(project, ACTIVITY_KINDS)} onPick={(kind) => {
            let newId = "";
            edit((d) => {
              const a = newActivity(d, kind);
              a.workstreamId = id;
              a.label = `${a.label} (${w.label})`;
              if ("harnessId" in a && w.harnessIds[0]) a.harnessId = w.harnessIds[0];
              newId = a.id; d.build.activities.push(a);
            });
            if (newId) onOpen(newId);
          }} />
        </div>
      </div>
      <StackedBars rows={row.byMonth.map((v) => ({ v }))} series={[{ key: "v", label: w.label, color: "var(--s3)" }]} xLabel={(k) => `Month ${k + 1}`} className="relative h-[180px] flex-none" />
    </>
  );
}

function Team() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const B = project.timeline.buildMonths;
  const { ledger } = useLedger();
  const roles = project.rateCard.map((r) => ({ value: r.id, label: r.label }));
  const perLine = developerBreakdown(project, ledger).rows;
  const allOff = !project.build.includeLabour;
  const phases = project.timeline.phases ?? [];
  /** Last month a line can be billed: the build, or for a hypercare line the end of the hypercare phase. */
  const maxTo = (t: (typeof project.build.team)[number]) => (t.phaseId === "hypercare" && hypercareExtends(project) ? Math.min(phases.find((x) => x.id === "hypercare")!.toMonth, project.timeline.horizonMonths) : B);
  const field = "rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";
  return (
    <>
      <div><h2 className="text-base font-bold">Team & rate card</h2><div className="text-xs text-muted">Labour for the build in CAD. Ticked lines run AI experiments and drive per-developer lab volumes.</div></div>
      <div className="font-display text-[26px] font-bold">{labourExcluded(project) ? "Excluded" : cad(ledger.totals.buildLabour)}</div>
      {labourPartialText(project) && <p className="rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">{labourPartialText(project)}. Unticked lines still count as people for the engineering tools & lab but add no cost.</p>}
      <LabourExcludeToggle />
      {!project.build.includeLabour && <p className="rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">Build labour excluded: nothing below is costed. People and experiment ticks still set the engineering tools & lab volumes, and the rates still value time saved and maintenance.</p>}
      <div className="flex-none overflow-x-auto">
      <table className="data">
        <thead><tr><th><span className="inline-flex items-center gap-0.5">Costed<HelpTip id="teamCosted" label="Costed" /></span></th><th>Name</th><th><span className="inline-flex items-center gap-0.5">Phase<HelpTip id="teamPhase" label="Phase" /></span></th><th>Role</th><th className="n">People</th><th className="n"><span className="inline-flex items-center gap-0.5">Effort<HelpTip id="teamEffortMode" label="Effort" /></span></th><th className="n">From</th><th className="n">To</th><th>Experiments</th><th className="n"><span className="inline-flex items-center gap-0.5">Manual rate (CAD/h)<HelpTip id="rateOverride" label="Manual rate" /></span></th><th className="n">Build cost</th><th /></tr></thead>
        <tbody>
          {project.build.team.map((t, i) => (
            <tr key={i}>
              <td><input type="checkbox" checked={!allOff && t.costed !== false} disabled={allOff} title={allOff ? "All build labour is excluded by the project switch above" : undefined} onChange={(e) => edit((d) => { if (e.target.checked) delete d.build.team[i]!.costed; else d.build.team[i]!.costed = false; })} aria-label={`Costed, team row ${i + 1}`} /></td>
              <td><input aria-label="Name" className="w-24 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={t.name ?? ""} placeholder="(role)" onChange={(e) => edit((d) => { d.build.team[i]!.name = e.target.value || undefined; })} /></td>
              <td className="min-w-[150px]">
                {phases.length > 0 && <Select label={`Delivery phase, team row ${i + 1}`} value={phases.some((x) => x.id === t.phaseId) ? t.phaseId! : ""} options={[{ value: "", label: "No phase" }, ...phases.map((x) => ({ value: x.id, label: x.label }))]} onChange={(v) => edit((d) => setLinePhase(d, i, v || undefined))} />}
                <input aria-label="Phase" className={`${field} mt-1 w-full`} value={t.phase ?? ""} placeholder={phases.length > 0 ? "Own label (optional)" : "All build"} onChange={(e) => edit((d) => { d.build.team[i]!.phase = e.target.value || undefined; })} />
              </td>
              <td className="min-w-[150px]"><Select label={`Role, team row ${i + 1}`} value={t.roleId} options={roles} onChange={(v) => edit((d) => { d.build.team[i]!.roleId = v; })} /></td>
              <td className="n min-w-[80px]"><NumberInput label={`People, team row ${i + 1}`} value={t.people} step={0.1} onChange={(v) => edit((d) => { if (d.build.team[i]!.effort) setEffort(d, i, { people: v }); else d.build.team[i]!.people = v; })} /></td>
              <td className="n min-w-[190px]">
                <Select label={`Effort entry, team row ${i + 1}`} value={t.effort ? "effort" : "hours"} options={[{ value: "hours", label: "Hours per month" }, { value: "effort", label: "People × weeks" }]} onChange={(v) => edit((d) => setEffortMode(d, i, v === "effort"))} />
                {t.effort ? (
                  <div className="mt-1 flex flex-col gap-1">
                    <NumberInput label={`Weeks, team row ${i + 1}`} value={t.effort.weeks} step={0.5} suffix="weeks" onChange={(v) => edit((d) => setEffort(d, i, { weeks: v }))} />
                    <NumberInput label={`Hours per week, team row ${i + 1}`} value={t.effort.hoursPerWeek} suffix="h/week" onChange={(v) => edit((d) => setEffort(d, i, { hoursPerWeek: v }))} />
                    <div className="text-xs text-muted">{fmt(t.effort.people * t.effort.weeks * t.effort.hoursPerWeek, 0)} h in total, {fmt(lineMonthlyHours(project, t), 1)} h a month over months {lineWindow(project, t).from}–{lineWindow(project, t).to}</div>
                  </div>
                ) : (
                  <div className="mt-1"><NumberInput label={`Hours per month, team row ${i + 1}`} value={t.hoursPerMonth} suffix="h/month" onChange={(v) => edit((d) => { d.build.team[i]!.hoursPerMonth = v; })} /></div>
                )}
              </td>
              <td className="n min-w-[72px]"><NumberInput label={`From month, team row ${i + 1}`} value={lineWindow(project, t).from} min={1} max={maxTo(t)} onChange={(v) => edit((d) => { d.build.team[i]!.fromMonth = Math.round(v); })} /></td>
              <td className="n min-w-[72px]"><NumberInput label={`To month, team row ${i + 1}`} value={lineWindow(project, t).to} min={1} max={maxTo(t)} onChange={(v) => edit((d) => { d.build.team[i]!.toMonth = Math.round(v); })} /></td>
              <td><input type="checkbox" checked={t.experiments} onChange={(e) => edit((d) => { d.build.team[i]!.experiments = e.target.checked; })} aria-label="Runs experiments" /></td>
              <td className="n min-w-[120px]">
                <input type="number" min={0} step="any" aria-label={`Manual rate, team row ${i + 1}`} className={`${field} w-24 text-right ${t.rateOverride !== undefined ? "border-accent" : ""}`} value={t.rateOverride ?? ""} placeholder={`${project.rateCard.find((r) => r.id === t.roleId)?.hourlyRate ?? 0} (rate card)`}
                  onChange={(e) => edit((d) => { const v = e.target.valueAsNumber; if (Number.isFinite(v) && v >= 0) d.build.team[i]!.rateOverride = v; else delete d.build.team[i]!.rateOverride; })} />
                {t.rateOverride !== undefined && <div className="mt-0.5 text-xs text-accent">Manual rate in use. Rate card: {cad(project.rateCard.find((r) => r.id === t.roleId)?.hourlyRate ?? 0)}/h</div>}
              </td>
              <td className="n num">{allOff || t.costed === false ? <span className="text-muted">Excluded</span> : cad(perLine[i]?.labour ?? 0)}</td>
              <td><TrashButton label="Remove line" onClick={() => edit((d) => { d.build.team.splice(i, 1); })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <WhereFrom>labour is people &times; hours per month &times; the hourly rate (the role&apos;s rate-card rate, or the manual rate on the line), for each month in the From and To window. With People &times; weeks, the total hours (people &times; weeks &times; hours per week) are spread evenly over those months. Only a line in the Hypercare phase can be billed after the last build month. It always changes with headcount. Developers ticked &quot;Experiments&quot; also drive the per-developer lab activities (iterations, playground, tooling). Change people, hours and months in the table above.</WhereFrom>
      {project.build.workstreams.length > 0 && <AllocationMatrix />}
      <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { d.build.team.push({ roleId: d.rateCard[0]!.id, people: 1, hoursPerMonth: 160, experiments: false }); })}><Plus size={14} />Add team line</button>
      <RateCardEditor />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
        <Field label="Contingency" help="contingency"><NumberInput value={project.build.contingencyPct} max={100} suffix="%" onChange={(v) => edit((d) => { d.build.contingencyPct = v; })} /></Field>
        <Field label="Contingency applies to" help="contingencyScope">
          <Select value={project.build.contingencyScope} options={[{ value: "labour", label: "Build labour only" }, { value: "all", label: "Labour, engineering tools & lab, environment, delivery and one-time costs" }]}
            onChange={(v) => edit((d) => { d.build.contingencyScope = v === "all" ? "all" : "labour"; })} />
        </Field>
      </div>
    </>
  );
}

/** Team line × workstream shares; the remainder is project-wide time. */
function AllocationMatrix() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const rates = new Map(project.rateCard.map((r) => [r.id, r.label]));
  const ws = project.build.workstreams;
  return (
    <div className="flex-none overflow-x-auto">
      <h3 className="mb-1.5 text-sm font-semibold">Time on each workstream</h3>
      <table className="data">
        <thead><tr><th>Team line</th>{ws.map((w) => <th key={w.id} className="n">{w.label}</th>)}<th className="n">Project-wide</th></tr></thead>
        <tbody>
          {project.build.team.map((t, seat) => {
            const total = peakAllocation(project, seat);
            const varies = (t.allocations ?? []).some((a) => a.fromMonth || a.toMonth);
            return (
              <tr key={seat}>
                <td className="whitespace-nowrap">{t.name ?? `${t.people} × ${rates.get(t.roleId) ?? t.roleId}`}{t.phase ? <small className="text-muted"> · {t.phase}</small> : null}</td>
                {ws.map((w) => (
                  <td key={w.id} className="n max-w-[104px]"><NumberInput label={`${t.name ?? t.roleId} on ${w.label}`} value={Math.round((t.allocations?.find((a) => a.workstreamId === w.id)?.share ?? 0) * 100)} max={100} suffix="%" onChange={(v) => edit((d) => setAllocation(d, seat, w.id, v / 100))} />
                    {(() => { const ps = allocationPeriods(project, seat, w.id); return ps.length > 1 || (ps[0] && (ps[0].fromMonth > 1 || ps[0].toMonth < project.timeline.buildMonths)) ? <small className="block text-xs text-muted">{ps.map((x) => `M${x.fromMonth}–${x.toMonth}`).join(", ")}</small> : null; })()}</td>
                ))}
                <td className="n" style={total > 1.005 ? { color: "var(--crit)", fontWeight: 600 } : undefined}>{total > 1.005 ? `${Math.round(total * 100)}%${varies ? " in some months" : ""} (scaled to 100%)` : varies ? `at least ${Math.round(Math.max(0, 1 - total) * 100)}%` : `${Math.round(Math.max(0, 1 - total) * 100)}%`}{varies ? <small className="block text-xs font-normal text-muted">varies by month</small> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-xs text-muted">Set the months someone spends on a workstream in its panel (e.g. moves from one feature to another in month 4). Labour follows these shares. Iterations and playground work in a workstream scale with the people on it; bake-offs, regression and red teaming in a workstream run once, however many people share it.</p>
    </div>
  );
}

function AddActivity({ onAdded }: { onAdded: (id: string) => void }) {
  const edit = useStudio((s) => s.edit);
  const project = useStudio((s) => s.project);
  return (
    <AddMenu label="Add activity" items={activityKindsFor(project, ACTIVITY_KINDS)} onPick={(kind) => {
      let id = "";
      edit((d) => { const a = newActivity(d, kind); id = a.id; d.build.activities.push(a); });
      if (id) onAdded(id);
    }} />
  );
}

function Activity({ id, onRemoved }: { id: string; onRemoved: () => void }) {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const a = project.build.activities.find((x) => x.id === id);
  if (!a) return null;
  const B = project.timeline.buildMonths;
  const months = ledger.months.slice(0, B);
  const lines = months.flatMap((m) => m.lines.filter((l) => l.componentId === id));
  const rows = months.map((m) => ({ v: m.lines.filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0) }));
  const i = project.build.activities.indexOf(a);
  const locate = (d: typeof project) => d.build.activities.find((x) => x.id === id) as unknown as Record<string, unknown>;
  return (
    <>
      <ItemHeader label={a.label} sub={describe(a)} removeLabel="Remove activity"
        onRename={(v) => edit((d) => { const x = d.build.activities.find((y) => y.id === id); if (x) x.label = v; })}
        onRemove={() => { edit((d) => { d.build.activities = d.build.activities.filter((y) => y.id !== id); }); onRemoved(); }} />
      <div className="font-display text-[26px] font-bold">{cad(rows.reduce((s, r) => s + r.v, 0))}<span className="ml-1.5 font-sans text-xs font-normal text-muted">over {B} months</span></div>
      {(project.build.workstreams.length > 0 || a.workstreamId) && (
        <Field label="Workstream" help="workstream">
          <Select value={a.workstreamId ?? ""} options={[{ value: "", label: "Project-wide" }, ...project.build.workstreams.map((w) => ({ value: w.id, label: w.label }))]}
            onChange={(v) => edit((d) => { const x = d.build.activities.find((y) => y.id === id); if (!x) return; if (v) x.workstreamId = v; else delete x.workstreamId; })} />
        </Field>
      )}
      {!a.workstreamId && <div className="max-w-xs"><FeatureSelect value={a.featureId} onChange={(v) => edit((d) => { const x = d.build.activities.find((y) => y.id === id); if (!x) return; if (v) x.featureId = v; else delete x.featureId; })} /></div>}
      {(a.kind === "iterations" || a.kind === "playground") && !a.workstreamId && project.build.activities.some((x) => x.kind === a.kind && x.workstreamId) && (
        <div role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">This project-wide activity counts every developer, and workstreams have their own {a.kind === "iterations" ? "iterations" : "playground work"} too. Check you are not counting the same effort twice.</div>
      )}
      <Fields specs={ACTIVITY_SPECS[a.kind] ?? []} value={a as unknown as Record<string, unknown>} locate={locate} />
      <TableNote className="mb-0"><b>Months on the chart below.</b> Month 1 is the first build month. The bars are this activity&apos;s cost in C$ in each month; {hasPlan(a) ? "edit the shape on the Plan view (All activities, Plan) or type intensity values in the field above." : "it follows the runs it scores, so it has no month numbers of its own."}</TableNote>
      {a.kind === "bakeoff" && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Candidate models and the months they run</h3>
          <table className="data">
            <thead><tr><th>Model</th><th className="n">From</th><th className="n">To</th><th /></tr></thead>
            <tbody>
              {a.candidates.map((c, ci) => (
                <tr key={ci}>
                  <td><Select label={`Candidate ${ci + 1} model`} value={c.modelId} options={modelOptions()} onChange={(v) => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates[ci]!.modelId = v; })} /></td>
                  <td className="n w-24"><NumberInput label={`Candidate ${ci + 1} from month`} value={c.fromMonth} min={1} max={B} onChange={(v) => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates[ci]!.fromMonth = v; })} /></td>
                  <td className="n w-24"><NumberInput label={`Candidate ${ci + 1} to month`} value={c.toMonth ?? B} min={1} max={B} onChange={(v) => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates[ci]!.toMonth = v; })} /></td>
                  <td><TrashButton label="Remove candidate" onClick={() => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates.splice(ci, 1); })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="mt-2 flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates.push({ modelId: "gpt-5.4-mini", fromMonth: 1, toMonth: 2 }); })}><Plus size={14} />Add candidate</button>
        </div>
      )}
      <StackedBars rows={rows} series={[{ key: "v", label: a.label, color: COLORS[i % COLORS.length]! }]} xLabel={(k) => `Month ${k + 1}`} className="relative h-[200px] flex-none" />
      <WhereFrom>{ACTIVITY_SOURCE[a.kind]} Change it in the fields above.</WhereFrom>
      <Explain title="How this is calculated" lines={lines} months={B} />
    </>
  );
}

