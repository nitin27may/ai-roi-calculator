/** Plain-language month labelling shared by every table, chart and legend, so "M1" always means the same thing. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mar 2027" for project month `m` (1-based) given the project's first build month (YYYY-MM-DD). */
export function calendarMonth(startDate: string, m: number): string {
  const y = Number(startDate.slice(0, 4)), mo = Number(startDate.slice(5, 7)) - 1;
  const t = y * 12 + mo + (m - 1);
  return `${MONTHS[((t % 12) + 12) % 12]} ${Math.floor(t / 12)}`;
}

/** Tooltip for a month column: what the number means and which calendar month it is. */
export const monthTitle = (startDate: string, m: number, buildMonths: number): string =>
  `Month ${m} (${calendarMonth(startDate, m)}), ${m <= buildMonths ? "a build month" : "a production month"}`;

/** The one legend sentence used wherever a chart or table shortens "month 1" to "M1". */
export function monthLegendText(startDate: string, buildMonths: number, horizonMonths: number): string {
  const build = buildMonths === 1 ? "month 1 is build" : `months 1–${buildMonths} are build`;
  const prod = buildMonths + 1 >= horizonMonths ? `month ${horizonMonths} is production` : `months ${buildMonths + 1}–${horizonMonths} are production`;
  return `M1 = month 1 of the project (${calendarMonth(startDate, 1)}); ${build}, ${prod} (to ${calendarMonth(startDate, horizonMonths)}).`;
}

/** Caption for any table of per-month numbers: what they are, their unit, and how to change them. */
export const MONTH_TABLE_NOTES = {
  intensity: "Intensity by month: 100% (1.0) means the activity runs at the volumes set on it that month, 0.5 means half, 0 means off. You can type a new number in any cell; the figure underneath is the cost it produces.",
  sweeps: "Sweeps by month: how many full passes of the model bake-off run that month. Each sweep tests every candidate model that is active that month. Type a number in any cell to change it.",
  cost: "Cost by month in C$. Each figure is calculated from the activity (volumes, models, intensity), and you can also type a C$ amount in any cell to replace the calculation for that month. A cell you typed carries a dot and the word edited, and hovering it shows the calculated figure. Leave a cell blank, or press Reset, to go back to the calculation. A typed amount is final: contingency and the AI development-cost cut are not added on top. Summary, Report and Excel all use these amounts.",
  headcount: "Rows marked 'scales with people' change when you add or remove developers; the others are fixed amounts that do not.",
} as const;
