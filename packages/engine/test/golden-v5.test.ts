import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { PROJECT_TEMPLATES, ProjectSchema, buildLedger, computeRoi, meetingIntelligence, migrateProject, roiOptions, summarize, summaryRows } from "../src/index.js";

/**
 * Frozen record of what the engine produced at schema version 5 for the sample and every template: each month's line ids and
 * costs, the stream totals, ROI, the headline summary figures and the summary rows.
 *
 * Every later phase of the any-project work must keep this green. A new feature adds no lines, and moves no figure, when its fields
 * are missing or empty. Do not regenerate the fixture to make a failure pass: a changed figure for an existing project is a bug,
 * or a deliberate change that has to be stated in its PR. The fixture is generated once, with GENERATE_GOLDEN_V5=1.
 */
const FIXTURE = new URL("./fixtures/v5-golden.json", import.meta.url);
const cat = loadCatalog();

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const num = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));

function record(project: unknown) {
  const p = ProjectSchema.parse(migrateProject(structuredClone(project)));
  const ledger = buildLedger(p, cat);
  const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  const s = summarize(p, ledger, roi, cat);
  return {
    totals: num(ledger.totals as unknown as Record<string, number>),
    months: ledger.months.map((m) => ({ lines: m.lines.map((l) => [l.id, round(l.cost)]), byStream: num(m.byStream as unknown as Record<string, number>), benefit: round(m.benefit) })),
    roi: { totalCost: round(roi.totalCost), totalBenefit: round(roi.totalBenefit), npv: round(roi.npv) },
    summary: {
      totalCost: round(s.totalCost), totalBenefit: round(s.totalBenefit), build: round(s.build), devLabShare: round(s.devLabShare),
      steadyStateAnnualRun: round(s.steadyStateAnnualRun), year1Run: round(s.year1Run), benefitPerYear: round(s.benefitPerYear),
      npv: round(s.npv), roi: round(s.roi), paybackMonth: s.paybackMonth, irrPct: s.irrPct === null ? null : round(s.irrPct),
    },
    rows: summaryRows(p, ledger, roi, cat).map((r) => [String(r.Item), String(r.Value)]),
  };
}

const sources: [string, unknown][] = [["sample", meetingIntelligence], ...PROJECT_TEMPLATES.map((t) => [t.id, t.make(`Golden ${t.id}`)] as [string, unknown])];

if (process.env.GENERATE_GOLDEN_V5 === "1" && !existsSync(FIXTURE)) {
  const out: Record<string, unknown> = {};
  for (const [name, project] of sources) out[name] = { project, golden: record(project) };
  writeFileSync(FIXTURE, JSON.stringify(out, null, 1) + "\n");
}

describe("v5 golden: existing projects keep every figure and every line", () => {
  it("the fixture exists", () => expect(existsSync(FIXTURE)).toBe(true));
  const fixture = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, { project: unknown; golden: ReturnType<typeof record> }>) : {};
  it("covers the sample and every template", () => expect(Object.keys(fixture).sort()).toEqual(sources.map(([n]) => n).sort()));
  for (const [name, entry] of Object.entries(fixture)) {
    it(`${name}: lines, streams, ROI, summary and rows are identical`, () => {
      expect(record(entry.project)).toEqual(entry.golden);
    });
  }
});
