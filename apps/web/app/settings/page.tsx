"use client";
import { LabourExcludeToggle } from "@/components/labour-excluded";
import { Card, CardHead, Field, NumberInput, Select, TextInput } from "@/components/ui";
import { catalog } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad } from "@/lib/format";
import { COST_BASES, DEPLOYMENT_LABEL, DEPLOYMENTS, TIER_LABEL, TIERS, resolveAssumptions, type AzureDeployment, type CostBasis, type ProcessingTier } from "@studio/engine";

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
  const A = resolveAssumptions(project);
  const setA = (key: keyof typeof A, v: number) => edit((d) => { d.settings.assumptions = { ...d.settings.assumptions, [key]: v }; });
  return (
    <div data-tour="settings-azure" className="grid min-h-0 gap-3.5 overflow-auto lg:grid-cols-2">
      <Card>
        <CardHead title="Project" sub="Name, start date and timeline" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Name" help="projectName"><TextInput value={project.name} onChange={(v) => edit((d) => { d.name = v; })} /></Field>
          <Field label="First build month" help="startMonth"><TextInput type="month" value={project.startDate.slice(0, 7)} onChange={(v) => v && edit((d) => { d.startDate = `${v}-01`; })} /></Field>
          <Field label="Build months" help="buildMonths"><NumberInput value={project.timeline.buildMonths} min={1} max={24} onChange={(v) => edit((d) => { d.timeline.buildMonths = Math.round(v); })} /></Field>
          <Field label="Plan length (months)" help="horizonMonths"><NumberInput value={project.timeline.horizonMonths} min={12} max={120} onChange={(v) => edit((d) => { d.timeline.horizonMonths = Math.round(v); })} /></Field>
          <Field label="Adoption ramp (months)" help="adoptionRamp"><NumberInput value={project.timeline.adoptionRampMonths} min={0} max={24} onChange={(v) => edit((d) => { d.timeline.adoptionRampMonths = Math.round(v); })} /></Field>
          <Field label="Default language" help="settingsLanguage"><Select value={project.settings.language ?? "en"} options={LANGUAGE_OPTIONS} onChange={(v) => edit((d) => { d.settings.language = v; })} /></Field>
          <Field label="Default ROI cost basis" help="settingsCostBasis"><Select value={project.roi.basis} options={COST_BASES.map((b) => ({ value: b.value, label: b.label }))} onChange={(v) => edit((d) => { d.roi.basis = v as CostBasis; })} /></Field>
        </div>
        <p className="px-3.5 pb-3.5 text-xs text-muted">{COST_BASES.find((b) => b.value === project.roi.basis)?.hint} The same choice is on Value &amp; ROI, and drives the Summary, Report and Excel.</p>
      </Card>
      <Card>
        <CardHead title="Estimates" sub="How cautious the one-off build figures are" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="AI Dev Lab run cost" help="devLabPercentile"><Select value={project.settings.devLabPercentile ?? "p50"} options={[{ value: "p50", label: "Typical run (P50)" }, { value: "p90", label: "Heavy run (P90)" }]} onChange={(v) => edit((d) => { d.settings.devLabPercentile = v as "p50" | "p90"; })} /></Field>
        </div>
        <p className="px-3.5 pb-3.5 text-xs text-muted">The Dev Lab prices each agent run at this percentile. The cautious case on the Summary page always uses P90, whatever you pick here.</p>
      </Card>
      <Card>
        <CardHead title="Azure" sub="Foundry deployment type for all models" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Default deployment" help="settingsDeployment"><Select value={project.settings.azureDeployment} options={DEPLOYMENTS.map((d) => ({ value: d, label: DEPLOYMENT_LABEL[d] }))} onChange={(v) => edit((d) => { d.settings.azureDeployment = v as AzureDeployment; })} /></Field>
          <Field label="Processing tier" help="settingsTier"><Select value={project.settings.processingTier ?? "standard"} options={TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))} onChange={(v) => edit((d) => { d.settings.processingTier = v as ProcessingTier; })} /></Field>
          <Field label="Pricing model" help="settingsPricingModel"><Select value={project.settings.pricingModel ?? "payg"} options={[{ value: "payg", label: "Pay-as-you-go (default)" }, { value: "ptu", label: "Provisioned throughput (PTU)" }]} onChange={(v) => edit((d) => { if (v === "ptu") d.settings.pricingModel = "ptu"; else delete d.settings.pricingModel; })} /></Field>
        </div>
        <div className="space-y-1.5 px-3.5 pb-3.5 text-xs text-muted">
          <p data-testid="pricing-model-note">{project.settings.pricingModel === "ptu"
            ? "Assumed with provisioned throughput: every Azure OpenAI model reserves PTUs on a 1-month term, sized for peak load, with load above capacity spilling over to pay-as-you-go. Models without a PTU table (Claude, partner models) stay pay-as-you-go and an alert says so. A workload can opt out on its own Run page."
            : "Assumed with pay-as-you-go: every call is billed per token. The Capacity page still shows what PTU would cost, as advice only; nothing in the totals changes."}</p>
          <p>Every Azure workload uses this unless you set its own Deployment or Tier on the Run page, so chat can stay in Canada while transcription runs on Global.</p>
          <p>Priority and Flex processing are not priced yet; only Standard and Batch are selectable here.</p>
          <p><b className="text-ink-2">Global Standard</b>: every Foundry model, including the OpenAI audio and realtime models; requests can be processed in any Azure region. <b className="text-ink-2">Canada Regional Standard</b>: data stays in Canada, but only gpt-4o, gpt-4.1-mini, OpenAI embeddings and Azure Speech are offered. <b className="text-ink-2">US Data Zone Standard</b>: data stays in the US; GPT-5.x/6, the Azure-hosted Claude models and partner models.</p>
          <p>Azure Speech and MAI-Transcribe are not Foundry deployments: they run in an Azure Speech (Cognitive Services) resource. Canada Regional means a resource in Canada, where MAI-Transcribe is not offered; Global and US Data Zone mean a resource in a US region such as East US.</p>
        </div>
      </Card>
      <Card>
        <CardHead title="Build labour" sub="Whether the build team's cost is counted" />
        <div className="flex flex-col gap-2 px-3.5 pb-3.5">
          <LabourExcludeToggle />
          <p className="text-xs text-muted">Use this when the team is already paid for elsewhere and only the AI spend is new money. The same setting is on the Build page.</p>
        </div>
      </Card>
      <Card>
        <CardHead title="Assumptions" sub="Numbers built into the estimates, now editable" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Retrieval planner input tokens" help="assumpPlannerIn"><NumberInput value={A.plannerInputTokens} onChange={(v) => setA("plannerInputTokens", v)} /></Field>
          <Field label="Retrieval planner output tokens" help="assumpPlannerOut"><NumberInput value={A.plannerOutputTokens} onChange={(v) => setA("plannerOutputTokens", v)} /></Field>
          <Field label="Red-team scoring output tokens" help="assumpRedTeam"><NumberInput value={A.redTeamScoringOutputTokens} onChange={(v) => setA("redTeamScoringOutputTokens", v)} /></Field>
          <Field label="Voice function-call input tokens per turn" help="assumpVoiceIn"><NumberInput value={A.voiceFunctionCallInputTokens} onChange={(v) => setA("voiceFunctionCallInputTokens", v)} /></Field>
          <Field label="Voice function-call output tokens per turn" help="assumpVoiceOut"><NumberInput value={A.voiceFunctionCallOutputTokens} onChange={(v) => setA("voiceFunctionCallOutputTokens", v)} /></Field>
          <Field label="Peak minute vs average minute" help="assumpPeak"><NumberInput value={A.peakToAverage} min={1} max={50} step={0.5} onChange={(v) => setA("peakToAverage", v)} /></Field>
        </div>
        <p className="px-3.5 pb-3.5 text-xs text-muted">The planner and red-team defaults are the figures the studio always used, so nothing moves until you change them. Voice function calls default to zero because earlier versions did not price them. The peak factor feeds the PTU sizing and the TPM quota check.</p>
      </Card>
      <Card>
        <CardHead title="Snowflake" sub="Credit prices in CAD" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 px-3.5 pb-3.5">
          <Field label="Cross-region routing" help="sfRouting"><Select value={sf.routing} options={[{ value: "global", label: "Global (ANY_REGION)" }, { value: "regional", label: "Regional (AZURE_US / AZURE_EU)" }]} onChange={(v) => edit((d) => { d.settings.snowflake.routing = v as "global" | "regional"; })} /></Field>
          <Field label="Edition" help="sfEdition"><Select value={sf.edition} options={[{ value: "standard", label: "Standard" }, { value: "enterprise", label: "Enterprise" }, { value: "businessCritical", label: "Business Critical" }, { value: "vps", label: "VPS" }]} onChange={(v) => edit((d) => { d.settings.snowflake.edition = v as typeof sf.edition; })} /></Field>
          <Field label={`CAD per AI credit (default ${cad(defaultAi, 2)})`} help="sfAiCredit"><NumberInput value={sf.aiCreditCad ?? defaultAi} step={0.01} onChange={(v) => edit((d) => { d.settings.snowflake.aiCreditCad = v > 0 ? v : undefined; })} /></Field>
          <Field label={`CAD per platform credit (default ${cad(defaultPlatform, 2)})`} help="sfPlatformCredit"><NumberInput value={sf.platformCreditCad ?? defaultPlatform} step={0.01} onChange={(v) => edit((d) => { d.settings.snowflake.platformCreditCad = v > 0 ? v : undefined; })} /></Field>
        </div>
        <p className="px-3.5 pb-3.5 text-xs text-muted">AI credits cover Cortex AI functions, Search, Agents and the REST API. Platform credits cover warehouses, Cortex Analyst and fine-tuning. Claude and Gemini are not served under AZURE_US or AZURE_EU routing; requests go to AWS or Google over the public internet.</p>
      </Card>
    </div>
  );
}
