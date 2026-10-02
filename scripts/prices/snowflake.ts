/**
 * pnpm prices:snowflake [--check] [--pdf path/to/CreditConsumptionTable.pdf]
 *
 * Refreshes Snowflake Cortex credit rates in packages/catalog/data from the Snowflake Credit
 * Consumption Table (Table 6: AI features). Downloads the PDF unless --pdf is given, extracts
 * its text, and reads the credit numbers that follow each known model or function name.
 * Every match is written to reports/prices-snowflake-<date>.md with its surrounding text so a
 * person can confirm it; names that are not found are listed instead of guessed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = join(ROOT, "packages/catalog/data");
export const PDF_URL = "https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf";

/** Catalogue unit-price ids and the names the consumption table uses for them. */
export const FUNCTIONS: Record<string, string[]> = {
  "sf-parse-layout": ["AI_PARSE_DOCUMENT (LAYOUT)", "PARSE_DOCUMENT (LAYOUT)", "AI_PARSE_DOCUMENT Layout"],
  "sf-parse-ocr": ["AI_PARSE_DOCUMENT (OCR)", "PARSE_DOCUMENT (OCR)", "AI_PARSE_DOCUMENT OCR"],
  "sf-ai-extract": ["AI_EXTRACT"],
  "sf-ai-classify": ["AI_CLASSIFY"],
  "sf-ai-translate": ["AI_TRANSLATE"],
  "sf-cortex-guard": ["Cortex Guard"],
  "sf-search-serving": ["Cortex Search Serving", "Cortex Search"],
};

export interface Found { id: string; values: number[]; context: string }

const NUM = /(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g;

/** First `count` numbers after the first occurrence of any alias, within `window` characters. */
export function findNumbers(text: string, aliases: string[], count: number, window = 140): { values: number[]; context: string } | null {
  const flat = text.replace(/\s+/g, " ");
  for (const a of aliases) {
    const re = new RegExp(`(?<![\\w-])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i");
    const m = re.exec(flat);
    if (!m) continue;
    const after = flat.slice(m.index + m[0].length, m.index + m[0].length + window);
    const nums = [...after.matchAll(NUM)].map((x) => Number(x[1])).filter((n) => Number.isFinite(n));
    if (nums.length >= count) return { values: nums.slice(0, count), context: flat.slice(m.index, m.index + m[0].length + window).trim() };
  }
  return null;
}

/** Apply parsed rates to the catalogue entries (pure; used by the CLI and the tests). */
export function applySnowflake(text: string, chat: any[], embeddings: any[], units: any[], today: string) {
  const found: Found[] = [], missing: string[] = [], changes: { id: string; from: string; to: string }[] = [];
  const src = (note: string) => ({ kind: "snowflake-consumption-table", url: PDF_URL, note, retrievedAt: today });
  for (const m of chat.filter((x) => x.platform === "snowflake")) {
    const name = m.id.replace(/^sf:/, "");
    const r = findNumbers(text, [name], 2);
    if (!r) { missing.push(name); continue; }
    const before = `${m.credits.input}/${m.credits.output}`;
    m.credits = { ...m.credits, input: r.values[0], output: r.values[1] };
    if (before !== `${r.values[0]}/${r.values[1]}`) changes.push({ id: m.id, from: before, to: `${r.values[0]}/${r.values[1]}` });
    m.source = src("AI_COMPLETE credits per 1M input / output tokens (Table 6)");
    m.confidence = "cross-checked";
    found.push({ id: m.id, ...r });
  }
  for (const e of embeddings.filter((x) => x.platform === "snowflake")) {
    const name = e.id.replace(/^sf:/, "");
    const r = findNumbers(text, [name], 1);
    if (!r) { missing.push(name); continue; }
    if (e.credits !== r.values[0]) changes.push({ id: e.id, from: String(e.credits), to: String(r.values[0]) });
    e.credits = r.values[0];
    e.source = src("AI_EMBED credits per 1M tokens (Table 6)");
    e.confidence = "cross-checked";
    found.push({ id: e.id, ...r });
  }
  for (const [id, aliases] of Object.entries(FUNCTIONS)) {
    const u = units.find((x) => x.id === id);
    if (!u) continue;
    const r = findNumbers(text, aliases, 1);
    if (!r) { missing.push(aliases[0]!); continue; }
    if (u.credits !== r.values[0]) changes.push({ id, from: String(u.credits), to: String(r.values[0]) });
    u.credits = r.values[0];
    u.source = src(`Credits per ${u.unit} (Table 6)`);
    u.confidence = "cross-checked";
    found.push({ id, ...r });
  }
  return { found, missing, changes };
}

async function pdfText(path: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--pdf");
  const today = new Date().toISOString().slice(0, 10);
  let pdf = i >= 0 ? args[i + 1]! : join(ROOT, ".cache", `snowflake-consumption-${today}.pdf`);
  if (i < 0) {
    console.log(`Downloading ${PDF_URL}…`);
    const res = await fetch(PDF_URL, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}. Download the PDF in a browser and pass --pdf <file>.`);
    mkdirSync(dirname(pdf), { recursive: true });
    writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));
  }
  const text = await pdfText(pdf);
  const table6 = text.slice(Math.max(0, text.search(/Table\s*6/i)));
  const read = (f: string) => JSON.parse(readFileSync(join(DATA, `${f}.json`), "utf8"));
  const chat = read("chat-models"), emb = read("embedding-models"), units = read("unit-prices");
  const r = applySnowflake(table6, chat, emb, units, today);
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  const reportPath = join(ROOT, "reports", `prices-snowflake-${today}.md`);
  writeFileSync(reportPath, [
    `# Snowflake credit refresh ${today}`, "", `Source: ${PDF_URL}`, "",
    "Check each match against its context before relying on it.", "",
    "| Entry | Credits | Context |", "|---|---|---|",
    ...r.found.map((f) => `| ${f.id} | ${f.values.join(" / ")} | ${f.context.replace(/\|/g, "\\|").slice(0, 160)} |`),
    "", "## Not found", "", ...(r.missing.length ? r.missing.map((m) => `- ${m}`) : ["None."]), "",
  ].join("\n"));
  console.log(`${r.found.length} matched, ${r.changes.length} changed, ${r.missing.length} not found. Report: ${reportPath}`);
  if (args.includes("--check")) { process.exitCode = r.changes.length ? 1 : 0; return; }
  writeFileSync(join(DATA, "chat-models.json"), `${JSON.stringify(chat, null, 2)}\n`);
  writeFileSync(join(DATA, "embedding-models.json"), `${JSON.stringify(emb, null, 2)}\n`);
  writeFileSync(join(DATA, "unit-prices.json"), `${JSON.stringify(units, null, 2)}\n`);
  console.log("Catalogue updated. Run `pnpm test` to validate it.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
