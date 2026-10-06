"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Activity, BookOpen, Calculator, Cpu, Database, Download, FileSpreadsheet, FileText, FolderOpen, Hammer, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen,
  ChevronDown, Printer, Redo2, RotateCcw, Settings, Sparkles, TrendingUp, Undo2, Upload, X, ChartColumn, type LucideIcon,
} from "lucide-react";
import { exportCsv, exportXlsx } from "@/lib/export";
import { DEPLOYMENT_LABEL, ProjectSchema, meetingIntelligence, migrateProject } from "@studio/engine";
import { useStudio } from "@/lib/store";
import { describeIssue } from "@/lib/validation";
import { HelpMenu } from "@/components/help-menu";
import { PageIntro } from "@/components/page-intro";
import { ProductTour } from "@/components/product-tour";
import { ThemeToggle } from "@/components/theme-toggle";
import { monthLegendText } from "@/lib/months";
import { catalog, useLedger } from "@/lib/compute";
import { cad, cn, fmt } from "@/lib/format";
import { DRAWER_CLOSE_EVENT, DRAWER_OPEN_EVENT, readProjectMenuCollapsed, readSidebarCollapsed, writeProjectMenuCollapsed, writeSidebarCollapsed } from "@/lib/prefs";
import { showProjectMenu } from "@/lib/nav";
import { downloadProject } from "@/lib/project-file";
import { LabourExcludedNote } from "@/components/labour-excluded";
import { EmptyLibrary } from "@/components/empty-library";

