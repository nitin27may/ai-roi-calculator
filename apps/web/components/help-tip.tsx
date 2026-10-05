"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { helpFor } from "@/lib/help";
import { glossaryById } from "@/lib/glossary";
import { cn } from "@/lib/format";

const WIDTH = 288;
const GAP = 6;

/**
 * A non-modal hint for one field. Opens on hover, focus or tap (click), closes with Esc, on outside click and on scroll.
 * It never traps focus or blocks the page. The popover is always mounted so it can animate; `motion-reduce` removes the motion.
 */
export function HelpTip({ id, label }: { id: string; label: string }) {
  const entry = helpFor(id);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: false });
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const uid = useId();

  const place = useCallback(() => {
    const b = button.current?.getBoundingClientRect();
    if (!b) return;
    const h = pop.current?.offsetHeight ?? 160;
    const above = b.bottom + GAP + h > innerHeight && b.top - GAP - h > 0;
    setPos({ left: Math.max(8, Math.min(innerWidth - WIDTH - 8, b.left - 8)), top: above ? b.top - GAP - h : b.bottom + GAP, above });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  const close = useCallback(() => { setOpen(false); setPinned(false); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); button.current?.focus({ preventScroll: true }); } };
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!button.current?.contains(t) && !pop.current?.contains(t)) close(); };
    const onScroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) close(); };
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onDown);
    addEventListener("scroll", onScroll, true);
    addEventListener("resize", close);
    return () => { removeEventListener("keydown", onKey); removeEventListener("pointerdown", onDown); removeEventListener("scroll", onScroll, true); removeEventListener("resize", close); };
  }, [open, close]);

  if (!entry) return null;
  const term = entry.term ? glossaryById(entry.term) : undefined;
  const hover = () => { window.clearTimeout(leaveTimer.current); setOpen(true); };
  const leave = () => { if (pinned) return; window.clearTimeout(leaveTimer.current); leaveTimer.current = window.setTimeout(() => setOpen(false), 120); };
  const dl = "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1";

  return (
    <span className="inline-flex" onMouseEnter={hover} onMouseLeave={leave}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && !pinned) setOpen(false); }}>
      <button ref={button} type="button" aria-label={`About ${label}`} aria-expanded={open} aria-controls={uid}
        onFocus={hover}
        onClick={() => { if (pinned) close(); else { setOpen(true); setPinned(true); } }}
        className="-my-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-muted hover:text-ink">
        <CircleHelp size={14} aria-hidden />
      </button>
      <div ref={pop} id={uid} role="group" aria-label={`Help: ${label}`} aria-hidden={!open}
          onMouseEnter={hover} onMouseLeave={leave}
          style={{ left: pos.left, top: pos.top, width: WIDTH }}
          className={cn("fixed z-50 rounded-lg border border-line bg-surface p-3 text-left text-[12.5px] normal-case leading-snug tracking-normal text-ink-2 shadow-lg transition duration-150 ease-out motion-reduce:transition-none",
            open ? "visible translate-y-0 opacity-100" : cn("pointer-events-none invisible opacity-0", pos.above ? "translate-y-1" : "-translate-y-1"))}>
          <p className="m-0 mb-2 font-medium text-ink">{entry.meaning}</p>
          <dl className={cn(dl, "m-0")}>
            <dt className="text-muted">Unit</dt><dd className="m-0">{entry.unit}</dd>
            <dt className="text-muted">Example</dt><dd className="m-0">{entry.example}</dd>
            <dt className="text-muted">Default</dt><dd className="m-0">{entry.source}</dd>
          </dl>
          {term && <Link href={`/glossary#${term.id}`} tabIndex={open ? 0 : -1} className="mt-2 inline-block font-medium text-accent underline underline-offset-2">Glossary: {term.term}</Link>}
        </div>
    </span>
  );
}
