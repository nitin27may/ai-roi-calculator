import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { buildLedger, capabilityFromBenchmark, capabilityHours, ensureBenchmarkRole, meetingIntelligence, ProjectSchema, type Project } from "../src/index.js";

const cat = loadCatalog();
const lib = cat.benchmarks;
const withPreset = (preset: Project["roi"]["benefitPreset"]) => ({ ...structuredClone(meetingIntelligence), roi: { ...meetingIntelligence.roi, benefitPreset: preset } });

describe("benchmark library", () => {
  it("has the workgraph capabilities and presets", () => {
    expect(lib.capabilities.length).toBeGreaterThanOrEqual(12);
    expect(lib.presets.typical).toMatchObject({ adoptionPct: 40, realisationPct: 40 });
  });

  it("lists benchmarks whose minute savings exceed their baseline (the engine caps these)", () => {
    const over = lib.capabilities.filter((b) => b.unit === "minutes" && b.baselineMinutes > 0 && Object.values(b.savings).some((v) => v > b.baselineMinutes)).map((b) => b.id);
    expect(over).toEqual(["meeting_prep"]);
  });
});

describe("capability hours", () => {
  it("per task: users × adoption × tasks × days × minutes, then realisation", () => {
    const p = withPreset("typical");
    const h = capabilityHours(p, p.benefits.capabilities.find((c) => c.id === "notes")!, lib);
    expect(h.gross).toBeCloseTo((800 * 0.4 * 0.5 * 21 * 17) / 60, 6);
    expect(h.net).toBeCloseTo(h.gross * 0.4, 6);
  });

  it("caps a saving at the baseline", () => {
    const p = withPreset("optimistic");
    const h = capabilityHours(p, p.benefits.capabilities.find((c) => c.id === "notes")!, lib);
    expect(h.minutesSaved).toBe(30);
    expect(h.formula).toContain("capped");
  });

  it("per user-week: removes what an existing licence already delivers", () => {
    const p = withPreset("typical");
    const c = capabilityFromBenchmark(p, "kb_ask", lib, 1000);
    const base = capabilityHours(p, c, lib).gross;
    expect(base).toBeCloseTo((1000 * 0.4 * 90 * (52 / 12)) / 60, 6);
    p.roi.licensedPct = 50; // half the users already have the overlapping licence; kb_ask overlaps 50%
    expect(capabilityHours(p, c, lib).gross).toBeCloseTo(base * 0.75, 6);
  });

  it("per volume: ignores adoption; percent savings apply to the baseline", () => {
    const p = withPreset("typical");
    const c = { ...capabilityFromBenchmark(p, "devops", lib), driver: "perVolume" as const, itemsPerMonth: 600, handledPct: 50 };
    const h = capabilityHours(p, c, lib);
    expect(h.adoptionPct).toBe(100);
    expect(h.gross).toBeCloseTo((300 * 25 * 0.3) / 60, 6);
  });

  it("uses capability overrides before project overrides before the preset", () => {
    const p = withPreset("typical");
    const c = p.benefits.capabilities.find((x) => x.id === "notes")!;
    p.roi.realisationPct = 50;
    expect(capabilityHours(p, c, lib).realisationPct).toBe(50);
    c.realisationPct = 80;
    expect(capabilityHours(p, c, lib).realisationPct).toBe(80);
  });

  it("leaves hours-mode capabilities alone whatever the preset", () => {
    for (const preset of ["conservative", "typical", "optimistic"] as const) {
      const p = withPreset(preset);
      expect(capabilityHours(p, p.benefits.capabilities.find((c) => c.id === "ask")!, lib).net).toBe(140);
    }
  });

  it("ramps a late capability from its own go-live", () => {
    const p = withPreset("typical");
    const B = p.timeline.buildMonths;
    p.benefits.capabilities.find((c) => c.id === "notes")!.liveFromMonth = B + 7;
    const L = buildLedger(p, cat);
    expect(L.months[B + 5]!.benefitBy.capabilities.notes).toBe(0);
    expect(L.months[B + 6]!.benefitBy.capabilities.notes).toBeGreaterThan(0);
    expect(L.months[B + 6]!.benefitBy.capabilities.ask).toBeGreaterThan(L.months[B + 6]!.benefitBy.capabilities.notes! / 100);
  });

  it("builds a valid capability from a benchmark and adds its role", () => {
    const p = structuredClone(meetingIntelligence);
    const c = capabilityFromBenchmark(p, "ba_buddy", lib);
    ensureBenchmarkRole(p, c.roleId, lib);
    p.benefits.capabilities.push(c);
    expect(p.rateCard.some((r) => r.id === "ba")).toBe(true);
    expect(ProjectSchema.safeParse(p).success).toBe(true);
    expect(capabilityHours(p, c, lib).net).toBeGreaterThan(0);
  });
});

describe("avoided headcount", () => {
  it("values FTE at the role's rate and escalates it; fixed amounts stay flat", () => {
    const p = structuredClone(meetingIntelligence);
    const B = p.timeline.buildMonths;
    p.benefits.avoidedCosts = [{ id: "hc", label: "Analyst not hired", monthly: 0, fte: 1.5, roleId: "knowledgeWorker", hoursPerMonth: 150, startMonth: B + 1 }];
    const L = buildLedger(p, cat);
    const first = 1.5 * 150 * 62.5;
    expect(L.months[B]!.benefitBy.avoided).toBeCloseTo(first, 6);
    expect(L.months[B + 12]!.benefitBy.avoided).toBeCloseTo(first * 1.02, 6); // 2% escalation in year 2
    expect(L.totals.benefitRate).toBeGreaterThan(first);
    p.benefits.avoidedCosts = [{ id: "lic", label: "Licence", monthly: 4000 }];
    const L2 = buildLedger(p, cat);
    expect(L2.months[B + 12]!.benefitBy.avoided).toBe(4000);
  });
});

describe("before and after", () => {
  it("reconciles: before − after = net monthly benefit − run − maintenance at full rollout", async () => {
    const { beforeAfter } = await import("../src/index.js");
    const p = withPreset("typical");
    const L = buildLedger(p, cat);
    const ba = beforeAfter(p, lib, L.totals);
    const notes = ba.rows.find((r) => r.id === "notes")!;
    expect(notes.baselineHours).toBeCloseTo((800 * 0.5 * 21 * 30) / 60, 6);
    expect(ba.rows.find((r) => r.id === "ask")!.baselineHours).toBeNull();
    expect(ba.before - ba.after).toBeCloseTo(L.totals.benefitRate - L.totals.runRate - L.totals.maintRate, 4);
  });
});
