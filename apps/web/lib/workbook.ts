import type { Workbook } from "exceljs";
import { WIDE_RANGE_TEXT, avoidedMonthly, capabilityHours, computeAllocation, irrBand, lineItemRows, moneyBand, monthRows, pricesUsedRows, summarize, summaryRows, type Ledger, type Project, type RoiResult, type Row } from "@studio/engine";
import type { Catalog } from "@studio/catalog";
import type { ChartMonth } from "./xlsx-chart";

const MONEY = '"C$"#,##0.00';

/** Monthly figures for the picture on the Summary sheet. */
export const chartMonths = (ledger: Ledger): ChartMonth[] =>
  ledger.months.map((m) => ({ build: m.byStream.labour, devlab: m.byStream.devlab + m.byStream.devenv, run: m.byStream.run, platform: m.byStream.platform, maint: m.byStream.maint + m.byStream.transition, benefit: m.benefit }));

/** Rows of the "How sure are we" table: full numbers in every case, with a plain note when the range is wide. */
export function rangeTableRows(p: Project, ledger: Ledger, roi: RoiResult, cat: Catalog): Row[] {
  const s = summarize(p, ledger, roi, cat);
  const money = (label: string, r: { low: number; expected: number; high: number }): Row => ({
    Figure: label, Cautious: Math.round(r.low), Expected: Math.round(r.expected), Optimistic: Math.round(r.high), Note: moneyBand(r).wide ? WIDE_RANGE_TEXT : "",
  });
  const rows: Row[] = [
    money("Total cost over the plan", s.range.totalCost),
    money("Build", s.range.build),
    money("Annual run, steady state", s.range.annualRun),
    money("Total benefit over the plan", s.range.totalBenefit),
    money(`NPV at ${s.discountRatePct}%`, s.range.npv),
  ];
  if (s.range.irrPct) {
    const r = s.range.irrPct;
    rows.push({ Figure: "IRR (percent a year)", Cautious: Math.round(r.low * 10) / 10, Expected: Math.round(r.expected * 10) / 10, Optimistic: Math.round(r.high * 10) / 10, Note: irrBand(r).wide ? WIDE_RANGE_TEXT : "" });
  }
  return rows;
}

export interface WorkbookOptions {
  /** PNG of the monthly chart. Omitted when it could not be drawn. */
  chartPng?: Uint8Array | null;
}

/**
 * Workbook: Summary (with a chart picture and a ranges table with data bars), Months, Line items,
 * ROI by capability, Assumptions, Prices used. exceljs has no native charts, so the chart is an
 * embedded picture and the numbers behind it stay in the Months sheet.
 */
