"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_CHOICES, THEME_KEY, applyTheme, readTheme, writeTheme, type ThemeChoice } from "@/lib/prefs";
import { cn } from "@/lib/format";

const OPTIONS: Record<ThemeChoice, { label: string; Icon: typeof Sun }> = {
  light: { label: "Light", Icon: Sun },
  dark: { label: "Dark", Icon: Moon },
  system: { label: "Match system", Icon: Monitor },
};

/**
 * Light, dark or match-system. The saved choice is applied before first paint by the script in the document head;
 * this control only reads it after mount (so the static export and first client render agree) and writes changes.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    setChoice(readTheme(localStorage));
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY && e.key !== null) return;
      const next = readTheme(localStorage);
      applyTheme(document.documentElement, next);
      setChoice(next);
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);
  const pick = (next: ThemeChoice) => {
    setChoice(next);
    applyTheme(document.documentElement, next);
    writeTheme(localStorage, next);
  };
  return (
    <div role="group" aria-label="Colour theme" className="inline-flex overflow-hidden rounded-md border border-line bg-surface">
      {THEME_CHOICES.map((c) => {
        const { label, Icon } = OPTIONS[c];
        return (
          <button key={c} type="button" aria-pressed={choice === c} aria-label={label} title={label} onClick={() => pick(c)}
            className={cn("grid h-7 w-7 place-items-center border-r border-line last:border-r-0", choice === c ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2")}>
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
