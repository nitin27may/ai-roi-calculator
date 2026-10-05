"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Month } from "@studio/engine";
import { Card, CardHead, Pill, Seg } from "@/components/ui";
import { Legend, useSize } from "@/components/charts";
import { catalog, useLedger, useLevers } from "@/lib/compute";
import { useStudio } from "@/lib/store";
import { cad, kcad } from "@/lib/format";

const P3_NOTICE_KEY = "studio.notice.p3";

/** One-time notice for the P3 token-accuracy fixes; dismissal persists in localStorage so it shows once per browser. */
function P3Notice() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => { setDismissed(localStorage.getItem(P3_NOTICE_KEY) === "1"); }, []);
  if (dismissed) return null;
  const dismiss = () => { localStorage.setItem(P3_NOTICE_KEY, "1"); setDismissed(true); };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-[13px] text-ink-2">
      <span className="flex-1">Estimates updated: cache writes and reasoning tokens are now priced.</span>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded-md p-1 text-ink-3 hover:bg-surface hover:text-ink"><X size={14} /></button>
    </div>
  );
}

export default function Overview() {
  const [side, setSide] = useState<"levers" | "alerts">("levers");
  const { ledger } = useLedger();
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3.5">
      <P3Notice />
      <Story />
      <div className="grid min-h-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Card>
          <CardHead title="Lifecycle" sub={<>Each lane is a cost stream by month. <b>Drag the go-live line</b> (or focus it and use the arrow keys) to change how long the build runs.</>}>
            <Legend items={[{ label: "Build", color: "var(--build)" }, { label: "Production", color: "var(--run)" }, { label: "Platform", color: "var(--platform)" }, { label: "Maintenance", color: "var(--maint)" }, { label: "Benefit", color: "var(--benefit)" }]} />
          </CardHead>
          <LifecycleCanvas />
        </Card>
        <Card>
          <div className="px-3.5 pb-2 pt-3">
            <Seg label="Side panel" value={side} onChange={setSide} options={[{ value: "levers", label: "Savings levers" }, { value: "alerts", label: <>Alerts <span className="ml-1 rounded-full bg-crit-soft px-1.5 text-crit">{ledger.notes.length}</span></> }]} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">{side === "levers" ? <Levers /> : <Alerts />}</div>
        </Card>
      </div>
    </div>
  );
}

