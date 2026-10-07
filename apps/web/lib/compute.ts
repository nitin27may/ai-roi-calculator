"use client";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { loadCoreCatalog, loadResourceCategories } from "@roi-calculator/catalog";
import { DEPLOYMENT_LABEL, availableIn, buildLedger, computeRoi, roiOptions, evaluateLevers, summarize, type AzureDeployment } from "@roi-calculator/engine";
import { useStudio } from "./store";

/**
 * The bundled CAD price catalogue (validated once). It starts without the infrastructure resource categories, which are
 * about half a megabyte of JSON; `ensureResources()` adds them in place from one lazily loaded chunk per category. Pages that
 * show resources call `useResourcesReady`, and the ledger asks for them as soon as the project has a resource.
 */
export const catalog = loadCoreCatalog();

const useResourceState = create<{ version: number; ready: boolean }>(() => ({ version: 0, ready: false }));
let started: Promise<void> | undefined;

/** Loads every resource category once and resolves when the catalogue holds them. A failed load can be retried. */
export function ensureResources(): Promise<void> {
  started ??= loadResourceCategories(catalog)
    .then(() => useResourceState.setState((s) => ({ version: s.version + 1, ready: true })))
    .catch((e: unknown) => { started = undefined; console.error("Could not load the resource prices", e); throw e; });
  return started;
}

/** True once the resource categories are in the catalogue; starts loading them when `wanted`. */
export function useResourcesReady(wanted = true): boolean {
  const ready = useResourceState((s) => s.ready);
  useEffect(() => { if (wanted && !ready) ensureResources().catch(() => undefined); }, [wanted, ready]);
  return ready;
}

/** Changes when resource categories arrive, for memos that read `catalog.resourceTypes` or `catalog.unitPrices`. */
export const useResourceVersion = () => useResourceState((s) => s.version);

export function useLedger() {
  const project = useStudio((s) => s.project);
  const percentile = useStudio((s) => s.percentile);
  useResourcesReady((project.resources?.length ?? 0) > 0);
  const resourceVersion = useResourceVersion();
  return useMemo(() => {
    const ledger = buildLedger(project, catalog, percentile);
    const roi = computeRoi(ledger, project.roi.basis, project.roi.discountRatePct, roiOptions(project));
    return { project, ledger, roi };
  }, [project, percentile, resourceVersion]);
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
