# Snowflake Cortex AI pricing and billing (as of 2026-10-02)

## Sources and confidence
The research container could not reach `snowflake.com` (which hosts the Consumption Table PDF) or `docs.snowflake.com`. These were used instead:
- **(A)** An unofficial GitHub markdown mirror of the Snowflake docs (`szeno/snowflake-docs`). Its content is current; the sync date is unknown.
- **(B)** Snowflake-Labs quickstarts.
- **(C)** Code from Snowflake employees and practitioners that hard-codes Consumption Table rates.
- **(D)** Search snippets.

Confidence levels used below:
- **H**: official docs text, or two sources that agree.
- **M**: one credible source.
- **L**: a snippet or an extrapolation.

## 1. Billing basics

### 1.1 Two credit types since 2026-04-01 (H)
| Credit | Applies to | Price |
|---|---|---|
| **AI Credit** | Table 6: AI Functions (AI_COMPLETE, AI_EMBED, AI_CLASSIFY, AI_EXTRACT…), Cortex Search, Batch Search, AI Parse Doc, Cortex Agents, Snowflake CoWork (formerly Intelligence), Cortex Code, REST API | **$2.00** with global routing (`ANY_REGION` / `*_GLOBAL`); **$2.20** with regional or disabled routing. The price is the same for every edition and region. ACV discounts apply. **Capacity discounts do not apply.** |
| **Platform Credit** | Warehouses, storage, transfer; also Cortex Fine-tuning and the standalone Cortex Analyst API ("legacy") | Set by edition, cloud and region; on-demand or capacity contract |

Conflict: some 2026 blogs, and an older Snowflake-Labs dashboard, still bill AI Functions in edition-priced credits. Recommendation: use AI Credits by default, with an override for older contracts.

### 1.2 Platform Credit list prices (on-demand)
| Region | Standard | Enterprise | Business Critical | VPS | Conf |
|---|---|---|---|---|---|
| Azure East US 2 | $2.00 | $3.00 | $4.00 | $6.00 | M |
| Azure West Europe | ~$2.60 | ~$3.90 | ~$5.20 | ~$7.80 | L |

The actual rates in force for an account are in `SNOWFLAKE.ORGANIZATION_USAGE.RATE_SHEET_DAILY`.

### 1.3 Warehouse overhead (H)
- Snowflake guidance: use a warehouse **no larger than MEDIUM** for AI Functions and AI_PARSE_DOCUMENT. For Cortex Search indexing, MEDIUM or LARGE.
- Credits per hour (Gen1): XS 1, S 2, **M 4**, L 8, XL 16, 2XL 32, 3XL 64, 4XL 128.
- Billing is per second, with a 60-second minimum on each resume.
- Cloud services are billed only above 10% of daily warehouse credits.
- AI_COUNT_TOKENS costs warehouse compute only.

### 1.4 Cross-region inference (H)
- Controlled by the `CORTEX_ENABLED_CROSS_REGION` parameter: ANY_REGION, AZURE_GLOBAL, AZURE_US, AZURE_EU, AWS_US, AWS_EU… or DISABLED.
- Credits are billed in the requesting region. There is no egress charge.
- Global routing costs $2.00 per AI Credit; regional costs $2.20.
- Behaviour change bundle (BCR) 2026_06 defaults existing Azure accounts to AZURE_US / AZURE_EU, which means the $2.20 rate.
- **No Claude model is available under AZURE_US or AZURE_EU.** Calling Claude from Azure East US 2 or West Europe requires ANY_REGION ($2.00) or AWS_US / AWS_EU ($2.20). The traffic crosses the public internet (mTLS 1.3).
- GPT-5.x is available via AZURE_US. GPT-5, 5.1 and 5.4 are also available via AZURE_EU.
- Gemini requires ANY_REGION.

