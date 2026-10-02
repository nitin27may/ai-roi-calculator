export const fmt = (v: number, d = 0) => v.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
export const cad = (v: number, d = 0) => `${v < 0 ? "−" : ""}$${fmt(Math.abs(v), d)}`;
export const kcad = (v: number) => (Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${fmt(Math.abs(v) / 1000)}k` : cad(v));
export const pct = (v: number) => `${fmt(v * 100)}%`;
export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
