import type { Catalog, ChatModel, Deployment, TokenPrices, UnitPrice } from "@studio/catalog";
import { heuristics } from "@studio/catalog";

/** Global Standard, Canada Regional Standard or US Data Zone Standard. */
export type AzureDeployment = Deployment;

export const DEPLOYMENT_LABEL: Record<AzureDeployment, string> = { global: "Global Standard", regional: "Canada Regional Standard", dataZone: "US Data Zone Standard" };
export const DEPLOYMENTS: AzureDeployment[] = ["global", "regional", "dataZone"];

type Availability = { prices?: Partial<Record<AzureDeployment, unknown>>; deployments?: Partial<Record<AzureDeployment, unknown>>; per1M?: number; availableIn?: AzureDeployment[]; platform?: string };

/**
 * Whether a catalogue entry can be deployed under `d`: its `availableIn` list when it has one, else whether it
 * has a price for `d`. Snowflake entries and entries with no availability data always can.
 */
export function availableIn(e: Availability, d: AzureDeployment): boolean {
  if (e.platform === "snowflake") return true;
  if (e.availableIn) return e.availableIn.includes(d);
  if (e.prices) return e.prices[d] !== undefined;
  if (e.deployments) return d === "global" ? e.per1M !== undefined : e.deployments[d] !== undefined;
  return true;
}

export interface PricingSettings {
  azureDeployment: AzureDeployment;
  snowflake: {
    /** Global routing (ANY_REGION / *_GLOBAL) or regional (AZURE_US / AZURE_EU / DISABLED). */
    routing: "global" | "regional";
    edition: "standard" | "enterprise" | "businessCritical" | "vps";
    /** Override CAD per AI credit (e.g. contract rate). */
    aiCreditCad?: number;
    platformCreditCad?: number;
  };
}

export interface TokenUsage {
  /** Uncached input tokens. */
  input: number;
  cachedInput?: number;
  output: number;
  cacheWrite?: number;
}

export interface PriceNote {
  kind: "promo-ended" | "deprecated" | "retired" | "unverified" | "long-context" | "routing" | "unavailable";
  message: string;
}

/**
 * Looks up CAD prices from the catalogue. All lookups are date-aware so a promo or a
 * retirement that falls inside the project timeline is priced and flagged correctly.
 */
export class PriceBook {
  /** `notes` is shared with books made by `withDeployment`, so one project collects every alert. */
  constructor(readonly catalog: Catalog, readonly settings: PricingSettings, readonly notes = new Map<string, PriceNote>()) {}

  /** The same book priced for another deployment (a workload's own choice). */
  withDeployment(d: AzureDeployment | undefined): PriceBook {
    return !d || d === this.settings.azureDeployment ? this : new PriceBook(this.catalog, { ...this.settings, azureDeployment: d }, this.notes);
  }

  private note(key: string, n: PriceNote) {
    if (!this.notes.has(key)) this.notes.set(key, n);
  }

