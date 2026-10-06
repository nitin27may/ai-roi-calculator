import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingIntelligence } from "@studio/engine";
import { PROJECT_MENU_KEY, PROJECT_MENU_STATE_KEY, readProjectMenuChoice, resolveProjectMenuOpen, writeProjectMenuOpen, type PrefStorage } from "../lib/prefs";
import { projectRows, showProjectMenu } from "../lib/nav";

const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
vi.stubGlobal("localStorage", storage);

const { useStudio } = await import("../lib/store");
const fresh = () => { mem.clear(); useStudio.setState({ ...useStudio.getInitialState(), hydrated: false }, true); };
const saved = () => JSON.parse(mem.get("ai-cost-roi-studio:library")!) as { library: { id: string }[]; activeId: string };

describe("project library deletion", () => {
  beforeEach(fresh);

  it("deletes the sample project when others exist", () => {
    const id = useStudio.getState().create("meeting", "Second");
    useStudio.getState().remove("sample");
    expect(useStudio.getState().library.map((e) => e.id)).toEqual([id]);
    expect(useStudio.getState().activeId).toBe(id);
  });

  it("deleting the only project leaves the library empty instead of re-seeding the sample", () => {
    useStudio.getState().remove("sample");
    const s = useStudio.getState();
    expect(s.library).toEqual([]);
    expect(s.activeId).toBe("");
    expect(saved()).toEqual({ library: [], activeId: "" });
  });

  it("deleting every project, then reloading, stays empty", () => {
    const b = useStudio.getState().create("meeting", "B");
    useStudio.getState().remove("sample");
    useStudio.getState().remove(b);
    useStudio.setState({ hydrated: false });
    useStudio.getState().hydrate();
    const s = useStudio.getState();
    expect(s.hydrated).toBe(true);
    expect(s.library).toEqual([]);
    expect(showProjectMenu(s)).toBe(false);
  });

  it("an empty library ignores edits and can load the sample again", () => {
    useStudio.getState().remove("sample");
    useStudio.getState().edit((d) => { d.name = "Nope"; });
    expect(useStudio.getState().library).toEqual([]);
    const id = useStudio.getState().loadSample();
    const s = useStudio.getState();
    expect(s.library).toHaveLength(1);
    expect(s.activeId).toBe(id);
    expect(s.project.name).toBe(meetingIntelligence.name);
  });

  it("removing a project that is not open keeps the open one", () => {
    const b = useStudio.getState().create("meeting", "B");
    useStudio.getState().open("sample");
    useStudio.getState().remove(b);
    expect(useStudio.getState().activeId).toBe("sample");
    expect(useStudio.getState().library).toHaveLength(1);
  });

  it("removing an unknown id changes nothing", () => {
    useStudio.getState().remove("nope");
    expect(useStudio.getState().library).toHaveLength(1);
  });
});

describe("project menu visibility and fold state", () => {
  const lib = [{ id: "a" }, { id: "b" }];
  it("shows only with a loaded library and an open project that still exists", () => {
    expect(showProjectMenu({ hydrated: true, library: lib, activeId: "a" })).toBe(true);
    expect(showProjectMenu({ hydrated: false, library: lib, activeId: "a" })).toBe(false);
    expect(showProjectMenu({ hydrated: true, library: [], activeId: "" })).toBe(false);
    expect(showProjectMenu({ hydrated: true, library: lib, activeId: "gone" })).toBe(false);
    expect(showProjectMenu({ hydrated: true, library: lib, activeId: "" })).toBe(false);
  });
  it("remembers the fold state per project, defaulting to open only for the active one", () => {
    const s: PrefStorage = storage;
    mem.clear();
    expect(resolveProjectMenuOpen(readProjectMenuChoice(s, "a"), true)).toBe(true);
    expect(resolveProjectMenuOpen(readProjectMenuChoice(s, "b"), false)).toBe(false);
    writeProjectMenuOpen(s, "a", false);
    writeProjectMenuOpen(s, "b", true);
    expect(resolveProjectMenuOpen(readProjectMenuChoice(s, "a"), true)).toBe(false);
    expect(resolveProjectMenuOpen(readProjectMenuChoice(s, "b"), false)).toBe(true);
    writeProjectMenuOpen(s, "b", false);
    expect(readProjectMenuChoice(s, "a")).toBe(false);
    expect(readProjectMenuChoice(s, "b")).toBe(false);
    mem.set(PROJECT_MENU_STATE_KEY, "not json");
    expect(readProjectMenuChoice(s, "a")).toBeNull();
  });
  it("reads the older folded-ids list as explicit folds", () => {
    mem.clear();
    mem.set(PROJECT_MENU_KEY, JSON.stringify(["a"]));
    expect(readProjectMenuChoice(storage, "a")).toBe(false);
    expect(readProjectMenuChoice(storage, "z")).toBeNull();
  });
});

describe("sidebar project tree", () => {
  beforeEach(fresh);
  const rows = () => projectRows(useStudio.getState());

  it("has no rows before hydration or with an empty library", () => {
    expect(rows()).toEqual([]);
    useStudio.getState().hydrate();
    useStudio.getState().remove("sample");
    expect(rows()).toEqual([]);
    expect(showProjectMenu(useStudio.getState())).toBe(false);
  });

  it("lists every project, marks the active one, and switching moves the mark", () => {
    useStudio.getState().hydrate();
    const second = useStudio.getState().create("meeting", "Second");
    const third = useStudio.getState().create("meeting", "Third");
    expect(rows()).toHaveLength(3);
    expect(rows().filter((r) => r.active).map((r) => r.id)).toEqual([third]);
    expect(rows().map((r) => r.name)).toContain("Second");
    useStudio.getState().open(second);
    expect(rows().filter((r) => r.active).map((r) => r.id)).toEqual([second]);
    expect(useStudio.getState().project.name).toBe("Second");
    useStudio.getState().remove(second);
    expect(rows()).toHaveLength(2);
    expect(rows().filter((r) => r.active)).toHaveLength(1);
  });
});
