"use client";
import { Fragment, useState } from "react";
import { SCORE_DIMENSION_LABEL, scoreItems, scoreRows, workloadVolume, type ScoreItem } from "@roi-calculator/engine";
import { AddMenu } from "@/components/add-menu";
import { InlineConfirm } from "@/components/cost-grid";
import { HelpTip } from "@/components/help-tip";
import { NumberInput, Pill, Select, TrashButton } from "@/components/ui";
import { useStudio } from "@/lib/store";
import { cad, cn } from "@/lib/format";

const DIMENSIONS = Object.keys(SCORE_DIMENSION_LABEL) as ScoreItem["dimension"][];
const textIn = "min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";
const small = "text-xs text-muted";

/** What picking a dimension starts you with: an example measure to rename. Both values are 0, so a new item moves nothing until you enter them. */
const START: Record<ScoreItem["dimension"], { label: string; measure: string; unit: string; higherIsBetter: boolean; detail: string }> = {
  speed: { label: "Speed", measure: "Days from claim to payment", unit: "day", higherIsBetter: false, detail: "How long something takes: cycle time, wait, turnaround" },
  customer: { label: "Customer experience", measure: "Customer satisfaction score", unit: "point", higherIsBetter: true, detail: "Satisfaction, effort, complaints, retention" },
  employee: { label: "Employee experience", measure: "Staff satisfaction score", unit: "point", higherIsBetter: true, detail: "Satisfaction, rework, tedious tasks, turnover" },
  compliance: { label: "Compliance and risk", measure: "Audit findings a year", unit: "finding", higherIsBetter: false, detail: "Findings, breaches, exposure, control coverage" },
  agility: { label: "Agility", measure: "Days to release a change", unit: "day", higherIsBetter: false, detail: "How quickly the business can change or launch" },
  other: { label: "Other", measure: "Measure", unit: "unit", higherIsBetter: true, detail: "Any other non-financial measure" },
};

function newItem(dimension: ScoreItem["dimension"]): ScoreItem {
  const s = START[dimension];
  return { id: `score-${Date.now()}`, label: s.label, dimension, measure: s.measure, unit: s.unit, before: 0, after: 0, higherIsBetter: s.higherIsBetter, weightPct: 0, confidencePct: 100 };
}

const fmtPct = (x: number) => `${x > 0 ? "+" : ""}${(Math.round(x * 10) / 10).toLocaleString("en-CA")}%`;

function Th({ children, help }: { children: string; help?: string }) {
  return <th className="whitespace-nowrap align-bottom"><span className="inline-flex items-center gap-0.5">{children}{help && <HelpTip id={help} label={children} />}</span></th>;
}

