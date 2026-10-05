"use client";
import { BlurInput, Field, HelpScope, NumberInput, Select } from "@/components/ui";
import { DEPLOYMENT_LABEL, DEPLOYMENTS, TIER_LABEL, TIERS, type AzureDeployment } from "@studio/engine";
import { catalog, deploymentOptions, modelOptions } from "@/lib/compute";
import { useStudio } from "@/lib/store";

/** heuristics.tokens.language keys, with display names for the Settings/workload Language picker. */
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" }, { value: "fr", label: "French" }, { value: "es", label: "Spanish" },
  { value: "de", label: "German" }, { value: "zh", label: "Chinese" }, { value: "ja", label: "Japanese" },
  { value: "hi", label: "Hindi" }, { value: "ar", label: "Arabic" },
];
const REASONING_SPEC: Spec = { key: "reasoning", label: "Reasoning effort", type: "select", options: ["none", "low", "medium", "high"].map((v) => ({ value: v, label: v })) };
const LANGUAGE_SPEC: Spec = { key: "language", label: "Language", type: "language" };

export type Spec =
  | { key: string; label: string; type: "number"; min?: number; max?: number; step?: number; suffix?: string }
  | { key: string; label: string; type: "percent" }
  | { key: string; label: string; type: "model" | "embedding" | "speech" | "harness" | "unitPrice" | "sfModel" | "sfFunction" | "sfEmbedding" | "extractor" | "realtime" | "ftTraining" }
  | { key: string; label: string; type: "optionalModel" }
  | { key: string; label: string; type: "deployment" }
  | { key: string; label: string; type: "tier" }
  | { key: string; label: string; type: "language" }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; numeric?: boolean }
  | { key: string; label: string; type: "toggle" }
  | { key: string; label: string; type: "list"; hint: string };

type Obj = Record<string, unknown>;

