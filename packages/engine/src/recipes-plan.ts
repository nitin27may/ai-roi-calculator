import { standardPhases } from "./delivery.js";
import type { Assumption, BenefitInput, Question, RecipeAnswers, RecipeVolume, Values } from "./usecases.js";
import type { CurrentLine, DeliveryCost, Environment, Project, ProjectType, Resource, ScoreItem, Workload } from "./project.js";

/**
 * Non-AI recipes (A12), as data. Each one asks plain questions (volumes, current unit costs, what is in place today,
 * environments wanted, team size and months) and returns the pieces of a delivery plan: team lines with phases, delivery
 * costs, environments, catalogue resources, run workloads (seats, contracts, transaction fees), current-state lines,
 * scorecard starters and a benefit. They never pick a model and never add an agent harness.
 *
 * Rule for prices: a resource references a catalogue SKU by id. Every other figure is an illustrative assumption: its
 * question help says so, its label carries "(assumption)", and it is listed in the review step. Nothing here is a quote.
 *
 * This file imports only types from usecases.ts (the recipe list there imports this file), so there is no runtime cycle.
 */

export const ASSUMPTION_SOURCE = "Illustrative assumption: replace with your figure";
/** Plan recipes cover five years, so payback and the cumulative figure are read over 60 months. */
export const PLAN_HORIZON_MONTHS = 60;
/** Months the benefit ramps up after go-live in plan recipes. */
export const PLAN_RAMP_MONTHS = 6;

type TeamLine = Project["build"]["team"][number];
type Role = { id: string; label: string; hourlyRate: number };

/** What a plan recipe returns beyond workloads and a benefit; the wizard merges it into the project. */
export interface PlanParts {
  roles: Role[];
  team: TeamLine[];
  deliveryCosts: DeliveryCost[];
  /** Empty when the user ticked no environment: resources then run as one implicit production environment. */
  environments: Environment[];
  resources: Resource[];
  currentLines: CurrentLine[];
  scorecard: ScoreItem[];
  maintenance: Project["maintenance"];
  contingencyPct: number;
}

export interface PlanBuild { workloads: Workload[]; assumptions: Assumption[]; volume: RecipeVolume; parts: PlanParts }

/** A plan recipe before `usecases.ts` wraps it into a full `Recipe`. */
export interface PlanDef {
  id: string;
  label: string;
  description: string;
  types: ProjectType[];
  questions: Question[];
  benefitHint: string;
  benefit: (v: Values) => BenefitInput;
  plan: (a: RecipeAnswers) => PlanBuild;
}

// ---------------------------------------------------------------- question helpers

const nq = (id: string, label: string, unit: string, def: number, min: number, max: number | undefined, meaning: string, example: string, step?: number): Question =>
  ({ kind: "number", id, label, unit, default: def, min, ...(max !== undefined ? { max } : {}), ...(step ? { step } : {}), help: { meaning, example, source: ASSUMPTION_SOURCE } });
const cq = (id: string, label: string, options: [string, string][], def: string, meaning: string, example: string): Question =>
  ({ kind: "choice", id, label, options: options.map(([value, l]) => ({ value, label: l })), default: def, help: { meaning, example, source: ASSUMPTION_SOURCE } });
const tq = (id: string, label: string, def: boolean, meaning: string, example: string): Question =>
  ({ kind: "toggle", id, label, default: def, help: { meaning, example, source: ASSUMPTION_SOURCE } });

/** Environments the user may tick. Nothing is ticked at the start. Production is always modelled once any is ticked. */
const ENV_OPTIONS: [string, string][] = [["dev", "Development"], ["test", "Test"], ["uat", "User acceptance (UAT)"]];
const envQ = (): Question => ({
  kind: "multi", id: "envs", label: "Environments to cost", options: ENV_OPTIONS.map(([value, label]) => ({ value, label })), default: "",
  help: {
    meaning: "The non-production copies of the resources you want costed. Development and test run at half size for 10 hours a day on 22 days a month and stay up after go-live; UAT runs at full size on the same hours for the last two build months. Production is always included once you tick any. Tick none to cost production only.",
    example: "Development and test, with UAT left unticked for a small internal tool.",
    source: ASSUMPTION_SOURCE,
  },
});
const decomQ = (id: string, label: string, what: string): Question => cq(id, label, [["", "Not decided yet: do not count the saving"], ["yes", "Yes, it will be switched off"]], "", `${what} The saving counts only when you say it will really happen; until then it is left out, so the plan does not rely on it.`, "Yes, once the contract has run out and the system is switched off.");
const buildQs = (devsLabel: string, devs: number, months: number): Question[] => [
  nq("devs", devsLabel, "people", devs, 1, 100, "People doing the hands-on work for the whole build. Project manager, analyst, tester, DevOps and change roles are added at standard sizes and can be edited on the Build page.", `${devs} people.`, 1),
  nq("months", "Build length", "months", months, 1, 24, "Months from the start of work to go-live. The delivery phases are spread over it.", `${months} months.`, 1),
];

// ---------------------------------------------------------------- building blocks

/** Roles used by the plan recipes with placeholder hourly rates. Every rate is an assumption. */
const ROLE = {
  pm: { id: "pm", label: "Project manager", hourlyRate: 110 },
  ba: { id: "ba", label: "Business analyst", hourlyRate: 95 },
  dev: { id: "dev", label: "Developer", hourlyRate: 105 },
  qa: { id: "qa", label: "QA", hourlyRate: 85 },
  devops: { id: "devops", label: "DevOps", hourlyRate: 115 },
  change: { id: "change", label: "Change and training", hourlyRate: 85 },
  dba: { id: "dba", label: "Database administrator", hourlyRate: 110 },
  dataEngineer: { id: "dataEngineer", label: "Data engineer", hourlyRate: 110 },
} satisfies Record<string, Role>;

const num = (v: Values, k: string): number => Number(v[k] ?? 0);
const bool = (v: Values, k: string): boolean => v[k] === true;
const str = (v: Values, k: string): string => String(v[k] ?? "");
const pid = (a: RecipeAnswers, s: string) => `${a.featureId}-${s}`;
const HOURS = 150;
const asm = (s: string) => `${s} (assumption)`;

interface TeamSpec { role: Role; people: number; hours?: number; phases?: string[]; experiments?: boolean }

/**
 * Team lines for the plan. A line with `phases` is billed from the first to the last of those standard phases (a single
 * phase links the line to it); a line without runs the whole build. Hours are per person per month.
 */
function teamFor(a: RecipeAnswers, spec: TeamSpec[]): TeamLine[] {
  const B = a.dev.buildMonths;
  const phases = standardPhases(B, PLAN_HORIZON_MONTHS);
  return spec.filter((t) => t.people > 0).map((t) => {
    const line: TeamLine = { roleId: t.role.id, people: t.people, hoursPerMonth: t.hours ?? HOURS, experiments: t.experiments ?? false };
    const hit = (t.phases ?? []).map((id) => phases.find((x) => x.id === id)).filter((x) => x !== undefined);
    if (hit.length) {
      line.fromMonth = Math.min(...hit.map((x) => x.fromMonth));
      line.toMonth = Math.max(...hit.map((x) => x.toMonth));
      if (hit.length === 1) line.phaseId = hit[0]!.id; else line.phase = hit.map((x) => x.label).join(" to ");
    }
    return line;
  });
}

