"use client";
import { useState } from "react";
import { isSeatUnit, isTransactionUnit, requestVolumes, steadyState, userCounts, workloadWindow, type Workload } from "@roi-calculator/engine";
import { Field, NumberInput, Select } from "@/components/ui";
import { catalog, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";

type Of<K extends Workload["kind"]> = Extract<Workload, { kind: K }>;
type PriceMode = "" | "catalogue" | "own";

function useUpdate<K extends Workload["kind"]>(id: string, kind: K) {
  const edit = useStudio((s) => s.edit);
  return (fn: (x: Of<K>) => void) => edit((d) => { const x = d.workloads.find((y) => y.id === id); if (x?.kind === kind) fn(x as Of<K>); });
}

/** A short inline note under a field group. Refused numbers are explained by NumberInput itself; this covers what no single field can see. */
function Note({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  return <p role={tone === "warn" ? "alert" : "note"} className={tone === "warn" ? "rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn" : "text-xs text-muted"}>{children}</p>;
}

/** How the month's amount is worked out, taken from the ledger's own formula strings so the panel never disagrees with the numbers. */
function Formulas({ id }: { id: string }) {
  const { ledger } = useLedger();
  const lines = steadyState(ledger).lines.filter((l) => l.componentId === id && !l.once);
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">How it is worked out</h3>
      {lines.length === 0
        ? <p className="text-xs text-muted">Nothing is charged yet. Fill in the fields above.</p>
        : <ul className="list-disc pl-5 text-xs text-ink-2">{lines.map((l) => <li key={l.id}>{l.formula} = {cad(l.cost, 2)} a month</li>)}</ul>}
    </div>
  );
}

function PriceFields({ mode, setMode, label, unitId, own, priceOptions, onUnit, onOwn, ids }: {
  mode: PriceMode; setMode: (m: PriceMode) => void; label: string; unitId?: string; own?: number; priceOptions: { value: string; label: string }[];
  onUnit: (v: string | undefined) => void; onOwn: (v: number | undefined) => void; ids: "seats" | "txn";
}) {
  const sourceSelect = (
    <Select label={`${label} price source`} value={mode} onChange={(v) => { const m = v as PriceMode; setMode(m); if (m !== "catalogue") onUnit(undefined); if (m !== "own") onOwn(undefined); if (m === "own") onOwn(0); }}
      options={[{ value: "", label: "Choose a price source" }, { value: "catalogue", label: "Catalogue price" }, { value: "own", label: "Your own price" }]} />
  );
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-start gap-2.5">
      {ids === "seats" ? <Field label="Price source" help="seatsPriceSource">{sourceSelect}</Field> : <Field label="Price source" help="txnPriceSource">{sourceSelect}</Field>}
      {mode === "catalogue" && (ids === "seats"
        ? <Field label="Catalogue price" help="seatsUnitPrice"><Select value={unitId ?? ""} onChange={(v) => onUnit(v || undefined)} options={[{ value: "", label: "Choose a price" }, ...priceOptions]} /></Field>
        : <Field label="Catalogue price" help="txnUnitPrice"><Select value={unitId ?? ""} onChange={(v) => onUnit(v || undefined)} options={[{ value: "", label: "Choose a price" }, ...priceOptions]} /></Field>)}
      {mode === "own" && (ids === "seats"
        ? <Field label="Your price per seat per month" help="seatsOwnPrice"><NumberInput value={own ?? 0} suffix="C$" step={0.01} onChange={(v) => onOwn(v)} /></Field>
        : <Field label="Your price per transaction" help="txnOwnPrice"><NumberInput value={own ?? 0} suffix="C$" step={0.001} onChange={(v) => onOwn(v)} /></Field>)}
    </div>
  );
}

const modeOf = (unitId: string | undefined, own: number | undefined): PriceMode => (unitId !== undefined ? "catalogue" : own !== undefined ? "own" : "");

