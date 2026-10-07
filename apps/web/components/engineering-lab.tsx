"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AI_ASSIST_MAX_PCT, addEngineeringTool, aiAssistSummary, envCost, isCashItem, newActivity, setAiAssistPct, type EngineeringToolKind } from "@roi-calculator/engine";
import { AddMenu } from "@/components/add-menu";
import { InlineConfirm } from "@/components/cost-grid";
import { ACTIVITY_SPECS, Fields } from "@/components/fields";
import { HelpTip } from "@/components/help-tip";
import { WhereFrom } from "@/components/months";
import { NumberInput, Select, TrashButton } from "@/components/ui";
import { catalog, useLedger } from "@/lib/compute";
import { TOOL_MENU } from "@/lib/engineering-lab";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";

const btn = "flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2";
const text = "rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";

/** Tools and licences: cash items in the build environment list (per person or fixed, monthly or once), plus any catalogue services already there. */
export function ToolsPanel({ onOpenAi }: { onOpenAi: () => void }) {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [confirm, setConfirm] = useState<string | null>(null);
  const B = project.timeline.buildMonths;
  const items = project.build.environment;
  const billed = (id: string) => ledger.months.slice(0, B).flatMap((m) => m.lines).filter((l) => l.id === `devenv:${id}`).reduce((s, l) => s + l.cost, 0);
  const total = ledger.months.slice(0, B).reduce((s, m) => s + m.byStream.devenv, 0);
  const unitOf = (id: string) => catalog.unitPrices.find((u) => u.id === id);
  const upd = (id: string, fn: (it: (typeof items)[number]) => void) => edit((d) => { const it = d.build.environment.find((x) => x.id === id); if (it) fn(it); });
  const hasAi = project.build.activities.some((a) => a.kind === "tooling");
  const pick = (kind: string) => {
    if (kind === "aiAssisted") {
      if (!hasAi) edit((d) => { d.build.activities.push(newActivity(d, "tooling")); });
      onOpenAi();
      return;
    }
    edit((d) => { addEngineeringTool(d, kind as EngineeringToolKind); });
  };
  return (
    <>
      <div><h2 className="text-base font-bold">Tools and licences</h2><div className="text-xs text-muted">What the team pays for while building: developer licences, CI/CD, test tooling, load testing, dev services. Billed in the build months.</div></div>
      <div className="font-display text-[26px] font-bold">{cad(total)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">over {B} months</span></div>
      {items.length > 0 && (
        <div className="flex-none overflow-x-auto">
          <table className="data">
            <thead><tr><th>Tool</th><th><span className="inline-flex items-center gap-0.5">Billed<HelpTip id="toolAmount" label="Billed" /></span></th><th><span className="inline-flex items-center gap-0.5">Per person<HelpTip id="toolPerPerson" label="Per person" /></span></th><th className="n">Amount</th><th className="n">Over the build</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td><input aria-label="Tool name" className={`${text} w-44`} value={it.label} onChange={(e) => upd(it.id, (x) => { x.label = e.target.value; })} /></td>
                  {isCashItem(it) ? (
                    <>
                      <td className="min-w-[150px]">
                        <Select label={`Billed, ${it.label}`} value={it.cadence} options={[{ value: "monthly", label: "Every build month" }, { value: "once", label: "Once" }]} onChange={(v) => upd(it.id, (x) => { if (isCashItem(x)) x.cadence = v === "once" ? "once" : "monthly"; })} />
                        {it.cadence === "once" && <div className="mt-1"><NumberInput label={`Month, ${it.label}`} value={it.month ?? 0} min={0} max={B} suffix={it.month ? "month" : "month 1"} onChange={(v) => upd(it.id, (x) => { if (!isCashItem(x)) return; if (Math.round(v) > 0) x.month = Math.round(v); else delete x.month; })} /></div>}
                      </td>
                      <td><input type="checkbox" aria-label={`Per person, ${it.label}`} checked={it.perPerson === true} onChange={(e) => upd(it.id, (x) => { if (!isCashItem(x)) return; if (e.target.checked) x.perPerson = true; else delete x.perPerson; })} /></td>
                      <td className="n min-w-[140px]"><NumberInput label={`Amount, ${it.label}`} value={it.amountCad} suffix="C$" onChange={(v) => upd(it.id, (x) => { if (isCashItem(x)) x.amountCad = v; })} /></td>
                    </>
                  ) : (
                    <>
                      <td className="text-xs text-muted">Catalogue price, per month<br />{unitOf(it.unitPriceId)?.label ?? it.unitPriceId}</td>
                      <td className="text-xs text-muted">no</td>
                      <td className="n min-w-[140px]"><NumberInput label={`Quantity, ${it.label}`} value={it.quantity} suffix={unitOf(it.unitPriceId)?.unit} onChange={(v) => upd(it.id, (x) => { if (!isCashItem(x)) x.quantity = v; })} /></td>
                    </>
                  )}
                  <td className="n num">{cad(billed(it.id))}</td>
                  <td><TrashButton label={`Remove ${it.label}`} onClick={() => setConfirm(it.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.filter((it) => it.id === confirm).map((it) => (
            <div key={it.id} className="mt-2 max-w-[720px]">
              <InlineConfirm groupLabel="Confirm remove tool" confirmLabel="Remove tool"
                message={`Remove ${it.label}? Its ${cad(billed(it.id))} leaves build cost, the Summary, ROI, payback, NPV and Excel. You can undo it straight after.`}
                onConfirm={() => { edit((d) => { d.build.environment = d.build.environment.filter((x) => x.id !== it.id); }); setConfirm(null); }}
                onCancel={() => setConfirm(null)} />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <AddMenu label="Add tool" items={TOOL_MENU} onPick={pick} />
        <button type="button" className={btn} onClick={() => edit((d) => { let n = 1; while (d.build.environment.some((x) => x.id === `tool-${n}`)) n++; d.build.environment.push({ id: `tool-${n}`, label: "Catalogue service", unitPriceId: catalog.unitPrices.find((u) => u.platform === "azure")!.id, quantity: 1 }); })}><Plus size={14} />Add catalogue service</button>
      </div>
      {items.length === 0 && <p className="text-xs text-muted">None yet. Add one from the menu; nothing is assumed and a new tool costs C$0 until you type an amount.</p>}
      <WhereFrom>the items above. A per-person tool is the amount times the people on the build team in each month; the others are fixed. They appear in the Overview under Engineering tools &amp; lab. Like the other build costs they are reduced by the development-cost cut on Value &amp; ROI when one is set.</WhereFrom>
    </>
  );
}

/** Test environments are modelled on the Infrastructure page; this panel shows what they cost during the build and links there. */
export function TestEnvironmentsPanel() {
  const { project, ledger } = useLedger();
  const B = project.timeline.buildMonths;
  const months = ledger.months.slice(0, B);
  const total = months.reduce((s, m) => s + envCost(m), 0);
  const envs = project.environments ?? [];
  const nonProd = envs.filter((e) => !e.production);
  return (
    <>
      <div><h2 className="text-base font-bold">Test environments</h2><div className="text-xs text-muted">Dev, test and UAT environments are modelled on the Infrastructure page.</div></div>
      <div className="font-display text-[26px] font-bold">{cad(total)}<span className="ml-1.5 font-sans text-xs font-normal text-muted">over {B} build months</span></div>
      {nonProd.length === 0
        ? <p className="text-sm text-muted">No non-production environments yet, so nothing is billed here. Add environments and resources on the Infrastructure page: a dev environment at half size on a 10 hour, 22 day schedule, a UAT environment for two months, and so on.</p>
        : <ul className="text-[13px]">{nonProd.map((e) => <li key={e.id}>{e.label}<span className="text-muted">, months {e.fromMonth ?? 1} to {e.toMonth ?? B}, size {e.sizeFactor}</span></li>)}</ul>}
      <Link href="/infrastructure" className="w-fit text-sm underline">Edit environments on Infrastructure</Link>
      <WhereFrom to="/infrastructure" toLabel="Infrastructure">the resources and environments defined there. Their cost in the build months is added to the build total once; it is not repeated in Tools and licences.</WhereFrom>
    </>
  );
}

/** AI-assisted development: productivity percentage per role, seat and token cost, and the net saving. */
export function AiAssistPanel({ onRemoved }: { onRemoved: () => void }) {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [confirm, setConfirm] = useState(false);
  const B = project.timeline.buildMonths;
  const pcts = project.build.aiAssist?.productivityPctByRole ?? {};
  const a = project.build.activities.find((x) => x.kind === "tooling");
  const sum = useMemo(() => aiAssistSummary({ ...project, build: { ...project.build, aiAssist: project.build.aiAssist ?? { productivityPctByRole: {} } } }, ledger, catalog), [project, ledger]);
  const both = project.roi.devCutPct > 0 && Object.keys(pcts).length > 0;
  const toolSeries = a ? ledger.months.slice(0, B).flatMap((m) => m.lines.filter((l) => l.componentId === a.id)).reduce((s, l) => s + l.cost, 0) : 0;
  const locate = (d: typeof project) => d.build.activities.find((x) => x.id === a?.id) as unknown as Record<string, unknown>;
  const rows: [string, string, string][] = sum ? [
    ["Hours saved", `${fmt(sum.hoursSaved, 0)} h`, "team hours not billed, build months and hypercare"],
    ["Labour saved", cad(sum.labourSaved), "with contingency, as the lines are billed"],
    ["Seat and token cost", cad(sum.toolCost), "AI coding tools over the build"],
    ["Net saving", cad(sum.net), "labour saved minus seat and token cost"],
  ] : [];
  return (
    <>
      <div><h2 className="text-base font-bold">AI-assisted development</h2><div className="text-xs text-muted">How many build hours AI coding tools save, by role, against what the seats and tokens cost.</div></div>
      <div className="font-display text-[26px] font-bold">{sum && Object.keys(pcts).length > 0 ? cad(sum.net) : "Not set"}<span className="ml-1.5 font-sans text-xs font-normal text-muted">{Object.keys(pcts).length > 0 ? "net saving over the build" : "enter a percentage for a role to start"}</span></div>
      <div className="flex-none overflow-x-auto">
        <table className="data">
          <thead><tr><th>Role</th><th className="n">Rate</th><th className="n"><span className="inline-flex items-center gap-0.5">Hours saved<HelpTip id="aiAssistPct" label="Hours saved" /></span></th></tr></thead>
          <tbody>
            {project.rateCard.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td className="n">{cad(r.hourlyRate)}/h</td>
                <td className="n w-40"><NumberInput label={`Hours saved by AI, ${r.label}`} value={pcts[r.id] ?? 0} min={0} max={AI_ASSIST_MAX_PCT} suffix="%" onChange={(v) => edit((d) => setAiAssistPct(d, r.id, v))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Empty means no change. Each team line for a listed role bills hours times (1 minus the percentage), in the build months and in hypercare.</p>
      {both && <div role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">Both this table and &quot;Reduce development cost&quot; ({project.roi.devCutPct}%, Value &amp; ROI) are set. They multiply, so the same saving is counted twice. Use one of them.</div>}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[12.5px]" data-testid="ai-assist-summary">
          {rows.map(([k, v, note]) => (
            <div key={k} className="contents">
              <dt className="text-ink-2">{k}<small className="block text-muted">{note}</small></dt>
              <dd className="num self-center text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Seats and tokens</h3>
        {a ? (
          <>
            <p className="mb-2 text-xs text-muted">{cad(toolSeries)} over {B} months. Seats and tokens scale with the developers on Team &amp; rate card who are ticked &quot;Experiments&quot;.</p>
            <Fields specs={ACTIVITY_SPECS.tooling ?? []} value={a as unknown as Record<string, unknown>} locate={locate} />
            <div className="mt-2">
              <TrashButton label="Remove seats and tokens" onClick={() => setConfirm(true)} />
              {confirm && (
                <div className="mt-2 max-w-[720px]">
                  <InlineConfirm groupLabel="Confirm remove seats and tokens" confirmLabel="Remove seats and tokens"
                    message={`Remove ${a.label}? Its ${cad(toolSeries)} leaves build cost and the net saving above. The percentages stay.`}
                    onConfirm={() => { edit((d) => { d.build.activities = d.build.activities.filter((y) => y.kind !== "tooling"); }); setConfirm(false); onRemoved(); }}
                    onCancel={() => setConfirm(false)} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">No seat or token cost yet, so the saving above is not netted against anything. Add it to count Copilot seats and coding-agent tokens.</p>
            <button type="button" className={btn} onClick={() => edit((d) => { d.build.activities.push(newActivity(d, "tooling")); })}><Plus size={14} />Add seats and tokens</button>
          </div>
        )}
      </div>
      <WhereFrom>the percentages above, the team lines on Team &amp; rate card and the seat and token inputs. Roles you leave empty are unchanged. The saving is an assumption, not a measurement: replace it with the result of a pilot when you have one.</WhereFrom>
    </>
  );
}