/** The standard team around `devs` hands-on people. Each role's phases follow the standard delivery phases. */
function standardTeam(a: RecipeAnswers, devs: number, o: { devRole?: Role; hypercare?: boolean; change?: number } = {}): TeamLine[] {
  return teamFor(a, [
    { role: ROLE.pm, people: 0.5 },
    { role: ROLE.ba, people: 1, phases: ["discovery", "design", "build"] },
    { role: o.devRole ?? ROLE.dev, people: devs, phases: ["design", "build", "test", "migration"], experiments: false },
    { role: ROLE.qa, people: 1, phases: ["build", "test", "migration"] },
    { role: ROLE.devops, people: 0.5, phases: ["build", "test", "migration", "deploy"] },
    { role: ROLE.change, people: o.change ?? 0.5, phases: ["test", "migration", "deploy"] },
    ...(o.hypercare === false ? [] : [{ role: o.devRole ?? ROLE.dev, people: 1, phases: ["hypercare"] }]),
  ]);
}

/** Environments the user ticked, with production added. Empty when none was ticked. */
function environmentsFor(a: RecipeAnswers, v: Values): { list: Environment[]; ids: string[] } {
  const chosen = new Set(str(v, "envs").split(",").filter(Boolean));
  if (!chosen.size) return { list: [], ids: [] };
  const B = a.dev.buildMonths;
  const sched = { hoursPerDay: 10, daysPerMonth: 22 };
  const list: Environment[] = [];
  if (chosen.has("dev")) list.push({ id: "dev", label: "Development", production: false, sizeFactor: 0.5, schedule: sched, toMonth: PLAN_HORIZON_MONTHS, pricing: "payg" });
  if (chosen.has("test")) list.push({ id: "test", label: "Test", production: false, sizeFactor: 0.5, schedule: sched, toMonth: PLAN_HORIZON_MONTHS, pricing: "payg" });
  if (chosen.has("uat")) list.push({ id: "uat", label: "UAT", production: false, sizeFactor: 1, schedule: sched, fromMonth: Math.max(1, B - 1), toMonth: B, pricing: "payg" });
  list.push({ id: "prod", label: "Production", production: true, sizeFactor: 1, schedule: { hoursPerMonth: 730 }, pricing: "payg" });
  return { list, ids: list.map((e) => e.id) };
}

/** A catalogue resource of the feature, priced as production; the caller sets `envIds` through `withEnvs`. */
const resource = (a: RecipeAnswers, id: string, label: string, typeId: string, skuId: string, inputs: Record<string, number>, extra: Partial<Resource> = {}): Resource =>
  ({ id: pid(a, id), label, featureId: a.featureId, typeId, skuId, inputs, term: "payg", ahb: false, ...extra });
const withEnvs = (rs: Resource[], ids: string[]): Resource[] => (ids.length ? rs.map((r) => ({ ...r, envIds: ids })) : rs);

const currentLine = (a: RecipeAnswers, id: string, label: string, category: CurrentLine["category"], basis: CurrentLine["basis"], change: CurrentLine["change"], extra: Partial<CurrentLine> = {}): CurrentLine =>
  ({ id: pid(a, id), label: asm(label), category, featureId: a.featureId, basis, change, ...extra });
const cost = (a: RecipeAnswers, id: string, label: string, category: DeliveryCost["category"], amountCad: number): DeliveryCost =>
  ({ id: pid(a, id), label: asm(label), amountCad, cadence: "once", category });
const score = (a: RecipeAnswers, id: string, label: string, dimension: ScoreItem["dimension"], measure: string, unit: string, before: number, after: number, higherIsBetter: boolean): ScoreItem =>
  ({ id: pid(a, id), label, dimension, measure, unit, before, after, higherIsBetter, weightPct: 50, confidencePct: 50, featureId: a.featureId });

const rowsFor = (a: RecipeAnswers) => {
  const rows: Assumption[] = [];
  const add = (id: string, label: string, value: Assumption["value"], unit: string, target?: Assumption["target"], source = ASSUMPTION_SOURCE) =>
    rows.push({ id: pid(a, id), featureId: a.featureId, label, value, unit, source, ...(target ? { target } : {}) });
  return { rows, add };
};
type Add = ReturnType<typeof rowsFor>["add"];
const tgt = (collection: NonNullable<Assumption["target"]>["collection"], id: string, ...field: string[]): Assumption["target"] => ({ collection, id, field });

const monthlyLine = (a: RecipeAnswers, add: Add, id: string, label: string, category: CurrentLine["category"], amountCad: number, change: CurrentLine["change"], extra: Partial<CurrentLine> = {}): CurrentLine => {
  const l = currentLine(a, id, label, category, { kind: "monthly", amountCad }, change, extra);
  add(`${id}.amount`, `${label} today, per month`, amountCad, "C$", tgt("currentLines", l.id, "basis", "amountCad"));
  return l;
};
const perUnitLine = (a: RecipeAnswers, add: Add, id: string, label: string, unitCostCad: number, volume: number, change: CurrentLine["change"], unitWord: string, category: CurrentLine["category"] = "transaction"): CurrentLine => {
  const l = currentLine(a, id, label, category, { kind: "perTransaction", unitCostCad, volumePerMonth: volume }, change);
  add(`${id}.unit`, `${label}: cost per ${unitWord}`, unitCostCad, "C$", tgt("currentLines", l.id, "basis", "unitCostCad"));
  return l;
};
const fteLine = (a: RecipeAnswers, add: Add, id: string, label: string, roleId: string, fte: number, hours: number, change: CurrentLine["change"]): CurrentLine => {
  const l = currentLine(a, id, label, "people", { kind: "fte", roleId, fte, hoursPerMonth: hours }, change);
  add(`${id}.fte`, `${label}: people today`, fte, "FTE", tgt("currentLines", l.id, "basis", "fte"));
  return l;
};
const reduce = (pct: number, followsAdoption: boolean): CurrentLine["change"] => ({ mode: "reduce", pct, followsAdoption });
const retireAt = (fromMonth: number | undefined): CurrentLine["change"] => ({ mode: "retire", ...(fromMonth ? { fromMonth } : {}) });
const decommission = (condition: string, assumed: boolean): Partial<CurrentLine> => ({ decommission: { conditional: true, condition, assumed } });

/** A role rate for a person on the current cost side (not on the build team). */
const OPS_ROLE: Role = { id: "operations", label: "Operations staff", hourlyRate: 45 };

const base = (a: RecipeAnswers, v: Values, parts: Omit<PlanParts, "maintenance" | "contingencyPct" | "environments" | "roles"> & Partial<Pick<PlanParts, "roles" | "maintenance" | "contingencyPct">>, env: ReturnType<typeof environmentsFor>): PlanParts => ({
  roles: parts.roles ?? [], team: parts.team, deliveryCosts: parts.deliveryCosts, environments: env.list, resources: withEnvs(parts.resources, env.ids),
  currentLines: parts.currentLines, scorecard: parts.scorecard,
  maintenance: parts.maintenance ?? { mode: "none" }, contingencyPct: parts.contingencyPct ?? 15,
});
void bool;

// ---------------------------------------------------------------- 1. cheques to online payments (reference template)

const ASP = { typeId: "app-service-plan", skuId: "p1v3-linux" } as const;

