import { heuristics } from "@studio/catalog";
import type { PriceBook } from "./pricing.js";
import type { DevActivity, Harness, Project } from "./project.js";
import { simulateHarness, reasoningTokens, type ReasoningEffort } from "./harness.js";
import { evaluationLines } from "./workloads.js";
import { fmtInt, line, sum, type Line } from "./lines.js";

/** Reasoning tokens for a Dev Lab call, billed as output, only for models the catalogue marks as reasoning models (E2). */
const reasoningOut = (book: PriceBook, modelId: string, r: ReasoningEffort | number) => (book.isReasoningModel(modelId) ? reasoningTokens(r) : 0);

/**
 * AI Dev Lab: tokens and AI services the team consumes while building. Lines are per build
 * month m (1-based). Evaluation is computed last because it scores runs from the other
 * activities.
 */
export function devLabLines(p: Project, m: number, book: PriceBook, date: string): Line[] {
  const harnesses = new Map(p.harnesses.map((h) => [h.id, h]));
  const allDevs = developers(p, m);
  const efforts = seatEffort(p, m);
  const wsEffort = (ws: string) => sum(efforts.map((e) => e.byWorkstream[ws] ?? 0));
  type Runs = { bakeoff: number; iterations: number; regression: number };
  const runsByScope = new Map<string, Runs>();
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
    // Effort-driven activities scale with the people on the activity's workstream (everyone when project-wide).
    const devs = a.workstreamId ? wsEffort(a.workstreamId) : allDevs;
    const runs = runsByScope.get(a.workstreamId ?? "") ?? { bakeoff: 0, iterations: 0, regression: 0 };
    runsByScope.set(a.workstreamId ?? "", runs);
    const start = out.length;
    switch (a.kind) {
      case "bakeoff": {
        const h = harness(a);
        const sweeps = at(a.sweepsPerMonth, m - 1);
        for (const c of a.candidates.filter(inWindow)) {
          const n = a.cases * a.repeats * sweeps;
          if (n === 0) continue;
          const r = runCost(h, c.modelId, a.cacheHit);
          const disc = 1 - a.batchShare * (1 - book.batchFactor(c.modelId));
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
        const f = at(a.monthFactors, m - 1);
        for (const modelId of a.modelIds) {
          const n = a.runsPerMonth * a.cases * f;
          if (n === 0) continue;
          const r = runCost(h, modelId, a.cacheHit);
          const disc = 1 - a.batchShare * (1 - book.batchFactor(modelId));
          runs.regression += n;
          out.push(line({ id: `${a.id}:${modelId}`, componentId: a.id, label: `${a.label}: ${book.chatModel(modelId).label}`, stream: "devlab", behaviour: "usage", meter: modelId, quantity: n, unit: "harness run", unitPrice: r.cost * disc,
            formula: `${a.runsPerMonth} runs × ${a.cases} cases${f !== 1 ? ` × ${f}` : ""}${a.batchShare ? ` · ${Math.round(a.batchShare * 100)}% Batch (−${Math.round((1 - book.batchFactor(modelId)) * 100)}%)` : ""}` }));
        }
        break;
      }
      case "playground": {
        const f = at(a.monthFactors, m - 1);
        const n = devs * a.callsPerDevPerDay * a.workingDays * f;
        if (n === 0) break;
        const tk = book.tokenizerMultiplier(a.modelId);
        const outTok = a.outputTokens + reasoningOut(book, a.modelId, a.reasoning);
        const per = book.chatCost(a.modelId, { input: a.inputTokens * tk, output: outTok * tk }, date);
        out.push(line({ id: a.id, componentId: a.id, label: a.label, stream: "devlab", behaviour: "usage", meter: a.modelId, quantity: n, unit: "call", unitPrice: per, formula: `${devs} devs × ${a.callsPerDevPerDay} calls/day × ${a.workingDays} days${f !== 1 ? ` × ${f}` : ""}` }));
        break;
      }
      case "tooling": {
        // Seats are billed in any month the activity is on; the factor scales coding-agent tokens.
        const f = at(a.monthFactors, m - 1);
        if (f === 0) break;
        const seats = devs * a.copilotSeatsPerDev;
        if (seats > 0) out.push(line({ id: `${a.id}:copilot`, componentId: a.id, label: book.unit(a.copilotPlan).label, stream: "devlab", behaviour: "fixed", meter: a.copilotPlan, quantity: seats, unit: "seat-month", unitPrice: book.unitPrice(a.copilotPlan), formula: `${seats} seats` }));
        const t = a.codingTokensPerDevPerDay;
        const tk = book.tokenizerMultiplier(a.codingModelId);
        const per = book.chatCost(a.codingModelId, { input: t.input * tk, cachedInput: t.cachedInput * tk, output: t.output * tk }, date);
        out.push(line({ id: `${a.id}:coding`, componentId: a.id, label: `Coding agent tokens (${book.chatModel(a.codingModelId).label})`, stream: "devlab", behaviour: "usage", meter: a.codingModelId, quantity: devs * a.workingDays * f, unit: "developer-day", unitPrice: per,
          formula: `${devs} devs × ${a.workingDays} days${f !== 1 ? ` × ${f}` : ""} × (${fmtInt(t.input)} in + ${fmtInt(t.cachedInput)} cached + ${fmtInt(t.output)} out)` }));
        break;
      }
      case "redteam": {
        if (!inWindow(a)) break;
        const f = at(a.monthFactors, m - 1);
        const probes = a.scansPerMonth * a.categories * a.objectivesPerCategory * (1 + a.strategies) * f;
        if (probes === 0) break;
        const turns = 1 + a.multiTurnShare * (heuristics.redTeam.multiTurnFactor - 1);
        const rt = heuristics.redTeam;
        const tk = book.tokenizerMultiplier(a.targetModelId);
        const target = book.chatCost(a.targetModelId, { input: rt.probeInputTokens * turns * tk, output: rt.probeOutputTokens * turns * tk }, date);
        const scoring = ((rt.probeInputTokens + rt.probeOutputTokens) * turns * book.unitPrice("eval-safety-input") + 200 * book.unitPrice("eval-safety-output")) / 1e6;
        out.push(line({ id: a.id, componentId: a.id, label: a.label, stream: "devlab", behaviour: "usage", meter: "eval-safety-input", quantity: probes, unit: "probe", unitPrice: target + scoring,
          formula: `${a.scansPerMonth} scans × ${a.categories} categories × ${a.objectivesPerCategory} objectives × (1 + ${a.strategies} strategies)${f !== 1 ? ` × ${f}` : ""} = ${fmtInt(probes)} probes` }));
        break;
      }
      case "synthetic": {
        const f = at(a.monthFactors, m - 1);
        const generated = (a.acceptedPerMonth * f) / a.passRate;
        if (generated === 0) break;
        const call = (modelId: string, input: number, output: number) => {
          const tk = book.tokenizerMultiplier(modelId);
          return book.chatCost(modelId, { input: input * tk, output: output * tk }, date) * (1 - a.batchShare * (1 - book.batchFactor(modelId)));
        };
        const batch = a.batchShare ? ` · ${Math.round(a.batchShare * 100)}% Batch` : "";
        const genOut = a.genOutputTokens + reasoningOut(book, a.generatorModelId, a.reasoning);
        out.push(line({ id: `${a.id}:generate`, componentId: a.id, label: `${a.label}: generation (${book.chatModel(a.generatorModelId).label})`, stream: "devlab", behaviour: "usage", meter: a.generatorModelId, quantity: generated, unit: "example", unitPrice: call(a.generatorModelId, a.genInputTokens, genOut),
          formula: `${fmtInt(a.acceptedPerMonth)} kept${f !== 1 ? ` × ${f}` : ""} ÷ ${Math.round(a.passRate * 100)}% pass rate = ${fmtInt(generated)} generated${batch}` }));
        if (a.judgeModelId) out.push(line({ id: `${a.id}:judge`, componentId: a.id, label: `${a.label}: judge filter (${book.chatModel(a.judgeModelId).label})`, stream: "devlab", behaviour: "usage", meter: a.judgeModelId, quantity: generated, unit: "example", unitPrice: call(a.judgeModelId, a.judgeInputTokens, a.judgeOutputTokens),
          formula: `${fmtInt(generated)} judged × (${fmtInt(a.judgeInputTokens)} in + ${fmtInt(a.judgeOutputTokens)} out)${batch}` }));
        break;
      }
      case "finetune": {
        const f = at(a.monthFactors, m - 1);
        if (f === 0) break;
        const u = book.unit(a.trainingPriceId);
        const runs = a.runsPerMonth * f;
        const perHour = u.unit === "training hour";
        if (runs > 0) {
          const qty = perHour ? runs * a.hoursPerRun : (runs * a.examples * a.tokensPerExample * a.epochs) / 1e6;
          out.push(line({ id: `${a.id}:train`, componentId: a.id, label: `${a.label}: training (${u.label.replace(/^.*?, /, "")}${perHour ? ", RFT" : ""})`, stream: "devlab", behaviour: "usage", meter: a.trainingPriceId, quantity: qty, unit: u.unit, unitPrice: book.unitPrice(a.trainingPriceId),
            formula: perHour ? `${fmtInt(runs)} runs × ${a.hoursPerRun} h` : `${fmtInt(runs)} runs × ${fmtInt(a.examples)} examples × ${fmtInt(a.tokensPerExample)} tokens × ${a.epochs} epochs = ${(qty).toFixed(2)}M training tokens` }));
        }
        if (a.deployments > 0 && a.hostingHoursPerMonth > 0) out.push(line({ id: `${a.id}:host`, componentId: a.id, label: `${a.label}: hosting`, stream: "devlab", behaviour: "fixed", meter: "ft-hosting", quantity: a.deployments * a.hostingHoursPerMonth, unit: "hour", unitPrice: book.unitPrice("ft-hosting"),
          formula: `${a.deployments} deployments × ${a.hostingHoursPerMonth} h (billed while deployed, even when idle)` }));
        break;
      }
      case "evaluation":
        break;
    }
    if (a.workstreamId) for (let k = start; k < out.length; k++) out[k]!.workstreamId = a.workstreamId;
  }
  // Evaluation scores runs in its own scope. A project-wide evaluation also scores the workstreams
  // that have no evaluation of their own; workstreams marked not evaluated are never scored.
  const evals = p.build.activities.filter((x): x is Extract<DevActivity, { kind: "evaluation" }> => x.kind === "evaluation");
  const evaluated = (ws: string) => p.build.workstreams.find((w) => w.id === ws)?.evaluated !== false;
  const ownEval = new Set(evals.flatMap((e) => (e.workstreamId ? [e.workstreamId] : [])));
  for (const a of evals) {
    const scopes = a.workstreamId
      ? (evaluated(a.workstreamId) ? [a.workstreamId] : [])
      : [...runsByScope.keys()].filter((k) => k === "" || (evaluated(k) && !ownEval.has(k)));
    const n = sum(scopes.map((k) => { const r = runsByScope.get(k)!; return r.bakeoff * a.scoredShare.bakeoff + r.iterations * a.scoredShare.iterations + r.regression * a.scoredShare.regression; }));
    if (n > 0) {
      const ls = evaluationLines(a.id, a.label, "devlab", n, a.judgeModelId, a.evaluators, a.queryTokens, a.contextTokens, a.responseTokens, a.safetyEvaluators, book, date);
      out.push(...(a.workstreamId ? ls.map((l) => ({ ...l, workstreamId: a.workstreamId })) : ls));
    }
  }
  return out;
}