### 1.5 Formulas
```
AI cost       = Σ (in/1e6·cr_in + out/1e6·cr_out) × P_ai × (1 − ACV_disc)     P_ai = 2.00 | 2.20
Fixed-rate fn = billed_tokens/1e6 × cr × P_ai   (hidden system prompt; AI_CLASSIFY labels re-billed per row)
Pages         = pages/1000 × cr_per_1k × P_ai
Audio         = seconds × 50 tok/s (10 s min/file)
Warehouse     = Σ runtime_h × WH_cr/h × P_platform(edition, region)
Search serve  = 6.3 cr × GB_indexed × months × P_ai;  GB = rows × (n_vec × dims × 4 + avg_row_bytes)/1e9
Search embed  = rows × tok_per_row/1e6 × embed_cr × P_ai (initial + every insert/update; full refresh on schema change)
```

## 2. AI_COMPLETE models (AI Credits per 1M tokens)

Pattern (H): the AI_COMPLETE credit rate ≈ (USD list price ÷ 2) × 1.1 for frontier models. Open models ≈ REST USD price ÷ 2.

USD columns below are at $2.00 per AI Credit. **\*** = derived from the pattern above, not taken from a primary source.

| Model | cr in | cr out | $ in/out | Context/max out | Azure availability | Conf |
|---|---|---|---|---|---|---|
| claude-opus-5-5 (PuPr) | 2.20* | 11.00* | 4.40/22.00 | 1M/128K | needs ANY_REGION or AWS_* | L |
| claude-opus-5 | 2.75* | 13.75* | 5.50/27.50 | 1M/128K | same | L-M |
| claude-opus-4-8/4-7/4-6/4-5 | 2.75 | 13.75 | 5.50/27.50 | 1M/128K | same | M |
| claude-sonnet-5 / 5-5 | 1.10* | 5.50* | 2.20/11.00 | 1M/64K | same | L |
| claude-sonnet-4-6 / 4-5 | 1.65 | 8.25 | 3.30/16.50 | 1M or 200K/64K | same | M |
| claude-haiku-4-5 | 0.55 | 2.75 | 1.10/5.50 | 200K/64K | same | M |
| openai-gpt-5 | 0.69 | 5.50 | 1.38/11.00 | 272K/8,192 | AZURE_US, AZURE_EU | M |
| openai-gpt-5-mini | 0.14 | 1.10 | 0.28/2.20 | 272K | AZURE_US | M |
| openai-gpt-5-nano | 0.03 | 0.22 | 0.06/0.44 | 272K | AZURE_US | M |
| openai-gpt-5.1 | ≈0.69 | ≈5.50 | — | 272K | AZURE_US, AZURE_EU | L |
| openai-gpt-5.2 | 0.97 | 7.70 | 1.94/15.40 | — | AZURE_US | M |
| openai-gpt-5.4 (PuPr) | 1.38 | 8.25 | 2.76/16.50 | — | AZURE_US, AZURE_EU | M |
| openai-gpt-4.1 (legacy) | 1.00 | 4.00 | 2.00/8.00 | 128K/32K | native in East US 2 | M |
| openai-o4-mini | 0.55 | 2.20 | 1.10/4.40 | — | — | M |
| openai-gpt-oss-120b / 20b | 0.08/0.04 | 0.30/0.15 | — | — | — | M |
| openai-gpt-5.5 / 5.6 / 6 | private preview, rate not found | | | | ANY_REGION | — |
| gemini-3.x | rate not found | | | 1M/64K | ANY_REGION only | — |
| llama3.1-405b | 1.20 | 1.20 | 2.40/2.40 | 128K | — | M |
| llama3.3-70b | 0.36 | 0.36 | 0.72/0.72 | 128K | AZURE_US/EU | M |
| llama3.1-70b / 8b | 0.36 / 0.11 | same | — | 128K | native in E2 and WE | M |
| llama4-maverick / scout | 0.12/0.09 | 0.49/0.33 | — | 128K | ANY_REGION | M |
| mistral-large2 (legacy) | 1.00 | 3.00 | 2.00/6.00 | 128K | native in E2 and WE | M |
| mixtral-8x7b / mistral-7b | 0.23/0.08 | 0.35/0.10 | — | 32K | native in E2 and WE | M |
| snowflake-llama-3.3-70b / 3.1-405b | 0.29/0.96 | same | — | — | supports provisioned throughput | M |
| deepseek-r1, snowflake-arctic | likely retired | | | | | M |

