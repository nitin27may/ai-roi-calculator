import type { Catalog } from "@roi-calculator/catalog";
import { buildLedger, type Ledger } from "./ledger.js";
import type { Project } from "./project.js";
import { sum } from "./lines.js";

/**
 * What AI-assisted development saves and costs over the build (A10), all in CAD on the project's own figures.
 * - `hoursSaved`: team-line hours not billed because of the productivity percentages (build months and hypercare).
 * - `labourSaved`: the labour cost of those hours exactly as the lines are billed, so rate, contingency and `devCutPct` are included.
 * - `toolCost`: the "AI coding tools" activity (seats and coding-agent tokens) over the build, as billed. A fixed monthly Dev Lab allowance replaces it, so it reads 0 then.
 * - `net`: labourSaved minus toolCost.
 */
export interface AiAssistSummary { hoursSaved: number; labourSaved: number; toolCost: number; net: number }

/** Present only when the project sets `build.aiAssist`; undefined otherwise, so projects without it are unchanged. */
export function aiAssistSummary(p: Project, ledger: Ledger, cat: Catalog): AiAssistSummary | undefined {
  if (!p.build.aiAssist) return undefined;
  // The saving is the labour the same project would have billed without the percentages, minus what it bills now.
  const { aiAssist: _off, ...build } = p.build;
  const base = buildLedger({ ...p, build }, cat);
  const labour = (l: Ledger) => l.months.flatMap((m) => m.lines.filter((x) => x.stream === "labour"));
  const toolIds = new Set(p.build.activities.filter((a) => a.kind === "tooling").map((a) => a.id));
  const toolCost = sum(ledger.months.slice(0, p.timeline.buildMonths).flatMap((m) => m.lines.filter((l) => l.stream === "devlab" && toolIds.has(l.componentId)).map((l) => l.cost)));
  const labourSaved = sum(labour(base).map((l) => l.cost)) - sum(labour(ledger).map((l) => l.cost));
  return { hoursSaved: sum(labour(base).map((l) => l.quantity)) - sum(labour(ledger).map((l) => l.quantity)), labourSaved, toolCost, net: labourSaved - toolCost };
}
