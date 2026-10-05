/** The focus target for a menu key press: the index to move to among `count` items, or null when the key is not a menu key. Pure so it can be tested. */
export function nextMenuIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown": return (current + 1) % count;
    case "ArrowUp": return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

/** Moves focus between the enabled items of a menu with the arrow keys. Returns true when the key was handled. */
export function menuKeys(e: { key: string; preventDefault: () => void }, menu: HTMLElement | null): boolean {
  if (!menu) return false;
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
  const next = nextMenuIndex(e.key, items.indexOf(document.activeElement as HTMLElement), items.length);
  if (next === null) return false;
  e.preventDefault();
  items[next]?.focus();
  return true;
}
