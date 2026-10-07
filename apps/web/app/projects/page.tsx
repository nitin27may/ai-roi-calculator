"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Download, Trash2, Wand2 } from "lucide-react";
import type { Project } from "@roi-calculator/engine";
import { PROJECT_TEMPLATES, PROJECT_TYPE_INFO, buildLedger, compareFigures, computeRoi, costSplit, projectTypes, roiOptions, verdictFor } from "@roi-calculator/engine";
import { Card, CardHead, Field, TextInput } from "@/components/ui";
import { CompareBars, COMPARE_COLORS, MiniSplit } from "@/components/charts-compare";
import { VerdictChip } from "@/components/summary-parts";
import { COMPARE_ROWS, EXTRA_COMPARE_ROWS, bestIndex } from "@/lib/compare";
import { PORTFOLIO_KEYS, extraFigures, filterProjects, groupProjects, portfolioLabel, portfolioTotals, type ExtraFigures } from "@/lib/portfolio";
import type { PortfolioTotals } from "@/lib/portfolio";
import { DEFAULT_PORTFOLIO, readPortfolio, writePortfolio, type PortfolioGroupBy, type PortfolioKey } from "@/lib/prefs";
import { HelpTip } from "@/components/help-tip";
import { catalog, useResourcesReady, useResourceVersion } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { downloadProject } from "@/lib/project-file";
import { EmptyLibrary } from "@/components/empty-library";
import { cad, cn, fmt } from "@/lib/format";

