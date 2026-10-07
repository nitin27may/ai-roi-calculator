import { describe, expect, it } from "vitest";
import { migrateLegacyKeys, renamedKey, type MigratableStorage } from "../lib/storage-migrate";

const memory = (seed: Record<string, string> = {}) => {
  const data = new Map<string, string>(Object.entries(seed));
  const s: MigratableStorage & { data: Map<string, string> } = {
    data,
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
  return s;
};

describe("renamedKey", () => {
  it("maps both old prefixes onto roi-calculator:", () => {
    expect(renamedKey("ai-cost-roi-studio:library")).toBe("roi-calculator:library");
    expect(renamedKey("ai-cost-roi-studio:intro:/summary")).toBe("roi-calculator:intro:/summary");
    expect(renamedKey("studio.theme")).toBe("roi-calculator:theme");
    expect(renamedKey("studio.tour.v1")).toBe("roi-calculator:tour.v1");
  });
  it("leaves other keys alone", () => {
    expect(renamedKey("roi-calculator:library")).toBeNull();
    expect(renamedKey("something-else")).toBeNull();
    expect(renamedKey("studio.")).toBeNull();
  });
});

describe("migrateLegacyKeys", () => {
  const old = { "ai-cost-roi-studio:library": '{"library":[]}', "studio.theme": "dark", "studio.tour.v1": "finished", "unrelated": "x" };

  it("copies old keys to the new names and keeps the old ones", () => {
    const s = memory(old);
    expect(migrateLegacyKeys(s)).toBe(3);
    expect(s.data.get("roi-calculator:library")).toBe('{"library":[]}');
    expect(s.data.get("roi-calculator:theme")).toBe("dark");
    expect(s.data.get("roi-calculator:tour.v1")).toBe("finished");
    expect(s.data.get("ai-cost-roi-studio:library")).toBe('{"library":[]}');
    expect(s.data.get("studio.theme")).toBe("dark");
    expect(s.data.has("roi-calculator:unrelated")).toBe(false);
  });

  it("never overwrites a new key", () => {
    const s = memory({ ...old, "roi-calculator:theme": "light" });
    migrateLegacyKeys(s);
    expect(s.data.get("roi-calculator:theme")).toBe("light");
  });

  it("is idempotent", () => {
    const s = memory(old);
    migrateLegacyKeys(s);
    expect(migrateLegacyKeys(s)).toBe(0);
  });

  it("does nothing on empty storage and survives blocked storage", () => {
    expect(migrateLegacyKeys(memory())).toBe(0);
    const blocked: MigratableStorage = { length: 1, key() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(migrateLegacyKeys(blocked)).toBe(0);
  });
});
