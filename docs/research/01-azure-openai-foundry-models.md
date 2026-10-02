# Azure OpenAI / Foundry "Models sold directly by Azure" pricing (verified 2026-10-02)

## 0. Provenance
`prices.azure.com`, `azure.microsoft.com` and `learn.microsoft.com` were blocked (403) from the research container, so **no prices below come from a live Retail Prices API response.**

| Tag | Source | Trust |
|---|---|---|
| **[D]** | `MicrosoftDocs/azure-ai-docs` HEAD 2026-10-02 (`models-azure-direct-openai.md` ms.date 09/21/2026, `models-azure-direct-others.md`, `how-to-provisioned-throughput-sizing.md`, `faq.yml`) | First-party: models, context windows, PTU min/increments, TPM/PTU, output:input ratios, GPT-6/6.1 prices, Retail API conventions |
| **[L]** | LiteLLM `model_prices_and_context_window.json` (`azure/*`, `azure_ai/*`) | Community mirror of Retail API (`serviceName eq 'Foundry Models' and armRegionName eq 'eastus'`) |
| **[P]** | `ricmmartins/azureptucalc` (2026-09-18) | Third-party PTU calculator using live Retail API |
| **[W]** | WebSearch snippets | Snippets only |

Confidence: **V** first-party · **C** [L] + independent source agree · **S** [L] only · **U** unverified/conflicting.

All prices USD per 1M tokens, Global Standard, unless noted.

## 1. Deployment-type rules (multipliers)
| Rule | Value | Evidence |
|---|---|---|
| Data Zone (US/EU) vs Global | ×1.10 all token types. **Exception: GPT-6 EU Data Zone ×1.20** | [D] FAQ, [L], [W] |
| Regional vs Global | +10–25%, region-dependent (gpt-4o-1120 input: Global 2.50, eastus 2.75, swedencentral 3.00) | [D] |
| Batch | −50% incl. long-context | [L] |
| Priority processing | Global + US DZ only. Usually ×2.0; gpt-5.5 ×2.5; gpt-4.1/4.1-mini ×1.75; gpt-5-mini ×1.8; none for nano/pro | [L] |
| Flex | ×0.5 (gpt-5.4 family, 5.5, 5.6) | [L] |
| Long context | **>272K input tokens in a single request** (gpt-5.4, 5.4-pro, 5.5, 5.5-pro, 5.6-*, 6-*, 6.1-*); whole request (incl. output) billed at LC rate | [D], [L] |
| Cache write | ×1.25 input; billed separately on gpt-5.6-* and gpt-6* | [D], [L] |
| Fine-tuned hosting | $1.70/hr; tokens at base rate; RFT capped $5,000/job | [D] |

