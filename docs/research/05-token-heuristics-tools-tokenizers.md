# Token conversion heuristics, existing calculators, browser tokenizers (as of 2026-10-02)

Evidence: **[Doc]** vendor docs · **[Meas]** measured in the research session with gpt-tokenizer 4.0.0 (o200k/cl100k) and @anthropic-ai/tokenizer 0.0.4 · **[Est]** estimate.
platform.openai.com, ai.google.dev, learn.microsoft.com, arxiv.org were blocked; those figures come from search extracts.

## A1. Tokens per word / char (English)
| Tokenizer | Tokens/word | Chars/token | Source |
|---|---|---|---|
| o200k_base (GPT-4o, 4.1, 5.x, o-series) | 1.08 business email; 1.3 rule of thumb | 5.4 prose; 4.2 markdown; 4.2 JS | [Meas] |
| cl100k_base | ≈ o200k for English | ≈ o200k | [Meas] |
| Claude legacy (≈ Claude 3–4.6) | ~1.0× o200k prose; 1.14–1.18× markdown/code | — | [Meas] |
| Claude 4.7+ (Opus 4.8, 5, 5.5, Sonnet 5, Fable) | ~1.3× earlier Claude | — | [Doc] "~30% more"; OpenRouter measured +32–45% |
| Gemini | 1.25–1.67 (100 tokens ≈ 60–80 words) | ~4 | [Doc] |

**Recommended `tokenizerFamily` multipliers vs o200k:** OpenAI 1.00 · Gemini 1.00 · Claude ≤4.6 1.10 · Claude ≥4.7 1.35.

By content (o200k): legal 1.43 tok/word; markdown 1.88; JS code 2.54; CSV 1.93 chars/token; JSON 2.28 chars/token.

## A2. Language multipliers (ratio to English) [Meas]
| Language | o200k | cl100k | Legacy Claude | Default |
|---|---|---|---|---|
| Spanish | 1.17 | 1.41 | 1.61 | 1.2 |
| German | 1.24 | 1.58 | 1.79 | 1.25 |
| French | 1.29 | 1.53 | 1.81 | 1.3 |
| Russian | 1.33 | 2.51 | 2.79 | 1.35 |
| Hindi | 1.39 | 5.01 | 5.52 | 1.4 |
| Japanese | 1.54 | 2.26 | 2.34 | 1.5 |
| Chinese | 0.96 | 1.53 | 1.45 | 1.0 |
| Arabic | 1.13 | 2.97 | 3.83 | 1.2 |
| Korean | 1.19 | 2.22 | 2.37 | 1.2 |

Small sample, noisy. For Claude non-Latin scripts use count_tokens. CJK: input characters (~1.45 chars/token o200k).

## A3. Words / tokens per page
| Page type | Words | o200k tokens |
|---|---|---|
| Plain text (12pt single-spaced) | 500 | ~650 |
| Double-spaced | 250 | ~325 |
| Dense PDF (contracts, 2-col papers) | 700 (600–1,000) | ~900–1,300 |
| Slide | 40 (25–100) | ~50–130 |
| Spreadsheet page (~50×8) | — | ~1,500–2,000 as CSV |
| Scanned | as source | text after OCR, or image tokens |

Table serialization overhead (same table): TSV/CSV 1.00× · Markdown 1.21× · HTML 2.08× · JSON 2.43×.
Document Intelligence Layout markdown (tables as HTML, PageBreak comments): overhead prose 1.05–1.10, table-heavy 1.5–2.0, **default 1.15**.

