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

/** Where a menu opens and how tall it may be: upward by default, downward when it would not fit above but fits better below. */
export function menuPlacement(spaceAbove: number, spaceBelow: number, menuHeight: number): { up: boolean; maxHeight: number } {
  const up = spaceAbove >= menuHeight || spaceAbove >= spaceBelow;
  return { up, maxHeight: Math.max(120, Math.floor(up ? spaceAbove : spaceBelow)) };
}

/** The room a menu has above and below its trigger, within the nearest clipping ancestor or the window. */
export function roomAround(trigger: HTMLElement): { above: number; below: number } {
  let bounds = { top: 0, bottom: innerHeight };
  for (let el = trigger.parentElement; el; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY;
    if (o !== "visible") { const r = el.getBoundingClientRect(); bounds = { top: Math.max(bounds.top, r.top), bottom: Math.min(bounds.bottom, r.bottom) }; break; }
  }
  const t = trigger.getBoundingClientRect();
  return { above: t.top - bounds.top - 8, below: bounds.bottom - t.bottom - 8 };
}
