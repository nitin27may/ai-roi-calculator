import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, blankProject, buildLedger, computeRoi, roiOptions, scorecardRows, type Project, type ScoreItem } from "@roi-calculator/engine";
import { buildWorkbook } from "../lib/workbook";
import { HELP } from "../lib/help";
import { GLOSSARY } from "../lib/glossary";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
const { useStudio } = await import("../lib/store");

const catalog = loadCatalog();
const item = (o: Partial<ScoreItem> & Pick<ScoreItem, "id">): ScoreItem => ({ label: o.id, dimension: "speed", measure: "Days from claim to payment", unit: "day", before: 10, after: 2, higherIsBetter: false, weightPct: 60, confidencePct: 50, ...o });
const withItems = (items: ScoreItem[]): Project => ProjectSchema.parse({ ...blankProject("Claims", "2027-01-01"), benefits: { ...blankProject("x", "2027-01-01").benefits, scorecard: items } });
const run = async (p: Project) => {
  const l = buildLedger(p, catalog, "p50");
  const r = computeRoi(l, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  return buildWorkbook(p, l, r, catalog);
};
const text = (ws: { eachRow: (f: (row: { eachCell: (g: (c: { value: unknown }) => void) => void }) => void) => void }) => { const out: string[] = []; ws.eachRow((row) => row.eachCell((c) => out.push(String(c.value)))); return out.join(" | "); };

describe("scorecard in the workbook", () => {
  it("adds a Scorecard sheet only when items exist, in generic wording", async () => {
    const none = await run(blankProject("Plain", "2027-01-01"));
    expect(none.worksheets.map((w) => w.name)).not.toContain("Scorecard");
    expect(text(none.getWorksheet("Summary")!)).not.toMatch(/Scorecard/);

    const p = withItems([item({ id: "cycle" }), item({ id: "csat", dimension: "customer", before: 60, after: 75, higherIsBetter: true, weightPct: 40, monetise: { cadPerUnit: 2, volumePerMonth: 1000 } })]);
    const wb = await run(p);
    expect(wb.worksheets.map((w) => w.name)).toContain("Scorecard");
    const sheet = text(wb.getWorksheet("Scorecard")!);
    expect(sheet).toContain("Days from claim to payment");
    expect(sheet).toContain("Customer experience");
    expect(sheet).toContain("Better");
    expect(text(wb.getWorksheet("Summary")!)).toContain("Scorecard composite index");
    const added = sheet + " " + text(wb.getWorksheet("Summary")!).split(" | ").filter((c) => /Scorecard/.test(c)).join(" ");
    expect(added).not.toMatch(/\bAI\b/);
  });

  it("rows carry improvement, weight, confidence and whether the item is in NPV", () => {
    const p = withItems([item({ id: "cycle" }), item({ id: "z", before: 0, after: 3, higherIsBetter: true, monetise: { cadPerUnit: 1, volumePerMonth: 10 } })]);
    const rows = scorecardRows(p);
    expect(rows[0]).toMatchObject({ Direction: "Better", "Improvement (%)": 80, "Weight (%)": 60, "Confidence (%)": 50, "In NPV and payback": "No" });
    expect(rows[1]).toMatchObject({ "Improvement (%)": "n/a", "Value per month, full rollout (CAD)": 15 });
  });
});

describe("scorecard help and glossary", () => {
  const src = readFileSync(join(__dirname, "../components/scorecard.tsx"), "utf8");
  it("has a help entry for every help id the Scorecard tab uses", () => {
    const ids = [...src.matchAll(/(?:help="|HelpTip id=")(\w+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(10);
    expect(ids.filter((k) => !(k in HELP))).toEqual([]);
  });
  it("has glossary terms for scorecard and dimension, linked from help", () => {
    const g = new Set(GLOSSARY.map((t) => t.id));
    expect(g.has("scorecard") && g.has("score-dimension")).toBe(true);
    expect(HELP.scorecard.term).toBe("scorecard");
    expect(HELP.scoreDimension.term).toBe("score-dimension");
  });
});

describe("scorecard state edits", () => {
  beforeEach(() => { mem.clear(); useStudio.setState({ ...useStudio.getInitialState(), hydrated: false }, true); });

  it("adds, edits, monetises, persists and removes items; undo restores", () => {
    const s = () => useStudio.getState();
    s().hydrate();
    expect(s().project.benefits.scorecard ?? []).toEqual([]);
    s().edit((d) => { d.benefits.scorecard = [...(d.benefits.scorecard ?? []), item({ id: "a" })]; });
    s().edit((d) => { const i = d.benefits.scorecard!.find((x) => x.id === "a")!; i.monetise = { cadPerUnit: 3, volumePerMonth: 100 }; i.after = 1; });
    expect(s().project.benefits.scorecard![0]).toMatchObject({ after: 1, monetise: { cadPerUnit: 3, volumePerMonth: 100 } });
    // A reload reads the saved library back.
    useStudio.setState({ hydrated: false });
    s().hydrate();
    expect(s().project.benefits.scorecard![0]).toMatchObject({ id: "a", after: 1 });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 5000);
    s().edit((d) => { d.benefits.scorecard = d.benefits.scorecard!.filter((x) => x.id !== "a"); });
    expect(s().project.benefits.scorecard).toEqual([]);
    s().undo();
    expect(s().project.benefits.scorecard).toHaveLength(1);
    vi.useRealTimers();
  });
});
