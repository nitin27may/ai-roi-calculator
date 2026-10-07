import { z } from "zod";

/**
 * Price catalogue schema. Every price is CAD. Azure prices come from the Azure Retail
 * Prices API with currencyCode='CAD'; Snowflake prices are credits, converted with the
 * project's CAD-per-credit settings. Items with no API are curated by hand and say so
 * through `source.kind` and `confidence`.
 */

export const Confidence = z.enum(["verified", "cross-checked", "single-source", "unverified"]);
export type Confidence = z.infer<typeof Confidence>;

export const Source = z.object({
  kind: z.enum(["azure-retail-api", "snowflake-consumption-table", "vendor-doc", "derived", "manual"]),
  url: z.string().url().optional(),
  meterName: z.string().optional(),
  note: z.string().optional(),
  /** The Retail API OData filter that returned the row (azure-retail-api sources of resource prices). */
  filter: z.string().optional(),
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type Source = z.infer<typeof Source>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Lifecycle = z.object({
  status: z.enum(["preview", "ga", "legacy", "deprecated", "retired"]),
  retiresOn: isoDate.nullable().optional(),
  replacement: z.string().optional(),
});

/** Promotional price window: the entry's price applies until `until`, then `list` applies. */
export const Promo = z.object({ until: isoDate, note: z.string().optional() });

/** CAD per 1M tokens. */
export const TokenPrices = z.object({
  input: z.number().nonnegative(),
  cachedInput: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative().optional(),
});
export type TokenPrices = z.infer<typeof TokenPrices>;

/** Snowflake credits per 1M tokens. */
export const CreditRates = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cachedInput: z.number().nonnegative().optional(),
});

export const TokenizerFamily = z.enum(["o200k", "claude-legacy", "claude-47", "other"]);
export type TokenizerFamily = z.infer<typeof TokenizerFamily>;

/**
 * Azure deployment types the app offers. For Foundry models these are deployment types; for engines that
 * run in an Azure Speech (Cognitive Services) resource they mean where the resource is: Canada for
 * `regional`, a US region for `dataZone` and `global`.
 */
export const Deployment = z.enum(["global", "regional", "dataZone"]);
export type Deployment = z.infer<typeof Deployment>;

/**
 * Azure Foundry processing tier. Only `standard` and `batch` are priced today; the enum stays
 * open so `priority` and `flex` can be added later as catalogue data (see `ChatModel.tiers`).
 */
export const ProcessingTier = z.enum(["standard", "batch"]);
export type ProcessingTier = z.infer<typeof ProcessingTier>;

/** A tier's price relative to Standard: a flat discount/premium factor, or its own published prices. */
export const TierPricing = z.union([z.object({ factor: z.number().positive() }), z.object({ prices: TokenPrices })]);
export type TierPricing = z.infer<typeof TierPricing>;

export const ChatModel = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.enum(["azure", "snowflake"]),
  vendor: z.enum(["openai", "anthropic", "microsoft", "meta", "mistral", "deepseek", "xai", "cohere", "snowflake", "other"]),
  tokenizer: TokenizerFamily,
  /** True for reasoning models (o-series, GPT-5.x/6.x, Claude 4.5+ extended thinking, MAI-Thinking, DeepSeek R1-class): bills reasoning tokens as output. */
  reasoning: z.boolean().optional(),
  contextWindow: z.number().int().positive(),
  maxOutput: z.number().int().positive(),
  /**
   * Azure: CAD per 1M tokens by deployment type. The project picks Canada Regional Standard or US Data
   * Zone Standard; a model is offered for a deployment only if it has that price. `global` is the
   * Retail API reference that long-context and promo prices are scaled from.
   */
  prices: z
    .object({
      global: TokenPrices,
      dataZone: TokenPrices.optional(),
      /** Regional Standard in Canada (canadaeast / canadacentral). */
      regional: TokenPrices.optional(),
      /** Price that applies after a promo window ends. */
      globalList: TokenPrices.optional(),
    })
    .optional(),
  /**
   * Azure deployments Microsoft offers the model under (region availability tables). This decides
   * availability; a price for a deployment may exist in the Retail API without the deployment being offered.
   */
  availableIn: z.array(Deployment).optional(),
  /** Requests whose input exceeds this many tokens are billed entirely at `longContext`. */
  longContext: z.object({ threshold: z.number().int().positive(), prices: TokenPrices }).optional(),
  /** Snowflake: credits per 1M tokens (AI Credits). */
  credits: CreditRates.optional(),
  /** Snowflake: cross-region setting needed from an Azure-hosted account. */
  snowflakeRouting: z.enum(["native", "azure-cross-region", "any-region"]).optional(),
  toolUseOverheadTokens: z.number().int().nonnegative().default(0),
  /**
   * Azure Batch discount, derived from Azure Batch meters (see `scripts/prices/azure.ts`). Kept as the
   * data source for `batch`; `tiers` overrides it per tier and is how Priority/Flex get added later
   * without a schema migration for every existing model.
   */
  batchDiscount: z.number().min(0).max(1).default(0),
  /** Price or factor per processing tier, keyed by `ProcessingTier` minus `standard`. Overrides `batchDiscount` for `batch` when present. */
  tiers: z.record(ProcessingTier, TierPricing).optional(),
  promo: Promo.optional(),
  lifecycle: Lifecycle,
  source: Source,
  confidence: Confidence,
});
export type ChatModel = z.infer<typeof ChatModel>;