export const CHEQUE_DEFAULTS = {
  payments: 10_000, onlineShare: 90, stockUnit: 0.4, postageUnit: 1.2, courierCount: 500, courierUnit: 15, reissueCount: 200, reissueUnit: 25,
  reconFte: 2, reconHours: 150, reconRate: 40, reconCut: 50, lease: 1500, leaseRetireMonth: 18, gatewayFee: 0.3, support: 500,
  appInstances: 2, dbVcores: 2, dbStorageGb: 128, devs: 3, months: 6, integration: 25_000, training: 10_000,
} as const;
const D = CHEQUE_DEFAULTS;

const cheques: PlanDef = {
  id: "cheques", label: "Cheques to online payments", types: ["newApp", "automation"],
  description: "Stop printing and posting cheques: pay online through a payment gateway. Counts the print, postage, courier, re-issue, reconciliation and lease costs that fall away.",
  benefitHint: "The saving is already in the Current state lines, so no separate benefit is added. Add one on the Value page only for something those lines do not cover.",
  benefit: () => ({ type: "none" }),
  questions: [
    nq("payments", "Payments a month", "payments", D.payments, 1, 100_000_000, "How many payments you make each month today, all by cheque.", "10,000 supplier and refund payments.", 100),
    nq("onlineShare", "Share that will move online", "%", D.onlineShare, 1, 100, "The part of those payments that will be paid online once the change is fully adopted. It sets the gateway volume and how far the per-cheque costs fall.", "90 means 9,000 of 10,000 payments go online.", 1),
    nq("stockUnit", "Cheque stock and printing", "C$ per cheque", D.stockUnit, 0, 1000, "Paper, ink and printing for one cheque.", "C$0.40.", 0.05),
    nq("postageUnit", "Postage", "C$ per cheque", D.postageUnit, 0, 1000, "Stamp and envelope for one cheque.", "C$1.20.", 0.05),
    nq("courierCount", "Courier deliveries a month", "deliveries", D.courierCount, 0, 1_000_000, "Cheques sent by courier instead of post.", "500 a month.", 10),
    nq("courierUnit", "Cost of one courier delivery", "C$", D.courierUnit, 0, 10_000, "What one courier delivery costs.", "C$15.", 1),
    nq("reissueCount", "Re-issued cheques a month", "cheques", D.reissueCount, 0, 1_000_000, "Cheques that are lost, stale or wrong and have to be sent again.", "200 a month.", 10),
    nq("reissueUnit", "Cost of one re-issue", "C$", D.reissueUnit, 0, 10_000, "Staff time, bank stop fee and postage for one re-issue.", "C$25.", 1),
    nq("reconFte", "People reconciling cheques", "FTE", D.reconFte, 0, 1000, "Full-time equivalents who match cashed cheques to the ledger today.", "2 FTE.", 0.5),
    nq("reconHours", "Hours a month for one FTE", "hours", D.reconHours, 1, 250, "Working hours in a month for one of those people.", "150.", 5),
    nq("reconRate", "Hourly cost of that work", "C$ per hour", D.reconRate, 0, 1000, "Loaded hourly cost of the people reconciling.", "C$40.", 1),
    nq("reconCut", "Reconciliation work that goes away", "%", D.reconCut, 0, 100, "The share of the reconciliation effort that online payments remove at full adoption. It builds up with the adoption ramp like the other savings.", "50 means one of two FTE.", 5),
    nq("lease", "Printer lease", "C$ per month", D.lease, 0, 1_000_000, "Monthly lease of the cheque printer.", "C$1,500.", 100),
    nq("leaseRetireMonth", "Month the lease ends", "plan month", D.leaseRetireMonth, 1, 120, "The plan month from which the lease no longer costs anything (month 1 is the first build month).", "18.", 1),
    decomQ("leaseEnded", "Will the lease really end?", "The lease only stops costing money if you end it."),
    nq("gatewayFee", "Gateway fee per online payment", "C$ per payment", D.gatewayFee, 0, 100, "What the payment gateway charges for one payment. Include any percentage as its average per payment.", "C$0.30.", 0.05),
    nq("support", "Gateway support contract", "C$ per month", D.support, 0, 10_000_000, "A fixed monthly support or service contract for the new system.", "C$500.", 50),
    nq("appInstances", "App Service plan instances", "instances", D.appInstances, 1, 50, "Instances of the web app that runs the payment portal (Premium v3 P1, Linux). The price comes from the catalogue.", "2 for failover.", 1),
    nq("dbVcores", "Database vCores", "vCores", D.dbVcores, 1, 128, "vCores for the Azure SQL Database (General Purpose, provisioned). The price comes from the catalogue.", "2 vCores.", 1),
    nq("dbStorageGb", "Database storage", "GB", D.dbStorageGb, 1, 100_000, "Storage for that database.", "128 GB.", 32),
    envQ(),
    ...buildQs("Developers", D.devs, D.months),
    nq("integration", "Bank integration", "C$", D.integration, 0, 100_000_000, "A one-time cost for the bank connection, paid to the bank or an integrator.", "C$25,000.", 1000),
    nq("training", "Training", "C$", D.training, 0, 100_000_000, "A one-time cost to train the people who use the new process.", "C$10,000.", 1000),
    tq("monetiseSpeed", "Put a money value on faster payment", false, "Off by default. When on, each day saved between claim and payment is worth the amount below on every payment, as an example of a monetised scorecard item. Leave it off if the saving is already counted elsewhere.", "Switch on to see the effect of the cost of money tied up in float."),
    nq("speedValue", "Value of one day earlier", "C$ per payment", 0.05, 0, 1000, "Used only when the switch above is on: what one day earlier is worth on one payment.", "C$0.05.", 0.01),
  ],
  plan(a) {
    const v = a.values, B = a.dev.buildMonths, { rows, add } = rowsFor(a);
    const payments = num(v, "payments"), share = num(v, "onlineShare");
    const env = environmentsFor(a, v);
    const off = reduce(share, true);
    const leaseId = "lease";
    const lines: CurrentLine[] = [
      perUnitLine(a, add, "stock", "Cheque stock and printing", num(v, "stockUnit"), payments, off, "cheque"),
      perUnitLine(a, add, "postage", "Postage", num(v, "postageUnit"), payments, off, "cheque"),
      perUnitLine(a, add, "courier", "Courier", num(v, "courierUnit"), num(v, "courierCount"), off, "delivery"),
      perUnitLine(a, add, "reissue", "Re-issues", num(v, "reissueUnit"), num(v, "reissueCount"), off, "re-issue"),
      fteLine(a, add, "recon", "Reconciliation", "reconciliation", num(v, "reconFte"), num(v, "reconHours"), reduce(num(v, "reconCut"), true)),
      monthlyLine(a, add, leaseId, "Printer lease", "contract", num(v, "lease"), retireAt(num(v, "leaseRetireMonth")), decommission("Printer lease ended", str(v, "leaseEnded") === "yes")),
    ];
    const gateway: Workload = { kind: "transactionFee", id: pid(a, "gateway"), label: asm("Payment gateway"), volumePerMonth: Math.round((payments * share) / 100), cadPerTxn: num(v, "gatewayFee") } as Workload;
    const support: Workload = { kind: "contract", id: pid(a, "support"), label: asm("Gateway support contract"), amountCad: num(v, "support"), cadence: "monthly" } as Workload;
    add("gateway.volume", "Online payments a month at full adoption", (gateway as { volumePerMonth: number }).volumePerMonth, "payments", tgt("workloads", gateway.id, "volumePerMonth"));
    add("gateway.fee", "Gateway fee per payment", num(v, "gatewayFee"), "C$", tgt("workloads", gateway.id, "cadPerTxn"));
    add("support.amount", "Support contract per month", num(v, "support"), "C$", tgt("workloads", support.id, "amountCad"));
    const resources = [
      resource(a, "app", "Payment portal (App Service plan)", ASP.typeId, ASP.skuId, { instances: num(v, "appInstances") }),
      resource(a, "db", "Payment database (Azure SQL)", "sql-db-vcore", "gp-gen5", { vcores: num(v, "dbVcores"), storageGB: num(v, "dbStorageGb") }),
    ];
    const speed = score(a, "speed", "Speed: claim to payment", "speed", "Days from claim to payment", "days", 10, 2, false);
    if (bool(v, "monetiseSpeed")) speed.monetise = { cadPerUnit: num(v, "speedValue"), volumePerMonth: Math.round((payments * share) / 100) };
    const delivery = [cost(a, "integration", "Bank integration", "vendor", num(v, "integration")), cost(a, "training", "Training", "training", num(v, "training"))];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    add("team", "Team", `PM 0.5, BA 1, Dev ${num(v, "devs")}, QA 1, DevOps 0.5, Change 0.5 at ${HOURS} hours a month for ${B} months`, "people", undefined);
    return {
      workloads: [gateway, support], assumptions: rows, volume: { monthlyItems: payments, oneTimeItems: 0, unit: "payments" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change, { id: "reconciliation", label: "Reconciliation clerk", hourlyRate: num(v, "reconRate") }],
        // The plan's worked example bills every role for the whole build, so none of these lines is tied to a phase.
        team: teamFor(a, [
          { role: ROLE.pm, people: 0.5 }, { role: ROLE.ba, people: 1 }, { role: ROLE.dev, people: num(v, "devs") }, { role: ROLE.qa, people: 1 },
          { role: ROLE.devops, people: 0.5 }, { role: ROLE.change, people: 0.5 },
        ]),
        deliveryCosts: delivery, resources, currentLines: lines, scorecard: [speed, score(a, "customer", "Customer: satisfaction", "customer", "Customer satisfaction score", "points", 60, 75, true)],
      }, env),
    };
  },
};

