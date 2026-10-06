"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ALLOWANCE_ID, allowanceActive, clearActivityOverrides, monthOverride, setMonthOverride, type DevActivity } from "@studio/engine";
import { MonthTh, TableNote } from "@/components/months";
import { useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad } from "@/lib/format";
import { MONTH_TABLE_NOTES } from "@/lib/months";
import { cellLabel, parseOverrideInput } from "@/lib/overrides";

const btn = "inline-flex min-h-6 items-center whitespace-nowrap rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:bg-surface-2";

/** Inline confirmation: no browser dialog. It says exactly what is lost and puts focus on Cancel. */
export function InlineConfirm({ message, confirmLabel, onConfirm, onCancel, id }: { message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; id?: string }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <div id={id} role="group" aria-label="Confirm reset" className="flex flex-wrap items-center gap-2 rounded-md border border-crit bg-crit-soft px-2.5 py-1.5 text-xs text-ink" onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <span>{message}</span>
      <button type="button" className={`${btn} border-crit text-crit`} onClick={onConfirm}>{confirmLabel}</button>
      <button type="button" ref={cancel} className={btn} onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** One editable month cell: typed C$ replaces the calculation; blank restores it. Commits on blur or Enter, Escape discards. */
function Cell({ label, calculated, typed, onCommit, shade }: { label: string; calculated: number; typed: number | undefined; onCommit: (v: number | undefined) => void; shade: number }) {
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const edited = typed !== undefined;
  const commit = (text: string) => {
    const r = parseOverrideInput(text);
    if (r.kind === "error") { setError(r.message); return; }
    setError(null);
    const next = r.kind === "set" ? r.value : undefined;
    if (next !== typed) onCommit(next);
  };
  const errId = `${label.replace(/\W+/g, "-")}-err`;
  return (
    <td className="n w-24 min-w-24 max-w-24 align-top" style={{ background: `color-mix(in srgb, var(--s1) ${shade}%, transparent)` }} title={edited ? `Edited. Calculated: ${cad(calculated)}` : `Calculated: ${cad(calculated)}. Type an amount to replace it.`}>
      <span className="flex items-center gap-1">
        {edited && <span aria-hidden className="inline-block h-2 w-2 flex-none rounded-full bg-accent" />}
        <input ref={ref} key={typed ?? "calc"} type="text" inputMode="decimal" aria-label={label} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined}
          defaultValue={typed === undefined ? "" : String(typed)} placeholder={cad(calculated).replace("C$", "")}
          className={`num w-full min-w-0 rounded-md border bg-surface-2 px-1.5 py-1 text-right text-[12.5px] font-medium text-ink placeholder:font-normal placeholder:text-ink-2 ${edited ? "border-dashed border-accent" : "border-line"} ${error ? "border-crit" : ""}`}
          onChange={() => setError(null)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
            if (e.key === "Escape") { e.currentTarget.value = typed === undefined ? "" : String(typed); setError(null); }
          }} />
      </span>
      {edited && (
        <span className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted">
          <span>edited</span>
          <button type="button" className="rounded px-1 text-accent underline underline-offset-2" aria-label={`Reset ${label} to calculated`} onClick={() => onCommit(undefined)}>Reset</button>
        </span>
      )}
      {error && <span id={errId} role="alert" className="mt-0.5 block max-w-24 whitespace-normal text-left text-xs leading-snug text-crit">{error}</span>}
    </td>
  );
}

