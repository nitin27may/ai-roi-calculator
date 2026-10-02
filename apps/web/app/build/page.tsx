"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ACTIVITY_KINDS, PLAN_SHAPES, applyShape, hasPlan, inPlanWindow, newActivity, planValues, setPlanValue, type DevActivity, type PlanShape } from "@studio/engine";
import { Card, CardHead, Field, GroupHead, ListRow, NumberInput, Seg, Select } from "@/components/ui";
import { Explain } from "@/components/explain";
import { AddMenu, ItemHeader } from "@/components/add-menu";
import { Legend, Spark, StackedBars } from "@/components/charts";
import { ACTIVITY_SPECS, Fields } from "@/components/fields";
import { modelOptions, useLedger } from "@/lib/compute";
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

  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Card>
        <CardHead title={`Build, months 1–${B}`} sub="Labour, AI Dev Lab and dev environment"><span className="num text-sm">{cad(ledger.totals.build)}</span></CardHead>
        <div role="listbox" aria-label="Build cost items" className="min-h-0 flex-1 overflow-auto">
          <ListRow selected={sel === "all"} onClick={() => setSel("all")} title="AI Dev Lab, all activities" sub="tokens and AI services while building" aside={<Spark values={allDev} color="var(--s2)" />} value={cad(devTotal)} />
          <GroupHead>Labour</GroupHead>
          <ListRow selected={sel === "team"} onClick={() => setSel("team")} title="Team & rate card" sub={project.build.team.map((t) => `${t.people} ${project.rateCard.find((r) => r.id === t.roleId)?.label ?? t.roleId}`).join(" · ")} value={cad(labTotal)} />
          <GroupHead>AI Dev Lab activities</GroupHead>
          {acts.map((a, i) => (
            <ListRow key={a.id} selected={sel === a.id} onClick={() => setSel(a.id)} title={a.label} sub={describe(a)} aside={<Spark values={series(a.id)} color={COLORS[i % COLORS.length]!} />} value={cad(series(a.id).reduce((x, y) => x + y, 0))} />
          ))}
          <div className="px-3.5 py-2.5"><AddActivity onAdded={setSel} /></div>
          <GroupHead>Environment</GroupHead>
          <ListRow selected={sel === "env"} onClick={() => setSel("env")} title="Dev environment" sub={project.build.environment.map((e) => e.label).join(" · ")} value={cad(devEnv.reduce((x, y) => x + y, 0))} />
        </div>
      </Card>
      <Card>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">
          {sel === "all" ? <AllActivities /> : sel === "team" ? <Team /> : sel === "env" ? <Explain title="Dev environment" lines={buildMonths.flatMap((m) => m.lines.filter((l) => l.stream === "devenv"))} months={B} /> : <Activity id={sel} onRemoved={() => setSel("all")} />}
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
  }
}

function AllActivities() {
  const { project, ledger } = useLedger();
  const [view, setView] = useState<"chart" | "grid" | "plan">("chart");
  const B = project.timeline.buildMonths, months = ledger.months.slice(0, B), acts = project.build.activities;
  const rows = months.map((m) => Object.fromEntries(acts.map((a) => [a.id, m.lines.filter((l) => l.componentId === a.id && l.stream === "devlab").reduce((s, l) => s + l.cost, 0)])));
  const series = acts.map((a, i) => ({ key: a.id, label: a.label, color: COLORS[i % COLORS.length]! }));
  const runRate = ledger.totals.runRate + ledger.totals.maintRate;
  const top = [...series].sort((a, b) => rows.reduce((s, r) => s + r[b.key]!, 0) - rows.reduce((s, r) => s + r[a.key]!, 0))[0];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-bold">AI Dev Lab by month</h2><div className="text-xs text-muted">Labour is shown separately</div></div>
        <Seg label="View" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "grid", label: "Cost grid" }, { value: "plan", label: "Plan" }]} />
      </div>
      <div className="rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px]">
        <b>{cad(ledger.totals.devLab)} over {B} months</b>, the same as <b>{fmt(ledger.totals.devLab / Math.max(1, runRate), 1)} months</b> of production run cost including maintenance. The largest activity is <b>{top?.label}</b>.
      </div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      {view === "plan" ? <PlanGrid /> : view === "chart" ? (
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
      <table className="data">
        <thead><tr><th>Phase</th><th>Role</th><th className="n">People</th><th className="n">Hours / month</th><th className="n">From</th><th className="n">To</th><th>Runs experiments</th><th /></tr></thead>
        <tbody>
          {project.build.team.map((t, i) => (
            <tr key={i}>
              <td><input aria-label="Phase" className="w-28 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={t.phase ?? ""} placeholder="All build" onChange={(e) => edit((d) => { d.build.team[i]!.phase = e.target.value || undefined; })} /></td>
              <td><Select value={t.roleId} options={roles} onChange={(v) => edit((d) => { d.build.team[i]!.roleId = v; })} /></td>
              <td className="n"><NumberInput value={t.people} step={0.1} onChange={(v) => edit((d) => { d.build.team[i]!.people = v; })} /></td>
              <td className="n"><NumberInput value={t.hoursPerMonth} onChange={(v) => edit((d) => { d.build.team[i]!.hoursPerMonth = v; })} /></td>
              <td className="n w-20"><NumberInput value={t.fromMonth ?? 1} min={1} max={B} onChange={(v) => edit((d) => { d.build.team[i]!.fromMonth = Math.round(v); })} /></td>
              <td className="n w-20"><NumberInput value={Math.min(t.toMonth ?? B, B)} min={1} max={B} onChange={(v) => edit((d) => { d.build.team[i]!.toMonth = Math.round(v); })} /></td>
              <td><input type="checkbox" checked={t.experiments} onChange={(e) => edit((d) => { d.build.team[i]!.experiments = e.target.checked; })} aria-label="Runs experiments" /></td>
              <td><button type="button" aria-label="Remove line" onClick={() => edit((d) => { d.build.team.splice(i, 1); })}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { d.build.team.push({ roleId: d.rateCard[0]!.id, people: 1, hoursPerMonth: 160, experiments: false }); })}><Plus size={14} />Add team line</button>
      <h3 className="text-sm font-semibold">Rate card (CAD per hour)</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
        {project.rateCard.map((r, i) => <Field key={r.id} label={r.label}><NumberInput value={r.hourlyRate} onChange={(v) => edit((d) => { d.rateCard[i]!.hourlyRate = v; })} /></Field>)}
      </div>
      <Field label="Contingency"><NumberInput value={project.build.contingencyPct} max={100} suffix="%" onChange={(v) => edit((d) => { d.build.contingencyPct = v; })} /></Field>
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

