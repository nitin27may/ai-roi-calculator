import { describe, expect, it, vi } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { buildLedger, computeRoi, meetingIntelligence, roiOptions, type Project } from "@studio/engine";
import { buildWorkbook } from "../lib/workbook";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
const { useStudio } = await import("../lib/store");

const catalog = loadCatalog();
const sheetText = async (p: Project) => {
  const ledger = buildLedger(p, catalog, "p50");
  const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  const wb = await buildWorkbook(p, ledger, roi, catalog);
  return ["Summary", "Assumptions"].map((n) => { const out: string[] = []; wb.getWorksheet(n)!.eachRow((r) => out.push(JSON.stringify(r.values))); return out.join("\n"); }).join("\n");
};

describe("per-line labour in the Excel export", () => {
  it("says nothing extra when every line is costed", async () => {
    const t = await sheetText(meetingIntelligence);
    expect(t).not.toContain("Some build labour excluded");
    expect(t).not.toContain("manual rate");
  });

  it("states the partial exclusion on Summary and marks the line and the manual rate on Assumptions", async () => {
    const p = structuredClone(meetingIntelligence);
    p.build.team[0]!.costed = false;
    p.build.team[1]!.rateOverride = 175;
    const t = await sheetText(p);
    expect(t).toContain(`Some build labour excluded (1 of ${p.build.team.length} lines)`);
    expect(t).toContain("not costed: line excluded");
    expect(t).toContain("manual rate CAD 175/hour");
  });
});

describe("store edits for the new fields", () => {
  it("survive the schema round trip, and the rate card can gain and lose a role", () => {
    mem.clear();
    useStudio.setState({ ...useStudio.getInitialState(), hydrated: false }, true);
    const { edit } = useStudio.getState();
    edit((d) => { d.build.team[0]!.costed = false; d.build.team[0]!.rateOverride = 150; });
    expect(useStudio.getState().project.build.team[0]).toMatchObject({ costed: false, rateOverride: 150 });
    edit((d) => { delete d.build.team[0]!.costed; delete d.build.team[0]!.rateOverride; });
    expect(useStudio.getState().project.build.team[0]!.costed).toBeUndefined();
    const n = useStudio.getState().project.rateCard.length;
    edit((d) => { d.rateCard.push({ id: "extra", label: "Extra", hourlyRate: 90 }); });
    expect(useStudio.getState().project.rateCard).toHaveLength(n + 1);
  });
});
