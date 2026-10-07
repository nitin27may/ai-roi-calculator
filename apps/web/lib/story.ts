import { labourExcluded, type Project } from "@roi-calculator/engine";
import { cad } from "./format";

/** The editable numbers inside the story sentence. */
export type StoryField = "people" | "months" | "users" | "ramp";

export type StorySeg =
  | { t: "text"; s: string }
  | { t: "bold"; s: string }
  | { t: "num"; field: StoryField; value: number; min: number; max: number; label: string }
  | { t: "basis" };

export interface StoryContext {
  /** Total cost of delivery items (vendor, training and similar) over the plan, in CAD. */
  deliveryCad: number;
  /** Month the cumulative position turns positive, or null when it does not within the plan. */
  paybackMonth: number | null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const text = (s: string): StorySeg => ({ t: "text", s });

/** Whether the story tells the candidate-models line: the project has a model bake-off with at least one candidate. */
export function bakeoffCandidates(p: Project): number {
  const bake = p.build.activities.find((a) => a.kind === "bakeoff");
  return bake?.kind === "bakeoff" ? bake.candidates.length : 0;
}

/** People on the build team that run experiments (AI projects), or all build people when nobody is marked. */
function storyPeople(p: Project, ai: boolean): number {
  const lines = ai ? p.build.team.filter((t) => t.experiments) : p.build.team;
  return lines.reduce((s, t) => s + t.people, 0);
}

/** What happens at go-live, from the first workload that carries a user or volume figure. Empty when none does. */
function goLive(p: Project): { clause: string; users?: number } | null {
  const chat = p.workloads.find((w) => w.kind === "chat");
  if (chat?.kind === "chat" && chat.users > 0) return { clause: "users", users: chat.users };
  const seats = p.workloads.find((w) => w.kind === "seats" && !w.volumeFrom && w.seats > 0);
  if (seats?.kind === "seats") return { clause: "seats", users: seats.seats };
  const fee = p.workloads.find((w) => w.kind === "transactionFee" && !w.volumeFrom && w.volumePerMonth > 0);
  if (fee?.kind === "transactionFee") return { clause: "transactions", users: fee.volumePerMonth };
  return null;
}

/**
 * The one-sentence story of the project as segments. Projects with a model bake-off keep the candidate-models line.
 * Every other project reads as team, build months, environments, delivery costs, go-live and payback, and any number
 * the project does not have is left out instead of printed as a gap or a zero.
 */
export function storySegments(p: Project, ctx: StoryContext): StorySeg[] {
  const candidates = bakeoffCandidates(p);
  const months: StorySeg = { t: "num", field: "months", value: p.timeline.buildMonths, min: 1, max: 18, label: "Build months" };
  const ramp: StorySeg = { t: "num", field: "ramp", value: p.timeline.adoptionRampMonths, min: 0, max: 24, label: "Adoption months" };
  const segs: StorySeg[] = [];
  const excluded = labourExcluded(p);
  const people = storyPeople(p, candidates > 0);

  if (candidates > 0) {
    if (excluded) segs.push(text("Build labour is excluded from every figure. The engineering lab runs for "), months, text(" months, testing "));
    else if (people > 0) segs.push({ t: "num", field: "people", value: people, min: 1, max: 30, label: "Developers" }, text(" developers build for "), months, text(" months, testing "));
    else segs.push(text("The build runs for "), months, text(" months, testing "));
    segs.push({ t: "bold", s: String(candidates) }, text(` candidate ${plural(candidates, "model", "models")}. Then `));
  } else {
    if (excluded) segs.push(text("Build labour is excluded from every figure. The build runs for "), months, text(" months"));
    else if (people > 0) segs.push({ t: "num", field: "people", value: people, min: 1, max: 30, label: "People on the build team" }, text(` ${plural(people, "person builds", "people build")} for `), months, text(" months"));
    else segs.push(text("The build runs for "), months, text(" months"));
    const envs = p.environments?.length ?? 0;
    const extras = [
      envs > 0 ? `${envs} ${plural(envs, "environment", "environments")}` : "",
      ctx.deliveryCad > 0 ? `${cad(ctx.deliveryCad)} of delivery costs` : "",
    ].filter(Boolean);
    if (extras.length) segs.push(text(`, with ${extras.join(" and ")}`));
    segs.push(text(". Then "));
  }

  const live = goLive(p);
  if (live?.clause === "users" && candidates > 0) {
    segs.push({ t: "num", field: "users", value: live.users!, min: 1, max: 1_000_000, label: "Users" }, text(" users adopt it over "), ramp, text(" months."));
  } else if (live) {
    const what = live.clause === "users" ? "users adopt it" : live.clause === "seats" ? "seats are rolled out" : "transactions a month go through it";
    segs.push({ t: "bold", s: live.users!.toLocaleString("en-CA") }, text(` ${what} over `), ramp, text(" months."));
  } else {
    segs.push(text(candidates > 0 ? "your users adopt it over " : "it goes live and reaches full use over "), ramp, text(" months."));
  }
  if (candidates === 0) segs.push(text(ctx.paybackMonth ? ` Payback comes in month ${ctx.paybackMonth}.` : " It does not pay back within the plan."));
  segs.push(text(" ROI is measured on "), { t: "basis" }, text("."));
  return segs;
}

/** The sentence as plain text, with each editable number written out. Used by tests and anywhere a string is needed. */
export function storyText(segs: readonly StorySeg[], basisLabel: string): string {
  return segs.map((s) => (s.t === "text" ? s.s : s.t === "bold" ? s.s : s.t === "num" ? String(s.value) : basisLabel)).join("").replace(/\s+/g, " ").trim();
}