export async function buildWorkbook(p: Project, ledger: Ledger, roi: RoiResult, cat: Catalog, opts: WorkbookOptions = {}): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "AI Cost & ROI Studio";
  const sheet = (name: string, rows: Row[], money: string[] = []) => {
    const ws = wb.addWorksheet(name);
    if (!rows.length) return ws;
    const cols = Object.keys(rows[0]!);
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(10, c.length + 2, ...rows.slice(0, 50).map((r) => String(r[c] ?? "").length + 2))) }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const c of money) { const col = ws.getColumn(c); col.numFmt = MONEY; }
    return ws;
  };

  const summary = sheet("Summary", summaryRows(p, ledger, roi, cat));
  const lastRow = summary.rowCount;
  summary.getColumn(2).width = Math.max(summary.getColumn(2).width ?? 10, 18);
  const head = lastRow + 3;
  summary.getCell(head - 1, 1).value = "How sure are we: the three cases, in full numbers";
  summary.getCell(head - 1, 1).font = { bold: true };
  const table = rangeTableRows(p, ledger, roi, cat);
  const cols = ["Figure", "Cautious", "Expected", "Optimistic", "Note"];
  cols.forEach((c, i) => { const cell = summary.getCell(head, i + 1); cell.value = c; cell.font = { bold: true }; });
  table.forEach((r, i) => cols.forEach((c, j) => { summary.getCell(head + 1 + i, j + 1).value = r[c] as string | number; }));
  const first = head + 1, last = head + table.length;
  const irrRow = table.findIndex((r) => String(r.Figure).startsWith("IRR"));
  for (let i = 0; i < table.length; i++) for (const col of [2, 3, 4]) if (i !== irrRow) summary.getCell(first + i, col).numFmt = MONEY;
  summary.getColumn(3).width = Math.max(summary.getColumn(3).width ?? 10, 18);
  summary.getColumn(4).width = Math.max(summary.getColumn(4).width ?? 10, 18);
  summary.getColumn(5).width = 36;
  // Data bars per row group: the money rows share one scale, so a long bar always means a bigger amount.
  const moneyLast = irrRow === -1 ? last : first + irrRow - 1;
  summary.addConditionalFormatting({
    ref: `B${first}:D${moneyLast}`,
    rules: [{ type: "dataBar", priority: 1, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: "num", value: 0 }, { type: "max" }], color: { argb: "FF1F8F6F" } } as never],
  });
  if (irrRow !== -1) {
    summary.addConditionalFormatting({
      ref: `B${first + irrRow}:D${first + irrRow}`,
      rules: [{ type: "dataBar", priority: 2, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: "num", value: 0 }, { type: "max" }], color: { argb: "FF2F6FD0" } } as never],
    });
  }
  if (opts.chartPng) {
    const id = wb.addImage({ buffer: opts.chartPng as unknown as ArrayBuffer, extension: "png" });
    summary.getCell(head + table.length + 2, 1).value = "Chart: monthly cost and benefit (a picture; the numbers are in the Months sheet)";
    summary.getCell(head + table.length + 2, 1).font = { italic: true };
    summary.addImage(id, { tl: { col: 0, row: head + table.length + 2 }, ext: { width: 720, height: 320 } });
  }

  const months = monthRows(ledger, roi);
  sheet("Months", months, Object.keys(months[0] ?? {}).filter((k) => !["Month", "Date", "Phase", "Adoption"].includes(k)));
  sheet("Line items", lineItemRows(ledger), ["Unit price (CAD)", "Cost (CAD)"]);
  const a = computeAllocation(p, ledger, p.roi.basis);
  sheet("ROI by capability", [
    ...a.capabilities.map((c) => ({ Capability: c.label, Benefit: Math.round(c.benefit), "Direct cost": Math.round(c.direct), "Shared cost": Math.round(c.shared), Net: Math.round(c.net), ROI: c.roi === null ? "" : `${Math.round(c.roi * 100)}%` })),
    { Capability: "Project-level benefits (avoided costs, one-offs)", Benefit: Math.round(a.projectBenefit), "Direct cost": "", "Shared cost": "", Net: "", ROI: "" },
    { Capability: "Unallocated cost", Benefit: "", "Direct cost": Math.round(a.unallocated.cost), "Shared cost": "", Net: "", ROI: "" },
  ], ["Benefit", "Direct cost", "Shared cost", "Net"]);
  sheet("Assumptions", [
    ...p.rateCard.map((r) => ({ Section: "Rate card", Item: r.label, Value: r.hourlyRate, Unit: "CAD/hour" })),
    ...p.build.team.map((t) => ({ Section: "Build team", Item: `${t.phase ?? "Build"}: ${p.rateCard.find((r) => r.id === t.roleId)?.label}`, Value: t.people, Unit: `people, months ${t.fromMonth ?? 1}–${t.toMonth ?? p.timeline.buildMonths}` })),
    ...p.benefits.capabilities.map((c) => { const h = capabilityHours(p, c, cat.benchmarks); return { Section: "Time saved", Item: c.label, Value: Math.round(h.net * 10) / 10, Unit: `net hours/month at full rollout: ${h.formula}` }; }),
    ...p.benefits.avoidedCosts.map((c) => ({ Section: "Avoided cost", Item: c.label, Value: Math.round(avoidedMonthly(p, c)), Unit: `${c.fte !== undefined ? `${c.fte} FTE, ` : ""}CAD/month from month ${c.startMonth ?? p.timeline.buildMonths + 1}` })),
    { Section: "ROI", Item: "Benefit preset", Value: p.roi.benefitPreset, Unit: "" },
    { Section: "ROI", Item: "Growth per year", Value: p.roi.growthPctPerYear, Unit: "%" },
    { Section: "ROI", Item: "Rate escalation per year", Value: p.roi.rateEscalationPctPerYear, Unit: "%" },
    { Section: "ROI", Item: "Discount rate", Value: p.roi.discountRatePct, Unit: "%" },
  ]);
  sheet("Prices used", pricesUsedRows(ledger, cat));
  return wb;
}
