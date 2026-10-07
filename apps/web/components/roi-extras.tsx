"use client";
import { Plus } from "lucide-react";
import { workloadVolume, valueItemMonthly, type ValueItem } from "@roi-calculator/engine";
import { Field, NumberInput, Seg, Select, TrashButton } from "@/components/ui";
import { useStudio } from "@/lib/store";
import { cad, cn } from "@/lib/format";

const textIn = "min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";

/** Finance settings a CFO asks for. Every field starts unset, which leaves the existing figures unchanged. */
export function FinanceInputs() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const r = project.roi;
  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold">Finance measures</h3>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Hurdle rate (minimum return)" help="hurdleRate"><NumberInput value={r.hurdleRatePct ?? 0} max={100} suffix="%" onChange={(v) => edit((d) => { if (v > 0) d.roi.hurdleRatePct = v; else delete d.roi.hurdleRatePct; })} /></Field>
        <Field label="Value after the plan ends (years)" help="terminalValue"><NumberInput value={r.terminalValueYears ?? 0} max={20} step={0.5} onChange={(v) => edit((d) => { if (v > 0) d.roi.terminalValueYears = v; else delete d.roi.terminalValueYears; })} /></Field>
        <Field label="Build cost treated as capital" help="capexPct"><NumberInput value={r.capexPct ?? 0} max={100} suffix="%" onChange={(v) => edit((d) => { if (v > 0) d.roi.capexPct = v; else delete d.roi.capexPct; })} /></Field>
        <Field label="Write capital off over (months)" help="amortiseMonths"><NumberInput value={r.amortiseMonths ?? 36} min={1} max={120} onChange={(v) => edit((d) => { d.roi.amortiseMonths = Math.round(v); })} /></Field>
      </div>
      <p className="mt-1 text-xs text-muted">The capital split and write-off change how cost is reported, not the cash flows, NPV or IRR. Value after the plan ends adds that many years of the last year&apos;s net benefit to the final month, so it does move NPV and IRR.</p>
    </section>
  );
}

/** How sure we are of a benefit, as a share that counts. Blank means counted in full. */
export function ConfidenceField({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <Field label="Confidence (share that counts)" help="confidence">
      <NumberInput value={value ?? 100} max={100} suffix="%" onChange={(v) => onChange(v >= 100 ? undefined : v)} />
    </Field>
  );
}

const KIND_LABEL: Record<ValueItem["kind"], string> = { revenue: "Revenue", quality: "Fewer errors", risk: "Risk reduced" };