## 2. GPT text & reasoning models (Global Standard)
| Model (version) | Input | Cached | Output | LC in/cached/out | Batch in/cached/out | Priority in/cached/out | Data Zone in/out | Conf. |
|---|---|---|---|---|---|---|---|---|
| gpt-6.1-sol (2026-09-29) | 2.00 | 0.10 | 10.00 | 4.00/0.20/15.00; cache write 2.50 (LC 5.00) | – | – | n/a | V |
| gpt-6-astra (2026-09-03) | 10.00 | 1.00 | 50.00 | 20.00/2.00/75.00; cache write 12.50 | – | – | US 11/55; EU 12/60 | V |
| gpt-6-sol (2026-09-22) | 2.00 | 0.20 | 10.00 | 4.00/0.40/15.00; cache write 2.50 | – | – | US 2.2/11; EU 2.4/12 | V |
| gpt-6-luna (2026-09-22) | 0.10 | 0.01 | 0.50 | 0.20/0.02/0.75; cache write 0.125 | – | – | US 0.11/0.55; EU 0.12/0.60 | C |
| gpt-5.6-sol (2026-07-09) | **5.00 list / 4.00 promo** | 0.50 / 0.40 | **30.00 list / 20.00 promo** | list 10/1.00/45 | flex ×0.5 | ×2 | 5.5/33 list | U (note A) |
| gpt-5.6-terra | 2.00 | 0.20 | 12.00 | 4.00/0.40/18.00; cache write 2.50 | flex 1/6 | 4/0.4/24 | 2.2/13.2 | C |
| gpt-5.6-luna | 0.20 | 0.02 | 1.20 | 0.40/0.04/1.80; cache write 0.25 | flex 0.1/0.6 | 0.4/0.04/2.4 | 0.22/1.32 | C |
| gpt-chat-latest (preview, "GPT-5.5 Instant") | 5.00 | 0.50 | 30.00 | – | – | – | 5.5/33 | S |
| gpt-5.5 (2026-04-24) | 5.00 | 0.50 | 30.00 | 10.00/1.00/45.00 | 2.5/0.25/15 | 12.5/1.25/75 | 5.5/33 | C |
| gpt-5.5-pro | 30.00 | 3.00 | 180.00 | 60/6/270 | – | – | – | U (not in [D]) |
| gpt-5.4 (2026-03-05) | 2.50 | 0.25 | 15.00 | 5.00/0.50/22.50 | 1.25/0.125/7.5 | 5/0.5/30 | 2.75/16.5 | C |
| gpt-5.4-pro | 30.00 | 3.00 | 180.00 | 60/6/270 | 15/–/90 | – | 33/198 | S |
| gpt-5.4-mini (2026-03-17) | 0.75 | 0.075 | 4.50 | – | 0.375/0.0375/2.25 | 1.5/0.15/9 | 0.825/4.95 | C |
| gpt-5.4-nano | 0.20 | 0.02 | 1.25 | – | 0.10/0.01/0.625 | – | 0.22/1.375 | S |
| gpt-5.3-codex (2026-02-24) | 1.75 | 0.175 | 14.00 | – | – | 3.5/0.35/28 | 1.925/15.4 | C |
| gpt-5.2 (2025-12-11) | 1.75 | 0.175 | 14.00 | – | 0.875/0.0875/7 | 3.5/0.35/28 | 1.925/15.4 | C |
| gpt-5.2-codex | 1.75 | 0.175 | 14.00 | – | – | – | 1.925/15.4 | C |
| gpt-5.2-pro | 21.00 | – | 168.00 | – | 10.5/–/84 | – | 23.1/184.8 | U |
| gpt-5.1 (2025-11-13) | 1.25 | 0.125 | 10.00 | – | 0.625/0.0625/5 | 2.5/0.25/20 | 1.375/11 | C |
| gpt-5.1-codex / -codex-max | 1.25 | 0.125 | 10.00 | – | – | – | 1.375/11 | C |
| gpt-5.1-codex-mini | 0.25 | 0.025 | 2.00 | – | – | – | 0.275/2.2 | S |
| gpt-5 (2025-08-07) | 1.25 | 0.125 | 10.00 | – | 0.625/0.0625/5 | 2.5/0.25/20 | 1.375/11 | C |
| gpt-5-mini | 0.25 | 0.025 | 2.00 | – | 0.125/0.0125/1 | 0.45/0.045/3.6 | 0.275/2.2 | C |
| gpt-5-nano | 0.05 | 0.005 | 0.40 | – | 0.025/0.0025/0.2 | – | 0.055/0.44 | S |
| gpt-5-codex | 1.25 | 0.125 | 10.00 | – | – | – | 1.375/11 | S |
| gpt-5-pro | 15.00 | – | 120.00 | – | 7.5/–/60 | – | 16.5/132 | S |
| gpt-5-chat / 5.1-chat / 5.2-chat / 5.3-chat | **RETIRED** (May/June 2026) | | | | | | | V |
| gpt-4.1 | 2.00 | 0.50 | 8.00 | – | 1.0/–/4.0 | 3.5/0.875/14 | 2.2/8.8 | C |
| gpt-4.1-mini | 0.40 | 0.10 | 1.60 | – | 0.2/–/0.8 | 0.7/0.175/2.8 | 0.44/1.76 | C |
| gpt-4.1-nano | 0.10 | 0.025 | 0.40 | – | 0.05/–/0.2 | – | 0.11/0.44 | C |
| gpt-4o (2024-11-20/08-06) | 2.50 | 1.25 | 10.00 | – | ~1.25/5 | – | 2.75/11 | V/C |
| gpt-4o-mini | 0.15 | 0.075 | 0.60 | – | – | – | – | C |
| o3 | 2.00 | 0.50 | 8.00 | – | – | – | – | C |
| o4-mini | 1.10 | 0.275 | 4.40 | – | – | – | – | C |
| o3-pro | 20.00 | – | 80.00 | – | 10/–/40 | – | – | S |
| o3-mini | 1.10 | 0.55 | 4.40 | – | – | – | – | S |
| o1 | 15.00 | 7.50 | 60.00 | – | – | – | – | S |
| o3-deep-research (Agent Service) | 10.00 | 2.50 | 40.00 | – | – | – | 11/44 | S |
| codex-mini | 1.50 | 0.375 | 6.00 | – | – | – | 1.65/6.6 | S |
| computer-use-preview | 3.00 | – | 12.00 | – | – | – | 3.3/13.2 | S |
| gpt-oss-120b | 0.15 | – | 0.60 | – | – | – | – | S |
| gpt-oss-20b | managed compute / Foundry Local only | | | | | | | V |
| model-router | $0.14/1M input router fee **plus** routed model's charges | | | | | | | S |

