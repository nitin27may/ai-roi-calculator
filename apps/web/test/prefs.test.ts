import { describe, expect, it } from "vitest";
import { SIDEBAR_KEY, THEME_INIT_SCRIPT, THEME_KEY, applyTheme, parseTheme, readSidebarCollapsed, readTheme, themeAttribute, writeSidebarCollapsed, writeTheme, type PrefStorage } from "../lib/prefs";

const memory = (): PrefStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const blocked: PrefStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

describe("theme preference", () => {
  it("treats anything unknown as system", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });
  it("round-trips light and dark, and clears the key for system", () => {
    const s = memory();
    writeTheme(s, "dark");
    expect(s.data.get(THEME_KEY)).toBe("dark");
    expect(readTheme(s)).toBe("dark");
    writeTheme(s, "system");
    expect(s.data.has(THEME_KEY)).toBe(false);
    expect(readTheme(s)).toBe("system");
  });
  it("survives blocked storage", () => {
    expect(readTheme(blocked)).toBe("system");
    expect(() => writeTheme(blocked, "dark")).not.toThrow();
  });
  it("sets and removes the data-theme attribute", () => {
    const attrs = new Map<string, string>();
    const root = { setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) };
    applyTheme(root, "dark");
    expect(attrs.get("data-theme")).toBe("dark");
    applyTheme(root, "system");
    expect(attrs.has("data-theme")).toBe(false);
    expect(themeAttribute("light")).toBe("light");
  });
});

describe("pre-paint theme script", () => {
  const run = (stored: string | null) => {
    const attrs = new Map<string, string>();
    const localStorage = { getItem: () => stored };
    const document = { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) } };
    new Function("localStorage", "document", THEME_INIT_SCRIPT)(localStorage, document);
    return attrs.get("data-theme");
  };
  it("applies a saved light or dark theme and ignores anything else", () => {
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run(null)).toBeUndefined();
    expect(run("system")).toBeUndefined();
  });
  it("reads the same key the toggle writes", () => {
    expect(THEME_INIT_SCRIPT).toContain(`"${THEME_KEY}"`);
  });
  it("does not throw when storage is blocked", () => {
    const document = { documentElement: { setAttribute() { /* unused */ } } };
    const localStorage = { getItem() { throw new Error("blocked"); } };
    expect(() => new Function("localStorage", "document", THEME_INIT_SCRIPT)(localStorage, document)).not.toThrow();
  });
});

describe("sidebar preference", () => {
  it("defaults to expanded and persists a collapse", () => {
    const s = memory();
    expect(readSidebarCollapsed(s)).toBe(false);
    writeSidebarCollapsed(s, true);
    expect(s.data.get(SIDEBAR_KEY)).toBe("collapsed");
    expect(readSidebarCollapsed(s)).toBe(true);
    writeSidebarCollapsed(s, false);
    expect(readSidebarCollapsed(s)).toBe(false);
  });
  it("survives blocked storage", () => {
    expect(readSidebarCollapsed(blocked)).toBe(false);
    expect(() => writeSidebarCollapsed(blocked, true)).not.toThrow();
  });
});
