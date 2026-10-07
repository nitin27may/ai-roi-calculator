"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  DEPLOYMENT_LABEL, PROJECT_TYPE_LIST, TIER_LABEL, applicableDevKinds, batchOfferedUnder, buildLedger, computeRoi, defaultConfidence, modelOptions, recipeById, recipeTypes, recommendModel,
  type Assumption, type AzureDeployment, type BenefitInput, type BenefitType, type ModelRole, type ProjectType, type Question, type Quality, type Recipe,
} from "@roi-calculator/engine";
import { Card, CardHead, Field, NumberInput, Pill, Select, Seg, TextInput } from "@/components/ui";
import { HelpTip } from "@/components/help-tip";
import { catalog } from "@/lib/compute";
import { cad, cn, fmt } from "@/lib/format";
import { wizardHelpId } from "@/lib/help";
import { useStudio } from "@/lib/store";
import {
  blocker, buildFromState, featureTypes, initialState, missingFor, recipeDeployment, recipeValues, recipesFor, setBatchAllowed, setBenefit, setBuild, setDeployment, setEdit, setModel, setQuality,
  setTier, setValue, stepIdOf, stepsFor, toggleDevKind, togglePick, toggleType, type WizardState,
} from "@/lib/wizard";

const DEPLOYMENTS: AzureDeployment[] = ["global", "dataZone", "regional"];
const BENEFIT_TYPES: { value: BenefitType; label: string }[] = [
  { value: "timeSaved", label: "Time saved" }, { value: "costAvoided", label: "Cost avoided" }, { value: "revenue", label: "Revenue" },
  { value: "quality", label: "Quality" }, { value: "risk", label: "Risk" }, { value: "none", label: "None" },
];
const BENEFIT_DETAIL: Record<BenefitType, string> = {
  timeSaved: "Hours people no longer spend. Scaled by adoption on the Value page.",
  costAvoided: "A cost that goes away, such as a licence or contractor. Counted in full from go-live, not scaled by adoption.",
  revenue: "Extra sales the feature brings in. Only the margin you keep counts, and it follows the adoption ramp.",
  quality: "Errors avoided: items checked, times the drop in error rate, times what one error costs.",
  risk: "Expected loss avoided: events a year, times the cost of one, times the share the feature prevents.",
  none: "Count the cost only; add benefits later on the Value page.",
};

