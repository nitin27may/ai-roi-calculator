"use client";
import { useMemo } from "react";
import { loadCatalog } from "@studio/catalog";
import { buildLedger, computeRoi, evaluateLevers } from "@studio/engine";
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

export const modelOptions = (filter?: (m: (typeof catalog.chatModels)[number]) => boolean) =>
  catalog.chatModels.filter((m) => m.lifecycle.status !== "retired" && (!filter || filter(m))).map((m) => ({ value: m.id, label: m.label }));
