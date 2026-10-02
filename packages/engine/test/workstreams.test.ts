import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { buildLedger, computeAllocation, devLabByMeter, developerBreakdown, meetingIntelligence, seatEffort, workstreamBreakdown, type Project } from "../src/index.js";

const cat = loadCatalog();
const p = meetingIntelligence;
const L = buildLedger(p, cat);
const B = p.timeline.buildMonths;
const build = (q: Project) => buildLedger(q, cat);
const devlabOf = (q: Project, id: string) => build(q).months.slice(0, B).flatMap((m) => m.lines).filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0);

describe("workstreams", () => {
  it("conserves effort: workstream shares plus project-wide equal the people", () => {
    for (let m = 1; m <= B; m++) {
      for (const e of seatEffort(p, m)) {
        expect(Object.values(e.byWorkstream).reduce((s, x) => s + x, 0) + e.projectWide).toBeCloseTo(e.people, 9);
      }
    }
  });

  it("splits labour by allocation without changing the total", () => {
    const flat = structuredClone(p);
    flat.build.team.forEach((t) => delete t.allocations);
    expect(L.totals.buildLabour).toBeCloseTo(build(flat).totals.buildLabour, 6);
    const notes = L.months[0]!.lines.filter((l) => l.stream === "labour" && l.workstreamId === "ws-notes");
    expect(notes.reduce((s, l) => s + l.quantity, 0)).toBeCloseTo(1.5 * 160, 6); // Dev A 100% + Dev C 50%
  });

  it("scales effort-driven activities with the people on the workstream", () => {
    const q = structuredClone(p);
    const it_ = q.build.activities.find((a) => a.id === "iterations")!;
    it_.workstreamId = "ws-shared"; // Dev B 30% + Dev C 30% = 0.6 people
    const notes = devlabOf(p, "iterations"); // 1.5 people
    expect(devlabOf(q, "iterations")).toBeCloseTo((notes * 0.6) / 1.5, 6);
    delete it_.workstreamId; // project-wide: all 3 experimenting developers
    expect(devlabOf(q, "iterations")).toBeCloseTo((notes * 3) / 1.5, 6);
  });

  it("runs artefact-driven activities once per workstream, however many people", () => {
    const q = structuredClone(p);
    q.build.team.find((t) => t.name === "Dev C")!.allocations = [{ workstreamId: "ws-notes", share: 1 }];
    expect(devlabOf(q, "regression")).toBeCloseTo(devlabOf(p, "regression"), 6);
  });

  it("skips evaluation for workstreams marked not evaluated", () => {
    const q = structuredClone(p);
    q.build.workstreams.find((w) => w.id === "ws-notes")!.evaluated = false;
    expect(devlabOf(q, "evaluation")).toBeLessThan(devlabOf(p, "evaluation"));
    q.build.activities = q.build.activities.filter((a) => a.kind !== "evaluation");
    expect(devlabOf(q, "evaluation")).toBe(0);
  });

  it("lets a workstream have its own evaluation, which the project-wide one then leaves alone", () => {
    const q = structuredClone(p);
    const ev = q.build.activities.find((a) => a.kind === "evaluation")!;
    q.build.activities.push({ ...structuredClone(ev), id: "eval-notes", workstreamId: "ws-notes" });
    const both = devlabOf(q, "evaluation") + devlabOf(q, "eval-notes");
    expect(both).toBeCloseTo(devlabOf(p, "evaluation"), 6);
    expect(devlabOf(q, "eval-notes")).toBeGreaterThan(0);
  });

  it("makes labour and maintenance optional", () => {
    const q = structuredClone(p);
    q.build.includeLabour = false;
    q.maintenance = { mode: "none" };
    const Lq = build(q);
    expect(Lq.totals.buildLabour).toBe(0);
    expect(Lq.totals.maintRate).toBe(0);
    expect(Lq.totals.devLab).toBeCloseTo(L.totals.devLab, 6);
  });

  it("breaks the build down by workstream and by developer, reconciling to the totals", () => {
    const ws = workstreamBreakdown(p, L);
    expect(ws.reduce((s, r) => s + r.total, 0)).toBeCloseTo(L.totals.build, 4);
    expect(ws.at(-1)!.label).toBe("Project-wide");
    expect(ws.find((r) => r.id === "ws-shared")!.people).toBeCloseTo(0.6, 9);
    const dev = developerBreakdown(p, L);
    expect(dev.rows.reduce((s, r) => s + r.devlab, 0) + dev.unattributed).toBeCloseTo(L.totals.devLab, 4);
    expect(dev.rows.reduce((s, r) => s + r.labour, 0)).toBeCloseTo(L.totals.buildLabour, 4);
    const a = dev.rows.find((r) => r.label.startsWith("Dev A"))!, b = dev.rows.find((r) => r.label.startsWith("Dev B"))!;
    expect(a.devlab).toBeGreaterThan(b.devlab); // Dev A carries the follow-up agent's iterations and regression
    expect(devLabByMeter(L, B).reduce((s, r) => s + r.cost, 0)).toBeCloseTo(L.totals.devLab, 4);
  });

  it("flags months above the per-person Dev Lab budget", () => {
    const q = structuredClone(p);
    q.build.devBudgetPerMonth = 1;
    const rows = developerBreakdown(q, build(q)).rows.filter((r) => r.devlab > 0);
    expect(rows.every((r) => r.overBudget.length > 0)).toBe(true);
    q.build.devBudgetPerMonth = 1e9;
    expect(developerBreakdown(q, build(q)).rows.every((r) => r.overBudget.length === 0)).toBe(true);
  });

  it("carries linked workstreams' build cost into capability ROI as direct cost", () => {
    const al = computeAllocation(p, L, "full");
    const unlinked = structuredClone(p);
    unlinked.benefits.capabilities.forEach((c) => (c.componentIds = c.componentIds.filter((id) => !id.startsWith("ws-"))));
    const al0 = computeAllocation(unlinked, build(unlinked), "full");
    const ask = al.capabilities.find((c) => c.id === "ask")!, ask0 = al0.capabilities.find((c) => c.id === "ask")!;
    expect(ask.direct).toBeGreaterThan(ask0.direct);
    expect(al.sharedPool).toBeLessThan(al0.sharedPool);
    const total = (x: typeof al) => x.capabilities.reduce((s, c) => s + c.cost, 0) + x.unallocated.cost;
    expect(total(al)).toBeCloseTo(total(al0), 4);
  });
});

describe("workstream editing", () => {
  it("removes a workstream with all its references", async () => {
    const { removeWorkstream, setAllocation, ProjectSchema } = await import("../src/index.js");
    const q = structuredClone(p);
    removeWorkstream(q, "ws-notes");
    expect(q.build.activities.some((a) => a.workstreamId === "ws-notes")).toBe(false);
    expect(q.build.team.some((t) => t.allocations?.some((a) => a.workstreamId === "ws-notes"))).toBe(false);
    expect(q.benefits.capabilities.some((c) => c.componentIds.includes("ws-notes"))).toBe(false);
    expect(ProjectSchema.safeParse(q).success).toBe(true);
    setAllocation(q, 3, "ws-ask", 0.5);
    setAllocation(q, 3, "ws-ask", 0);
    expect(q.build.team[3]!.allocations).toEqual([{ workstreamId: "ws-shared", share: 0.3 }]);
  });
});
