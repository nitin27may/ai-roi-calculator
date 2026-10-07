"use client";
import { Fragment, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { environmentCostRows, infrastructureSummary, resourceCostRows, type Environment, type Resource } from "@roi-calculator/engine";
import { AddMenu } from "@/components/add-menu";
import { InlineConfirm } from "@/components/cost-grid";
import { FeatureSelect } from "@/components/feature-fields";
import { HelpTip } from "@/components/help-tip";
import { Card, Field, Formula, NumberInput, Pill, Select, TrashButton, inputCls } from "@/components/ui";
import { catalog, useLedger, useResourcesReady, useResourceVersion } from "@/lib/compute";
import { cad, cn } from "@/lib/format";
import {
  CATEGORY_LABEL, ENV_QUICK_ADDS, TERM_LABEL, filterSkus, newEnvironment, newResource, pickerCategories, removeEnvironment, resourceEnvIds, setMonthBound,
  setResourceSku, setScheduleMode, supportsAhb, termOptions, toggleResourceEnv,
} from "@/lib/infrastructure";
import { useStudio } from "@/lib/store";

const textIn = "min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";
const small = "text-xs text-muted";

function Th({ children, help }: { children: string; help?: string }) {
  return <th className="whitespace-nowrap align-bottom"><span className="inline-flex items-center gap-0.5">{children}{help && <HelpTip id={help} label={children} />}</span></th>;
}

/** The strip of totals at the top: what the environments cost in build and in production, production against non-production. */
export function InfrastructureSummary() {
  const { project, ledger } = useLedger();
  const s = useMemo(() => infrastructureSummary(project, ledger), [project, ledger]);
  const B = project.timeline.buildMonths;
  if (!project.resources?.length) return null;
  const tiles: [string, string, string][] = [
    [`Build, months 1–${B}`, cad(s.buildTotal), "All resources, all environments"],
    ["Production, per month", cad(s.productionMonthly), "Production environments while billed"],
    ["Non-production, per month", cad(s.nonProductionMonthly), "Dev, test, UAT and the rest, while billed"],
    ["Run rate at steady state", cad(s.steadyMonthly), "Resources billed a month once live"],
    ["Whole plan", cad(s.planTotal), "Build and production together"],
  ];
  return (
    <dl aria-label="Infrastructure totals" className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12.5px] sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map(([k, v, d]) => (
        <div key={k}><dt className="text-muted">{k}</dt><dd className="num text-base font-semibold">{v}</dd><dd className={small}>{d}</dd></div>
      ))}
    </dl>
  );
}

const ENV_DEFAULT_NOTE = "No environments defined: every resource is priced as production, 730 hours a month.";

