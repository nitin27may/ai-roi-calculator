import { DELIVERY_COST_CATEGORIES, type DeliveryCostCategory, type DeliveryPhase, type Effort, type Project } from "./project.js";
import { sum } from "./lines.js";

/** Id of the delivery phase whose team lines may be costed after go-live. */
export const HYPERCARE_ID = "hypercare";
/** Months of hypercare after go-live that "Use standard phases" proposes. */
export const HYPERCARE_MONTHS = 2;

/**
 * The standard delivery phases, in order. `months` is each phase's share of a 12-month build,
 * so a 12-month build gets those months exactly and shorter or longer builds are scaled.
 * Hypercare has no share: it starts at go-live and runs `HYPERCARE_MONTHS` into production.
 */
export const DELIVERY_PHASES: readonly { id: string; label: string; months: number }[] = [
  { id: "discovery", label: "Discovery", months: 1 },
  { id: "design", label: "Design", months: 2 },
  { id: "build", label: "Build", months: 5 },
  { id: "test", label: "Test", months: 2 },
  { id: "migration", label: "Migration and cutover", months: 1 },
  { id: "deploy", label: "Deploy", months: 1 },
  { id: HYPERCARE_ID, label: "Hypercare", months: 0 },
];

/**
 * Spreads the standard phases over the build months (phase k covers the slice from its cumulative start to
 * its cumulative end, scaled to the build length and starting after the previous phase; in a short build the
 * last phases can end up sharing a month). Hypercare is the `HYPERCARE_MONTHS` after go-live,
 * cut at the horizon.
 */
export function standardPhases(buildMonths: number, horizonMonths: number): DeliveryPhase[] {
  const B = Math.max(1, Math.round(buildMonths));
  const spread = DELIVERY_PHASES.filter((d) => d.id !== HYPERCARE_ID);
  const total = sum(spread.map((d) => d.months));
  let cum = 0, prevTo = 0;
  const out: DeliveryPhase[] = spread.map((d) => {
    const a = (cum * B) / total;
    cum += d.months;
    const b = (cum * B) / total;
    // Start after the previous phase ends; only the last phases of a short build are squeezed into a shared month.
    const fromMonth = Math.min(B, Math.max(Math.floor(a + 1e-9) + 1, prevTo + 1));
    const toMonth = Math.min(B, Math.max(fromMonth, Math.ceil(b - 1e-9)));
    prevTo = toMonth;
    return { id: d.id, label: d.label, fromMonth, toMonth };
  });
  const h = DELIVERY_PHASES.find((d) => d.id === HYPERCARE_ID)!;
  const from = B + 1;
  if (from <= horizonMonths) out.push({ id: h.id, label: h.label, fromMonth: from, toMonth: Math.min(horizonMonths, B + HYPERCARE_MONTHS) });
  return out;
}

type LineLike = { phaseId?: string | undefined; fromMonth?: number | undefined; toMonth?: number | undefined; effort?: Effort | undefined };

export const phaseOf = (p: Pick<Project, "timeline">, t: { phaseId?: string | undefined }): DeliveryPhase | undefined =>
  t.phaseId === undefined ? undefined : p.timeline.phases?.find((x) => x.id === t.phaseId);

/** True when the project's hypercare phase runs past the build, so hypercare lines may be costed in production months. */
export const hypercareExtends = (p: Pick<Project, "timeline">): boolean => {
  const h = p.timeline.phases?.find((x) => x.id === HYPERCARE_ID);
  return !!h && h.toMonth > p.timeline.buildMonths;
};

/**
 * The months a team line is billed: its own From and To, else its phase's months, else the whole build.
 * Never past the last build month, except a line in the hypercare phase (and only when that phase extends
 * past the build): it may run to the end of the hypercare phase, cut at the horizon. This is the only
 * place a build line can be billed outside the build months.
 */
export function lineWindow(p: Pick<Project, "timeline">, t: LineLike): { from: number; to: number } {
  const B = p.timeline.buildMonths;
  const ph = phaseOf(p, t);
  const hyper = t.phaseId === HYPERCARE_ID && ph !== undefined && hypercareExtends(p);
  const cap = hyper ? Math.min(ph!.toMonth, p.timeline.horizonMonths) : B;
  return { from: t.fromMonth ?? ph?.fromMonth ?? 1, to: Math.min(t.toMonth ?? ph?.toMonth ?? B, cap) };
}

/** Whether a team line is billed in project month `m`. */
export const lineActiveIn = (p: Pick<Project, "timeline">, t: LineLike, m: number): boolean => {
  const w = lineWindow(p, t);
  return m >= w.from && m <= w.to;
};

/** Months in a line's window (0 when From is after To). */
export const windowMonths = (p: Pick<Project, "timeline">, t: LineLike): number => {
  const w = lineWindow(p, t);
  return Math.max(0, w.to - w.from + 1);
};