Native models in West Europe: llama3.1-8b/70b, mistral-large2, mixtral-8x7b, mistral-7b only.

### REST API (Tables 6(b)/(c), USD per 1M tokens, H)
| Model | Input | Cache read | Output |
|---|---|---|---|
| Claude Sonnet 4.5/4.6 | 3.00 | 0.30 | 15.00 |
| Claude Haiku 4.5 | 1.00 | 0.10 | 5.00 |
| Claude Opus 4.5/4.6 | 5.00 | 0.50 | 25.00 |
| GPT-5 | 1.25 | 0.13 | 10.00 |
| GPT-5.2 | 1.75 | 0.18 | 14.00 |
| GPT-5.4 | 2.50 | 0.25 | 15.00 |
| GPT-4.1 | 2.00 | 0.50 | 8.00 |
| llama3.3-70b | 0.72 | — | 0.72 |
| mistral-large2 | 2.00 | — | 6.00 |

The REST API is about 10% cheaper than AI_COMPLETE for Claude and GPT. Cache reads are billed at 10% of input, and only when the cached portion is 1,024 tokens or more.

## 3. Other AI SQL functions (AI Credits per 1M tokens unless noted; M)
| Function | Rate | Notes |
|---|---|---|
| AI_CLASSIFY / AI_FILTER (text) | 1.39 | hidden prompt; labels re-billed per row |
| AI_AGG / AI_SUMMARIZE_AGG | 1.60 | |
| AI_SENTIMENT / ENTITY_SENTIMENT | 1.60 | |
| SENTIMENT (legacy) / EXTRACT_ANSWER | 0.08 | |
| AI_EXTRACT | 5.00 (older 2.55) | each document page = 970 input tokens |
| AI_TRANSLATE | 1.50 | |
| SUMMARIZE (legacy) | 0.10 | |
| AI_REDACT | 0.63 | |
| AI_SIMILARITY | embedding model rate | |
| AI_COUNT_TOKENS | 0 (warehouse only) | |
| Cortex Guard | 0.25 | applied to AI_COMPLETE output tokens |

### Embeddings (input only)
| Model | Dims | cr/1M |
|---|---|---|
| e5-base-v2, arctic-embed-m(-v1.5) | 768 | 0.03 |
| arctic-embed-l-v2.0 (+8k), multilingual-e5-large | 1024 | 0.05 |
| voyage-multilingual-2 | 1024 | 0.07 |

### AI_PARSE_DOCUMENT (AI Credits per 1,000 pages)
- **LAYOUT: 3.33** (≈ $6.66 per 1K pages). **OCR: 0.50** (≈ $1.00 per 1K pages).
- Page counting: one per PDF or DOCX page; one per image file; one per 3,000 characters of HTML or TXT.
- Conflict: one blog quotes "$0.04/page" (L). Verify.

### AI_TRANSCRIBE (H)
50 tokens per second, with a 10-second minimum per file. Since 2026-06-01 the target effective price is **$0.35 per audio hour** (≈0.175 credits per hour). Native in East US 2; not native in West Europe.

## 4. Cortex Search (H)
- **Serving:** **6.3 AI Credits per GB-month** of uncompressed indexed data. It is charged while the service is resumed, even with no queries.
  - Example: 10M rows × (768 × 4 + 1,000 bytes) ≈ 256.5 credits per month.
- **Embedding:** charged per token on every insert or update. A schema change triggers a full refresh.
- **Warehouse:** used for refreshes (MEDIUM or LARGE). There is no per-query fee.
- **Batch Search:** priced per GB-hour (rate not found).

