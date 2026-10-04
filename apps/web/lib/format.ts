export { cad, kcad, compactCad } from "@studio/engine";

export const fmt = (v: number, d = 0) => v.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v: number) => `${fmt(v * 100)}%`;
export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