export function EnvironmentsGrid() {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [confirm, setConfirm] = useState<string | null>(null);
  const envs = project.environments ?? [];
  const costs = useMemo(() => environmentCostRows(project, ledger), [project, ledger]);
  const cost = (id: string) => costs.find((c) => c.envId === id);
  const total = envs.reduce((s, e) => s + (cost(e.id)?.monthly ?? 0), 0);
  const upd = (id: string, fn: (e: Environment) => void) => edit((d) => { const e = d.environments?.find((x) => x.id === id); if (e) fn(e); });
  const nameOf = (e: Environment) => e.label || "this environment";

  return (
    <section aria-labelledby="envs-h" className="flex flex-col gap-3">
      <div>
        <h2 id="envs-h" className="inline-flex items-center gap-1 text-base font-bold">Environments<HelpTip id="environmentLabel" label="Environments" /></h2>
        <p className={small}>Resources are defined once, as production. Each environment runs them at its own size and schedule. The monthly cost is read at the first month the environment is billed.</p>
      </div>

      {envs.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">{ENV_DEFAULT_NOTE}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data min-w-[1100px]">
            <thead>
              <tr>
                <Th help="environmentLabel">Label</Th><Th help="environmentProduction">Production</Th><Th help="environmentSizeFactor">Size factor</Th>
                <Th help="environmentSchedule">Schedule</Th><Th help="environmentMonths">First month</Th><Th help="environmentMonths">Last month</Th>
                <Th help="environmentPricing">Pricing</Th><th className="n whitespace-nowrap">Cost / month</th><th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {envs.map((e) => {
                const perDay = "hoursPerDay" in e.schedule;
                const c = cost(e.id);
                const names = (c?.resourceIds ?? []).map((id) => project.resources?.find((r) => r.id === id)?.label || "Unnamed resource");
                return (
                  <Fragment key={e.id}>
                    <tr className="align-top">
                      <td><input className={cn(textIn, "w-32")} value={e.label} placeholder="Name" aria-label={`Name of ${nameOf(e)}`} onChange={(ev) => upd(e.id, (x) => { x.label = ev.target.value; })} /></td>
                      <td><input type="checkbox" className="mt-2" checked={e.production} aria-label={`${nameOf(e)} is production`} onChange={(ev) => upd(e.id, (x) => { x.production = ev.target.checked; })} /></td>
                      <td className="w-24"><NumberInput label={`Size factor of ${nameOf(e)}`} value={e.sizeFactor} step={0.1} onChange={(v) => upd(e.id, (x) => { x.sizeFactor = v; })} /></td>
                      <td>
                        <div className="flex min-w-[230px] flex-col gap-1.5">
                          <Select label={`Schedule type of ${nameOf(e)}`} value={perDay ? "perDay" : "perMonth"} options={[{ value: "perMonth", label: "Hours a month" }, { value: "perDay", label: "Hours a day x days a month" }]}
                            onChange={(m) => upd(e.id, (x) => setScheduleMode(x, m as "perDay" | "perMonth"))} />
                          {"hoursPerDay" in e.schedule ? (
                            <div className="grid grid-cols-2 gap-1.5">
                              <NumberInput label={`Hours a day for ${nameOf(e)}`} value={e.schedule.hoursPerDay} max={24} suffix="h / day" onChange={(v) => upd(e.id, (x) => { if ("hoursPerDay" in x.schedule) x.schedule.hoursPerDay = v; })} />
                              <NumberInput label={`Days a month for ${nameOf(e)}`} value={e.schedule.daysPerMonth} max={31} suffix="days" onChange={(v) => upd(e.id, (x) => { if ("hoursPerDay" in x.schedule) x.schedule.daysPerMonth = v; })} />
                            </div>
                          ) : (
                            <NumberInput label={`Hours a month for ${nameOf(e)}`} value={e.schedule.hoursPerMonth} max={744} suffix="h / month" onChange={(v) => upd(e.id, (x) => { if ("hoursPerMonth" in x.schedule) x.schedule.hoursPerMonth = v; })} />
                          )}
                        </div>
                      </td>
                      <td className="w-24"><input className={cn(inputCls, "w-full")} type="number" min={1} step={1} placeholder="Phase" aria-label={`First billed month of ${nameOf(e)}`} value={e.fromMonth ?? ""} onChange={(ev) => upd(e.id, (x) => setMonthBound(x, "fromMonth", ev.target.value))} /></td>
                      <td className="w-24"><input className={cn(inputCls, "w-full")} type="number" min={1} step={1} placeholder="Phase" aria-label={`Last billed month of ${nameOf(e)}`} value={e.toMonth ?? ""} onChange={(ev) => upd(e.id, (x) => setMonthBound(x, "toMonth", ev.target.value))} /></td>
                      <td className="min-w-[150px]"><Select label={`Pricing of ${nameOf(e)}`} value={e.pricing} options={[{ value: "payg", label: "Pay-as-you-go" }, { value: "devtest", label: "Dev/test" }]} onChange={(v) => upd(e.id, (x) => { x.pricing = v as Environment["pricing"]; })} /></td>
                      <td className="n">{cad(c?.monthly ?? 0)}</td>
                      <td><TrashButton label={`Remove ${nameOf(e)}`} onClick={() => setConfirm(e.id)} /></td>
                    </tr>
                    {confirm === e.id && (
                      <tr>
                        <td colSpan={9}>
                          <div className="sticky left-0 max-w-[760px]">
                            <InlineConfirm groupLabel="Confirm remove" confirmLabel="Remove environment"
                              message={`Remove ${nameOf(e)}? ${names.length === 0 ? "No resource is billed in it, so no cost changes." : `${names.join(", ")} stop${names.length === 1 ? "s" : ""} being billed in it, so ${cad(c?.monthly ?? 0)} a month leaves the Summary, Overview and Excel.`} You can undo it straight after.`}
                              onConfirm={() => { edit((d) => removeEnvironment(d, e.id)); setConfirm(null); }} onCancel={() => setConfirm(null)} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={7} className="font-semibold">Total</td><td className="n font-semibold">{cad(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      <p className={small}>An empty month uses the edge of the phase: month 1 to the end of the build for non-production, go-live to the end of the plan for production.</p>

      <AddMenu label="Add environment" items={ENV_QUICK_ADDS.map((q) => ({ kind: q.kind, label: q.label, detail: q.detail }))}
        onPick={(k) => edit((d) => { d.environments = [...(d.environments ?? []), newEnvironment(k, d.environments ?? [])]; })} />
    </section>
  );
}

/** Category, then type, then SKU through a filter: scales to hundreds of SKUs. Nothing is chosen until the user picks. */
function ResourcePicker({ onAdd }: { onAdd: (typeId: string, skuId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [typeId, setTypeId] = useState("");
  const [filter, setFilter] = useState("");
  const panel = useId();
  const version = useResourceVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cats = useMemo(() => pickerCategories(catalog.resourceTypes), [version]);
  const types = cats.find((c) => c.category === category)?.types ?? [];
  const type = types.find((t) => t.id === typeId);
  const found = type ? filterSkus(type, filter) : { shown: [], total: 0 };
  const close = () => { setOpen(false); setCategory(""); setTypeId(""); setFilter(""); };
  return (
    <div className="flex flex-col gap-2">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => (open ? close() : setOpen(true))}
        className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2">
        Add resource<ChevronDown size={14} aria-hidden className={cn("transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <div id={panel} inert={!open} className={cn("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex max-w-3xl flex-col gap-2.5 rounded-lg border border-line bg-surface-2 p-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Category" help="resourceCategory">
                <Select value={category} options={[{ value: "", label: "Choose a category" }, ...cats.map((c) => ({ value: c.category, label: `${CATEGORY_LABEL[c.category] ?? c.category} (${c.types.length})` }))]} onChange={(v) => { setCategory(v); setTypeId(""); setFilter(""); }} />
              </Field>
              <Field label="Resource type" help="resourceType">
                <Select value={typeId} options={[{ value: "", label: category ? "Choose a type" : "Choose a category first" }, ...types.map((t) => ({ value: t.id, label: `${t.label} (${t.skus.length})` }))]} onChange={(v) => { setTypeId(v); setFilter(""); }} />
              </Field>
            </div>
            {type && (
              <div className="flex flex-col gap-1.5">
                <Field label={`Size or tier of ${type.label}`} help="resourceSku">
                  <input className={cn(inputCls, "font-sans")} type="search" value={filter} placeholder={`Filter ${type.skus.length} options`} onChange={(e) => setFilter(e.target.value)} />
                </Field>
                <ul aria-label={`${type.label} options`} className="max-h-56 overflow-auto rounded-md border border-line bg-surface">
                  {found.shown.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="block w-full border-b border-line px-3 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                        onClick={() => { onAdd(type.id, s.id); close(); }}>{s.label}</button>
                    </li>
                  ))}
                  {found.total === 0 && <li className="px-3 py-2 text-xs text-muted">No option matches &quot;{filter}&quot;.</li>}
                </ul>
                <span className={small}>{found.total > found.shown.length ? `Showing ${found.shown.length} of ${found.total}. Type more to narrow the list.` : `${found.total} option${found.total === 1 ? "" : "s"}. Choosing one adds the resource.`}</span>
              </div>
            )}
            <button type="button" onClick={close} className="w-fit rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({ r }: { r: Resource }) {
  const { project, ledger } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [confirm, setConfirm] = useState(false);
  const envs = project.environments ?? [];
  const row = useMemo(() => resourceCostRows(project, ledger).find((x) => x.resourceId === r.id), [project, ledger, r.id]);
  const type = catalog.resourceTypes.find((t) => t.id === r.typeId);
  const sku = type?.skus.find((s) => s.id === r.skuId);
  const upd = (fn: (x: Resource) => void) => edit((d) => { const x = d.resources?.find((y) => y.id === r.id); if (x) fn(x); });
  const terms = type ? termOptions(catalog, type, r.skuId) : (["payg"] as const);
  const selected = new Set(resourceEnvIds(r, envs));
  const noQuantity = type ? type.inputs.every((i) => !(r.inputs[i.id] > 0)) : false;
  const notes = [...(row?.notes ?? []), ...(noQuantity ? ["Enter a quantity: with none the resource costs nothing."] : []), ...(envs.length && selected.size === 0 ? ["Not in any environment, so it is not costed."] : [])];
  const billed = row?.perEnv.filter((c) => c.monthly > 0) ?? [];
  const catalogue = type ? CATEGORY_LABEL[type.category] ?? type.category : "";

  return (
    <article aria-label={`Resource ${r.label}`} className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input aria-label={`Name of ${r.label || "resource"}`} className="w-full max-w-md rounded border border-transparent bg-transparent px-1 py-0.5 font-display text-base font-bold hover:border-line focus:border-line" value={r.label} placeholder="Name" onChange={(e) => upd((x) => { x.label = e.target.value; })} />
          <div className="px-1 text-xs text-muted">{type ? `${catalogue}, ${type.label}` : `${r.typeId} (not in the catalogue)`}{sku ? "" : `, ${r.skuId} (not in the catalogue)`}</div>
        </div>
        <div className="text-right"><div className="num text-base font-semibold">{cad(row?.monthly ?? 0)}</div><div className={small}>a month, all environments</div></div>
        <TrashButton label={`Remove ${r.label || "resource"}`} onClick={() => setConfirm(true)} />
      </div>

      {confirm && (
        <InlineConfirm groupLabel="Confirm remove" confirmLabel="Remove resource"
          message={`Remove ${r.label || "this resource"}? It stops being billed in ${billed.length ? billed.map((c) => c.envLabel).join(", ") : "every environment"}, so ${cad(row?.monthly ?? 0)} a month leaves the Summary, Overview and Excel. You can undo it straight after.`}
          onConfirm={() => { edit((d) => { d.resources = (d.resources ?? []).filter((x) => x.id !== r.id); }); setConfirm(false); }} onCancel={() => setConfirm(false)} />
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        {type && (
          <Field label="Size or tier" help="resourceSku">
            <Select value={r.skuId} options={type.skus.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => upd((x) => setResourceSku(catalog, x, type, v))} />
          </Field>
        )}
        {type?.inputs.map((i) => (
          <Field key={i.id} label={i.label} help="resourceQuantity">
            <NumberInput value={r.inputs[i.id] ?? 0} suffix={i.unit} onChange={(v) => upd((x) => { x.inputs = { ...x.inputs, [i.id]: v }; })} />
          </Field>
        ))}
        <Field label="Term" help="resourceTerm">
          <Select value={r.term} options={terms.map((t) => ({ value: t, label: TERM_LABEL[t] }))} onChange={(v) => upd((x) => { x.term = v as Resource["term"]; })} />
        </Field>
        <FeatureSelect value={r.featureId} onChange={(v) => upd((x) => { if (v) x.featureId = v; else delete x.featureId; })} />
      </div>

      <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
        {type && supportsAhb(type) && (
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" checked={r.ahb} onChange={(e) => upd((x) => { x.ahb = e.target.checked; })} />Azure Hybrid Benefit<HelpTip id="resourceAhb" label="Azure Hybrid Benefit" />
          </label>
        )}
        {envs.length > 0 ? (
          <fieldset className="min-w-0">
            <legend className="mb-1 flex items-center gap-0.5 text-xs text-muted">Exists in<HelpTip id="resourceEnvironments" label="Exists in" /></legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {envs.map((e) => (
                <label key={e.id} className="flex items-center gap-1.5 text-[13px] text-ink-2">
                  <input type="checkbox" checked={selected.has(e.id)} onChange={(ev) => upd((x) => toggleResourceEnv(x, envs, e.id, ev.target.checked))} />{e.label || "Unnamed"}
                </label>
              ))}
            </div>
            <span className={small}>{r.envIds ? "Only the ticked environments." : "All environments."}</span>
          </fieldset>
        ) : (
          <span className={small}>No environments defined: priced as production, 730 hours a month.</span>
        )}
      </div>

      {row && row.perEnv.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data min-w-[640px]">
            <thead><tr><th>Environment</th><th className="n">Month read</th><th className="n">Cost / month</th><th>How it is calculated</th></tr></thead>
            <tbody>
              {row.perEnv.map((c) => (
                <tr key={c.envId ?? "prod"}>
                  <td className="whitespace-nowrap">{c.envLabel} {c.production ? <Pill>production</Pill> : null}</td>
                  <td className="n">{c.month ? `M${c.month}` : "not billed"}</td>
                  <td className="n">{cad(c.monthly)}</td>
                  <td><Formula>{c.formulas.length ? c.formulas.join("\n") : "Not billed in any month of the plan."}</Formula></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notes.length > 0 && (
        <ul aria-label={`Notes for ${r.label}`} className="flex flex-col gap-1">
          {notes.map((n) => <li key={n}><Pill tone="warn">{n}</Pill></li>)}
        </ul>
      )}
    </article>
  );
}

export function ResourcesList() {
  const resources = useStudio((s) => s.project.resources) ?? [];
  const edit = useStudio((s) => s.edit);
  const ready = useResourcesReady(true);
  return (
    <section aria-labelledby="res-h" className="flex flex-col gap-3">
      <div>
        <h2 id="res-h" className="inline-flex items-center gap-1 text-base font-bold">Resources<HelpTip id="resourceType" label="Resources" /></h2>
        <p className={small}>Each resource is defined once, as it runs in production, then priced in every environment it exists in. Prices come from the catalogue under Prices &amp; sources.</p>
      </div>
      {!ready && <p role="status" className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">Loading prices…</p>}
      {ready && resources.length === 0 && <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">No resources yet. Add a virtual machine, a plan or a database and say how many you run. Nothing is costed until you do.</p>}
      {ready && <div className="flex flex-col gap-3">{resources.map((r) => <ResourceCard key={r.id} r={r} />)}</div>}
      {ready && <ResourcePicker onAdd={(typeId, skuId) => {
        const type = catalog.resourceTypes.find((t) => t.id === typeId);
        if (type) edit((d) => { d.resources = [...(d.resources ?? []), newResource(type, skuId, d.resources ?? [])]; });
      }} />}
    </section>
  );
}

export function InfrastructurePage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-auto pb-4">
      <InfrastructureSummary />
      <Card className="flex-none"><div className="px-3.5 py-3.5"><EnvironmentsGrid /></div></Card>
      <Card className="flex-none"><div className="px-3.5 py-3.5"><ResourcesList /></div></Card>
    </div>
  );
}
