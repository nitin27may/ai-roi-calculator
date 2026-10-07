/** Display preferences kept in localStorage: colour theme and sidebar width. Pure helpers, so they can be tested without a browser. */

import { ensureStorageMigrated } from "./storage-migrate";
ensureStorageMigrated();

export const THEME_KEY = "roi-calculator:theme";
/** Pre-rename key, read once by the init script because it runs before the storage migration. */
const LEGACY_THEME_KEY = "studio.theme";
export const SIDEBAR_KEY = "roi-calculator:sidebar";
/** The product tour opens the sidebar drawer on narrow screens when a step points into it, and closes it again afterwards. */
export const DRAWER_OPEN_EVENT = "studio:drawer-open";
export const DRAWER_CLOSE_EVENT = "studio:drawer-close";
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
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}")||localStorage.getItem("${LEGACY_THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export const readSidebarCollapsed = (storage: PrefStorage): boolean => {
  try { return storage.getItem(SIDEBAR_KEY) === "collapsed"; } catch { return false; }
};
export const writeSidebarCollapsed = (storage: PrefStorage, collapsed: boolean): void => {
  try { storage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded"); } catch { /* storage blocked */ }
};

/**
 * Per-project sidebar fold state. Only explicit choices are stored (id -> open); a project with no choice is
 * open when it is the active one and folded otherwise. Older versions stored a plain list of folded ids.
 */
export const PROJECT_MENU_KEY = "roi-calculator:projectMenu";
export const PROJECT_MENU_STATE_KEY = "roi-calculator:projectMenuState";
const readChoices = (storage: PrefStorage): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  try {
    const legacy: unknown = JSON.parse(storage.getItem(PROJECT_MENU_KEY) ?? "[]");
    if (Array.isArray(legacy)) for (const id of legacy) if (typeof id === "string") out[id] = false;
  } catch { /* unreadable: no choices */ }
  try {
    const v: unknown = JSON.parse(storage.getItem(PROJECT_MENU_STATE_KEY) ?? "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) for (const [id, open] of Object.entries(v)) if (typeof open === "boolean") out[id] = open;
  } catch { /* unreadable: no choices */ }
  return out;
};
/** The saved choice for a project, or null when the user has not toggled it. */
export const readProjectMenuChoice = (storage: PrefStorage, projectId: string): boolean | null => readChoices(storage)[projectId] ?? null;
/** Whether a project's pages are shown: the saved choice, else open only for the active project. */
export const resolveProjectMenuOpen = (choice: boolean | null, isActive: boolean): boolean => choice ?? isActive;
export const writeProjectMenuOpen = (storage: PrefStorage, projectId: string, open: boolean): void => {
  try {
    storage.setItem(PROJECT_MENU_STATE_KEY, JSON.stringify({ ...readChoices(storage), [projectId]: open }));
  } catch { /* storage blocked */ }
};