## A4. Image / page-as-image tokens
**OpenAI tile models** (fit 2048², short side 768, 512-px tiles): gpt-4o/4.1 base 85 + 170/tile; gpt-5 70 + 140; o1/o3 75 + 150; gpt-4o-mini 2,833 + 5,667 (priced to match). Low detail = base.
**OpenAI patch models** (gpt-4.1-mini/nano, o4-mini, gpt-5-mini/nano, gpt-5.2+): `ceil(w/32)·ceil(h/32)` capped at patch budget (1,536 for mini/nano) × multiplier (4.1-mini 1.62, 4.1-nano 2.46, o4-mini 1.72). Flagship budgets reportedly up to 6,144 — verify.
**Claude:** `ceil(w/28)·ceil(h/28)`; standard tier cap 1568 px / 1,568 tokens; 4.7+ high-res cap 2576 px / 4,784.
**Gemini 2.x:** 258 per ≤384px image or per 768² tile; PDF page 258. **Gemini 3:** media_resolution low/med/high 280/560/1,120 (image default 1,120, PDF default 560).

Letter page at 150 DPI (1275×1650):
| Model | Tokens/page |
|---|---|
| GPT-4o/4.1 high | 765 |
| GPT-4o/4.1 low | 85 |
| gpt-5 high | 630 |
| o3 | 675 |
| gpt-4.1-mini | ~2,480 |
| Claude standard | ~1,560 |
| Claude 4.7+ | 2,714 (200 DPI ~4,780) |
| Gemini 2.x | 258 |
| Gemini 3 PDF default | 560 |

PDF direct: OpenAI text + image ≈ 1,400/page (≤100 pages, 32 MB) · Claude ≈ 2,300/page (1,500–3,000; 3,000–3,500 on 4.7+) · Gemini 3 ≈ 560 + text.

## A5. Email
| Parameter | Value | Source |
|---|---|---|
| Business emails received / user / day | 121 (sent ~40) | Radicati |
| Body length | 143.5 words avg (EnronSent); 50–125 ideal | EnronSent, Boomerang |
| Thread length | mostly <3 messages; support ~8 | weak |
| % with attachments | 24.5% | Enron corpus (arXiv 1709.00362) |
| Attachments per email with attachments | 1.5 (1–3) | [Est] |
| Pages per attachment | 5 (1–20) | [Est] |
| Attachment size | ~500 KB | search |
| Header/signature/disclaimer | 50–150 tokens | [Est] |

Quoted reply history → quadratic growth; offer "dedupe quoted text". Forwarded attachments → dedupe-by-hash factor default 0.7.

## A6. Speech / meetings
| Parameter | Value |
|---|---|
| Conversational rate | 196 wpm telephone (Yuan & Liberman 2006) |
| Meeting rate incl. silences | **140 wpm** default (120–170) |
| Transcript tokens per hour | 8,400 words ≈ **11,000 tokens** (9k–16k) |
| Diarization overhead | `Name:` +15%; `[hh:mm:ss] Speaker 2:` +35%; WebVTT +75% |
| OpenAI realtime audio tokens | input 10/s (36k/hr); output 20/s |
| Gemini audio | 32 tokens/s (115,200/hr); video 263/s |
| Meeting summary output | 500 (200–1,500); action items 150–300 |

## A7. Chat, RAG, agents, reasoning
| Parameter | Default | Range | Source |
|---|---|---|---|
| User turn | 100 | 50–300 | LMSYS-Chat-1M avg 69.5 |
| Assistant turn | 350 | 200–800 | LMSYS 214.5 + enterprise est |
| Turns / conversation | 4 | 2–10 | LMSYS 2.0 |
| System prompt | 500 | 150–3,000 | [Est] |
| RAG template overhead | 100 | 50–200 | [Meas] |
| Chunk size | 512 | 256–1,024 | Azure AI Search guidance |
| Chunk overlap | 25% | 0–25% | Azure (512/25% best Recall@50) |
| Top-k | 5 | 3–10 | [Est] |
| Chunks | corpus_tokens / (chunk × (1 − overlap)) | | formula |
| Tokens per tool schema | 150 | 50–500 | [Est] |
| Simple agent tool calls/task | 5 | 3–15 | [Est] |
| Coding agent | 30–80 turns | | SWE-bench extracts |
| Reasoning tokens low/med/high | 300 / 1,500 / 6,000 | 0–30k | community |
| LLM-as-judge per item | 3,000 in / 400 out | | [Est] |
| Red-team probe | 650 in / 300 out; multi-turn ×3–5 | | blog |

