import type { Catalog } from "@studio/catalog";
import type { Ledger } from "./ledger.js";
import type { Project } from "./project.js";

export type PtuDeployment = "global" | "dataZone" | "regional";
export const MINUTES_PER_MONTH = 43_200; // 30 days, as in Microsoft's capacity examples
const HOURS_PER_MONTH = 730;

export interface TokensPerMinute { input: number; cachedInput: number; output: number }

/**
 * Microsoft's sizing: uncached input plus output weighted by the model's output ratio, divided
 * by input TPM per PTU, rounded up to the deployment's increment and never below its minimum.
 * Cached input consumes no PTU capacity on these models.
 */
export function sizePtu(cat: Catalog, modelId: string, tpm: TokensPerMinute, deployment: PtuDeployment) {
  const t = cat.ptu.models.find((m) => m.modelId === modelId);
  if (!t) return null;
  const min = deployment === "regional" ? t.regionalMin : t.globalMin;
  const inc = deployment === "regional" ? t.regionalIncrement : t.globalIncrement;
  const normTpm = tpm.input + tpm.output * t.outputRatio;
  const raw = normTpm / t.inputTpmPerPtu;
  const ptus = Math.max(min, Math.ceil(raw / inc) * inc);
  return { ptus, normTpm, raw, min, increment: inc, capacityTpm: ptus * t.inputTpmPerPtu, inputTpmPerPtu: t.inputTpmPerPtu, outputRatio: t.outputRatio };
}

export interface PtuRow {
  modelId: string;
  label: string;
  monthlyTokens: TokensPerMinute;
  avgTpm: TokensPerMinute;
  ptus: number;
  /** Average load as a share of the provisioned capacity. */
  utilization: number;
  payg: number;
  hourly: number;
  monthlyReservation: number;
  yearlyReservation: number;
  /** Utilization at which a 1-month reservation costs the same as pay-as-you-go. */
  breakEvenMonthly: number;
  breakEvenYearly: number;
  cheapest: "payg" | "monthlyReservation" | "yearlyReservation" | "hourly";
}

/**
 * For each Azure model in production, size PTUs for the peak and compare with pay-as-you-go.
 * Uses the first month at full adoption. `peakToAverage` turns average throughput into the
 * peak the deployment must absorb (PTU is sized for peak, billed every hour).
 */
export function ptuAnalysis(p: Project, ledger: Ledger, cat: Catalog, opts: { peakToAverage: number; deployment: PtuDeployment }): { rows: PtuRow[]; unsupported: { modelId: string; label: string; payg: number }[]; month: number } {
  const month = ledger.months.find((m) => m.phase === "production" && m.adoption >= 1) ?? ledger.months.at(-1)!;
  const byModel = new Map<string, { tokens: TokensPerMinute; payg: number }>();
  for (const l of month.lines) {
    if (l.stream !== "run" || !l.tokens) continue;
    const m = cat.chatModels.find((x) => x.id === l.meter);
    if (!m || m.platform !== "azure") continue;
    const e = byModel.get(l.meter) ?? { tokens: { input: 0, cachedInput: 0, output: 0 }, payg: 0 };
    e.tokens.input += l.tokens.input * l.quantity;
    e.tokens.cachedInput += l.tokens.cachedInput * l.quantity;
    e.tokens.output += l.tokens.output * l.quantity;
    e.payg += l.cost;
    byModel.set(l.meter, e);
  }
  const rate = cat.ptu.rates[opts.deployment];
  const rows: PtuRow[] = [];
  const unsupported: { modelId: string; label: string; payg: number }[] = [];
  for (const [modelId, e] of byModel) {
    const model = cat.chatModels.find((x) => x.id === modelId)!;
    const avg = { input: e.tokens.input / MINUTES_PER_MONTH, cachedInput: e.tokens.cachedInput / MINUTES_PER_MONTH, output: e.tokens.output / MINUTES_PER_MONTH };
    const peak = { input: avg.input * opts.peakToAverage, cachedInput: avg.cachedInput * opts.peakToAverage, output: avg.output * opts.peakToAverage };
    const s = sizePtu(cat, modelId, peak, opts.deployment);
    if (!s) { unsupported.push({ modelId, label: model.label, payg: e.payg }); continue; }
    const avgNorm = avg.input + avg.output * s.outputRatio;
    // PAYG value of one fully used PTU-month at the model's input price (output is already weighted by the ratio).
    const valuePerPtu = (s.inputTpmPerPtu * MINUTES_PER_MONTH * model.prices!.global.input) / 1e6;
    const costs = { payg: e.payg, hourly: s.ptus * rate.hourly * HOURS_PER_MONTH, monthlyReservation: s.ptus * rate.monthlyReservation, yearlyReservation: s.ptus * rate.yearlyReservationPerMonth };
    const cheapest = (Object.entries(costs) as [PtuRow["cheapest"], number][]).sort((a, b) => a[1] - b[1])[0]![0];
    rows.push({
      modelId, label: model.label, monthlyTokens: e.tokens, avgTpm: avg, ptus: s.ptus, utilization: avgNorm / s.capacityTpm,
      ...costs, breakEvenMonthly: rate.monthlyReservation / valuePerPtu, breakEvenYearly: rate.yearlyReservationPerMonth / valuePerPtu, cheapest,
    });
  }
  return { rows: rows.sort((a, b) => b.payg - a.payg), unsupported, month: month.m };
}
