import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.(tsx|css)$/.test(rel) ? [rel] : [];
  });
const files = [...walk("app"), ...walk("components")].map((f) => [f, readFileSync(join(root, f), "utf8")] as const);

describe("minimum text size", () => {
  it("uses no text utility below 12px", () => {
    const bad = files.flatMap(([f, src]) => [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => Number(m[1]) < 12).map((m) => `${f}: ${m[0]}`));
    expect(bad).toEqual([]);
  });
  it("sets no font-size below 12px in CSS or inline styles", () => {
    const bad = files.flatMap(([f, raw]) => {
      const src = f.endsWith("globals.css") ? raw.replace(/@media print[\s\S]*$/, "") : raw;
      return [...src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px|fontSize:\s*(\d+(?:\.\d+)?)|font:\s*(\d+(?:\.\d+)?)px/g)]
        .filter((m) => Number(m[1] ?? m[2] ?? m[3]) < 12).map((m) => `${f}: ${m[0]}`);
    });
    expect(bad).toEqual([]);
  });
});

describe("focus and motion", () => {
  it("removes the focus outline only from containers that take programmatic focus (tabIndex -1)", () => {
    const bad = files.flatMap(([f, src]) => [...src.matchAll(/outline-none|outline:\s*none/g)]
      .filter((m) => !/tabIndex=\{-1\}/.test(src.slice(Math.max(0, m.index! - 300), m.index! + 100))).map(() => f));
    expect(bad).toEqual([]);
  });
  it("keeps the global focus-visible ring and the reduced-motion rule", () => {
    const css = readFileSync(join(root, "app/globals.css"), "utf8");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
