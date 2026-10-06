/**
 * The project's own pages (Summary, Overview, Build...) only appear in the sidebar while a project
 * is open: never before the saved library has loaded, never with an empty library, and never for an
 * id that is no longer in the library.
 */
export function showProjectMenu(state: { hydrated: boolean; library: readonly { id: string }[]; activeId: string }): boolean {
  return state.hydrated && state.library.length > 0 && state.library.some((e) => e.id === state.activeId);
}
