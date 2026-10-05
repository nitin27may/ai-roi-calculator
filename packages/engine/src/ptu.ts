import type { Catalog } from "@studio/catalog";
import { steadyState, type Ledger } from "./ledger.js";
import type { Project } from "./project.js";
import { HOURS_PER_MONTH, MINUTES_PER_MONTH, sizePtu, type PtuDeployment, type TokensPerMinute } from "./ptu-size.js";

export { HOURS_PER_MONTH, MINUTES_PER_MONTH, sizePtu, type PtuDeployment, type TokensPerMinute };

export interface PtuRow {
  modelId: string;
  label: string;
  /** The deployment this row was sized and priced for: the workloads' own, or the override passed to `ptuAnalysis`. */
  deployment: PtuDeployment;
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
 *
 * Each row uses the deployment its workloads run on (a model used in two deployments gets two rows), so the break-even
 * compares the PTU rate with that deployment's own pay-as-you-go price. `opts.deployment` overrides that for a what-if.
 * Load that already runs on provisioned capacity (a workload in PTU mode) is left out; only its spillover remains.
 */
export function ptuAnalysis(p: Project, ledger: Ledger, cat: Catalog, opts: { peakToAverage: number; deployment?: PtuDeployment }): { rows: PtuRow[]; unsupported: { modelId: string; label: string; payg: number }[]; month: number } {
  const month = steadyState(ledger);
  const byModel = new Map<string, { modelId: string; deployment: PtuDeployment; tokens: TokensPerMinute; payg: number }>();
  for (const l of month.lines) {
    if (l.stream !== "run" || !l.tokens || l.once || l.onPtu) continue;
    // Batch (and any future non-Standard tier) never runs on provisioned capacity; size PTUs off Standard usage only.
    if (l.tier && l.tier !== "standard") continue;
    const m = cat.chatModels.find((x) => x.id === l.meter);
    if (!m || m.platform !== "azure") continue;
    const deployment = opts.deployment ?? l.deployment ?? p.settings.azureDeployment;
    const key = `${deployment}|${l.meter}`;
    const e = byModel.get(key) ?? { modelId: l.meter, deployment, tokens: { input: 0, cachedInput: 0, output: 0 }, payg: 0 };
    e.tokens.input += l.tokens.input * l.quantity;
    e.tokens.cachedInput += l.tokens.cachedInput * l.quantity;
    e.tokens.output += l.tokens.output * l.quantity;
    e.payg += l.cost;
    byModel.set(key, e);
  }
  const rows: PtuRow[] = [];
  const unsupported: { modelId: string; label: string; payg: number }[] = [];
  for (const e of byModel.values()) {
    const { modelId, deployment } = e;
    const rate = cat.ptu.rates[deployment];
    const model = cat.chatModels.find((x) => x.id === modelId)!;
    const avg = { input: e.tokens.input / MINUTES_PER_MONTH, cachedInput: e.tokens.cachedInput / MINUTES_PER_MONTH, output: e.tokens.output / MINUTES_PER_MONTH };
    const peak = { input: avg.input * opts.peakToAverage, cachedInput: avg.cachedInput * opts.peakToAverage, output: avg.output * opts.peakToAverage };
    const s = sizePtu(cat, modelId, peak, deployment);
    if (!s) {
      const seen = unsupported.find((u) => u.modelId === modelId);
      if (seen) seen.payg += e.payg; else unsupported.push({ modelId, label: model.label, payg: e.payg });
      continue;
    }
    const avgNorm = avg.input + avg.output * s.outputRatio;
    // PAYG value of one fully used PTU-month at the input price of the deployment this row runs on (output is already weighted by the ratio).
    const inputPrice = (model.prices![deployment] ?? model.prices!.global).input;
    const valuePerPtu = (s.inputTpmPerPtu * MINUTES_PER_MONTH * inputPrice) / 1e6;
    const costs = { payg: e.payg, hourly: s.ptus * rate.hourly * HOURS_PER_MONTH, monthlyReservation: s.ptus * rate.monthlyReservation, yearlyReservation: s.ptus * rate.yearlyReservationPerMonth };
    const cheapest = (Object.entries(costs) as [PtuRow["cheapest"], number][]).sort((a, b) => a[1] - b[1])[0]![0];
    rows.push({
      modelId, label: model.label, deployment, monthlyTokens: e.tokens, avgTpm: avg, ptus: s.ptus, utilization: avgNorm / s.capacityTpm,
      ...costs, breakEvenMonthly: rate.monthlyReservation / valuePerPtu, breakEvenYearly: rate.yearlyReservationPerMonth / valuePerPtu, cheapest,
    });
  }
  return { rows: rows.sort((a, b) => b.payg - a.payg), unsupported, month: month.m };
}