/** Total hours of an effort entry: people x weeks x hours per week. */
export const effortTotalHours = (e: Effort): number => e.people * e.weeks * e.hoursPerWeek;

/**
 * Hours per month for a build line, all people together. With `effort` it is the total effort hours
 * (people x weeks x hours per week) spread evenly over the months in the line's window; otherwise
 * people x hours per month. A window of 0 months gives 0.
 */
export function lineMonthlyHours(p: Pick<Project, "timeline">, t: LineLike & { people: number; hoursPerMonth: number }): number {
  if (!t.effort) return t.people * t.hoursPerMonth;
  const n = windowMonths(p, t);
  return n > 0 ? effortTotalHours(t.effort) / n : 0;
}

/** Labels for the delivery cost categories, for the add menu and the screens. */
export const DELIVERY_COST_KINDS: readonly { kind: DeliveryCostCategory; label: string; detail: string }[] = [
  { kind: "vendor", label: "Vendor or integrator work", detail: "Fixed-fee or time-and-materials work bought in" },
  { kind: "training", label: "Training", detail: "Courses, materials and trainer time for the people who will use it" },
  { kind: "comms", label: "Communications", detail: "Announcements, change communications and launch material" },
  { kind: "dataMigration", label: "Data migration", detail: "Cleansing, conversion and loading of existing data" },
  { kind: "other", label: "Other delivery cost", detail: "Anything else that is not labour or infrastructure" },
];

/** Adds an empty delivery cost of a category (C$ 0, once, in the first build month) and returns its id. Mutates `p`. */
export function addDeliveryCost(p: Project, category: DeliveryCostCategory): string {
  const list = (p.build.deliveryCosts ??= []);
  let n = 1;
  while (list.some((x) => x.id === `delivery-${n}`)) n++;
  const id = `delivery-${n}`;
  const label = DELIVERY_COST_KINDS.find((k) => k.kind === category)!.label;
  list.push({ id, label, amountCad: 0, cadence: "once", category });
  return id;
}

/** Removes a delivery cost; an emptied list is dropped so the file returns to its original shape. Mutates `p`. */
export function removeDeliveryCost(p: Project, id: string): void {
  if (!p.build.deliveryCosts) return;
  p.build.deliveryCosts = p.build.deliveryCosts.filter((x) => x.id !== id);
  if (p.build.deliveryCosts.length === 0) delete p.build.deliveryCosts;
}

export const isDeliveryCategory = (v: string): v is DeliveryCostCategory => (DELIVERY_COST_CATEGORIES as readonly string[]).includes(v);

/** Sets the project's phases to the standard list for its build length. Replaces any phases already there. Mutates `p`. */
export function applyStandardPhases(p: Project): void {
  p.timeline.phases = standardPhases(p.timeline.buildMonths, p.timeline.horizonMonths);
}

/**
 * Puts team line `i` in a phase (or takes it out of any phase with `undefined`). Choosing a phase also sets the
 * line's From and To to the phase's months, cut to the build (hypercare keeps its months past go-live). Mutates `p`.
 */
export function setLinePhase(p: Project, i: number, phaseId: string | undefined): void {
  const t = p.build.team[i];
  if (!t) return;
  const ph = phaseId === undefined ? undefined : p.timeline.phases?.find((x) => x.id === phaseId);
  if (!ph) { delete t.phaseId; return; }
  t.phaseId = ph.id;
  t.fromMonth = ph.fromMonth;
  t.toMonth = ph.toMonth;
}

/**
 * Switches team line `i` between hours per month and people x weeks. Going to people x weeks keeps the
 * line's current monthly hours (people x weeks x 40 h/week = hours over the window); going back keeps
 * them as hours per month per person. Mutates `p`.
 */
export function setEffortMode(p: Project, i: number, on: boolean): void {
  const t = p.build.team[i];
  if (!t) return;
  if (on && !t.effort) {
    const hoursPerWeek = 40;
    const total = lineMonthlyHours(p, t) * windowMonths(p, t);
    t.effort = { people: t.people, weeks: t.people > 0 ? Math.round((total / (t.people * hoursPerWeek)) * 100) / 100 : 0, hoursPerWeek };
  } else if (!on && t.effort) {
    const n = windowMonths(p, t);
    if (t.people > 0 && n > 0) t.hoursPerMonth = Math.round((effortTotalHours(t.effort) / n / t.people) * 100) / 100;
    delete t.effort;
  }
}

/** Edits one effort field of team line `i` (people also sets the line's people, which drives Dev Lab volumes). Mutates `p`. */
export function setEffort(p: Project, i: number, patch: Partial<Effort>): void {
  const t = p.build.team[i];
  if (!t?.effort) return;
  t.effort = { ...t.effort, ...patch };
  if (patch.people !== undefined) t.people = patch.people;
}