**Note A — GPT-5.6 Sol:** Azure blog: list $5/$30; promo $4/$20 from 2026-09-01 to at least 2026-11-30. LiteLLM stores promo; Retail API meters (per [P] fixtures) show list (5 / 30 / LC 10 / cache write 6.25 / priority output 60 / DZ 5.5/33). PTU ratio 6 matches $5/$30. **Store list price and apply a dated promo override.**

**GPT-6 notes:** normalized-token PTU accounting (weight = price ÷ short-context input price). Some quota tiers need a quota request for gpt-5.5/5.6/6.

**Model inventory [D] 2026-09-21:** GPT-6.1 (sol); GPT-6 (astra, luna, sol); GPT-5.6 (sol, terra, luna); GPT-5.5; GPT-5.4 (base, pro, mini, nano); GPT-5.3-codex; GPT-5.2 (base, codex); GPT-5.1 (base, codex, codex-mini, codex-max); GPT-5 (base, mini, nano, codex, pro); gpt-chat-latest; GPT-4.1 family; o-series; gpt-4o/4o-mini; gpt-4 turbo-2024-04-09.

**Context windows [D]:** gpt-5.4/5.4-pro/5.5/5.6/6.x: 1.05M (922K in / 128K out). gpt-5 → 5.3 and 5.4-mini/nano: 400K (272K in / 128K out). gpt-4.1: ~1M (300K on standard deployments, 128K on PTU/batch).

## 3. Provisioned throughput (PTU)
| Deployment type | $/PTU/hr | 1-month reservation | 1-year reservation | Conf. |
|---|---|---|---|---|
| Global Provisioned | 1.00 | $260 | $2,652 (~$221/mo) | C |
| Data Zone Provisioned | 1.10 | $286 (conflict: $260) | $2,916 (conflict) | U |
| Regional Provisioned | 2.00 | $286 | $2,916 | U |

Billed hourly per deployed PTU from creation to deletion regardless of usage. Global hourly ≈ $730/PTU-month → monthly reservation ≈ 64% off, yearly ≈ 70% off.

| Model | Global/DZ min / incr | Regional min / incr | Input TPM per PTU | Output:input ratio |
|---|---|---|---|---|
| gpt-6.1-sol, gpt-6-sol | 15 / 5 | 50 / 50 | 3,000 (normalized) | normalized |
| gpt-6-astra | 15 / 5 | 50 / 50 | 600 (normalized) | normalized |
| gpt-5.6-luna | 15 / 5 | 50 / 50 | 30,000 | 6 |
| gpt-5.6-terra | 15 / 5 | 50 / 50 | 3,000 | 6 |
| gpt-5.6-sol, gpt-5.5 | 15 / 5 | 50 / 50 | 1,200 | 6 |
| gpt-image-2 | 100 / 100 | 100 / 100 | 1,200 | image |
| gpt-5.4 | 15 / 5 | 50 / 50 | 2,400 | 6 |
| gpt-5.4-mini | 15 / 5 | 25 / 25 | 7,900 | 6 |
| gpt-5.3-codex, 5.2, 5.2-codex | 15 / 5 | 50 / 50 | 3,400 | 8 |
| gpt-5.1, 5.1-codex, gpt-5 | 15 / 5 | 50 / 50 | 4,750 | 8 |
| gpt-5-mini | 15 / 5 | 25 / 25 | 23,750 | 8 |
| gpt-4.1 | 15 / 5 | 50 / 50 | 3,000 | 4 |
| gpt-4.1-mini | 15 / 5 | 25 / 25 | 14,900 | 4 |
| gpt-4.1-nano | 15 / 5 | 25 / 25 | 59,400 | 4 |
| o3 | 15 / 5 | 50 / 50 | 3,000 | 4 |
| o4-mini | 15 / 5 | 25 / 25 | 5,400 | 4 |
| gpt-4o | 15 / 5 | 50 / 50 | 2,500 | 4 |
| gpt-4o-mini | 15 / 5 | 25 / 25 | 37,000 | 4 |
| o3-mini | 15 / 5 | 25 / 25 | 2,500 | 4 |
| o1 | 15 / 5 | 25 / 50 | 230 | 4 |
| Llama-3.3-70B-Instruct | 100 / 100 | n/a | 8,450 | 4 |