const activeIn = (m: number, x: { fromMonth?: number | undefined; toMonth?: number | undefined }) => m >= (x.fromMonth ?? 1) && m <= (x.toMonth ?? Infinity);

/**
 * Effort per build team line in month m: people on the line (0 outside its window) split into
 * workstream shares and the project-wide remainder. Shares above 100% are scaled down to 100%.
 */
export function seatEffort(p: Project, m: number, onlyExperimenting = true): { seat: number; people: number; byWorkstream: Record<string, number>; projectWide: number }[] {
  return p.build.team.map((t, seat) => {
    const people = (!onlyExperimenting || t.experiments) && activeIn(m, t) ? t.people : 0;
    const allocs = (t.allocations ?? []).filter((a) => activeIn(m, a));
    const total = sum(allocs.map((a) => a.share));
    const scale = total > 1 ? 1 / total : 1;
    const byWorkstream: Record<string, number> = {};
    for (const a of allocs) byWorkstream[a.workstreamId] = (byWorkstream[a.workstreamId] ?? 0) + people * a.share * scale;
    return { seat, people, byWorkstream, projectWide: people * (1 - Math.min(1, total)) };
  });
}

/** People running experiments in build month m (all build months when m is omitted). */
export function developers(p: Project, m?: number): number {
  return sum(p.build.team.filter((t) => t.experiments && (m === undefined || (m >= (t.fromMonth ?? 1) && m <= (t.toMonth ?? Infinity)))).map((t) => t.people));
}

