"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { PROJECT_TEMPLATES, buildLedger, computeRoi } from "@studio/engine";
import { Card, CardHead, Field, TextInput } from "@/components/ui";
import { catalog } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, cn, fmt } from "@/lib/format";

export default function Projects() {
  const library = useStudio((s) => s.library);
  const activeId = useStudio((s) => s.activeId);
  const unreadableCount = useStudio((s) => s.unreadableCount);
  const { open, duplicate, remove, create } = useStudio.getState();
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(PROJECT_TEMPLATES[0]!.id);
  const [confirm, setConfirm] = useState<string | null>(null);
  const summaries = useMemo(() => new Map(library.map((e) => {
    const L = buildLedger(e.project, catalog);
    const r = computeRoi(L, e.project.roi.basis, e.project.roi.discountRatePct);
    return [e.id, { L, r }];
  })), [library]);

  return (
    <div data-tour="projects-list" className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHead title={`${library.length} project${library.length === 1 ? "" : "s"}`} sub="Saved in this browser. Use Save to file to keep a copy or share one." />
        {unreadableCount > 0 && (
          <div role="note" className="mx-3.5 mb-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            {unreadableCount} saved project{unreadableCount === 1 ? "" : "s"} could not be opened and {unreadableCount === 1 ? "was" : "were"} left out of this list.
          </div>
        )}
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 overflow-auto px-3.5 pb-3.5">
          {library.map((e) => {
            const s = summaries.get(e.id)!;
            const active = e.id === activeId;
            return (
              <div key={e.id} className={cn("flex flex-col gap-2 rounded-lg border p-3", active ? "border-accent bg-accent-soft" : "border-line")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display text-[15px] font-bold">{e.project.name}</div>
                    <div className="text-[11.5px] text-muted">Updated {new Date(e.updatedAt).toLocaleDateString("en-CA")} · {e.project.workloads.length} workloads · {e.project.build.activities.length} Dev Lab activities</div>
                  </div>
                  {active && <span className="rounded-full bg-accent px-2 py-px text-[11px] font-medium text-accent-ink">Open</span>}
                </div>
                <dl className="grid grid-cols-3 gap-1 text-[11.5px]">
                  <div><dt className="text-muted">Build</dt><dd className="num font-semibold">{cad(s.L.totals.build)}</dd></div>
                  <div><dt className="text-muted">Run / month</dt><dd className="num font-semibold">{cad(s.L.totals.runRate)}</dd></div>
                  <div><dt className="text-muted">Payback</dt><dd className="num font-semibold">{s.r.paybackMonth ? `M${s.r.paybackMonth}` : "–"} · {fmt(s.r.roi * 100)}%</dd></div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  <button type="button" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink" onClick={() => { open(e.id); router.push("/summary"); }}>Open</button>
                  <button type="button" className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface-2" onClick={() => duplicate(e.id)}><Copy size={12} />Duplicate</button>
                  {confirm === e.id
                    ? <><button type="button" className="rounded-md bg-crit px-2.5 py-1 text-xs font-medium text-white" onClick={() => { remove(e.id); setConfirm(null); }}>Delete for good</button><button type="button" className="rounded-md border border-line px-2.5 py-1 text-xs" onClick={() => setConfirm(null)}>Keep</button></>
                    : <button type="button" className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs text-crit hover:bg-crit-soft" onClick={() => setConfirm(e.id)}><Trash2 size={12} />Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <CardHead title="New project" sub="Start from a template; everything can be changed afterwards" />
        <form className="flex flex-col gap-3 px-3.5 pb-3.5" onSubmit={(ev) => { ev.preventDefault(); create(template, name.trim() || PROJECT_TEMPLATES.find((t) => t.id === template)!.label); setName(""); router.push("/summary"); }}>
          <Field label="Project name" help="projectName"><TextInput value={name} placeholder="e.g. Claims assistant" onChange={setName} /></Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[11.5px] text-muted">Template</legend>
            {PROJECT_TEMPLATES.map((t) => (
              <label key={t.id} className={cn("grid cursor-pointer grid-cols-[auto_1fr] gap-2 rounded-md border px-2.5 py-2 text-[12.5px]", template === t.id ? "border-accent bg-accent-soft" : "border-line")}>
                <input type="radio" name="template" checked={template === t.id} onChange={() => setTemplate(t.id)} />
                <span>{t.label}<small className="block text-muted">{t.detail}</small></span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink">Create project</button>
        </form>
      </Card>
    </div>
  );
}
