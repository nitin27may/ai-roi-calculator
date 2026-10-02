"use client";
import { create } from "zustand";
import { ProjectSchema, meetingIntelligence, type Percentile, type Project } from "@studio/engine";

const KEY = "ai-cost-roi-studio:project";

interface State {
  project: Project;
  percentile: Percentile;
  problem: string | null;
  hydrated: boolean;
  hydrate: () => void;
  /** Apply an edit to a copy; refused (and reported) if the result no longer validates. */
  edit: (fn: (draft: Project) => void) => void;
  replace: (p: Project) => void;
  setPercentile: (p: Percentile) => void;
}

const save = (p: Project) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: keep working in memory */
  }
};

export const useStudio = create<State>((set, get) => ({
  project: meetingIntelligence,
  percentile: "p50",
  problem: null,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = ProjectSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return set({ project: parsed.data, hydrated: true });
      }
    } catch {
      /* fall through to the sample */
    }
    set({ hydrated: true });
  },
  edit: (fn) => {
    const draft = structuredClone(get().project);
    fn(draft);
    const parsed = ProjectSchema.safeParse(draft);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return set({ problem: `${i?.path.join(".")}: ${i?.message}` });
    }
    save(parsed.data);
    set({ project: parsed.data, problem: null });
  },
  replace: (p) => {
    save(p);
    set({ project: p, problem: null });
  },
  setPercentile: (percentile) => set({ percentile }),
}));