const PROJECT_VIEWS = [
  { href: "/summary", label: "Summary" },
  { href: "/overview", label: "Overview" },
  { href: "/build", label: "Build" },
  { href: "/run", label: "Run" },
  { href: "/roi", label: "Value & ROI" },
  { href: "/capacity", label: "Capacity (PTU)" },
  { href: "/report", label: "Report" },
  { href: "/settings", label: "Settings" },
];
const TITLES: Record<string, string> = { "/summary": "Summary", "/overview": "Overview", "/build": "Build", "/run": "Run", "/roi": "Value & ROI", "/tokens": "Token calculator", "/prices": "Prices & sources", "/settings": "Settings", "/report": "Report", "/capacity": "Capacity (PTU)", "/projects": "Projects", "/wizard": "New estimate wizard", "/glossary": "Glossary" };
/** Below this width the sidebar is an off-canvas drawer (Tailwind's lg breakpoint). */
const DRAWER_QUERY = "(max-width: 1023px)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const hydrate = useStudio((s) => s.hydrate);
  const project = useStudio((s) => s.project);
  const problem = useStudio((s) => s.problem);
  const hydrated = useStudio((s) => s.hydrated);
  const library = useStudio((s) => s.library);
  const activeId = useStudio((s) => s.activeId);
  const router = useRouter();
  useEffect(() => hydrate(), [hydrate]);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) useStudio.getState().redo(); else useStudio.getState().undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); useStudio.getState().redo(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // Saved sidebar width and the drawer breakpoint are read after mount so the static export and first client render match.
  useEffect(() => {
    setCollapsed(readSidebarCollapsed(localStorage));
    const mq = matchMedia(DRAWER_QUERY);
    const sync = () => { setNarrow(mq.matches); if (!mq.matches) setDrawerOpen(false); };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => { writeSidebarCollapsed(localStorage, !c); return !c; });

  const closeDrawer = useCallback((restoreFocus: boolean) => {
    setDrawerOpen(false);
    if (restoreFocus) menuButton.current?.focus();
  }, []);
  // Following a link closes the drawer; the tour opens and closes it when a step points into the sidebar.
  useEffect(() => setDrawerOpen(false), [path]);
  useEffect(() => {
    const open = () => setDrawerOpen(true), close = () => setDrawerOpen(false);
    addEventListener(DRAWER_OPEN_EVENT, open);
    addEventListener(DRAWER_CLOSE_EVENT, close);
    return () => { removeEventListener(DRAWER_OPEN_EVENT, open); removeEventListener(DRAWER_CLOSE_EVENT, close); };
  }, []);
  // Opening by the menu button moves focus into the drawer; Esc closes it and returns focus to the button.
  useEffect(() => {
    if (!drawerOpen || !narrow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); closeDrawer(true); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [drawerOpen, narrow, closeDrawer]);
  const openDrawer = () => {
    setDrawerOpen(true);
    requestAnimationFrame(() => nav.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus());
  };
  // Tab stays inside the open drawer while focus is in it (the tour card and help popovers live outside and keep their own order).
  const trapTab = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || !drawerOpen || !narrow) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    const first = items[0], last = items.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const isProject = PROJECT_VIEWS.some((v) => v.href === path);
  const hasProject = showProjectMenu({ hydrated, library, activeId });
  const [menuFolded, setMenuFolded] = useState(false);
  // The folded state is read after mount (and when the open project changes) so the static export and first render match.
  useEffect(() => { if (activeId) setMenuFolded(readProjectMenuCollapsed(localStorage, activeId)); }, [activeId]);
  const toggleMenu = () => setMenuFolded((f) => { writeProjectMenuCollapsed(localStorage, activeId, !f); return !f; });
  // No project to show on a project page (all deleted, then a reload or back button): go to the library, which explains.
  const noProjectHere = isProject && hydrated && library.length === 0;
  useEffect(() => { if (noProjectHere) router.replace("/projects"); }, [noProjectHere, router]);
  const B = project.timeline.buildMonths, H = project.timeline.horizonMonths;

  const link = (href: string, Icon: LucideIcon, label: string, small?: string) => (
    <Link key={href} href={href} aria-current={path === href ? "page" : undefined} title={label}
      className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1.5 font-medium", path === href ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2")}>
      <span className="flex min-w-0 items-center gap-2"><Icon size={15} aria-hidden className="flex-none" /><span className="nav-label truncate">{label}</span></span>
      {small && <small className="num nav-label text-xs text-muted">{small}</small>}
    </Link>
  );

  return (
    <div className={cn("grid min-h-full grid-cols-1 lg:h-full lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:lg:transition-none", collapsed ? "lg:grid-cols-[60px_minmax(0,1fr)]" : "lg:grid-cols-[212px_minmax(0,1fr)]")}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:font-medium focus:text-accent-ink">Skip to main content</a>
      <ProductTour />
      {drawerOpen && narrow && <div aria-hidden onClick={() => closeDrawer(true)} className="fixed inset-0 z-20 bg-ink/40 lg:hidden" />}
      <nav ref={nav} id="main-nav" aria-label="Main" data-collapsed={collapsed} onKeyDown={trapTab} inert={narrow && !drawerOpen}
        className={cn(
          "group fixed inset-y-0 left-0 z-30 flex w-[272px] max-w-[85vw] flex-col gap-4 overflow-auto border-r border-line bg-surface px-3 py-4 shadow-xl transition-transform duration-200 motion-reduce:transition-none",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          "lg:relative lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:shadow-none")}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 font-display text-base font-bold">
            <span aria-hidden className="relative h-5 w-5 flex-none rounded-[5px] bg-accent after:absolute after:inset-x-1 after:inset-y-[5px] after:border-b-2 after:border-l-2 after:border-accent-ink" />
            <span className="nav-label">AI Cost &amp; ROI Studio</span>
          </div>
          <button type="button" aria-label="Close menu" onClick={() => closeDrawer(true)} className="grid h-7 w-7 flex-none place-items-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden"><X size={16} aria-hidden /></button>
        </div>
        <Group label="Quick tools">{link("/tokens", Calculator, "Token calculator")}{link("/wizard", Sparkles, "New estimate wizard")}</Group>
        <Group label="Projects">{link("/projects", FolderOpen, "All projects")}</Group>
        {hasProject && (
          <div className="flex flex-col gap-px" data-testid="project-menu">
            <button type="button" id="project-menu-toggle" aria-expanded={!menuFolded} aria-controls="project-menu-pages" onClick={toggleMenu} title={project.name}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs uppercase tracking-[0.08em] text-muted hover:bg-surface-2">
              <span className="nav-label truncate">{project.name}</span>
              <ChevronDown size={14} aria-hidden className={cn("flex-none transition-transform duration-200 motion-reduce:transition-none", menuFolded && "-rotate-90")} />
            </button>
            <div aria-hidden className="nav-rule mx-2 hidden border-t border-line" />
            <div id="project-menu-pages" role="group" aria-labelledby="project-menu-toggle" inert={menuFolded}
              className={cn("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", menuFolded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")}>
              <div className="flex min-h-0 flex-col gap-px overflow-hidden">
                {link("/summary", LayoutDashboard, "Summary")}
                {link("/overview", ChartColumn, "Overview")}
                {link("/build", Hammer, "Build", `M1–${B}`)}
                {link("/run", Activity, "Run", `M${B + 1}–${H}`)}
                {link("/roi", TrendingUp, "Value & ROI")}
                {link("/capacity", Cpu, "Capacity (PTU)")}
                {link("/report", FileText, "Report")}
                {link("/settings", Settings, "Settings")}
              </div>
            </div>
          </div>
        )}
        <Group label="Data">{link("/prices", Database, "Prices & sources")}{link("/glossary", BookOpen, "Glossary")}</Group>
        <ProjectFile hasProject={hasProject} />
        <button type="button" onClick={toggleCollapsed} aria-pressed={collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mt-auto hidden items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-2 hover:bg-surface-2 lg:flex">
          {collapsed ? <PanelLeftOpen size={15} aria-hidden /> : <PanelLeftClose size={15} aria-hidden />}
          <span className="nav-label">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
        <p className="nav-label border-t border-line pt-2.5 text-xs text-muted lg:mt-0">
          <b className="text-ink-2">Local mode.</b> Saved in this browser. Prices as of {catalog.meta.asOf}; refresh with <span className="num">pnpm prices</span>.
        </p>
      </nav>
      <main id="main-content" tabIndex={-1} className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] lg:h-full lg:overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2.5 px-3 pb-2.5 pt-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button ref={menuButton} type="button" aria-label="Open menu" aria-expanded={drawerOpen} aria-controls="main-nav" onClick={() => (drawerOpen ? closeDrawer(false) : openDrawer())}
              className="grid h-9 w-9 flex-none place-items-center rounded-md border border-line bg-surface text-ink-2 hover:bg-surface-2 lg:hidden"><Menu size={18} aria-hidden /></button>
            <div className="min-w-0">
              <div className="truncate text-xs text-muted">{isProject && hasProject ? project.name : path === "/tokens" || path === "/wizard" ? "Quick tools" : path === "/projects" ? "Library" : path === "/glossary" ? "Help" : "Data"}</div>
              <h1 className="text-xl font-bold sm:text-[21px]">{TITLES[path] ?? "Overview"}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={() => useStudio.getState().undo()} className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-ink-2 enabled:hover:bg-surface-2 disabled:opacity-40"><Undo2 size={15} aria-hidden /></button>
            <button type="button" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!canRedo} onClick={() => useStudio.getState().redo()} className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-ink-2 enabled:hover:bg-surface-2 disabled:opacity-40"><Redo2 size={15} aria-hidden /></button>
            <ThemeToggle />
            <span className="mr-1"><HelpMenu path={path} /></span>
            {[["Currency", "CAD"], ["Azure", DEPLOYMENT_LABEL[project.settings.azureDeployment]], ["Snowflake", `${project.settings.snowflake.edition} · ${project.settings.snowflake.routing}`], ["Prices", catalog.meta.asOf]].map(([k, v]) => (
              <span key={k} className="hidden rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-2 sm:inline">{k} <b className="font-semibold text-ink">{v}</b></span>
            ))}
          </div>
        </header>
        <div>
          {isProject && hasProject && path !== "/summary" && <KpiBar />}
          {isProject && hasProject && <LabourExcludedNote />}
          {problem && <div role="alert" className="mx-3 mt-2 rounded-md bg-crit-soft px-3 py-2 text-sm text-crit sm:mx-5">{problem}</div>}
          {((isProject && hasProject) || path === "/tokens") && <PageIntro path={path} />}
        </div>
        <div className="min-h-0 px-3 pb-4 pt-3.5 sm:px-5">{isProject && !hasProject ? (hydrated ? <EmptyLibrary /> : null) : children}</div>
      </main>
    </div>
  );
}

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-px">
    <div className="nav-label truncate px-2 pb-1 text-xs uppercase tracking-[0.08em] text-muted">{label}</div>
    <div aria-hidden className="nav-rule mx-2 hidden border-t border-line" />
    {children}
  </div>
);

