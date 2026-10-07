import type { Project, ProjectType } from "./project.js";
import { PROJECT_TYPES } from "./project.js";

export const PROJECT_TYPE_INFO: Record<ProjectType, { label: string; detail: string }> = {
  newApp: { label: "New application or process", detail: "Something built or set up from scratch" },
  enhancement: { label: "Enhancement to an existing application", detail: "New capability added to a system that stays in place" },
  automation: { label: "Automation", detail: "Replace manual steps with software or robots" },
  replatform: { label: "Replatform or migration", detail: "Move an existing system to a new platform or host" },
  saas: { label: "Replace with SaaS", detail: "Retire a system and buy a hosted product instead" },
  ai: { label: "AI", detail: "Uses models, agents or other AI services" },
};
/** The six types in display order, with their labels. */
export const PROJECT_TYPE_LIST: { type: ProjectType; label: string; detail: string }[] = PROJECT_TYPES.map((type) => ({ type, ...PROJECT_TYPE_INFO[type] }));

/** Workload kinds that are not AI: fixed platform costs and hosting stacks. */
const NON_AI_WORKLOADS: readonly string[] = ["fixed", "hosting"];
export const isAiWorkloadKind = (kind: string): boolean => !NON_AI_WORKLOADS.includes(kind);
/** Every Dev Lab activity is AI work except AI coding tools, which any project can use. */
export const isAiActivityKind = (kind: string): boolean => kind !== "tooling";

/** The distinct types chosen across all features, in display order. Empty when none is chosen. */
export function projectTypes(p: Pick<Project, "features">): ProjectType[] {
  const chosen = new Set(p.features.flatMap((f) => f.types ?? []));
  return PROJECT_TYPES.filter((t) => chosen.has(t));
}

/**
 * Whether the AI-only pages and menu entries apply. True when a feature is typed "ai", or when the project already has
 * AI workloads or Dev Lab activities, so legacy projects keep their AI pages whatever the types say.
 */
export function usesAi(p: Pick<Project, "features" | "workloads" | "build">): boolean {
  return projectTypes(p).includes("ai") || p.workloads.some((w) => isAiWorkloadKind(w.kind)) || p.build.activities.some((a) => isAiActivityKind(a.kind));
}

/**
 * Whether to hide AI choices in add menus: only when a type has been chosen on some feature and none is "ai".
 * A project with no types yet shows everything, so blank and legacy projects are unchanged. Visibility only, never cost.
 */
export function hidesAiChoices(p: Pick<Project, "features">): boolean {
  const t = projectTypes(p);
  return t.length > 0 && !t.includes("ai");
}

/** Whether the AI-only pages (Capacity) are offered in the menu: hidden only when types are chosen and the project does not use AI, so a blank project keeps them. */
export function showsAiPages(p: Pick<Project, "features" | "workloads" | "build">): boolean {
  return !hidesAiChoices(p) || usesAi(p);
}
