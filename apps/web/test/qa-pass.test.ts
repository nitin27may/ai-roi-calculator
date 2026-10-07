import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Guards for the defects the QA pass found (layout, print and accessibility). They read source, like a11y-source.test.ts. */
const root = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.(tsx|css)$/.test(rel) ? [rel] : [];
  });
const files = [...walk("app"), ...walk("components")].map((f) => [f, readFileSync(join(root, f), "utf8")] as const);
const read = (f: string) => readFileSync(join(root, f), "utf8");
const css = read("app/globals.css");

describe("screen-reader-only content cannot stretch the page", () => {
  it("never puts sr-only on a table (a table ignores the 1px height and made a blank last sheet in print)", () => {
    const bad = files.filter(([, src]) => /<table[^>]*sr-only/.test(src)).map(([f]) => f);
    expect(bad).toEqual([]);
  });
  it("keeps header cells positioned, so a sr-only label inside one cannot escape a scrolling table", () => {
    expect(css).toMatch(/table\.data th\s*\{[^}]*position:\s*relative/);
  });
  it("names every empty table header", () => {
    const bad = files.filter(([, src]) => /<th\s*\/>|<th className="[^"]*"\s*\/>|<th><\/th>/.test(src)).map(([f]) => f);
    expect(bad).toEqual([]);
  });
});

describe("narrow screens", () => {
  it("gives checkboxes and radios a 24px target on touch and small screens", () => {
    expect(css).toMatch(/@media \(pointer: coarse\), \(max-width: 1023px\)\s*\{\s*input\[type="checkbox"\], input\[type="radio"\]\s*\{[^}]*1\.5rem/);
  });
  it("lets a card head's children shrink, so a wide segmented control scrolls or wraps instead of widening the page", () => {
    expect(read("components/ui.tsx")).toMatch(/\[&>\*\]:min-w-0 \[&>\*\]:max-w-full/);
  });
  it("lays the Value and ROI views out as wrapping buttons", () => {
    expect(read("app/roi/page.tsx")).toMatch(/<Seg wrap label="View"/);
  });
  it("stacks the range chart and the sensitivity chart labels above the bars below 640px", () => {
    expect(read("components/charts.tsx")).toMatch(/grid-cols-1[^"]*sm:grid-cols-\[minmax\(100px,150px\)_1fr\]/);
    expect(read("app/roi/page.tsx")).toMatch(/grid-cols-1[^"]*sm:grid-cols-\[minmax\(150px,240px\)_1fr\]/);
  });
});

describe("lists of selectable rows", () => {
  it("are plain groups of toggle buttons, not listboxes (they also hold headings and add menus)", () => {
    const ui = read("components/ui.tsx");
    expect(ui).not.toMatch(/role="option"/);
    expect(ui).toMatch(/data-list-row aria-pressed=/);
    for (const f of ["app/build/page.tsx", "app/run/page.tsx"]) expect(read(f)).not.toMatch(/role="listbox"/);
  });
});

describe("report", () => {
  it("opens with a generic title, not an AI one", () => {
    expect(read("app/report/page.tsx")).toContain(">Cost and ROI estimate<");
    expect(read("app/report/page.tsx")).not.toContain("AI cost and ROI estimate");
  });
  it("lists what the production total holds besides the workloads", () => {
    expect(read("app/report/page.tsx")).toContain("report-other-run");
  });
});