export const EmbeddingModel = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.enum(["azure", "snowflake"]),
  dims: z.number().int().positive(),
  maxInputTokens: z.number().int().positive(),
  /** Global reference price, CAD per 1M tokens. */
  per1M: z.number().nonnegative().optional(),
  /** CAD per 1M tokens by deployment (`per1M` is the Global price); an Azure model is offered only where it has a price. */
  deployments: z.object({ regional: z.number().nonnegative().optional(), dataZone: z.number().nonnegative().optional() }).optional(),
  availableIn: z.array(Deployment).optional(),
  credits: z.number().nonnegative().optional(),
  lifecycle: Lifecycle,
  source: Source,
  confidence: Confidence,
});
export type EmbeddingModel = z.infer<typeof EmbeddingModel>;

export const SpeechEngine = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.enum(["azure", "snowflake"]),
  via: z.string(),
  mode: z.enum(["batch", "realtime", "fast", "streaming"]),
  /** CAD per audio hour (Azure) — or derived from tokens below. */
  perAudioHour: z.number().nonnegative().optional(),
  /** Token-billed models: audio tokens per second and CAD per 1M. */
  tokens: z
    .object({ audioTokensPerSecond: z.number().positive(), audioInputPer1M: z.number(), textOutputPer1M: z.number() })
    .optional(),
  /** Snowflake: AI credits per audio hour. */
  creditsPerHour: z.number().nonnegative().optional(),
  /** Azure deployments this engine can run under; absent = available under both. */
  availableIn: z.array(Deployment).optional(),
  diarization: z.enum(["included", "add-on", "none"]),
  diarizationAddOnPerHour: z.number().nonnegative().optional(),
  /** Price multiplier after the promo window (e.g. list price unpublished → assumption). */
  afterPromoMultiplier: z.number().positive().optional(),
  promo: Promo.optional(),
  lifecycle: Lifecycle,
  source: Source,
  confidence: Confidence,
});
export type SpeechEngine = z.infer<typeof SpeechEngine>;

/** A price for a pricing option other than pay-as-you-go (same unit as the entry's `price`). */
export const OptionPrice = z.object({ price: z.number().nonnegative(), source: Source });
export type OptionPrice = z.infer<typeof OptionPrice>;

/** A hand-typed price that wins over the refreshed one; a price refresh never overwrites it. */
export const ManualPrice = z.object({ price: z.number().nonnegative(), note: z.string().min(1), retrievedAt: isoDate });
export type ManualPrice = z.infer<typeof ManualPrice>;

export const UnitPrice = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.enum(["azure", "snowflake"]),
  /** What one unit is, e.g. "1K pages", "1K queries", "SU-month", "GB-month". */
  unit: z.string(),
  price: z.number().nonnegative().optional(),
  credits: z.number().nonnegative().optional(),
  creditType: z.enum(["ai", "platform"]).optional(),
  /** Free allowance per month, in this entry's own unit (e.g. 1 for "1K queries" = 1,000 queries). */
  freePerMonth: z.number().nonnegative().optional(),
  attrs: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  /** Reserved (1 or 3 years), Hybrid Benefit and dev/test prices, in this entry's unit. Absent means the option has no price here. */
  options: z.object({ ri1: OptionPrice, ri3: OptionPrice, ahb: OptionPrice, devtest: OptionPrice }).partial().optional(),
  /** When set, `manual.price` replaces `price` (pay-as-you-go) and the entry shows a "manual" note. */
  manual: ManualPrice.optional(),
  promo: Promo.optional(),
  lifecycle: Lifecycle.optional(),
  source: Source,
  confidence: Confidence,
});
export type UnitPrice = z.infer<typeof UnitPrice>;

