/** Display preferences kept in localStorage: colour theme and sidebar width. Pure helpers, so they can be tested without a browser. */

export const THEME_KEY = "studio.theme";
export const SIDEBAR_KEY = "studio.sidebar";
export type ThemeChoice = "light" | "dark" | "system";
export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

export interface PrefStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void }

/** Anything that is not a known choice means "system". */
export function parseTheme(raw: string | null | undefined): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function readTheme(storage: PrefStorage): ThemeChoice {
  try { return parseTheme(storage.getItem(THEME_KEY)); } catch { return "system"; }
}

/** "system" is stored as the absence of a value, so the stylesheet's prefers-color-scheme rule decides. */
export function writeTheme(storage: PrefStorage, choice: ThemeChoice): void {
  try {
    if (choice !== "system") storage.setItem(THEME_KEY, choice);
    else if (storage.removeItem) storage.removeItem(THEME_KEY);
    else storage.setItem(THEME_KEY, "system");
  } catch { /* storage blocked: the choice applies for this visit only */ }
}

/** The data-theme attribute value for a choice, or null to remove it. */
export const themeAttribute = (choice: ThemeChoice): "light" | "dark" | null => (choice === "system" ? null : choice);

export function applyTheme(root: { setAttribute(k: string, v: string): void; removeAttribute(k: string): void }, choice: ThemeChoice): void {
  const attr = themeAttribute(choice);
  if (attr) root.setAttribute("data-theme", attr);
  else root.removeAttribute("data-theme");
}

/**
 * Runs in the document head before first paint, so a saved theme never flashes the other one. It must stay
 * self-contained (no imports) and match THEME_KEY; a test keeps the two in step.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export const readSidebarCollapsed = (storage: PrefStorage): boolean => {
  try { return storage.getItem(SIDEBAR_KEY) === "collapsed"; } catch { return false; }
};
export const writeSidebarCollapsed = (storage: PrefStorage, collapsed: boolean): void => {
  try { storage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded"); } catch { /* storage blocked */ }
};
