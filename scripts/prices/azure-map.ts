/**
 * How catalogue entries map to Azure Retail Prices API meters. Meter names are inconsistent
 * ("inp" / "Inpt" / "Inp", "Gl" / "glbl"), so every entry carries its own pattern. The chat
 * patterns are ported from workgraph.ai's cost calculator (verified against the API on 2026-09-17).
 * `{r}` is replaced by the deployment token for Global or Data Zone.
 */
export const GLOBAL_TOKEN = "(Gl|glbl|Glbl)";
/** Data Zone meters: "Dz", "DZ", "dzone", "Data Zone", "DataZone". US and EU Data Zones differ; the US price is used (closest to Canada). */
export const DZ_TOKEN = "(Dz|Dzone|Data ?Zone)"; // matched case-insensitively
export const DZ_REGIONS = ["eastus2", "eastus"];
/** Regional Standard in Canada: per-region meters ("regnl", "regional"). Canada East carries the token meters. */
export const REGIONAL_TOKEN = "(regnl|rgnl|regional|Regional)";
export const CANADA_REGIONS = ["canadaeast", "canadacentral"];
/** Global meters that are priced per region (MAI) take the price in Canada first, then East US 2. */
export const GLOBAL_REGIONS = ["canadacentral", "canadaeast", "eastus2", "eastus"];

export const CHAT_PRODUCTS = ["Azure OpenAI GPT5", "Azure OpenAI GPT6", "Azure OpenAI", "Azure OpenAI Reasoning", "MAI Models", "Azure Deepseek Models"];

/** Meter patterns for one price tier; `{r}` becomes the Global or Data Zone token. */
export interface TierMeters { input: string; cachedInput?: string; output: string; cacheWrite?: string }
export interface ChatSpec extends TierMeters { product: string; long?: TierMeters }

const gpt56 = (v: string): ChatSpec => ({
  product: "Azure OpenAI GPT5",
  input: `^5\\.6 ${v} ShortCo Inp Std {r} 1M`, cachedInput: `^5\\.6 ${v} ShortCo Cd Inp Std {r} 1M`, output: `^5\\.6 ${v} ShortCo Opt Std {r} 1M`, cacheWrite: `^5\\.6 ${v} ShortCo Cd Wr Std {r} 1M`,
  long: { input: `^5\\.6 ${v} LongCo Inp Std {r} 1M`, cachedInput: `^5\\.6 ${v} LongCo Cd Inp Std {r} 1M`, output: `^5\\.6 ${v} LongCo Opt Std {r} 1M`, cacheWrite: `^5\\.6 ${v} LongCo Cd Wr Std {r} 1M` },
});
const gpt6 = (v: string): ChatSpec => ({
  product: "Azure OpenAI GPT6",
  input: `^6-${v} ShortCo Inp Std {r} 1M`, cachedInput: `^6-${v} ShortCo Cd Inp Std {r} 1M`, output: `^6-${v} ShortCo Opt Std {r} 1M`, cacheWrite: `^6-${v} ShortCo Cd Wr Std {r} 1M`,
  long: { input: `^6-${v} LongCo Inp Std {r} 1M`, cachedInput: `^6-${v} LongCo Cd Inp Std {r} 1M`, output: `^6-${v} LongCo Opt Std {r} 1M`, cacheWrite: `^6-${v} LongCo Cd Wr Std {r} 1M` },
});
/** "5.1 codex", "GPT 5.2 chat": `<stem> inp|cd inp|opt {r} 1M`. */
const gpt5 = (stem: string, cached = true): ChatSpec => ({
  product: "Azure OpenAI GPT5",
  input: `^${stem} inp {r} 1M`, ...(cached ? { cachedInput: `^${stem} cd inp {r} 1M` } : {}), output: `^${stem} opt {r} 1M`,
});
const mai = (stem: string, words = { inp: "Inp", cd: "Cd Inp", opt: "Opt" }): ChatSpec => ({
  product: "MAI Models",
  input: `^${stem} ${words.inp} {r} 1M`, cachedInput: `^${stem} ${words.cd} {r} 1M`, output: `^${stem} ${words.opt} {r} 1M`,
});

/**
 * Only the standard tier is mapped. Batch, Flex and Priority Processing ("pp") meters are pricing
 * options of the same models; the catalogue models batch as `batchDiscount`.
 */