function KpiBar() {
  const { project, ledger, roi } = useLedger();
  const t = ledger.totals, B = project.timeline.buildMonths, H = project.timeline.horizonMonths;
  const basis = { run: "running cost only", runMaint: "running + maintenance", full: "full lifecycle" }[project.roi.basis];
  const k = [
    [`Build · months 1–${B}`, cad(t.build), project.build.includeLabour ? `${cad(t.devLab)} of it AI Dev Lab` : "Build labour excluded"],
    ["Production run-rate", `${cad(t.runRate)}/mo`, `+ ${cad(t.maintRate)} maintenance`],
    ["Benefit at full adoption", `${cad(t.benefitRate)}/mo`, `${project.benefits.capabilities.length + project.benefits.avoidedCosts.length} sources`],
    ["Payback", roi.paybackMonth ? `Month ${roi.paybackMonth}` : `> ${H} months`, basis],
    [`${fmt(H / 12, H % 12 ? 1 : 0)}-year ROI`, `${fmt(roi.roi * 100)}%`, `NPV ${cad(roi.npv)} at ${project.roi.discountRatePct}%`],
  ];
  const bar = (
    <>
      <div className="grid h-2 gap-0.5 overflow-hidden rounded" style={{ gridTemplateColumns: `${B}fr ${H - B}fr` }}><i className="bg-[var(--s2)]" /><i className="bg-[var(--s3)]" /></div>
      <span className="text-xs text-ink-2" title={monthLegendText(project.startDate, B, H)}>Build M1–{B} · Production M{B + 1}–{H}</span>
      <span className="text-xs text-muted">M1 = month 1 of the project</span>
    </>
  );
  return (
    <div className="mx-3 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface sm:mx-5 md:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      {k.map(([l, v, d]) => (
        <div key={l} className="-mb-px -mr-px min-w-0 border-b border-r border-line px-3.5 py-2 xl:mb-0 xl:mr-0 xl:border-b-0">
          <div className="text-xs text-muted sm:truncate">{l}</div>
          <div className="font-display text-xl font-bold tabular-nums leading-tight">{v}</div>
          <div className="text-xs text-ink-2 sm:truncate">{d}</div>
        </div>
      ))}
      {/* The build / production bar stays visible at every width; below xl it takes its own row. */}
      <div className="col-span-full flex min-w-[190px] flex-col justify-center gap-1 px-3.5 py-2 xl:col-span-1 xl:px-3">{bar}</div>
    </div>
  );
}

