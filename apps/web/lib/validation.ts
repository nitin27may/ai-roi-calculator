/** Human messages for refused input. Pure, so it can be tested without a browser. */

const num = (n: number) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 6 }).format(n);

export interface RangeSpec { min: number; max?: number; suffix?: string }

const bound = (n: number, suffix?: string) => (suffix === "%" ? `${num(n)}%` : suffix ? `${num(n)} ${suffix}` : num(n));

/** Explains why a typed number was not applied, or returns null when it is within range. `limit` is the field's own reason for its maximum. */
export function rangeMessage(v: number, { min, max, suffix }: RangeSpec, limit?: string): string | null {
  if (!Number.isFinite(v)) return null;
  const notApplied = `${num(v)}${suffix === "%" ? "%" : ""} was not applied.`;
  if (max !== undefined && v > max) {
    const why = limit ?? (suffix === "%" && max === 100 ? "this is a share of the total" : undefined);
    return `Max ${bound(max, suffix)}${why ? `: ${why}` : ""}. ${notApplied}`;
  }
  if (v < min) {
    const why = min === 0 ? "this cannot be negative" : undefined;
    return `Min ${bound(min, suffix)}${why ? `: ${why}` : ""}. ${notApplied}`;
  }
  return null;
}

/** Field names for schema paths, where a plain split of the path would read badly. */
const PATH_LABELS: Record<string, string> = {
  buildMonths: "Build months",
  horizonMonths: "Plan length",
  adoptionRampMonths: "Adoption ramp",
  contingencyPct: "Contingency",
  discountRatePct: "Discount rate",
  growthPctPerYear: "Growth per year",
  rateEscalationPctPerYear: "Rate escalation",
  adoptionPct: "Adoption",
  realisationPct: "Realisation",
  hourlyRate: "Hourly rate",
  cacheHit: "Cache hit",
  batchShare: "Batch share",
  hoursPerMonth: "Hours per month",
  fromMonth: "From month",
  toMonth: "To month",
};

const words = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** The name a person would use for the field a schema path points at: the last named segment. */
export function pathLabel(path: ReadonlyArray<string | number>): string {
  const named = [...path].reverse().find((p): p is string => typeof p === "string");
  if (!named) return "That value";
  return PATH_LABELS[named] ?? words(named);
}

export interface SchemaIssue { path: ReadonlyArray<string | number>; message: string; code?: string; minimum?: number | bigint; maximum?: number | bigint; expected?: unknown; received?: unknown; options?: unknown }

/** Describes a schema issue as a sentence a person can act on. Never shows the raw path or the schema's own wording. */
export function describeIssue(issue: SchemaIssue | undefined): string {
  if (!issue) return "The project would no longer be valid.";
  const label = pathLabel(issue.path);
  switch (issue.code) {
    case "too_small":
      return `${label} must be at least ${issue.minimum ?? "the minimum"}.`;
    case "too_big":
      return `${label} must be at most ${issue.maximum ?? "the maximum"}.`;
    case "invalid_type":
      return issue.received === "undefined" ? `${label} needs a value.` : `${label} needs ${issue.expected === "number" ? "a number" : issue.expected === "string" ? "text" : "a different kind of value"}.`;
    case "invalid_enum_value":
    case "invalid_literal":
    case "invalid_union":
      return `${label} is not one of the available choices.`;
    default:
      return `${label} is not valid. Check the value and try again.`;
  }
}

/** The message shown when an edit is refused. */
export const humanizeIssue = (issue: SchemaIssue | undefined): string => `That change was not applied. ${describeIssue(issue)}`;
