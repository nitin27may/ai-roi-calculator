import type { Project } from "./project.js";

/** Kinds of build tool for the "Engineering tools & lab" add menu (A10). Each becomes a cash item in `build.environment`, billed as stream `devenv`. */
export const ENGINEERING_TOOL_KINDS = [
  { kind: "ide", label: "IDE and developer licences", detail: "Per developer, monthly", perPerson: true, cadence: "monthly" },
  { kind: "cicd", label: "CI/CD", detail: "Build and release pipelines, monthly", perPerson: false, cadence: "monthly" },
  { kind: "testTooling", label: "Test tooling", detail: "Test management, automation or device farm licences", perPerson: false, cadence: "monthly" },
  { kind: "loadTesting", label: "Load-testing service", detail: "Performance and load testing, usually once per cycle", perPerson: false, cadence: "once" },
  { kind: "other", label: "Other tool", detail: "Anything else the team needs while building", perPerson: false, cadence: "monthly" },
] as const;
export type EngineeringToolKind = (typeof ENGINEERING_TOOL_KINDS)[number]["kind"];

/** Adds an empty tool (C$ 0) of a kind to the build environment list and returns its id. Nothing is costed until an amount is typed. Mutates `p`. */
export function addEngineeringTool(p: Project, kind: EngineeringToolKind): string {
  const k = ENGINEERING_TOOL_KINDS.find((x) => x.kind === kind)!;
  let n = 1;
  while (p.build.environment.some((x) => x.id === `tool-${n}`)) n++;
  const id = `tool-${n}`;
  p.build.environment.push({ id, label: k.label, amountCad: 0, cadence: k.cadence, ...(k.perPerson ? { perPerson: true } : {}) });
  return id;
}

/** Highest productivity percentage the AI-assisted development table accepts. */
export const AI_ASSIST_MAX_PCT = 90;

/** Sets (or clears, when pct is 0 or not a number) the productivity percentage for a role. An emptied map drops `aiAssist` so the file returns to its original shape. Mutates `p`. */
export function setAiAssistPct(p: Project, roleId: string, pct: number): void {
  const v = Number.isFinite(pct) ? Math.min(AI_ASSIST_MAX_PCT, Math.max(0, pct)) : 0;
  if (v > 0) {
    p.build.aiAssist = { productivityPctByRole: { ...(p.build.aiAssist?.productivityPctByRole ?? {}), [roleId]: v } };
    return;
  }
  if (!p.build.aiAssist) return;
  const { [roleId]: _gone, ...rest } = p.build.aiAssist.productivityPctByRole;
  if (Object.keys(rest).length === 0) delete p.build.aiAssist;
  else p.build.aiAssist = { productivityPctByRole: rest };
}

/** Whether the AI experiments section is offered: same rule as the AI pages (hidden only once types are chosen and none is AI, and the project has no AI work). */
export { showsAiPages as showsAiExperiments } from "./types.js";