// ---------------------------------------------------------------- 2. RPA / automation of a manual process

const rpa: PlanDef = {
  id: "rpa", label: "Automate a manual process (RPA)", types: ["automation"],
  description: "Software robots do the repetitive keying and checking. Counts the staff time and rework that falls away against a platform licence, bot machines and the build.",
  benefitHint: "Staff time is in the Current state lines. The benefit here is fewer errors: items handled times the drop in error rate times what one error costs.",
  benefit: (v) => ({ type: "quality", errorRateBeforePct: num(v, "errBefore"), errorRateAfterPct: num(v, "errAfter"), costPerError: num(v, "errCost") }),
  questions: [
    nq("items", "Items handled a month", "items", 5000, 1, 100_000_000, "How many cases, forms or transactions the process handles each month.", "5,000 invoices.", 100),
    nq("fte", "People doing it today", "FTE", 4, 0, 1000, "Full-time equivalents spent on the manual steps today.", "4 FTE.", 0.5),
    nq("fteHours", "Hours a month for one FTE", "hours", 140, 1, 250, "Working hours in a month for one of those people.", "140.", 5),
    nq("opsRate", "Hourly cost of that work", "C$ per hour", OPS_ROLE.hourlyRate, 0, 1000, "Loaded hourly cost of the people doing the work.", "C$45.", 1),
    nq("automatedPct", "Share of the work the robots take", "%", 70, 1, 100, "The part of the manual effort that the robots handle once adoption is complete. The rest stays with people (exceptions).", "70.", 5),
    nq("errBefore", "Error rate today", "%", 4, 0, 100, "Share of items handled wrongly today.", "4.", 0.5),
    nq("errAfter", "Error rate after", "%", 0.5, 0, 100, "Share of items handled wrongly once the robots run.", "0.5.", 0.5),
    nq("errCost", "Cost of one error", "C$", 40, 0, 1_000_000, "Rework, credit notes or lost time for one wrong item.", "C$40.", 5),
    nq("licence", "RPA platform licence", "C$ per month", 2500, 0, 10_000_000, "Monthly licence for the automation platform and its orchestrator.", "C$2,500.", 100),
    nq("bots", "Machines for the robots", "machines", 2, 1, 100, "Windows machines (D2s v5) that run the robots. The price comes from the catalogue.", "2 machines.", 1),
    envQ(),
    ...buildQs("Developers", 2, 4),
    nq("analysis", "Process analysis and set-up", "C$", 15_000, 0, 100_000_000, "A one-time cost for mapping the process and setting up the platform.", "C$15,000.", 1000),
    nq("training", "Training", "C$", 5000, 0, 100_000_000, "A one-time cost to train the people who work with the robots.", "C$5,000.", 500),
  ],
  plan(a) {
    const v = a.values, { rows, add } = rowsFor(a);
    const env = environmentsFor(a, v);
    const licence: Workload = { kind: "contract", id: pid(a, "licence"), label: asm("RPA platform licence"), amountCad: num(v, "licence"), cadence: "monthly" } as Workload;
    add("licence.amount", "RPA licence per month", num(v, "licence"), "C$", tgt("workloads", licence.id, "amountCad"));
    const delivery = [cost(a, "analysis", "Process analysis and set-up", "vendor", num(v, "analysis")), cost(a, "training", "Training", "training", num(v, "training"))];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    return {
      workloads: [licence], assumptions: rows, volume: { monthlyItems: num(v, "items"), oneTimeItems: 0, unit: "items" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change, { ...OPS_ROLE, hourlyRate: num(v, "opsRate") }],
        team: standardTeam(a, num(v, "devs")), deliveryCosts: delivery,
        resources: [resource(a, "bots", "Robot machines (Windows VM)", "vm", "d2s-v5-windows", { count: num(v, "bots") })],
        currentLines: [fteLine(a, add, "manual", "Manual processing", OPS_ROLE.id, num(v, "fte"), num(v, "fteHours"), reduce(num(v, "automatedPct"), true))],
        scorecard: [score(a, "speed", "Speed: time per item", "speed", "Minutes to process one item", "minutes", 12, 2, false), score(a, "employee", "Employee: satisfaction", "employee", "Staff satisfaction score", "points", 55, 70, true)],
        maintenance: { mode: "pctOfBuild", pctPerYear: 15 },
      }, env),
    };
  },
};

// ---------------------------------------------------------------- 3. lift and shift