function Story() {
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
      {num(devs, (n) => edit((d) => { const t = d.build.team.find((x) => x.experiments); if (t) t.people = n; }), 1, 30, "Developers")} developers build for{" "}
      {num(project.timeline.buildMonths, (n) => edit((d) => { d.timeline.buildMonths = n; }), 1, 18, "Build months")} months, testing{" "}
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

function LifecycleCanvas() {
  const { project, ledger, roi } = useLedger();
  const edit = useStudio((s) => s.edit);
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const B = project.timeline.buildMonths, Hm = project.timeline.horizonMonths, months = ledger.months;
  const comp = (m: Month, ids: string[]) => m.lines.filter((l) => l.stream === "devlab" && ids.includes(l.componentId)).reduce((s, l) => s + l.cost, 0);
  const kinds = (k: string[]) => project.build.activities.filter((a) => k.includes(a.kind)).map((a) => a.id);
  const lanes: [string, string, number[]][] = [
    ["Build labour", "var(--build-2)", months.map((m) => m.byStream.labour)],
    ["Model bake-off", "var(--build)", months.map((m) => comp(m, kinds(["bakeoff"])))],
    ["Harness iterations", "var(--build)", months.map((m) => comp(m, kinds(["iterations"])))],
    ["Regression, eval & red team", "var(--build)", months.map((m) => comp(m, kinds(["regression", "evaluation", "redteam"])))],
    ["Tools & dev environment", "var(--build)", months.map((m) => comp(m, kinds(["playground", "tooling"])) + m.byStream.devenv)],
    ["Production AI usage", "var(--run)", months.map((m) => m.byStream.run)],
    ["Platform & infrastructure", "var(--platform)", months.map((m) => m.byStream.platform)],
    ["Maintenance", "var(--maint)", months.map((m) => m.byStream.maint)],
    ["Benefit", "var(--benefit)", months.map((m) => m.benefit)],
  ];
  const W = Math.max(480, w), Ht = Math.max(360, h), L = 178, R = 70, T = 22, cumH = 86;
  const laneH = Math.max(24, Math.min(40, (Ht - T - cumH - 34) / lanes.length)), bw = (W - L - R) / Hm, x = (m: number) => L + m * bw;
  const cy0 = T + lanes.length * laneH + 26, cH = cumH - 12, vals = roi.cumulative;
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals, 1), y = (v: number) => cy0 + (cH * (hi - v)) / (hi - lo);
  const setB = (nb: number) => { nb = Math.min(18, Math.max(1, nb)); if (nb !== B) edit((d) => { d.timeline.buildMonths = nb; }); };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const mv = (ev: PointerEvent) => { const r = svg.getBoundingClientRect(); setB(Math.round(((ev.clientX - r.left) * (W / r.width) - L) / bw)); };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };
  const gx = x(B);
  return (
    <div ref={ref} className="relative min-h-[400px] flex-1 overflow-hidden px-1.5 pb-1.5">
      {w > 0 && (
        <svg className="chart absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label="Lifecycle cost lanes by month">
          <rect x={L} y={0} width={B * bw} height={T + lanes.length * laneH} fill="var(--build)" opacity={0.06} />
          <text x={L + 4} y={14}>Build</text>
          <text x={gx + 42} y={14}>Production</text>
          {Array.from({ length: Hm }, (_, m) => m).filter((m) => m % 6 === 0 || m === Hm - 1).map((m) => <text key={m} x={x(m) + bw / 2} y={T + lanes.length * laneH + 14} textAnchor="middle">M{m + 1}</text>)}
          {lanes.map(([n, c, v], li) => {
            const y0 = T + li * laneH, mx = Math.max(...v, 1), tot = v.reduce((a, b) => a + b, 0);
            return (
              <g key={n}>
                <line x1={L} x2={W - R} y1={y0 + laneH} y2={y0 + laneH} stroke="var(--line)" />
                <text x={4} y={y0 + laneH / 2 + 4} style={{ fill: "var(--ink-2)", fontSize: 12 }}>{n}</text>
                <text x={W - 6} y={y0 + laneH / 2 + 4} textAnchor="end" className="num" style={{ fill: "var(--ink)", fontSize: 11.5 }}>{tot > 0 ? kcad(tot) : "–"}</text>
                {v.map((val, m) => val > 0 && (
                  <rect key={m} x={x(m) + 1} y={y0 + laneH - 3 - Math.max(2, ((laneH - 6) * val) / mx)} width={Math.max(1, bw - 2)} height={Math.max(2, ((laneH - 6) * val) / mx)} rx={1.5} fill={c} opacity={li === lanes.length - 1 ? 1 : 0.85}>
                    <title>{`${n} · month ${m + 1}: ${cad(val)}`}</title>
                  </rect>
                ))}
              </g>
            );
          })}
          <text x={4} y={cy0 + cH / 2} style={{ fill: "var(--ink-2)", fontSize: 12 }}>Cumulative net</text>
          <text x={W - 6} y={cy0 + cH / 2} textAnchor="end" style={{ fill: "var(--ink)", fontSize: 11.5 }}>{kcad(vals.at(-1) ?? 0)}</text>
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" />
          <path d={vals.map((v, m) => `${m ? "L" : "M"}${x(m) + bw / 2},${y(v)}`).join("")} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {roi.paybackMonth && (
            <g>
              <circle cx={x(roi.paybackMonth - 1) + bw / 2} cy={y(vals[roi.paybackMonth - 1]!)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
              <text x={x(roi.paybackMonth - 1) + bw / 2} y={y(vals[roi.paybackMonth - 1]!) - 9} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>Payback M{roi.paybackMonth}</text>
            </g>
          )}
          <g tabIndex={0} role="slider" aria-label="Go-live month" aria-valuemin={2} aria-valuemax={19} aria-valuenow={B + 1} style={{ cursor: "ew-resize" }}
            onPointerDown={onDown} onKeyDown={(e) => { if (e.key === "ArrowLeft") setB(B - 1); if (e.key === "ArrowRight") setB(B + 1); }}>
            <rect x={gx - 10} y={0} width={20} height={Ht} fill="transparent" />
            <line x1={gx} x2={gx} y1={18} y2={cy0 + cH} stroke="var(--ink)" strokeWidth={2} strokeDasharray="4 3" />
            <rect x={gx - 36} y={0} width={72} height={18} rx={9} fill="var(--ink)" />
            <text x={gx} y={13} textAnchor="middle" style={{ fill: "var(--bg)", fontWeight: 600 }}>Go-live M{B + 1}</text>
          </g>
        </svg>
      )}
    </div>
  );
}

function Levers() {
  const project = useStudio((s) => s.project);
  const replace = useStudio((s) => s.replace);
  const options = useLevers();
  if (!options.length) return <p className="text-sm text-muted">No savings levers apply to this project right now.</p>;
  return (
    <div>
      <p className="mb-1 text-[11.5px] text-muted">Savings over {project.timeline.horizonMonths} months on the selected cost basis. Applying a lever changes the project; save to a file first if you want to compare.</p>
      {options.map(({ lever, saving }) => (
        <div key={lever.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 border-b border-line py-2.5 last:border-b-0">
          <div>
            <b className="font-semibold">{lever.label}</b>
            <div className="text-[11.5px] text-muted">{lever.detail}</div>
            <div className="mt-1 flex items-center gap-2">
              <Pill>{lever.phase === "build" ? "Build" : "Production"}</Pill>
              <button type="button" className="rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:bg-surface-2" onClick={() => replace(lever.apply(project, catalog))}>Apply</button>
            </div>
          </div>
          <span className="num whitespace-nowrap text-[12.5px] font-semibold text-good">{saving > 0 ? `−${cad(saving)}` : cad(0)}</span>
        </div>
      ))}
    </div>
  );
}

function Alerts() {
  const { ledger } = useLedger();
  if (!ledger.notes.length) return <p className="text-sm text-muted">Nothing needs attention.</p>;
  const tone = { "promo-ended": "warn", retired: "crit", deprecated: "crit", unverified: "n", "long-context": "warn", routing: "n", unavailable: "crit", "tier-unavailable": "warn" } as const;
  const label = { "promo-ended": "Promo", retired: "Retires", deprecated: "Deprecated", unverified: "Unverified", "long-context": "Long context", routing: "Routing", unavailable: "Not offered", "tier-unavailable": "Tier fallback" } as const;
  return (
    <div>
      {ledger.notes.map((n) => (
        <div key={n.message} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 border-b border-line py-2 text-[12.5px] last:border-b-0">
          <Pill tone={tone[n.kind]}>{label[n.kind]}</Pill>
          <span>{n.message}</span>
        </div>
      ))}
    </div>
  );
}