export const ResourceCategory = z.enum(["compute", "database", "storage", "messaging", "network", "security", "monitoring", "data", "licences"]);
export type ResourceCategory = z.infer<typeof ResourceCategory>;
export const RESOURCE_CATEGORIES = ResourceCategory.options;

/** Pricing options a resource type can offer: pay-as-you-go, 1- or 3-year reserved, Azure Hybrid Benefit, dev/test rates. */
export const PricingOption = z.enum(["payg", "ri1", "ri3", "ahb", "devtest"]);
export type PricingOption = z.infer<typeof PricingOption>;

/**
 * How one meter is found in the Retail API. All patterns are case-insensitive regular expressions and may use
 * `{armSku}` (the SKU's `armSku`, escaped). `parts` prices a meter as a sum of rows, each times a numeric SKU attribute
 * (a Functions Premium instance is vCPUs x vCPU-hour rate + GiB x GiB-hour rate).
 */
export const MeterRule = z.object({
  meterName: z.string().optional(),
  productName: z.union([z.string(), z.record(z.string())]).optional(),
  skuName: z.string().optional(),
  /** Lower bound of the tier to take; default 0 (the first tier). `"paid"` takes the lowest tier with a price above 0. */
  tier: z.union([z.number().nonnegative(), z.literal("paid")]).optional(),
  /** Unit label of the resulting unit price (default derived from the row's unit of measure). */
  unit: z.string().optional(),
  /** Pricing options this meter offers; default is every option the type declares. Others get a fallback note. */
  options: z.array(z.enum(["payg", "ri1", "ri3", "ahb", "devtest"])).optional(),
  /** Priced at 0 with a reason, for free tiers and meters that carry no charge. */
  free: z.string().optional(),
  /** Regex on the row's unit of measure, to tell a monthly row from an hourly row of the same meter name. */
  uom: z.string().optional(),
  /** A per-hour price billed by the hour used (DBU-hours, DIU-hours): not scaled to a 730-hour month. */
  usage: z.boolean().optional(),
  /** Name of a numeric SKU attribute the price is multiplied by (Fabric capacity units, Synapse units of 100 DWU). */
  multiplyBy: z.string().optional(),
  /** Reserved prices come from another meter (Fabric reservations are a different product from pay-as-you-go). */
  reservation: z.object({ meterName: z.string().optional(), productName: z.string().optional(), skuName: z.string().optional() }).optional(),
  /** Divide the row's price by this (a licence listed for a 64 vCPU VM, priced per vCPU). */
  divisor: z.number().positive().optional(),
  parts: z.array(z.object({ meterName: z.string(), productName: z.union([z.string(), z.record(z.string())]).optional(), skuName: z.string().optional(), factorAttr: z.string(), tier: z.union([z.number().nonnegative(), z.literal("paid")]).optional() })).optional(),
});
export type MeterRule = z.infer<typeof MeterRule>;

export const RetailBlock = z.object({
  /** OData filter. With `{armSku}` the refresh queries once per SKU, otherwise once for the type. `{region}` is the catalogue region. */
  filter: z.string(),
  /** Regex on productName, or one per `attrs.os` ("linux", "windows"). */
  productName: z.union([z.string(), z.record(z.string())]).optional(),
  skuName: z.string().optional(),
  /** Meter id to the rule that prices it (a bare string is a meterName pattern). */
  meters: z.record(z.union([z.string(), MeterRule])),
  armSkuToken: z.string().optional(),
  /** Reserved prices cover compute only: a Windows SKU's reserved price is the Linux reservation plus the Windows licence at pay-as-you-go. */
  windowsLicence: z.boolean().optional(),
  /** Small per-unit prices lose digits in CAD (4 decimals); take them from the USD row times the measured FX rate. */
  precise: z.boolean().optional(),
  /** Price this type from another region (a global service the Retail API lists under one region), with the reason. */
  regionOverride: z.string().optional(),
  regionNote: z.string().optional(),
});
export type RetailBlock = z.infer<typeof RetailBlock>;