const liftShift: PlanDef = {
  id: "liftshift", label: "Lift and shift: virtual machines to Azure", types: ["replatform"],
  description: "Move servers as they are to Azure virtual machines. Counts the VMs, disks and backup against the data-centre cost that stops when the old servers are switched off.",
  benefitHint: "The saving is in the Current state lines and depends on switching the old servers off, so no separate benefit is added.",
  benefit: () => ({ type: "none" }),
  questions: [
    nq("vms", "Servers moving", "servers", 20, 1, 5000, "How many servers move to Azure virtual machines.", "20 servers.", 1),
    cq("os", "Operating system", [["windows", "Windows Server"], ["linux", "Linux"]], "windows", "The operating system of the servers. It sets the VM price.", "Windows Server for an application tier."),
    cq("size", "Server size", [["d2s-v5", "2 vCPU, 8 GB (D2s v5)"], ["d4s-v5", "4 vCPU, 16 GB (D4s v5)"], ["d8s-v5", "8 vCPU, 32 GB (D8s v5)"]], "d4s-v5", "The VM size that fits a typical server. The price comes from the catalogue.", "4 vCPU for a mid-sized application server."),
    tq("ahb", "Bring Windows licences (Azure Hybrid Benefit)", false, "When on, Windows servers use the Hybrid Benefit price because you already own the licences. Off prices the licence in the hourly rate.", "On if Software Assurance covers the servers."),
    nq("hostingUnit", "Hardware and hosting per server", "C$ per month", 450, 0, 1_000_000, "What one server costs today in hardware, power, space and network share.", "C$450.", 10),
    nq("contract", "Hardware maintenance contract", "C$ per month", 6000, 0, 10_000_000, "The vendor contract for the old hardware, which ends only when the data centre is exited.", "C$6,000.", 100),
    decomQ("exit", "Will the old servers be switched off?", "The hosting and contract costs stop only if the old servers are decommissioned."),
    nq("dualMonths", "Months old and new run together", "months", 3, 0, 24, "Months after go-live before the old servers are switched off. Both are paid for until then.", "3 months.", 1),
    nq("opsFte", "Server administrators today", "FTE", 1.5, 0, 1000, "Full-time equivalents spent on server care today.", "1.5 FTE.", 0.5),
    nq("opsCut", "Administration that goes away", "%", 30, 0, 100, "The share of that effort that no longer applies on Azure (patching hardware, racking, backups by hand).", "30.", 5),
    nq("opsRate", "Hourly cost of that work", "C$ per hour", OPS_ROLE.hourlyRate, 0, 1000, "Loaded hourly cost of those people.", "C$45.", 1),
    envQ(),
    ...buildQs("Infrastructure engineers", 2, 5),
    nq("migrationPerServer", "Migration cost per server", "C$", 600, 0, 1_000_000, "Tooling, partner time and cutover for one server.", "C$600.", 50),
    nq("training", "Training", "C$", 5000, 0, 100_000_000, "A one-time cost to train the operations team on Azure.", "C$5,000.", 500),
  ],
  plan(a) {
    const v = a.values, B = a.dev.buildMonths, { rows, add } = rowsFor(a);
    const env = environmentsFor(a, v);
    const vms = num(v, "vms"), decom = str(v, "exit") === "yes", exitMonth = B + 1 + num(v, "dualMonths");
    const vm = resource(a, "vms", `Virtual machines (${str(v, "size")}, ${str(v, "os")})`, "vm", `${str(v, "size")}-${str(v, "os")}`, { count: vms }, { ahb: bool(v, "ahb") && str(v, "os") === "windows" });
    add("vms.count", "Servers moving", vms, "servers", tgt("resources", vm.id, "inputs", "count"));
    const delivery = [cost(a, "migration", "Migration tooling and cutover", "dataMigration", Math.round(num(v, "migrationPerServer") * vms)), cost(a, "training", "Training", "training", num(v, "training"))];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    const hostingId = "hosting";
    return {
      workloads: [], assumptions: rows, volume: { monthlyItems: 0, oneTimeItems: 0, unit: "servers" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change, { ...OPS_ROLE, hourlyRate: num(v, "opsRate") }],
        team: standardTeam(a, num(v, "devs"), { devRole: ROLE.devops, change: 0.25 }),
        deliveryCosts: delivery,
        resources: [
          vm,
          resource(a, "disks", "OS disks (Premium SSD P10)", "disk-premium-ssd", "p10", { disks: vms }),
          resource(a, "backup", "Backup (Azure VM)", "backup-instance", "azure-vm", { instances: vms }),
        ],
        currentLines: [
          monthlyLine(a, add, hostingId, "Hardware, power and hosting", "infrastructure", Math.round(vms * num(v, "hostingUnit")), retireAt(exitMonth), decommission("Old servers switched off", decom)),
          monthlyLine(a, add, "maintenance", "Hardware maintenance contract", "contract", num(v, "contract"), retireAt(exitMonth), decommission("Old servers switched off", decom)),
          fteLine(a, add, "admin", "Server administration", OPS_ROLE.id, num(v, "opsFte"), 140, reduce(num(v, "opsCut"), false)),
        ],
        scorecard: [score(a, "agility", "Agility: time to provision", "agility", "Days to provision a server", "days", 30, 1, false), score(a, "compliance", "Resilience: outages", "compliance", "Unplanned outages a year", "outages", 6, 2, false)],
      }, env),
    };
  },
};

// ---------------------------------------------------------------- 4. replatform to PaaS

const paas: PlanDef = {
  id: "paas", label: "Replatform to PaaS (App Service, Azure SQL, PostgreSQL)", types: ["replatform"],
  description: "Move applications and databases from servers you run to managed Azure services. Counts the plan and database against server, database licence and patching costs that stop.",
  benefitHint: "The saving is in the Current state lines and depends on switching the old hosting off, so no separate benefit is added.",
  benefit: () => ({ type: "none" }),
  questions: [
    nq("instances", "App Service plan instances", "instances", 3, 1, 100, "Instances of the managed web plan (Premium v3 P1, Linux) that replace the application servers. The price comes from the catalogue.", "3 instances.", 1),
    cq("db", "Database service", [["sql", "Azure SQL Database"], ["postgres", "Azure Database for PostgreSQL"]], "sql", "The managed database that replaces the database servers.", "Azure SQL Database for a SQL Server estate."),
    nq("vcores", "Database vCores", "vCores", 4, 1, 128, "vCores for the managed database. The price comes from the catalogue.", "4 vCores.", 1),
    nq("storage", "Database storage", "GB", 256, 1, 100_000, "Storage for the managed database.", "256 GB.", 32),
    nq("serverHosting", "Servers and hosting today", "C$ per month", 3500, 0, 10_000_000, "What the application and database servers cost today in hardware, hosting and power.", "C$3,500.", 100),
    nq("dbLicence", "Database licences today", "C$ per month", 2800, 0, 10_000_000, "Monthly cost of the database licences and support that the managed service includes.", "C$2,800.", 100),
    decomQ("exit", "Will the old servers be switched off?", "The hosting and licence costs stop only if the old servers are decommissioned."),
    nq("dualMonths", "Months old and new run together", "months", 3, 0, 24, "Months after go-live before the old servers are switched off.", "3 months.", 1),
    nq("patchFte", "People patching and operating today", "FTE", 1, 0, 1000, "Full-time equivalents spent on patching, backups and upkeep today.", "1 FTE.", 0.5),
    nq("patchCut", "Upkeep that the platform takes over", "%", 60, 0, 100, "The share of that effort the managed service removes.", "60.", 5),
    nq("opsRate", "Hourly cost of that work", "C$ per hour", OPS_ROLE.hourlyRate, 0, 1000, "Loaded hourly cost of those people.", "C$45.", 1),
    envQ(),
    ...buildQs("Developers", 3, 6),
    nq("dataMigration", "Data migration", "C$", 20_000, 0, 100_000_000, "A one-time cost for moving the data and rehearsing the cutover.", "C$20,000.", 1000),
    nq("training", "Training", "C$", 5000, 0, 100_000_000, "A one-time cost to train the team on the managed services.", "C$5,000.", 500),
  ],
  plan(a) {
    const v = a.values, B = a.dev.buildMonths, { rows, add } = rowsFor(a);
    const env = environmentsFor(a, v);
    const decom = str(v, "exit") === "yes", exitMonth = B + 1 + num(v, "dualMonths");
    const db = str(v, "db") === "postgres"
      ? resource(a, "db", "Database (Azure PostgreSQL flexible server)", "postgres-flexible", "gp-ddsv5", { vcores: num(v, "vcores"), storageGB: num(v, "storage") })
      : resource(a, "db", "Database (Azure SQL Database)", "sql-db-vcore", "gp-gen5", { vcores: num(v, "vcores"), storageGB: num(v, "storage") });
    const app = resource(a, "app", "Web apps (App Service plan)", ASP.typeId, ASP.skuId, { instances: num(v, "instances") });
    add("app.instances", "App Service plan instances", num(v, "instances"), "instances", tgt("resources", app.id, "inputs", "instances"));
    add("db.vcores", "Database vCores", num(v, "vcores"), "vCores", tgt("resources", db.id, "inputs", "vcores"));
    const delivery = [cost(a, "data", "Data migration", "dataMigration", num(v, "dataMigration")), cost(a, "training", "Training", "training", num(v, "training"))];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    return {
      workloads: [], assumptions: rows, volume: { monthlyItems: 0, oneTimeItems: 0, unit: "items" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change, { ...OPS_ROLE, hourlyRate: num(v, "opsRate") }],
        team: standardTeam(a, num(v, "devs")), deliveryCosts: delivery, resources: [app, db],
        currentLines: [
          monthlyLine(a, add, "servers", "Servers and hosting", "infrastructure", num(v, "serverHosting"), retireAt(exitMonth), decommission("Old servers switched off", decom)),
          monthlyLine(a, add, "dblicence", "Database licences and support", "licence", num(v, "dbLicence"), retireAt(exitMonth), decommission("Old database servers switched off", decom)),
          fteLine(a, add, "patching", "Patching and upkeep", OPS_ROLE.id, num(v, "patchFte"), 140, reduce(num(v, "patchCut"), false)),
        ],
        scorecard: [score(a, "agility", "Agility: release frequency", "agility", "Releases a month", "releases", 1, 8, true), score(a, "speed", "Resilience: time to recover", "speed", "Hours to restore after a failure", "hours", 8, 1, false)],
        maintenance: { mode: "pctOfBuild", pctPerYear: 10 },
      }, env),
    };
  },
};

