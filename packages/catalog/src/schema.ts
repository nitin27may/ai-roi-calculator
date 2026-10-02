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

export const ChatModel = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.enum(["azure", "snowflake"]),
  vendor: z.enum(["openai", "anthropic", "microsoft", "meta", "mistral", "deepseek", "xai", "cohere", "snowflake", "other"]),
  tokenizer: TokenizerFamily,
  contextWindow: z.number().int().positive(),
  maxOutput: z.number().int().positive(),
  /** Azure: CAD per 1M tokens by deployment type. */
  prices: z
    .object({
      global: TokenPrices,
      dataZone: TokenPrices.optional(),
      /** Price that applies after a promo window ends. */
      globalList: TokenPrices.optional(),
    })
    .optional(),
  /** Requests whose input exceeds this many tokens are billed entirely at `longContext`. */
  longContext: z.object({ threshold: z.number().int().positive(), prices: TokenPrices }).optional(),
  /** Snowflake: credits per 1M tokens (AI Credits). */
  credits: CreditRates.optional(),
  /** Snowflake: cross-region setting needed from an Azure-hosted account. */
  snowflakeRouting: z.enum(["native", "azure-cross-region", "any-region"]).optional(),
  toolUseOverheadTokens: z.number().int().nonnegative().default(0),
  batchDiscount: z.number().min(0).max(1).default(0),
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
  per1M: z.number().nonnegative().optional(),
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

export const UnitPrice = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.enum(["azure", "snowflake"]),
  /** What one unit is, e.g. "1K pages", "1K queries", "SU-month", "GB-month". */
  unit: z.string(),
  price: z.number().nonnegative().optional(),
  credits: z.number().nonnegative().optional(),
  creditType: z.enum(["ai", "platform"]).optional(),
  freePerMonth: z.number().nonnegative().optional(),
  attrs: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  promo: Promo.optional(),
  lifecycle: Lifecycle.optional(),
  source: Source,
  confidence: Confidence,
});
export type UnitPrice = z.infer<typeof UnitPrice>;

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

export const Catalog = z.object({
  meta: z.object({ currency: z.literal("CAD"), asOf: isoDate, region: z.string(), notes: z.array(z.string()) }),
  chatModels: z.array(ChatModel),
  embeddingModels: z.array(EmbeddingModel),
  speechEngines: z.array(SpeechEngine),
  searchTiers: z.array(SearchTier),
  unitPrices: z.array(UnitPrice),
  snowflake: SnowflakeSettingsDefaults,
});
export type Catalog = z.infer<typeof Catalog>;