/**
 * Azure Hybrid Benefit per type. `linux-twin`: a Windows SKU takes the Linux price of the same size and a Linux SKU has no
 * Hybrid Benefit. `licence-free`: the licence meter costs 0 when you bring your own licence. `unavailable`: the Retail API
 * has no compute-only meter, so the type declares no "ahb" option; add a manual price if you hold one.
 */
export const AhbRule = z.object({
  kind: z.enum(["linux-twin", "licence-free", "unavailable"]),
  note: z.string().min(1),
});
export type AhbRule = z.infer<typeof AhbRule>;

/**
 * A kind of Azure (or licensed) resource, such as a virtual machine, with the SKUs you can pick for it.
 * A meter is one billed quantity (compute hours, storage GB). Its `quantity` comes from a resource input times
 * an optional factor. A meter's unit price is CAD per unit-month; for an `hourly` meter that is the cost of
 * 730 hours, scaled by hours / 730 when the resource runs on a schedule.
 */
export const ResourceType = z.object({
  id: z.string(),
  label: z.string(),
  category: ResourceCategory,
  docsUrl: z.string().url().optional(),
  /** What this type does not cover (disk transactions, backups), shown next to the type. */
  note: z.string().optional(),
  inputs: z.array(z.object({ id: z.string(), label: z.string(), unit: z.string(), help: z.string() })),
  meters: z.array(z.object({
    id: z.string(),
    label: z.string().optional(),
    quantity: z.object({ input: z.string(), factor: z.number().positive().optional() }),
    hourly: z.boolean(),
    scalesWithSize: z.boolean(),
  })).min(1),
  options: z.array(PricingOption).default(["payg"]),
  /** How the price refresh finds this type's meters in the Retail API (see `scripts/prices/resources.ts`). */
  retail: RetailBlock.optional(),
  /** Azure Hybrid Benefit rule for this type. Required when `options` includes "ahb". */
  ahb: AhbRule.optional(),
  skus: z.array(z.object({
    id: z.string(),
    label: z.string(),
    attrs: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
    armSku: z.string().optional(),
    /** Meter id to the id of the unit price that bills it. */
    prices: z.record(z.string()),
    /** Meter id to a retail rule for this SKU: replaces the type's rule field by field (a free tier replaces it whole). */
    retail: z.record(z.union([z.string(), MeterRule])).optional(),
  })).min(1),
});
export type ResourceType = z.infer<typeof ResourceType>;

/** One file in `data/resources/`: the types of a category and the unit prices only they use. */
export const ResourceFile = z.object({
  category: ResourceCategory,
  note: z.string().optional(),
  types: z.array(ResourceType),
  unitPrices: z.array(UnitPrice),
});
export type ResourceFile = z.infer<typeof ResourceFile>;

export const SearchTier = z.object({
  id: z.enum(["free", "basic", "s1", "s2", "s3", "s3hd", "l1", "l2"]),
  label: z.string(),
  perSUMonth: z.number().nonnegative(),
  storageGBPerPartition: z.number().positive(),
  vectorGBPerPartition: z.number().nonnegative(),
  maxPartitions: z.number().int().positive(),
  maxReplicas: z.number().int().positive(),
  maxIndexes: z.number().int().positive(),
  source: Source,
  confidence: Confidence,
});
export type SearchTier = z.infer<typeof SearchTier>;

export const SnowflakeSettingsDefaults = z.object({
  /** CAD per AI credit with global cross-region routing (ANY_REGION). */
  aiCreditGlobal: z.number().positive(),
  /** CAD per AI credit with regional or disabled routing (AZURE_US/AZURE_EU). */
  aiCreditRegional: z.number().positive(),
  /** CAD per platform credit by edition. */
  platformCredit: z.record(z.enum(["standard", "enterprise", "businessCritical", "vps"]), z.number().positive()),
  warehouseCreditsPerHour: z.record(z.enum(["xs", "s", "m", "l", "xl"]), z.number().positive()),
  source: Source,
  confidence: Confidence,
});

