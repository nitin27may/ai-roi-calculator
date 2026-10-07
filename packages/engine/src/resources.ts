import type { PricingOption, ResourceType } from "@roi-calculator/catalog";
import { cad, line, type Line } from "./lines.js";
import type { PriceBook } from "./pricing.js";
import { HOURS_PER_MONTH } from "./ptu-size.js";
import type { Environment, Project, Resource } from "./project.js";

export interface ResourceOptions {
  /** Hours the resource runs in the month; defaults to 730. Environments (A6) set it from a schedule. */
  hours?: number;
  /** Multiplier for meters that scale with size; defaults to 1. */
  sizeFactor?: number;
  /**
   * The environment being costed (A6). Selects the resources whose `envIds` include it, sets the stream (`run` for
   * production, `env` otherwise), suffixes line ids and labels with the environment, and applies its pricing choice.
   */
  env?: Environment;
}

/** Hours a month an environment runs: hours x days, an explicit monthly figure, or 730. */
export function environmentHours(env: Environment): number {
  const s = env.schedule;
  return "hoursPerDay" in s ? s.hoursPerDay * s.daysPerMonth : s.hoursPerMonth;
}

/**
 * Whether an environment is billed in project month `m`. An absent `fromMonth`/`toMonth` is the edge of the default phase:
 * build months (1..buildMonths) for non-production, production months (buildMonths+1..horizon) for production.
 */
export function environmentBilled(env: Environment, m: number, buildMonths: number, horizonMonths: number): boolean {
  const from = env.fromMonth ?? (env.production ? buildMonths + 1 : 1);
  const to = env.toMonth ?? (env.production ? horizonMonths : buildMonths);
  return m >= from && m <= to;
}

/**
 * Resource lines for project month `m`. Without defined environments the resources run as one implicit production
 * environment at 730 hours, in production months only (A2 behaviour). With environments, each billed environment prices
 * the resources that exist in it.
 */
export function resourceMonthLines(p: Project, book: PriceBook, m: number): Line[] {
  if (!p.resources?.length) return [];
  const B = p.timeline.buildMonths;
  const envs = p.environments ?? [];
  if (envs.length === 0) return m > B ? resourceLines(p, book) : [];
  return envs.filter((e) => environmentBilled(e, m, B, p.timeline.horizonMonths)).flatMap((e) =>
    resourceLines(p, book, { env: e, hours: environmentHours(e), sizeFactor: e.sizeFactor }));
}

const OPTION_LABEL: Record<PricingOption, string> = { payg: "pay-as-you-go", ri1: "1-year reserved", ri3: "3-year reserved", ahb: "Hybrid Benefit", devtest: "dev/test" };

/**
 * One line per meter for each resource: quantity x unit price x hours / 730 x size factor, fixed behaviour, stream `run`
 * (stream `env` for a non-production environment). Cost per meter = quantity x option price x (hourly pay-as-you-go
 * meter ? hours / 730 : 1) x (meter scales with size ? size factor : 1).
 * A project with no resources returns no lines. A resource whose type or SKU is no longer in the catalogue is skipped
 * with a note instead of failing the whole ledger.
 *
 * Pricing option: a reserved term uses the reserved price when the type offers it and the unit has one, otherwise
 * pay-as-you-go with a note. Hybrid Benefit uses the `ahb` price when the type declares the option and the unit has one.
 * A reserved term wins over Hybrid Benefit (the reserved compute price is the one billed). Manual prices replace the
 * pay-as-you-go price only.
 */
export function resourceLines(p: Project, book: PriceBook, opts: ResourceOptions = {}): Line[] {
  const out: Line[] = [];
  for (const r of p.resources ?? []) {
    if (opts.env && r.envIds && !r.envIds.includes(opts.env.id)) continue;
    const type = book.catalog.resourceTypes.find((t) => t.id === r.typeId);
    const sku = type?.skus.find((s) => s.id === r.skuId);
    if (!type || !sku) {
      book.alert(`resource:${r.id}`, { kind: "resource", message: `${r.label}: "${r.typeId}" / "${r.skuId}" is not in the catalogue, so it is not costed` });
      continue;
    }
    for (const meter of type.meters) {
      const unitPriceId = sku.prices[meter.id];
      if (!unitPriceId) {
        book.alert(`resource:${r.id}:${meter.id}`, { kind: "resource", message: `${r.label}: SKU ${sku.label} has no price for ${meter.label ?? meter.id}` });
        continue;
      }
      out.push(meterLine(r, type, meter, unitPriceId, sku.label, type.meters.length > 1, book, opts));
    }
  }
  return out;
}

