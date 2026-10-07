import { hidesAiChoices, isAiActivityKind, isAiWorkloadKind, showsAiPages, type Project } from "@roi-calculator/engine";

/**
 * The project's own pages (Summary, Overview, Build...) only appear in the sidebar while a project
 * is open: never before the saved library has loaded, never with an empty library, and never for an
 * id that is no longer in the library.
 */
export function showProjectMenu(state: { hydrated: boolean; library: readonly { id: string }[]; activeId: string }): boolean {
  return state.hydrated && state.library.length > 0 && state.library.some((e) => e.id === state.activeId);
}

export interface ProjectRow { id: string; name: string; active: boolean }
/**
 * The sidebar's project rows: every saved project, with the open one marked. Empty before the library has
 * loaded and with an empty library, so the whole section disappears.
 */
export function projectRows(state: { hydrated: boolean; library: readonly { id: string; project: { name: string } }[]; activeId: string }): ProjectRow[] {
  if (!state.hydrated) return [];
  return state.library.map((e) => ({ id: e.id, name: e.project.name, active: e.id === state.activeId }));
}

export const PROJECT_VIEWS = [
  { href: "/summary", label: "Summary" },
  { href: "/overview", label: "Overview" },
  { href: "/build", label: "Build" },
  { href: "/run", label: "Run" },
  { href: "/roi", label: "Value & ROI" },
  { href: "/capacity", label: "Capacity (PTU)" },
  { href: "/report", label: "Report" },
  { href: "/settings", label: "Settings" },
];

/** The project pages in the sidebar. Capacity (PTU) is AI-only, so it is left out when the project does not use AI. The route itself stays reachable by URL. */
export function projectNavViews(p: Pick<Project, "features" | "workloads" | "build">) {
  return PROJECT_VIEWS.filter((v) => v.href !== "/capacity" || showsAiPages(p));
}

/** Workload kinds for the Run add menu: AI kinds drop out only once types are chosen and none is AI. */
export function workloadKindsFor<T extends { kind: string }>(p: Pick<Project, "features">, kinds: readonly T[]): T[] {
  return hidesAiChoices(p) ? kinds.filter((k) => !isAiWorkloadKind(k.kind)) : [...kinds];
}

/** Dev Lab activity kinds for the Build add menus: everything but AI coding tools drops out under the same rule. */
export function activityKindsFor<T extends { kind: string }>(p: Pick<Project, "features">, kinds: readonly T[]): T[] {
  return hidesAiChoices(p) ? kinds.filter((k) => !isAiActivityKind(k.kind)) : [...kinds];
}