export function ValueItems() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  const volumeSources = project.workloads.filter((w) => workloadVolume(w).items !== undefined);
  return (
    <section>
      <h3 className="text-sm font-semibold">Revenue, quality and risk</h3>
      <p className="mb-1.5 text-xs text-muted">Benefits that are not time saved: extra margin, errors avoided, expected losses prevented.</p>
      {project.benefits.value.map((v, i) => {
        const upd = (fn: (x: ValueItem) => void) => edit((d) => { const x = d.benefits.value[i]; if (x) fn(x); });
        const setOpt = <K extends keyof ValueItem>(k: K, val: ValueItem[K] | undefined) => upd((x) => { if (val === undefined) delete x[k]; else x[k] = val; });
        const from = v.volumeFrom ? project.workloads.find((w) => w.id === v.volumeFrom) : undefined;
        return (
          <div key={v.id} className="mb-2 flex flex-col gap-2 rounded-md border border-line p-2">
            <div className="flex items-center gap-2">
              <input className={cn(textIn, "flex-1")} value={v.label} aria-label="Revenue, quality or risk benefit" onChange={(e) => upd((x) => { x.label = e.target.value; })} />
              <TrashButton label="Remove revenue, quality or risk benefit" onClick={() => edit((d) => { d.benefits.value.splice(i, 1); })} />
            </div>
            <Seg label="Benefit type" value={v.kind} onChange={(k) => upd((x) => { x.kind = k; })} options={(Object.keys(KIND_LABEL) as ValueItem["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            <div className="grid grid-cols-2 gap-2">
              {v.kind === "revenue" && (
                <>
                  <Field label="Extra revenue per month" help="valueRevenue"><NumberInput value={v.monthlyRevenue ?? 0} onChange={(n) => setOpt("monthlyRevenue", n)} /></Field>
                  <Field label="Margin kept" help="valueMargin"><NumberInput value={v.marginPct ?? 100} max={100} suffix="%" onChange={(n) => setOpt("marginPct", n)} /></Field>
                </>
              )}
              {v.kind === "quality" && (
                <>
                  <Field label="Items checked per month" help="valueVolumeFrom">
                    <Select value={v.volumeFrom ?? ""} options={[{ value: "", label: "Entered here" }, ...volumeSources.map((w) => ({ value: w.id, label: `${w.label} (${workloadVolume(w).itemsKey})` }))]} onChange={(id) => setOpt("volumeFrom", id || undefined)} />
                  </Field>
                  {from ? <div className="self-end pb-1.5 text-xs text-muted">{workloadVolume(from).items?.toLocaleString("en-CA")} a month, from {from.label}</div>
                    : <Field label="Items per month" help="valueVolume"><NumberInput value={v.volumePerMonth ?? 0} onChange={(n) => setOpt("volumePerMonth", n)} /></Field>}
                  <Field label="Error rate today" help="valueErrBefore"><NumberInput value={v.errorRateBeforePct ?? 0} max={100} step={0.1} suffix="%" onChange={(n) => setOpt("errorRateBeforePct", n)} /></Field>
                  <Field label="Error rate with AI" help="valueErrAfter"><NumberInput value={v.errorRateAfterPct ?? 0} max={100} step={0.1} suffix="%" onChange={(n) => setOpt("errorRateAfterPct", n)} /></Field>
                  <Field label="Cost of one error" help="valueCostPerError"><NumberInput value={v.costPerError ?? 0} onChange={(n) => setOpt("costPerError", n)} /></Field>
                </>
              )}
              {v.kind === "risk" && (
                <>
                  <Field label="Events per year" help="valueEvents"><NumberInput value={v.eventsPerYear ?? 0} step={0.1} onChange={(n) => setOpt("eventsPerYear", n)} /></Field>
                  <Field label="Cost of one event" help="valueImpact"><NumberInput value={v.impactCad ?? 0} onChange={(n) => setOpt("impactCad", n)} /></Field>
                  <Field label="Share prevented" help="valueReduction"><NumberInput value={v.reductionPct ?? 0} max={100} suffix="%" onChange={(n) => setOpt("reductionPct", n)} /></Field>
                </>
              )}
              <Field label={`From month (go-live ${B + 1})`} help="capLiveFrom"><NumberInput value={v.startMonth ?? B + 1} min={1} max={H} onChange={(n) => setOpt("startMonth", Math.round(n))} /></Field>
              <ConfidenceField value={v.confidencePct} onChange={(n) => setOpt("confidencePct", n)} />
              <Field label="Count it under capability" help="valueCapability">
                <Select value={v.capabilityId ?? ""} options={[{ value: "", label: "Whole project" }, ...project.benefits.capabilities.map((c) => ({ value: c.id, label: c.label }))]} onChange={(id) => setOpt("capabilityId", id || undefined)} />
              </Field>
            </div>
            <div className="text-xs text-muted"><span className="num font-semibold text-ink">{cad(valueItemMonthly(project, v))} / month</span> at full rollout, before confidence{v.kind === "risk" ? "" : v.ramp === false ? "" : ", rising with the adoption ramp"}.</div>
          </div>
        );
      })}
      <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
        onClick={() => edit((d) => { d.benefits.value.push({ id: `val-${Date.now()}`, label: "Extra revenue", kind: "revenue", monthlyRevenue: 10000, marginPct: 40 }); })}><Plus size={14} />Add benefit</button>
    </section>
  );
}