/** Renders inputs for a flat object found by `locate` in the project, and writes edits back. */
export function Fields({ specs, value, locate }: { specs: Spec[]; value: Obj; locate: (d: ReturnType<typeof useStudio.getState>["project"]) => Obj | undefined }) {
  const edit = useStudio((s) => s.edit);
  const harnesses = useStudio((s) => s.project.harnesses);
  const set = (key: string, v: unknown) => edit((d) => { const o = locate(d); if (o) o[key] = v; });
  const projectDeployment = useStudio((s) => s.project.settings.azureDeployment);
  const projectTier = useStudio((s) => s.project.settings.processingTier) ?? "standard";
  const projectLanguage = useStudio((s) => s.project.settings.language) ?? "en";
  // Pickers filter by the workload's own deployment when it has one.
  const deployment = (value.deployment as AzureDeployment | undefined) ?? projectDeployment;
  const optionsFor = (t: string) => {
    if (t === "model") return modelOptions(undefined, deployment);
    if (t === "embedding") return deploymentOptions(catalog.embeddingModels, undefined, deployment);
    if (t === "speech") return deploymentOptions(catalog.speechEngines, (m) => `${m.label} · ${m.via}`, deployment);
    if (t === "harness") return harnesses.map((h) => ({ value: h.id, label: h.label }));
    if (t === "realtime") return deploymentOptions(catalog.realtimeModels, undefined, deployment);
    if (t === "sfModel") return modelOptions((m) => m.platform === "snowflake");
    if (t === "sfEmbedding") return catalog.embeddingModels.filter((m) => m.platform === "snowflake").map((m) => ({ value: m.id, label: m.label }));
    if (t === "sfFunction") return catalog.unitPrices.filter((u) => u.platform === "snowflake" && u.unit === "1M tokens").map((u) => ({ value: u.id, label: u.label }));
    if (t === "ftTraining") return catalog.unitPrices.filter((u) => u.id.startsWith("ft-train-")).map((u) => ({ value: u.id, label: `${u.label.replace(/^(Fine-tuning training|Reinforcement fine-tuning), /, (_, k: string) => (k.startsWith("R") ? "RFT " : ""))} · per ${u.unit.replace("1M training tokens", "1M tokens")}` }));
    if (t === "extractor") return catalog.unitPrices.filter((u) => u.unit === "1K pages").map((u) => ({ value: u.id, label: `${u.label}${u.platform === "snowflake" ? " (Snowflake)" : ""}` }));
    return catalog.unitPrices.map((u) => ({ value: u.id, label: `${u.label} (${u.unit})` }));
  };
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-2.5">
      {specs.map((s) => <HelpScope.Provider key={s.key} value={s.key}>{renderSpec(s)}</HelpScope.Provider>)}
    </div>
  );
  function renderSpec(s: Spec) {
        const v = value[s.key];
        switch (s.type) {
          case "number":
            return <Field key={s.key} label={s.label}><NumberInput value={Number(v)} min={s.min ?? 0} max={s.max} step={s.step} suffix={s.suffix} onChange={(n) => set(s.key, n)} /></Field>;
          case "percent":
            return <Field key={s.key} label={s.label}><NumberInput value={Math.round(Number(v ?? 0) * 1000) / 10} min={0} max={100} suffix="%" onChange={(n) => set(s.key, n / 100)} /></Field>;
          case "select":
            return <Field key={s.key} label={s.label}><Select value={String(v)} options={s.options} onChange={(x) => set(s.key, s.numeric ? Number(x) : x)} /></Field>;
          case "toggle":
            return <Field key={s.key} label={s.label}><Select value={v ? "yes" : "no"} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={(x) => set(s.key, x === "yes")} /></Field>;
          case "optionalModel":
            return <Field key={s.key} label={s.label}><Select value={v ? String(v) : ""} options={[{ value: "", label: "None" }, ...modelOptions(undefined, deployment)]} onChange={(x) => set(s.key, x || undefined)} /></Field>;
          case "deployment":
            return (
              <Field key={s.key} label={s.label}>
                <Select value={v ? String(v) : ""} onChange={(x) => set(s.key, x || undefined)}
                  options={[{ value: "", label: `Project default (${DEPLOYMENT_LABEL[projectDeployment]})` }, ...DEPLOYMENTS.map((d) => ({ value: d, label: DEPLOYMENT_LABEL[d] }))]} />
              </Field>
            );
          case "tier":
            return (
              <Field key={s.key} label={s.label}>
                <Select value={v ? String(v) : ""} onChange={(x) => set(s.key, x || undefined)}
                  options={[{ value: "", label: `Project default (${TIER_LABEL[projectTier]})` }, ...TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))]} />
              </Field>
            );
          case "language": {
            const projectLabel = LANGUAGE_OPTIONS.find((o) => o.value === projectLanguage)?.label ?? projectLanguage;
            return (
              <Field key={s.key} label={s.label}>
                <Select value={v ? String(v) : ""} onChange={(x) => set(s.key, x || undefined)}
                  options={[{ value: "", label: `Project default (${projectLabel})` }, ...LANGUAGE_OPTIONS]} />
              </Field>
            );
          }
          case "list":
            return (
              // Keyed by value so edits made elsewhere (e.g. the plan grid) show up here.
              <Field key={`${s.key}:${(v as number[]).join(",")}`} label={`${s.label} (${s.hint})`}>
                <BlurInput defaultValue={(v as number[]).join(", ")}
                  onCommit={(text) => { const xs = text.split(/[,\s]+/).filter(Boolean).map(Number); if (xs.length && xs.every((x) => Number.isFinite(x) && x >= 0)) set(s.key, xs); }} />
              </Field>
            );
          default:
            return <Field key={s.key} label={s.label}><Select value={String(v)} options={optionsFor(s.type)} onChange={(x) => set(s.key, x)} /></Field>;
        }
  }
}

