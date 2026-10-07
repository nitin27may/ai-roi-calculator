"use client";
import { Fragment, useState } from "react";
import { CURRENT_CATEGORY_LABEL, currentLineFullSaving, currentLineMonthly, currentLines, currentVsTarget, workloadVolume, type CurrentLine } from "@roi-calculator/engine";
import { AddMenu } from "@/components/add-menu";
import { InlineConfirm } from "@/components/cost-grid";
import { HelpTip } from "@/components/help-tip";
import { NumberInput, Select, TrashButton } from "@/components/ui";
import { useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, cn } from "@/lib/format";

const CATEGORIES = Object.keys(CURRENT_CATEGORY_LABEL) as CurrentLine["category"][];
const textIn = "min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";
const small = "text-xs text-muted";

/** A new line has no change, so adding it moves no figure until someone chooses one. */
function newLine(category: CurrentLine["category"], roleId: string): CurrentLine {
  const id = `cur-${Date.now()}`;
  const keep = { mode: "keep" } as const;
  switch (category) {
    case "people": return { id, label: "People cost", category, basis: { kind: "fte", roleId, fte: 1, hoursPerMonth: 150 }, change: keep };
    case "transaction": return { id, label: "Per-transaction cost", category, basis: { kind: "perTransaction", unitCostCad: 1, volumePerMonth: 1000 }, change: keep };
    case "licence": return { id, label: "Licence", category, basis: { kind: "monthly", amountCad: 1000 }, change: keep };
    case "infrastructure": return { id, label: "Infrastructure", category, basis: { kind: "monthly", amountCad: 1000 }, change: keep };
    case "contract": return { id, label: "Contract", category, basis: { kind: "monthly", amountCad: 1000 }, change: keep };
    default: return { id, label: "Other cost", category, basis: { kind: "monthly", amountCad: 1000 }, change: keep };
  }
}

const ADD_DETAIL: Record<CurrentLine["category"], string> = {
  people: "Time of people today: FTE, hours and a role's rate",
  licence: "A licence or subscription you pay for",
  infrastructure: "Hosting, hardware, leases or other running assets",
  transaction: "A cost per item: stock, printing, postage, courier, re-issue",
  contract: "A service or support contract",
  other: "Any other monthly cost of the current way of working",
};

function Th({ children, help }: { children: string; help?: string }) {
  return <th className="whitespace-nowrap align-bottom"><span className="inline-flex items-center gap-0.5">{children}{help && <HelpTip id={help} label={children} />}</span></th>;
}

