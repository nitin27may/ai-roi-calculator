import { describe, expect, it } from "vitest";
import { loadCatalog } from "@studio/catalog";
import { buildLedger, computeRoi, lineItemRows, meetingIntelligence as p, monthRows, pricesUsedRows, summaryRows, toCsv } from "../src/index.js";

const cat = loadCatalog();
const L = buildLedger(p, cat);
const R = computeRoi(L, p.roi.basis, p.roi.discountRatePct);

describe("report rows", () => {
  it("line items add up to the ledger", () => {
    const total = lineItemRows(L).reduce((s, r) => s + (r["Cost (CAD)"] as number), 0);
    const ledger = L.months.reduce((s, m) => s + Object.values(m.byStream).reduce((a, b) => a + b, 0), 0);
    expect(total).toBeCloseTo(ledger, -1);
  });
  it("month rows end at the cumulative net", () => {
    expect(monthRows(L, R).at(-1)!["Cumulative net"]).toBeCloseTo(R.totalBenefit - R.totalCost, 0);
  });
  it("summary and prices used are populated", () => {
    expect(summaryRows(p, L, R, cat).find((r) => r.Item.startsWith("Payback month"))!.Value).toBe(R.paybackMonth!);
    const prices = pricesUsedRows(L, cat);
    expect(prices.some((r) => r.Id === "gpt-5.4")).toBe(true);
    expect(prices.every((r) => r.Confidence)).toBe(true);
  });
  it("escapes CSV fields", () => {
    expect(toCsv([{ a: 'x, "y"', b: 1 }])).toBe('a,b\n"x, ""y""",1');
  });
});
