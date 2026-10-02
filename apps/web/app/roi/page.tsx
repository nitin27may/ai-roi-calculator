"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHead, Field, NumberInput, Seg, Select } from "@/components/ui";
import { CumulativeLine } from "@/components/charts";
import { useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, cn } from "@/lib/format";

const BASES = [
  { value: "run", label: "Running cost only", hint: "Production AI usage + platform. Use this for an app that already exists." },
  { value: "runMaint", label: "Running + maintenance", hint: "Adds the support team." },
  { value: "full", label: "Full lifecycle", hint: "Build labour + AI Dev Lab + dev environment + run + maintenance." },
] as const;

export default function Roi() {
  const { project, roi, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [view, setView] = useState<"chart" | "years">("chart");
  const roles = project.rateCard.map((r) => ({ value: r.id, label: r.label }));
  const rate = (id: string) => project.rateCard.find((r) => r.id === id)?.hourlyRate ?? 0;
  const slider = (label: string, value: number, set: (n: number) => void, id: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-[12.5px] text-ink-2">{label}<span className="num">{value}%</span></label>
      <input id={id} type="range" min={0} max={60} value={value} onChange={(e) => set(+e.target.value)} className="w-full accent-[var(--accent)]" />
    </div>
  );
  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <Card>
        <CardHead title="Assumptions" />
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-3.5 pb-3.5">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold">Measure ROI against</legend>
            {BASES.map((b) => (
              <label key={b.value} className={cn("grid cursor-pointer grid-cols-[auto_1fr] gap-2 rounded-md border px-2.5 py-2 text-[12.5px]", project.roi.basis === b.value ? "border-accent bg-accent-soft" : "border-line")}>
                <input type="radio" name="basis" checked={project.roi.basis === b.value} onChange={() => edit((d) => { d.roi.basis = b.value; })} />
                <span>{b.label}<small className="block text-muted">{b.hint}</small></span>
              </label>
            ))}
          </fieldset>
          {slider("Reduce development cost", project.roi.devCutPct, (n) => edit((d) => { d.roi.devCutPct = n; }), "dev-cut")}
          {slider("Reduce maintenance cost", project.roi.maintCutPct, (n) => edit((d) => { d.roi.maintCutPct = n; }), "maint-cut")}
          <p className="-mt-2 text-[11.5px] text-muted">These are blunt what-ifs. The savings levers on the Overview show concrete changes and what each one saves.</p>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Benefit assumption</h3>
            <Seg label="Benefit preset" value={project.roi.benefitPreset} onChange={(v) => edit((d) => { d.roi.benefitPreset = v; })} options={[{ value: "conservative", label: "Conservative" }, { value: "typical", label: "Typical" }, { value: "optimistic", label: "Optimistic" }]} />
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Time saved (at full adoption)</h3>
            {project.benefits.capabilities.map((c, i) => (
              <div key={c.id} className="mb-2 grid grid-cols-[1fr_auto] gap-2 rounded-md border border-line p-2">
                <input className="col-span-2 rounded border border-line bg-surface-2 px-2 py-1 text-[13px]" value={c.label} aria-label="Capability" onChange={(e) => edit((d) => { d.benefits.capabilities[i]!.label = e.target.value; })} />
                <Field label="Hours saved / month"><NumberInput value={c.hoursSavedPerMonth} onChange={(v) => edit((d) => { d.benefits.capabilities[i]!.hoursSavedPerMonth = v; })} /></Field>
                <Field label="Valued at"><Select value={c.roleId} options={roles} onChange={(v) => edit((d) => { d.benefits.capabilities[i]!.roleId = v; })} /></Field>
                <div className="col-span-2 flex justify-between text-xs text-muted"><span className="num">{cad(c.hoursSavedPerMonth * rate(c.roleId))}/month</span><button type="button" aria-label="Remove" onClick={() => edit((d) => { d.benefits.capabilities.splice(i, 1); })}><Trash2 size={14} /></button></div>
              </div>
            ))}
            <button type="button" className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { d.benefits.capabilities.push({ id: `cap-${Date.now()}`, label: "New capability", hoursSavedPerMonth: 100, roleId: d.rateCard.at(-1)!.id }); })}><Plus size={14} />Add time saving</button>
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Avoided costs</h3>
            {project.benefits.avoidedCosts.map((a, i) => (
              <div key={a.id} className="mb-2 grid grid-cols-[1fr_120px_auto] items-end gap-2">
                <input className="rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={a.label} aria-label="Avoided cost" onChange={(e) => edit((d) => { d.benefits.avoidedCosts[i]!.label = e.target.value; })} />
                <NumberInput value={a.monthly} suffix="/mo" onChange={(v) => edit((d) => { d.benefits.avoidedCosts[i]!.monthly = v; })} />
                <button type="button" aria-label="Remove" onClick={() => edit((d) => { d.benefits.avoidedCosts.splice(i, 1); })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { d.benefits.avoidedCosts.push({ id: `av-${Date.now()}`, label: "Licence or service retired", monthly: 1000 }); })}><Plus size={14} />Add avoided cost</button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHead title={view === "chart" ? "Cumulative cash position" : "By year"} sub={`Benefit minus ${BASES.find((b) => b.value === project.roi.basis)!.label.toLowerCase()}`}>
          <Seg label="View" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "years", label: "By year" }]} />
        </CardHead>
        {view === "chart" ? (
          <div className="flex min-h-0 flex-1 px-1.5 pb-1.5"><CumulativeLine values={roi.cumulative} payback={roi.paybackMonth} /></div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">
            <table className="data">
              <thead><tr><th>Year</th><th className="n">Benefit</th><th className="n">Cost</th><th className="n">Net</th></tr></thead>
              <tbody>
                {roi.byYear.map((y) => <tr key={y.year}><td>Year {y.year}</td><td className="n">{cad(y.benefit)}</td><td className="n">{cad(y.cost)}</td><td className="n">{cad(y.net)}</td></tr>)}
                <tr className="total"><td>{ledger.months.length} months</td><td className="n">{cad(roi.totalBenefit)}</td><td className="n">{cad(roi.totalCost)}</td><td className="n">{cad(roi.totalBenefit - roi.totalCost)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