## 5. Analyst, Agents, Code, Fine-tuning, provisioned throughput
- **Cortex Analyst (direct API):** 67 Platform Credits per 1,000 messages, about $0.20 per message on Enterprise (M). Only HTTP 200 responses are billed. Generated SQL adds warehouse cost.
- **Analyst via Agents:** billed per token. Example: Sonnet 4.5 3.45 / 17.26 credits per 1M tokens (L-M).
- **Cortex Agents / CoWork:** orchestration tokens (rate depends on the model; per-model rates not found) plus tool costs (Analyst, Search, warehouse, web search, code execution). The Snowflake-Labs dashboard assumes a 30% premium.
- **Cortex Code (Table 6(g)):** per 1M tokens, in / cache write / cache read / out. Opus 4.5/4.6: 2.75 / 3.44 / 0.28 / 13.75. Sonnet 4.5/4.6: 1.65 / 2.07 / 0.17 / 8.25.
- **Fine-tuning:** Platform Credits. Billed tokens = training tokens × epochs (rates not found). Inference on the fine-tuned model is billed at AI_COMPLETE rates.
- **Provisioned throughput:** credits per PTU-hour on a monthly term (rate not found). Minimum and increment: llama3.1-8b 64/32, 70b 128/64, 405b 512/256, mistral-large2 256/128.
- **Unverified:** an update to the Consumption Table effective 2026-08-10, and "promotional pricing +50% on 2026-09-01" for some features.

## 6. Observability and evaluation
There is no separate SKU. Cost is LLM-judge calls through AI_COMPLETE at the judge model's token rate, plus warehouse and storage for events. As a rough guide, 100 samples × 4 judges ≈ $2–5 (L).

## 7. Token counting
- Snowflake counts tokens with each model's own tokenizer.
- AI_COUNT_TOKENS returns an estimate of input tokens only. It is near-exact for OpenAI models and within 3% for Claude and Gemini.
- Actual billed usage is in `CORTEX_AI_FUNCTIONS_USAGE_HISTORY`, `CORTEX_REST_API_USAGE_HISTORY` and `METERING_DAILY_HISTORY`.

## 8. Machine-readable sources
| Source | URL | Notes |
|---|---|---|
| Consumption Table PDF (authoritative) | `https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf` | Stable URL, updated in place. Table 6 = AI. |
| Parse recipe | `jordandhill/CortexCodeCostTracking` | AI_PARSE_DOCUMENT LAYOUT on the PDF, then split the pipe-delimited rows |
| Docs | `docs.snowflake.com/en/user-guide/snowflake-cortex/{pricing, aisql-cost, aisql-regional-availability, cross-region-inference, cortex-search/cortex-search-costs, ...}` | availability matrix |
| Docs mirror | `raw.githubusercontent.com/szeno/snowflake-docs/main/markdown/en/...` | easy to diff |
| Snowflake-Labs seeds | `sfquickstarts/.../ai-cost-dashboard/assets/setup.sql` | "example rates" |
| LiteLLM | `snowflake/*` keys | partial |
| In-account | `RATE_SHEET_DAILY`, `USAGE_IN_CURRENCY_DAILY`, `SHOW CORTEX BASE MODELS` | effective negotiated $/credit |

## 9. Defaults for Azure-hosted Snowflake
1. AI Credit price (P_ai): $2.00 with ANY_REGION, which Claude and Gemini require from Azure. $2.20 for AZURE_US / AZURE_EU.
2. Platform Credit price: East US 2 Enterprise is $3.00.
3. Add a MEDIUM warehouse (4 credits per hour) for batch AI SQL.
4. Treat Cortex Search serving as a fixed monthly cost: 6.3 × GB indexed.
5. Verify against the PDF: Agents orchestration rates, Claude 5.x / Gemini rates, fine-tuning, provisioned throughput, Batch Search, the AI_PARSE_DOCUMENT conflict, and the 2026-09-01 change.
