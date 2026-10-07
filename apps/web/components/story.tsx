"use client";
import { labourExcluded } from "@roi-calculator/engine";
import { useStudio } from "@/lib/store";

/** The one-sentence story of the project, editable inline. Shared by the Summary page and the Overview. */
export function Story() {
  const project = useStudio((s) => s.project);
  const edit = useStudio((s) => s.edit);
  const devs = project.build.team.filter((t) => t.experiments).reduce((s, t) => s + t.people, 0);
  const bake = project.build.activities.find((a) => a.kind === "bakeoff");
  const chat = project.workloads.find((w) => w.kind === "chat");
  const tk = "num mx-0.5 rounded-[5px] border border-line border-b-2 border-b-accent bg-surface px-1.5 py-px text-[15px] font-semibold text-ink [field-sizing:content] min-w-[3ch]";
  const num = (v: number, set: (n: number) => void, min: number, max: number, label: string) => (
    <input aria-label={label} className={tk} type="number" min={min} max={max} value={v} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && set(Math.min(max, Math.max(min, e.target.valueAsNumber)))} />
  );
  return (
    <p className="m-0 text-base leading-[1.9] text-ink-2">
      {!labourExcluded(project) ? (
        <>
          {num(devs, (n) => edit((d) => { const t = d.build.team.find((x) => x.experiments); if (t) t.people = n; }), 1, 30, "Developers")} developers build for{" "}
          {num(project.timeline.buildMonths, (n) => edit((d) => { d.timeline.buildMonths = n; }), 1, 18, "Build months")} months, testing{" "}
        </>
      ) : (
        <>
          Build labour is excluded from every figure. The AI Dev Lab runs for{" "}
          {num(project.timeline.buildMonths, (n) => edit((d) => { d.timeline.buildMonths = n; }), 1, 18, "Build months")} months, testing{" "}
        </>
      )}
      <b className="num text-ink">{bake?.kind === "bakeoff" ? bake.candidates.length : 0}</b> candidate models. Then{" "}
      {chat?.kind === "chat" ? num(chat.users, (n) => edit((d) => { const w = d.workloads.find((x) => x.id === chat.id); if (w?.kind === "chat") w.users = n; }), 1, 1_000_000, "Users") : "your"} users adopt it over{" "}
      {num(project.timeline.adoptionRampMonths, (n) => edit((d) => { d.timeline.adoptionRampMonths = n; }), 0, 24, "Adoption months")} months. ROI is measured on{" "}
      <select aria-label="Cost basis" className={tk} value={project.roi.basis} onChange={(e) => edit((d) => { d.roi.basis = e.target.value as typeof d.roi.basis; })}>
        <option value="run">running cost only</option>
        <option value="runMaint">running + maintenance</option>
        <option value="full">the full lifecycle</option>
      </select>.
    </p>
  );
}
