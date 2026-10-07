"use client";
import { lineItemRows, toCsv, type Ledger, type Project, type RoiResult } from "@roi-calculator/engine";
import { catalog } from "./compute";
import { buildWorkbook, chartMonths } from "./workbook";
import { renderMonthlyChartPng } from "./xlsx-chart";

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

/** Downloads the workbook (see buildWorkbook for what is in it). */
export async function exportXlsx(p: Project, ledger: Ledger, roi: RoiResult) {
  const chartPng = await renderMonthlyChartPng(chartMonths(ledger)).catch(() => null);
  const wb = await buildWorkbook(p, ledger, roi, catalog, { chartPng });
  const buf = await wb.xlsx.writeBuffer();
  download(`${slug(p)}.xlsx`, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