/** Seats and licences: a seat count (entered, or from another workload), a per-seat price, whether seats ramp with adoption, and free seats. Render with `key={w.id}`. */
export function SeatsPanel({ w }: { w: Of<"seats"> }) {
  const { project } = useLedger();
  const upd = useUpdate(w.id, "seats");
  const [mode, setMode] = useState<PriceMode>(modeOf(w.unitPriceId, w.cadPerSeat));
  const sources = [...userCounts(project.workloads)].filter(([id]) => id !== w.id);
  const linked = w.volumeFrom !== undefined ? userCounts(project.workloads).get(w.volumeFrom) : undefined;
  const count = linked ?? w.seats;
  const priceOptions = catalog.unitPrices.filter((u) => isSeatUnit(u.unit)).map((u) => ({ value: u.id, label: `${u.label} (${cad(u.price ?? u.manual?.price ?? 0, 2)})` }));
  const priced = mode === "catalogue" ? w.unitPriceId !== undefined : mode === "own";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-start gap-2.5">
        <Field label="Where the seat count comes from" help="seatsVolumeFrom">
          <Select value={w.volumeFrom ?? ""} onChange={(v) => upd((x) => { if (v) x.volumeFrom = v; else delete x.volumeFrom; })}
            options={[{ value: "", label: "Entered here" }, ...sources.map(([id, n]) => ({ value: id, label: `${project.workloads.find((y) => y.id === id)?.label ?? id} (${fmt(n)})` }))]} />
        </Field>
        {w.volumeFrom === undefined
          ? <Field label="Seats" help="seatsCount"><NumberInput value={w.seats} onChange={(v) => upd((x) => { x.seats = v; })} /></Field>
          : <div className="text-xs text-muted">Seats: <b className="text-ink">{fmt(count)}</b>, from the workload picked on the left.</div>}
        <Field label="Free seats included" help="seatsFree">
          <NumberInput value={w.freeSeats ?? 0} max={count} onChange={(v) => upd((x) => { if (v > 0) x.freeSeats = v; else delete x.freeSeats; })} />
        </Field>
        <Field label="Seats ramp with adoption" help="seatsFollowsAdoption">
          <Select value={w.followsAdoption ? "yes" : "no"} onChange={(v) => upd((x) => { x.followsAdoption = v === "yes"; })}
            options={[{ value: "no", label: "No, billed in full from go-live" }, { value: "yes", label: "Yes, follows the adoption ramp" }]} />
        </Field>
      </div>
      <PriceFields ids="seats" mode={mode} setMode={setMode} label="Seats" unitId={w.unitPriceId} own={w.cadPerSeat} priceOptions={priceOptions}
        onUnit={(v) => upd((x) => { if (v) x.unitPriceId = v; else delete x.unitPriceId; })} onOwn={(v) => upd((x) => { if (v === undefined) delete x.cadPerSeat; else x.cadPerSeat = v; })} />
      {!priced && <Note tone="warn">No price is set, so this item adds no cost. Choose a price source above.</Note>}
      {priced && count <= 0 && <Note tone="warn">The seat count is 0, so this item adds no cost.</Note>}
      {(w.freeSeats ?? 0) >= count && count > 0 && <Note tone="warn">Free seats cover every seat, so nothing is billed.</Note>}
      <Note tone="info">With the ramp on, seats follow the ramp set under Timing (the project&apos;s adoption ramp unless you change it here) and the project growth rate, like other usage.</Note>
      <Formulas id={w.id} />
    </div>
  );
}

