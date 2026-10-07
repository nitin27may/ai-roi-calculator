import type { PriceBook } from "./pricing.js";
import type { Workload } from "./project.js";
import { fmtInt, line, cad, cadUnit, type Line } from "./lines.js";
import type { WorkloadContext } from "./workloads.js";

/** Run-cost kinds beyond AI (A8): per-user licences, vendor or support contracts and per-transaction fees. */
export type RunCostWorkload = Extract<Workload, { kind: "seats" | "contract" | "transactionFee" }>;
export const RUN_COST_KINDS: readonly Workload["kind"][] = ["seats", "contract", "transactionFee"];
export const isRunCostKind = (kind: string): boolean => (RUN_COST_KINDS as readonly string[]).includes(kind);

/** Catalogue prices that read as one licence per month. Prices in other units are not offered as seat prices. */
export const isSeatUnit = (unit: string): boolean => /^(seat|user|licen[cs]e)-month$/.test(unit);

/** Divisor for a catalogue unit written "1K ...", "10K ..." or "1M ...", so a price per 1K transactions becomes a price per transaction. */
const perUnitDivisor = (u: string): number => (u.startsWith("1M") ? 1e6 : u.startsWith("10K") ? 1e4 : u.startsWith("1K") ? 1e3 : 1);

/** Whether a catalogue price can be a per-transaction price: it is quoted per 1K, 10K or 1M of something, or per single unit. */
export const isTransactionUnit = (unit: string): boolean => /^(1K|10K|1M) /.test(unit) || /^(transaction|call|message|request|envelope|sms)$/i.test(unit);

/** Users or seats by workload id: a chat workload's users and a seat workload's seats. Seat workloads can take their count from these. */
export function userCounts(workloads: readonly Workload[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of workloads) {
    if (w.kind === "chat") out.set(w.id, w.users);
    else if (w.kind === "seats") out.set(w.id, w.seats);
  }
  return out;
}

/**
 * Escalation factor of a contract in a project month: (1 + pct) raised to the number of whole years since the contract
 * started (`start`, the first billed month). Year 1 is 1, year 2 is 1 + pct, year 3 is (1 + pct)^2.
 */
export function contractEscalation(w: Pick<Extract<Workload, { kind: "contract" }>, "escalationPct">, start: number, month: number): number {
  const pct = w.escalationPct ?? 0;
  return pct > 0 ? (1 + pct / 100) ** Math.max(0, Math.floor((month - start) / 12)) : 1;
}

/** Monthly lines for a seats, contract or transaction-fee workload at full volume. Empty or unpriced items add nothing. */
export function runCostLines(w: RunCostWorkload, c: WorkloadContext, book: PriceBook): Line[] {
  const id = w.id;
  switch (w.kind) {
    case "seats": {
      const base = (w.volumeFrom !== undefined ? c.users?.get(w.volumeFrom) : undefined) ?? w.seats;
      const billed = Math.max(0, base - (w.freeSeats ?? 0));
      const own = w.unitPriceId === undefined && w.cadPerSeat !== undefined;
      if (billed <= 0 || (w.unitPriceId === undefined && w.cadPerSeat === undefined)) return [];
      const price = w.unitPriceId !== undefined ? book.unitPrice(w.unitPriceId) : w.cadPerSeat!;
      const free = (w.freeSeats ?? 0) > 0 ? `(${fmtInt(base)} seats − ${fmtInt(w.freeSeats ?? 0)} free) = ` : "";
      const source = own ? " (your own price)" : "";
      return [line({
        id: `${id}:seats`, componentId: id, label: w.label, stream: "platform", behaviour: w.followsAdoption ? "usage" : "fixed", meter: w.unitPriceId ?? `cad:${id}`,
        quantity: billed, unit: "seat-month", unitPrice: price,
        formula: `${free}${fmtInt(billed)} seats × ${cad(price, 2)} per seat-month${source}${w.followsAdoption ? " · ramps with adoption" : " · billed in full from go-live"}`,
      })];
    }
    case "contract": {
      if (w.amountCad <= 0) return [];
      const monthly = w.cadence === "yearly" ? w.amountCad / 12 : w.amountCad;
      const how = w.cadence === "yearly" ? `${cad(w.amountCad)} a year ÷ 12 = ${cad(monthly, 2)} a month` : `${cad(w.amountCad)} a month`;
      return [line({
        id: `${id}:contract`, componentId: id, label: w.label, stream: "platform", behaviour: "fixed", meter: `cad:${id}`, quantity: 1, unit: "month", unitPrice: monthly,
        formula: `${how}${(w.escalationPct ?? 0) > 0 ? ` · +${w.escalationPct}% each year` : ""}`,
      })];
    }
    case "transactionFee": {
      const volume = (w.volumeFrom !== undefined ? c.volumes?.get(w.volumeFrom) : undefined) ?? w.volumePerMonth;
      if (volume <= 0 || (w.unitPriceId === undefined && w.cadPerTxn === undefined)) return [];
      const own = w.unitPriceId === undefined;
      const price = w.unitPriceId !== undefined ? book.unitPrice(w.unitPriceId) / perUnitDivisor(book.unit(w.unitPriceId).unit) : w.cadPerTxn!;
      return [line({
        id: `${id}:fee`, componentId: id, label: w.label, stream: "run", behaviour: "usage", meter: w.unitPriceId ?? `cad:${id}`, quantity: volume, unit: "transaction", unitPrice: price,
        formula: `${fmtInt(volume)} transactions × ${cadUnit(price)} per transaction${own ? " (your own price)" : ""}`,
      })];
    }
  }
}
