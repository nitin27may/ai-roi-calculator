"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { INTROS, INTRO_RESET_EVENT, introKey } from "@/lib/intros";

/** A dismissible one-paragraph "what this page answers". Dismissal is kept in localStorage per page and read after mount, so the static export never mismatches. */
export function PageIntro({ path }: { path: string }) {
  const [hidden, setHidden] = useState(true);
  const text = INTROS[path];
  useEffect(() => {
    const read = () => {
      try { setHidden(localStorage.getItem(introKey(path)) === "dismissed"); } catch { setHidden(false); }
    };
    read();
    addEventListener(INTRO_RESET_EVENT, read);
    return () => removeEventListener(INTRO_RESET_EVENT, read);
  }, [path]);
  if (!text || hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(introKey(path), "dismissed"); } catch { /* storage unavailable: hidden for this visit only */ }
  };
  return (
    <section aria-label="What this page answers" className="mx-5 mt-2 flex items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-2">
      <p className="min-w-0 flex-1"><b className="text-ink">What this page answers. </b>{text}</p>
      <button type="button" aria-label="Dismiss this introduction" onClick={dismiss} className="-mr-1 grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><X size={14} /></button>
    </section>
  );
}

/** Brings back the intro for a page. Used by the Help menu. */
export function resetIntro(path: string) {
  try { localStorage.removeItem(introKey(path)); } catch { /* nothing stored */ }
  dispatchEvent(new Event(INTRO_RESET_EVENT));
}
