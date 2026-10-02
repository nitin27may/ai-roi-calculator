"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ACTIVITY_KINDS, PLAN_SHAPES, applyShape, devLabByMeter, developerBreakdown, hasPlan, inPlanWindow, WORKSTREAM_TEMPLATES, addWorkstreamFromTemplate, newActivity, planValues, peakAllocation, removeWorkstream, setAllocation, setAllocationWindow, setPlanValue, workstreamBreakdown, type DevActivity, type PlanShape, type Workstream } from "@studio/engine";
import { Card, CardHead, Field, GroupHead, ListRow, NumberInput, Seg, Select } from "@/components/ui";
import { Explain } from "@/components/explain";
import { AddMenu, ItemHeader } from "@/components/add-menu";
import { Legend, Spark, StackedBars } from "@/components/charts";
import { ACTIVITY_SPECS, Fields } from "@/components/fields";
import { catalog, modelOptions, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)"];

export default function Build() {
  const [sel, setSel] = useState("all");
  const { project, ledger } = useLedger();
  const B = project.timeline.buildMonths;
  const buildMonths = ledger.months.slice(0, B);
  const acts = project.build.activities;
  const series = (id: string) => buildMonths.map((m) => m.lines.filter((l) => l.componentId === id && l.stream === "devlab").reduce((s, l) => s + l.cost, 0));
  const devEnv = buildMonths.map((m) => m.byStream.devenv);
  const devTotal = ledger.totals.devLab, labTotal = ledger.totals.buildLabour;
  const allDev = buildMonths.map((m) => m.byStream.devlab);
  const edit = useStudio((s) => s.edit);
  const wsRows = workstreamBreakdown(project, ledger);
  const wsName = (id: string) => project.build.workstreams.find((w) => w.id === id)?.label ?? id;

  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Card>
        <CardHead title={`Build, months 1–${B}`} sub="Labour, AI Dev Lab and dev environment"><span className="num text-sm">{cad(ledger.totals.build)}</span></CardHead>
        <div role="listbox" aria-label="Build cost items" className="min-h-0 flex-1 overflow-auto">
          <ListRow selected={sel === "all"} onClick={() => setSel("all")} title="AI Dev Lab, all activities" sub="tokens and AI services while building" aside={<Spark values={allDev} color="var(--s2)" />} value={cad(devTotal)} />
          <GroupHead>Labour</GroupHead>
          <ListRow selected={sel === "team"} onClick={() => setSel("team")} title="Team & rate card" sub={project.build.includeLabour ? project.build.team.map((t) => t.name ?? `${t.people} ${project.rateCard.find((r) => r.id === t.roleId)?.label ?? t.roleId}`).join(" · ") : "Labour not costed: the team only drives Dev Lab volumes"} value={cad(labTotal)} />
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
            {project.build.workstreams.length === 0 && <p className="mt-1.5 text-[11.5px] text-muted">A workstream is a feature (one or more agents). Allocate people to it to cost the build per feature and per developer.</p>}
          </div>
          <GroupHead>AI Dev Lab activities</GroupHead>
          {acts.map((a, i) => (
            <ListRow key={a.id} selected={sel === a.id} onClick={() => setSel(a.id)} title={a.label} sub={`${a.workstreamId ? `${wsName(a.workstreamId)} · ` : ""}${describe(a)}`} aside={<Spark values={series(a.id)} color={COLORS[i % COLORS.length]!} />} value={cad(series(a.id).reduce((x, y) => x + y, 0))} />
          ))}
          <div className="px-3.5 py-2.5"><AddActivity onAdded={setSel} /></div>
          <GroupHead>Environment</GroupHead>
          <ListRow selected={sel === "env"} onClick={() => setSel("env")} title="Dev environment" sub={project.build.environment.map((e) => e.label).join(" · ")} value={cad(devEnv.reduce((x, y) => x + y, 0))} />
        </div>
      </Card>
      <Card>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">
          {sel === "all" ? <AllActivities /> : sel === "team" ? <Team /> : sel === "env" ? <DevEnvironment /> : sel.startsWith("ws:") ? <WorkstreamPanel id={sel.slice(3)} onRemoved={() => setSel("all")} onOpen={setSel} /> : <Activity id={sel} onRemoved={() => setSel("all")} />}
        </div>
      </Card>
    </div>
  );
}

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
  const rows = months.map((m) => Object.fromEntries(acts.map((a) => [a.id, m.lines.filter((l) => l.componentId === a.id && l.stream === "devlab").reduce((s, l) => s + l.cost, 0)])));
  const series = acts.map((a, i) => ({ key: a.id, label: a.label, color: COLORS[i % COLORS.length]! }));
  const runRate = ledger.totals.runRate + ledger.totals.maintRate;
  const top = [...series].sort((a, b) => rows.reduce((s, r) => s + r[b.key]!, 0) - rows.reduce((s, r) => s + r[a.key]!, 0))[0];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-bold">AI Dev Lab by month</h2><div className="text-xs text-muted">Labour is shown separately</div></div>
        <Seg label="View" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "plan", label: "Plan" }, { value: "grid", label: "Cost grid" }, { value: "ws", label: "Workstreams" }, { value: "people", label: "People" }, { value: "models", label: "Models" }]} />
      </div>
      <div className="rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px]">
        <b>{cad(ledger.totals.devLab)} over {B} months</b>, the same as <b>{fmt(ledger.totals.devLab / Math.max(1, runRate), 1)} months</b> of production run cost including maintenance. The largest activity is <b>{top?.label}</b>.
      </div>
      {(view === "chart" || view === "grid") && <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      {view === "ws" ? <ByWorkstream /> : view === "people" ? <ByPerson /> : view === "models" ? <ByModel /> : view === "plan" ? <PlanGrid /> : view === "chart" ? (
        <StackedBars rows={rows} series={series} xLabel={(i) => `Month ${i + 1}`} className="relative min-h-[280px] flex-1" />
      ) : (
        <div className="overflow-auto">
          <table className="data">
            <thead><tr><th>Activity</th>{months.map((m) => <th key={m.m} className="n">M{m.m}</th>)}<th className="n">Total</th></tr></thead>
            <tbody>
              {series.map((s) => {
                const mx = Math.max(...rows.flatMap((r) => series.map((x) => r[x.key]!)), 1);
                return <tr key={s.key}><td>{s.label}</td>{rows.map((r, i) => <td key={i} className="n" style={{ background: `color-mix(in srgb, var(--s1) ${Math.round((r[s.key]! / mx) * 38)}%, transparent)` }}>{cad(r[s.key]!)}</td>)}<td className="n">{cad(rows.reduce((t, r) => t + r[s.key]!, 0))}</td></tr>;
              })}
              <tr className="total"><td>Total</td>{months.map((m) => <td key={m.m} className="n">{cad(m.byStream.devlab)}</td>)}<td className="n">{cad(ledger.totals.devLab)}</td></tr>
            </tbody>
          </table>
        </div>
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
      <p className="mb-2 text-xs text-muted">Bake-offs plan <b>sweeps</b> per month; other activities plan <b>intensity</b> (1 = the volumes set on the activity, 0 = off). Greyed months are outside the activity&apos;s window. Evaluation follows the runs it scores.</p>
      <table className="data">
        <thead><tr><th>Activity</th><th>Shape</th>{months.map((m) => <th key={m} className="n">M{m}</th>)}</tr></thead>
        <tbody>
          {project.build.activities.map((a) => {
            if (!hasPlan(a)) return <tr key={a.id}><td>{a.label}</td><td className="text-xs text-muted">follows runs</td>{months.map((m) => <td key={m} className="n text-xs text-muted">{cad(cost(a.id, m))}</td>)}</tr>;
            const vals = planValues(a, B);
            return (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{a.label}<small className="block text-muted">{a.kind === "bakeoff" ? "sweeps" : "intensity"}</small></td>
                <td className="w-32"><Select value="" options={[{ value: "", label: "Apply…" }, ...PLAN_SHAPES.map((s) => ({ value: s.id, label: s.label }))]} onChange={(v) => v && update(a.id, (x) => applyShape(x, v as PlanShape, B))} /></td>
                {months.map((m) => {
                  const on = inPlanWindow(a, m, B);
                  return (
                    <td key={m} className="n w-20" style={on ? undefined : { opacity: 0.4 }} title={on ? `${cad(cost(a.id, m))} in month ${m}` : "Outside the activity's window"}>
                      <NumberInput value={vals[m - 1]!} step={a.kind === "bakeoff" ? 1 : 0.1} onChange={(v) => update(a.id, (x) => setPlanValue(x, m, v, B))} />
                      <small className="block text-[10.5px] text-muted">{cad(cost(a.id, m))}</small>
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
      <table className="data">
        <thead><tr><th>Workstream</th><th className="n">People (avg)</th><th className="n">Labour</th><th className="n">AI Dev Lab</th><th className="n">Total</th>{Array.from({ length: B }, (_, i) => <th key={i} className="n">M{i + 1}</th>)}</tr></thead>
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
      <p className="mt-2 text-[11.5px] text-muted">Capabilities that link a workstream (on Value &amp; ROI, or in the workstream panel) carry its build cost as direct cost; project-wide cost is shared.</p>
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
      <div className="flex flex-wrap items-end gap-3">
        <Field label="AI Dev Lab budget per person per month"><NumberInput value={budget ?? 0} suffix="CAD" onChange={(v) => edit((d) => { d.build.devBudgetPerMonth = v > 0 ? v : undefined; })} /></Field>
        <p className="max-w-md text-[11.5px] text-muted">Monthly columns are AI Dev Lab spend per person. Workstream activities are charged to the people on that workstream by their share; project-wide ones to everyone running experiments. 0 = no budget.</p>
      </div>
      <table className="data">
        <thead><tr><th>Person / line</th><th className="n">Labour</th><th className="n">AI Dev Lab</th>{Array.from({ length: B }, (_, i) => <th key={i} className="n">M{i + 1}</th>)}</tr></thead>
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
      {unattributed > 0.5 && <p className="text-[11.5px] text-warn">{cad(unattributed)} of Dev Lab spend is on workstreams with nobody allocated in that month.</p>}
      {budget && shown.some((r) => r.overBudget.length) ? <p className="text-[11.5px] text-crit">Red months are over the budget of {cad(budget)} per person.</p> : null}
    </div>
  );
}

function ByModel() {
  const { project, ledger } = useLedger();
  const rows = devLabByMeter(ledger, project.timeline.buildMonths);
  const total = rows.reduce((s, r) => s + r.cost, 0) || 1;
  const name = (m: string) => catalog.chatModels.find((c) => c.id === m)?.label ?? catalog.unitPrices.find((u) => u.id === m)?.label ?? m;
  return (
    <div className="flex flex-col gap-1.5">
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
      <div className="font-display text-[26px] font-bold">{cad(row.total)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">{cad(row.labour)} labour · {cad(row.devlab)} AI Dev Lab · {fmt(row.people, 2)} people on average</span></div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">People</h3>
        <table className="data">
          <thead><tr><th>Team line</th><th className="n">Share of their time</th><th className="n">From month</th><th className="n">To month</th></tr></thead>
          <tbody>
            {project.build.team.map((t, seat) => {
              const share = t.allocations?.find((a) => a.workstreamId === id)?.share ?? 0;
              const total = peakAllocation(project, seat);
              return (
                <tr key={seat} style={share ? undefined : { opacity: 0.6 }}>
                  <td>{t.name ? `${t.name} (${rates.get(t.roleId) ?? t.roleId})` : `${t.people} × ${rates.get(t.roleId) ?? t.roleId}`}{t.phase ? <small className="text-muted"> · {t.phase}</small> : null}
                    {total > 1.005 && share > 0 && <small className="block text-crit">Up to {Math.round(total * 100)}% allocated in some months, so shares are scaled down then (to {Math.round((share / total) * 100)}% here)</small>}</td>
                  <td className="n w-36"><NumberInput value={Math.round(share * 100)} max={100} suffix="%" onChange={(v) => edit((d) => setAllocation(d, seat, id, v / 100))} /></td>
                  {share > 0 ? (() => {
                    const a = t.allocations!.find((x) => x.workstreamId === id)!;
                    const B = project.timeline.buildMonths;
                    return (
                      <>
                        <td className="n w-24"><NumberInput value={a.fromMonth ?? 1} min={1} max={B} onChange={(v) => edit((d) => setAllocationWindow(d, seat, id, Math.round(v), a.toMonth))} /></td>
                        <td className="n w-24"><NumberInput value={a.toMonth ?? B} min={1} max={B} onChange={(v) => edit((d) => setAllocationWindow(d, seat, id, a.fromMonth, Math.round(v)))} /></td>
                      </>
                    );
                  })() : <><td /><td /></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Delivers capabilities</h3>
          {project.benefits.capabilities.length === 0 && <p className="text-xs text-muted">No capabilities yet (Value &amp; ROI).</p>}
          {project.benefits.capabilities.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-0.5 text-[12.5px]">
              <input type="checkbox" checked={c.componentIds.includes(id)} onChange={(e) => edit((d) => { const x = d.benefits.capabilities.find((y) => y.id === c.id)!; x.componentIds = e.target.checked ? [...x.componentIds, id] : x.componentIds.filter((y) => y !== id); })} />
              {c.label}
            </label>
          ))}
          <p className="mt-1 text-[11.5px] text-muted">Its build cost becomes direct cost of these capabilities (split evenly). Unlinked, it is shared across all.</p>
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
          <AddMenu label="Add activity to this workstream" items={ACTIVITY_KINDS} onPick={(kind) => {
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
  return (
    <>
      <div><h2 className="text-base font-bold">Team & rate card</h2><div className="text-xs text-muted">Labour for the build in CAD. Ticked lines run AI experiments and drive per-developer Dev Lab volumes.</div></div>
      <div className="font-display text-[26px] font-bold">{cad(ledger.totals.buildLabour)}</div>
      <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={project.build.includeLabour} onChange={(e) => edit((d) => { d.build.includeLabour = e.target.checked; })} />Include labour cost <span className="text-muted">(untick to cost AI spend only; the team still drives Dev Lab volumes)</span></label>
      <div className="flex-none overflow-x-auto">
      <table className="data">
        <thead><tr><th>Name</th><th>Phase</th><th>Role</th><th className="n">People</th><th className="n">Hours / month</th><th className="n">From</th><th className="n">To</th><th>Experiments</th><th /></tr></thead>
        <tbody>
          {project.build.team.map((t, i) => (
            <tr key={i}>
              <td><input aria-label="Name" className="w-24 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={t.name ?? ""} placeholder="(role)" onChange={(e) => edit((d) => { d.build.team[i]!.name = e.target.value || undefined; })} /></td>
              <td><input aria-label="Phase" className="w-24 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={t.phase ?? ""} placeholder="All build" onChange={(e) => edit((d) => { d.build.team[i]!.phase = e.target.value || undefined; })} /></td>
              <td className="min-w-[150px]"><Select value={t.roleId} options={roles} onChange={(v) => edit((d) => { d.build.team[i]!.roleId = v; })} /></td>
              <td className="n min-w-[80px]"><NumberInput value={t.people} step={0.1} onChange={(v) => edit((d) => { d.build.team[i]!.people = v; })} /></td>
              <td className="n"><NumberInput value={t.hoursPerMonth} onChange={(v) => edit((d) => { d.build.team[i]!.hoursPerMonth = v; })} /></td>
              <td className="n min-w-[72px]"><NumberInput value={t.fromMonth ?? 1} min={1} max={B} onChange={(v) => edit((d) => { d.build.team[i]!.fromMonth = Math.round(v); })} /></td>
              <td className="n min-w-[72px]"><NumberInput value={Math.min(t.toMonth ?? B, B)} min={1} max={B} onChange={(v) => edit((d) => { d.build.team[i]!.toMonth = Math.round(v); })} /></td>
              <td><input type="checkbox" checked={t.experiments} onChange={(e) => edit((d) => { d.build.team[i]!.experiments = e.target.checked; })} aria-label="Runs experiments" /></td>
              <td><button type="button" aria-label="Remove line" onClick={() => edit((d) => { d.build.team.splice(i, 1); })}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {project.build.workstreams.length > 0 && <AllocationMatrix />}
      <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { d.build.team.push({ roleId: d.rateCard[0]!.id, people: 1, hoursPerMonth: 160, experiments: false }); })}><Plus size={14} />Add team line</button>
      <h3 className="text-sm font-semibold">Rate card (CAD per hour)</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
        {project.rateCard.map((r, i) => <Field key={r.id} label={r.label}><NumberInput value={r.hourlyRate} onChange={(v) => edit((d) => { d.rateCard[i]!.hourlyRate = v; })} /></Field>)}
      </div>
      <Field label="Contingency"><NumberInput value={project.build.contingencyPct} max={100} suffix="%" onChange={(v) => edit((d) => { d.build.contingencyPct = v; })} /></Field>
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
                  <td key={w.id} className="n max-w-[104px]"><NumberInput value={Math.round((t.allocations?.find((a) => a.workstreamId === w.id)?.share ?? 0) * 100)} max={100} suffix="%" onChange={(v) => edit((d) => setAllocation(d, seat, w.id, v / 100))} />
                    {(() => { const a = t.allocations?.find((x) => x.workstreamId === w.id); return a && (a.fromMonth || a.toMonth) ? <small className="block text-[10.5px] text-muted">M{a.fromMonth ?? 1}–{a.toMonth ?? project.timeline.buildMonths}</small> : null; })()}</td>
                ))}
                <td className="n" style={total > 1.005 ? { color: "var(--crit)", fontWeight: 600 } : undefined}>{total > 1.005 ? `${Math.round(total * 100)}%${varies ? " in some months" : ""} (scaled to 100%)` : varies ? `at least ${Math.round(Math.max(0, 1 - total) * 100)}%` : `${Math.round(Math.max(0, 1 - total) * 100)}%`}{varies ? <small className="block text-[10.5px] font-normal text-muted">varies by month</small> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-muted">Set the months someone spends on a workstream in its panel (e.g. moves from one feature to another in month 4). Labour follows these shares. Iterations and playground work in a workstream scale with the people on it; bake-offs, regression and red teaming in a workstream run once, however many people share it.</p>
    </div>
  );
}

/** Fixed and metered services the team runs while building (per month). */
function DevEnvironment() {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const B = project.timeline.buildMonths;
  const lines = ledger.months.slice(0, B).flatMap((m) => m.lines.filter((l) => l.stream === "devenv"));
  const options = catalog.unitPrices.filter((u) => u.platform === "azure").map((u) => ({ value: u.id, label: `${u.label} (${u.unit})` }));
  const unitOf = (id: string) => catalog.unitPrices.find((u) => u.id === id);
  return (
    <>
      <div><h2 className="text-base font-bold">Dev environment</h2><div className="text-xs text-muted">Services the team runs while building, billed every build month: dev search index, API gateway, logging, sandboxes.</div></div>
      <div className="font-display text-[26px] font-bold">{cad(lines.reduce((s, l) => s + l.cost, 0))}<span className="ml-1.5 font-sans text-xs font-normal text-muted">over {B} months</span></div>
      <div className="flex-none overflow-x-auto">
        <table className="data">
          <thead><tr><th>Item</th><th>Priced as</th><th className="n">Quantity / month</th><th className="n">Per month</th><th /></tr></thead>
          <tbody>
            {project.build.environment.map((it, i) => {
              const u = unitOf(it.unitPriceId);
              return (
                <tr key={it.id}>
                  <td><input aria-label="Item name" className="w-44 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={it.label} onChange={(e) => edit((d) => { d.build.environment[i]!.label = e.target.value; })} /></td>
                  <td className="min-w-[220px]"><Select value={it.unitPriceId} options={options} onChange={(v) => edit((d) => { d.build.environment[i]!.unitPriceId = v; })} /></td>
                  <td className="n min-w-[120px]"><NumberInput value={it.quantity} suffix={u?.unit} onChange={(v) => edit((d) => { d.build.environment[i]!.quantity = v; })} /></td>
                  <td className="n">{cad(it.quantity * (u?.price ?? 0))}</td>
                  <td><button type="button" aria-label="Remove item" onClick={() => edit((d) => { d.build.environment.splice(i, 1); })}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { let n = 1; while (d.build.environment.some((x) => x.id === `env-${n}`)) n++; d.build.environment.push({ id: `env-${n}`, label: "New item", unitPriceId: "log-analytics-ingest", quantity: 1 }); })}><Plus size={14} />Add item</button>
      <p className="text-[11.5px] text-muted">The Per month column is before free allowances; the total above applies them.</p>
      <Explain title="How this is calculated" lines={lines} months={B} />
    </>
  );
}

function AddActivity({ onAdded }: { onAdded: (id: string) => void }) {
  const edit = useStudio((s) => s.edit);
  return (
    <AddMenu label="Add activity" items={ACTIVITY_KINDS} onPick={(kind) => {
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
        <Field label="Workstream">
          <Select value={a.workstreamId ?? ""} options={[{ value: "", label: "Project-wide" }, ...project.build.workstreams.map((w) => ({ value: w.id, label: w.label }))]}
            onChange={(v) => edit((d) => { const x = d.build.activities.find((y) => y.id === id); if (!x) return; if (v) x.workstreamId = v; else delete x.workstreamId; })} />
        </Field>
      )}
      {(a.kind === "iterations" || a.kind === "playground") && !a.workstreamId && project.build.activities.some((x) => x.kind === a.kind && x.workstreamId) && (
        <div role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">This project-wide activity counts every developer, and workstreams have their own {a.kind === "iterations" ? "iterations" : "playground work"} too. Check you are not counting the same effort twice.</div>
      )}
      <Fields specs={ACTIVITY_SPECS[a.kind] ?? []} value={a as unknown as Record<string, unknown>} locate={locate} />
      {a.kind === "bakeoff" && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Candidate models and the months they run</h3>
          <table className="data">
            <thead><tr><th>Model</th><th className="n">From</th><th className="n">To</th><th /></tr></thead>
            <tbody>
              {a.candidates.map((c, ci) => (
                <tr key={ci}>
                  <td><Select value={c.modelId} options={modelOptions()} onChange={(v) => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates[ci]!.modelId = v; })} /></td>
                  <td className="n w-24"><NumberInput value={c.fromMonth} min={1} max={B} onChange={(v) => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates[ci]!.fromMonth = v; })} /></td>
                  <td className="n w-24"><NumberInput value={c.toMonth ?? B} min={1} max={B} onChange={(v) => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates[ci]!.toMonth = v; })} /></td>
                  <td><button type="button" aria-label="Remove candidate" onClick={() => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates.splice(ci, 1); })}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="mt-2 flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { const x = d.build.activities[i]; if (x?.kind === "bakeoff") x.candidates.push({ modelId: "gpt-5.4-mini", fromMonth: 1, toMonth: 2 }); })}><Plus size={14} />Add candidate</button>
        </div>
      )}
      <StackedBars rows={rows} series={[{ key: "v", label: a.label, color: COLORS[i % COLORS.length]! }]} xLabel={(k) => `Month ${k + 1}`} className="relative h-[200px] flex-none" />
      <Explain title="How this is calculated" lines={lines} months={B} />
    </>
  );
}