/**
 * Monthly labour lines for a team; lines with a month window only bill inside it (when `m` is
 * given). Build labour is split by the line's workstream allocations in that month.
 */
export function teamLines(p: Project, team: Project["build"]["team"], stream: "labour" | "maint", componentId: string, factor = 1, m?: number): Line[] {
  const rates = new Map(p.rateCard.map((r) => [r.id, r]));
  const wsLabel = new Map(p.build.workstreams.map((w) => [w.id, w.label]));
  const active = team.map((t, i) => [t, i] as const).filter(([t]) => m === undefined || activeIn(m, t));
  return active.flatMap(([t, i]) => {
    const r = rates.get(t.roleId);
    if (!r) throw new Error(`Unknown role ${t.roleId}`);
    const who = t.name ? `${t.name} (${r.label})` : r.label;
    const label = t.phase ? `${t.phase}: ${who}` : who;
    const hours = t.people * t.hoursPerMonth;
    const base = { componentId, stream, behaviour: "fixed" as const, meter: `role:${t.roleId}`, unit: "hour", unitPrice: r.hourlyRate * factor, seat: stream === "labour" ? i : undefined };
    const formula = (share: number) => `${t.people} × ${t.hoursPerMonth} h${share !== 1 ? ` × ${Math.round(share * 100)}%` : ""} × CAD ${r.hourlyRate}/h${factor !== 1 ? ` × ${factor.toFixed(2)}` : ""}`;
    const id = `${componentId}:${t.phase ?? ""}:${t.roleId}:${i}`;
    const allocs = stream === "labour" && m !== undefined ? (t.allocations ?? []).filter((a) => activeIn(m, a)) : [];
    if (!allocs.length) return [line({ ...base, id, label, quantity: hours, formula: formula(1) })];
    const total = sum(allocs.map((a) => a.share));
    const scale = total > 1 ? 1 / total : 1;
    const parts = allocs.map((a, k) => line({ ...base, id: `${id}:${a.workstreamId}:${k}`, label: `${label} → ${wsLabel.get(a.workstreamId) ?? a.workstreamId}`, quantity: hours * a.share * scale, workstreamId: a.workstreamId, formula: formula(a.share * scale) }));
    const rest = 1 - Math.min(1, total);
    return rest > 1e-9 ? [...parts, line({ ...base, id, label: `${label} → project-wide`, quantity: hours * rest, formula: formula(rest) })] : parts;
  });
}