export const CHAT: Record<string, ChatSpec> = {
  "gpt-6-astra": gpt6("astra"),
  "gpt-6-sol": gpt6("sol"),
  "gpt-6-luna": gpt6("luna"),
  "gpt-5.6-sol": gpt56("sol"),
  "gpt-5.6-terra": gpt56("terra"),
  "gpt-5.6-luna": gpt56("luna"),
  "gpt-5.5": {
    product: "Azure OpenAI GPT5", input: "^5\\.5 ShortCo inp {r} 1M", cachedInput: "^5\\.5 ShortCo cd inp {r} 1M", output: "^5\\.5 ShortCo opt {r} 1M",
    long: { input: "^5\\.5 LongCo inp {r} 1M", cachedInput: "^5\\.5 LongCo cd inp {r} 1M", output: "^5\\.5 LongCo opt {r} 1M" },
  },
  "gpt-5.4": { ...gpt5("5\\.4"), long: { input: "^5\\.4 longco inp {r} 1M", cachedInput: "^5\\.4 longco cd inp {r} 1M", output: "^5\\.4 longco opt {r} 1M" } },
  "gpt-5.4-pro": { ...gpt5("5\\.4 pro", false), long: { input: "^5\\.4 pro longco inp {r} 1M", output: "^5\\.4 pro longco opt {r} 1M" } },
  "gpt-5.4-mini": gpt5("5\\.4 mini"),
  "gpt-5.4-nano": gpt5("5\\.4 nano"),
  "gpt-5.3-codex": gpt5("5\\.3 codex"),
  "gpt-5.2": gpt5("GPT 5\\.2"),
  "gpt-5.2-codex": gpt5("5\\.2 codex"),
  "gpt-5.1": gpt5("GPT 5\\.1"),
  "gpt-5.1-codex": gpt5("5\\.1 codex"),
  "gpt-5.1-codex-mini": gpt5("5\\.1 codex mini"),
  "gpt-5.1-codex-max": gpt5("5\\.1 codex max"),
  "gpt-5": { product: "Azure OpenAI GPT5", input: "^GPT 5 Inpt {r} 1M", cachedInput: "^GPT 5 cchd Inpt {r} 1M", output: "^GPT 5 outpt {r} 1M" },
  "gpt-5-mini": { product: "Azure OpenAI GPT5", input: "^GPT 5 Mini Inpt {r} 1M", cachedInput: "^GPT 5 Mini cchd Inpt {r} 1M", output: "^GPT 5 Mini outpt {r} 1M" },
  "gpt-5-nano": { product: "Azure OpenAI GPT5", input: "^GPT 5 Nano Inpt {r} 1M", cachedInput: "^GPT 5 Nano cchd Inpt {r} 1M", output: "^GPT 5 Nano outpt {r} 1M" },
  "gpt-4.1": { product: "Azure OpenAI", input: "^gpt 4\\.1 Inp {r} Tokens", cachedInput: "^gpt 4\\.1 cached Inp {r} Tokens", output: "^gpt 4\\.1 Outp {r} Tokens" },
  "gpt-4.1-mini": { product: "Azure OpenAI", input: "^gpt 4\\.1 mini Inp {r} Tokens", cachedInput: "^gpt 4\\.1 mini cached Inp {r} Tokens", output: "^gpt 4\\.1 mini Outp {r} Tokens" },
  "gpt-4.1-nano": { product: "Azure OpenAI", input: "^gpt 4\\.1 nano Inp {r} Tokens", cachedInput: "^gpt 4\\.1 nano cached Inp {r} Tokens", output: "^gpt 4\\.1 nano Outp {r} Tokens" },
  "gpt-4o": { product: "Azure OpenAI", input: "^gpt 4o 1120 Inp {r} Tokens", cachedInput: "^gpt 4o 1120 cached Inp {r} Tokens", output: "^gpt 4o 1120 Outp {r} Tokens" },
  "gpt-4o-mini": { product: "Azure OpenAI", input: "^gpt.?4o.?mini.?0718.?Inp.?{r} Tokens", cachedInput: "^gpt.?4o.?mini.?0718.?cached.?Inp.?{r} Tokens", output: "^gpt.?4o.?mini.?0718.?Outp.?{r} Tokens" },
  o3: { product: "Azure OpenAI", input: "^o3 0416 Inp {r} Tokens", cachedInput: "^o3 0416 cached Inp {r} Tokens", output: "^o3 0416 Outp {r} Tokens" },
  "o4-mini": { product: "Azure OpenAI Reasoning", input: "^o4-mini 0416 Inp {r} Tokens", cachedInput: "^o4-mini 0416 cached Inp {r} Tokens", output: "^o4-mini 0416 Outp {r} Tokens" },
  "mai-thinking-1": mai("MAI-Thinking-1"),
  "mai-cyber-1-flash": mai("MAI-Cyber-1-Flash"),
  "mai-ds-r1": { product: "Azure Deepseek Models", input: "^MAI-DS-R1 Inp {r} Tokens$", output: "^MAI-DS-R1 Outp {r} Tokens$" },
  "mai-code-1.1-flash": mai("Code 1\\.1 Flash", { inp: "Input", cd: "Cd Input", opt: "Output" }),
};