// ---------------------------------------------------------------- 5. replace with SaaS

const saas: PlanDef = {
  id: "saas", label: "Replace with SaaS", types: ["saas"],
  description: "Retire a system and buy a hosted product. Counts seats, support and implementation against the licences, hosting and support of the system that is switched off, including the months both run.",
  benefitHint: "The saving is in the Current state lines and depends on switching the old system off, so no separate benefit is added.",
  benefit: () => ({ type: "none" }),
  questions: [
    nq("seats", "Seats", "users", 250, 1, 1_000_000, "People who will have a seat in the new product.", "250 users.", 10),
    nq("seatPrice", "Price per seat", "C$ per month", 45, 0, 100_000, "The vendor's price for one seat for one month. Use your quote; the catalogue has no price for an unnamed product.", "C$45.", 1),
    tq("seatsRamp", "Seats grow as people move over", false, "When on, the seat count follows the adoption ramp instead of every seat being billed from go-live. Leave it off to be cautious.", "On if teams move over in waves."),
    nq("support", "Premium support", "C$ per year", 12_000, 0, 100_000_000, "A yearly support or success plan, billed as one twelfth a month.", "C$12,000 a year.", 500),
    nq("escalation", "Yearly price rise", "%", 3, 0, 100, "How much the seat and support price rises each year.", "3.", 1),
    nq("implementation", "Vendor implementation", "C$", 60_000, 0, 100_000_000, "A one-time fee for set-up and configuration by the vendor or a partner.", "C$60,000.", 1000),
    nq("dataMigration", "Data migration", "C$", 15_000, 0, 100_000_000, "A one-time cost for cleansing and loading data from the old system.", "C$15,000.", 1000),
    nq("training", "Training and communications", "C$", 10_000, 0, 100_000_000, "A one-time cost to train people and announce the change.", "C$10,000.", 500),
    nq("oldLicence", "Old system licences", "C$ per month", 9000, 0, 10_000_000, "What the system you are replacing costs in licences today.", "C$9,000.", 100),
    nq("oldHosting", "Old system hosting", "C$ per month", 4000, 0, 10_000_000, "Servers and hosting of the old system.", "C$4,000.", 100),
    nq("oldSupport", "Old system maintenance contract", "C$ per month", 2500, 0, 10_000_000, "The vendor maintenance contract of the old system.", "C$2,500.", 100),
    decomQ("exit", "Will the old system be switched off?", "The licence, hosting and maintenance costs stop only if the old system is decommissioned."),
    nq("dualMonths", "Months old and new run together", "months", 3, 0, 24, "Months after go-live before the old system is switched off. Both are paid for until then.", "3 months.", 1),
    nq("supportFte", "People supporting the old system", "FTE", 1, 0, 1000, "Full-time equivalents who look after the old system today.", "1 FTE.", 0.5),
    nq("supportCut", "Support work that goes away", "%", 50, 0, 100, "The share of that effort the vendor now covers.", "50.", 5),
    nq("opsRate", "Hourly cost of that work", "C$ per hour", OPS_ROLE.hourlyRate, 0, 1000, "Loaded hourly cost of those people.", "C$45.", 1),
    ...buildQs("Integration developers", 1, 6),
  ],
  plan(a) {
    const v = a.values, B = a.dev.buildMonths, { rows, add } = rowsFor(a);
    const decom = str(v, "exit") === "yes", exitMonth = B + 1 + num(v, "dualMonths");
    const esc = num(v, "escalation");
    const seats: Workload = { kind: "seats", id: pid(a, "seats"), label: asm("SaaS seats"), seats: num(v, "seats"), cadPerSeat: num(v, "seatPrice"), followsAdoption: bool(v, "seatsRamp") } as Workload;
    const support: Workload = { kind: "contract", id: pid(a, "support"), label: asm("Premium support"), amountCad: num(v, "support"), cadence: "yearly", ...(esc > 0 ? { escalationPct: esc } : {}) } as Workload;
    add("seats.count", "Seats", num(v, "seats"), "users", tgt("workloads", seats.id, "seats"));
    add("seats.price", "Price per seat per month", num(v, "seatPrice"), "C$", tgt("workloads", seats.id, "cadPerSeat"));
    add("support.amount", "Premium support per year", num(v, "support"), "C$", tgt("workloads", support.id, "amountCad"));
    const delivery = [
      cost(a, "implementation", "Vendor implementation", "vendor", num(v, "implementation")), cost(a, "data", "Data migration", "dataMigration", num(v, "dataMigration")),
      cost(a, "training", "Training and communications", "training", num(v, "training")),
    ];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    return {
      workloads: [seats, support], assumptions: rows, volume: { users: num(v, "seats"), monthlyItems: 0, oneTimeItems: 0, unit: "items" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change, { ...OPS_ROLE, hourlyRate: num(v, "opsRate") }],
        team: standardTeam(a, num(v, "devs"), { change: 1 }), deliveryCosts: delivery, resources: [],
        currentLines: [
          monthlyLine(a, add, "licence", "Old system licences", "licence", num(v, "oldLicence"), retireAt(exitMonth), decommission("Old system switched off", decom)),
          monthlyLine(a, add, "hosting", "Old system hosting", "infrastructure", num(v, "oldHosting"), retireAt(exitMonth), decommission("Old system switched off", decom)),
          monthlyLine(a, add, "maintenance", "Old system maintenance contract", "contract", num(v, "oldSupport"), retireAt(exitMonth), decommission("Old system switched off", decom)),
          fteLine(a, add, "support", "Support of the old system", OPS_ROLE.id, num(v, "supportFte"), 140, reduce(num(v, "supportCut"), false)),
        ],
        scorecard: [score(a, "employee", "Employee: satisfaction", "employee", "Staff satisfaction score", "points", 55, 70, true), score(a, "agility", "Agility: time to a new report", "agility", "Weeks to add a feature or report", "weeks", 8, 2, false)],
      }, { list: [], ids: [] }),
    };
  },
};

