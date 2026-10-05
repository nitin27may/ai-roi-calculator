import type { Catalog } from "@studio/catalog";

/** PTU sizing arithmetic, kept apart from the ledger so workload lines can size PTUs without a circular import. */
export type PtuDeployment = "global" | "dataZone" | "regional";
export const MINUTES_PER_MONTH = 43_200; // 30 days, as in Microsoft's capacity examples
export const HOURS_PER_MONTH = 730;

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
