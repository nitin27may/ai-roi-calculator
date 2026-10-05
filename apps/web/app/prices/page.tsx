"use client";
import { useMemo, useState } from "react";
import { Card, CardHead, Pill, Seg, Select } from "@/components/ui";
import { availableIn, DEPLOYMENT_LABEL, type AzureDeployment } from "@studio/engine";
import { catalog } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad } from "@/lib/format";

type Offer = string | null;
interface Row {
  id: string; label: string; platform: string; kind: string; vendor: string; status: string;
  /** Price under each deployment, or null when not offered there. */
  global: Offer; regional: Offer; dataZone: Offer;
  source: string; confidence: string; url?: string; retrievedAt: string;
  /** Where a speech engine runs: a Foundry deployment or an Azure Speech (Cognitive Services) resource. */
  via?: string;
}

const tone = (c: string) => (c === "verified" ? "ok" : c === "cross-checked" ? "n" : "warn") as "ok" | "n" | "warn";
const KINDS = ["Model", "Embedding", "Speech", "Realtime", "Search tier", "Service"] as const;
const VENDOR_LABEL: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", microsoft: "Microsoft", snowflake: "Snowflake" };
const tokens = (p: { input: number; cachedInput: number; output: number } | undefined): Offer =>
  p ? `${cad(p.input, 2)} / ${cad(p.cachedInput, 3)} / ${cad(p.output, 2)}` : null;
/** Same price under every deployment, offered where the entry says it is. */
const both = (e: Parameters<typeof availableIn>[0], price: string) =>
  ({ global: availableIn(e, "global") ? price : null, regional: availableIn(e, "regional") ? price : null, dataZone: availableIn(e, "dataZone") ? price : null });
const VENDOR_OF_SPEECH = (id: string, via: string) => (via.startsWith("Snowflake") ? "snowflake" : id.startsWith("gpt-") || id === "whisper" ? "openai" : "microsoft");

