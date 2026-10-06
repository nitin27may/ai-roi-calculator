"use client";
import Link from "next/link";
import { FolderOpen, Wand2 } from "lucide-react";
import { useStudio } from "@/lib/store";

/** Shown wherever a project is needed and the library has none: the two ways to get one. */
export function EmptyLibrary() {
  const loadSample = useStudio((s) => s.loadSample);
  return (
    <div role="status" className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <FolderOpen size={28} aria-hidden className="text-muted" />
      <h2 className="font-display text-lg font-bold">No projects yet</h2>
      <p className="text-sm text-ink-2">Every project has been deleted from this browser. Start a new estimate, or load the sample to see how a finished one looks.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/wizard" className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink"><Wand2 size={14} aria-hidden />New estimate</Link>
        <button type="button" onClick={() => loadSample()} className="rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-surface-2">Load the sample</button>
      </div>
    </div>
  );
}