/** The Cost grid view: calculated C$ per activity and month, each cell editable. */
export function CostGrid() {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [confirmRow, setConfirmRow] = useState<string | null>(null);
  const B = project.timeline.buildMonths, months = ledger.months.slice(0, B), acts = project.build.activities;

  if (allowanceActive(project)) {
    const total = ledger.totals.devLab;
    return (
      <div className="overflow-auto">
        <TableNote>
          A fixed AI Dev Lab allowance of <b>{cad(project.build.devLabMonthlyCad!)}</b> a month is set, so it replaces the calculated cost and the cells below are not editable. Change or remove it under <Link href="/settings#ai-dev-lab" className="font-medium text-accent underline underline-offset-2">Settings, AI Dev Lab</Link> to edit cells again. Cells you typed earlier are kept and apply again once the allowance is removed.
        </TableNote>
        <table className="data">
          <thead><tr><th>Activity</th>{months.map((m) => <MonthTh key={m.m} m={m.m} />)}<th className="n">Total</th></tr></thead>
          <tbody>
            <tr><td>Fixed monthly allowance</td>{months.map((m) => <td key={m.m} className="n">{cad(m.lines.filter((l) => l.componentId === ALLOWANCE_ID).reduce((s, l) => s + l.cost, 0))}</td>)}<td className="n">{cad(total)}</td></tr>
            <tr className="total"><td>Total</td>{months.map((m) => <td key={m.m} className="n">{cad(m.byStream.devlab)}</td>)}<td className="n">{cad(total)}</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  const cost = (id: string, mi: number) => months[mi]!.lines.filter((l) => l.componentId === id && l.stream === "devlab").reduce((s, l) => s + l.cost, 0);
  /** What the calculation gives for the cell, even when a typed amount replaced it. */
  const calc = (id: string, mi: number) => { const ls = months[mi]!.lines.filter((l) => l.componentId === id && l.stream === "devlab"); return ls.some((l) => l.manual) ? ls.reduce((s, l) => s + (l.calculated ?? l.cost), 0) : ls.reduce((s, l) => s + l.cost, 0); };
  const mx = Math.max(1, ...acts.flatMap((a) => months.map((_, i) => cost(a.id, i))));
  const update = (id: string, fn: (a: DevActivity) => void) => edit((d) => { const a = d.build.activities.find((x) => x.id === id); if (a) fn(a); });
  return (
    <div className="overflow-auto">
      <TableNote>{MONTH_TABLE_NOTES.cost} Amounts are AI Dev Lab spend only; build labour is on Team &amp; rate card.</TableNote>
      <table className="data">
        <thead><tr><th>Activity</th>{months.map((m) => <MonthTh key={m.m} m={m.m} />)}<th className="n">Total</th></tr></thead>
        <tbody>
          {acts.map((a) => {
            const typedMonths = months.flatMap((_, i) => (monthOverride(a, i + 1) !== undefined ? [i + 1] : []));
            return (
              <tr key={a.id}>
                <td className="align-top">
                  {a.label}
                  {typedMonths.length > 0 && (
                    <span className="mt-0.5 block text-xs text-muted">
                      {typedMonths.length} edited {typedMonths.length === 1 ? "month" : "months"}{" "}
                      <button type="button" className="text-accent underline underline-offset-2" aria-expanded={confirmRow === a.id} aria-label={`Reset ${a.label} row to calculated`} onClick={() => setConfirmRow(confirmRow === a.id ? null : a.id)}>Reset row</button>
                    </span>
                  )}
                  {confirmRow === a.id && (
                    <div className="mt-1 max-w-xs">
                      <InlineConfirm message={`Discard the amounts you typed for ${a.label} in month${typedMonths.length === 1 ? "" : "s"} ${typedMonths.join(", ")}? The calculated costs return.`} confirmLabel="Reset row" onConfirm={() => { update(a.id, clearActivityOverrides); setConfirmRow(null); }} onCancel={() => setConfirmRow(null)} />
                    </div>
                  )}
                </td>
                {months.map((_, i) => (
                  <Cell key={i} label={cellLabel(a.label, i + 1)} calculated={calc(a.id, i)} typed={monthOverride(a, i + 1)} shade={Math.round((cost(a.id, i) / mx) * 38)}
                    onCommit={(v) => update(a.id, (x) => setMonthOverride(x, i + 1, v))} />
                ))}
                <td className="n align-top">{cad(months.reduce((t, _, i) => t + cost(a.id, i), 0))}</td>
              </tr>
            );
          })}
          <tr className="total"><td>Total</td>{months.map((m) => <td key={m.m} className="n">{cad(m.byStream.devlab)}</td>)}<td className="n">{cad(ledger.totals.devLab)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
