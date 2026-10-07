"use client";
import { Plus } from "lucide-react";
import { addRole, addStandardRole, rateEscalationNote, removeRole, roleUsage } from "@roi-calculator/engine";
import { Field, NumberInput, TrashButton } from "@/components/ui";
import { AddMenu } from "@/components/add-menu";
import { HelpTip } from "@/components/help-tip";
import { catalog } from "@/lib/compute";
import { useStudio } from "@/lib/store";

/** Every role's name and hourly rate, with add and remove. A role that is still in use cannot be removed. */
export function RateCardEditor() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const pct = project.roi.rateEscalationPctPerYear;
  const sample = project.rateCard[0]?.hourlyRate ?? 0;
  const standard = catalog.benchmarks.availableRoles.filter((r) => !project.rateCard.some((x) => x.id === r.id));
  return (
    <>
      <h3 className="text-sm font-semibold">Rate card (CAD per hour)</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
        {project.rateCard.map((r, i) => {
          const uses = roleUsage(project, r.id);
          return (
            <div key={r.id} className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1"><Field label={r.label} help="hourlyRate"><NumberInput value={r.hourlyRate} onChange={(v) => edit((d) => { d.rateCard[i]!.hourlyRate = v; })} /></Field></div>
              <input aria-label={`Name of role ${r.label}`} className="w-28 rounded border border-line bg-surface-2 px-2 py-1.5 text-[13px]" value={r.label} onChange={(e) => edit((d) => { d.rateCard[i]!.label = e.target.value; })} />
              <TrashButton label={uses > 0 ? `${r.label} is used in ${uses} place${uses === 1 ? "" : "s"}; remove those first` : `Remove role ${r.label}`} className={uses > 0 || project.rateCard.length <= 1 ? "opacity-30" : ""} onClick={() => edit((d) => { removeRole(d, r.id); })} />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="flex w-fit items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2" onClick={() => edit((d) => { addRole(d, "New role", 100); })}><Plus size={14} />Add role</button>
        {standard.length > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <AddMenu label="Add role from the standard list" items={standard.map((r) => ({ kind: r.id, label: r.label, detail: `C$${r.hourlyRate} an hour. Indicative: ${r.source}, ${r.confidence}` }))} onPick={(id) => { const r = standard.find((x) => x.id === id); if (r) edit((d) => { addStandardRole(d, r); }); }} />
            <HelpTip id="standardRole" label="Add role from the standard list" />
          </span>
        )}
      </div>
      <p className="text-xs text-muted">{rateEscalationNote(pct, sample)} Change it under ROI. A team line can also carry its own manual rate, which replaces the rate-card rate for that line.</p>
    </>
  );
}
