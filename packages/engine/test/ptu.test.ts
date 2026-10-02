import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { buildLedger, meetingIntelligence as p, ptuAnalysis, sizePtu } from "../src/index.js";

const cat = loadCatalog();

describe("PTU sizing", () => {
  it("reproduces Microsoft's example: gpt-5.2, 1,000 RPM × (200 in, 20 out) → 110 PTU; 50% cached → 80", () => {
    expect(sizePtu(cat, "gpt-5.2", { input: 200_000, cachedInput: 0, output: 20_000 }, "global")!.ptus).toBe(110);
    expect(sizePtu(cat, "gpt-5.2", { input: 100_000, cachedInput: 100_000, output: 20_000 }, "global")!.ptus).toBe(80);
  });
  it("never goes below the deployment minimum", () => {
    expect(sizePtu(cat, "gpt-5.4", { input: 10, cachedInput: 0, output: 1 }, "global")!.ptus).toBe(15);
    expect(sizePtu(cat, "gpt-5.4", { input: 10, cachedInput: 0, output: 1 }, "regional")!.ptus).toBe(50);
  });
  it("break-even utilization for a monthly reservation is about 100% (Microsoft prices PTU ≈ PAYG at full use)", () => {
    const L = buildLedger(p, cat);
    const a = ptuAnalysis(p, L, cat, { peakToAverage: 3, deployment: "global" });
    const g = a.rows.find((r) => r.modelId === "gpt-5.4")!;
    expect(g.breakEvenMonthly).toBeGreaterThan(0.9);
    expect(g.breakEvenMonthly).toBeLessThan(1.3);
    expect(g.breakEvenYearly).toBeLessThan(g.breakEvenMonthly);
    expect(g.utilization).toBeLessThan(1);
  });
  it("aggregates token volumes per model from production lines", () => {
    const L = buildLedger(p, cat);
    const a = ptuAnalysis(p, L, cat, { peakToAverage: 3, deployment: "global" });
    expect(a.rows.map((r) => r.modelId).sort()).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(a.rows.every((r) => r.monthlyTokens.input > 0 && r.payg > 0)).toBe(true);
  });
});