  chatModel(id: string): ChatModel {
    const m = this.catalog.chatModels.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown chat model "${id}"`);
    return m;
  }

  realtimeModel(id: string) {
    const m = this.catalog.realtimeModels.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown realtime model "${id}"`);
    this.checkAvailable(m);
    return m;
  }

  aiCreditCad(): number {
    const s = this.settings.snowflake;
    return s.aiCreditCad ?? (s.routing === "global" ? this.catalog.snowflake.aiCreditGlobal : this.catalog.snowflake.aiCreditRegional);
  }

  platformCreditCad(): number {
    const s = this.settings.snowflake;
    return s.platformCreditCad ?? this.catalog.snowflake.platformCredit[s.edition] ?? this.catalog.snowflake.platformCredit.enterprise!;
  }

  /** CAD per 1M tokens for a model on a given date (ISO yyyy-mm-dd). */
  tokenPrices(id: string, date: string, requestInputTokens = 0): TokenPrices {
    const m = this.chatModel(id);
    this.lifecycleNote(m.id, m.label, m.lifecycle, date);
    if (m.confidence === "unverified") this.note(`unverified:${m.id}`, { kind: "unverified", message: `${m.label} price is unverified` });
    if (m.platform === "snowflake") {
      const c = m.credits!;
      const cad = this.aiCreditCad();
      if (m.snowflakeRouting === "any-region" && this.settings.snowflake.routing === "regional") {
        this.note(`routing:${m.id}`, { kind: "routing", message: `${m.label} is not served under AZURE_US/AZURE_EU; it needs ANY_REGION or AWS routing` });
      }
      return { input: c.input * cad, cachedInput: (c.cachedInput ?? c.input) * cad, output: c.output * cad };
    }
    const p = m.prices!;
    let base: TokenPrices = p.global;
    if (m.promo && date > m.promo.until && p.globalList) {
      base = p.globalList;
      this.note(`promo:${m.id}`, { kind: "promo-ended", message: `${m.label} promo ends ${m.promo.until}; later months use list price` });
    }
    if (m.longContext && requestInputTokens > m.longContext.threshold) {
      base = m.longContext.prices;
      this.note(`lc:${m.id}`, { kind: "long-context", message: `${m.label} requests above ${m.longContext.threshold.toLocaleString()} input tokens bill at the long-context rate` });
    }
    // Long-context and promo prices are published for Global; scale them by the deployment's ratio to Global.
    const d = this.settings.azureDeployment;
    const offered = availableIn(m, d);
    const target = offered && p[d] ? p[d] : this.unavailable(m.id, m.label, d, p[d] ? d : p.dataZone ? "dataZone" : null);
    if (target && base === p.global) return target;
    const factor = target && p.global.input > 0 ? target.input / p.global.input : 1.1;
    return scale(base, factor);
  }

  /** Records that an entry is not offered under the project's deployment and returns the fallback tier's prices. */
  private unavailable(id: string, label: string, d: AzureDeployment, fallback: AzureDeployment | null): TokenPrices | undefined {
    const m = this.catalog.chatModels.find((x) => x.id === id);
    this.note(`unavailable:${d}:${id}`, {
      kind: "unavailable",
      message: `${label} is not offered as ${DEPLOYMENT_LABEL[d]}; priced as ${fallback ? DEPLOYMENT_LABEL[fallback] : "Global × 1.1"} until you pick another model`,
    });
    return fallback ? m?.prices?.[fallback] : undefined;
  }

  /** Notes an engine or model that cannot run under the project's deployment (prices are the same either way). */
  private checkAvailable(e: Availability & { id: string; label: string }) {
    const d = this.settings.azureDeployment;
    if (!availableIn(e, d)) this.note(`unavailable:${d}:${e.id}`, { kind: "unavailable", message: `${e.label} is not offered as ${DEPLOYMENT_LABEL[d]}` });
  }

  /** CAD for a token usage on a model. */
  chatCost(id: string, u: TokenUsage, date: string, requestInputTokens = 0): number {
    const p = this.tokenPrices(id, date, requestInputTokens);
    const write = u.cacheWrite ? u.cacheWrite * (p.cacheWrite ?? p.input) : 0;
    return (u.input * p.input + (u.cachedInput ?? 0) * p.cachedInput + u.output * p.output + write) / 1e6;
  }

  tokenizerMultiplier(id: string): number {
    return heuristics.tokens.tokenizerMultiplier[this.chatModel(id).tokenizer];
  }

  embeddingPer1M(id: string): number {
    const e = this.catalog.embeddingModels.find((x) => x.id === id);
    if (!e) throw new Error(`Unknown embedding model "${id}"`);
    if (e.platform === "snowflake") return (e.credits ?? 0) * this.aiCreditCad();
    const d = this.settings.azureDeployment;
    const price = d === "global" ? e.per1M : e.deployments?.[d];
    this.checkAvailable(e);
    if (price !== undefined) return price;
    return e.deployments?.dataZone ?? e.per1M ?? 0;
  }

  embeddingDims(id: string): number {
    const e = this.catalog.embeddingModels.find((x) => x.id === id);
    if (!e) throw new Error(`Unknown embedding model "${id}"`);
    return e.dims;
  }

  /** CAD per audio hour for a speech engine on a date. */
  speechPerHour(id: string, date: string, diarize = false): number {
    const e = this.catalog.speechEngines.find((x) => x.id === id);
    if (!e) throw new Error(`Unknown speech engine "${id}"`);
    this.lifecycleNote(e.id, e.label, e.lifecycle, date);
    this.checkAvailable(e);
    let rate: number;
    if (e.perAudioHour !== undefined) rate = e.perAudioHour;
    else if (e.tokens) {
      const t = e.tokens;
      const audio = t.audioTokensPerSecond * 3600;
      const text = heuristics.speech.wordsPerMinute * 60 * heuristics.tokens.perWord;
      rate = (audio * t.audioInputPer1M + text * t.textOutputPer1M) / 1e6;
    } else rate = (e.creditsPerHour ?? 0) * this.aiCreditCad();
    if (e.promo && date > e.promo.until) {
      rate *= e.afterPromoMultiplier ?? 1;
      this.note(`promo:${e.id}`, { kind: "promo-ended", message: `${e.label} promo ends ${e.promo.until}${e.afterPromoMultiplier ? `; later months assume ${e.afterPromoMultiplier}×` : ""}` });
    }
    if (diarize && e.diarization === "add-on") rate += e.diarizationAddOnPerHour ?? 0;
    return rate;
  }

  unit(id: string): UnitPrice {
    const u = this.catalog.unitPrices.find((x) => x.id === id);
    if (!u) throw new Error(`Unknown unit price "${id}"`);
    return u;
  }

  /** CAD per one catalogue unit (e.g. per 1K pages). Snowflake credits are converted. */
  unitPrice(id: string): number {
    const u = this.unit(id);
    if (u.confidence === "unverified") this.note(`unverified:${u.id}`, { kind: "unverified", message: `${u.label} price is unverified` });
    if (u.price !== undefined) return u.price;
    const credit = u.creditType === "platform" ? this.platformCreditCad() : this.aiCreditCad();
    return (u.credits ?? 0) * credit;
  }

  searchTier(id: string) {
    const t = this.catalog.searchTiers.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown AI Search tier "${id}"`);
    return t;
  }

  private lifecycleNote(id: string, label: string, lc: { status: string; retiresOn?: string | null; replacement?: string } | undefined, date: string) {
    if (!lc?.retiresOn) return;
    if (date > lc.retiresOn) {
      this.note(`retired:${id}`, { kind: "retired", message: `${label} retires ${lc.retiresOn} but is used after that date${lc.replacement ? `; use ${lc.replacement}` : ""}` });
    }
  }
}

function scale(p: TokenPrices, f: number): TokenPrices {
  return {
    input: p.input * f,
    cachedInput: p.cachedInput * f,
    output: p.output * f,
    ...(p.cacheWrite !== undefined ? { cacheWrite: p.cacheWrite * f } : {}),
  };
}

/** ISO date of month m (1-based) for a project starting on startDate (yyyy-mm-dd). */
export function monthDate(startDate: string, m: number): string {
  const [y, mo] = startDate.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + (m - 1), 1));
  return d.toISOString().slice(0, 10);
}
