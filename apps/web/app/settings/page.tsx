"use client";
import { Card, CardHead, Field, NumberInput, Select } from "@/components/ui";
import { catalog } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad } from "@/lib/format";
import { DEPLOYMENT_LABEL, DEPLOYMENTS, TIER_LABEL, TIERS, type AzureDeployment, type ProcessingTier } from "@studio/engine";

/** heuristics.tokens.language keys, with display names. */
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" }, { value: "fr", label: "French" }, { value: "es", label: "Spanish" },
  { value: "de", label: "German" }, { value: "zh", label: "Chinese" }, { value: "ja", label: "Japanese" },
  { value: "hi", label: "Hindi" }, { value: "ar", label: "Arabic" },
];

export default function Settings() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const sf = project.settings.snowflake;
  const defaultAi = sf.routing === "global" ? catalog.snowflake.aiCreditGlobal : catalog.snowflake.aiCreditRegional;
  const defaultPlatform = catalog.snowflake.platformCredit[sf.edition] ?? catalog.snowflake.platformCredit.enterprise!;
  return (
    <div className="grid min-h-0 gap-3.5 overflow-auto lg:grid-cols-2">
      <Card>
        <CardHead title="Project" sub="Name, start date and timeline" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Name"><input className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={project.name} onChange={(e) => edit((d) => { d.name = e.target.value; })} /></Field>
          <Field label="First build month"><input type="month" className="num rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={project.startDate.slice(0, 7)} onChange={(e) => e.target.value && edit((d) => { d.startDate = `${e.target.value}-01`; })} /></Field>
          <Field label="Build months"><NumberInput value={project.timeline.buildMonths} min={1} max={24} onChange={(v) => edit((d) => { d.timeline.buildMonths = Math.round(v); })} /></Field>
          <Field label="Plan length (months)"><NumberInput value={project.timeline.horizonMonths} min={12} max={120} onChange={(v) => edit((d) => { d.timeline.horizonMonths = Math.round(v); })} /></Field>
          <Field label="Adoption ramp (months)"><NumberInput value={project.timeline.adoptionRampMonths} min={0} max={24} onChange={(v) => edit((d) => { d.timeline.adoptionRampMonths = Math.round(v); })} /></Field>
          <Field label="Default language"><Select value={project.settings.language ?? "en"} options={LANGUAGE_OPTIONS} onChange={(v) => edit((d) => { d.settings.language = v; })} /></Field>
        </div>
      </Card>
      <Card>
        <CardHead title="Azure" sub="Foundry deployment type for all models" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Default deployment"><Select value={project.settings.azureDeployment} options={DEPLOYMENTS.map((d) => ({ value: d, label: DEPLOYMENT_LABEL[d] }))} onChange={(v) => edit((d) => { d.settings.azureDeployment = v as AzureDeployment; })} /></Field>
          <Field label="Processing tier"><Select value={project.settings.processingTier ?? "standard"} options={TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))} onChange={(v) => edit((d) => { d.settings.processingTier = v as ProcessingTier; })} /></Field>
        </div>
        <div className="space-y-1.5 px-3.5 pb-3.5 text-[11.5px] text-muted">
          <p>Every Azure workload uses this unless you set its own Deployment or Tier on the Run page, so chat can stay in Canada while transcription runs on Global.</p>
          <p>Priority and Flex processing are not priced yet; only Standard and Batch are selectable here.</p>
          <p><b className="text-ink-2">Global Standard</b>: every Foundry model, including the OpenAI audio and realtime models; requests can be processed in any Azure region. <b className="text-ink-2">Canada Regional Standard</b>: data stays in Canada, but only gpt-4o, gpt-4.1-mini, OpenAI embeddings and Azure Speech are offered. <b className="text-ink-2">US Data Zone Standard</b>: data stays in the US; GPT-5.x/6, the Azure-hosted Claude models and partner models.</p>
          <p>Azure Speech and MAI-Transcribe are not Foundry deployments: they run in an Azure Speech (Cognitive Services) resource. Canada Regional means a resource in Canada, where MAI-Transcribe is not offered; Global and US Data Zone mean a resource in a US region such as East US.</p>
        </div>
      </Card>
      <Card>
        <CardHead title="Snowflake" sub="Credit prices in CAD" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Cross-region routing"><Select value={sf.routing} options={[{ value: "global", label: "Global (ANY_REGION)" }, { value: "regional", label: "Regional (AZURE_US / AZURE_EU)" }]} onChange={(v) => edit((d) => { d.settings.snowflake.routing = v as "global" | "regional"; })} /></Field>
          <Field label="Edition"><Select value={sf.edition} options={[{ value: "standard", label: "Standard" }, { value: "enterprise", label: "Enterprise" }, { value: "businessCritical", label: "Business Critical" }, { value: "vps", label: "VPS" }]} onChange={(v) => edit((d) => { d.settings.snowflake.edition = v as typeof sf.edition; })} /></Field>
          <Field label={`CAD per AI credit (default ${cad(defaultAi, 2)})`}><NumberInput value={sf.aiCreditCad ?? defaultAi} step={0.01} onChange={(v) => edit((d) => { d.settings.snowflake.aiCreditCad = v > 0 ? v : undefined; })} /></Field>
          <Field label={`CAD per platform credit (default ${cad(defaultPlatform, 2)})`}><NumberInput value={sf.platformCreditCad ?? defaultPlatform} step={0.01} onChange={(v) => edit((d) => { d.settings.snowflake.platformCreditCad = v > 0 ? v : undefined; })} /></Field>
        </div>
        <p className="px-3.5 pb-3.5 text-[11.5px] text-muted">AI credits cover Cortex AI functions, Search, Agents and the REST API. Platform credits cover warehouses, Cortex Analyst and fine-tuning. Claude and Gemini are not served under AZURE_US or AZURE_EU routing; requests go to AWS or Google over the public internet.</p>
      </Card>
    </div>
  );
}
