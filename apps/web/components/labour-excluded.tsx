"use client";
import { LABOUR_EXCLUDED_TEXT } from "@studio/engine";
import { HelpTip } from "@/components/help-tip";
import { useStudio } from "@/lib/store";

/** One line under the page header on every project page while build labour is left out, so no build figure is misread. */
export function LabourExcludedNote() {
  const excluded = useStudio((s) => !s.project.build.includeLabour);
  const pctMaint = useStudio((s) => s.project.maintenance.mode === "pctOfBuild");
  const edit = useStudio((s) => s.edit);
  if (!excluded) return null;
  return (
    <div role="status" className="mx-3 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-warn-soft px-3 py-1.5 text-[12.5px] text-warn sm:mx-5">
      <span><b>{LABOUR_EXCLUDED_TEXT}.</b> Every build figure here is AI Dev Lab, environment and one-time cost only. Your team and rates are kept.{pctMaint ? " Maintenance is set as a percent of build, so it is a percent of this smaller figure." : ""}</span>
      <button type="button" onClick={() => edit((d) => { d.build.includeLabour = true; })} className="rounded-md border border-warn px-2 py-0.5 text-xs font-medium hover:bg-surface">Include build labour again</button>
    </div>
  );
}

/** The one control for leaving build labour out. Build and Settings both render it, so they always agree (it edits `build.includeLabour`). */
export function LabourExcludeToggle() {
  const excluded = useStudio((s) => !s.project.build.includeLabour);
  const edit = useStudio((s) => s.edit);
  return (
    <div className="flex items-start gap-1.5 text-[12.5px]">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={excluded} onChange={(e) => edit((d) => { d.build.includeLabour = !e.target.checked; })} />
        <span>Exclude build labour cost <span className="text-muted">(counts the AI Dev Lab and all other costs only; the team and rates are kept, and unticking brings labour back)</span></span>
      </label>
      <HelpTip id="excludeLabour" label="Exclude build labour cost" />
    </div>
  );
}
