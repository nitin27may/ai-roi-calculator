import type { PricingOption, ResourceType } from "@roi-calculator/catalog";
import { cad, line, type Line } from "./lines.js";
import type { PriceBook } from "./pricing.js";
import { HOURS_PER_MONTH } from "./ptu-size.js";
import type { Project, Resource } from "./project.js";


export interface ResourceOptions {
  /** Hours the resource runs in the month; defaults to 730. Environments (A6) set it from a schedule. */
  hours?: number;
  /** Multiplier for meters that scale with size; defaults to 1. */
  sizeFactor?: number;
}

const OPTION_LABEL: Record<PricingOption, string> = { payg: "pay-as-you-go", ri1: "1-year reserved", ri3: "3-year reserved", ahb: "Hybrid Benefit", devtest: "dev/test" };

/**
 * One production-month line per meter for each resource: quantity x unit price x hours / 730, fixed behaviour, stream `run`.
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
  } else if (r.ahb) {
    const ahb = type.options.includes("ahb") ? book.optionPrice(unitPriceId, "ahb") : undefined;
    if (ahb !== undefined) { option = "ahb"; price = ahb; }
    else note = String(unit.attrs?.["fallback.ahb"] ?? "no Hybrid Benefit price, pay-as-you-go used");
  }
  if (reserved && r.ahb && option === reserved) note = "Hybrid Benefit not added on top of a reserved price";

  // Reserved capacity bills the full month; pay-as-you-go and Hybrid Benefit hourly meters follow the hours.
  const hourFactor = meter.hourly && (option === "payg" || option === "ahb") ? hours / HOURS_PER_MONTH : 1;
  const quantity = (r.inputs[meter.quantity.input] ?? 0) * (meter.quantity.factor ?? 1);
  const unitPrice = price * hourFactor * size;
  const hoursPart = meter.hourly ? ` × ${hourFactor === 1 ? `${HOURS_PER_MONTH}/${HOURS_PER_MONTH}` : `${hours}/${HOURS_PER_MONTH}`} h` : "";
  const sizePart = size === 1 ? "" : ` × size ${size}`;
  const formula = `${quantity} × ${cad(price, 2)}${hoursPart}${sizePart} · ${OPTION_LABEL[option]}${note ? `; ${note}` : ""}`;
  if (note) book.alert(`resource:${r.id}:${meter.id}:${option}`, { kind: "resource", message: `${r.label}: ${note}` });
  return line({
    id: `resource:${r.id}:${meter.id}`,
    componentId: `resource:${r.id}`,
    label: multi ? `${r.label} · ${meter.label ?? meter.id}` : `${r.label} (${skuLabel})`,
    stream: "run", behaviour: "fixed", meter: unitPriceId,
    quantity, unit: unit.unit, unitPrice, formula,
  });
}