/** Speech-to-speech models: text and audio tokens priced separately (CAD per 1M). */
export const RealtimeModel = z.object({
  id: z.string(),
  label: z.string(),
  text: TokenPrices,
  audio: TokenPrices,
  audioTokensPerSecondIn: z.number().positive(),
  audioTokensPerSecondOut: z.number().positive(),
  /** Azure deployments this model can run under; absent = available under both. */
  availableIn: z.array(Deployment).optional(),
  lifecycle: Lifecycle,
  source: Source,
  confidence: Confidence,
});
export type RealtimeModel = z.infer<typeof RealtimeModel>;

const PtuRate = z.object({ hourly: z.number().positive(), monthlyReservation: z.number().positive(), yearlyReservationPerMonth: z.number().positive() });
/** Provisioned throughput: CAD per PTU and Microsoft's per-model sizing table. */
export const Ptu = z.object({
  rates: z.object({ global: PtuRate, dataZone: PtuRate, regional: PtuRate }),
  models: z.array(z.object({
    modelId: z.string(), inputTpmPerPtu: z.number().positive(), outputRatio: z.number().positive(),
    globalMin: z.number().int().positive(), globalIncrement: z.number().int().positive(),
    regionalMin: z.number().int().positive(), regionalIncrement: z.number().int().positive(),
  })),
  source: Source,
  confidence: Confidence,
});
export type Ptu = z.infer<typeof Ptu>;

const PresetValues = z.object({ conservative: z.number().nonnegative(), typical: z.number().nonnegative(), optimistic: z.number().nonnegative() });

/** Time-saved benchmark for a capability, with its evidence. */
export const Benchmark = z.object({
  id: z.string(), label: z.string(),
  /** perTask: minutes per task done; perUserWeek: minutes per active user per week; perVolume: minutes per handled item. */
  driver: z.enum(["perTask", "perUserWeek", "perVolume"]),
  baselineMinutes: z.number().nonnegative(),
  /** Saving per preset, in `unit`: minutes, or percent of the baseline. */
  savings: PresetValues,
  unit: z.enum(["minutes", "pct"]),
  roleId: z.string(),
  /** Share of the saving an existing licence (e.g. Microsoft 365 Copilot) already delivers to licensed users. */
  licenceOverlap: z.number().min(0).max(1),
  confidence: z.enum(["high", "medium", "low", "none"]),
  vendorFunded: z.boolean(),
  sourceLabel: z.string(), sourceUrl: z.string().url().optional(), note: z.string().optional(),
});
export type Benchmark = z.infer<typeof Benchmark>;

export const BenchmarkLibrary = z.object({
  asOf: isoDate, source: z.string(), notes: z.string(),
  presets: z.object({ conservative: z.object({ adoptionPct: z.number(), realisationPct: z.number(), rationale: z.string() }), typical: z.object({ adoptionPct: z.number(), realisationPct: z.number(), rationale: z.string() }), optimistic: z.object({ adoptionPct: z.number(), realisationPct: z.number(), rationale: z.string() }) }),
  roles: z.array(z.object({ id: z.string(), label: z.string(), hourlyRate: z.number().nonnegative(), source: z.string() })),
  /** Standard delivery roles offered by "Add role from the standard list". Never added to a project by themselves. */
  availableRoles: z.array(z.object({ id: z.string(), label: z.string(), hourlyRate: z.number().nonnegative(), source: z.string(), confidence: Confidence })).default([]),
  capabilities: z.array(Benchmark),
});

export const Catalog = z.object({
  meta: z.object({
    currency: z.literal("CAD"), asOf: isoDate, region: z.string(), notes: z.array(z.string()),
    /** Rate used for USD-only list prices: Azure's own CAD/USD meter ratio, re-measured on every refresh. */
    fx: z.object({ usdToCad: z.number().positive(), meters: z.number().int().positive(), asOf: isoDate, source: z.string() }).optional(),
  }),
  chatModels: z.array(ChatModel),
  embeddingModels: z.array(EmbeddingModel),
  speechEngines: z.array(SpeechEngine),
  realtimeModels: z.array(RealtimeModel),
  ptu: Ptu,
  searchTiers: z.array(SearchTier),
  /** Includes the prices declared in `data/resources/*.json`. */
  unitPrices: z.array(UnitPrice),
  resourceTypes: z.array(ResourceType).default([]),
  snowflake: SnowflakeSettingsDefaults,
  benchmarks: BenchmarkLibrary,
});
export type Catalog = z.infer<typeof Catalog>;