export const ACTIVITY_SPECS: Record<string, Spec[]> = {
  bakeoff: [
    { key: "harnessId", label: "Harness", type: "harness" },
    { key: "cases", label: "Evaluation cases", type: "number", min: 1 },
    { key: "repeats", label: "Repeats per case", type: "number", min: 1, max: 20 },
    { key: "sweepsPerMonth", label: "Sweeps per month", type: "list", hint: "comma-separated" },
    { key: "cacheHit", label: "Cache hit", type: "percent" },
    { key: "batchShare", label: "Sent through Batch", type: "percent" },
  ],
  iterations: [
    { key: "harnessId", label: "Harness", type: "harness" },
    { key: "modelId", label: "Model", type: "model" },
    { key: "runsPerDevPerDay", label: "Runs per developer per day", type: "number" },
    { key: "subsetCases", label: "Cases per run", type: "number", min: 1 },
    { key: "workingDays", label: "Working days / month", type: "number", max: 31 },
    { key: "cacheHit", label: "Cache hit", type: "percent" },
    { key: "monthFactors", label: "Intensity by month", type: "list", hint: "1 = full" },
  ],
  regression: [
    { key: "harnessId", label: "Harness", type: "harness" },
    { key: "runsPerMonth", label: "Runs per month", type: "number" },
    { key: "cases", label: "Cases per run", type: "number", min: 1 },
    { key: "fromMonth", label: "From month", type: "number", min: 1 },
    { key: "cacheHit", label: "Cache hit", type: "percent" },
    { key: "batchShare", label: "Sent through Batch", type: "percent" },
    { key: "monthFactors", label: "Intensity by month", type: "list", hint: "1 = full" },
  ],
  evaluation: [
    { key: "judgeModelId", label: "Judge model", type: "model" },
    { key: "queryTokens", label: "Query tokens", type: "number" },
    { key: "contextTokens", label: "Context tokens", type: "number" },
    { key: "responseTokens", label: "Response tokens", type: "number" },
    { key: "safetyEvaluators", label: "Safety evaluators", type: "number", max: 12 },
  ],
  redteam: [
    { key: "targetModelId", label: "Target model", type: "model" },
    { key: "scansPerMonth", label: "Scans per month", type: "number" },
    { key: "categories", label: "Risk categories", type: "number", min: 1, max: 11 },
    { key: "objectivesPerCategory", label: "Objectives per category", type: "number", min: 1 },
    { key: "strategies", label: "Attack strategies", type: "number", max: 24 },
    { key: "multiTurnShare", label: "Multi-turn share", type: "percent" },
    { key: "fromMonth", label: "From month", type: "number", min: 1 },
    { key: "monthFactors", label: "Intensity by month", type: "list", hint: "1 = full" },
  ],
  playground: [
    { key: "modelId", label: "Model", type: "model" },
    { key: "callsPerDevPerDay", label: "Calls per developer per day", type: "number" },
    { key: "inputTokens", label: "Input tokens / call", type: "number" },
    { key: "outputTokens", label: "Output tokens / call", type: "number" },
    { key: "workingDays", label: "Working days / month", type: "number", max: 31 },
    REASONING_SPEC,
    { key: "monthFactors", label: "Intensity by month", type: "list", hint: "1 = full" },
  ],
  synthetic: [
    { key: "generatorModelId", label: "Generator model", type: "model" },
    { key: "acceptedPerMonth", label: "Examples kept per month", type: "number" },
    { key: "passRate", label: "Pass rate", type: "percent" },
    { key: "genInputTokens", label: "Generation input tokens", type: "number" },
    { key: "genOutputTokens", label: "Generation output tokens", type: "number" },
    REASONING_SPEC,
    { key: "judgeModelId", label: "Judge model", type: "optionalModel" },
    { key: "judgeInputTokens", label: "Judge input tokens", type: "number" },
    { key: "judgeOutputTokens", label: "Judge output tokens", type: "number" },
    { key: "batchShare", label: "Sent through Batch", type: "percent" },
    { key: "monthFactors", label: "Intensity by month", type: "list", hint: "1 = full" },
  ],
  finetune: [
    { key: "trainingPriceId", label: "Base model and method", type: "ftTraining" },
    { key: "runsPerMonth", label: "Training runs per month", type: "number" },
    { key: "examples", label: "Training examples", type: "number" },
    { key: "tokensPerExample", label: "Tokens per example", type: "number" },
    { key: "epochs", label: "Epochs", type: "number", min: 1, max: 50 },
    { key: "hoursPerRun", label: "Hours per run (RFT only)", type: "number" },
    { key: "deployments", label: "Tuned deployments kept", type: "number" },
    { key: "hostingHoursPerMonth", label: "Hosting hours / month", type: "number", max: 744 },
    { key: "monthFactors", label: "Intensity by month", type: "list", hint: "1 = full" },
  ],
  tooling: [
    { key: "copilotSeatsPerDev", label: "Copilot seats per developer", type: "number", max: 2 },
    { key: "copilotPlan", label: "Copilot plan", type: "select", options: [{ value: "copilot-business", label: "Business" }, { value: "copilot-enterprise", label: "Enterprise" }] },
    { key: "codingModelId", label: "Coding agent model", type: "model" },
    { key: "workingDays", label: "Working days / month", type: "number", max: 31 },
    { key: "monthFactors", label: "Intensity by month", type: "list", hint: "1 = full" },
  ],
};