// ---------------------------------------------------------------- 6. new application for a new process

const newApp: PlanDef = {
  id: "newapp", label: "New application for a new process", types: ["newApp"],
  description: "Build an application for a process that has no system today. Counts the build, the hosting and the people time the new process saves compared with doing it by hand.",
  benefitHint: "Time saved per item handled, from your own minutes. Nothing is saved against a system that does not exist yet, so there are no Current state lines.",
  benefit: (v) => ({ type: "timeSaved", basis: "perItem", baselineMinutes: num(v, "minutes"), savedPct: num(v, "savedPct") }),
  questions: [
    nq("items", "Items handled a month", "items", 8000, 1, 100_000_000, "How many requests, cases or transactions the new process handles each month.", "8,000 requests.", 100),
    nq("minutes", "Minutes per item by hand", "minutes", 10, 0.1, 100_000, "How long one item takes today with spreadsheets, email or paper.", "10 minutes.", 1),
    nq("savedPct", "Share of that time saved", "%", 50, 1, 100, "The part of that time the application saves.", "50.", 5),
    nq("instances", "App Service plan instances", "instances", 2, 1, 100, "Instances of the web plan (Premium v3 P1, Linux). The price comes from the catalogue.", "2 instances.", 1),
    nq("vcores", "Database vCores", "vCores", 4, 1, 128, "vCores for the Azure SQL Database. The price comes from the catalogue.", "4 vCores.", 1),
    nq("storage", "Database storage", "GB", 128, 1, 100_000, "Storage for the database.", "128 GB.", 32),
    nq("telemetry", "Monitoring data", "GB per month", 20, 0, 100_000, "Application Insights data ingested each month. The price comes from the catalogue.", "20 GB.", 5),
    envQ(),
    ...buildQs("Developers", 4, 9),
    nq("training", "Training", "C$", 10_000, 0, 100_000_000, "A one-time cost to train the people who will use the application.", "C$10,000.", 500),
    nq("comms", "Communications", "C$", 3000, 0, 100_000_000, "A one-time cost for announcements and launch material.", "C$3,000.", 500),
  ],
  plan(a) {
    const v = a.values, { rows, add } = rowsFor(a);
    const env = environmentsFor(a, v);
    const app = resource(a, "app", "Application (App Service plan)", ASP.typeId, ASP.skuId, { instances: num(v, "instances") });
    const db = resource(a, "db", "Database (Azure SQL)", "sql-db-vcore", "gp-gen5", { vcores: num(v, "vcores"), storageGB: num(v, "storage") });
    add("app.instances", "App Service plan instances", num(v, "instances"), "instances", tgt("resources", app.id, "inputs", "instances"));
    add("db.vcores", "Database vCores", num(v, "vcores"), "vCores", tgt("resources", db.id, "inputs", "vcores"));
    const delivery = [cost(a, "training", "Training", "training", num(v, "training")), cost(a, "comms", "Communications", "comms", num(v, "comms"))];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    return {
      workloads: [], assumptions: rows, volume: { monthlyItems: num(v, "items"), oneTimeItems: 0, unit: "items" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change],
        team: standardTeam(a, num(v, "devs")), deliveryCosts: delivery,
        resources: [app, db, resource(a, "insights", "Monitoring (Application Insights)", "application-insights", "workspace-based", { gb: num(v, "telemetry"), testsK: 0 })],
        currentLines: [],
        scorecard: [score(a, "customer", "Customer: satisfaction", "customer", "Customer satisfaction score", "points", 60, 75, true), score(a, "speed", "Speed: time to complete", "speed", "Days to complete a request", "days", 5, 2, false)],
        maintenance: { mode: "pctOfBuild", pctPerYear: 20 },
      }, env),
    };
  },
};

// ---------------------------------------------------------------- 7. enhancement to an existing application

const enhance: PlanDef = {
  id: "enhance", label: "Enhancement to an existing application", types: ["enhancement"],
  description: "Add a capability to a system that stays in place. Counts the build and the extra capacity against the manual workaround and the time users save.",
  benefitHint: "Time saved per user per week, from your own minutes. The workaround effort is in the Current state lines; do not count the same time twice.",
  benefit: (v) => ({ type: "timeSaved", basis: "perUser", users: num(v, "users"), baselineMinutes: num(v, "minutes"), savedPct: num(v, "savedPct") }),
  questions: [
    nq("users", "Users of the new capability", "users", 500, 1, 10_000_000, "People who will use what you add.", "500 users.", 10),
    nq("minutes", "Minutes per user per week on this task", "minutes", 60, 1, 100_000, "How long the task takes each person each week today.", "60 minutes.", 5),
    nq("savedPct", "Share of that time saved", "%", 20, 1, 100, "The part of that time the enhancement saves.", "20.", 5),
    nq("workaroundFte", "People on the manual workaround", "FTE", 1, 0, 1000, "Full-time equivalents spent on the workaround the enhancement replaces.", "1 FTE.", 0.5),
    nq("workaroundCut", "Workaround that goes away", "%", 60, 0, 100, "The share of the workaround that stops once the enhancement is used.", "60.", 5),
    nq("opsRate", "Hourly cost of that work", "C$ per hour", OPS_ROLE.hourlyRate, 0, 1000, "Loaded hourly cost of those people.", "C$45.", 1),
    nq("instances", "Extra App Service instances", "instances", 1, 0, 50, "Capacity added to the existing web plan (Premium v3 P1, Linux). The price comes from the catalogue.", "1 instance.", 1),
    nq("telemetry", "Extra monitoring data", "GB per month", 10, 0, 100_000, "Application Insights data added each month. The price comes from the catalogue.", "10 GB.", 5),
    envQ(),
    ...buildQs("Developers", 2, 4),
    nq("training", "Training", "C$", 4000, 0, 100_000_000, "A one-time cost to train users on the new capability.", "C$4,000.", 500),
  ],
  plan(a) {
    const v = a.values, { rows, add } = rowsFor(a);
    const env = environmentsFor(a, v);
    const app = resource(a, "app", "Extra capacity (App Service plan)", ASP.typeId, ASP.skuId, { instances: num(v, "instances") });
    add("app.instances", "Extra App Service instances", num(v, "instances"), "instances", tgt("resources", app.id, "inputs", "instances"));
    const delivery = [cost(a, "training", "Training", "training", num(v, "training"))];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    return {
      workloads: [], assumptions: rows, volume: { users: num(v, "users"), monthlyItems: 0, oneTimeItems: 0, unit: "items" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change, { ...OPS_ROLE, hourlyRate: num(v, "opsRate") }],
        team: standardTeam(a, num(v, "devs")), deliveryCosts: delivery,
        resources: [app, resource(a, "insights", "Monitoring (Application Insights)", "application-insights", "workspace-based", { gb: num(v, "telemetry"), testsK: 0 })],
        currentLines: [fteLine(a, add, "workaround", "Manual workaround", OPS_ROLE.id, num(v, "workaroundFte"), 140, reduce(num(v, "workaroundCut"), true))],
        scorecard: [score(a, "employee", "Employee: satisfaction", "employee", "Staff satisfaction score", "points", 55, 68, true), score(a, "speed", "Speed: time to complete", "speed", "Minutes to complete the task", "minutes", 20, 12, false)],
        maintenance: { mode: "pctOfBuild", pctPerYear: 15 },
      }, env),
    };
  },
};

