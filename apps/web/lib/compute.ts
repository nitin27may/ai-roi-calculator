"use client";
import { useMemo } from "react";
import { loadCatalog } from "@studio/catalog";
import { DEPLOYMENT_LABEL, availableIn, buildLedger, computeRoi, evaluateLevers } from "@studio/engine";
import { useStudio } from "./store";

/** The bundled CAD price catalogue (validated once). */
export const catalog = loadCatalog();

export function useLedger() {
  const project = useStudio((s) => s.project);
  const percentile = useStudio((s) => s.percentile);
  return useMemo(() => {
    const ledger = buildLedger(project, catalog, percentile);
    const roi = computeRoi(ledger, project.roi.basis, project.roi.discountRatePct);
    return { project, ledger, roi };
  }, [project, percentile]);
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
export function deploymentOptions<T extends Offerable>(items: T[], label: (x: T) => string = (x) => x.label) {
  const d = useStudio.getState().project.settings.azureDeployment;
  const short = d === "regional" ? "Canada Regional" : "US Data Zone";
  const ok = items.filter((x) => availableIn(x, d)), no = items.filter((x) => !availableIn(x, d));
  return [...ok.map((x) => ({ value: x.id, label: label(x) })), ...no.map((x) => ({ value: x.id, label: `${label(x)} (not offered in ${short})` }))];
}

export const deploymentName = () => DEPLOYMENT_LABEL[useStudio.getState().project.settings.azureDeployment];

export const modelOptions = (filter?: (m: (typeof catalog.chatModels)[number]) => boolean) =>
  deploymentOptions(catalog.chatModels.filter((m) => m.lifecycle.status !== "retired" && (!filter || filter(m))));
