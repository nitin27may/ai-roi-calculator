import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { blankProject, buildLedger, developerBreakdown, newActivity, seatEffort, workstreamBreakdown, type Project } from "../src/index.js";

const cat = loadCatalog();

/**
 * A realistic team: features A (intake agent) and B (summary agent), plus shared retrieval C.
 * Dev 1 is on A all build. Dev 2 starts on A, moves to B from month 4. Dev 3 splits B and C.
 */
function team(): Project {
  const p = blankProject("Scenario", "2026-11-01");
  p.timeline.buildMonths = 6;
  p.build.team = [
    { roleId: "dev", name: "Dev 1", people: 1, hoursPerMonth: 160, experiments: true, allocations: [{ workstreamId: "A", share: 1 }] },
    { roleId: "dev", name: "Dev 2", people: 1, hoursPerMonth: 160, experiments: true, allocations: [{ workstreamId: "A", share: 1, toMonth: 3 }, { workstreamId: "B", share: 1, fromMonth: 4 }] },
    { roleId: "dev", name: "Dev 3", people: 1, hoursPerMonth: 160, experiments: true, allocations: [{ workstreamId: "B", share: 0.6 }, { workstreamId: "C", share: 0.4 }] },
  ];
  p.build.workstreams = [
    { id: "A", label: "Intake agent", harnessIds: [], evaluated: true },
    { id: "B", label: "Summary agent", harnessIds: [], evaluated: true },
    { id: "C", label: "Shared retrieval", harnessIds: [], evaluated: false },
  ];
  for (const ws of ["A", "B", "C"]) {
    const it = newActivity(p, "iterations");
    it.workstreamId = ws; it.label = `Iterations ${ws}`;
    p.build.activities.push(it);
  }
  const reg = newActivity(p, "regression");
  if (reg.kind === "regression") { reg.workstreamId = "C"; reg.fromMonth = 1; }
  p.build.activities.push(reg);
  return p;
}
const cost = (p: Project, m: number, id: string) => buildLedger(p, cat).months[m - 1]!.lines.filter((l) => l.componentId === id).reduce((s, l) => s + l.cost, 0);

describe("developer moves between features mid-build", () => {
  const p = team();
  it("effort follows the move: A has 2 people in months 1–3, 1 from month 4; B gains Dev 2", () => {
    const eff = (m: number, ws: string) => seatEffort(p, m).reduce((s, e) => s + (e.byWorkstream[ws] ?? 0), 0);
    expect(eff(3, "A")).toBe(2);
    expect(eff(4, "A")).toBe(1);
    expect(eff(3, "B")).toBeCloseTo(0.6, 9);
    expect(eff(4, "B")).toBeCloseTo(1.6, 9);
    expect(eff(5, "C")).toBeCloseTo(0.4, 9);
  });
  it("iteration cost moves with the people", () => {
    const itA = p.build.activities.find((a) => a.label === "Iterations A")!.id;
    const itB = p.build.activities.find((a) => a.label === "Iterations B")!.id;
    expect(cost(p, 4, itA)).toBeCloseTo(cost(p, 3, itA) / 2, 6);
    expect(cost(p, 4, itB)).toBeCloseTo((cost(p, 3, itB) * 1.6) / 0.6, 6);
  });
  it("labour follows the move and still totals 3 people", () => {
    const L = buildLedger(p, cat);
    const ws = (m: number, id: string) => L.months[m - 1]!.lines.filter((l) => l.stream === "labour" && l.workstreamId === id).reduce((s, l) => s + l.quantity, 0);
    expect(ws(3, "A")).toBe(320);
    expect(ws(4, "A")).toBe(160);
    expect(ws(4, "B")).toBeCloseTo(256, 6);
    for (let m = 1; m <= 6; m++) expect(L.months[m - 1]!.lines.filter((l) => l.stream === "labour").reduce((s, l) => s + l.quantity, 0)).toBeCloseTo(480, 6);
  });
  it("the shared component's regression runs once and is charged only to the people on it", () => {
    const L = buildLedger(p, cat);
    const reg = p.build.activities.find((a) => a.kind === "regression")!.id;
    const d = developerBreakdown(p, L);
    const regTotal = L.months.slice(0, 6).flatMap((m) => m.lines).filter((l) => l.componentId === reg).reduce((s, l) => s + l.cost, 0);
    expect(regTotal).toBeGreaterThan(0);
    // Only Dev 3 is on C, so Dev 1 and Dev 2 carry none of it; nothing is unattributed.
    expect(d.unattributed).toBeCloseTo(0, 6);
    const dev1 = d.rows.find((r) => r.label.startsWith("Dev 1"))!;
    const itA = p.build.activities.find((a) => a.label === "Iterations A")!.id;
    const itATotal = L.months.slice(0, 6).flatMap((m) => m.lines).filter((l) => l.componentId === itA).reduce((s, l) => s + l.cost, 0);
    // Dev 1 carries iterations A only: all of it while alone (M4–6), half while shared with Dev 2 (M1–3).
    expect(dev1.devlab).toBeCloseTo(cost(p, 1, itA) * 0.5 * 3 + cost(p, 4, itA) * 3, 4);
    expect(dev1.devlab).toBeLessThan(itATotal);
  });
  it("workstream totals reconcile with the build total", () => {
    const L = buildLedger(p, cat);
    expect(workstreamBreakdown(p, L).reduce((s, r) => s + r.total, 0)).toBeCloseTo(L.totals.build, 4);
  });
});

