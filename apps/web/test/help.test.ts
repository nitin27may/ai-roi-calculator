import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP } from "../lib/help";
import { GLOSSARY } from "../lib/glossary";
import { INTROS } from "../lib/intros";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
const pages = walk("app");
const ids = new Set(Object.keys(HELP));
const glossaryIds = new Set(GLOSSARY.map((t) => t.id));

describe("field help coverage", () => {
  it("has an entry for every field spec in components/fields.tsx", () => {
    const keys = [...read("components/fields.tsx").matchAll(/\bkey: "(\w+)"/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => !ids.has(k))).toEqual([]);
  });

  it("has an entry for every settings-page field", () => {
    const src = read("app/settings/page.tsx");
    const used = [...src.matchAll(/help="(\w+)"/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(5);
    expect(used.filter((k) => !ids.has(k))).toEqual([]);
  });

  it("never renders a <Field> without a help prop (other than the generic wrapper in fields.tsx)", () => {
    const missing: string[] = [];
    for (const p of pages) {
      const src = read(p);
      for (const m of src.matchAll(/<Field\b([^>]*)>/g)) if (!/\bhelp=/.test(m[1]!)) missing.push(`${p}: ${m[0].slice(0, 80)}`);
    }
    expect(missing).toEqual([]);
  });

  it("only references help ids that exist", () => {
    const bad: string[] = [];
    for (const p of [...pages, "components/ui.tsx", "components/fields.tsx"]) {
      for (const m of read(p).matchAll(/\bhelp(?:=|: )"(\w+)"/g)) if (!ids.has(m[1]!)) bad.push(`${p}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  it("fills every part of every entry and links only to real glossary terms", () => {
    for (const [id, h] of Object.entries(HELP)) {
      for (const part of ["meaning", "unit", "example", "source"] as const) expect(h[part].trim().length, `${id}.${part}`).toBeGreaterThan(0);
      if (h.term) expect(glossaryIds.has(h.term), `${id} links to unknown term ${h.term}`).toBe(true);
    }
  });

  it("has no emojis or AI filler in help text", () => {
    const text = JSON.stringify(HELP) + JSON.stringify(GLOSSARY) + JSON.stringify(INTROS);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text.toLowerCase()).not.toMatch(/delve|leverage|unlock/);
  });
});

describe("accessible names", () => {
  it("gives every table input a label (NumberInput and Select outside a Field)", () => {
    const missing: string[] = [];
    for (const p of pages) {
      const src = read(p);
      for (const m of src.matchAll(/<(NumberInput|Select)\b/g)) {
        const at = m.index!;
        const before = src.slice(0, at);
        const inField = before.lastIndexOf("<Field") > before.lastIndexOf("</Field>");
        const rest = src.slice(at, at + 700);
        const end = rest.search(/\/>|<\//);
        const opener = rest.slice(0, end === -1 ? 700 : end);
        if (!inField && !/\blabel=/.test(opener)) missing.push(`${p}:${before.split("\n").length}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("does not render a Trash2 icon button without TrashButton", () => {
    const bare = pages.filter((p) => /<Trash2\b[^>]*\/><\/button>/.test(read(p)));
    expect(bare).toEqual([]);
  });
});

describe("page intros", () => {
  it("covers every project page in the shell", () => {
    const shell = read("components/shell.tsx");
    const views = [...shell.matchAll(/\{ href: "(\/\w+)", label/g)].map((m) => m[1]!);
    expect(views.length).toBe(8);
    expect(views.filter((v) => !INTROS[v])).toEqual([]);
  });
});
