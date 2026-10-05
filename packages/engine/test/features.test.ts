import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import {
  PROJECT_TEMPLATES, ProjectSchema, agentAddedFor, blankProject, buildLedger, computeAllocation, featureBreakdown, featureTotals,
  linkCapabilityToFeature, meetingIntelligence, newActivity, newFeature, newWorkload, projectIssues, removeFeature, removeWorkload,
  steadyState, type Project,
} from "../src/index.js";

const cat = loadCatalog();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const blank = () => ProjectSchema.parse(blankProject("T", "2026-01-01"));
const fixedWorkload = (p: Project, items: unknown[]) => {
  const w = { ...newWorkload(p, "fixed"), id: "fx", items } as Project["workloads"][number];
  p.workloads.push(w);
  return w;
};
const runCost = (L: ReturnType<typeof buildLedger>, m: number) => L.months[m - 1]!.byStream.run + L.months[m - 1]!.byStream.platform;

describe("no silent agent", () => {
  it("adding a workload or activity that needs no agent leaves the harness list empty", () => {
    const p = blank();
    for (const k of ["playground", "tooling", "evaluation", "redteam"] as const) p.build.activities.push(newActivity(p, k));
    for (const k of ["transcription", "documents", "llm", "embeddings"] as const) p.workloads.push(newWorkload(p, k));
    expect(p.harnesses).toHaveLength(0);
    expect(agentAddedFor(p, "tooling")).toBe(false);
    expect(agentAddedFor(p, "agent")).toBe(true);
    expect(agentAddedFor(p, "bakeoff")).toBe(true);
  });

  it("an agent workload adds the default agent, and only then", () => {
    const p = blank();
    p.workloads.push(newWorkload(p, "agent"));
    expect(p.harnesses).toHaveLength(1);
    expect(agentAddedFor(p, "agent")).toBe(false);
  });

  it("evaluation scores only the activities the project has", () => {
    const p = blank();
    const lone = newActivity(p, "evaluation");
    expect(lone.kind === "evaluation" && lone.scoredShare).toEqual({ bakeoff: 0, iterations: 0, regression: 0 });
    p.build.activities.push(newActivity(p, "bakeoff"));
    const withBake = newActivity(p, "evaluation");
    expect(withBake.kind === "evaluation" && withBake.scoredShare.bakeoff).toBe(1);
    expect(withBake.kind === "evaluation" && withBake.scoredShare.iterations).toBe(0);
  });
});

describe("per-workload timing", () => {
  const withTranscription = (patch: Record<string, unknown>) => {
    const p = blank();
    p.workloads.push({ ...newWorkload(p, "transcription"), id: "stt", hoursPerMonth: 1000, ...patch } as Project["workloads"][number]);
    return p;
  };
  const B = 4;

  it("with no timing fields it follows the project's ramp from go-live", () => {
    const L = buildLedger(withTranscription({}), cat);
    expect(runCost(L, B)).toBe(0);
    expect(runCost(L, B + 1)).toBeGreaterThan(0);
    expect(runCost(L, B + 1)).toBeLessThan(runCost(L, B + 6));
  });

  it("startMonth delays billing and endMonth stops it", () => {
    const L = buildLedger(withTranscription({ startMonth: 9, endMonth: 12, rampMonths: 0 }), cat);
    expect(runCost(L, 8)).toBe(0);
    expect(runCost(L, 9)).toBeGreaterThan(0);
    expect(runCost(L, 12)).toBeGreaterThan(0);
    expect(runCost(L, 13)).toBe(0);
    expect(runCost(L, 12)).toBeCloseTo(runCost(L, 9), 6);
  });

  it("its own ramp overrides the project's", () => {
    const fast = buildLedger(withTranscription({ rampMonths: 0 }), cat);
    const slow = buildLedger(withTranscription({ rampMonths: 12 }), cat);
    expect(runCost(fast, B + 1)).toBeGreaterThan(runCost(slow, B + 1));
    expect(runCost(fast, B + 20)).toBeCloseTo(runCost(slow, B + 20), 6);
  });

  it("a start month before go-live counts as go-live", () => {
    const early = buildLedger(withTranscription({ startMonth: 1 }), cat);
    const plain = buildLedger(withTranscription({}), cat);
    expect(early.totals.runRate).toBeCloseTo(plain.totals.runRate, 6);
    expect(runCost(early, 1)).toBe(0);
  });

  it("the steady month waits for a late workload to reach full volume", () => {
    const p = withTranscription({});
    p.workloads.push({ ...newWorkload(p, "documents"), id: "docs", pagesPerMonth: 10000, startMonth: 20, rampMonths: 3 } as Project["workloads"][number]);
    const L = buildLedger(p, cat);
    const early = buildLedger(withTranscription({}), cat);
    expect(L.steadyMonth).toBeGreaterThan(early.steadyMonth);
    expect(L.steadyMonth).toBeGreaterThanOrEqual(20 + 3 - 1);
    expect(runCost(L, L.steadyMonth + 1)).toBeCloseTo(runCost(L, L.steadyMonth), 6);
    expect(steadyState(L).m).toBe(L.steadyMonth);
  });
});