describe("edge cases", () => {
  it("over-allocation (140%) is scaled to 100%, not double-billed", () => {
    const p = team();
    p.build.team[2]!.allocations = [{ workstreamId: "B", share: 1 }, { workstreamId: "C", share: 0.4 }];
    const e = seatEffort(p, 1)[2]!;
    expect(e.byWorkstream.B! + e.byWorkstream.C!).toBeCloseTo(1, 9);
    expect(e.projectWide).toBe(0);
    const L = buildLedger(p, cat);
    expect(L.months[0]!.lines.filter((l) => l.stream === "labour" && l.seat === 2).reduce((s, l) => s + l.quantity, 0)).toBeCloseTo(160, 6);
  });
  it("a developer who leaves mid-build stops driving iterations and labour", () => {
    const p = team();
    p.build.team[0]!.toMonth = 2;
    const itA = p.build.activities.find((a) => a.label === "Iterations A")!.id;
    expect(cost(p, 2, itA)).toBeCloseTo(cost(team(), 2, itA), 6);
    expect(cost(p, 4, itA)).toBe(0); // Dev 1 gone and Dev 2 has moved to B
    expect(buildLedger(p, cat).months[3]!.lines.filter((l) => l.stream === "labour" && l.seat === 0)).toHaveLength(0);
  });
  it("a workstream with nobody on it in a month shows its artefact cost as unattributed, not lost", () => {
    const p = team();
    p.build.team[2]!.allocations = [{ workstreamId: "B", share: 1 }]; // nobody on C now
    const L = buildLedger(p, cat);
    const d = developerBreakdown(p, L);
    expect(d.unattributed).toBeGreaterThan(0);
    expect(d.rows.reduce((s, r) => s + r.devlab, 0) + d.unattributed).toBeCloseTo(L.totals.devLab, 4);
  });
  it("a part-time developer (0.5 people) counts as half an experimenter", () => {
    const p = team();
    p.build.team[0]!.people = 0.5;
    const eff = seatEffort(p, 5).reduce((s, e) => s + (e.byWorkstream.A ?? 0), 0);
    expect(eff).toBe(0.5);
  });
});

describe("allocation editing", () => {
  it("keeps the month window when the share changes, and sets windows", async () => {
    const { setAllocation, setAllocationWindow } = await import("../src/index.js");
    const p = team();
    setAllocation(p, 1, "B", 0.5);
    expect(p.build.team[1]!.allocations!.find((a) => a.workstreamId === "B")).toEqual({ workstreamId: "B", share: 0.5, fromMonth: 4 });
    setAllocationWindow(p, 1, "B", 2, 6);
    expect(p.build.team[1]!.allocations!.find((a) => a.workstreamId === "B")).toEqual({ workstreamId: "B", share: 0.5, fromMonth: 2 });
  });
});

describe("peak allocation", () => {
  it("counts shares month by month, not all windows at once", async () => {
    const { peakAllocation } = await import("../src/index.js");
    const p = team();
    expect(peakAllocation(p, 1)).toBe(1); // Dev 2: A 100% M1–3, then B 100% M4–6
    p.build.team[1]!.allocations!.push({ workstreamId: "C", share: 0.3, fromMonth: 5 });
    expect(peakAllocation(p, 1)).toBeCloseTo(1.3, 9);
  });
});
