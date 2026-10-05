import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Computes WCAG contrast ratios for the colour tokens in app/globals.css, in both themes, and fails below the AA thresholds. */
const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

function block(selectorStart: string): string {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error(`no block for ${selectorStart}`);
  const open = css.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    if (css[j] === "}" && --depth === 0) return css.slice(open + 1, j);
  }
  throw new Error("unbalanced braces");
}
const decls = (body: string) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const light = decls(block(":root {"));
const dark = { ...light, ...decls(block(':root[data-theme="dark"]')) };
// The OS-dark rule must carry the same values as the explicit dark theme, or "system" would differ from "dark".
const systemDark = { ...light, ...decls(block(':root:not([data-theme="light"])')) };

const THEMES = { light, dark } as const;
const resolve = (theme: Record<string, string>, token: string, depth = 0): string => {
  const v = theme[`--${token}`];
  if (!v) throw new Error(`token --${token} missing`);
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  return ref && depth < 5 ? resolve(theme, ref[1]!, depth + 1) : v;
};
const rgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

// Foreground token on background token, for text (4.5:1).
const TEXT_PAIRS: [string, string][] = [
  ["ink", "bg"], ["ink", "surface"], ["ink", "surface-2"], ["ink", "accent-soft"],
  ["ink-2", "bg"], ["ink-2", "surface"], ["ink-2", "surface-2"], ["ink-2", "accent-soft"],
  ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"], ["muted", "accent-soft"],
  ["accent", "bg"], ["accent", "surface"], ["accent", "surface-2"],
  ["accent-ink", "accent"],
  ["good", "surface"], ["warn", "surface"], ["crit", "surface"], ["good", "bg"], ["warn", "bg"], ["crit", "bg"],
  ["good", "good-soft"], ["warn", "warn-soft"], ["crit", "crit-soft"],
  ["bg", "ink"],
];
// Chart colours against the panel that carries them (3:1 for graphical objects).
const GRAPHIC = ["build", "build-2", "run", "platform", "maint", "benefit", "risk", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "good"];

describe.each(Object.entries(THEMES))("contrast in the %s theme", (name, theme) => {
  it.each(TEXT_PAIRS)("text %s on %s is at least 4.5:1", (fg, bg) => {
    const r = ratio(resolve(theme, fg), resolve(theme, bg));
    expect(r, `${fg} on ${bg} in ${name}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHIC)("chart colour %s is at least 3:1 on the surface", (token) => {
    const r = ratio(resolve(theme, token), resolve(theme, "surface"));
    expect(r, `${token} on surface in ${name}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(3);
  });
  it("uses no purple hue in any colour token", () => {
    for (const k of Object.keys(theme)) {
      const v = resolve(theme, k.slice(2));
      if (!v.startsWith("#")) continue;
      const [r, g, b] = rgb(v);
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min < 20) continue;
      let h = 0;
      const d = max - min;
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      expect(h < 255 || h > 335, `${k} ${v} has hue ${h.toFixed(0)}`).toBe(true);
    }
  });
});

describe("system dark matches explicit dark", () => {
  it("carries the same token values", () => {
    const d = decls(block(':root[data-theme="dark"]'));
    expect(systemDark).toMatchObject(d);
  });
});
