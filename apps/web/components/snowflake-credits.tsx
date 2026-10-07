import { creditSummary, type Line } from "@roi-calculator/engine";
import { Pill } from "@/components/ui";
import { cad, fmt } from "@/lib/format";

const NAME = { ai: "AI credits", platform: "Platform credits" } as const;
const credits = (n: number) => (n >= 100 ? fmt(n) : n.toLocaleString("en-CA", { maximumFractionDigits: 2 }));

/** Snowflake lines as credits and CAD side by side, with the rate used and whether it is the catalogue default or a manual override. */
export function SnowflakeCredits({ lines }: { lines: Line[] }) {
  const rows = lines.filter((l) => l.credit);
  if (!rows.length) return null;
  const totals = creditSummary(rows);
  return (
    <div data-testid="snowflake-credits">
      <h3 className="mb-1.5 text-sm font-semibold">Snowflake credits and what they cost in CAD</h3>
      <table className="data">
        <thead><tr><th>Item</th><th className="n">Credits / month</th><th className="n">CAD per credit</th><th>Rate</th><th className="n">CAD / month</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>{l.label}<div className="text-xs text-muted">{NAME[l.credit!.type]}</div></td>
              <td className="n">{credits(l.quantity * l.credit!.creditsPerUnit)}</td>
              <td className="n">{cad(l.credit!.cadPerCredit, 2)}</td>
              <td>{l.credit!.manual ? <Pill tone="warn">manual</Pill> : <Pill>catalogue</Pill>}</td>
              <td className="n">{cad(l.cost, 2)}</td>
            </tr>
          ))}
          {totals.map((t) => (
            <tr key={t.type} className="font-semibold">
              <td>Total {t.type === "ai" ? "AI credits" : "platform credits"}</td>
              <td className="n">{credits(t.credits)}</td>
              <td className="n">{cad(t.cadPerCredit, 2)}</td>
              <td>{t.manual ? <Pill tone="warn">manual</Pill> : <Pill>catalogue</Pill>}</td>
              <td className="n">{cad(t.cad, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-xs text-muted">CAD = credits x CAD per credit. Change the rates under Settings, Snowflake.</p>
    </div>
  );
}