describe("one-time volumes", () => {
  const make = (oneTime?: { volume: number; month?: number }) => {
    const p = blank();
    p.workloads.push({ ...newWorkload(p, "documents"), id: "docs", pagesPerMonth: 10000, ...(oneTime ? { oneTime } : {}) } as Project["workloads"][number]);
    return p;
  };

  it("bills the backfill once, in the named month, and leaves the run rate alone", () => {
    const base = buildLedger(make(), cat);
    const L = buildLedger(make({ volume: 500_000, month: 7 }), cat);
    expect(runCost(L, 7)).toBeGreaterThan(runCost(base, 7));
    expect(runCost(L, 8)).toBeCloseTo(runCost(base, 8), 6);
    expect(runCost(L, 6)).toBeCloseTo(runCost(base, 6), 6);
    expect(L.totals.runRate).toBeCloseTo(base.totals.runRate, 6);
  });

  it("defaults to the workload's first month", () => {
    const base = buildLedger(make(), cat);
    const L = buildLedger(make({ volume: 500_000 }), cat);
    expect(runCost(L, 5)).toBeGreaterThan(runCost(base, 5));
  });

  it("a bigger one-time volume costs proportionally more", () => {
    const base = buildLedger(make(), cat);
    const a = buildLedger(make({ volume: 100_000, month: 7 }), cat);
    const b = buildLedger(make({ volume: 200_000, month: 7 }), cat);
    expect(runCost(b, 7) - runCost(base, 7)).toBeCloseTo(2 * (runCost(a, 7) - runCost(base, 7)), 4);
  });
});

describe("free-text cash items", () => {
  it("bill a CAD amount a month from go-live with no catalogue price", () => {
    const p = blank();
    fixedWorkload(p, [{ id: "vendor", label: "Vendor support", amountCad: 1500, cadence: "monthly" }]);
    const L = buildLedger(ProjectSchema.parse(p), cat);
    expect(runCost(L, 4)).toBe(0);
    expect(runCost(L, 5)).toBeCloseTo(1500, 6);
    expect(runCost(L, 30)).toBeCloseTo(1500, 6);
    expect(L.totals.runRate).toBeCloseTo(1500, 6);
  });

  it("a one-time item lands once in its month and is not a run rate", () => {
    const p = blank();
    fixedWorkload(p, [{ id: "setup", label: "Set-up fee", amountCad: 8000, cadence: "once", month: 6 }]);
    const L = buildLedger(ProjectSchema.parse(p), cat);
    expect(runCost(L, 5)).toBe(0);
    expect(runCost(L, 6)).toBeCloseTo(8000, 6);
    expect(runCost(L, 7)).toBe(0);
    expect(L.totals.runRate).toBe(0);
  });

  it("existing catalogue items still parse and price", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    const fx = p.workloads.find((w) => w.kind === "fixed")!;
    expect(fx.kind === "fixed" && fx.items.every((i) => "unitPriceId" in i)).toBe(true);
  });
});

