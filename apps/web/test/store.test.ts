import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingIntelligence } from "@roi-calculator/engine";
import { PROJECT_MENU_KEY, PROJECT_MENU_STATE_KEY, readProjectMenuChoice, resolveProjectMenuOpen, writeProjectMenuOpen, type PrefStorage } from "../lib/prefs";
import { projectRows, showProjectMenu } from "../lib/nav";

const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
vi.stubGlobal("localStorage", storage);

const { useStudio, INITIAL_UPDATED_AT } = await import("../lib/store");
const fresh = () => { mem.clear(); useStudio.setState({ ...useStudio.getInitialState(), hydrated: false }, true); };
const saved = () => JSON.parse(mem.get("roi-calculator:library")!) as { library: { id: string }[]; activeId: string };

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

describe("a library saved under the pre-rename keys", () => {
  it("is copied to the new key and hydrates with the same project", async () => {
    const { migrateLegacyKeys } = await import("../lib/storage-migrate");
    fresh();
    const old = structuredClone(meetingIntelligence) as unknown as Record<string, unknown>;
    old.schema = "ai-cost-roi-studio/project";
    old.name = "Saved before the rename";
    mem.set("ai-cost-roi-studio:library", JSON.stringify({ library: [{ id: "keep", project: old, updatedAt: "2026-10-01T00:00:00Z" }], activeId: "keep" }));
    const wrapped = { get length() { return mem.size; }, key: (i: number) => [...mem.keys()][i] ?? null, getItem: storage.getItem, setItem: storage.setItem };
    expect(migrateLegacyKeys(wrapped)).toBe(1);
    expect(mem.has("ai-cost-roi-studio:library")).toBe(true);
    useStudio.getState().hydrate();
    const s = useStudio.getState();
    expect(s.activeId).toBe("keep");
    expect(s.project.name).toBe("Saved before the rename");
    expect(s.project.schema).toBe("roi-calculator/project");
    expect(s.unreadableCount).toBe(0);
  });
});

describe("first render state is clock-free (hydration)", () => {
  beforeEach(fresh);

  it("the initial library entry carries a fixed timestamp, so server HTML and first client render match", () => {
    expect(useStudio.getState().library.map((e) => e.updatedAt)).toEqual([INITIAL_UPDATED_AT]);
    expect(useStudio.getInitialState().library[0]?.updatedAt).toBe(INITIAL_UPDATED_AT);
  });

  it("hydrate stamps the real time on an unsaved sample", () => {
    useStudio.getState().hydrate();
    const stamp = useStudio.getState().library[0]!.updatedAt;
    expect(stamp).not.toBe(INITIAL_UPDATED_AT);
    expect(Number.isNaN(Date.parse(stamp))).toBe(false);
  });
});
