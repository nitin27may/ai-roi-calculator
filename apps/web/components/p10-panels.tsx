"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { DEPLOYMENT_LABEL, HOSTING_PRESETS, IMAGE_SIZES, PriceBook, hostingItemMeta, imageCost, requestVolumes, steadyState, type HostingItem, type Workload } from "@studio/engine";
import { Field, NumberInput, Pill, Select, TextInput, TrashButton } from "@/components/ui";
import { catalog, useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, fmt } from "@/lib/format";

const btn = "flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2";
const CONFIDENCE_TONE = { verified: "ok", "cross-checked": "ok", "single-source": "warn", unverified: "crit", "enter-your-own": "warn" } as const;
const CONFIDENCE_LABEL = { verified: "verified", "cross-checked": "cross-checked", "single-source": "single source", unverified: "unverified", "enter-your-own": "enter your own" } as const;

type Of<K extends Workload["kind"]> = Extract<Workload, { kind: K }>;
type Capable = Of<"chat"> | Of<"llm"> | Of<"agent">;

function useWorkloadEdit<K extends Workload["kind"]>(id: string, kind: K) {
  const edit = useStudio((s) => s.edit);
  return (fn: (x: Of<K>) => void) => edit((d) => { const x = d.workloads.find((y) => y.id === id); if (x?.kind === kind) fn(x as Of<K>); });
}

