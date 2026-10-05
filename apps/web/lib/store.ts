"use client";
import { create } from "zustand";
import { humanizeIssue } from "@/lib/validation";
import { PROJECT_TEMPLATES, ProjectSchema, meetingIntelligence, migrateProject, type Percentile, type Project } from "@studio/engine";

const LIBRARY_KEY = "ai-cost-roi-studio:library";
const LEGACY_KEY = "ai-cost-roi-studio:project";

export interface LibraryEntry { id: string; project: Project; updatedAt: string }

interface State {
  library: LibraryEntry[];
  activeId: string;
  /** The active project (kept in sync with the library). */
  project: Project;
  percentile: Percentile;
  problem: string | null;
  /** A workload the Run page should select when it opens (set by "Add to project"). */
  focus: string | null;
  /** Undo/redo stacks for the active project (in memory only). */
  past: Project[];
  future: Project[];
  undo: () => void;
  redo: () => void;
  hydrated: boolean;
  hydrate: () => void;
  /** Saved projects dropped during hydration because they failed validation even after migration. */
  unreadableCount: number;
  /** Apply an edit to a copy of the active project; refused (and reported) if it no longer validates. */
  edit: (fn: (draft: Project) => void) => void;
  /** Replace the active project. `coalesce` merges it into the previous undo step when edits come in quick succession. */
  replace: (p: Project, coalesce?: boolean) => void;
  setPercentile: (p: Percentile) => void;
  create: (templateId: string, name: string) => string;
  add: (p: Project) => string;
  open: (id: string) => void;
  duplicate: (id: string) => string;
  remove: (id: string) => void;
}

let lastEditAt = 0;
const newId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();
const firstEntry = (): LibraryEntry => ({ id: "sample", project: meetingIntelligence, updatedAt: now() });

/** Migrates then validates a saved project, logging why it was dropped so the Projects page can surface a count. */
function safeMigrateAndParse(raw: unknown): { success: true; data: Project } | { success: false } {
  try {
    const parsed = ProjectSchema.safeParse(migrateProject(raw));
    if (!parsed.success) {
      console.warn("Saved project failed validation and was left out of the library:", parsed.error.issues[0]);
      return { success: false };
    }
    return { success: true, data: parsed.data };
  } catch (err) {
    console.warn("Saved project could not be migrated and was left out of the library:", err);
    return { success: false };
  }
}

function persist(library: LibraryEntry[], activeId: string) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ library, activeId }));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

export const useStudio = create<State>((set, get) => {
  const commit = (library: LibraryEntry[], activeId: string, extra: Partial<State> = {}) => {
    const active = library.find((e) => e.id === activeId) ?? library[0]!;
    persist(library, active.id);
    set({ library, activeId: active.id, project: active.project, problem: null, ...extra });
  };
  const initial = firstEntry();
  return {
    library: [initial],
    activeId: initial.id,
    project: initial.project,
    percentile: "p50",
    problem: null,
    focus: null,
    past: [],
    future: [],
    hydrated: false,
    unreadableCount: 0,
    hydrate: () => {
      if (get().hydrated) return;
      try {
        const raw = localStorage.getItem(LIBRARY_KEY);
        if (raw) {
          const data = JSON.parse(raw) as { library: LibraryEntry[]; activeId: string };
          let unreadable = 0;
          const library = data.library.flatMap((e) => {
            const parsed = safeMigrateAndParse(e.project);
            if (parsed.success) return [{ ...e, project: parsed.data }];
            unreadable++;
            return [];
          });
          if (library.length) return commit(library, data.activeId, { hydrated: true, unreadableCount: unreadable });
          if (unreadable) set({ unreadableCount: unreadable });
        }
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const parsed = safeMigrateAndParse(JSON.parse(legacy));
          if (parsed.success) return commit([{ id: "sample", project: parsed.data, updatedAt: now() }], "sample", { hydrated: true });
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
        console.warn("Edit refused by the schema:", parsed.error.issues[0]);
        return set({ problem: humanizeIssue(parsed.error.issues[0]) });
      }
      get().replace(parsed.data, true);
    },
    replace: (p, coalesce = false) => {
      const { library, activeId, project, past } = get();
      if (p === project) return;
      const merge = coalesce && Date.now() - lastEditAt < 600 && past.length > 0;
      lastEditAt = coalesce ? Date.now() : 0;
      commit(library.map((e) => (e.id === activeId ? { ...e, project: p, updatedAt: now() } : e)), activeId, { past: merge ? past : [...past, project].slice(-50), future: [] });
    },
    undo: () => {
      const { past, future, project, library, activeId } = get();
      const prev = past.at(-1);
      if (!prev) return;
      commit(library.map((e) => (e.id === activeId ? { ...e, project: prev, updatedAt: now() } : e)), activeId, { past: past.slice(0, -1), future: [project, ...future].slice(0, 50) });
    },
    redo: () => {
      const { past, future, project, library, activeId } = get();
      const next = future[0];
      if (!next) return;
      commit(library.map((e) => (e.id === activeId ? { ...e, project: next, updatedAt: now() } : e)), activeId, { past: [...past, project].slice(-50), future: future.slice(1) });
    },
    setPercentile: (percentile) => set({ percentile }),
    create: (templateId, name) => {
      const t = PROJECT_TEMPLATES.find((x) => x.id === templateId) ?? PROJECT_TEMPLATES.at(-1)!;
      return get().add(t.make(name));
    },
    add: (p) => {
      const id = newId();
      commit([...get().library, { id, project: p, updatedAt: now() }], id, { past: [], future: [] });
      return id;
    },
    open: (id) => commit(get().library, id, { past: [], future: [] }),
    duplicate: (id) => {
      const src = get().library.find((e) => e.id === id);
      if (!src) return get().activeId;
      return get().add({ ...structuredClone(src.project), name: `${src.project.name} (copy)` });
    },
    remove: (id) => {
      const rest = get().library.filter((e) => e.id !== id);
      const library = rest.length ? rest : [firstEntry()];
      commit(library, get().activeId === id ? library[0]!.id : get().activeId);
    },
  };
});