Sizing: `PTU = ceil((inputTPM + outputTPM × ratio − cachedInputTPM) / TPMperPTU)` → round up to min & increment. GPT-6+: use normalized weights.

## 4. Embeddings
| Model | Global $/1M | Data Zone | Dims | Max input |
|---|---|---|---|---|
| text-embedding-3-small | 0.02 | 0.022 | 1,536 (reducible) | 8,192 |
| text-embedding-3-large | 0.13 | 0.143 | 3,072 (reducible) | 8,192 |
| text-embedding-ada-002 v2 | 0.10 | 0.11 | 1,536 | 8,192 |
| Cohere embed-v-4-0 | 0.12 text; 0.47 image | – | 256/512/1024/1536 | conflict |

Max 2,048 inputs per call.

## 5. Audio
Token-billed ($/1M):
| Model | Text in/cached/out | Audio in/cached/out | Conf. |
|---|---|---|---|
| gpt-realtime, gpt-realtime-1.5 | 4.00/0.40/16.00 | 32.00/0.40/64.00 | S |
| gpt-realtime-2, gpt-realtime-2.1 | 4.00/0.40/24.00 | 32.00/0.40/64.00 | C |
| gpt-realtime-mini, gpt-realtime-2.1-mini | 0.60/0.06/2.40 | 10.00/0.30/20.00 | C |
| gpt-audio, gpt-audio-1.5 | 2.50/–/10.00 | 40.00/–/80.00 | C |
| gpt-audio-mini | 0.60/–/2.40 | 10.00/–/20.00 | S |
| gpt-4o-mini-tts | 0.60 text in | 12.00 audio out (~$0.015/min) | S |
| gpt-4o-transcribe / -diarize | 2.50 in / 10.00 out | audio in 2.50 [L] vs 6.00 OpenAI direct | U |
| gpt-4o-mini-transcribe | 1.25 / 5.00 | audio in 3.00 | S |

Duration/character-billed:
| Model | Price |
|---|---|
| whisper | $0.36/hr (deprecation 2026-12-15) |
| gpt-transcribe | $0.27/hr |
| gpt-realtime-whisper, gpt-live-transcribe | $1.02/hr |
| gpt-realtime-translate | $2.04/hr |
| gpt-live-1 | $3.00/hr |
| tts / tts-hd | $15 / $30 per 1M chars (deprecation 2026-12-15) |

Audio tokens per minute (estimate): ~600 tokens/min input audio, ~1,200 tokens/min generated speech.

## 6. Image & video
| Model | Text in (cached) | Image in | Image out | Note |
|---|---|---|---|---|
| gpt-image-1 | 5.00 (1.25) | 10.00 | 40.00 | deprecating 2026-10-23 |
| gpt-image-1-mini | 2.00 (0.20) | 2.50 | 8.00 | |
| gpt-image-1.5 | 5.00 (1.25) | 8.00 | 32.00 | |
| gpt-image-2 | 5.00 (1.25) | 8.00 | 30.00 | PTU min 100; ~$0.006/$0.053/$0.211 per 1024² low/med/high |

Per-image 1024²: gpt-image-1 $0.011/$0.042/$0.167; gpt-image-1-mini $0.002/$0.008/$0.033; dall-e-3 std $0.04 (1792: $0.08), HD $0.08 ($0.12).
Video: sora-2 $0.10/sec (deprecation 2026-10-15 per [L]); sora-2-pro $0.30/s 720p, $0.50/s 1080p (U).

