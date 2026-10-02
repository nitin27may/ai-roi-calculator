"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Download, Upload, RotateCcw } from "lucide-react";
import { ProjectSchema, meetingIntelligence } from "@studio/engine";
import { useStudio } from "@/lib/store";
import { catalog, useLedger } from "@/lib/compute";
import { cad, cn, fmt } from "@/lib/format";

const PROJECT_VIEWS = [
  { href: "/overview", label: "Overview" },
  { href: "/build", label: "Build" },
  { href: "/run", label: "Run" },
  { href: "/roi", label: "Value & ROI" },
  { href: "/settings", label: "Settings" },
];
const TITLES: Record<string, string> = { "/overview": "Overview", "/build": "Build", "/run": "Run", "/roi": "Value & ROI", "/tokens": "Token calculator", "/prices": "Prices & sources", "/settings": "Settings" };

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const hydrate = useStudio((s) => s.hydrate);
  const project = useStudio((s) => s.project);
  const problem = useStudio((s) => s.problem);
  useEffect(() => hydrate(), [hydrate]);
  const isProject = PROJECT_VIEWS.some((v) => v.href === path);
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;

  const nav = (href: string, label: ReactNode, small?: string) => (
    <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
      className={cn("flex justify-between gap-2 rounded-md px-2 py-1.5 font-medium", path === href ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2")}>
      {label}{small && <small className="num text-[11px] text-muted">{small}</small>}
    </Link>
  );

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[212px_minmax(0,1fr)]">
      <nav aria-label="Main" className="flex flex-col gap-4 overflow-auto border-b border-line bg-surface px-3 py-4 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 font-display text-base font-bold">
          <span aria-hidden className="relative h-5 w-5 flex-none rounded-[5px] bg-accent after:absolute after:inset-x-1 after:inset-y-[5px] after:border-b-2 after:border-l-2 after:border-accent-ink" />
          AI Cost &amp; ROI Studio
        </div>
        <Group label="Quick tools">{nav("/tokens", "Token calculator")}</Group>
        <Group label={project.name}>
          {nav("/overview", "Overview")}
          {nav("/build", "Build", `M1–${B}`)}
          {nav("/run", "Run", `M${B + 1}–${H}`)}
          {nav("/roi", "Value & ROI")}
          {nav("/settings", "Settings")}
        </Group>
        <Group label="Data">{nav("/prices", "Prices & sources")}</Group>
        <ProjectFile />
        <p className="mt-auto hidden border-t border-line pt-2.5 text-[11.5px] text-muted md:block">
          <b className="text-ink-2">Local mode.</b> Saved in this browser. Prices as of {catalog.meta.asOf}; refresh with <span className="num">pnpm prices</span>.
        </p>
      </nav>
      <main className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] md:h-full md:overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-2.5 pt-3">
          <div>
            <div className="text-[11.5px] text-muted">{isProject ? project.name : path === "/tokens" ? "Quick tools" : "Data"}</div>
            <h1 className="text-[21px] font-bold">{TITLES[path] ?? "Overview"}</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[["Currency", "CAD"], ["Azure", project.settings.azureDeployment === "global" ? "Global" : "Data Zone"], ["Snowflake", `${project.settings.snowflake.edition} · ${project.settings.snowflake.routing}`], ["Prices", catalog.meta.asOf]].map(([k, v]) => (
              <span key={k} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11.5px] text-ink-2">{k} <b className="font-semibold text-ink">{v}</b></span>
            ))}
          </div>
        </header>
        {isProject ? <KpiBar /> : <div />}
        {problem && <div role="alert" className="mx-5 mt-2 rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">That change was not applied: {problem}</div>}
        <div className="min-h-0 px-5 pb-4 pt-3.5">{children}</div>
      </main>
    </div>
  );
}

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-px">
    <div className="truncate px-2 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</div>
    {children}
  </div>
);

function KpiBar() {
  const { project, ledger, roi } = useLedger();
  const t = ledger.totals, B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  const basis = { run: "running cost only", runMaint: "running + maintenance", full: "full lifecycle" }[project.roi.basis];
  const k = [
    [`Build · months 1–${B}`, cad(t.build), `${cad(t.devLab)} of it AI Dev Lab`],
    ["Production run-rate", `${cad(t.runRate)}/mo`, `+ ${cad(t.maintRate)} maintenance`],
    ["Benefit at full adoption", `${cad(t.benefitRate)}/mo`, `${project.benefits.capabilities.length + project.benefits.avoidedCosts.length} sources`],
    ["Payback", roi.paybackMonth ? `Month ${roi.paybackMonth}` : `> ${H} months`, basis],
    [`${H / 12}-year ROI`, `${fmt(roi.roi * 100)}%`, `${cad(roi.totalBenefit - roi.totalCost)} net`],
  ];
  return (
    <div className="mx-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      {k.map(([l, v, d]) => (
        <div key={l} className="min-w-0 border-r border-line px-3.5 py-2">
          <div className="truncate text-[11.5px] text-muted">{l}</div>
          <div className="font-display text-xl font-bold tabular-nums leading-tight">{v}</div>
          <div className="truncate text-[11.5px] text-ink-2">{d}</div>
        </div>
      ))}
      <div className="hidden min-w-[190px] flex-col justify-center gap-1 px-3 py-2 xl:flex">
        <div className="grid h-2 gap-0.5 overflow-hidden rounded" style={{ gridTemplateColumns: `${B}fr ${H - B}fr` }}><i className="bg-[var(--s2)]" /><i className="bg-[var(--s3)]" /></div>
        <span className="text-[11.5px] text-ink-2">Build M1–{B} · Production M{B + 1}–{H}</span>
      </div>
    </div>
  );
}

function ProjectFile() {
  const project = useStudio((s) => s.project);
  const replace = useStudio((s) => s.replace);
  const input = useRef<HTMLInputElement>(null);
  const exportFile = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^\w-]+/g, "-").toLowerCase()}.aicost.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    const parsed = ProjectSchema.safeParse(JSON.parse(await f.text()));
    if (parsed.success) replace(parsed.data);
    else alert(`This file is not a valid project: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  };
  const btn = "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-2 hover:bg-surface-2";
  return (
    <Group label="Project file">
      <button type="button" className={btn} onClick={exportFile}><Download size={14} />Save to file</button>
      <button type="button" className={btn} onClick={() => input.current?.click()}><Upload size={14} />Open file</button>
      <button type="button" className={btn} onClick={() => replace(meetingIntelligence)}><RotateCcw size={14} />Reset to sample</button>
      <input ref={input} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
    </Group>
  );
}
