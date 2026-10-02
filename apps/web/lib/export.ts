"use client";
import { avoidedMonthly, capabilityHours, computeAllocation, lineItemRows, monthRows, pricesUsedRows, summaryRows, toCsv, type Ledger, type Project, type RoiResult, type Row } from "@studio/engine";
import { catalog } from "./compute";

const slug = (p: Project) => p.name.replace(/[^\w-]+/g, "-").toLowerCase();

export function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportCsv(p: Project, ledger: Ledger) {
  download(`${slug(p)}-line-items.csv`, toCsv(lineItemRows(ledger)), "text/csv");
}

/** Workbook: Summary, Months, Line items, ROI by capability, Assumptions, Prices used. */
export async function exportXlsx(p: Project, ledger: Ledger, roi: RoiResult) {
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
    for (const c of money) { const col = ws.getColumn(c); col.numFmt = '"$"#,##0.00'; }
    return ws;
  };
  sheet("Summary", summaryRows(p, ledger, roi));
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
    ...p.benefits.capabilities.map((c) => { const h = capabilityHours(p, c, catalog.benchmarks); return { Section: "Time saved", Item: c.label, Value: Math.round(h.net * 10) / 10, Unit: `net hours/month at full rollout: ${h.formula}` }; }),
    ...p.benefits.avoidedCosts.map((c) => ({ Section: "Avoided cost", Item: c.label, Value: Math.round(avoidedMonthly(p, c)), Unit: `${c.fte !== undefined ? `${c.fte} FTE, ` : ""}CAD/month from month ${c.startMonth ?? p.timeline.buildMonths + 1}` })),
    { Section: "ROI", Item: "Benefit preset", Value: p.roi.benefitPreset, Unit: "" },
    { Section: "ROI", Item: "Growth per year", Value: p.roi.growthPctPerYear, Unit: "%" },
    { Section: "ROI", Item: "Rate escalation per year", Value: p.roi.rateEscalationPctPerYear, Unit: "%" },
    { Section: "ROI", Item: "Discount rate", Value: p.roi.discountRatePct, Unit: "%" },
  ]);
  sheet("Prices used", pricesUsedRows(ledger, catalog));
  const buf = await wb.xlsx.writeBuffer();
  download(`${slug(p)}.xlsx`, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