## 7. Other Foundry models sold directly by Azure
| Family | Model | In / cached / out (per 1M or unit) | Conf. |
|---|---|---|---|
| DeepSeek | V4-Pro | 1.74 / 0.145 / 3.48 | C |
| | V4-Flash | 0.19 / 0.028 / 0.51 | C |
| | V3.2 / V3.2-Speciale | 0.58 / – / 1.68 | S |
| | MAI-DS-R1 | retired | U |
| xAI | grok-4.6 (preview) | 1.25 / 0.50 / 6.00 | S |
| | grok-4.3 | 1.25 / 0.20 / 2.50 | S |
| | grok-4.1-fast | 0.20 / – / 0.50 | S |
| | grok-4 | 3.00 / – / 15.00 | S |
| | grok-code-fast-1 | 0.20 / – / 1.50 | S |
| Meta | Llama-4-Maverick | 0.25 / – / 1.00 | S |
| | Llama-3.3-70B | 0.71 / – / 0.71 | S |
| Mistral | Mistral-Large-3 | 0.50 / – / 1.50 | S |
| | mistral-medium-3-5 | 1.50 / – / 7.50 | S |
| | mistral-document-ai-2512 | $3 / 1,000 pages | S |
| | mistral-ocr-4-0 | $4 / 1,000 pages (+$5 annotation) | S |
| Cohere | command-a | 2.50 / – / 10.00 | S |
| | command-a-plus-05-2026 | 0.80 / – / 3.20 | S |
| | rerank-v4.0-pro / fast | $2.50 / $2.00 per 1K queries | S |
| | Cohere-parse-v5 | $1.50 / 1,000 pages | S |
| Moonshot | Kimi-K2.5 / K2.6 / K2.7-Code | 0.60/0.10/3.00; 0.95/0.16/4.00; 0.95/0.19/4.00 | S |
| Microsoft MAI | MAI-Thinking-1 | 2.00 / 0.20 / 8.00 | S |
| | MAI-Image-2.5 / Flash / Pro / 2.6 / 2.6-Flash | see report 03 | S |
| | MAI-Transcribe-2 | $0.10/hr promo to 2026-12-31 | W |
| | MAI-Voice-* | $15–22 / 1M chars | W |
| Black Forest Labs | FLUX 1.1 pro / Kontext / 2-pro | $0.04/image | S |
| | FLUX.2-flex | $0.05/megapixel | S |
| Phi | Phi-4 family | ~0.075–0.125 / 0.30–0.50 (no longer "direct") | U |

## 8. Retail Prices API sync guidance (untested — host blocked here)
- Endpoint: `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&$filter=...`, no auth, follow `NextPageLink`.
- serviceName `'Foundry Models'` for current models. productName `'Azure OpenAI'` / `'Azure OpenAI GPT5'` → filter with `contains(productName,'OpenAI')`. PTU reservations: `contains(productName,'Foundry Provisioned Throughput Reservation')`, `type eq 'Reservation'`, `reservationTerm` `'1 Month'`/`'1 Year'`.
- Filters:
  1. `serviceName eq 'Foundry Models' and priceType eq 'Consumption'` (+ `armRegionName`).
  2. `productName eq 'Azure OpenAI' and priceType eq 'Consumption' and contains(skuName,'gpt 4o 1120')`.
  3. PTU: `contains(productName,'OpenAI') and contains(meterName,'Provisioned Managed')`.
- Naming is inconsistent — normalize with regex:
  - model: `gpt 4o 1120`, `gpt 4.1`, `GPT 5`, `GPT 5.6 Sol`
  - input: `Inp|inp|inpt|Input|prompt`; output: `opt|outpt|output|Outp|completion`; cached: `cached|cd|cchd`; cache write: `cache writes`
  - deployment: Global `Gl|Glbl|global`; `Data Zone|DZ`; Regional = no marker; `Batch`; `priority`; fine-tune `ft|Dev FT|grdr`
  - context: `short context|long context`
  - examples: `GPT 5.2 chat inp Gl 1M Tokens`, `GPT 5 inpt Glbl`, `GPT 5.6 Sol short context cache writes input Global`, `gpt 4o 0513 Input Data Zone Tokens`
- `unitOfMeasure` mixes `1K` and `1M` — always normalize. Audio/image/video meters use hours/seconds/images/characters.
- Parser rules: skip `retailPrice == 0`; dedupe by `meterId`; respect `effectiveStartDate`; bare `gpt 5` needs negative look-ahead to avoid `5.x`.

## 9. Seed data
`data/litellm_azure_per_1M.csv` (this folder) — LiteLLM azure/* entries flattened to $/1M with LC, batch, priority, flex, audio, per-second and per-image columns.

## Gaps
Live Retail API values; per-region rates; DZ/Regional PTU reservation prices; gpt-4o-transcribe audio rate; GPT-5.6 Sol LC list rates; priority multipliers; whether gpt-5.5-pro, 5.2-pro, sora-2-pro are sold on Azure.