function meterLine(r: Resource, type: ResourceType, meter: ResourceType["meters"][number], unitPriceId: string, skuLabel: string, multi: boolean, book: PriceBook, opts: ResourceOptions): Line {
  const hours = opts.hours ?? HOURS_PER_MONTH;
  const size = meter.scalesWithSize ? (opts.sizeFactor ?? 1) : 1;
  const unit = book.unit(unitPriceId);
  const payg = book.unitPrice(unitPriceId);

  let option: PricingOption = "payg";
  let price = payg;
  let note = "";
  const reserved = r.term === "payg" ? undefined : r.term;
  if (reserved) {
    const ri = type.options.includes(reserved) ? book.optionPrice(unitPriceId, reserved) : undefined;
    if (ri !== undefined) { option = reserved; price = ri; }
    else note = `no ${OPTION_LABEL[reserved]} price, pay-as-you-go used`;
  } else if (opts.env?.pricing === "devtest") {
    const dt = type.options.includes("devtest") ? book.optionPrice(unitPriceId, "devtest") : undefined;
    if (dt !== undefined) { option = "devtest"; price = dt; }
    else note = String(unit.attrs?.["fallback.devtest"] ?? "no dev/test price, pay-as-you-go used");
  } else if (r.ahb) {
    const ahb = type.options.includes("ahb") ? book.optionPrice(unitPriceId, "ahb") : undefined;
    if (ahb !== undefined) { option = "ahb"; price = ahb; }
    else note = String(unit.attrs?.["fallback.ahb"] ?? "no Hybrid Benefit price, pay-as-you-go used");
  }
  if (reserved && r.ahb && option === reserved) note = "Hybrid Benefit not added on top of a reserved price";

  // Reserved capacity bills the full month; pay-as-you-go and Hybrid Benefit hourly meters follow the hours.
  const hourFactor = meter.hourly && (option === "payg" || option === "ahb" || option === "devtest") ? hours / HOURS_PER_MONTH : 1;
  if (option !== "payg" && option !== "ahb" && option !== "devtest" && hours !== HOURS_PER_MONTH && meter.hourly) {
    const n = `${OPTION_LABEL[option]} bills all ${HOURS_PER_MONTH} hours, so the ${opts.env?.label ?? "environment"} schedule does not lower it`;
    note = note ? `${note}; ${n}` : n;
  }
  const quantity = (r.inputs[meter.quantity.input] ?? 0) * (meter.quantity.factor ?? 1);
  const unitPrice = price * hourFactor * size;
  const envPart = opts.env ? ` · ${opts.env.label}` : "";
  const hoursPart = meter.hourly ? ` × ${hourFactor === 1 ? `${HOURS_PER_MONTH}/${HOURS_PER_MONTH}` : `${hours}/${HOURS_PER_MONTH}`} h` : "";
  const sizePart = size === 1 ? "" : ` × size ${size}`;
  const formula = `${quantity} × ${cad(price, 2)}${hoursPart}${sizePart} · ${OPTION_LABEL[option]}${note ? `; ${note}` : ""}`;
  if (note) book.alert(`resource:${r.id}:${meter.id}:${option}${opts.env ? `:${opts.env.id}` : ""}`, { kind: "resource", message: `${r.label}${envPart}: ${note}` });
  return line({
    id: `resource:${r.id}:${meter.id}${opts.env ? `:${opts.env.id}` : ""}`,
    componentId: `resource:${r.id}`,
    label: `${multi ? `${r.label} · ${meter.label ?? meter.id}` : `${r.label} (${skuLabel})`}${envPart}`,
    stream: opts.env && !opts.env.production ? "env" : "run", behaviour: "fixed", meter: unitPriceId,
    quantity, unit: unit.unit, unitPrice, formula,
  });
}