describe("contingency scope", () => {
  const make = (scope: "labour" | "all") => {
    const p = blank();
    p.build.activities.push(newActivity(p, "tooling"));
    p.build.contingencyPct = 20;
    p.build.contingencyScope = scope;
    p.build.environment.push({ id: "cash", label: "Dev licence", amountCad: 1000, cadence: "monthly" } as never);
    return p;
  };

  it("labour scope leaves Dev Lab and environment cost alone", () => {
    const none = make("labour");
    none.build.contingencyPct = 0;
    const a = buildLedger(none, cat), b = buildLedger(make("labour"), cat);
    expect(b.totals.devLab).toBeCloseTo(a.totals.devLab, 6);
    expect(b.totals.buildLabour).toBeGreaterThan(a.totals.buildLabour);
  });

  it("all scope adds the percentage to Dev Lab and cash build costs too", () => {
    const labour = buildLedger(make("labour"), cat), all = buildLedger(make("all"), cat);
    expect(all.totals.buildLabour).toBeCloseTo(labour.totals.buildLabour, 6);
    expect(all.totals.devLab).toBeCloseTo(labour.totals.devLab * 1.2, 4);
    expect(all.totals.build).toBeGreaterThan(labour.totals.build);
  });
});

describe("project referential integrity", () => {
  it("accepts the sample and every template", () => {
    expect(projectIssues(ProjectSchema.parse(meetingIntelligence))).toEqual([]);
    for (const t of PROJECT_TEMPLATES) expect(() => ProjectSchema.parse(t.make("x"))).not.toThrow();
  });

  it("rejects unknown feature, workload and workstream ids with a path", () => {
    const p = structuredClone(ProjectSchema.parse(meetingIntelligence));
    p.workloads[0]!.featureId = "nope";
    p.benefits.capabilities[0]!.workloadIds.push("ghost");
    p.benefits.capabilities[0]!.workstreamIds.push("ghost-ws");
    const issues = projectIssues(p);
    expect(issues.map((i) => i.message)).toEqual(expect.arrayContaining(['Unknown feature "nope"', 'Unknown workload "ghost"', 'Unknown workstream "ghost-ws"']));
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });
});

describe("feature helpers", () => {
  it("newFeature gives unique ids and removeFeature leaves owned items shared", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    const f = newFeature(p); p.features.push(f);
    const g = newFeature(p);
    expect(g.id).not.toBe(f.id);
    removeFeature(p, "notes");
    expect(p.features.map((x) => x.id)).not.toContain("notes");
    expect(p.workloads.every((w) => w.featureId !== "notes")).toBe(true);
    expect(projectIssues(p)).toEqual([]);
  });

  it("removing a workload clears it from capability links", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    removeWorkload(p, "stt");
    expect(p.benefits.capabilities.some((c) => c.workloadIds.includes("stt"))).toBe(false);
    expect(projectIssues(p)).toEqual([]);
  });

  it("linkCapabilityToFeature points a capability at what its feature owns", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    linkCapabilityToFeature(p, "ask", "ask");
    const c = p.benefits.capabilities.find((x) => x.id === "ask")!;
    expect(c.workloadIds.sort()).toEqual(["chat", "docs", "embed", "retrieval", "search"]);
    expect(c.workstreamIds).toEqual(["ws-ask"]);
  });
});

describe("featureBreakdown", () => {
  it("rows add up to the ledger's run, build and benefit totals", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    const L = buildLedger(p, cat);
    const rows = featureBreakdown(p, L);
    const t = featureTotals(rows);
    const run = sum(L.months.map((m) => m.byStream.run + m.byStream.platform + m.byStream.maint + m.byStream.transition));
    const build = sum(L.months.map((m) => m.byStream.labour + m.byStream.devlab + m.byStream.devenv));
    expect(t.run).toBeCloseTo(run, 4);
    expect(t.build).toBeCloseTo(build, 4);
    expect(t.benefit).toBeCloseTo(sum(L.months.map((m) => m.benefit)), 4);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(["notes", "ask", ""]));
    expect(rows.at(-1)!.id).toBe("");
    for (const r of rows) expect(r.net).toBeCloseTo(r.benefit - r.run - r.build, 6);
  });

  it("a project with no features puts everything in the shared row", () => {
    const p = blank();
    p.workloads.push(newWorkload(p, "transcription"));
    const rows = featureBreakdown(p, buildLedger(p, cat));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("");
    expect(rows[0]!.workloads).toBe(1);
  });

  it("capability allocation does not depend on which feature owns what", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    const L = buildLedger(p, cat);
    const before = computeAllocation(p, L, "full").capabilities.map((c) => c.cost);
    for (const w of p.workloads) delete w.featureId;
    expect(computeAllocation(p, L, "full").capabilities.map((c) => c.cost)).toEqual(before);
  });
});