function ExportButtons({ btn }: { btn: string }) {
  const { project, ledger, roi } = useLedger();
  return (
    <>
      <button type="button" className={btn} title="Export Excel" onClick={() => exportXlsx(project, ledger, roi)}><FileSpreadsheet size={14} aria-hidden className="flex-none" /><span className="nav-label">Export Excel</span></button>
      <button type="button" className={btn} title="Export CSV" onClick={() => exportCsv(project, ledger)}><FileText size={14} aria-hidden className="flex-none" /><span className="nav-label">Export CSV</span></button>
      <Link href="/report" className={btn} title="Printable report"><Printer size={14} aria-hidden className="flex-none" /><span className="nav-label">Printable report</span></Link>
    </>
  );
}

function ProjectFile({ hasProject }: { hasProject: boolean }) {
  const project = useStudio((s) => s.project);
  const add = useStudio((s) => s.add);
  const create = useStudio((s) => s.create);
  const input = useRef<HTMLInputElement>(null);
  const exportFile = () => downloadProject(project);
  const importFile = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      let migrated: unknown;
      try {
        migrated = migrateProject(raw);
      } catch (err) {
        useStudio.setState({ problem: `${f.name}: ${err instanceof Error ? err.message : String(err)}` });
        return;
      }
      const parsed = ProjectSchema.safeParse(migrated);
      if (parsed.success) add(parsed.data);
      else useStudio.setState({ problem: `${f.name} is not a valid project file. ${describeIssue(parsed.error.issues[0])}` });
    } catch {
      useStudio.setState({ problem: `${f.name} is not a JSON project file` });
    }
  };

  const btn = "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-2 hover:bg-surface-2";
  return (
    <div data-tour="export"><Group label="Project file & export">
      {hasProject && <button type="button" className={btn} title="Save to file" onClick={exportFile}><Download size={14} aria-hidden className="flex-none" /><span className="nav-label">Save to file</span></button>}
      <button type="button" className={btn} title="Open file as new project" onClick={() => input.current?.click()}><Upload size={14} aria-hidden className="flex-none" /><span className="nav-label">Open file as new project</span></button>
      <button type="button" className={btn} title="New copy of the sample" onClick={() => create("meeting", meetingIntelligence.name)}><RotateCcw size={14} aria-hidden className="flex-none" /><span className="nav-label">New copy of the sample</span></button>
      {hasProject && <ExportButtons btn={btn} />}
      <input ref={input} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
    </Group></div>
  );
}
