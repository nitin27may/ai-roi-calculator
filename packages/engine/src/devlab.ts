import { heuristics } from "@studio/catalog";
import type { PriceBook } from "./pricing.js";
import type { DevActivity, Harness, Project } from "./project.js";
import { simulateHarness } from "./harness.js";
import { evaluationLines } from "./workloads.js";
import { fmtInt, line, sum, type Line } from "./lines.js";

/**
 * AI Dev Lab: tokens and AI services the team consumes while building. Lines are per build
 * month m (1-based). Evaluation is computed last because it scores runs from the other
 * activities.
 */
export function devLabLines(p: Project, m: number, book: PriceBook, date: string): Line[] {
  const harnesses = new Map(p.harnesses.map((h) => [h.id, h]));
  const devs = developers(p);
  const runs = { bakeoff: 0, iterations: 0, regression: 0 };
  const out: Line[] = [];
  const at = <T>(xs: T[], i: number) => xs[Math.min(i, xs.length - 1)]!;
  const inWindow = (a: { fromMonth: number; toMonth?: number | undefined }) => m >= a.fromMonth && m <= (a.toMonth ?? p.timeline.buildMonths);
  const runCost = (h: Harness, modelId: string, cacheHit: number) => simulateHarness(h, book, { modelId, cacheHit, percentile: "p50", date });
  const harness = (a: { id: string; harnessId: string }) => {
    const h = harnesses.get(a.harnessId);
    if (!h) throw new Error(`Dev Lab activity ${a.id} references unknown harness ${a.harnessId}`);
    return h;
  };

  for (const a of p.build.activities) {
    switch (a.kind) {
      case "bakeoff": {
        const h = harness(a);
        const sweeps = at(a.sweepsPerMonth, m - 1);
        for (const c of a.candidates.filter(inWindow)) {
          const n = a.cases * a.repeats * sweeps;
          if (n === 0) continue;
          const r = runCost(h, c.modelId, a.cacheHit);
          const disc = 1 - a.batchShare * book.chatModel(c.modelId).batchDiscount;
          runs.bakeoff += n;
          out.push(line({ id: `${a.id}:${c.modelId}`, componentId: a.id, label: `${a.label}: ${book.chatModel(c.modelId).label}`, stream: "devlab", behaviour: "usage", meter: c.modelId, quantity: n, unit: "harness run", unitPrice: r.cost * disc,
            formula: `${a.cases} cases × ${a.repeats} repeats × ${sweeps} sweeps = ${fmtInt(n)} runs × CAD ${r.cost.toFixed(4)}${a.batchShare ? ` · ${Math.round(a.batchShare * 100)}% Batch` : ""}` }));
        }
        break;
      }
      case "iterations": {
        const h = harness(a);
        const n = devs * a.runsPerDevPerDay * a.workingDays * a.subsetCases * at(a.monthFactors, m - 1);
        if (n === 0) break;
        const r = runCost(h, a.modelId, a.cacheHit);
        runs.iterations += n;
        out.push(line({ id: `${a.id}`, componentId: a.id, label: a.label, stream: "devlab", behaviour: "usage", meter: a.modelId, quantity: n, unit: "harness run", unitPrice: r.cost,
          formula: `${devs} devs × ${a.runsPerDevPerDay} runs/day × ${a.workingDays} days × ${a.subsetCases} cases × ${at(a.monthFactors, m - 1)} = ${fmtInt(n)} runs` }));
        break;
      }
      case "regression": {
        if (!inWindow(a)) break;
        const h = harness(a);
        for (const modelId of a.modelIds) {
          const n = a.runsPerMonth * a.cases;
          const r = runCost(h, modelId, a.cacheHit);
          const disc = 1 - a.batchShare * book.chatModel(modelId).batchDiscount;
          runs.regression += n;
          out.push(line({ id: `${a.id}:${modelId}`, componentId: a.id, label: `${a.label}: ${book.chatModel(modelId).label}`, stream: "devlab", behaviour: "usage", meter: modelId, quantity: n, unit: "harness run", unitPrice: r.cost * disc,
            formula: `${a.runsPerMonth} runs × ${a.cases} cases${a.batchShare ? ` · ${Math.round(a.batchShare * 100)}% Batch (−${Math.round(book.chatModel(modelId).batchDiscount * 100)}%)` : ""}` }));
        }
        break;
      }
      case "playground": {
        const n = devs * a.callsPerDevPerDay * a.workingDays;
        const tk = book.tokenizerMultiplier(a.modelId);
        const per = book.chatCost(a.modelId, { input: a.inputTokens * tk, output: a.outputTokens * tk }, date);
        out.push(line({ id: a.id, componentId: a.id, label: a.label, stream: "devlab", behaviour: "usage", meter: a.modelId, quantity: n, unit: "call", unitPrice: per, formula: `${devs} devs × ${a.callsPerDevPerDay} calls/day × ${a.workingDays} days` }));
        break;
      }
      case "tooling": {
        const seats = devs * a.copilotSeatsPerDev;
        if (seats > 0) out.push(line({ id: `${a.id}:copilot`, componentId: a.id, label: book.unit(a.copilotPlan).label, stream: "devlab", behaviour: "fixed", meter: a.copilotPlan, quantity: seats, unit: "seat-month", unitPrice: book.unitPrice(a.copilotPlan), formula: `${seats} seats` }));
        const t = a.codingTokensPerDevPerDay;
        const per = book.chatCost(a.codingModelId, { input: t.input, cachedInput: t.cachedInput, output: t.output }, date);
        out.push(line({ id: `${a.id}:coding`, componentId: a.id, label: `Coding agent tokens (${book.chatModel(a.codingModelId).label})`, stream: "devlab", behaviour: "usage", meter: a.codingModelId, quantity: devs * a.workingDays, unit: "developer-day", unitPrice: per,
          formula: `${devs} devs × ${a.workingDays} days × (${fmtInt(t.input)} in + ${fmtInt(t.cachedInput)} cached + ${fmtInt(t.output)} out)` }));
        break;
      }
      case "redteam": {
        if (!inWindow(a)) break;
        const probes = a.scansPerMonth * a.categories * a.objectivesPerCategory * (1 + a.strategies);
        const turns = 1 + a.multiTurnShare * (heuristics.redTeam.multiTurnFactor - 1);
        const rt = heuristics.redTeam;
        const target = book.chatCost(a.targetModelId, { input: rt.probeInputTokens * turns, output: rt.probeOutputTokens * turns }, date);
        const scoring = ((rt.probeInputTokens + rt.probeOutputTokens) * turns * book.unitPrice("eval-safety-input") + 200 * book.unitPrice("eval-safety-output")) / 1e6;
        out.push(line({ id: a.id, componentId: a.id, label: a.label, stream: "devlab", behaviour: "usage", meter: "eval-safety-input", quantity: probes, unit: "probe", unitPrice: target + scoring,
          formula: `${a.scansPerMonth} scans × ${a.categories} categories × ${a.objectivesPerCategory} objectives × (1 + ${a.strategies} strategies) = ${fmtInt(probes)} probes` }));
        break;
      }
      case "evaluation":
        break;
    }
  }
  for (const a of p.build.activities.filter((x): x is Extract<DevActivity, { kind: "evaluation" }> => x.kind === "evaluation")) {
    const n = runs.bakeoff * a.scoredShare.bakeoff + runs.iterations * a.scoredShare.iterations + runs.regression * a.scoredShare.regression;
    if (n > 0) out.push(...evaluationLines(a.id, a.label, "devlab", n, a.judgeModelId, a.evaluators, a.queryTokens, a.contextTokens, a.responseTokens, a.safetyEvaluators, book, date));
  }
  return out;
}

export function developers(p: Project): number {
  return sum(p.build.team.filter((t) => t.experiments).map((t) => t.people));
}

/** Monthly labour lines for a team. */
export function teamLines(p: Project, team: Project["build"]["team"], stream: "labour" | "maint", componentId: string, factor = 1): Line[] {
  const rates = new Map(p.rateCard.map((r) => [r.id, r]));
  return team.map((t) => {
    const r = rates.get(t.roleId);
    if (!r) throw new Error(`Unknown role ${t.roleId}`);
    const hours = t.people * t.hoursPerMonth;
    return line({ id: `${componentId}:${t.roleId}`, componentId, label: r.label, stream, behaviour: "fixed", meter: `role:${t.roleId}`, quantity: hours, unit: "hour", unitPrice: r.hourlyRate * factor,
      formula: `${t.people} × ${t.hoursPerMonth} h × CAD ${r.hourlyRate}/h${factor !== 1 ? ` × ${factor.toFixed(2)}` : ""}` });
  });
}
