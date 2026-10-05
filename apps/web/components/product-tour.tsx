"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { TOUR_START_EVENT, TOUR_STEPS, clampStep, shouldAutoShowTour, writeTourState, type TourState } from "@/lib/tour";

/** Starts the tour from step 1. Used by the Help menu. */
export function startTour() {
  dispatchEvent(new Event(TOUR_START_EVENT));
}

interface Box { x: number; y: number; w: number; h: number }
const PAD = 6, GAP = 12, MARGIN = 12, CARD_W = 340;
const same = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Where the card sits: below the target, else above, beside, else pinned to a corner. Centered with no target. */
function place(box: Box | null, card: { w: number; h: number }, vw: number, vh: number): { left: number; top: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  if (!box) return { left: (vw - card.w) / 2, top: Math.max(MARGIN, (vh - card.h) / 2.4) };
  const cx = clamp(box.x + box.w / 2 - card.w / 2, MARGIN, vw - card.w - MARGIN);
  const cy = clamp(box.y + box.h / 2 - card.h / 2, MARGIN, vh - card.h - MARGIN);
  if (box.y + box.h + PAD + GAP + card.h <= vh - MARGIN) return { left: cx, top: box.y + box.h + PAD + GAP };
  if (box.y - PAD - GAP - card.h >= MARGIN) return { left: cx, top: box.y - PAD - GAP - card.h };
  if (box.x + box.w + PAD + GAP + card.w <= vw - MARGIN) return { left: box.x + box.w + PAD + GAP, top: cy };
  if (box.x - PAD - GAP - card.w >= MARGIN) return { left: box.x - PAD - GAP - card.w, top: cy };
  return { left: vw - card.w - MARGIN, top: vh - card.h - MARGIN };
}

export function ProductTour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({ w: 1200, h: 800 });
  const [cardSize, setCardSize] = useState({ w: CARD_W, h: 200 });
  const [reduced, setReduced] = useState(false);
  const router = useRouter();
  const path = usePathname();
  const card = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId(), bodyId = useId(), maskId = useId();
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;

  const begin = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIndex(0);
    setBox(null);
    setOpen(true);
  }, []);
  const close = useCallback((state: TourState) => {
    try { writeTourState(localStorage, state); } catch { /* storage blocked */ }
    setOpen(false);
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el?.isConnected) el.focus();
  }, []);

  // Read the seen-state after mount only, so the static export and first client render match.
  useEffect(() => {
    setReduced(matchMedia("(prefers-reduced-motion: reduce)").matches);
    let show = true;
    try { show = shouldAutoShowTour(localStorage); } catch { /* storage blocked: show it */ }
    if (show) begin();
    addEventListener(TOUR_START_EVENT, begin);
    return () => removeEventListener(TOUR_START_EVENT, begin);
  }, [begin]);

  // Move to the page the step needs.
  useEffect(() => {
    if (open && step.route && path !== step.route) router.push(step.route);
  }, [open, step, path, router]);

  // Track the target. A target that never appears leaves box null, which shows the centered card.
  useEffect(() => {
    if (!open) return;
    setBox(null);
    if (!step.target) return;
    let raf = 0, scrolled = false;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      let next: Box | null = null;
      if (el && r && r.width > 0 && r.height > 0) {
        if (!scrolled) {
          scrolled = true;
          if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: "center", behavior: "auto" });
        }
        // Clip to the viewport so a tall target does not push the spotlight off screen.
        const x = Math.max(r.left, 0), y = Math.max(r.top, 0);
        next = { x, y, w: Math.min(r.right, innerWidth) - x, h: Math.min(r.bottom, innerHeight) - y };
      }
      setBox((b) => (same(b, next) ? b : next));
      setView((v) => (v.w === innerWidth && v.h === innerHeight ? v : { w: innerWidth, h: innerHeight }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, step]);

  useLayoutEffect(() => {
    const el = card.current;
    if (open && el) setCardSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }));
  });

  // Focus the card on each step so keyboard users land on the controls.
  useEffect(() => {
    if (open) card.current?.focus({ preventScroll: true });
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close("skipped"); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  const pos = place(box, cardSize, view.w, view.h);
  const move = reduced ? undefined : "left 260ms ease, top 260ms ease";
  const geo = box ? { x: box.x - PAD, y: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2, transition: reduced ? undefined : "x 260ms ease, y 260ms ease, width 260ms ease, height 260ms ease" } : undefined;
  const btn = "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] font-medium";
  return (
    <>
      {/* Dims the page but lets pointer events through, so the tour never blocks the app. */}
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-40 h-full w-full" data-testid="tour-spotlight">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {geo && <rect rx={8} fill="black" style={geo} />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(15 25 21 / 0.5)" mask={`url(#${maskId})`} />
        {geo && <rect rx={8} fill="none" stroke="var(--accent)" strokeWidth={2} style={geo} />}
      </svg>
      <div ref={card} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={bodyId} tabIndex={-1}
        className="fixed z-50 rounded-xl border border-line bg-surface p-4 shadow-xl outline-none"
        style={{ left: pos.left, top: pos.top, width: Math.min(CARD_W, view.w - MARGIN * 2), transition: move }}>
        <div className="mb-1 text-[11.5px] font-medium text-muted">{index + 1} of {TOUR_STEPS.length}</div>
        <h2 id={titleId} className="font-display text-base font-bold">{step.title}</h2>
        <p id={bodyId} className="mt-1 text-[13px] text-ink-2">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => close("skipped")} className={`${btn} text-muted hover:bg-surface-2 hover:text-ink`}>Skip tour</button>
          <div className="flex gap-1.5">
            <button type="button" disabled={index === 0} onClick={() => setIndex(clampStep(index - 1))} className={`${btn} border border-line text-ink-2 enabled:hover:bg-surface-2 disabled:opacity-40`}><ArrowLeft size={13} />Back</button>
            <button type="button" onClick={() => (last ? close("finished") : setIndex(clampStep(index + 1)))} className={`${btn} bg-accent text-accent-ink`}>{last ? <>Finish<Check size={13} /></> : <>Next<ArrowRight size={13} /></>}</button>
          </div>
        </div>
      </div>
    </>
  );
}