## A8. Embedding storage
| Model | Dims | float32 B | int8 B | binary B |
|---|---|---|---|---|
| text-embedding-3-small / ada-002 | 1,536 | 6,144 | 1,536 | 192 |
| text-embedding-3-large | 3,072 (MRL ≥256) | 12,288 | 3,072 | 384 |
| gemini-embedding | 3,072 | 12,288 | — | — |
| Cohere embed v4 | 1,536 (256–1,536) | 6,144 | — | — |
| Voyage 3.x | 1,024 | 4,096 | — | — |

## B. Existing calculators
| Tool | Strength | Weakness | Data |
|---|---|---|---|
| Azure Pricing Calculator | official, region/SKU aware | manual token entry, no workload model, services not linked | Retail Prices API |
| OpenAI Tokenizer | exact OpenAI counts | no cost | tiktoken |
| tiktokenizer | in-browser, chat overhead | OpenAI only | js-tiktoken |
| llm-prices.com | clean, JSON API | per-call only, no Azure | curated repo |
| Helicone cost | 300+ models, OSS | per-token only | OSS repo |
| Artificial Analysis | price + benchmarks | not a calculator | own |
| DocsBot | monthly costs | chat only | curated |
| PricePerToken | 687+ models, daily | no scenarios | APIs + OpenRouter |
| Vellum | benchmarks + price | static | curated |
| tokencost (Python) | 400+ models | library | own JSON |
| RAG calculators | embed + vector DB + LLM | no OCR, multimodal, eval, red-team, Azure SKUs | hardcoded |

**Gap confirmed:** no tool chains source mix → OCR → page-image tokens → chunk/embed → AI Search SKU → query traffic with history growth → agent loops + reasoning → eval + red team → cache/batch/regional modifiers.

### LiteLLM `model_prices_and_context_window.json`
4,453 entries, 216 fields; flat object keyed by model string. Core: `litellm_provider`, `mode`, `input_cost_per_token`, `output_cost_per_token`, `max_input_tokens`, `max_output_tokens`, `source`, `deprecation_date`, `supports_*`. Variants: cache read/creation (+1h), `*_batches`, `*_priority`, `*_flex`, `*_above_200k_tokens`, `*_above_272k_tokens`, audio/image/second/character costs, `ocr_cost_per_page`, `input_cost_per_query`, `tiered_pricing`, regional uplift multipliers, `output_vector_size`.
Azure: 308 `azure/` keys (150 flat, 61 `azure/us/`, 57 `azure/eu/`, 5 `azure/global/`), 141 `azure_ai/` keys (Claude, Mistral, Cohere, DI read/layout, rerank, speech).
Gaps: no AI Search SKUs, no storage, no PTU, null vector size for azure/, no image-token formulas.
URL: `raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` (~3 MB) — fetch at build time, prune.

## C. Browser tokenizers
| Option | Payload (raw/gzip) | Notes |
|---|---|---|
| **gpt-tokenizer 4.0.0** | o200k 2.43/1.04 MB; cl100k 1.16/0.45 MB | Pure JS, per-encoding imports, `countTokens`, `encodeChat`; fastest. **Recommended.** |
| js-tiktoken 1.0.21 | o200k 2.33/1.13 MB | `lite` + lazy ranks; ~5× slower |
| tiktoken (WASM) | 5.6/2.5 MB | heavy in browser |
| @anthropic-ai/tokenizer 0.0.4 | 0.70/0.31 MB | **Outdated** since Claude 3 — do not use |
| Anthropic `count_tokens` | — | exact, free, needs key → server route |
| Gemini `countTokens` | — | exact, needs key → server route |

Approach: lazy-load gpt-tokenizer o200k for base counts; apply family multipliers; optional "exact count" server routes for Claude/Gemini; image tokens via formulas.

## Verify before shipping
1. OpenAI patch budgets/multipliers for gpt-5.x flagships.
2. Gemini 3 native PDF text billing.