export default function Wizard() {
  const router = useRouter();
  const add = useStudio((s) => s.add);
  const settings = useStudio((s) => s.project.settings);
  const [state, setState] = useState<WizardState | null>(null);
  const [reached, setReached] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => { setState((s) => s ?? initialState({ deployment: settings.azureDeployment, tier: settings.processingTier ?? "standard" })); }, [settings.azureDeployment, settings.processingTier]);
  const step = state?.step ?? 0;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  const built = useMemo(() => (state && stepIdOf(state) === "review" ? buildFromState(catalog, state) : null), [state]);

  if (!state) return null;
  const STEPS = stepsFor(state);
  const stepId = stepIdOf(state);
  const update = (f: (s: WizardState) => WizardState) => setState((s) => (s ? f(s) : s));
  const go = (n: number) => { update((s) => ({ ...s, step: Math.min(n, stepsFor(s).length - 1) })); setReached((r) => Math.max(r, n)); };
  const stop = blocker(state);
  const last = state.step === STEPS.length - 1;

  const create = () => {
    const b = buildFromState(catalog, state);
    if (!b) return;
    const name = state.name.trim() || (state.picks.length === 1 ? recipeById(state.picks[0]!)!.label : "New estimate");
    add({ ...b.project, name });
    router.push("/summary");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <nav aria-label="Wizard progress">
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => {
            const done = i < state.step, current = i === state.step, open = i <= reached;
            return (
              <li key={s.id}>
                <button type="button" disabled={!open || (i > state.step && blocker({ ...state, step: state.step }) !== null)} aria-current={current ? "step" : undefined} aria-label={`Step ${i + 1} of ${STEPS.length}: ${s.label}${done ? " (done)" : ""}`}
                  onClick={() => go(i)}
                  className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none",
                    current ? "border-accent bg-accent text-accent-ink" : done ? "border-accent bg-accent-soft text-ink" : "border-line text-muted", open && !current && "hover:bg-surface-2")}>
                  <span className={cn("num flex h-4 w-4 items-center justify-center rounded-full text-xs", current ? "bg-accent-ink text-accent" : "bg-surface-2 text-ink-2")}>{done ? <Check size={10} aria-hidden /> : i + 1}</span>
                  <span className="hidden sm:inline">{s.short}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Wizard progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={state.step + 1}>
          <div className="h-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((state.step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-auto">
        <div key={state.step} className="wiz-in flex flex-col gap-3 pb-2">
          <div>
            <h2 ref={heading} tabIndex={-1} className="font-display text-[17px] font-bold outline-none">Step {state.step + 1} of {STEPS.length}: {STEPS[state.step]!.label}</h2>
          </div>
          {stepId === "what" && <WhatStep state={state} update={update} />}
          {stepId === "volume" && <VolumeStep state={state} update={update} />}
          {stepId === "run" && <RunStep state={state} update={update} />}
          {stepId === "build" && <BuildStep state={state} update={update} />}
          {stepId === "worth" && <WorthStep state={state} update={update} />}
          {stepId === "review" && <ReviewStep state={state} update={update} built={built} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
        <button type="button" disabled={state.step === 0} onClick={() => go(state.step - 1)} className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm enabled:hover:bg-surface-2 disabled:opacity-40"><ArrowLeft size={14} aria-hidden />Back</button>
        <p role="status" className="min-w-0 flex-1 text-center text-[12.5px] text-muted">{stop}</p>
        {last
          ? <button type="button" disabled={!!stop || !built} onClick={create} className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"><Check size={14} aria-hidden />Create project</button>
          : <button type="button" disabled={!!stop} onClick={() => go(state.step + 1)} className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40">Next<ArrowRight size={14} aria-hidden /></button>}
      </div>
    </div>
  );
}

type StepProps = { state: WizardState; update: (f: (s: WizardState) => WizardState) => void };
const picked = (s: WizardState): Recipe[] => s.picks.map((id) => recipeById(id)!);

function WhatStep({ state, update }: StepProps) {
  const offered = recipesFor(state);
  return (
    <>
      <p className="max-w-3xl text-[13px] text-ink-2">Choose the kind of change this project is. Pick more than one if it mixes kinds: for example automating a process and moving its hosting to a new platform. Nothing is chosen for you.</p>
      <div role="group" aria-label="What kind of change" className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
        {PROJECT_TYPE_LIST.map((t) => {
          const on = state.types.includes(t.type);
          return (
            <button key={t.type} type="button" aria-pressed={on} onClick={() => update((s) => toggleType(s, t.type))}
              className={cn("flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors motion-reduce:transition-none", on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2")}>
              <span className="flex items-start justify-between gap-2">
                <span className="text-[13.5px] font-semibold">{t.label}</span>
                <span aria-hidden className={cn("flex h-4 w-4 flex-none items-center justify-center rounded border", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>{on && <Check size={11} />}</span>
              </span>
              <span className="text-[12px] leading-snug text-muted">{t.detail}</span>
            </button>
          );
        })}
      </div>
      <div>
        <h3 className="font-display text-[14px] font-bold">What are you doing?</h3>
        <p className="max-w-3xl text-[13px] text-ink-2">
          {state.types.length === 0
            ? "Choose a kind of change above and the things you can build with it appear here."
            : "Pick everything this project does. Each one becomes a feature that carries the kinds of change it belongs to, so you can see what each costs. Start with one if you are unsure; you can add more later."}
        </p>
      </div>
      {state.types.length > 0 && (
        <div role="group" aria-label="What are you doing" className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
          {offered.map((r) => {
            const on = state.picks.includes(r.id);
            const kinds = featureTypes(state, r);
            return (
              <button key={r.id} type="button" aria-pressed={on} onClick={() => update((s) => togglePick(s, r.id))}
                className={cn("flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors motion-reduce:transition-none", on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2")}>
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[13.5px] font-semibold">{r.label}</span>
                  <span aria-hidden className={cn("flex h-4 w-4 flex-none items-center justify-center rounded border", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>{on && <Check size={11} />}</span>
                </span>
                <span className="text-[12px] leading-snug text-muted">{r.description}</span>
                {r.needsHarness && <span className="text-xs text-ink-2">Adds an agent harness.</span>}
                {state.types.length > 1 && <span className="text-xs text-ink-2">Counts as: {kinds.map((k) => PROJECT_TYPE_LIST.find((x) => x.type === k)!.label).join(", ")}.</span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function QuestionField({ recipe, q, state, update }: { recipe: Recipe; q: Question; state: WizardState; update: StepProps["update"] }) {
  const v = recipeValues(state, recipe)[q.id]!;
  const help = wizardHelpId(recipe.id, q.id);
  return (
    <Field label={q.label} help={help}>
      {q.kind === "number" && <NumberInput value={Number(v)} min={q.min} max={q.max} step={q.step ?? (q.default < 1 ? 0.005 : 1)} suffix={q.unit} onChange={(n) => update((s) => setValue(s, recipe.id, q.id, n))} />}
      {q.kind === "choice" && <Select value={String(v)} options={q.options} onChange={(x) => update((s) => setValue(s, recipe.id, q.id, x))} />}
      {q.kind === "toggle" && <Select value={v ? "yes" : "no"} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={(x) => update((s) => setValue(s, recipe.id, q.id, x === "yes"))} />}
      {q.kind === "multi" && (
        <div role="group" aria-label={q.label} className="flex flex-wrap gap-x-4 gap-y-1">
          {q.options.map((o) => {
            const picked = String(v).split(",").filter(Boolean);
            return (
              <label key={o.value} className="flex items-center gap-1.5 text-[13px] text-ink">
                <input type="checkbox" checked={picked.includes(o.value)} onChange={(e) => update((s) => setValue(s, recipe.id, q.id, q.options.map((x) => x.value).filter((x) => (x === o.value ? e.target.checked : picked.includes(x))).join(",")))} />
                {o.label}
              </label>
            );
          })}
        </div>
      )}
    </Field>
  );
}

function VolumeStep({ state, update }: StepProps) {
  const plan = picked(state).some((r) => r.plan);
  return (
    <>
      <p className="max-w-3xl text-[13px] text-ink-2">Answer in the units you think in: documents, calls, users, payments.{plan ? " Every figure is a starting assumption: replace it with yours. Each answer is listed with its source on the last step." : " The wizard turns them into tokens, pages and requests on the last step, and shows how."}</p>
      {picked(state).map((r) => (
        <Card key={r.id}>
          <CardHead title={r.label} sub={r.description} />
          <div className="grid gap-3 px-3.5 pb-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {r.questions.map((q) => <QuestionField key={q.id} recipe={r} q={q} state={state} update={update} />)}
          </div>
        </Card>
      ))}
    </>
  );
}

function SegField({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1 text-xs text-muted"><span className="flex items-center gap-0.5">{label}<HelpTip id={help} label={label} /></span>{children}</div>;
}

function RunStep({ state, update }: StepProps) {
  const batchOk = batchOfferedUnder(state.deployment);
  return (
    <>
      <p className="max-w-3xl text-[13px] text-ink-2">Choose where the models run and how the wizard should lean. Then pick a model for each job. The wizard suggests one and says why; nothing is chosen until you choose.</p>
      <Card>
        <CardHead title="Deployment and priorities" sub="Starts from your Settings. Changing the deployment clears the models you picked, because not every model is offered everywhere." />
        <div className="grid gap-3 px-3.5 pb-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Azure deployment" help="settingsDeployment"><Select value={state.deployment} options={DEPLOYMENTS.map((d) => ({ value: d, label: DEPLOYMENT_LABEL[d] }))} onChange={(v) => update((s) => setDeployment(s, v as AzureDeployment))} /></Field>
          <Field label="Processing tier" help="settingsTier"><Select value={state.tier} options={(Object.keys(TIER_LABEL) as (keyof typeof TIER_LABEL)[]).map((t) => ({ value: t, label: TIER_LABEL[t] }))} onChange={(v) => update((s) => setTier(s, v as WizardState["tier"]))} /></Field>
          <SegField label="Quality or cost" help="wizQuality">
            <Seg<Quality> label="Quality or cost" value={state.quality} options={[{ value: "cost", label: "Lower cost" }, { value: "balanced", label: "Balanced" }, { value: "quality", label: "Higher quality" }]} onChange={(v) => update((s) => setQuality(s, v))} />
          </SegField>
          <div className="flex flex-col gap-1 text-xs text-muted">
            <span className="flex items-center gap-0.5">Batch for work that can wait<HelpTip id="wizBatch" label="Batch for work that can wait" /></span>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={state.batchAllowed} disabled={!batchOk} onChange={(e) => update((s) => setBatchAllowed(s, e.target.checked))} aria-label="Allow the Batch tier for work that can wait" />
              {batchOk ? "Allow Batch" : "Not offered in Canada Regional"}
            </label>
          </div>
        </div>
      </Card>
      {picked(state).map((r) => <ModelCard key={r.id} recipe={r} state={state} update={update} />)}
    </>
  );
}

function ModelCard({ recipe, state, update }: { recipe: Recipe; state: WizardState; update: StepProps["update"] }) {
  const values = recipeValues(state, recipe);
  const roles = recipe.modelRoles.filter((m) => (m.when ? m.when(values) : true));
  const dep = recipeDeployment(catalog, state, recipe);
  return (
    <Card>
      <CardHead title={recipe.label} sub={roles.length ? undefined : "No model to choose here. The pricing comes from the services this feature uses."} />
      <div className="flex flex-col gap-3 px-3.5 pb-3.5">
        {dep !== state.deployment && <p role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">Real-time voice models are not offered as {DEPLOYMENT_LABEL[state.deployment]}. This feature runs as {DEPLOYMENT_LABEL[dep]} and the rest of the project stays as it is.</p>}
        {roles.map((role) => <RoleRow key={role.id} recipe={recipe} role={role} deployment={dep} state={state} update={update} />)}
      </div>
    </Card>
  );
}

function RoleRow({ recipe, role, deployment, state, update }: { recipe: Recipe; role: ModelRole; deployment: AzureDeployment; state: WizardState; update: StepProps["update"] }) {
  const options = useMemo(() => modelOptions(catalog, role, deployment), [role, deployment]);
  const rec = useMemo(() => recommendModel(catalog, role, { deployment, quality: state.quality, batch: state.batchAllowed }), [role, deployment, state.quality, state.batchAllowed]);
  const chosen = state.models[recipe.id]?.[role.id] ?? "";
  const chosenOpt = options.find((o) => o.id === chosen);
  return (
    <div className="grid gap-2 rounded-md border border-line p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-[13px] font-semibold">{role.label}</div>
        {rec
          ? <>
              <p className="text-[12.5px] leading-snug text-ink-2"><span className="font-medium text-ink">Suggested: {options.find((o) => o.id === rec.modelId)?.label ?? rec.modelId}.</span> {rec.reason}</p>
              <button type="button" className="w-fit rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" aria-label={`Use the suggested model for ${role.label}`}
                onClick={() => update((s) => setModel(s, recipe.id, role.id, rec.modelId))}>Use this suggestion</button>
            </>
          : <p role="note" className="text-[12.5px] text-warn">No model for this job is offered as {DEPLOYMENT_LABEL[deployment]}. Switch the deployment above to see more.</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Field label="Model" help="wizModel">
          <Select value={chosen} options={[{ value: "", label: "Choose a model" }, ...options.map((o) => ({ value: o.id, label: `${o.label}${o.inputPer1M > 0 ? ` · C$${o.inputPer1M.toFixed(2)} in / C$${o.outputPer1M.toFixed(2)} out per 1M` : ""}` }))]}
            onChange={(v) => update((s) => setModel(s, recipe.id, role.id, v))} />
        </Field>
        {chosenOpt && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {state.batchAllowed && recipe.batchable && <Pill tone={chosenOpt.batchOk ? "ok" : "n"}>{chosenOpt.batchOk ? "Batch available" : "No Batch for this model"}</Pill>}
            {chosenOpt.note && <span className="text-muted">{chosenOpt.note}</span>}
          </div>
        )}
        {!chosen && <Pill tone="warn">Not chosen yet</Pill>}
      </div>
    </div>
  );
}

function BuildStep({ state, update }: StepProps) {
  const kinds = applicableDevKinds(state.picks);
  const harness = picked(state).some((r) => r.needsHarness);
  return (
    <>
      <p className="max-w-3xl text-[13px] text-ink-2">How big is the team and how long does it take? The wizard starts from a size that suits what you picked. Tick the Dev Lab work you expect; its volumes are shared across the features.</p>
      <Card>
        <CardHead title="Team and length" sub="Used for build labour and Dev Lab volumes." />
        <div className="grid gap-3 px-3.5 pb-3.5 sm:grid-cols-2 lg:max-w-xl">
          <Field label="Developers" help="wizPeople"><NumberInput value={state.build.people} min={1} max={100} step={1} suffix="people" onChange={(n) => update((s) => setBuild(s, { people: n }))} /></Field>
          <Field label="Build length" help="wizMonths"><NumberInput value={state.build.months} min={1} max={24} step={1} suffix="months" onChange={(n) => update((s) => setBuild(s, { months: Math.round(n) }))} /></Field>
        </div>
      </Card>
      <Card>
        <CardHead title="Dev Lab activities" sub={harness ? "You picked an agent feature, so its harness is added with these activities." : "No agent harness is added, because nothing you picked runs an agent."} />
        <div className="grid gap-2 px-3.5 pb-3.5 sm:grid-cols-2">
          {kinds.length === 0 && <p className="text-[12.5px] text-muted">Nothing to test here. Add Dev Lab work later on the Build page.</p>}
          {kinds.map((k) => (
            <label key={k.kind} className="flex cursor-pointer items-start gap-2 rounded-md border border-line px-2.5 py-2 text-[12.5px]">
              <input type="checkbox" className="mt-0.5" checked={state.devKinds.includes(k.kind)} onChange={() => update((s) => toggleDevKind(s, k.kind))} />
              <span><b className="font-medium">{k.label}</b><small className="block text-muted">{k.why}</small></span>
            </label>
          ))}
        </div>
      </Card>
    </>
  );
}

function WorthStep({ state, update }: StepProps) {
  return (
    <>
      <p className="max-w-3xl text-[13px] text-ink-2">What is each feature worth? Time saved uses a published benchmark or your own minutes. The other types take figures you enter, and each carries a confidence. Skip a feature if you only want its cost.</p>
      {picked(state).map((r) => <BenefitCard key={r.id} recipe={r} state={state} update={update} />)}
    </>
  );
}

function BenefitCard({ recipe, state, update }: { recipe: Recipe; state: WizardState; update: StepProps["update"] }) {
  const values = recipeValues(state, recipe);
  const b: BenefitInput = state.benefits[recipe.id] ?? recipe.benefit(values);
  const set = (next: BenefitInput) => update((s) => setBenefit(s, recipe.id, next));
  const users = Number(values.users ?? 100);
  const basisValue = b.basis === "benchmark" ? `bm:${b.benchmarkId}` : (b.basis ?? "perItem");
  const bench = catalog.benchmarks.capabilities.find((c) => c.id === b.benchmarkId);
  const changeType = (type: BenefitType) => {
    if (type === "timeSaved") {
      const d = recipe.benefit(values);
      set(d.type === "timeSaved" ? d : { type, basis: "perItem", baselineMinutes: 10, savedPct: 50 });
    } else if (type === "costAvoided") set({ type, amountCad: b.amountCad ?? 0, cadence: b.cadence ?? "monthly", label: b.label });
    else if (type === "revenue") set({ type, monthlyRevenue: 0, marginPct: 40 });
    else if (type === "quality") set({ type, errorRateBeforePct: 0, errorRateAfterPct: 0, costPerError: 0 });
    else if (type === "risk") set({ type, eventsPerYear: 0, impactCad: 0, reductionPct: 0 });
    else set({ type });
  };
  const confidence = b.confidencePct ?? defaultConfidence(b, catalog.benchmarks);
  const confidenceWhy = b.type === "timeSaved" && b.basis === "benchmark" && bench
    ? <>Starts from the benchmark's evidence grade ({bench.confidence}{bench.vendorFunded ? ", vendor funded" : ""}). Source: {bench.sourceUrl ? <a className="underline decoration-line underline-offset-2" href={bench.sourceUrl} target="_blank" rel="noreferrer">{bench.sourceLabel}</a> : bench.sourceLabel}.</>
    : "A placeholder for this type of benefit. Replace it with how sure you really are.";
  const setPct = (k: "marginPct" | "errorRateBeforePct" | "errorRateAfterPct" | "reductionPct", n: number) => set({ ...b, [k]: n });
  return (
    <Card>
      <CardHead title={recipe.label} sub={recipe.benefitHint} />
      <div className="flex flex-col gap-3 px-3.5 pb-3.5">
        <SegField label="Benefit type" help="wizBenefitType">
          <Seg<BenefitType> label={`Benefit type for ${recipe.label}`} value={b.type} options={BENEFIT_TYPES} onChange={changeType} />
        </SegField>
        <p className="text-[12px] text-muted">{BENEFIT_DETAIL[b.type]}</p>
        {b.type === "timeSaved" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Based on" help="wizBenefitBasis">
              <Select value={basisValue} options={[...catalog.benchmarks.capabilities.map((c) => ({ value: `bm:${c.id}`, label: `Benchmark: ${c.label}` })), { value: "perUser", label: "My minutes per user per week" }, { value: "perItem", label: "My minutes per item" }]}
                onChange={(v) => v.startsWith("bm:") ? set({ ...b, basis: "benchmark", benchmarkId: v.slice(3), users: b.users ?? users }) : set({ ...b, basis: v as "perUser" | "perItem", benchmarkId: undefined, baselineMinutes: b.baselineMinutes ?? 10, savedPct: b.savedPct ?? 30, users: b.users ?? users })} />
            </Field>
            {(b.basis === "benchmark" ? bench?.driver !== "perVolume" : b.basis === "perUser") && (
              <Field label="Users who get the saving" help="wizBenefitUsers"><NumberInput value={b.users ?? users} min={1} max={10_000_000} step={1} suffix="people" onChange={(n) => set({ ...b, users: n })} /></Field>
            )}
            {b.basis !== "benchmark" && (
              <>
                <Field label={b.basis === "perUser" ? "Minutes per user per week today" : "Minutes per item today"} help="wizBenefitMinutes"><NumberInput value={b.baselineMinutes ?? 10} min={0.1} max={100000} step={1} suffix="minutes" onChange={(n) => set({ ...b, baselineMinutes: n })} /></Field>
                <Field label="Share of that time saved" help="wizBenefitSaved"><NumberInput value={b.savedPct ?? 30} min={1} max={100} step={1} suffix="%" onChange={(n) => set({ ...b, savedPct: n })} /></Field>
              </>
            )}
            {b.basis === "benchmark" && bench && <p className="text-[12px] text-muted sm:col-span-2">Typical saving: {bench.savings.typical} {bench.unit === "pct" ? "%" : "minutes"}. Source: {bench.sourceLabel}.</p>}
          </div>
        )}
        {b.type === "costAvoided" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Amount" help="wizBenefitAmount"><NumberInput value={b.amountCad ?? 0} min={0} max={1_000_000_000} step={100} suffix="C$" onChange={(n) => set({ ...b, amountCad: n })} /></Field>
            <Field label="How often" help="wizBenefitCadence"><Select value={b.cadence ?? "monthly"} options={[{ value: "monthly", label: "Every month" }, { value: "once", label: "Once, at go-live" }]} onChange={(v) => set({ ...b, cadence: v as "monthly" | "once" })} /></Field>
            <Field label="Name in the reports" help="wizBenefitLabel"><TextInput value={b.label ?? ""} placeholder="Optional" onChange={(v) => set({ ...b, label: v })} /></Field>
          </div>
        )}
        {b.type === "revenue" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Extra revenue per month" help="valueRevenue"><NumberInput value={b.monthlyRevenue ?? 0} min={0} max={1_000_000_000} step={1000} suffix="C$" onChange={(n) => set({ ...b, monthlyRevenue: n })} /></Field>
            <Field label="Margin kept" help="valueMargin"><NumberInput value={b.marginPct ?? 40} min={0} max={100} step={1} suffix="%" onChange={(n) => setPct("marginPct", n)} /></Field>
            <Field label="Name in the reports" help="wizBenefitLabel"><TextInput value={b.label ?? ""} placeholder="Optional" onChange={(v) => set({ ...b, label: v })} /></Field>
          </div>
        )}
        {b.type === "quality" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Error rate today" help="valueErrBefore"><NumberInput value={b.errorRateBeforePct ?? 0} min={0} max={100} step={0.1} suffix="%" onChange={(n) => setPct("errorRateBeforePct", n)} /></Field>
            <Field label={recipe.plan ? "Error rate after" : "Error rate with AI"} help="valueErrAfter"><NumberInput value={b.errorRateAfterPct ?? 0} min={0} max={100} step={0.1} suffix="%" onChange={(n) => setPct("errorRateAfterPct", n)} /></Field>
            <Field label="Cost of one error" help="valueCostPerError"><NumberInput value={b.costPerError ?? 0} min={0} max={1_000_000_000} step={5} suffix="C$" onChange={(n) => set({ ...b, costPerError: n })} /></Field>
            <p className="text-[12px] text-muted sm:col-span-3">Items checked per month come from this feature's volume on How much, so the two stay in step.</p>
          </div>
        )}
        {b.type === "risk" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Events per year" help="valueEvents"><NumberInput value={b.eventsPerYear ?? 0} min={0} max={100000} step={0.1} onChange={(n) => set({ ...b, eventsPerYear: n })} /></Field>
            <Field label="Cost of one event" help="valueImpact"><NumberInput value={b.impactCad ?? 0} min={0} max={1_000_000_000} step={1000} suffix="C$" onChange={(n) => set({ ...b, impactCad: n })} /></Field>
            <Field label="Share prevented" help="valueReduction"><NumberInput value={b.reductionPct ?? 0} min={0} max={100} step={1} suffix="%" onChange={(n) => setPct("reductionPct", n)} /></Field>
          </div>
        )}
        {b.type !== "none" && (
          <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <Field label="Confidence" help="wizBenefitConfidence"><NumberInput value={confidence} min={0} max={100} step={5} suffix="%" onChange={(n) => set({ ...b, confidencePct: Math.min(100, Math.max(0, n)) })} /></Field>
            <p className="text-[12px] text-muted sm:self-end">{confidenceWhy} The benefit counts at this share of its value.{b.type !== "timeSaved" && " It is counted under this feature's capability in ROI by capability."}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function ReviewStep({ state, update, built }: StepProps & { built: ReturnType<typeof buildFromState> }) {
  const totals = useMemo(() => {
    if (!built) return null;
    const L = buildLedger(built.project, catalog);
    const r = computeRoi(L, built.project.roi.basis, built.project.roi.discountRatePct);
    return { L, r };
  }, [built]);
  if (!built || !totals) return <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">A model is still missing. Go back to How should it run and choose one for each job.</p>;
  const p = built.project;
  const byFeature = p.features.map((f) => ({ f, rows: built.assumptions.filter((a) => a.featureId === f.id), workloads: p.workloads.filter((w) => w.featureId === f.id) }));
  const general = built.assumptions.filter((a) => !a.featureId);
  return (
    <>
      <p className="max-w-3xl text-[13px] text-ink-2">This is exactly what will be created. Every figure the wizard worked out is below with where it came from; change any number and the totals follow. Nothing is saved until you press Create project.</p>
      <Card>
        <CardHead title="Project" sub="Totals use the same engine as the Summary page." />
        <div className="grid gap-3 px-3.5 pb-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Project name" help="projectName"><TextInput value={state.name} placeholder={state.picks.length === 1 ? recipeById(state.picks[0]!)!.label : "New estimate"} onChange={(v) => update((s) => ({ ...s, name: v }))} /></Field>
          <dl className="grid grid-cols-3 gap-2 text-xs sm:col-span-1 lg:col-span-3">
            <div><dt className="text-muted">Build</dt><dd className="num text-[15px] font-semibold">{cad(totals.L.totals.build)}</dd></div>
            <div><dt className="text-muted">Run per month</dt><dd className="num text-[15px] font-semibold">{cad(totals.L.totals.runRate)}</dd></div>
            <div><dt className="text-muted">Payback</dt><dd className="num text-[15px] font-semibold">{totals.r.paybackMonth ? `Month ${totals.r.paybackMonth}` : "Not within the horizon"}</dd></div>
          </dl>
        </div>
      </Card>
      {byFeature.map(({ f, rows, workloads }) => (
        <Card key={f.id}>
          <CardHead title={f.label} sub={`${workloads.length} workload${workloads.length === 1 ? "" : "s"}: ${workloads.map((w) => w.label).join(", ") || "none"}${(p.resources ?? []).some((r) => r.featureId === f.id) ? `. ${(p.resources ?? []).filter((r) => r.featureId === f.id).length} catalogue resource(s), ${(p.currentState?.lines ?? []).filter((l) => l.featureId === f.id).length} current-state line(s).` : ""}`} />
          <AssumptionTable rows={rows} state={state} update={update} />
        </Card>
      ))}
      {general.length > 0 && (
        <Card>
          <CardHead title="Project" sub="Team, length and plan" />
          <AssumptionTable rows={general} state={state} update={update} />
        </Card>
      )}
    </>
  );
}

function AssumptionTable({ rows, state, update }: { rows: Assumption[]; state: WizardState; update: StepProps["update"] }) {
  if (!rows.length) return <p className="px-3.5 pb-3.5 text-[12.5px] text-muted">Nothing derived for this feature.</p>;
  return (
    <div className="overflow-x-auto px-3.5 pb-3.5">
      <table className="data">
        <thead><tr><th>Assumption</th><th>Value</th><th>Where it comes from</th></tr></thead>
        <tbody>
          {rows.map((a) => {
            const edited = state.edits[a.id] !== undefined;
            return (
              <tr key={a.id}>
                <td className="min-w-[200px]">{a.label}{edited && <Pill tone="n">Edited</Pill>}</td>
                <td className="min-w-[150px]">
                  {a.target && typeof a.value === "number"
                    ? <NumberInput label={a.label} value={a.value} min={0} step={a.unit === "share" ? 0.05 : undefined} suffix={a.unit === "share" ? undefined : a.unit} onChange={(n) => update((s) => setEdit(s, a.id, n))} />
                    : <span className="num">{typeof a.value === "number" ? `${fmt(a.value, a.value % 1 ? 2 : 0)} ${a.unit}` : String(a.value)}</span>}
                </td>
                <td className="text-[12px] text-muted">{a.source}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
