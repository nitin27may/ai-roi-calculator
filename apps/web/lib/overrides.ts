/** What a cost-grid cell should do with the text typed into it. Empty means "use the calculation". */
export type OverrideInput = { kind: "clear" } | { kind: "set"; value: number } | { kind: "error"; message: string };

const MAX_CAD = 1e9;

export function parseOverrideInput(text: string): OverrideInput {
  const t = text.replace(/[,\s]/g, "").replace(/^C?\$/i, "");
  if (t === "") return { kind: "clear" };
  if (!/^\d+(\.\d+)?$/.test(t)) return { kind: "error", message: "Enter C$ 0 or more, or leave blank." };
  const value = Number(t);
  if (value > MAX_CAD) return { kind: "error", message: "Above C$1 billion, likely a typo." };
  return { kind: "set", value };
}

/** Accessible name of a cost-grid cell, e.g. "AI coding tools, Month 2, C$". */
export const cellLabel = (activity: string, month: number) => `${activity}, Month ${month}, C$`;
