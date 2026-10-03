"use client";
import { useMemo, useState } from "react";
import { Card, CardHead, Pill, Seg } from "@/components/ui";
import { catalog } from "@/lib/compute";
import { cad } from "@/lib/format";

interface Row { id: string; label: string; platform: string; kind: string; price: string; source: string; confidence: string; url?: string; retrievedAt: string }

const tone = (c: string) => (c === "verified" ? "ok" : c === "cross-checked" ? "n" : "warn") as "ok" | "n" | "warn";

export default function Prices() {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<"all" | "azure" | "snowflake">("all");
  const sf = catalog.snowflake;
  const rows = useMemo<Row[]>(() => [
    ...catalog.chatModels.map((m) => ({ id: m.id, label: m.label, platform: m.platform, kind: "Model", price: m.prices ? `${cad(m.prices.global.input, 2)} in · ${cad(m.prices.global.cachedInput, 3)} cached · ${cad(m.prices.global.output, 2)} out /1M` : `${m.credits!.input} / ${m.credits!.output} credits /1M`, source: m.source.kind, confidence: m.confidence, url: m.source.url, retrievedAt: m.source.retrievedAt })),
    ...catalog.embeddingModels.map((m) => ({ id: m.id, label: m.label, platform: m.platform, kind: "Embedding", price: m.per1M !== undefined ? `${cad(m.per1M, 4)} /1M` : `${m.credits} credits /1M`, source: m.source.kind, confidence: m.confidence, url: m.source.url, retrievedAt: m.source.retrievedAt })),
    ...catalog.speechEngines.map((e) => ({ id: e.id, label: e.label, platform: e.platform, kind: "Speech", price: e.perAudioHour !== undefined ? `${cad(e.perAudioHour, 3)} /hour` : e.tokens ? `${cad(e.tokens.audioInputPer1M, 2)} /1M audio tokens` : `${e.creditsPerHour} credits /hour`, source: e.source.kind, confidence: e.confidence, url: e.source.url, retrievedAt: e.source.retrievedAt })),
    ...catalog.searchTiers.map((t) => ({ id: t.id, label: `AI Search ${t.label}`, platform: "azure", kind: "Search tier", price: `${cad(t.perSUMonth, 2)} /SU-month`, source: t.source.kind, confidence: t.confidence, url: t.source.url, retrievedAt: t.source.retrievedAt })),
    ...catalog.unitPrices.map((u) => ({ id: u.id, label: u.label, platform: u.platform, kind: "Service", price: u.price !== undefined ? `${cad(u.price, 4)} /${u.unit}` : `${u.credits} ${u.creditType} credits /${u.unit}`, source: u.source.kind, confidence: u.confidence, url: u.source.url, retrievedAt: u.source.retrievedAt })),
  ], []);
  const shown = rows.filter((r) => (platform === "all" || r.platform === platform) && (!q || `${r.label} ${r.id}`.toLowerCase().includes(q.toLowerCase())));
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.confidence] = (a[r.confidence] ?? 0) + 1), a), {});
  const changes = [
    ...catalog.chatModels.filter((m) => m.promo).map((m) => ({ date: m.promo!.until, item: m.label, change: "promo ends", tone: "warn" as const })),
    ...catalog.speechEngines.filter((m) => m.promo).map((m) => ({ date: m.promo!.until, item: m.label, change: "promo ends", tone: "warn" as const })),
    ...[...catalog.chatModels, ...catalog.speechEngines, ...catalog.embeddingModels].filter((m) => m.lifecycle.retiresOn).map((m) => ({ date: m.lifecycle.retiresOn!, item: m.label, change: m.lifecycle.retiresOn! < catalog.meta.asOf ? "retired" : "retires", tone: "crit" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <Card>
        <CardHead title={`${rows.length} prices in CAD`} sub={<>As of {catalog.meta.asOf}.{catalog.meta.fx && <> USD-only list prices converted at <span className="num">1 USD = {catalog.meta.fx.usdToCad} CAD</span>, Azure&apos;s own rate on {catalog.meta.fx.asOf}.</>} Refresh on your machine with <span className="num">pnpm prices</span>; the app never calls the network.</>}>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Search prices" placeholder="Search" className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} />
            <Seg label="Platform" value={platform} onChange={setPlatform} options={[{ value: "all", label: "All" }, { value: "azure", label: "Azure" }, { value: "snowflake", label: "Snowflake" }]} />
          </div>
        </CardHead>
        <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">
          <table className="data">
            <thead><tr><th>Item</th><th>Type</th><th>Price (CAD)</th><th>Source</th><th>Confidence</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.kind}:${r.id}`}>
                  <td>{r.label}<div className="num text-[11px] text-muted">{r.id}</div></td>
                  <td>{r.kind}<div className="text-[11px] text-muted">{r.platform}</div></td>
                  <td className="num">{r.price}</td>
                  <td>{r.url ? <a className="underline decoration-line underline-offset-2" href={r.url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}<div className="text-[11px] text-muted">{r.retrievedAt}</div></td>
                  <td><Pill tone={tone(r.confidence)}>{r.confidence}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex min-h-0 flex-col gap-3.5">
        <Card>
          <CardHead title="Confidence" />
          <div className="flex flex-wrap gap-2 px-3.5 pb-3.5">{Object.entries(counts).map(([k, v]) => <Pill key={k} tone={tone(k)}>{v} {k}</Pill>)}</div>
          <p className="px-3.5 pb-3.5 text-[11.5px] text-muted">Snowflake credits convert at {cad(sf.aiCreditGlobal, 2)} per AI credit (global routing) or {cad(sf.aiCreditRegional, 2)} (regional). Set your contract rate under Settings.</p>
        </Card>
        <Card className="min-h-0 flex-1">
          <CardHead title="Upcoming changes" />
          <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">
            <table className="data"><tbody>{changes.map((c) => <tr key={`${c.item}${c.date}`}><td className="num whitespace-nowrap">{c.date}</td><td>{c.item}</td><td><Pill tone={c.tone}>{c.change}</Pill></td></tr>)}</tbody></table>
          </div>
        </Card>
      </div>
    </div>
  );
}