// ---------------------------------------------------------------- 8. data platform

const dataPlatform: PlanDef = {
  id: "dataplatform", label: "Data platform (ingest, warehouse or lakehouse, reporting)", types: ["newApp", "replatform"],
  description: "Bring data from source systems into one platform for reporting. Counts capacity, storage, pipelines and report licences against manual reporting effort and the old BI tools.",
  benefitHint: "Time saved per report user per week, from your own minutes. Manual reporting effort is in the Current state lines; do not count the same time twice.",
  benefit: (v) => ({ type: "timeSaved", basis: "perUser", users: num(v, "reportUsers"), baselineMinutes: num(v, "minutes"), savedPct: num(v, "savedPct") }),
  questions: [
    nq("sources", "Source systems", "systems", 8, 1, 1000, "How many source systems feed the platform. It only sizes the pipeline runs below.", "8 systems.", 1),
    nq("dataTb", "Data stored", "TB", 5, 0, 100_000, "Terabytes held in the lakehouse or warehouse.", "5 TB.", 1),
    cq("capacity", "Fabric capacity", [["f4", "F4"], ["f8", "F8"], ["f16", "F16"], ["f32", "F32"]], "f8", "The Microsoft Fabric capacity that runs the warehouse and reports. The price comes from the catalogue.", "F8 for a mid-sized team."),
    nq("runs", "Pipeline runs a month", "thousand runs", 20, 0, 1_000_000, "Data Factory pipeline runs each month, in thousands.", "20 thousand.", 1),
    nq("diu", "Data movement", "DIU hours a month", 200, 0, 10_000_000, "Data-movement hours each month.", "200.", 10),
    nq("reportUsers", "Report users", "users", 150, 1, 1_000_000, "People who open reports. Each takes a Power BI Pro licence.", "150 users.", 10),
    nq("minutes", "Minutes per report user per week on finding data", "minutes", 240, 1, 100_000, "How long each report user spends a week finding, cleaning and combining data today.", "240 minutes.", 10),
    nq("savedPct", "Share of that time saved", "%", 25, 1, 100, "The part of that time the platform saves.", "25.", 5),
    nq("reportFte", "People building reports by hand", "FTE", 3, 0, 1000, "Full-time equivalents who assemble reports from spreadsheets today.", "3 FTE.", 0.5),
    nq("reportCut", "Manual reporting that goes away", "%", 50, 0, 100, "The share of that effort that the platform automates. Do not count the same people in the time-saved benefit.", "50.", 5),
    nq("opsRate", "Hourly cost of that work", "C$ per hour", OPS_ROLE.hourlyRate, 0, 1000, "Loaded hourly cost of those people.", "C$45.", 1),
    nq("oldBi", "Old BI tools", "C$ per month", 3000, 0, 10_000_000, "Licences of the reporting tools the platform replaces.", "C$3,000.", 100),
    decomQ("exit", "Will the old BI tools be switched off?", "The old licences stop costing money only if you cancel them."),
    envQ(),
    ...buildQs("Data engineers", 3, 8),
    nq("dataMigration", "Historic data load", "C$", 20_000, 0, 100_000_000, "A one-time cost for loading and checking historic data.", "C$20,000.", 1000),
    nq("training", "Training", "C$", 8000, 0, 100_000_000, "A one-time cost to train report builders and users.", "C$8,000.", 500),
  ],
  plan(a) {
    const v = a.values, B = a.dev.buildMonths, { rows, add } = rowsFor(a);
    const env = environmentsFor(a, v);
    const cap = resource(a, "fabric", `Fabric capacity (${str(v, "capacity").toUpperCase()})`, "fabric-capacity", str(v, "capacity"), { capacities: 1 });
    const lake = resource(a, "lake", "Lakehouse storage (OneLake)", "onelake-storage", "hot", { gb: Math.round(num(v, "dataTb") * 1024) });
    const adf = resource(a, "pipelines", "Pipelines (Data Factory)", "data-factory", "azure-ir", { runsK: num(v, "runs"), diuHours: num(v, "diu"), activityHours: 0 });
    const pbi = resource(a, "reports", "Report licences (Power BI Pro)", "microsoft-seat", "power-bi-pro", { users: num(v, "reportUsers") });
    add("lake.gb", "Lakehouse storage", Math.round(num(v, "dataTb") * 1024), "GB", tgt("resources", lake.id, "inputs", "gb"));
    add("reports.users", "Power BI Pro licences", num(v, "reportUsers"), "users", tgt("resources", pbi.id, "inputs", "users"));
    const delivery = [cost(a, "data", "Historic data load", "dataMigration", num(v, "dataMigration")), cost(a, "training", "Training", "training", num(v, "training"))];
    delivery.forEach((d) => add(`${d.id.slice(a.featureId.length + 1)}.amount`, d.label, d.amountCad, "C$", tgt("deliveryCosts", d.id, "amountCad")));
    return {
      workloads: [], assumptions: rows, volume: { users: num(v, "reportUsers"), monthlyItems: 0, oneTimeItems: 0, unit: "items" },
      parts: base(a, v, {
        roles: [ROLE.pm, ROLE.ba, ROLE.dev, ROLE.qa, ROLE.devops, ROLE.change, ROLE.dataEngineer, { ...OPS_ROLE, hourlyRate: num(v, "opsRate") }],
        team: standardTeam(a, num(v, "devs"), { devRole: ROLE.dataEngineer }), deliveryCosts: delivery, resources: [cap, lake, adf, pbi],
        currentLines: [
          fteLine(a, add, "reporting", "Manual reporting", OPS_ROLE.id, num(v, "reportFte"), 140, reduce(num(v, "reportCut"), true)),
          monthlyLine(a, add, "oldbi", "Old BI tool licences", "licence", num(v, "oldBi"), retireAt(B + 1 + 3), decommission("Old BI tools cancelled", str(v, "exit") === "yes")),
        ],
        scorecard: [score(a, "speed", "Speed: month-end report", "speed", "Days to produce the month-end report", "days", 5, 1, false), score(a, "agility", "Agility: new report", "agility", "Days to deliver a new report", "days", 20, 5, false)],
        maintenance: { mode: "pctOfBuild", pctPerYear: 15 },
      }, env),
    };
  },
};

export const PLAN_DEFS: PlanDef[] = [cheques, rpa, liftShift, paas, saas, newApp, enhance, dataPlatform];