export const WORKLOAD_SPECS: Record<string, Spec[]> = {
  transcription: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "hoursPerMonth", label: "Audio hours / month", type: "number" },
    { key: "engineId", label: "Engine", type: "speech" },
    { key: "diarize", label: "Speaker diarization", type: "toggle" },
  ],
  documents: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "pagesPerMonth", label: "Pages / month", type: "number" },
    { key: "pageType", label: "Page type", type: "select", options: ["plain", "dense", "slide", "spreadsheet"].map((v) => ({ value: v, label: v })) },
  ],
  email: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "emailsPerMonth", label: "Emails / month", type: "number" },
    { key: "bodyExtractorId", label: "Body extraction", type: "unitPrice" },
    { key: "attachmentExtractorId", label: "Attachment extraction", type: "unitPrice" },
    { key: "attachmentShare", label: "With attachments", type: "percent" },
    { key: "attachmentsPerEmail", label: "Attachments per email", type: "number", step: 0.1 },
    { key: "pagesPerAttachment", label: "Pages per attachment", type: "number" },
    { key: "dedupe", label: "After de-duplication", type: "percent" },
  ],
  embeddings: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "tokensPerMonth", label: "Tokens / month", type: "number" },
    { key: "modelId", label: "Embedding model", type: "embedding" },
  ],
  aiSearch: [
    { key: "chunks", label: "Chunks", type: "number" },
    { key: "embeddingModelId", label: "Embedding model", type: "embedding" },
    { key: "bytesPerDim", label: "Bytes per dimension", type: "select", numeric: true, options: [{ value: "4", label: "float32 (4)" }, { value: "2", label: "half (2)" }, { value: "1", label: "int8 (1)" }, { value: "0.125", label: "binary (1/8)" }] },
    { key: "chunkTokens", label: "Tokens per chunk", type: "number" },
    { key: "replicas", label: "Replicas", type: "number", min: 1, max: 12 },
  ],
  retrieval: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "queriesPerMonth", label: "Queries / month", type: "number" },
    { key: "semanticShare", label: "Semantic ranker share", type: "percent" },
  ],
  chat: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "tier", label: "Tier", type: "tier" },
    { key: "users", label: "Users", type: "number" },
    { key: "conversationsPerUser", label: "Conversations / user / month", type: "number" },
    { key: "turns", label: "Turns per conversation", type: "number", min: 1 },
    { key: "modelId", label: "Model", type: "model" },
    { key: "systemPromptTokens", label: "System prompt tokens", type: "number" },
    { key: "userTurnTokens", label: "User turn tokens", type: "number" },
    { key: "assistantTurnTokens", label: "Answer tokens", type: "number" },
    { key: "topK", label: "Chunks retrieved", type: "number" },
    { key: "chunkTokens", label: "Tokens per chunk", type: "number" },
    { key: "cacheHit", label: "Cache hit", type: "percent" },
    { key: "resendShare", label: "Sent again after errors", type: "percent" },
    { key: "promptShields", label: "Check prompts for attacks", type: "toggle" },
    REASONING_SPEC, LANGUAGE_SPEC,
  ],
  agent: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "tier", label: "Tier", type: "tier" },
    { key: "harnessId", label: "Harness", type: "harness" },
    { key: "modelId", label: "Model", type: "model" },
    { key: "tasksPerMonth", label: "Tasks / month", type: "number" },
    { key: "cacheHit", label: "Cache hit", type: "percent" },
  ],
  continuousEval: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "tier", label: "Tier", type: "tier" },
    { key: "interactionsPerMonth", label: "Interactions / month", type: "number" },
    { key: "sampleShare", label: "Sampled", type: "percent" },
    { key: "judgeModelId", label: "Judge model", type: "model" },
    { key: "safetyEvaluators", label: "Safety evaluators", type: "number" },
  ],
  contentSafety: [
    { key: "requestsPerMonth", label: "Requests / month", type: "number" },
    { key: "charsPerRequest", label: "Characters per request", type: "number" },
  ],
  llm: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "tier", label: "Tier", type: "tier" },
    { key: "callsPerMonth", label: "Calls / month", type: "number" },
    { key: "modelId", label: "Model", type: "model" },
    { key: "inputTokens", label: "Input tokens", type: "number" },
    { key: "cachedInputTokens", label: "Cached input tokens", type: "number" },
    { key: "outputTokens", label: "Output tokens", type: "number" },
    { key: "batchShare", label: "Sent through Batch", type: "percent" },
    { key: "resendShare", label: "Sent again after errors", type: "percent" },
    { key: "promptShields", label: "Check prompts for attacks", type: "toggle" },
    REASONING_SPEC, LANGUAGE_SPEC,
  ],
};

