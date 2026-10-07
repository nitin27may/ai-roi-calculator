"use client";
import { useMemo, useState } from "react";
import { DEPLOYMENT_LABEL, ptuAnalysis, resolveAssumptions, showsAiPages, sizePtu, type PtuDeployment } from "@roi-calculator/engine";
import { Card, CardHead, Field, NumberInput, Pill, Select } from "@/components/ui";
import { catalog, useLedger } from "@/lib/compute";
import { cad, fmt } from "@/lib/format";

const DEPLOY = [{ value: "global", label: "Global provisioned" }, { value: "dataZone", label: "Data Zone provisioned" }, { value: "regional", label: "Regional provisioned" }];
const NAMES = { payg: "Pay-as-you-go", hourly: "PTU hourly", monthlyReservation: "PTU, 1-month reservation", yearlyReservation: "PTU, 1-year reservation" } as const;

export default function Capacity() {
  const { project, ledger } = useLedger();
  // "own" prices each workload at its own deployment (the default); the others force one deployment for what-if comparison.
  const [choice, setChoice] = useState<PtuDeployment | "own">("own");
  const [peak, setPeak] = useState(resolveAssumptions(project).peakToAverage);
  const deployment: PtuDeployment = choice === "own" ? project.settings.azureDeployment : choice;
  const a = useMemo(() => ptuAnalysis(project, ledger, catalog, { peakToAverage: peak, deployment: choice === "own" ? undefined : choice }), [project, ledger, peak, choice]);
  const rate = catalog.ptu.rates[deployment];
  const anyPtuWins = a.rows.some((r) => r.cheapest !== "payg");
  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {!showsAiPages(project) && (
        <div role="note" data-testid="capacity-not-ai" className="rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2 lg:col-span-2">
          <b>This project has no AI feature, so Capacity (PTU) is left out of the menu.</b> The page still works if you open it by its address. To bring it back, tick AI under Type of change on a feature (Run page, select the feature).
        </div>
      )}
      <Card>
        <CardHead title="Provisioned throughput (PTU) or pay-as-you-go" sub={`Azure models in production at month ${a.month} (first month at full adoption). PTU is sized for peak and billed every hour.`}>
          <div className="flex flex-wrap items-end gap-2.5">
            <Field label="Deployment" help="ptuDeployment"><Select value={choice} options={[{ value: "own", label: "Each workload's own deployment" }, ...DEPLOY]} onChange={(v) => setChoice(v as PtuDeployment | "own")} /></Field>
            <Field label="Peak ÷ average load" help="peakFactor"><NumberInput value={peak} min={1} max={20} step={0.5} onChange={setPeak} /></Field>
          </div>
        </CardHead>
        <div className="min-h-0 flex-1 overflow-auto scroll-hint px-3.5 pb-3.5">
          <div data-testid="capacity-mode" className="mb-3 rounded-r-md border-l-[3px] border-line bg-surface-2 px-3 py-2 text-[12.5px]">
            {project.settings.pricingModel === "ptu"
              ? <><b>This project is priced on provisioned throughput.</b> Azure OpenAI models reserve PTUs on a 1-month term, sized for peak load, and load above capacity spills over to pay-as-you-go; workloads can opt out on their Run page. The table below prices the same load every way for comparison. Models already on PTU are not repeated in the table. Change this in Settings, Pricing model.</>
              : <><b>This project is priced pay-as-you-go, so PTU here is optional and advisory.</b> Nothing on this page changes the totals. If a PTU column wins below, switch Pricing model to Provisioned throughput in Settings, or set it on a single workload.</>}
          </div>
          {project.settings.pricingModel !== "ptu" && <div className="mb-3 rounded-r-md border-l-[3px] border-accent bg-accent-soft px-3 py-2 text-[12.5px]">
            {anyPtuWins
              ? <>At this load, <b>PTU is cheaper for {a.rows.filter((r) => r.cheapest !== "payg").map((r) => r.label).join(", ")}</b>. Check the utilization: PTU only pays when the deployment stays busy.</>
              : <><b>Pay-as-you-go is cheaper for every model here.</b> Microsoft prices a fully used PTU at about the pay-as-you-go cost of the same tokens, so a reservation only breaks even near the utilization shown. Buy PTU for guaranteed latency and throughput, not to save money.</>}
          </div>}
          {a.rows.length === 0 ? <p className="text-sm text-muted">No Azure OpenAI models with a PTU table are used in production.</p> : (
            <table className="data">
              <thead><tr><th>Model</th><th>Deployment</th><th className="n">Tokens / month</th><th className="n">PTUs for peak</th><th className="n">Utilization</th><th className="n">PAYG</th><th className="n">PTU hourly</th><th className="n">1-month res.</th><th className="n">1-year res.</th><th className="n">Break-even (1-mo / 1-yr)</th></tr></thead>
              <tbody>
                {a.rows.map((r) => {
                  const cell = (k: keyof typeof NAMES, v: number) => <td className="n" style={r.cheapest === k ? { background: "var(--good-soft)", fontWeight: 600 } : undefined}>{cad(v)}</td>;
                  return (
                    <tr key={`${r.deployment}|${r.modelId}`}>
                      <td className="whitespace-nowrap">{r.label}</td>
                      <td className="whitespace-nowrap">{DEPLOYMENT_LABEL[r.deployment]}</td>
                      <td className="n">{fmt((r.monthlyTokens.input + r.monthlyTokens.cachedInput + r.monthlyTokens.output) / 1e6, 1)}M</td>
                      <td className="n">{r.ptus}</td>
                      <td className="n">{fmt(r.utilization * 100)}%</td>
                      {cell("payg", r.payg)}{cell("hourly", r.hourly)}{cell("monthlyReservation", r.monthlyReservation)}{cell("yearlyReservation", r.yearlyReservation)}
                      <td className="n">{fmt(r.breakEvenMonthly * 100)}% / {fmt(r.breakEvenYearly * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {a.unsupported.length > 0 && <p className="mt-2 text-xs text-muted">No PTU table for: {a.unsupported.map((u) => u.label).join(", ")} (pay-as-you-go only in this view).</p>}
          <p className="mt-3 text-xs text-muted">
            Sizing follows Microsoft's method: uncached input plus output × the model's output ratio, divided by input tokens per minute per PTU, rounded up to the increment (minimum 15 for Global and Data Zone). Cached input uses no PTU capacity.
            Rates per PTU: {cad(rate.hourly, 2)}/hour, {cad(rate.monthlyReservation)} per month on a 1-month reservation, {cad(rate.yearlyReservationPerMonth)} per month on a 1-year reservation. <Pill tone={catalog.ptu.confidence === "verified" ? "ok" : "warn"}>{catalog.ptu.confidence}</Pill>
          </p>
        </div>
      </Card>
      <Calculator deployment={deployment} />
    </div>
  );
}

function Calculator({ deployment }: { deployment: PtuDeployment }) {
  const [modelId, setModelId] = useState("gpt-5.4");
  const [rpm, setRpm] = useState(1000);
  const [prompt, setPrompt] = useState(2000);
  const [response, setResponse] = useState(400);
  const [cache, setCache] = useState(50);
  const s = sizePtu(catalog, modelId, { input: rpm * prompt * (1 - cache / 100), cachedInput: rpm * prompt * (cache / 100), output: rpm * response }, deployment);
  const rate = catalog.ptu.rates[deployment];
  return (
    <Card>
      <CardHead title="Size a deployment" sub="Peak requests per minute and request size" />
      <div className="flex flex-col gap-3 px-3.5 pb-3.5">
        <Field label="Model" help="ptuModel"><Select value={modelId} options={catalog.ptu.models.map((m) => ({ value: m.modelId, label: catalog.chatModels.find((c) => c.id === m.modelId)?.label ?? m.modelId }))} onChange={setModelId} /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Peak requests / minute" help="peakRpm"><NumberInput value={rpm} onChange={setRpm} /></Field>
          <Field label="Cached share of prompt" help="cachedShare"><NumberInput value={cache} max={100} suffix="%" onChange={setCache} /></Field>
          <Field label="Prompt tokens" help="ptuPrompt"><NumberInput value={prompt} onChange={setPrompt} /></Field>
          <Field label="Response tokens" help="ptuResponse"><NumberInput value={response} onChange={setResponse} /></Field>
        </div>
        {s && (
          <table className="data">
            <tbody>
              <tr><td>Weighted tokens / minute</td><td className="n">{fmt(s.normTpm)}</td></tr>
              <tr><td>PTUs ({fmt(s.raw, 1)} → increment {s.increment}, minimum {s.min})</td><td className="n"><b>{s.ptus}</b></td></tr>
              <tr><td>Hourly, per month</td><td className="n">{cad(s.ptus * rate.hourly * 730)}</td></tr>
              <tr><td>1-month reservation</td><td className="n">{cad(s.ptus * rate.monthlyReservation)}</td></tr>
              <tr><td>1-year reservation, per month</td><td className="n">{cad(s.ptus * rate.yearlyReservationPerMonth)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