export function Scorecard() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const [confirm, setConfirm] = useState<string | null>(null);
  const items = scoreItems(project);
  const res = scoreRows(project);
  const volumeSources = project.workloads.filter((w) => workloadVolume(w).items !== undefined);
  const upd = (id: string, fn: (i: ScoreItem) => void) => edit((d) => { const i = d.benefits.scorecard?.find((x) => x.id === id); if (i) fn(i); });

  return (
    <section aria-labelledby="scorecard-h" className="flex flex-col gap-3">
      <div>
        <h3 id="scorecard-h" className="inline-flex items-center gap-1 text-sm font-semibold">Non-financial benefits<HelpTip id="scorecard" label="Scorecard" /></h3>
        <p className={small}>Each item is a measure with a before and an after value, a weight and a confidence. The scorecard sits next to the financial ROI and is not in NPV or payback unless you monetise an item. Monetise only what is not already counted as time saved or an avoided cost.</p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">No items yet. Add a measure and enter its before and after values. Nothing here changes a financial figure until an item is monetised.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data min-w-[1250px]">
            <thead>
              <tr>
                <Th>Item</Th><Th help="scoreDimension">Dimension</Th><Th help="scoreMeasure">Measure</Th><Th help="scoreUnit">Unit</Th>
                <Th help="scoreBefore">Before</Th><Th help="scoreAfter">After</Th><Th help="scoreHigher">Better when</Th><th className="whitespace-nowrap">Result</th>
                <Th help="scoreWeight">Weight</Th><Th help="scoreConfidence">Confidence</Th><Th help="scoreMonetise">Monetise</Th>
                <th className="n whitespace-nowrap">Value / month</th><th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, k) => {
                const r = res.rows[k]!;
                const m = i.monetise;
                return (
                  <Fragment key={i.id}>
                    <tr className="align-top">
                      <td>
                        <div className="flex w-44 flex-col gap-1.5">
                          <input className={cn(textIn, "w-full")} value={i.label} aria-label={`Item name, ${i.label}`} onChange={(e) => upd(i.id, (x) => { x.label = e.target.value; })} />
                          {project.features.length > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Select label={`Feature for ${i.label}`} value={i.featureId ?? ""} options={[{ value: "", label: "Whole project" }, ...project.features.map((f) => ({ value: f.id, label: f.label }))]}
                                onChange={(v) => upd(i.id, (x) => { if (v) x.featureId = v; else delete x.featureId; })} />
                              <HelpTip id="scoreFeature" label="Feature" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="min-w-[150px]"><Select label={`Dimension of ${i.label}`} value={i.dimension} options={DIMENSIONS.map((d) => ({ value: d, label: SCORE_DIMENSION_LABEL[d] }))} onChange={(v) => upd(i.id, (x) => { x.dimension = v as ScoreItem["dimension"]; })} /></td>
                      <td><input className={cn(textIn, "w-48")} value={i.measure} aria-label={`Measure of ${i.label}`} onChange={(e) => upd(i.id, (x) => { x.measure = e.target.value; })} /></td>
                      <td><input className={cn(textIn, "w-20")} value={i.unit} aria-label={`Unit of ${i.label}`} onChange={(e) => upd(i.id, (x) => { x.unit = e.target.value; })} /></td>
                      <td className="w-24"><NumberInput label={`Before value of ${i.label}`} value={i.before} min={-1e9} onChange={(v) => upd(i.id, (x) => { x.before = v; })} /></td>
                      <td className="w-24"><NumberInput label={`After value of ${i.label}`} value={i.after} min={-1e9} onChange={(v) => upd(i.id, (x) => { x.after = v; })} /></td>
                      <td className="min-w-[160px]"><Select label={`Better when, ${i.label}`} value={i.higherIsBetter ? "higher" : "lower"} options={[{ value: "higher", label: "Higher is better" }, { value: "lower", label: "Lower is better" }]} onChange={(v) => upd(i.id, (x) => { x.higherIsBetter = v === "higher"; })} /></td>
                      <td>
                        <div className="flex flex-col items-start gap-1" data-testid={`score-result-${i.id}`}>
                          <Pill tone={r.direction === "better" ? "ok" : r.direction === "worse" ? "crit" : "n"}>{r.direction === "better" ? "Better" : r.direction === "worse" ? "Worse" : "No change"}</Pill>
                          <span className="num text-xs text-ink-2">{r.improvementPct === null ? "n/a (before is 0)" : fmtPct(r.improvementPct)}</span>
                        </div>
                      </td>
                      <td className="w-24"><NumberInput label={`Weight of ${i.label}`} value={i.weightPct} max={100} suffix="%" onChange={(v) => upd(i.id, (x) => { x.weightPct = v; })} /></td>
                      <td className="w-24"><NumberInput label={`Confidence in ${i.label}`} value={i.confidencePct} max={100} suffix="%" onChange={(v) => upd(i.id, (x) => { x.confidencePct = v; })} /></td>
                      <td>
                        <div className="flex min-w-[200px] flex-col gap-1.5">
                          <label className="flex items-center gap-1.5 text-xs text-ink-2">
                            <input type="checkbox" checked={!!m} onChange={(e) => upd(i.id, (x) => { if (e.target.checked) x.monetise = { cadPerUnit: 0, volumePerMonth: 0 }; else delete x.monetise; })} />Count in NPV and payback
                          </label>
                          {m && (
                            <>
                              <NumberInput label={`Value per ${i.unit} for ${i.label}`} value={m.cadPerUnit} step={0.01} suffix={`C$ per ${i.unit}`} onChange={(v) => upd(i.id, (x) => { if (x.monetise) x.monetise.cadPerUnit = v; })} />
                              <Select label={`Volume source for ${i.label}`} value={m.volumeFrom ?? ""} options={[{ value: "", label: "Volume entered here" }, ...volumeSources.map((w) => ({ value: w.id, label: `From ${w.label}` }))]}
                                onChange={(v) => upd(i.id, (x) => { if (x.monetise) { if (v) x.monetise.volumeFrom = v; else delete x.monetise.volumeFrom; } })} />
                              {!m.volumeFrom && <NumberInput label={`Items a month for ${i.label}`} value={m.volumePerMonth ?? 0} suffix="a month" onChange={(v) => upd(i.id, (x) => { if (x.monetise) x.monetise.volumePerMonth = v; })} />}
                              {r.monthlyValue < 0 && <span className="text-xs text-warn">Moving the wrong way: this is a cost.</span>}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="n">{m ? cad(r.monthlyValue) : <span className="text-muted">Not counted</span>}</td>
                      <td><TrashButton label={`Remove ${i.label}`} onClick={() => setConfirm(i.id)} /></td>
                    </tr>
                    {confirm === i.id && (
                      <tr>
                        <td colSpan={13}>
                          <div className="sticky left-0 max-w-[720px]">
                            <InlineConfirm groupLabel="Confirm remove" confirmLabel="Remove item"
                              message={m ? `Remove ${i.label}? Its ${cad(r.monthlyValue)} a month leaves NPV, payback, the Summary and Excel, and its before and after values are lost. You can undo it straight after.` : `Remove ${i.label}? Its before and after values, weight and confidence are lost and the composite index changes. No financial figure changes. You can undo it straight after.`}
                              onConfirm={() => { edit((d) => { if (d.benefits.scorecard) d.benefits.scorecard = d.benefits.scorecard.filter((x) => x.id !== i.id); }); setConfirm(null); }}
                              onCancel={() => setConfirm(null)} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddMenu label="Add a measure" items={DIMENSIONS.map((d) => ({ kind: d, label: SCORE_DIMENSION_LABEL[d], detail: START[d].detail }))}
        onPick={(d) => edit((x) => { x.benefits.scorecard = [...(x.benefits.scorecard ?? []), newItem(d)]; })} />

      {items.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-[12.5px] sm:grid-cols-3" data-testid="score-totals">
          <div><dt className="inline-flex items-center gap-0.5 text-muted">Composite index<HelpTip id="scoreComposite" label="Composite index" /></dt><dd className="num font-semibold">{res.composite === null ? "No weights set" : fmtPct(res.composite)}</dd></div>
          <div><dt className="text-muted">Items</dt><dd className="num font-semibold">{items.length}</dd></div>
          <div><dt className="text-muted">In NPV and payback / month</dt><dd className="num font-semibold">{cad(res.monetisedMonthly)}</dd></div>
        </dl>
      )}
    </section>
  );
}
