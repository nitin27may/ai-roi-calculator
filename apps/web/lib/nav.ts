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
