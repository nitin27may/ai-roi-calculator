type Json = Record<string, any>;

const j = (v: unknown) => JSON.stringify(v);
const indent = (text: string, n: number) => text.split("\n").map((l, i) => (i === 0 ? l : " ".repeat(n) + l)).join("\n");

/**
 * Resource files stay readable and small: types are indented, each SKU and each unit price is one line.
 * Several hundred SKUs and prices as fully indented JSON is three times the size and unreviewable in a diff.
 */
export function formatResourceFile(file: Json): string {
  const { types, unitPrices, ...head } = file;
  const typeText = (t: Json) => {
    const { skus, ...rest } = t;
    const body = JSON.stringify({ ...rest, skus: "@@SKUS@@" }, null, 2);
    const lines = (skus as Json[]).map((s) => `    ${j(s)}`).join(",\n");
    return body.replace('"@@SKUS@@"', `[\n${lines}\n  ]`);
  };
  const headText = Object.entries(head).map(([k, v]) => `  ${j(k)}: ${j(v)}`).join(",\n");
  const typesText = (types as Json[]).map((t) => `    ${indent(typeText(t), 4)}`).join(",\n");
  const pricesText = (unitPrices as Json[]).map((u) => `    ${j(u)}`).join(",\n");
  return `{\n${headText},\n  "types": [\n${typesText}\n  ],\n  "unitPrices": [\n${pricesText}\n  ]\n}\n`;
}