Object.assign(WORKLOAD_SPECS, {
  voiceAgent: [
    { key: "deployment", label: "Deployment", type: "deployment" },
    { key: "modelId", label: "Realtime model", type: "realtime" },
    { key: "callsPerMonth", label: "Calls / month", type: "number" },
    { key: "minutesPerCall", label: "Minutes per call", type: "number", step: 0.5, min: 0.1 },
    { key: "turnsPerCall", label: "Turns per call", type: "number", min: 1 },
    { key: "agentTalkShare", label: "Agent talking", type: "percent" },
    { key: "systemPromptTokens", label: "Instructions + tools tokens", type: "number" },
    { key: "cacheHit", label: "Cache hit", type: "percent" },
    { key: "telephonyPerMinute", label: "Telephony CAD / minute", type: "number", step: 0.001 },
  ],
  snowflakeComplete: [
    { key: "modelId", label: "Cortex model", type: "sfModel" },
    { key: "rowsPerMonth", label: "Rows / month", type: "number" },
    { key: "inputTokens", label: "Input tokens per row", type: "number" },
    { key: "outputTokens", label: "Output tokens per row", type: "number" },
  ],
  snowflakeFunction: [
    { key: "functionId", label: "AI function", type: "sfFunction" },
    { key: "rowsPerMonth", label: "Rows / month", type: "number" },
    { key: "tokensPerRow", label: "Input tokens per row (incl. labels)", type: "number" },
    { key: "hiddenPromptTokens", label: "Hidden prompt tokens", type: "number" },
    { key: "outputTokensPerRow", label: "Output tokens per row", type: "number" },
  ],
  cortexSearch: [
    { key: "rows", label: "Indexed rows", type: "number" },
    { key: "vectorColumns", label: "Vector columns", type: "number", min: 1, max: 8 },
    { key: "embeddingModelId", label: "Embedding model", type: "sfEmbedding" },
    { key: "avgRowBytes", label: "Average row bytes", type: "number" },
    { key: "tokensPerRow", label: "Tokens per row", type: "number" },
    { key: "changedShareMonthly", label: "Rows changed per month", type: "percent" },
  ],
} satisfies Record<string, Spec[]>);

export const WAREHOUSE_SPECS: Spec[] = [
  { key: "size", label: "Warehouse size", type: "select", options: [{ value: "xs", label: "X-Small (1 credit/h)" }, { value: "s", label: "Small (2)" }, { value: "m", label: "Medium (4)" }, { value: "l", label: "Large (8)" }, { value: "xl", label: "X-Large (16)" }] },
  { key: "hoursPerMonth", label: "Running hours / month", type: "number" },
];

export const HARNESS_SPECS: Spec[] = [
  { key: "systemPromptTokens", label: "System prompt tokens", type: "number" },
  { key: "tools", label: "Tools", type: "number", max: 100 },
  { key: "tokensPerTool", label: "Tokens per tool definition", type: "number" },
  { key: "userInputTokens", label: "Task input tokens", type: "number" },
  { key: "steps", label: "Typical steps (P50)", type: "number", min: 1 },
  { key: "toolCallsPerStep", label: "Tool calls per step", type: "number", step: 0.1 },
  { key: "toolResultTokens", label: "Tokens per tool result", type: "number" },
  { key: "outputPerStep", label: "Output per step", type: "number" },
  { key: "finalOutputTokens", label: "Final answer tokens", type: "number" },
  { key: "reasoning", label: "Reasoning effort", type: "select", options: ["none", "low", "medium", "high"].map((v) => ({ value: v, label: v })) },
  { key: "maxTurns", label: "Max turns (cap)", type: "number", min: 1 },
  { key: "maxTokensPerCall", label: "Max tokens per call (cap)", type: "number", min: 1 },
  { key: "compactAtTokens", label: "Compact context at (0 = off)", type: "number" },
  { key: "retryRate", label: "Retry rate", type: "percent" },
];
