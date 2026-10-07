"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { DELIVERY_COST_KINDS, HYPERCARE_ID, addDeliveryCost, applyStandardPhases, isDeliveryCategory, removeDeliveryCost, type DeliveryPhase } from "@roi-calculator/engine";
import { AddMenu } from "@/components/add-menu";
import { InlineConfirm } from "@/components/cost-grid";
import { HelpTip } from "@/components/help-tip";
import { WhereFrom } from "@/components/months";
import { NumberInput, Select, TrashButton } from "@/components/ui";
import { useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad } from "@/lib/format";

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)"];
const btn = "flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2";
const text = "rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";

/** Phases across the months, one bar per phase. Click a bar to edit it. Months after the build are shaded (production). */
export function PhaseStrip({ phases, buildMonths, selected, onSelect }: { phases: DeliveryPhase[]; buildMonths: number; selected: string | null; onSelect: (id: string) => void }) {
  const last = Math.max(buildMonths, ...phases.map((x) => x.toMonth));
  const cols = `minmax(120px,160px) repeat(${last}, minmax(22px, 1fr))`;
  return (
    <div className="overflow-x-auto" role="group" aria-label="Delivery phase timeline">
      <div className="grid min-w-[560px] items-center gap-y-1" style={{ gridTemplateColumns: cols }}>
        <div />
        {Array.from({ length: last }, (_, i) => (
          <div key={i} className={`text-center text-xs ${i + 1 > buildMonths ? "rounded-sm bg-surface-2 text-muted" : "text-ink-2"}`} title={i + 1 > buildMonths ? `Month ${i + 1}, after go-live` : `Month ${i + 1}`}>{i + 1}</div>
        ))}
        {phases.map((ph, k) => (
          <div key={ph.id} className="contents">
            <div className="truncate pr-2 text-xs text-ink-2" style={{ gridColumn: 1, gridRow: k + 2 }}>{ph.label}</div>
            <button type="button" aria-pressed={selected === ph.id} aria-label={`Edit phase ${ph.label}, months ${ph.fromMonth} to ${ph.toMonth}`}
              className={`h-5 rounded-sm text-left text-xs font-medium text-white ${selected === ph.id ? "outline outline-2 outline-offset-1 outline-ink" : ""}`}
              style={{ gridRow: k + 2, gridColumn: `${ph.fromMonth + 1} / ${ph.toMonth + 2}`, background: COLORS[k % COLORS.length]! }}
              onClick={() => onSelect(ph.id)}>
              <span className="px-1">{ph.toMonth > ph.fromMonth ? `M${ph.fromMonth}–${ph.toMonth}` : `M${ph.fromMonth}`}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Delivery phases: use the standard list, edit months and names, add or remove one. */
export function PhasesPanel() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reset" | "remove" | null>(null);
  const phases = project.timeline.phases ?? [];
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  const team = project.build.team;
  const cur = phases.find((x) => x.id === sel) ?? null;
  const idx = cur ? phases.indexOf(cur) : -1;
  const inPhase = cur ? team.filter((t) => t.phaseId === cur.id).length : 0;
  return (
    <>
      <div><h2 className="text-base font-bold">Delivery phases</h2><div className="text-xs text-muted">Stages of the delivery, across the months. Team lines can be placed in a phase.</div></div>
      {phases.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">No phases yet. The standard list is discovery, design, build, test, migration and cutover, deploy and hypercare. Using it spreads them over the {B} build months; hypercare runs after go-live.</p>
          <button type="button" className={btn} onClick={() => edit((d) => applyStandardPhases(d))}><Plus size={14} />Use standard phases</button>
        </div>
      ) : (
        <>
          <PhaseStrip phases={phases} buildMonths={B} selected={sel} onSelect={(id) => { setSel(id); setConfirm(null); }} />
          <p className="text-xs text-muted">Months shaded grey are after go-live. Click a phase to change its name or months.</p>
          {cur && (
            <div className="flex flex-col gap-2 rounded-md border border-line p-2.5">
              <div className="flex flex-wrap items-end gap-2.5">
                <label className="flex flex-col gap-0.5 text-xs text-muted"><span className="flex items-center gap-0.5">Phase name<HelpTip id="phaseLabel" label="Phase name" /></span>
                  <input aria-label="Phase name" className={`${text} w-48`} value={cur.label} onChange={(e) => edit((d) => { d.timeline.phases![idx]!.label = e.target.value; })} /></label>
                <label className="flex flex-col gap-0.5 text-xs text-muted"><span className="flex items-center gap-0.5">From month<HelpTip id="phaseFrom" label="From month" /></span>
                  <span className="w-24"><NumberInput label={`From month, phase ${cur.label}`} value={cur.fromMonth} min={1} max={H} onChange={(v) => edit((d) => { d.timeline.phases![idx]!.fromMonth = Math.round(v); })} /></span></label>
                <label className="flex flex-col gap-0.5 text-xs text-muted"><span className="flex items-center gap-0.5">To month<HelpTip id="phaseTo" label="To month" /></span>
                  <span className="w-24"><NumberInput label={`To month, phase ${cur.label}`} value={cur.toMonth} min={1} max={H} onChange={(v) => edit((d) => { d.timeline.phases![idx]!.toMonth = Math.round(v); })} /></span></label>
                <TrashButton label={`Remove phase ${cur.label}`} onClick={() => setConfirm("remove")} />
              </div>
              {cur.toMonth > B && cur.id !== HYPERCARE_ID && <p className="text-xs text-warn">Only Hypercare is billed after the build. Lines in this phase are cut at month {B}.</p>}
              {cur.id === HYPERCARE_ID && cur.toMonth > B && <p className="text-xs text-muted">Team lines in this phase are billed as labour after go-live, through month {Math.min(cur.toMonth, H)}.</p>}
              {confirm === "remove" && (
                <InlineConfirm groupLabel="Confirm remove phase" confirmLabel="Remove phase"
                  message={`Remove ${cur.label}? ${inPhase > 0 ? `${inPhase} team line${inPhase === 1 ? "" : "s"} in it stop belonging to a phase (their months stay).` : "No team line is in it."} ${cur.id === HYPERCARE_ID ? "Hypercare lines stop being billed after go-live." : ""}`}
                  onConfirm={() => { edit((d) => { d.timeline.phases = d.timeline.phases!.filter((x) => x.id !== cur.id); for (const t of d.build.team) if (t.phaseId === cur.id) delete t.phaseId; }); setSel(null); setConfirm(null); }}
                  onCancel={() => setConfirm(null)} />
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} onClick={() => {
              let n = 1; while (phases.some((x) => x.id === `phase-${n}`)) n++;
              const id = `phase-${n}`;
              edit((d) => { (d.timeline.phases ??= []).push({ id, label: "New phase", fromMonth: 1, toMonth: Math.max(1, d.timeline.buildMonths) }); });
              setSel(id);
            }}><Plus size={14} />Add phase</button>
            <button type="button" className={btn} onClick={() => setConfirm("reset")}>Reset to standard phases</button>
          </div>
          {confirm === "reset" && (
            <InlineConfirm groupLabel="Confirm reset phases" confirmLabel="Reset phases"
              message="Replace all phases with the standard list for the current build length? Your own names, months, added phases and removed phases are lost. Team lines keep their months and phase links where the id still exists."
              onConfirm={() => { edit((d) => applyStandardPhases(d)); setSel(null); setConfirm(null); }}
              onCancel={() => setConfirm(null)} />
          )}
        </>
      )}
      <WhereFrom>the phases you set here. They move no cost on their own: a team line follows its phase&apos;s months, and only team lines in Hypercare are billed after the last build month.</WhereFrom>
    </>
  );
}

/** Non-labour delivery costs: vendor work, training, communications, data migration, other. */
export function DeliveryCostsPanel() {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [confirm, setConfirm] = useState<string | null>(null);
  const items = project.build.deliveryCosts ?? [];
  const B = project.timeline.buildMonths;
  const billed = (id: string) => ledger.months.slice(0, B).flatMap((m) => m.lines).filter((l) => l.id === `delivery:${id}`).reduce((s, l) => s + l.cost, 0);
  const total = items.reduce((s, it) => s + billed(it.id), 0);
  const upd = (id: string, fn: (it: NonNullable<typeof project.build.deliveryCosts>[number]) => void) => edit((d) => { const it = d.build.deliveryCosts?.find((x) => x.id === id); if (it) fn(it); });
  const kinds = DELIVERY_COST_KINDS.map((k) => ({ value: k.kind, label: k.label }));
  return (
    <>
      <div><h2 className="text-base font-bold">Delivery costs</h2><div className="text-xs text-muted">Costs of getting live that are not people&apos;s time and not infrastructure: vendor work, training, communications, data migration.</div></div>
      <div className="font-display text-[26px] font-bold">{cad(total)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">over {B} months{project.build.contingencyScope === "all" && project.build.contingencyPct > 0 ? `, with ${project.build.contingencyPct}% contingency` : ""}</span></div>
      {items.length > 0 && (
        <div className="flex-none overflow-x-auto">
          <table className="data">
            <thead><tr><th>Item</th><th><span className="inline-flex items-center gap-0.5">Category<HelpTip id="deliveryCostCategory" label="Category" /></span></th><th>Billed</th><th className="n"><span className="inline-flex items-center gap-0.5">Amount<HelpTip id="deliveryCostAmount" label="Amount" /></span></th><th className="n">In the plan</th><th /></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td><input aria-label="Item name" className={`${text} w-44`} value={it.label} onChange={(e) => upd(it.id, (x) => { x.label = e.target.value; })} /></td>
                  <td className="min-w-[170px]"><Select label={`Category, ${it.label}`} value={it.category} options={kinds} onChange={(v) => upd(it.id, (x) => { if (isDeliveryCategory(v)) x.category = v; })} /></td>
                  <td className="min-w-[150px]">
                    <Select label={`Billed, ${it.label}`} value={it.cadence} options={[{ value: "once", label: "Once" }, { value: "monthly", label: "Every build month" }]} onChange={(v) => upd(it.id, (x) => { x.cadence = v === "monthly" ? "monthly" : "once"; })} />
                    {it.cadence === "once" && <div className="mt-1"><NumberInput label={`Month, ${it.label}`} value={it.month ?? 0} min={0} max={B} suffix={it.month ? "month" : "month 1"} onChange={(v) => upd(it.id, (x) => { if (Math.round(v) > 0) x.month = Math.round(v); else delete x.month; })} /></div>}
                  </td>
                  <td className="n min-w-[140px]"><NumberInput label={`Amount, ${it.label}`} value={it.amountCad} suffix="C$" onChange={(v) => upd(it.id, (x) => { x.amountCad = v; })} /></td>
                  <td className="n num">{cad(billed(it.id))}</td>
                  <td><TrashButton label={`Remove ${it.label}`} onClick={() => setConfirm(it.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.filter((it) => it.id === confirm).map((it) => (
            <div key={it.id} className="mt-2 max-w-[720px]">
              <InlineConfirm groupLabel="Confirm remove delivery cost" confirmLabel="Remove cost"
                message={`Remove ${it.label}? Its ${cad(billed(it.id))} leaves build cost, the Summary, ROI, payback, NPV and Excel. You can undo it straight after.`}
                onConfirm={() => { edit((d) => removeDeliveryCost(d, it.id)); setConfirm(null); }}
                onCancel={() => setConfirm(null)} />
            </div>
          ))}
        </div>
      )}
      <AddMenu label="Add delivery cost" items={DELIVERY_COST_KINDS.map((k) => ({ kind: k.kind, label: k.label, detail: k.detail }))} onPick={(k) => edit((d) => { addDeliveryCost(d, k); })} />
      {items.length === 0 && <p className="text-xs text-muted">None yet. Add one from the menu; nothing is assumed.</p>}
      <WhereFrom>the items above, in the build months. A one-off item lands in the month you give (month 1 when empty); contingency is added only when it covers all costs (below, under Team &amp; rate card). They count under the Full lifecycle basis, not Running cost only or Running plus maintenance, and the AI dev-cost cut does not reduce them.</WhereFrom>
    </>
  );
}
