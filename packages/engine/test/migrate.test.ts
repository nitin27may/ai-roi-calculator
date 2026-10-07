import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { buildLedger, meetingIntelligence, migrateProject, CURRENT_PROJECT_VERSION } from "../src/index.js";

const cat = loadCatalog();

describe("migrateProject", () => {
  it("migrates a v1 fixture to the current version with an identical ledger", () => {
    const v1 = structuredClone(meetingIntelligence) as unknown as Record<string, unknown>;
    v1.version = 1;
    const migrated = migrateProject(v1) as typeof meetingIntelligence;
    expect(migrated.version).toBe(CURRENT_PROJECT_VERSION);
    const current = buildLedger(meetingIntelligence, cat);
    const upgraded = buildLedger(migrated, cat);
    expect(upgraded.totals).toEqual(current.totals);
  });

  it("passes the current version through unchanged", () => {
    const raw = structuredClone(meetingIntelligence) as unknown as Record<string, unknown>;
    const migrated = migrateProject(raw);
    expect(migrated).toEqual(raw);
  });

  it("throws a clear error for an unknown future version", () => {
    const future = { ...structuredClone(meetingIntelligence), version: CURRENT_PROJECT_VERSION + 1 };
    expect(() => migrateProject(future)).toThrow(/newer version/i);
  });

  it("leaves non-project input untouched", () => {
    expect(migrateProject(null)).toBe(null);
    expect(migrateProject("not a project")).toBe("not a project");
    expect(migrateProject({ no: "version" })).toEqual({ no: "version" });
  });
});
