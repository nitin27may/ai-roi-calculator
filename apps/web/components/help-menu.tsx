"use client";
import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { BookOpen, ChevronDown, CircleHelp, Database, Info } from "lucide-react";
import { INTROS } from "@/lib/intros";
import { resetIntro } from "@/components/page-intro";
import { menuKeys } from "@/lib/menu-keys";

const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-surface-2 focus-visible:bg-surface-2";

export function HelpMenu({ path }: { path: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = (focusSummary = false) => {
    if (!ref.current) return;
    ref.current.open = false;
    if (focusSummary) ref.current.querySelector("summary")?.focus();
  };
  useEffect(() => {
    const out = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    addEventListener("pointerdown", out);
    return () => removeEventListener("pointerdown", out);
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
    menuKeys(e, menu.current);
  };
  return (
    <details ref={ref} className="relative" data-tour="help-menu" onKeyDown={onKeyDown}
      onToggle={(e) => { if (e.currentTarget.open) requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()); }}>
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2"><CircleHelp size={14} />Help<ChevronDown size={12} /></summary>
      <div ref={menu} role="menu" aria-label="Help" className="absolute right-0 z-30 mt-1 w-[240px] overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
        <Link href="/glossary" role="menuitem" className={item} onClick={() => close()}><BookOpen size={14} />Glossary</Link>
        <Link href="/prices" role="menuitem" className={item} onClick={() => close()}><Database size={14} />Prices &amp; sources</Link>
        {path in INTROS && <button type="button" role="menuitem" className={`${item} border-t border-line`} onClick={() => { resetIntro(path); close(true); }}><Info size={14} />Show what this page answers</button>}
      </div>
    </details>
  );
}
