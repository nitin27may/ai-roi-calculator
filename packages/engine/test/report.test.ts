import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
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
  it("appends credit columns after the existing line-item columns, filled only for Snowflake lines", () => {
    const sf = structuredClone(p);
    sf.workloads.push({ kind: "snowflakeFunction", id: "sfq", label: "Cortex", functionId: "sf-ai-classify", rowsPerMonth: 100000, tokensPerRow: 300, hiddenPromptTokens: 100, outputTokensPerRow: 20, warehouse: { size: "s", hoursPerMonth: 10 } } as never);
    const rows = lineItemRows(buildLedger(sf, cat));
    const cols = Object.keys(rows[0]!);
    expect(cols.slice(-5)).toEqual(["Formula", "Credit type", "Credits", "CAD per credit", "Credit rate"]);
    const snow = rows.filter((r) => String(r.Component) === "sfq");
    expect(snow.length).toBeGreaterThan(0);
    expect(snow.every((r) => typeof r.Credits === "number" && (r["CAD per credit"] as number) > 0 && r["Credit rate"] === "catalogue")).toBe(true);
    expect(rows.filter((r) => String(r.Component) !== "sfq" && r.Credits !== "").every((r) => String(r.Meter).startsWith("sf"))).toBe(true);
  });
  it("month rows end at the cumulative net", () => {
    expect(monthRows(L, R).at(-1)!["Cumulative net"]).toBeCloseTo(R.totalBenefit - R.totalCost, 0);
  });
  it("summary and prices used are populated", () => {
    expect(summaryRows(p, L, R, cat).find((r) => String(r.Item).startsWith("Payback month"))!.Value).toBe(R.paybackMonth!);
    const prices = pricesUsedRows(L, cat);
    expect(prices.some((r) => r.Id === "gpt-5.4")).toBe(true);
    expect(prices.every((r) => r.Confidence)).toBe(true);
  });
  it("escapes CSV fields", () => {
    expect(toCsv([{ a: 'x, "y"', b: 1 }])).toBe('a,b\n"x, ""y""",1');
  });
});
