import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { addDeliveryCost, addStandardRole, applyStandardPhases, blankProject, buildLedger, computeRoi, roiOptions, setEffort, setEffortMode, setLinePhase, type Project } from "@roi-calculator/engine";
import { HELP } from "../lib/help";
import { GLOSSARY } from "../lib/glossary";
import { buildWorkbook } from "../lib/workbook";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
const { useStudio } = await import("../lib/store");
const catalog = loadCatalog();
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const start = () => {
  mem.clear();
  useStudio.setState({ ...useStudio.getInitialState(), hydrated: false }, true);
  const id = useStudio.getState().create("blank", "Delivery");
  useStudio.getState().open(id);
  return () => useStudio.getState().project;
};

describe("delivery model edits through the store", () => {
  let project: () => Project;
  beforeEach(() => { project = start(); });

  it("a new blank project has no phases, effort or delivery costs", () => {
    const p = project();
    expect(p.timeline.phases).toBeUndefined();
    expect(p.build.deliveryCosts).toBeUndefined();
    expect(p.build.team.every((t) => t.phaseId === undefined && t.effort === undefined)).toBe(true);
  });

  it("Use standard phases fills the timeline; a line takes a phase's months; both survive the schema and a reload", () => {
    const { edit } = useStudio.getState();
    edit((d) => applyStandardPhases(d));
    expect(project().timeline.phases?.map((x) => x.id)).toEqual(["discovery", "design", "build", "test", "migration", "deploy", "hypercare"]);
    edit((d) => setLinePhase(d, 0, "build"));
    const ph = project().timeline.phases!.find((x) => x.id === "build")!;
    expect(project().build.team[0]).toMatchObject({ phaseId: "build", fromMonth: ph.fromMonth, toMonth: ph.toMonth });
    const id = useStudio.getState().activeId;
    useStudio.setState({ hydrated: false });
    useStudio.getState().hydrate();
    useStudio.getState().open(id);
    expect(project().timeline.phases).toHaveLength(7);
    expect(project().build.team[0]!.phaseId).toBe("build");
  });

  it("people x weeks: switching, editing weeks and going back changes the Build total as the formula says", () => {
    const { edit } = useStudio.getState();
    const total = () => buildLedger(project(), catalog).totals.buildLabour;
    const before = total();
    edit((d) => setEffortMode(d, 0, true));
    expect(total()).toBeCloseTo(before, 6);
    const e = project().build.team[0]!.effort!;
    edit((d) => setEffort(d, 0, { weeks: e.weeks * 2 }));
    const seat0 = buildLedger(project(), catalog).months.slice(0, 4).flatMap((m) => m.lines).filter((l) => l.stream === "labour" && l.seat === 0).reduce((a, l) => a + l.cost, 0);
    expect(total()).toBeCloseTo(before + seat0 / 2, 6); // doubling the weeks adds that line's cost once more
    edit((d) => setEffortMode(d, 0, false));
    expect(project().build.team[0]!.effort).toBeUndefined();
  });

  it("delivery costs add to the build total and the Excel month rows, and removal puts the file back", async () => {
    const { edit } = useStudio.getState();
    const build0 = buildLedger(project(), catalog).totals.build;
    let id = "";
    edit((d) => { id = addDeliveryCost(d, "vendor"); });
    edit((d) => { d.build.deliveryCosts![0]!.amountCad = 35_000; });
    const ledger = buildLedger(project(), catalog);
    expect(ledger.totals.build).toBeCloseTo(build0 + 35_000 * (project().build.contingencyScope === "all" ? 1 + project().build.contingencyPct / 100 : 1), 6);
    const roi = computeRoi(ledger, project().roi.basis, project().roi.discountRatePct, roiOptions(project()));
    const wb = await buildWorkbook(project(), ledger, roi, catalog);
    const heads: string[] = [];
    wb.eachSheet((s) => s.getRow(1).eachCell((c) => heads.push(String(c.value))));
    expect(heads).toContain("Delivery costs");
    edit((d) => { d.build.deliveryCosts = d.build.deliveryCosts!.filter((x) => x.id !== id); });
    expect(buildLedger(project(), catalog).totals.build).toBeCloseTo(build0, 6);
  });

  it("adds a standard role to the rate card only when picked", () => {
    const before = project().rateCard.map((r) => r.id);
    expect(before).not.toContain("pm");
    useStudio.getState().edit((d) => { addStandardRole(d, catalog.benchmarks.availableRoles.find((r) => r.id === "pm")!); });
    expect(project().rateCard.map((r) => r.id)).toEqual([...before, "pm"]);
    expect(project().rateCard.find((r) => r.id === "pm")!.hourlyRate).toBe(110);
  });

  it("the blank project builds the same ledger with and without the new empty fields", () => {
    const p = blankProject("x", "2027-01-01");
    const a = buildLedger(p, catalog);
    const b = buildLedger({ ...p, timeline: { ...p.timeline, phases: [] }, build: { ...p.build, deliveryCosts: [] } }, catalog);
    expect(b.totals).toEqual(a.totals);
  });
});

describe("help coverage for the delivery model", () => {
  const files = ["components/delivery-model.tsx", "components/rate-card.tsx", "app/build/page.tsx"];
  it("every HelpTip id used on these screens has a help entry", () => {
    const used = files.flatMap((f) => [...read(f).matchAll(/<HelpTip id="(\w+)"/g)].map((m) => m[1]!));
    for (const id of ["phaseLabel", "phaseFrom", "phaseTo", "teamPhase", "teamEffortMode", "deliveryCostCategory", "deliveryCostAmount", "standardRole"]) expect(used, id).toContain(id);
    expect(used.filter((id) => !(id in HELP))).toEqual([]);
  });
  it("has entries for the effort fields and links only to real glossary terms", () => {
    for (const id of ["effortPeople", "effortWeeks", "effortHoursPerWeek"]) expect(HELP[id as keyof typeof HELP]).toBeTruthy();
    const terms = new Set(GLOSSARY.map((t) => t.id));
    for (const id of ["delivery-phase", "hypercare", "delivery-costs"]) expect(terms.has(id)).toBe(true);
  });
});
