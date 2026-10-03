/**
 * How catalogue entries map to Azure Retail Prices API meters. Meter names are inconsistent
 * ("inp" / "Inpt" / "Inp", "Gl" / "glbl"), so every entry carries its own pattern. The chat
 * patterns are ported from workgraph.ai's cost calculator (verified against the API on 2026-09-17).
 * `{r}` is replaced by the deployment token for Global.
 */
export const GLOBAL_TOKEN = "(Gl|glbl|Glbl)";

export const CHAT_PRODUCTS = ["Azure OpenAI GPT5", "Azure OpenAI", "Azure OpenAI Reasoning"];

export const CHAT: Record<string, { product: string; input: string; cachedInput: string; output: string }> = {
  "gpt-5.6-sol": { product: "Azure OpenAI GPT5", input: "^5\\.6 sol ShortCo Inp Std {r} 1M", cachedInput: "^5\\.6 sol ShortCo Cd Inp Std {r} 1M", output: "^5\\.6 sol ShortCo Opt Std {r} 1M" },
  "gpt-5.6-terra": { product: "Azure OpenAI GPT5", input: "^5\\.6 terra ShortCo Inp Std {r} 1M", cachedInput: "^5\\.6 terra ShortCo Cd Inp Std {r} 1M", output: "^5\\.6 terra ShortCo Opt Std {r} 1M" },
  "gpt-5.6-luna": { product: "Azure OpenAI GPT5", input: "^5\\.6 luna ShortCo Inp Std {r} 1M", cachedInput: "^5\\.6 luna ShortCo Cd Inp Std {r} 1M", output: "^5\\.6 luna ShortCo Opt Std {r} 1M" },
  "gpt-5.5": { product: "Azure OpenAI GPT5", input: "^5\\.5 ShortCo inp {r} 1M", cachedInput: "^5\\.5 ShortCo cd inp {r} 1M", output: "^5\\.5 ShortCo opt {r} 1M" },
  "gpt-5.4": { product: "Azure OpenAI GPT5", input: "^5\\.4 inp {r} 1M", cachedInput: "^5\\.4 cd inp {r} 1M", output: "^5\\.4 opt {r} 1M" },
  "gpt-5.4-mini": { product: "Azure OpenAI GPT5", input: "^5\\.4 mini Inp {r} 1M", cachedInput: "^5\\.4 mini cd Inp {r} 1M", output: "^5\\.4 mini Opt {r} 1M" },
  "gpt-5.4-nano": { product: "Azure OpenAI GPT5", input: "^5\\.4 nano Inp {r} 1M", cachedInput: "^5\\.4 nano cd Inp {r} 1M", output: "^5\\.4 nano Opt {r} 1M" },
  "gpt-5.2": { product: "Azure OpenAI GPT5", input: "^GPT 5\\.2 inp {r} 1M", cachedInput: "^GPT 5\\.2 cd inp {r} 1M", output: "^GPT 5\\.2 opt {r} 1M" },
  "gpt-5.1": { product: "Azure OpenAI GPT5", input: "^GPT 5\\.1 inp {r} 1M", cachedInput: "^GPT 5\\.1 cd inp {r} 1M", output: "^GPT 5\\.1 opt {r} 1M" },
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
};

export const EMBEDDINGS: Record<string, string> = {
  "text-embedding-3-large": "^text-embedding-3-large-glbl Tokens$",
  "text-embedding-ada-002": "^embedding-ada-glbl Tokens$",
};

export const SPEECH_TOKENS: Record<string, { audioInput: string; textOutput: string }> = {
  "gpt-4o-mini-transcribe": { audioInput: "^gpt-4o-mini-transcribe-aud-inp-glbl Tokens$", textOutput: "^gpt-4o-mini-transcribe-txt-out-glbl Tokens$" },
  "gpt-4o-transcribe": { audioInput: "^gpt-4o-transcribe-aud-inp-glbl Tokens$", textOutput: "^gpt-4o-transcribe-txt-out-glbl Tokens$" },
};
/** Per-hour transcription meters are billed under a separate product from the token meters. */
export const SPEECH_PRODUCTS = ["Azure OpenAI Media"];
export const SPEECH_HOURLY: Record<string, string> = { "gpt-transcribe": "^gpt-transcribe Gl Unit$" };

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
  "translator-text": { filter: "contains(productName,'Translator')", meterName: "^S1 Characters$" },
};

export const SEARCH_TIERS: Record<string, string> = {
  basic: "^Basic Unit$", s1: "^Standard S1 Unit$", s2: "^Standard S2 Unit$", s3: "^Standard S3 Unit$",
  l1: "^Storage Optimized L1 Unit$", l2: "^Storage Optimized L2 Unit$",
};
export const SEARCH_FILTER = "(serviceName eq 'Azure Cognitive Search' or serviceName eq 'Azure AI Search')";
