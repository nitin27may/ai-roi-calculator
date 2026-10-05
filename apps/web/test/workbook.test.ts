import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { buildLedger, computeRoi, meetingIntelligence, roiOptions } from "@studio/engine";
import { buildWorkbook, chartMonths, rangeTableRows } from "../lib/workbook";
import { CHART_SERIES, axisLabel, drawMonthlyChart, niceMax, type Ctx2D } from "../lib/xlsx-chart";

const catalog = loadCatalog();
const p = meetingIntelligence;
const ledger = buildLedger(p, catalog, "p50");
const roi = computeRoi(ledger, p.roi.basis, p.roi.discountRatePct, roiOptions(p));

// 1x1 PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));

describe("range table", () => {
  it("lists full numbers for the three cases and flags wide ranges", () => {
    const rows = rangeTableRows(p, ledger, roi, catalog);
    const npv = rows.find((r) => String(r.Figure).startsWith("NPV"))!;
    expect(Number(npv.Cautious)).toBeLessThan(Number(npv.Expected));
    expect(Number(npv.Expected)).toBeLessThan(Number(npv.Optimistic));
    expect(npv.Note).toMatch(/Wide range/);
    const build = rows.find((r) => r.Figure === "Build")!;
    expect(build.Cautious).toBe(Math.round(Number(build.Cautious)));
  });
});

describe("workbook", () => {
  it("has the Summary ranges table with data bars and embeds the chart picture", async () => {
    const wb = await buildWorkbook(p, ledger, roi, catalog, { chartPng: PNG });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Months", "Line items", "ROI by capability", "Assumptions", "Prices used"]);
    const ws = wb.getWorksheet("Summary")!;
    expect(ws.getImages()).toHaveLength(1);
    expect(JSON.stringify((ws as unknown as { conditionalFormattings: unknown }).conditionalFormattings)).toContain("dataBar");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(buf.includes("xl/media/image")).toBe(true);
  });

  it("claims no chart when none was drawn", async () => {
    const wb = await buildWorkbook(p, ledger, roi, catalog);
    const ws = wb.getWorksheet("Summary")!;
    expect(ws.getImages()).toHaveLength(0);
    expect(JSON.stringify((ws.model as unknown as { rows: unknown }).rows)).not.toContain("Chart: monthly");
    expect(Buffer.from(await wb.xlsx.writeBuffer()).includes("xl/media/image")).toBe(false);
  });
});

describe("chart drawing", () => {
  it("draws one bar segment per non-zero stream and a benefit line", () => {
    const calls: string[] = [];
    const plain = ["fillStyle", "strokeStyle", "lineWidth", "font", "textAlign"];
    const ctx = new Proxy({} as Ctx2D, {
      get: (_t, k: string) => (plain.includes(k) ? undefined : () => { calls.push(k); }),
      set: () => true,
    });
    const months = chartMonths(ledger);
    drawMonthlyChart(ctx, months);
    const segments = months.reduce((n, m) => n + CHART_SERIES.filter((s) => m[s.key] > 0).length, 0);
    // background, six legend swatches, then the bar segments
    expect(calls.filter((c) => c === "fillRect").length).toBe(1 + 6 + segments);
    expect(calls).toContain("setLineDash");
  });

  it("rounds the axis up to a readable value and labels it in dollars", () => {
    expect(niceMax(73_000)).toBe(100_000);
    expect(niceMax(0)).toBe(1);
    expect(axisLabel(25_000)).toBe("C$25k");
    expect(axisLabel(500)).toBe("C$500");
  });
});
