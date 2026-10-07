import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, buildLedger, computeRoi, evaluateLevers, meetingIntelligence, LEVERS, sizeSearch, PriceBook } from "../src/index.js";

const cat = loadCatalog();
const p = meetingIntelligence;

describe("sample project", () => {
  it("validates against the project schema", () => {
    expect(ProjectSchema.safeParse(p).success).toBe(true);
  });
});

describe("ledger", () => {
  const L = buildLedger(p, cat);

  it("has build months then production months", () => {
    expect(L.months).toHaveLength(36);
    expect(L.months.filter((m) => m.phase === "build")).toHaveLength(6);
    expect(L.months[6]!.adoption).toBeCloseTo(1 / 6);
    expect(L.months[11]!.adoption).toBe(1);
  });

  it("puts labour and Dev Lab only in build months and run cost only in production", () => {
    for (const m of L.months) {
      if (m.phase === "build") {
        expect(m.byStream.labour).toBeGreaterThan(0);
        expect(m.byStream.devlab).toBeGreaterThan(0);
        expect(m.byStream.run + m.byStream.platform + m.byStream.maint).toBe(0);
      } else {
        expect(m.byStream.labour + m.byStream.devlab).toBe(0);
        expect(m.byStream.run).toBeGreaterThan(0);
      }
    }
  });

  it("prices build labour by delivery phase (Discovery M1, Build M1–6)", () => {
    const m1 = 1 * 160 * 120 + 3 * 160 * 95, later = 3 * 160 * 95 + 0.5 * 160 * 120;
    expect(L.months[0]!.byStream.labour).toBeCloseTo(m1, 6);
    expect(L.totals.buildLabour).toBeCloseTo(m1 + 5 * later, 6);
  });

  it("scales usage lines with adoption but keeps fixed lines whole", () => {
    const ramp = L.months[6]!, full = L.months[20]!;
    const platform = (m: typeof ramp) => m.lines.filter((l) => l.componentId === "platform").reduce((s, l) => s + l.cost, 0);
    expect(platform(ramp)).toBeCloseTo(platform(full), 6);
    expect(ramp.byStream.run).toBeLessThan(full.byStream.run * 0.5);
  });

  it("applies the semantic ranker free allowance once per month", () => {
    const sem = L.months[20]!.lines.find((l) => l.id === "retrieval:semantic")!;
    expect(sem.cost).toBeCloseTo(((sem.quantity - 1) / sem.quantity) * sem.quantity * sem.unitPrice, 6);
  });

  it("flags the MAI-Transcribe-2 promo ending inside the plan", () => {
    expect(L.notes.some((n) => n.kind === "promo-ended" && /MAI-Transcribe-2/.test(n.message))).toBe(true);
  });

  it("sizes AI Search to the cheapest tier that fits 410K × 3072-dim chunks (Basic, 2 partitions)", () => {
    const book = new PriceBook(cat, p.settings);
    const w = p.workloads.find((x) => x.kind === "aiSearch")!;
    const s = sizeSearch(w as Extract<typeof w, { kind: "aiSearch" }>, book);
    expect(s.vectorGB).toBeCloseTo((410000 * 3072 * 4 * 1.01 * 1.1) / 1e9, 6);
    expect(s.tier).toBe("basic");
    expect(s.partitions).toBe(2);
  });
});

describe("ROI", () => {
  const L = buildLedger(p, cat);
  it("costs less on narrower bases and pays back sooner", () => {
    const full = computeRoi(L, "full"), runOnly = computeRoi(L, "run");
    expect(runOnly.totalCost).toBeLessThan(full.totalCost);
    expect(runOnly.paybackMonth ?? 99).toBeLessThan(full.paybackMonth ?? 99);
  });

  it("reconciles cumulative net with totals", () => {
    const r = computeRoi(L, "full");
    expect(r.cumulative.at(-1)).toBeCloseTo(r.totalBenefit - r.totalCost, 6);
    expect(r.byYear.reduce((s, y) => s + y.net, 0)).toBeCloseTo(r.totalBenefit - r.totalCost, 6);
  });

  it("reduces build cost with the development-cost lever", () => {
    const cut = buildLedger({ ...p, roi: { ...p.roi, devCutPct: 25 } }, cat);
    expect(cut.totals.build).toBeCloseTo(L.totals.build * 0.75, 6);
  });
});

describe("levers", () => {
  it("every applicable lever saves money on the full lifecycle", () => {
    const opts = evaluateLevers(p, cat);
    expect(opts.length).toBeGreaterThan(3);
    for (const o of opts) expect(o.saving, o.lever.id).toBeGreaterThan(0);
  });

  it("levers are pure", () => {
    const before = JSON.stringify(p);
    for (const l of LEVERS) l.apply(p, cat);
    expect(JSON.stringify(p)).toBe(before);
  });
});