export default function Prices() {
  const deployment = useStudio((s) => s.project.settings.azureDeployment);
  const [q, setQ] = useState("");
  const [offered, setOffered] = useState<"all" | AzureDeployment>(deployment);
  const [kind, setKind] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState<"all" | "azure" | "snowflake">("all");
  const sf = catalog.snowflake;
  const rows = useMemo<Row[]>(() => [
    ...catalog.chatModels.map((m) => {
      const credits = m.credits ? `${m.credits.input} / ${m.credits.output} credits /1M` : null;
      return { id: m.id, label: m.label, platform: m.platform, kind: "Model", vendor: m.vendor, status: m.lifecycle.status,
        global: m.prices ? (availableIn(m, "global") ? tokens(m.prices.global) : null) : credits,
        regional: m.prices ? (availableIn(m, "regional") ? tokens(m.prices.regional) : null) : credits,
        dataZone: m.prices ? (availableIn(m, "dataZone") ? tokens(m.prices.dataZone) : null) : credits,
        source: m.source.kind, confidence: m.confidence, url: m.source.url, retrievedAt: m.source.retrievedAt };
    }),
    ...catalog.embeddingModels.map((m) => {
      const credits = m.credits !== undefined ? `${m.credits} credits /1M` : null;
      const at = (d: AzureDeployment) => {
        if (m.platform === "snowflake") return credits;
        const price = d === "global" ? m.per1M : m.deployments?.[d];
        return availableIn(m, d) && price !== undefined ? `${cad(price, 4)} /1M` : null;
      };
      return { id: m.id, label: m.label, platform: m.platform, kind: "Embedding", vendor: m.platform === "snowflake" ? "snowflake" : m.id.startsWith("cohere") ? "cohere" : "openai", status: m.lifecycle.status,
        global: at("global"), regional: at("regional"), dataZone: at("dataZone"), source: m.source.kind, confidence: m.confidence, url: m.source.url, retrievedAt: m.source.retrievedAt };
    }),
    ...catalog.speechEngines.map((e) => ({ id: e.id, label: e.label, platform: e.platform, kind: "Speech", vendor: VENDOR_OF_SPEECH(e.id, e.via), status: e.lifecycle.status, via: e.via,
      ...both(e, e.perAudioHour !== undefined ? `${cad(e.perAudioHour, 3)} /hour` : e.tokens ? `${cad(e.tokens.audioInputPer1M, 2)} /1M audio tokens` : `${e.creditsPerHour} credits /hour`),
      source: e.source.kind, confidence: e.confidence, url: e.source.url, retrievedAt: e.source.retrievedAt })),
    ...catalog.realtimeModels.map((m) => ({ id: m.id, label: m.label, platform: "azure", kind: "Realtime", vendor: "openai", status: m.lifecycle.status,
      ...both(m, `${cad(m.audio.input, 2)} audio in · ${cad(m.audio.output, 2)} audio out /1M`), source: m.source.kind, confidence: m.confidence, url: m.source.url, retrievedAt: m.source.retrievedAt })),
    ...catalog.searchTiers.map((t) => ({ id: t.id, label: `AI Search ${t.label}`, platform: "azure", kind: "Search tier", vendor: "Azure", status: "ga",
      ...both({}, `${cad(t.perSUMonth, 2)} /SU-month`), source: t.source.kind, confidence: t.confidence, url: t.source.url, retrievedAt: t.source.retrievedAt })),
    ...catalog.unitPrices.map((u) => ({ id: u.id, label: u.label, platform: u.platform, kind: "Service", vendor: u.platform === "snowflake" ? "snowflake" : "Azure", status: u.lifecycle?.status ?? "ga",
      ...both({}, u.price !== undefined ? `${cad(u.price, 4)} /${u.unit}` : `${u.credits} ${u.creditType} credits /${u.unit}`),
      source: u.source.kind, confidence: u.confidence, url: u.source.url, retrievedAt: u.source.retrievedAt })),
  ], []);
  const vendors = [...new Set(rows.filter((r) => kind === "all" || r.kind === kind).map((r) => r.vendor))].sort();
  const shown = rows.filter((r) =>
    (offered === "all" || r[offered] !== null) && (kind === "all" || r.kind === kind) && (vendor === "all" || r.vendor === vendor) &&
    (status === "all" || r.status === status) && (platform === "all" || r.platform === platform) &&
    (!q || `${r.label} ${r.id}`.toLowerCase().includes(q.toLowerCase())));
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.confidence] = (a[r.confidence] ?? 0) + 1), a), {});
  const changes = [
    ...catalog.chatModels.filter((m) => m.promo).map((m) => ({ date: m.promo!.until, item: m.label, change: "promo ends", tone: "warn" as const })),
    ...catalog.speechEngines.filter((m) => m.promo).map((m) => ({ date: m.promo!.until, item: m.label, change: "promo ends", tone: "warn" as const })),
    ...[...catalog.chatModels, ...catalog.speechEngines, ...catalog.embeddingModels].filter((m) => m.lifecycle.retiresOn).map((m) => ({ date: m.lifecycle.retiresOn!, item: m.label, change: m.lifecycle.retiresOn! < catalog.meta.asOf ? "retired" : "retires", tone: "crit" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <Card>
        <CardHead title={`${shown.length} of ${rows.length} prices in CAD`} sub={<>As of {catalog.meta.asOf}.{catalog.meta.fx && <> USD-only list prices converted at <span className="num">1 USD = {catalog.meta.fx.usdToCad} CAD</span>, Azure&apos;s own rate on {catalog.meta.fx.asOf}.</>} This project uses {DEPLOYMENT_LABEL[deployment]}. Refresh on your machine with <span className="num">pnpm prices</span>; the app never calls the network.</>}>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Search prices" placeholder="Search" className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} />
            <Seg label="Offered in" value={offered} onChange={setOffered} options={[{ value: "all", label: "Any deployment" }, { value: "global", label: "Global" }, { value: "regional", label: "Canada Regional" }, { value: "dataZone", label: "US Data Zone" }]} />
            <Seg label="Platform" value={platform} onChange={setPlatform} options={[{ value: "all", label: "All" }, { value: "azure", label: "Azure" }, { value: "snowflake", label: "Snowflake" }]} />
            <div className="w-36" aria-label="Type"><Select label="Type" value={kind} onChange={(v) => { setKind(v); setVendor("all"); }} options={[{ value: "all", label: "Any type" }, ...KINDS.map((k) => ({ value: k, label: k }))]} /></div>
            <div className="w-40" aria-label="Vendor"><Select label="Vendor" value={vendor} onChange={setVendor} options={[{ value: "all", label: "Any vendor" }, ...vendors.map((v) => ({ value: v, label: VENDOR_LABEL[v] ?? v }))]} /></div>
            <div className="w-32" aria-label="Status"><Select label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, ...["ga", "preview", "legacy", "deprecated"].map((v) => ({ value: v, label: v === "ga" ? "GA" : v[0]!.toUpperCase() + v.slice(1) }))]} /></div>
          </div>
        </CardHead>
        <div className="min-h-0 flex-1 overflow-auto scroll-hint px-3.5 pb-3.5">
          <table className="data">
            <caption className="caption-bottom pt-2 text-left text-xs text-muted">Model prices are CAD per 1M tokens: input / cached input / output.</caption>
            <thead><tr><th>Item</th><th>Type</th><th>Global (CAD)</th><th>Canada Regional (CAD)</th><th>US Data Zone (CAD)</th><th>Source</th><th>Confidence</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.kind}:${r.id}`}>
                  <td>{r.label}<div className="num text-xs text-muted">{r.id}</div></td>
                  <td>{r.kind}<div className="text-xs text-muted">{VENDOR_LABEL[r.vendor] ?? r.vendor} · {r.status}{r.via ? <> · {r.via}</> : null}</div></td>
                  <td className="num">{r.global ?? <span className="text-muted">not offered</span>}</td>
                  <td className="num">{r.regional ?? <span className="text-muted">not offered</span>}</td>
                  <td className="num">{r.dataZone ?? <span className="text-muted">not offered</span>}</td>
                  <td>{r.url ? <a className="underline decoration-line underline-offset-2" href={r.url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}<div className="text-xs text-muted">{r.retrievedAt}</div></td>
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
          <p className="px-3.5 pb-3.5 text-xs text-muted">Snowflake credits convert at {cad(sf.aiCreditGlobal, 2)} per AI credit (global routing) or {cad(sf.aiCreditRegional, 2)} (regional). Set your contract rate under Settings.</p>
        </Card>
        <Card className="min-h-0 flex-1">
          <CardHead title="Upcoming changes" />
          <div className="min-h-0 flex-1 overflow-auto scroll-hint px-3.5 pb-3.5">
            <table className="data"><tbody>{changes.map((c) => <tr key={`${c.item}${c.date}`}><td className="num whitespace-nowrap">{c.date}</td><td>{c.item}</td><td><Pill tone={c.tone}>{c.change}</Pill></td></tr>)}</tbody></table>
          </div>
        </Card>
      </div>
    </div>
  );
}
