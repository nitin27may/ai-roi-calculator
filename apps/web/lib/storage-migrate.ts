/**
 * One-time copy of browser storage keys from the old product name ("AI Cost & ROI Studio") to the new one.
 * Old keys were `ai-cost-roi-studio:<name>` (library, intros) and `studio.<name>` (theme, sidebar, tour, report author,
 * project menu, notices). New keys are `roi-calculator:<name>`.
 *
 * Rules: copy only when the new key is absent, never overwrite, never delete the old key (so rolling back to the old
 * build loses nothing). Pure over a storage interface, so it can be tested without a browser.
 */
export interface MigratableStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const NEW_KEY_PREFIX = "roi-calculator:";
const LEGACY_PREFIXES = ["ai-cost-roi-studio:", "studio."] as const;

/** The new key for an old one, or null when the key is not one of ours. */
export function renamedKey(oldKey: string): string | null {
  for (const p of LEGACY_PREFIXES) if (oldKey.startsWith(p) && oldKey.length > p.length) return NEW_KEY_PREFIX + oldKey.slice(p.length);
  return null;
}

/** Copies every legacy key whose new key is missing. Returns how many keys were copied. Never throws. */
export function migrateLegacyKeys(storage: MigratableStorage): number {
  let copied = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k) keys.push(k); }
    for (const oldKey of keys) {
      const next = renamedKey(oldKey);
      if (!next || storage.getItem(next) !== null) continue;
      const value = storage.getItem(oldKey);
      if (value === null) continue;
      storage.setItem(next, value);
      copied++;
    }
  } catch {
    /* storage blocked or full: the app starts from its defaults, as it would with no saved data */
  }
  return copied;
}

let done = false;
/** Runs the migration once per page load against localStorage. Call at module load, before anything reads a key. */
export function ensureStorageMigrated(): void {
  if (done || typeof localStorage === "undefined") return;
  done = true;
  migrateLegacyKeys(localStorage);
}
