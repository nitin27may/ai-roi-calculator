/**
 * The picture placed on the Excel Summary sheet. exceljs cannot write native Excel charts, so the
 * workbook carries a PNG of the monthly cost and benefit chart. The numbers behind it are in the
 * Months sheet, so the picture is a convenience, not the only copy.
 */

export interface ChartMonth { build: number; devlab: number; run: number; platform: number; maint: number; benefit: number }

export const CHART_SERIES = [
  { key: "build", label: "Build labour", color: "#b84a1a" },
  { key: "devlab", label: "Engineering tools & lab", color: "#ee6c34" },
  { key: "run", label: "Production usage", color: "#1fae7e" },
  { key: "platform", label: "Platform", color: "#4b6672" },
  { key: "maint", label: "Maintenance and transition", color: "#8a6538" },
] as const;

/** The slice of the canvas 2D API the drawing needs, so it can be tested with a recorder. */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  setLineDash(d: number[]): void;
}

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export const axisLabel = (v: number): string => (v >= 1000 ? `C$${Math.round(v / 1000)}k` : `C$${Math.round(v)}`);

export const CHART_W = 1440;
export const CHART_H = 640;

/** Draws the chart at CHART_W x CHART_H pixels (shown at half size, so text stays sharp). */
export function drawMonthlyChart(ctx: Ctx2D, months: ChartMonth[]): void {
  const W = CHART_W, H = CHART_H, L = 120, R = 30, T = 110, B = 60;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "left";
  ctx.fillStyle = "#14231f";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("Cost and benefit by month", L, 44);
  // legend
  ctx.font = "22px sans-serif";
  let lx = L;
  const legend = [...CHART_SERIES.map((s) => ({ label: s.label, color: s.color, line: false })), { label: "Benefit", color: "#14231f", line: true }];
  for (const item of legend) {
    ctx.fillStyle = item.color;
    if (item.line) ctx.fillRect(lx, 82, 22, 4); else ctx.fillRect(lx, 72, 18, 18);
    ctx.fillStyle = "#4a5b56";
    ctx.fillText(item.label, lx + 28, 90);
    lx += 28 + item.label.length * 11 + 22;
  }
  const totals = months.map((m) => CHART_SERIES.reduce((s, x) => s + m[x.key], 0));
  const max = niceMax(Math.max(0, ...totals, ...months.map((m) => m.benefit)));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const bw = (W - L - R) / Math.max(1, months.length);
  ctx.textAlign = "right";
  ctx.font = "22px sans-serif";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    ctx.strokeStyle = "#dfe6e3";
    ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W - R, y(v)); ctx.stroke();
    ctx.fillStyle = "#4a5b56";
    ctx.fillText(axisLabel(v), L - 12, y(v) + 8);
  }
  const every = Math.max(1, Math.ceil(months.length / 18));
  months.forEach((m, i) => {
    const w = Math.max(3, bw * 0.7), x = L + i * bw + (bw - w) / 2;
    let acc = 0;
    for (const s of CHART_SERIES) {
      const v = m[s.key];
      if (v <= 0) continue;
      ctx.fillStyle = s.color;
      ctx.fillRect(x, y(acc + v), w, y(acc) - y(acc + v));
      acc += v;
    }
    if (i % every === 0) { ctx.textAlign = "center"; ctx.fillStyle = "#4a5b56"; ctx.fillText(`M${i + 1}`, x + w / 2, H - 20); }
  });
  ctx.strokeStyle = "#14231f";
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  months.forEach((m, i) => { const px = L + i * bw + bw / 2; if (i === 0) ctx.moveTo(px, y(m.benefit)); else ctx.lineTo(px, y(m.benefit)); });
  ctx.stroke();
  ctx.setLineDash([]);
}

/** PNG bytes of the chart, or null when there is no canvas (tests, very old browsers). */
export async function renderMonthlyChartPng(months: ChartMonth[]): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || !months.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = CHART_W;
  canvas.height = CHART_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawMonthlyChart(ctx as unknown as Ctx2D, months);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
