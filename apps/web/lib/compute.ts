"use client";
import { useMemo } from "react";
import { loadCatalog } from "@studio/catalog";
import { DEPLOYMENT_LABEL, availableIn, buildLedger, computeRoi, roiOptions, evaluateLevers, summarize, type AzureDeployment } from "@studio/engine";
import { useStudio } from "./store";

/** The bundled CAD price catalogue (validated once). */
export const catalog = loadCatalog();

export function useLedger() {
  const project = useStudio((s) => s.project);
  const percentile = useStudio((s) => s.percentile);
  return useMemo(() => {
    const ledger = buildLedger(project, catalog, percentile);
    const roi = computeRoi(ledger, project.roi.basis, project.roi.discountRatePct, roiOptions(project));
    return { project, ledger, roi };
  }, [project, percentile]);
}

/**
 * The single figures behind the Summary page, the Report and the Excel export, so all three
 * always agree. Built on top of `useLedger()`'s memoised ledger and ROI.
 */
export function useSummary() {
  const { project, ledger, roi } = useLedger();
  const summary = useMemo(() => summarize(project, ledger, roi, catalog), [project, ledger, roi]);
  return { project, ledger, roi, summary };
}

export function useLevers() {
  const project = useStudio((s) => s.project);
  return useMemo(() => evaluateLevers(project, catalog), [project]);
}

type Offerable = Parameters<typeof availableIn>[0] & { id: string; label: string };

/**
 * Select options for catalogue entries: those offered under the project's deployment first, the rest
 * after them and labelled, so an existing choice stays visible while the list reads as a filter.
 */
export function deploymentOptions<T extends Offerable>(items: T[], label: (x: T) => string = (x) => x.label, deployment?: AzureDeployment) {
  const d = deployment ?? useStudio.getState().project.settings.azureDeployment;
  const short = { global: "Global", regional: "Canada Regional", dataZone: "US Data Zone" }[d];
  const ok = items.filter((x) => availableIn(x, d)), no = items.filter((x) => !availableIn(x, d));
  return [...ok.map((x) => ({ value: x.id, label: label(x) })), ...no.map((x) => ({ value: x.id, label: `${label(x)} (not offered in ${short})` }))];
}

export const deploymentName = () => DEPLOYMENT_LABEL[useStudio.getState().project.settings.azureDeployment];

export const modelOptions = (filter?: (m: (typeof catalog.chatModels)[number]) => boolean, deployment?: AzureDeployment) =>
  deploymentOptions(catalog.chatModels.filter((m) => m.lifecycle.status !== "retired" && (!filter || filter(m))), undefined, deployment);