/** Embedding meters: Global reference, Canada regional, and US Data Zone (falls back to US regional, priced the same). */
export const EMBEDDINGS: Record<string, { global: string; regional: string; dataZone: string[] }> = {
  "text-embedding-3-large": { global: "^text-embedding-3-large-glbl Tokens$", regional: "^text-embedding-3-large-regional Tokens$", dataZone: ["^text-embedding-3-large-(dzone|datazone) Tokens$", "^text-embedding-3-large-regional Tokens$"] },
  "text-embedding-3-small": { global: "^text-embedding-3-small-glbl Tokens$", regional: "^text-embedding-3-small-regional Tokens$", dataZone: ["^text-embedding-3-small-(dzone|datazone) Tokens$", "^text-embedding-3-small-regional Tokens$"] },
  "text-embedding-ada-002": { global: "^embedding-ada-glbl Tokens$", regional: "^embedding-ada-regional Tokens$", dataZone: ["^embedding-ada-datazone Tokens$", "^embedding-ada-regional Tokens$"] },
};

/** Token-billed transcription: audio input and text output meters (Azure OpenAI and Azure OpenAI Media products). */
export const SPEECH_TOKENS: Record<string, { audioInput: string; textOutput: string }> = {
  "gpt-4o-mini-transcribe": { audioInput: "^gpt4o mn trscb aud in gl 1215 1M", textOutput: "^gpt4o mn trscb txt out gl 1215 1M" },
  "gpt-4o-transcribe": { audioInput: "^gpt-4o-transcribe-aud-inp-glbl Tokens$", textOutput: "^gpt-4o-transcribe-txt-out-glbl Tokens$" },
  "gpt-4o-transcribe-diarize": { audioInput: "^gpt 4o tcrb d aud inp glbl Tokens$", textOutput: "^gpt 4o tcrb d txt out glbl Tokens$" },
};
/** Media meters (per-hour transcription, realtime audio) are billed under their own product. */
export const SPEECH_PRODUCTS = ["Azure OpenAI Media"];
/** Per-hour Foundry transcription meters (Global). */
export const SPEECH_HOURLY: Record<string, string> = {
  "gpt-transcribe": "^gpt-transcribe Gl Unit$",
  "gpt-live-transcribe": "^gpt-live-transcribe Gl Unit$",
  "gpt-realtime-whisper": "^gpt-realtime-whisper Opt Gl Unit$",
  whisper: "^Speech-to-Text-Batch-Whisper-glbl Unit$",
};
/** Azure Speech pay-as-you-go meters in the catalogue region. */
export const SPEECH_FILTER = "productName eq 'Azure Speech'";
export const SPEECH_REGIONAL: Record<string, { perAudioHour: string; diarizationAddOnPerHour?: string }> = {
  "speech-realtime": { perAudioHour: "^S1 Speech To Text$", diarizationAddOnPerHour: "^S1 Speech to Text Enhanced Feature Audio$" },
  "speech-batch": { perAudioHour: "^S1 Speech to Text Batch$" },
  "speech-fast": { perAudioHour: "^Fast Transcription Speech To Text$" },
};

