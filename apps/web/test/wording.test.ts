import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, buildLedger, chequesTemplate, computeRoi, costSplit, meetingIntelligence, monthRows, roiOptions, type Project } from "@roi-calculator/engine";
import { CHART_SERIES } from "../lib/xlsx-chart";
import { INTROS } from "../lib/intros";
import { TOUR_STEPS } from "../lib/tour";
import { GLOSSARY, GLOSSARY_GROUPS, glossaryGroupOf } from "../lib/glossary";

/**
 * Wording must not drift back to AI-only phrases on pages every project sees. "AI Dev Lab" and "Production AI usage" are allowed
 * only where they are AI-specific or pinned: the glossary term for AI experiments, and the Excel summary row "of which AI Dev Lab",
 * which packages/engine/test/fixtures/v5-golden.json pins.
 */
const BANNED = ["AI Dev Lab", "Production AI usage"];
const root = join(__dirname, "..");
const engineSrc = join(root, "..", "..", "packages", "engine", "src");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(n) ? [full] : [];
});
/** Source lines that can reach a user: everything except comment lines. */
const userLines = (file: string) => readFileSync(file, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));

const WEB_ALLOWED = new Set([join(root, "lib", "glossary.ts")]);
const ENGINE_FILES = ["present.ts", "report.ts", "roi.ts"].map((f) => join(engineSrc, f));
const PINNED_LINE = /"  of which AI Dev Lab"/;

describe("wording stays general", () => {
  it("has no banned phrase in the web app source outside the allow-list", () => {
    const hits: string[] = [];
    for (const dir of ["app", "components", "lib"]) for (const f of walk(join(root, dir))) {
      if (WEB_ALLOWED.has(f)) continue;
      userLines(f).forEach((l, i) => { for (const b of BANNED) if (l.includes(b)) hits.push(`${f.replace(root, "")}:${i + 1} ${b}`); });
    }
    expect(hits).toEqual([]);
  });

  it("has no banned phrase in the engine's label tables, except the row the golden fixture pins", () => {
    const hits: string[] = [];
    for (const f of ENGINE_FILES) userLines(f).forEach((l, i) => { if (PINNED_LINE.test(l)) return; for (const b of BANNED) if (l.includes(b)) hits.push(`${f.replace(engineSrc, "")}:${i + 1} ${b}`); });
    expect(hits).toEqual([]);
  });

  it("keeps the pinned summary row exactly as the golden fixture records it", () => {
    expect(readFileSync(join(engineSrc, "report.ts"), "utf8")).toContain('"  of which AI Dev Lab"');
  });

  it("has none in the intros, the tour or the chart legends", () => {
    const text = JSON.stringify([INTROS, TOUR_STEPS, CHART_SERIES]);
    for (const b of BANNED) expect(text).not.toContain(b);
  });

  it("labels the run stream and the lab stream generically in the month columns and the cost split", () => {
    const catalog = loadCatalog();
    const projects: Project[] = [ProjectSchema.parse(chequesTemplate("Cheques")), ProjectSchema.parse(meetingIntelligence)];
    for (const p of projects) {
      const l = buildLedger(p, catalog, "p50");
      const r = computeRoi(l, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
      const cols = Object.keys(monthRows(l, r)[0]!);
      expect(cols).toContain("Production usage");
      expect(cols).toContain("Engineering tools & lab");
      for (const b of BANNED) expect(cols.join("|")).not.toContain(b);
      expect(costSplit(l).map((x) => x.label)).toContain("Production usage");
    }
  });

  it("lists every glossary term in exactly one group, with generic groups first", () => {
    for (const t of GLOSSARY) expect(glossaryGroupOf(t.id), t.id).toBeDefined();
    expect(GLOSSARY_GROUPS[0]).toBe("Estimating");
    expect(GLOSSARY_GROUPS.at(-1)).toBe("AI and tokens");
  });

  it("has the terms the any-project work introduced, once each", () => {
    const ids = GLOSSARY.map((t) => t.id);
    for (const id of ["reserved-instance", "azure-hybrid-benefit", "dev-test-pricing", "current-state", "decommission", "scorecard", "per-transaction-cost", "delivery-phase", "hypercare", "productivity-factor", "environment"]) expect(ids.filter((x) => x === id), id).toHaveLength(1);
  });

  it("has an intro for Infrastructure and mentions current state and scorecard on the ROI page", () => {
    expect(INTROS["/infrastructure"]).toBeTruthy();
    expect(INTROS["/roi"]).toMatch(/Current state/);
    expect(INTROS["/roi"]).toMatch(/Scorecard/);
    expect(INTROS["/tokens"]).toMatch(/inside the ROI Calculator/);
  });
});