/** Hosting and platform stack (E7): presets that add priced items, plus a table of the items with their source and confidence. */
export function HostingPanel({ w }: { w: Of<"hosting"> }) {
  const { project, ledger } = useLedger();
  const upd = useWorkloadEdit(w.id, "hosting");
  const steady = steadyState(ledger);
  const [presetId, setPresetId] = useState(HOSTING_PRESETS[0]!.id);
  const preset = HOSTING_PRESETS.find((p) => p.id === presetId)!;
  const volumes = [...requestVolumes(project.workloads)].filter(([id]) => id !== w.id);
  const costOf = (itemId: string) => steady.lines.filter((l) => l.id === `${w.id}:${itemId}`).reduce((s, l) => s + l.cost, 0);
  const addPreset = () => upd((x) => {
    const taken = new Set(x.items.map((i) => i.id));
    for (const it of preset.items) {
      let id = `${preset.id}-${it.id}`, n = 2;
      while (taken.has(id)) id = `${preset.id}-${it.id}-${n++}`;
      taken.add(id);
      x.items.push({ ...structuredClone(it), id });
    }
  });
  const setItem = (i: number, fn: (it: HostingItem) => void) => upd((x) => { const it = x.items[i]; if (it) fn(it); });
  const priceOptions = catalog.unitPrices.filter((u) => u.platform !== "snowflake").map((u) => ({ value: u.id, label: `${u.label} (${u.unit})` }));
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Where the request count comes from</h3>
        <div className="max-w-sm">
          <Field label="Request volume" help="hostingVolumeFrom">
            <Select value={w.volumeFrom ?? ""} onChange={(v) => upd((x) => { if (v) x.volumeFrom = v; else delete x.volumeFrom; })}
              options={[{ value: "", label: "Entered above" }, ...volumes.map(([id, n]) => ({ value: id, label: `${project.workloads.find((y) => y.id === id)?.label ?? id} (${fmt(n)} a month)` }))]} />
          </Field>
        </div>
      </div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Add a preset</h3>
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-64"><Field label="Preset" help="hostingPreset"><Select value={presetId} onChange={setPresetId} options={HOSTING_PRESETS.map((p) => ({ value: p.id, label: p.label }))} /></Field></div>
          <button type="button" className={btn} onClick={addPreset}><Plus size={14} />Add its items</button>
        </div>
        <p className="mt-1.5 text-xs text-muted">{preset.summary}</p>
        <ul className="mt-1 list-disc pl-5 text-xs text-muted">{preset.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      </div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Items</h3>
        {w.items.length === 0 ? <p className="text-xs text-muted">No items yet. Add a preset above.</p> : (
          <table className="data">
            <thead><tr><th>Item</th><th>Billed</th><th className="n">Amount</th><th>Source</th><th className="n">C$ / month</th><th /></tr></thead>
            <tbody>
              {w.items.map((it, i) => {
                const m = hostingItemMeta(it, catalog);
                return (
                  <tr key={it.id}>
                    <td className="min-w-40">
                      <TextInput label={`Name, hosting item ${i + 1}`} value={it.label} onChange={(v) => setItem(i, (x) => { x.label = v; })} />
                      {it.basis !== "cash" && <Select label={`Catalogue price, ${it.label}`} value={it.unitPriceId} options={priceOptions} onChange={(v) => setItem(i, (x) => { if (x.basis !== "cash") x.unitPriceId = v; })} />}
                    </td>
                    <td className="whitespace-nowrap text-xs">{it.basis === "fixed" ? `${catalog.unitPrices.find((u) => u.id === it.unitPriceId)?.unit ?? "unit"}, fixed` : it.basis === "perRequests" ? "per 1,000 requests" : "CAD a month"}</td>
                    <td className="n w-28">
                      {it.basis === "fixed" && <NumberInput label={`Quantity, ${it.label}`} value={it.quantity} onChange={(v) => setItem(i, (x) => { if (x.basis === "fixed") x.quantity = v; })} />}
                      {it.basis === "perRequests" && <NumberInput label={`Units per 1,000 requests, ${it.label}`} value={it.unitsPer1KRequests} step={0.001} onChange={(v) => setItem(i, (x) => { if (x.basis === "perRequests") x.unitsPer1KRequests = v; })} />}
                      {it.basis === "cash" && <NumberInput label={`CAD a month, ${it.label}`} value={it.amountCad} onChange={(v) => setItem(i, (x) => { if (x.basis === "cash") x.amountCad = v; })} />}
                    </td>
                    <td className="text-xs">{m.source} <Pill tone={CONFIDENCE_TONE[m.confidence]}>{CONFIDENCE_LABEL[m.confidence]}</Pill>{it.basis === "cash" && it.note && <div className="mt-0.5 max-w-64 whitespace-normal text-muted">{it.note}</div>}</td>
                    <td className="n">{cad(costOf(it.id))}</td>
                    <td><TrashButton label={`Remove ${it.label}`} onClick={() => upd((x) => { x.items.splice(i, 1); })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <button type="button" className={`${btn} mt-2`} onClick={() => upd((x) => { x.items.push({ basis: "cash", id: `own-${x.items.length + 1}-${Math.random().toString(36).slice(2, 6)}`, label: "Your own item", amountCad: 0 }); })}><Plus size={14} />Add an amount of your own</button>
        <p className="mt-1.5 text-xs text-muted">Prices come from the Azure Retail Prices API for Canada Central, as of the catalogue date. Where there is no verified price (AKS node virtual machines, private endpoints) the item is an amount you enter, and it starts at C$0.</p>
      </div>
    </div>
  );
}

const FEE_CATALOGUE = ["bing-grounding", "mai-web-grounding", "code-interpreter"] as const;

/** Built-in tool fees (E15) for chat and agent workloads: catalogue prices where they exist, your own price per 1,000 calls otherwise. */
export function ToolFeesPanel({ w }: { w: Of<"chat"> | Of<"agent"> }) {
  const upd = useWorkloadEdit(w.id, w.kind);
  const fees = w.toolFees ?? [];
  const per = w.kind === "chat" ? "per chat turn" : "per task";
  const options = [
    ...FEE_CATALOGUE.map((id) => { const u = catalog.unitPrices.find((x) => x.id === id); return { value: id, label: u ? `${u.label} (${cad(u.price ?? 0, 2)} per ${u.unit})` : id }; }),
    { value: "own", label: "Your own price per 1,000 calls" },
  ];
  const setFee = (i: number, fn: (f: NonNullable<(Of<"chat"> | Of<"agent">)["toolFees"]>[number]) => void) => upd((x) => { const f = x.toolFees?.[i]; if (f) fn(f); });
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Built-in tool fees</h3>
      {fees.length > 0 && (
        <table className="data">
          <thead><tr><th>Tool</th><th className="n">Calls {per}</th><th className="n">CAD per 1,000 calls</th><th /></tr></thead>
          <tbody>
            {fees.map((f, i) => (
              <tr key={i}>
                <td className="min-w-48">
                  <Select label={`Tool price, fee ${i + 1}`} value={f.unitPriceId ?? "own"} options={options}
                    onChange={(v) => setFee(i, (x) => { if (v === "own") { delete x.unitPriceId; x.cadPer1KCalls = x.cadPer1KCalls ?? 0; } else { x.unitPriceId = v; delete x.cadPer1KCalls; } })} />
                  {f.unitPriceId === undefined && <TextInput label={`Tool name, fee ${i + 1}`} value={f.label ?? ""} placeholder="Web search, file search, computer use" onChange={(v) => setFee(i, (x) => { if (v) x.label = v; else delete x.label; })} />}
                </td>
                <td className="n w-28"><NumberInput label={`Calls ${per}, fee ${i + 1}`} value={f.perTask} step={0.1} onChange={(v) => setFee(i, (x) => { x.perTask = v; })} /></td>
                <td className="n w-32">
                  {f.unitPriceId === undefined
                    ? <NumberInput label={`CAD per 1,000 calls, fee ${i + 1}`} value={f.cadPer1KCalls ?? 0} step={0.01} onChange={(v) => setFee(i, (x) => { x.cadPer1KCalls = v; })} />
                    : <span className="text-xs text-muted">catalogue price</span>}
                </td>
                <td><TrashButton label={`Remove tool fee ${i + 1}`} onClick={() => upd((x) => { x.toolFees?.splice(i, 1); })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className={`${btn} mt-2`} onClick={() => upd((x) => { x.toolFees = [...(x.toolFees ?? []), { unitPriceId: "mai-web-grounding", perTask: 1 }]; })}><Plus size={14} />Add a tool fee</button>
      <p className="mt-1.5 text-xs text-muted">Catalogue prices cover Grounding with Bing, web grounding in the MAI models and the Agent Service code interpreter. OpenAI web search, file search calls and computer use have no verified price in the catalogue, so pick &quot;Your own price&quot; and enter the figure from your agreement. Nothing is assumed.</p>
      {fees.length > 0 && <p className="mt-1 text-xs text-muted">Fees are per tool call and scale with usage. Counts are {per}.</p>}
    </div>
  );
}

/** Image input (E15): images per call, size and detail, converted to tokens with the model's documented formula. */
export function ImagesPanel({ w }: { w: Of<"chat"> | Of<"llm"> }) {
  const upd = useWorkloadEdit(w.id, w.kind);
  const img = w.images;
  const model = catalog.chatModels.find((m) => m.id === w.modelId);
  const set = (fn: (i: NonNullable<(Of<"chat"> | Of<"llm">)["images"]>) => void) => upd((x) => { x.images = x.images ?? { perCall: 0, widthPx: 1024, heightPx: 768, detail: "high" }; fn(x.images); });
  const sizeId = IMAGE_SIZES.find((s) => s.widthPx === img?.widthPx && s.heightPx === img?.heightPx)?.id ?? "custom";
  const cost = model && img && img.perCall > 0 ? imageCost(model, img) : undefined;
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Images in the prompt</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-2.5">
        <Field label={w.kind === "chat" ? "Images per turn" : "Images per call"} help="imagesPerCall"><NumberInput value={img?.perCall ?? 0} step={0.5} onChange={(v) => set((i) => { i.perCall = v; })} /></Field>
        <Field label="Image size" help="imageSize">
          <Select value={sizeId} options={[...IMAGE_SIZES.map((s) => ({ value: s.id, label: s.label })), { value: "custom", label: "Custom" }]}
            onChange={(v) => { const s = IMAGE_SIZES.find((x) => x.id === v); if (s) set((i) => { i.widthPx = s.widthPx; i.heightPx = s.heightPx; }); }} />
        </Field>
        <Field label="Width in pixels" help="imageWidth"><NumberInput value={img?.widthPx ?? 1024} min={1} onChange={(v) => set((i) => { i.widthPx = Math.max(1, Math.round(v)); })} /></Field>
        <Field label="Height in pixels" help="imageHeight"><NumberInput value={img?.heightPx ?? 768} min={1} onChange={(v) => set((i) => { i.heightPx = Math.max(1, Math.round(v)); })} /></Field>
        <Field label="Detail" help="imageDetail"><Select value={img?.detail ?? "high"} options={[{ value: "high", label: "High" }, { value: "low", label: "Low" }]} onChange={(v) => set((i) => { i.detail = v === "low" ? "low" : "high"; })} /></Field>
      </div>
      {cost && <p className="mt-1.5 text-xs text-muted">{cost.supported ? <>{cost.formula}. That adds {fmt(cost.perCall)} input tokens to every {w.kind === "chat" ? "turn" : "call"}.</> : <>{cost.formula}.</>}</p>}
      <p className="mt-1 text-xs text-muted">Formulas follow the OpenAI and Anthropic vision guides: tiles for GPT-4o, 4.1 and 5, 32-pixel patches for the mini, nano and newer models, width times height over 750 for Claude. Other models, including MAI image models, have no verified price or formula here and add nothing.</p>
    </div>
  );
}

/** PTU mode and TPM quota check (E8). Off by default, which keeps existing totals unchanged. */
export function CapacityPanel({ w }: { w: Capable }) {
  const upd = useWorkloadEdit(w.id, w.kind);
  const { project } = useLedger();
  const book = new PriceBook(catalog, project.settings).withDeployment(w.deployment);
  const dep = book.settings.azureDeployment;
  const ptu = w.ptu;
  const onPtuTable = catalog.ptu.models.some((m) => m.modelId === w.modelId);
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Capacity</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-3 gap-y-2.5">
        <Field label="Billing mode" help="ptuMode">
          <Select value={ptu ? "ptu" : "payg"} options={[{ value: "payg", label: "Pay-as-you-go" }, { value: "ptu", label: "Provisioned (PTU) plus spillover" }]}
            onChange={(v) => upd((x) => { if (v === "ptu") x.ptu = { term: "monthly" }; else delete x.ptu; })} />
        </Field>
        {ptu && (
          <>
            <Field label="PTUs reserved (0 = size for peak)" help="ptuCount"><NumberInput value={ptu.ptus ?? 0} onChange={(v) => upd((x) => { if (x.ptu) { if (v > 0) x.ptu.ptus = Math.round(v); else delete x.ptu.ptus; } })} /></Field>
            <Field label="Term" help="ptuTerm"><Select value={ptu.term} options={[{ value: "hourly", label: "Hourly" }, { value: "monthly", label: "1-month reservation" }, { value: "yearly", label: "1-year reservation" }]} onChange={(v) => upd((x) => { if (x.ptu) x.ptu.term = v as "hourly" | "monthly" | "yearly"; })} /></Field>
            <Field label="Spillover to pay-as-you-go" help="ptuSpill">
              <Select value={ptu.spilloverShare === undefined ? "auto" : "custom"} options={[{ value: "auto", label: "Automatic (load above capacity)" }, { value: "custom", label: "A share I set" }]}
                onChange={(v) => upd((x) => { if (x.ptu) { if (v === "auto") delete x.ptu.spilloverShare; else x.ptu.spilloverShare = 0.1; } })} />
            </Field>
            {ptu.spilloverShare !== undefined && <Field label="Spillover share" help="ptuSpillShare"><NumberInput value={Math.round(ptu.spilloverShare * 1000) / 10} max={100} suffix="%" onChange={(v) => upd((x) => { if (x.ptu) x.ptu.spilloverShare = v / 100; })} /></Field>}
          </>
        )}
        <Field label="TPM quota (0 = no check)" help="tpmQuota"><NumberInput value={w.tpmQuota ?? 0} onChange={(v) => upd((x) => { if (v > 0) x.tpmQuota = v; else delete x.tpmQuota; })} /></Field>
      </div>
      {ptu && <p className="mt-1.5 text-xs text-muted">Priced at this workload&apos;s own deployment ({DEPLOYMENT_LABEL[dep]}), not Global. {onPtuTable ? "The reserved capacity is a fixed monthly line; the share of load beyond it stays pay-as-you-go." : "This model is not offered on provisioned throughput, so it stays pay-as-you-go and an alert says so."}</p>}
      <p className="mt-1 text-xs text-muted">The quota check compares the peak tokens a minute (average load times the peak factor in Settings) with the quota you enter and raises an alert on the Overview page. It never changes a cost.</p>
    </div>
  );
}