/** Realtime (speech-to-speech) models: text and audio token meters in Azure OpenAI Media. */
export const REALTIME: Record<string, { text: TierMeters; audio: TierMeters }> = {
  "gpt-realtime-2.1": {
    text: { input: "^gpt-realtime-2\\.1 Text inp {r} 1M", cachedInput: "^gpt-realtime-2\\.1 Text cd inp {r} 1M", output: "^gpt-realtime-2\\.1 Text opt {r} 1M" },
    audio: { input: "^gpt-realtime-2\\.1 Audio inp {r} 1M", cachedInput: "^gpt-realtime-2\\.1 Audio cd inp {r} 1M", output: "^gpt-realtime-2\\.1 Audio opt {r} 1M" },
  },
  "gpt-realtime-2.1-mini": {
    text: { input: "^gpt-realtime-2\\.1-mini Text inp {r} 1M", cachedInput: "^gpt-realtime-2\\.1-mini Text cd inp {r} 1M", output: "^gpt-realtime-2\\.1-mini Text opt {r} 1M" },
    audio: { input: "^gpt-realtime-2\\.1-mini Audio inp {r} 1M", cachedInput: "^gpt-realtime-2\\.1-mini Audio cd inp {r} 1M", output: "^gpt-realtime-2\\.1-mini Audio opt {r} 1M" },
  },
  "gpt-realtime-1.5": {
    text: { input: "^gpt rt 1\\.5 txt inp {r} 1M", cachedInput: "^gpt rt 1\\.5 txt cd inp {r} 1M", output: "^gpt rt 1\\.5 txt opt {r} 1M" },
    audio: { input: "^gpt rt 1\\.5 aud inp {r} 1M", cachedInput: "^gpt rt 1\\.5 aud cd inp {r} 1M", output: "^gpt rt 1\\.5 aud opt {r} 1M" },
  },
};

/** Region-scoped service meters. `perHour` meters are multiplied by 730 for a monthly price. */
export interface ServiceMeter { filter: string; meterName: string; skuName?: string; tierMinimumUnits?: number; scale?: number; pick?: "max" }
export const UNIT_METERS: Record<string, ServiceMeter> = {
  "di-read": { filter: "contains(productName,'Document Intelligence')", meterName: "^S0 Read Pages$", skuName: "S0" },
  "di-layout": { filter: "contains(productName,'Document Intelligence')", meterName: "^S0 Pre-built Pages$", skuName: "S0" },
  "di-prebuilt": { filter: "contains(productName,'Document Intelligence')", meterName: "^S0 Pre-built Pages$", skuName: "S0" },
  "search-semantic": { filter: "(serviceName eq 'Azure Cognitive Search' or serviceName eq 'Azure AI Search')", meterName: "^Semantic Ranker" },
  "apim-developer": { filter: "serviceName eq 'API Management'", meterName: "^Developer Unit$", skuName: "Developer", scale: 730 },
  "apim-basic-v2": { filter: "serviceName eq 'API Management'", meterName: "^Basic v2 Unit$", skuName: "Basic v2", scale: 730 },
  "apim-standard-v2": { filter: "serviceName eq 'API Management'", meterName: "^Standard v2 Unit$", skuName: "Standard v2", scale: 730 },
  "log-analytics-ingest": { filter: "(serviceName eq 'Log Analytics' or serviceName eq 'Azure Monitor')", meterName: "^Analytics Logs Data Ingestion$", pick: "max" },
  "blob-hot": { filter: "productName eq 'General Block Blob v2' and skuName eq 'Hot LRS'", meterName: "^Hot LRS Data Stored$" },
  "key-vault-ops": { filter: "serviceName eq 'Key Vault'", meterName: "^Operations$", skuName: "Standard" },
  "language-records": { filter: "contains(productName,'Language')", meterName: "^Standard Text Records$", skuName: "Standard" },
  "tts-neural": { filter: "productName eq 'Azure Speech'", meterName: "^S1 Neural Text To Speech Characters$" },
  "tts-neural-hd": { filter: "productName eq 'Azure Speech'", meterName: "^Neural HD Text to Speech Characters$" },
  "translator-text": { filter: "contains(productName,'Translator')", meterName: "^S1 Characters$" },
};

export const SEARCH_TIERS: Record<string, string> = {
  basic: "^Basic Unit$", s1: "^Standard S1 Unit$", s2: "^Standard S2 Unit$", s3: "^Standard S3 Unit$",
  l1: "^Storage Optimized L1 Unit$", l2: "^Storage Optimized L2 Unit$",
};
export const SEARCH_FILTER = "(serviceName eq 'Azure Cognitive Search' or serviceName eq 'Azure AI Search')";
