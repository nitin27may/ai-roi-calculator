"use client";
import { isCashItem, oneTimeKey, workloadWindow, type FixedItem, type Project, type Workload } from "@roi-calculator/engine";
import { Field, NumberInput, Select, TrashButton } from "@/components/ui";
import { catalog } from "@/lib/compute";
import { useStudio } from "@/lib/store";

const btn = "flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2";
const text = "w-44 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]";

/** Which feature a workload belongs to. Shared (no feature) is the default for a project with no features. */
export function FeatureSelect({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const features = useStudio((s) => s.project.features);
  if (features.length === 0) return null;
  return (
    <Field label="Feature" help="featureId">
      <Select value={value ?? ""} options={[{ value: "", label: "Shared by the project" }, ...features.map((f) => ({ value: f.id, label: f.label }))]} onChange={(v) => onChange(v || undefined)} />
    </Field>
  );
}

/**
 * When a workload bills (start and end month, own ramp) and an optional one-time volume (a backfill or
 * initial load). Leaving everything at its default reproduces the project timeline: go-live, project ramp, no end.
 */
export function WorkloadTiming({ w }: { w: Workload }) {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const upd = (fn: (x: Workload) => void) => edit((d) => { const x = d.workloads.find((y) => y.id === w.id); if (x) fn(x); });
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  const win = workloadWindow(project, w);
  const volKey = oneTimeKey(w);
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Timing</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] items-end gap-2.5">
        <Field label={`Starts in month (go-live ${B + 1})`} help="wlStartMonth">
          <NumberInput value={win.start} min={B + 1} max={H} onChange={(v) => upd((x) => { const m = Math.round(v); if (m > B + 1) x.startMonth = m; else delete x.startMonth; })} />
        </Field>
        <Field label="Ends after month (0 = runs to the end)" help="endMonth">
          <NumberInput value={w.endMonth ?? 0} min={0} max={H} onChange={(v) => upd((x) => { const m = Math.round(v); if (m > 0) x.endMonth = m; else delete x.endMonth; })} />
        </Field>
        <Field label={`Ramp to full volume (project: ${project.timeline.adoptionRampMonths} months)`} help="rampMonths">
          <NumberInput value={win.ramp} min={0} max={24} onChange={(v) => upd((x) => { const m = Math.round(v); if (m === project.timeline.adoptionRampMonths) delete x.rampMonths; else x.rampMonths = m; })} />
        </Field>
        {volKey && (
          <>
            <Field label={`One-time volume (${volKey.replace(/PerMonth$/, "")}), billed once`} help="oneTimeVolume">
              <NumberInput value={w.oneTime?.volume ?? 0} onChange={(v) => upd((x) => { if (v > 0) x.oneTime = { volume: v, month: x.oneTime?.month }; else delete x.oneTime; })} />
            </Field>
            {(w.oneTime?.volume ?? 0) > 0 && (
              <Field label={`Billed in month (default ${win.start})`} help="oneTimeMonth">
                <NumberInput value={w.oneTime?.month ?? win.start} min={1} max={H} onChange={(v) => upd((x) => { if (x.oneTime) x.oneTime = { volume: x.oneTime.volume, month: Math.round(v) }; })} />
              </Field>
            )}
          </>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Before its start month the workload costs nothing; after its end month it stops. The one-time volume is billed in a single month and is not part of the run rate.
      </p>
    </div>
  );
}

/**
 * Editable list of fixed costs: a catalogue price times a quantity, or a free-text CAD amount (per month or once)
 * for anything the catalogue does not price. `locate` returns the live array inside the draft project.
 */
export function CostItems({ items, locate, idPrefix, firstMonthLabel }: { items: FixedItem[]; locate: (d: Project) => FixedItem[] | undefined; idPrefix: string; firstMonthLabel: string }) {
  const edit = useStudio((s) => s.edit);
  const options = catalog.unitPrices.filter((u) => u.platform === "azure").map((u) => ({ value: u.id, label: `${u.label} (${u.unit})` }));
  const unitOf = (id: string) => catalog.unitPrices.find((u) => u.id === id);
  const upd = (i: number, fn: (it: FixedItem) => FixedItem) => edit((d) => { const a = locate(d); if (a?.[i]) a[i] = fn(a[i]!); });
  const nextId = (a: FixedItem[]) => { let n = 1; while (a.some((x) => x.id === `${idPrefix}-${n}`)) n++; return `${idPrefix}-${n}`; };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex-none overflow-x-auto">
        <table className="data">
          <thead><tr><th>Item</th><th>Priced as</th><th className="n">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td><input aria-label="Item name" className={text} value={it.label} onChange={(e) => upd(i, (x) => ({ ...x, label: e.target.value }))} /></td>
                {isCashItem(it) ? (
                  <>
                    <td className="min-w-[220px]">
                      <div className="flex gap-1.5">
                        <Select label={`${it.label} pricing`} value="cash" options={[{ value: "cash", label: "Free-text CAD amount" }, { value: "catalogue", label: "Catalogue price" }]}
                          onChange={(v) => { if (v === "catalogue") upd(i, (x) => ({ id: x.id, label: x.label, unitPriceId: options[0]!.value, quantity: 1 })); }} />
                        <Select label={`${it.label} cadence`} value={it.cadence} options={[{ value: "monthly", label: "Per month" }, { value: "once", label: "Once" }]}
                          onChange={(v) => upd(i, (x) => ({ ...x, cadence: v === "once" ? "once" : "monthly" }) as FixedItem)} />
                      </div>
                    </td>
                    <td className="n min-w-[140px]">
                      <NumberInput label={`${it.label} amount`} value={it.amountCad} suffix="C$" onChange={(v) => upd(i, (x) => ({ ...x, amountCad: v }) as FixedItem)} />
                      {it.cadence === "once" && (
                        <div className="mt-1"><NumberInput label={`${it.label} month`} value={it.month ?? 0} min={0} suffix={it.month ? "month" : firstMonthLabel} onChange={(v) => upd(i, (x) => { const { month: _m, ...rest } = x as typeof it; return (Math.round(v) > 0 ? { ...rest, month: Math.round(v) } : rest) as FixedItem; })} /></div>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="min-w-[220px]">
                      <div className="flex flex-col gap-1.5">
                        <Select label={`${it.label} pricing`} value="catalogue" options={[{ value: "catalogue", label: "Catalogue price" }, { value: "cash", label: "Free-text CAD amount" }]}
                          onChange={(v) => { if (v === "cash") upd(i, (x) => ({ id: x.id, label: x.label, amountCad: 0, cadence: "monthly" as const })); }} />
                        <Select label={`${it.label} price`} value={it.unitPriceId} options={options.some((o) => o.value === it.unitPriceId) ? options : [...options, { value: it.unitPriceId, label: unitOf(it.unitPriceId)?.label ?? it.unitPriceId }]}
                          onChange={(v) => upd(i, (x) => ({ ...x, unitPriceId: v }) as FixedItem)} />
                      </div>
                    </td>
                    <td className="n min-w-[140px]"><NumberInput label={`${it.label} quantity`} value={it.quantity} suffix={unitOf(it.unitPriceId)?.unit} onChange={(v) => upd(i, (x) => ({ ...x, quantity: v }) as FixedItem)} /></td>
                  </>
                )}
                <td><TrashButton label={`Remove ${it.label}`} onClick={() => edit((d) => { locate(d)?.splice(i, 1); })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => edit((d) => { const a = locate(d); if (a) a.push({ id: nextId(a), label: "New item", unitPriceId: options[0]!.value, quantity: 1 }); })}>+ Add catalogue item</button>
        <button type="button" className={btn} onClick={() => edit((d) => { const a = locate(d); if (a) a.push({ id: nextId(a), label: "New cost", amountCad: 0, cadence: "monthly" }); })}>+ Add free-text cost (C$)</button>
      </div>
    </div>
  );
}
