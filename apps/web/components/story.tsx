"use client";
import { deliveryCost } from "@roi-calculator/engine";
import { useLedger } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { bakeoffCandidates, storySegments, type StoryField } from "@/lib/story";

/** The one-sentence story of the project, editable inline. Shared by the Summary page and the Overview. */
export function Story() {
  const { project, ledger, roi } = useLedger();
  const edit = useStudio((s) => s.edit);
  const tk = "num mx-0.5 rounded-[5px] border border-line border-b-2 border-b-accent bg-surface px-1.5 py-px text-[15px] font-semibold text-ink [field-sizing:content] min-w-[3ch]";
  const set = (field: StoryField, n: number) => edit((d) => {
    if (field === "months") d.timeline.buildMonths = n;
    else if (field === "ramp") d.timeline.adoptionRampMonths = n;
    else if (field === "people") {
      // Several team lines share one headline number: the first counted line takes the difference.
      const lines = bakeoffCandidates(d) > 0 ? d.build.team.filter((t) => t.experiments) : d.build.team;
      const first = lines[0];
      if (first) first.people = Math.max(1, n - (lines.reduce((s, t) => s + t.people, 0) - first.people));
    } else {
      const w = d.workloads.find((x) => x.kind === "chat");
      if (w?.kind === "chat") w.users = n;
    }
  });
  const deliveryCad = ledger.months.reduce((s, m) => s + deliveryCost(m), 0);
  const segs = storySegments(project, { deliveryCad, paybackMonth: roi.paybackMonth ?? null });
  return (
    <p className="m-0 text-base leading-[1.9] text-ink-2">
      {segs.map((g, i) => {
        if (g.t === "text") return <span key={i}>{g.s}</span>;
        if (g.t === "bold") return <b key={i} className="num text-ink">{g.s}</b>;
        if (g.t === "num") {
          return <input key={i} aria-label={g.label} className={tk} type="number" min={g.min} max={g.max} value={g.value}
            onChange={(e) => Number.isFinite(e.target.valueAsNumber) && set(g.field, Math.min(g.max, Math.max(g.min, e.target.valueAsNumber)))} />;
        }
        return (
          <select key={i} aria-label="Cost basis" className={tk} value={project.roi.basis} onChange={(e) => edit((d) => { d.roi.basis = e.target.value as typeof d.roi.basis; })}>
            <option value="run">running cost only</option>
            <option value="runMaint">running + maintenance</option>
            <option value="full">the full lifecycle</option>
          </select>
        );
      })}
    </p>
  );
}