export default function Projects() {
  const library = useStudio((s) => s.library);
  const activeId = useStudio((s) => s.activeId);
  const unreadableCount = useStudio((s) => s.unreadableCount);
  const { open, duplicate, remove, create } = useStudio.getState();
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const [picked, setPicked] = useState<string[]>([]);
  useResourcesReady(library.some((e) => (e.project.resources?.length ?? 0) > 0));
  const resourceVersion = useResourceVersion();
  const summaries = useMemo(() => new Map(library.map((e) => {
    const L = buildLedger(e.project, catalog);
    const r = computeRoi(L, e.project.roi.basis, e.project.roi.discountRatePct, roiOptions(e.project));
    return [e.id, { L, r, split: costSplit(L), verdict: verdictFor(r), figures: compareFigures(e.project.name, L, r), extra: extraFigures(e.project, L, r) }];
  })), [library, resourceVersion]);

  const [groupBy, setGroupBy] = useState<PortfolioGroupBy>(DEFAULT_PORTFOLIO.groupBy);
  const [filter, setFilter] = useState<PortfolioKey[]>(DEFAULT_PORTFOLIO.filter);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => { const p = readPortfolio(localStorage); setGroupBy(p.groupBy); setFilter(p.filter); setPrefsLoaded(true); }, []);
  useEffect(() => { if (prefsLoaded) writePortfolio(localStorage, { groupBy, filter }); }, [prefsLoaded, groupBy, filter]);
  const toggleKey = (k: PortfolioKey) => setFilter((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const shown = useMemo(() => filterProjects(library, filter), [library, filter]);
  const groups = useMemo(() => groupProjects(shown, filter), [shown, filter]);
  const totalsOf = (entries: { id: string }[]) => portfolioTotals(entries.map((x) => summaries.get(x.id)!.figures));

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]));
  const chosen = picked.filter((id) => summaries.has(id));

  const renderCard = (e: (typeof library)[number], tour: boolean, keyPrefix: string) => {
    const s = summaries.get(e.id)!;
    const active = e.id === activeId;
    return (
  <div key={keyPrefix + e.id} data-tour={tour ? "projects-list" : undefined} className={cn("flex flex-col gap-2 rounded-lg border p-3", active ? "border-accent bg-accent-soft" : "border-line")}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate font-display text-[15px] font-bold">{e.project.name}</div>
        <div className="text-xs text-muted">Updated {new Date(e.updatedAt).toLocaleDateString("en-CA")} · {e.project.workloads.length} workloads · {e.project.build.activities.length} Dev Lab activities</div>
      </div>
      {active && <span className="rounded-full bg-accent px-2 py-px text-xs font-medium text-accent-ink">Open</span>}
    </div>
    {projectTypes(e.project).length > 0 && (
      <div className="flex flex-wrap gap-1" aria-label="Types of change" data-testid="type-chips">
        {projectTypes(e.project).map((t) => <span key={t} className="rounded-full border border-line bg-surface-2 px-2 py-px text-xs text-ink-2">{PROJECT_TYPE_INFO[t].label}</span>)}
      </div>
    )}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <VerdictChip verdict={s.verdict} />
    </div>
    <MiniSplit parts={s.split} />
    <dl className="grid grid-cols-3 gap-1 text-xs">
      <div><dt className="text-muted">Build</dt><dd className="num font-semibold">{cad(s.L.totals.build)}</dd></div>
      <div><dt className="text-muted">Run / month</dt><dd className="num font-semibold">{cad(s.L.totals.runRate)}</dd></div>
      <div><dt className="text-muted">Payback</dt><dd className="num font-semibold">{s.r.paybackMonth ? `M${s.r.paybackMonth}` : "–"} · {fmt(s.r.roi * 100)}%</dd></div>
    </dl>
    <CardExtras x={s.extra} />
    <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
      <input type="checkbox" checked={picked.includes(e.id)} disabled={!picked.includes(e.id) && picked.length >= 3} onChange={() => toggle(e.id)} />
      Compare{!picked.includes(e.id) && picked.length >= 3 ? " (three at most)" : ""}
    </label>
    <div className="mt-auto flex flex-wrap gap-1.5">
      <button type="button" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink" onClick={() => { open(e.id); router.push("/summary"); }}>Open</button>
      <button type="button" className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface-2" onClick={() => duplicate(e.id)}><Copy size={12} />Duplicate</button>
      <button type="button" ref={(el) => { if (el) triggers.current.set(e.id, el); else triggers.current.delete(e.id); }} aria-expanded={confirm === e.id} aria-controls={`delete-${e.id}`} className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs text-crit hover:bg-crit-soft" onClick={() => setConfirm(confirm === e.id ? null : e.id)}><Trash2 size={12} aria-hidden />Delete</button>
    </div>
    <DeleteConfirm id={`delete-${e.id}`} open={confirm === e.id} name={e.project.name}
      onKeep={() => { setConfirm(null); triggers.current.get(e.id)?.focus(); }}
      onExport={() => downloadProject(e.project)}
      onDelete={() => { remove(e.id); setConfirm(null); document.getElementById("main-content")?.focus(); }} />
  </div>
    );
  };

  return (
    <div className="grid h-full min-h-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHead title={`${library.length} project${library.length === 1 ? "" : "s"}`} sub="Saved in this browser. Use Save to file to keep a copy or share one." />
        {unreadableCount > 0 && (
          <div role="note" className="mx-3.5 mb-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            {unreadableCount} saved project{unreadableCount === 1 ? "" : "s"} could not be opened and {unreadableCount === 1 ? "was" : "were"} left out of this list.
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3.5 pb-3.5">
        {chosen.length >= 2 && <ProjectCompare ids={chosen} library={library} summaries={summaries} onClear={() => setPicked([])} />}
        {chosen.length === 1 && <p className="rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">Pick one or two more projects to compare them side by side. You can compare up to three.</p>}
        {library.length === 0 && <EmptyLibrary />}
        <PortfolioControls groupBy={groupBy} setGroupBy={setGroupBy} filter={filter} toggleKey={toggleKey} clear={() => setFilter([])} />
        {library.length > 0 && <PortfolioTotalsLine label={filter.length > 0 || shown.length !== library.length ? "Shown" : "All projects"} t={totalsOf(shown)} />}
        {library.length > 0 && shown.length === 0 && <p role="status" className="rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">No project matches the chips that are on. Switch a chip off, or clear the filter.</p>}
        {groupBy === "type" ? (
          groups.map((g) => (
            <section key={g.key} aria-label={`${g.label} group`} data-testid={`group-${g.key}`} className="flex flex-col gap-2">
              <PortfolioGroupHeader label={g.label} t={totalsOf(g.entries)} />
              <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">{g.entries.map((e) => renderCard(e, g === groups[0] && e === g.entries[0], `${g.key}-`))}</div>
            </section>
          ))
        ) : (
          <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">{shown.map((e) => renderCard(e, e === shown[0], ""))}</div>
        )}
        </div>
      </Card>
      <Card>
        <CardHead title="New estimate" sub="Answer a few questions and the wizard builds the estimate, or start from a preset below" />
        <div className="px-3.5 pb-1">
          <Link href="/wizard" className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink"><Wand2 size={14} aria-hidden />New estimate with the wizard</Link>
          <p className="mt-2 text-xs text-muted">Or start from a preset. Pick one; none is chosen for you.</p>
        </div>
        <form className="flex flex-col gap-3 px-3.5 pb-3.5" onSubmit={(ev) => { ev.preventDefault(); const t = PROJECT_TEMPLATES.find((x) => x.id === template); if (!t) return; create(template, name.trim() || t.label); setName(""); router.push("/summary"); }}>
          <Field label="Project name" help="projectName"><TextInput value={name} placeholder="e.g. Claims assistant" onChange={setName} /></Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs text-muted">Preset</legend>
            {PROJECT_TEMPLATES.map((t) => (
              <label key={t.id} className={cn("grid cursor-pointer grid-cols-[auto_1fr] gap-2 rounded-md border px-2.5 py-2 text-[12.5px]", template === t.id ? "border-accent bg-accent-soft" : "border-line")}>
                <input type="radio" name="template" checked={template === t.id} onChange={() => setTemplate(t.id)} />
                <span>{t.label}<small className="block text-muted">{t.detail}</small></span>
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={!template} className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent disabled:cursor-not-allowed disabled:opacity-40">{template ? "Create from preset" : "Pick a preset to create"}</button>
        </form>
      </Card>
    </div>
  );
}

/**
 * Inline delete confirmation: no browser alert and no modal. It opens in place under the card with a
 * short height animation, takes focus on the safe choice, and Escape closes it.
 */
function DeleteConfirm({ id, open, name, onKeep, onExport, onDelete }: { id: string; open: boolean; name: string; onKeep: () => void; onExport: () => void; onDelete: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) keep.current?.focus(); }, [open]);
  return (
    <div id={id} className={cn("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!open}
      onKeyDown={(ev) => { if (ev.key === "Escape") { ev.stopPropagation(); onKeep(); } }}>
      <div className="min-h-0 overflow-hidden">
        <div role="group" aria-label={`Delete ${name}`} className="mt-1 flex flex-col gap-2 rounded-md border border-crit bg-crit-soft p-2.5 text-[12.5px]">
          <p className="text-ink">
            Delete <b>{name}</b>? Projects are stored only in this browser, so it cannot be recovered afterwards unless you export it first.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" ref={keep} className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium" onClick={onKeep}>Keep</button>
            <button type="button" className="flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs" onClick={onExport}><Download size={12} aria-hidden />Export first</button>
            <button type="button" className="rounded-md bg-crit px-2.5 py-1 text-xs font-medium text-white" onClick={onDelete}>Delete for good</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type Summaries = Map<string, { figures: ReturnType<typeof compareFigures>; extra: ExtraFigures }>;

function ProjectCompare({ ids, library, summaries, onClear }: { ids: string[]; library: { id: string; project: Project }[]; summaries: Summaries; onClear: () => void }) {
  const projects = ids.map((id) => { const e = library.find((x) => x.id === id); return { id, name: e?.project.name ?? id, types: e ? projectTypes(e.project) : [], f: summaries.get(id)!.figures, x: summaries.get(id)!.extra }; });
  const names = projects.map((p) => p.name);
  return (
    <section className="rounded-lg border border-accent bg-surface p-3" aria-label="Project comparison">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">Comparing {projects.length} projects</h3>
        <button type="button" className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-surface-2" onClick={onClear}>Clear comparison</button>
      </div>
      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr><th>Figure</th>{projects.map((p, i) => <th key={p.id} className="n"><span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: COMPARE_COLORS[i] }} />{p.name}</span><span className="mt-1 flex flex-wrap justify-end gap-1 font-normal" data-testid="compare-type-chips">{p.types.length === 0 ? <span className="rounded-full border border-line bg-surface-2 px-2 py-px text-xs text-muted">Type not set</span> : p.types.map((t) => <span key={t} className="rounded-full border border-line bg-surface-2 px-2 py-px text-xs text-ink-2">{PROJECT_TYPE_INFO[t].label}</span>)}</span></th>)}</tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => {
              const vals = projects.map((p) => row.value(p.f));
              const best = bestIndex(vals, row.lowerIsBetter);
              return (
                <tr key={row.id}>
                  <td>{row.label}<span className="block text-xs text-muted">{row.lowerIsBetter ? "Lower is better" : "Higher is better"}</span></td>
                  {vals.map((v, i) => <td key={projects[i]!.id} className="n">{row.table(v)}{best === i && <span className="ml-1.5 rounded bg-good-soft px-1 text-xs font-medium text-good">Best</span>}</td>)}
                </tr>
              );
            })}
            {EXTRA_COMPARE_ROWS.map((row) => {
              const vals = projects.map((p) => p.x[row.id]);
              const best = bestIndex(vals, row.lowerIsBetter);
              return (
                <tr key={row.id} data-testid={`extra-${row.id}`}>
                  <td>{row.label}<span className="block text-xs text-muted">{row.lowerIsBetter ? "Lower is better" : "Higher is better"}</span></td>
                  {vals.map((v, i) => <td key={projects[i]!.id} className="n">{row.table(v)}{best === i && <span className="ml-1.5 rounded bg-good-soft px-1 text-xs font-medium text-good">Best</span>}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <CompareBars names={names} metrics={COMPARE_ROWS.map((row) => ({ id: row.id, label: row.label, format: row.bar, values: projects.map((p) => row.value(p.f)) }))} />
      </div>
      <p className="mt-2 text-xs text-muted">Each project uses its own plan length, discount rate and cost basis, so compare the figures with that in mind. IRR is capped in the bar labels; the table has the full figure. n/a means the project has no current-state lines or scorecard items for that row. Projects of different types can be compared.</p>
    </section>
  );
}

function PortfolioControls({ groupBy, setGroupBy, filter, toggleKey, clear }: { groupBy: PortfolioGroupBy; setGroupBy: (g: PortfolioGroupBy) => void; filter: PortfolioKey[]; toggleKey: (k: PortfolioKey) => void; clear: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-2.5" data-testid="portfolio-controls">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <fieldset className="flex items-center gap-2 text-[12.5px]">
          <legend className="sr-only">Group projects by</legend>
          <span className="flex items-center gap-0.5 text-xs text-muted">Group by<HelpTip id="portfolioGroupBy" label="Group by" /></span>
          {([["none", "None"], ["type", "Type"]] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-1"><input type="radio" name="group-by" checked={groupBy === v} onChange={() => setGroupBy(v)} />{label}</label>
          ))}
        </fieldset>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Filter by type">
          <span className="flex items-center gap-0.5 text-xs text-muted">Filter<HelpTip id="portfolioFilter" label="Filter by type" /></span>
          {PORTFOLIO_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={filter.includes(k)} onClick={() => toggleKey(k)}
              className={cn("rounded-full border px-2.5 py-px text-xs", filter.includes(k) ? "border-accent bg-accent-soft font-medium text-ink" : "border-line text-ink-2 hover:bg-surface-2")}>{portfolioLabel(k)}</button>
          ))}
          {filter.length > 0 && <button type="button" className="rounded-md border border-line px-2 py-px text-xs hover:bg-surface-2" onClick={clear}>Clear filter</button>}
        </div>
      </div>
      <p className="text-xs text-muted">A project with several types appears in each group. It counts once in the totals.</p>
    </div>
  );
}

function totalsText(t: PortfolioTotals) {
  return `${t.count} project${t.count === 1 ? "" : "s"} · build ${cad(t.build)} · run ${cad(t.runPerMonth)} a month · NPV ${cad(t.npv)} · ${t.payingBack} of ${t.count} pay${t.payingBack === 1 ? "s" : ""} back within the plan`;
}
function PortfolioTotalsLine({ label, t }: { label: string; t: PortfolioTotals }) {
  return <p className="num text-[12.5px] text-ink-2" data-testid="portfolio-totals"><b>{label}:</b> {totalsText(t)}</p>;
}
function PortfolioGroupHeader({ label, t }: { label: string; t: PortfolioTotals }) {
  return (
    <header className="flex flex-col gap-0.5 border-b border-line pb-1">
      <h3 className="font-display text-[14px] font-bold">{label}</h3>
      <p className="num text-xs text-ink-2" data-testid="group-totals">{totalsText(t)}</p>
    </header>
  );
}

function CardExtras({ x }: { x: ExtraFigures }) {
  if (x.savingPerMonth === null && x.scorecardComposite === null) return null;
  return (
    <p className="text-xs text-ink-2" data-testid="card-extras">
      {x.savingPerMonth !== null && <>Saves {cad(x.savingPerMonth)} a month against the current state. </>}
      {x.scorecardComposite !== null && <>Scorecard {fmt(x.scorecardComposite, 1)}% better.</>}
    </p>
  );
}
