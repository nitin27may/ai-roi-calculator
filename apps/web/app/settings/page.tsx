"use client";
import { Card, CardHead, Field, NumberInput, Select } from "@/components/ui";
import { catalog } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad } from "@/lib/format";

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
        </div>
      </Card>
      <Card>
        <CardHead title="Azure" sub="Foundry deployment type for all models" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Deployment type"><Select value={project.settings.azureDeployment} options={[{ value: "global", label: "Global Standard" }, { value: "dataZone", label: "Data Zone Standard (≈ +10%)" }]} onChange={(v) => edit((d) => { d.settings.azureDeployment = v as "global" | "dataZone"; })} /></Field>
        </div>
        <p className="px-3.5 pb-3.5 text-[11.5px] text-muted">Prices come from the Azure Retail Prices API in CAD. Data Zone keeps requests in one geography for a premium of about 10%.</p>
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