export function CurrentState() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const { ledger } = useLedger();
  const [confirm, setConfirm] = useState<string | null>(null);
  const lines = currentLines(project);
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  const volumeSources = project.workloads.filter((w) => workloadVolume(w).items !== undefined);
  const total = lines.reduce((s, l) => s + currentLineMonthly(project, l), 0);
  const saving = lines.reduce((s, l) => s + currentLineFullSaving(project, l), 0);
  const cvt = currentVsTarget(project, ledger);
  const upd = (id: string, fn: (l: CurrentLine) => void) => edit((d) => { const l = d.currentState?.lines.find((x) => x.id === id); if (l) fn(l); });

  return (
    <section aria-labelledby="current-state-h" className="flex flex-col gap-3">
      <div>
        <h3 id="current-state-h" className="inline-flex items-center gap-1 text-sm font-semibold">What the work costs today<HelpTip id="currentState" label="Current state" /></h3>
        <p className={small}>Each line can be kept, reduced or retired from a month. The saving is today&apos;s cost minus what remains, and it counts in the totals, ROI, payback and NPV. Until a line&apos;s change starts it is paid in full, which shows as dual running next to the new costs. Enter a saving here or as an avoided cost, not both.</p>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">No lines yet. Add what the work costs today and choose what changes. Nothing is saved until a line has a change.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data min-w-[1000px]">
            <thead>
              <tr>
                <Th>Item</Th><Th help="currentCategory">Category</Th><Th help="currentBasis">Basis</Th><Th help="currentChange">Change</Th>
                <Th help="currentCondition">Depends on a condition</Th><th className="n whitespace-nowrap">Cost / month</th><th className="n whitespace-nowrap">Saving / month</th><th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const cost = currentLineMonthly(project, l), save = currentLineFullSaving(project, l);
                const b = l.basis;
                const from = l.change.mode === "keep" ? undefined : l.change.fromMonth;
                return (
                  <Fragment key={l.id}>
                    <tr className="align-top">
                      <td><input className={cn(textIn, "w-44")} value={l.label} aria-label={`Item name, ${l.label}`} onChange={(e) => upd(l.id, (x) => { x.label = e.target.value; })} /></td>
                      <td className="min-w-[140px]"><Select label={`Category of ${l.label}`} value={l.category} options={CATEGORIES.map((c) => ({ value: c, label: CURRENT_CATEGORY_LABEL[c] }))} onChange={(v) => upd(l.id, (x) => { x.category = v as CurrentLine["category"]; })} /></td>
                      <td>
                        <div className="flex min-w-[210px] flex-col gap-1.5">
                          <Select label={`Basis of ${l.label}`} value={b.kind} options={[{ value: "monthly", label: "Monthly amount" }, { value: "fte", label: "People (FTE x hours x rate)" }, { value: "perTransaction", label: "Per transaction x volume" }]}
                            onChange={(k) => upd(l.id, (x) => { x.basis = k === "fte" ? { kind: "fte", roleId: project.rateCard[0]!.id, fte: 1, hoursPerMonth: 150 } : k === "perTransaction" ? { kind: "perTransaction", unitCostCad: 1, volumePerMonth: 1000 } : { kind: "monthly", amountCad: cost || 1000 }; })} />
                          {b.kind === "monthly" && <NumberInput label={`Monthly amount of ${l.label}`} value={b.amountCad} suffix="C$ / month" onChange={(v) => upd(l.id, (x) => { if (x.basis.kind === "monthly") x.basis.amountCad = v; })} />}
                          {b.kind === "fte" && (
                            <>
                              <Select label={`Role for ${l.label}`} value={b.roleId} options={project.rateCard.map((r) => ({ value: r.id, label: `${r.label} (C$${r.hourlyRate}/h)` }))} onChange={(v) => upd(l.id, (x) => { if (x.basis.kind === "fte") x.basis.roleId = v; })} />
                              <div className="grid grid-cols-2 gap-1.5">
                                <NumberInput label={`FTE for ${l.label}`} value={b.fte} step={0.1} suffix="FTE" onChange={(v) => upd(l.id, (x) => { if (x.basis.kind === "fte") x.basis.fte = v; })} />
                                <NumberInput label={`Hours a month for ${l.label}`} value={b.hoursPerMonth} suffix="h" onChange={(v) => upd(l.id, (x) => { if (x.basis.kind === "fte") x.basis.hoursPerMonth = v; })} />
                              </div>
                              <span className={small}>Rises with rate escalation each year after go-live.</span>
                            </>
                          )}
                          {b.kind === "perTransaction" && (
                            <>
                              <NumberInput label={`Cost per transaction for ${l.label}`} value={b.unitCostCad} step={0.01} suffix="C$ each" onChange={(v) => upd(l.id, (x) => { if (x.basis.kind === "perTransaction") x.basis.unitCostCad = v; })} />
                              <Select label={`Volume source for ${l.label}`} value={b.volumeFrom ?? ""} options={[{ value: "", label: "Volume entered here" }, ...volumeSources.map((w) => ({ value: w.id, label: `From ${w.label}` }))]}
                                onChange={(v) => upd(l.id, (x) => { if (x.basis.kind === "perTransaction") { if (v) x.basis.volumeFrom = v; else delete x.basis.volumeFrom; } })} />
                              {!b.volumeFrom && <NumberInput label={`Transactions a month for ${l.label}`} value={b.volumePerMonth ?? 0} suffix="a month" onChange={(v) => upd(l.id, (x) => { if (x.basis.kind === "perTransaction") x.basis.volumePerMonth = v; })} />}
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex min-w-[190px] flex-col gap-1.5">
                          <Select label={`Change to ${l.label}`} value={l.change.mode} options={[{ value: "keep", label: "Keep as it is" }, { value: "reduce", label: "Reduce" }, { value: "retire", label: "Retire" }]}
                            onChange={(m) => upd(l.id, (x) => { const f = x.change.mode === "keep" ? undefined : x.change.fromMonth; x.change = m === "keep" ? { mode: "keep" } : m === "retire" ? { mode: "retire", ...(f ? { fromMonth: f } : {}) } : { mode: "reduce", pct: x.change.mode === "reduce" ? x.change.pct : 50, followsAdoption: false, ...(f ? { fromMonth: f } : {}) }; })} />
                          {l.change.mode === "reduce" && (
                            <>
                              <NumberInput label={`Share removed from ${l.label}`} value={l.change.pct} max={100} suffix="%" onChange={(v) => upd(l.id, (x) => { if (x.change.mode === "reduce") x.change.pct = v; })} />
                              <label className="flex items-center gap-1.5 text-xs text-ink-2">
                                <input type="checkbox" checked={l.change.followsAdoption} onChange={(e) => upd(l.id, (x) => { if (x.change.mode === "reduce") x.change.followsAdoption = e.target.checked; })} />Follows adoption<HelpTip id="currentFollows" label="Follows adoption" />
                              </label>
                            </>
                          )}
                          {l.change.mode !== "keep" && (
                            <label className="flex items-center gap-1.5 text-xs text-ink-2">From month
                              <span className="w-16"><NumberInput label={`Change month for ${l.label}`} value={from ?? B + 1} min={B + 1} max={H} onChange={(v) => upd(l.id, (x) => { if (x.change.mode !== "keep") { if (Math.round(v) <= B + 1) delete x.change.fromMonth; else x.change.fromMonth = Math.round(v); } })} /></span>
                              <HelpTip id="currentFromMonth" label="From month" />
                            </label>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex min-w-[190px] flex-col gap-1.5">
                          <label className="flex items-center gap-1.5 text-xs text-ink-2">
                            <input type="checkbox" disabled={l.change.mode === "keep"} checked={!!l.decommission} onChange={(e) => upd(l.id, (x) => { if (e.target.checked) x.decommission = { conditional: true, condition: "", assumed: true }; else delete x.decommission; })} />Depends on a condition
                          </label>
                          {l.decommission && (
                            <>
                              <input className={cn(textIn, "w-full")} value={l.decommission.condition} placeholder="What must happen first" aria-label={`Condition for ${l.label}`} onChange={(e) => upd(l.id, (x) => { if (x.decommission) x.decommission.condition = e.target.value; })} />
                              <label className="flex items-center gap-1.5 text-xs text-ink-2">
                                <input type="checkbox" checked={l.decommission.assumed} onChange={(e) => upd(l.id, (x) => { if (x.decommission) x.decommission.assumed = e.target.checked; })} />Assume it happens<HelpTip id="currentAssumed" label="Assume it happens" />
                              </label>
                              {!l.decommission.assumed && <span className="text-xs text-warn">Not assumed: the line stays and saves nothing.</span>}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="n">{cad(cost)}</td>
                      <td className="n">{cad(save)}</td>
                      <td><TrashButton label={`Remove ${l.label}`} onClick={() => setConfirm(l.id)} /></td>
                    </tr>
                    {confirm === l.id && (
                      <tr>
                        <td colSpan={8}>
                          <div className="sticky left-0 max-w-[720px]">
                          <InlineConfirm groupLabel="Confirm remove" confirmLabel="Remove line"
                            message={`Remove ${l.label}? Its ${cad(cost)} a month of current cost and ${cad(save)} a month of saving leave the Summary, ROI, payback, NPV and Excel. You can undo it straight after.`}
                            onConfirm={() => { edit((d) => { if (d.currentState) d.currentState.lines = d.currentState.lines.filter((x) => x.id !== l.id); }); setConfirm(null); }}
                            onCancel={() => setConfirm(null)} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={5} className="font-semibold">Total</td><td className="n font-semibold">{cad(total)}</td><td className="n font-semibold">{cad(saving)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      )}

      <AddMenu label="Add a current cost" items={CATEGORIES.map((c) => ({ kind: c, label: CURRENT_CATEGORY_LABEL[c], detail: ADD_DETAIL[c] }))}
        onPick={(c) => edit((d) => { d.currentState = { lines: [...(d.currentState?.lines ?? []), newLine(c, d.rateCard[0]?.id ?? "")] }; })} />

      {lines.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-[12.5px] sm:grid-cols-4">
          <div><dt className="text-muted">Current cost / month</dt><dd className="num font-semibold">{cad(cvt.currentMonthly)}</dd></div>
          <div><dt className="text-muted">New run cost / month</dt><dd className="num font-semibold">{cad(cvt.targetMonthly)}</dd></div>
          <div><dt className="text-muted">Saving / month, all changes in</dt><dd className="num font-semibold">{cad(cvt.saving)}</dd></div>
          <div><dt className="text-muted">Dual-running cost</dt><dd className="num font-semibold">{cad(cvt.dualRunningCost)}</dd></div>
        </dl>
      )}
    </section>
  );
}