/** A vendor or support contract: an amount per month or per year, with yearly escalation. Start and end months are the Timing fields below. */
export function ContractPanel({ w }: { w: Of<"contract"> }) {
  const { project } = useLedger();
  const upd = useUpdate(w.id, "contract");
  const win = workloadWindow(project, w);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] items-start gap-2.5">
        <Field label="Amount" help="contractAmount"><NumberInput value={w.amountCad} suffix="C$" onChange={(v) => upd((x) => { x.amountCad = v; })} /></Field>
        <Field label="Billed" help="contractCadence">
          <Select value={w.cadence} onChange={(v) => upd((x) => { x.cadence = v === "yearly" ? "yearly" : "monthly"; })} options={[{ value: "monthly", label: "Per month" }, { value: "yearly", label: "Per year" }]} />
        </Field>
        <Field label="Yearly escalation (0 = none)" help="contractEscalation">
          <NumberInput value={w.escalationPct ?? 0} max={100} suffix="%" step={0.5} onChange={(v) => upd((x) => { if (v > 0) x.escalationPct = v; else delete x.escalationPct; })} />
        </Field>
      </div>
      {w.amountCad <= 0 && <Note tone="warn">The amount is 0, so this item adds no cost.</Note>}
      {w.endMonth !== undefined && w.endMonth < win.start && <Note tone="warn">The contract ends in month {w.endMonth}, before it starts in month {win.start}, so it adds no cost.</Note>}
      <Note tone="info">The contract bills from its start month (go-live unless set under Timing) to its end month. Escalation counts whole years from the start month. A yearly amount is spread as one twelfth a month.</Note>
      <Formulas id={w.id} />
    </div>
  );
}

/** A per-transaction fee: a monthly volume (entered or from another workload) times a catalogue or own price per transaction. */
export function TransactionFeePanel({ w }: { w: Of<"transactionFee"> }) {
  const { project } = useLedger();
  const upd = useUpdate(w.id, "transactionFee");
  const [mode, setMode] = useState<PriceMode>(modeOf(w.unitPriceId, w.cadPerTxn));
  const sources = [...requestVolumes(project.workloads)].filter(([id]) => id !== w.id);
  const linked = w.volumeFrom !== undefined ? requestVolumes(project.workloads).get(w.volumeFrom) : undefined;
  const priceOptions = catalog.unitPrices.filter((u) => isTransactionUnit(u.unit)).map((u) => ({ value: u.id, label: `${u.label} (${u.unit})` }));
  const priced = mode === "catalogue" ? w.unitPriceId !== undefined : mode === "own";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-start gap-2.5">
        <Field label="Where the volume comes from" help="txnVolumeFrom">
          <Select value={w.volumeFrom ?? ""} onChange={(v) => upd((x) => { if (v) x.volumeFrom = v; else delete x.volumeFrom; })}
            options={[{ value: "", label: "Entered here" }, ...sources.map(([id, n]) => ({ value: id, label: `${project.workloads.find((y) => y.id === id)?.label ?? id} (${fmt(n)} a month)` }))]} />
        </Field>
        {w.volumeFrom === undefined
          ? <Field label="Transactions per month" help="txnVolume"><NumberInput value={w.volumePerMonth} onChange={(v) => upd((x) => { x.volumePerMonth = v; })} /></Field>
          : <div className="text-xs text-muted">Transactions: <b className="text-ink">{fmt(linked ?? 0)}</b> a month, from the workload picked on the left.</div>}
      </div>
      <PriceFields ids="txn" mode={mode} setMode={setMode} label="Transactions" unitId={w.unitPriceId} own={w.cadPerTxn} priceOptions={priceOptions}
        onUnit={(v) => upd((x) => { if (v) x.unitPriceId = v; else delete x.unitPriceId; })} onOwn={(v) => upd((x) => { if (v === undefined) delete x.cadPerTxn; else x.cadPerTxn = v; })} />
      {!priced && <Note tone="warn">No price is set, so this item adds no cost. Choose a price source above.</Note>}
      {priced && (linked ?? w.volumePerMonth) <= 0 && <Note tone="warn">The volume is 0, so this item adds no cost.</Note>}
      <Note tone="info">Volume is the full-adoption figure. It ramps with adoption and grows with the project growth rate, like other usage.</Note>
      <Formulas id={w.id} />
    </div>
  );
}
