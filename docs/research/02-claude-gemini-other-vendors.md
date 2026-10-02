# Non-OpenAI frontier model pricing — verified 2026-10-02

Legend: **[V]** fetched official page directly · **[S]** search snippets only (official page blocked by proxy) — re-verify · **[U]** unverified / inference.

Sources: platform.claude.com/docs (pricing, models overview, vision, pdf-support, claude-in-microsoft-foundry) and cloud.google.com/vertex-ai/generative-ai/pricing (also lists Claude, Grok, DeepSeek, Llama, Mistral partner prices).

## 1. Anthropic Claude (first-party API) [V]

USD per 1M tokens.

| Model | API ID | Input | Output | 5m cache write | 1h cache write | Cache read | Batch in/out | Context | Max out |
|---|---|---|---|---|---|---|---|---|---|
| Fable 5.1 | claude-fable-5-1 | 10.00 | 50.00 | 12.50 | 20.00 | 0.25 (0.025x) | 5 / 25 | 1M | 128K |
| Mythos 5.1 (invite-only) | claude-mythos-5-1 | 10.00 | 50.00 | 12.50 | 20.00 | 0.25 | 5 / 25 | 1M | 128K |
| Fable 5 (legacy) | claude-fable-5 | 10.00 | 50.00 | 12.50 | 20.00 | 1.00 | 5 / 25 | 1M | 128K |
| **Opus 5.5** | claude-opus-5-5 | 4.00 | 20.00 | 5.00 | 8.00 | 0.20 (0.05x) | 2 / 10 | 1M | 128K |
| Opus 5 | claude-opus-5 | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 | 2.50 / 12.50 | 1M | 128K |
| Opus 4.8 / 4.7 / 4.6 | claude-opus-4-8/-4-7/-4-6 | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 | 2.50 / 12.50 | 1M | 128K |
| Opus 4.5 | claude-opus-4-5 | 5.00 | 25.00 | 6.25 | 10.00 | 0.50 | 2.50 / 12.50 | 200K [U] | 64K [U] |
| **Sonnet 5.5** | claude-sonnet-5-5 | 2.00 | 10.00 | 2.50 | 4.00 | 0.20 | 1 / 5 | 1M | 128K |
| Sonnet 5 | claude-sonnet-5 | 2.00 | 10.00 | 2.50 | 4.00 | 0.20 | 1 / 5 | 1M | 128K |
| Sonnet 4.6 | claude-sonnet-4-6 | 3.00 | 15.00 | 3.75 | 6.00 | 0.30 | 1.50 / 7.50 | 1M | 128K |
| Sonnet 4.5 (deprecated) | claude-sonnet-4-5 | 3.00 | 15.00 | 3.75 | 6.00 | 0.30 | 1.50 / 7.50 | 200K (1M beta) | 64K [U] |
| **Haiku 4.5** | claude-haiku-4-5 | 1.00 | 5.00 | 1.25 | 2.00 | 0.10 | 0.50 / 2.50 | 200K | 64K |
| Opus 4.1/4; Sonnet 4; Haiku 3.5 | — | 15/75; 3/15; 0.80/4 | | | | | | | |

The last row is retired on first-party but still on Bedrock and/or Vertex.

### Pricing rules
- Sonnet 5 $2/$10 is now the permanent price (planned rise to $3/$15 on 2026-09-01 was cancelled).
- Cache multipliers vs base input: 5m write 1.25x, 1h write 2x, read 0.1x default (0.05x Opus 5.5, 0.025x Fable 5.1/Mythos 5.1). Stack with batch and data residency.
- Batch API: 50% off input and output.
- Long context >200K: no premium on Claude 4.6+. (Sonnet 4.5 on Vertex still lists $6 input >200K.)
- Data residency `inference_geo:"us"` (4.6+): 1.1x all token categories.
- Fast mode (first-party only, no batch): Opus 5.5 $8/$40; Opus 5 & 4.8 $10/$50.
- Minimum cacheable prefix: 512 (Opus 5, Fable); 1024 (Opus 4.8, Sonnet 5, Sonnet 4.6); 2048 (Opus 4.7); 4096 (Opus 4.6/4.5, Haiku 4.5).
- **Tokenizer:** Claude 4.7+ (Opus 4.7/4.8/5/5.5, Sonnet 5/5.5, Fable) produce ~30% more tokens for the same text than Sonnet 4.6 and earlier. Needs a per-model tokenizer multiplier.
- Batch output up to 300K tokens with beta header on Opus 5.5/5/4.8/4.7/4.6 and Sonnet 5.5/5/4.6.

### Tool / feature overheads [V]
Tool-use system prompt (added when ≥1 tool present):

| Model | tool_choice auto/none | any/tool |
|---|---|---|
| Opus 5.5, Sonnet 5.5 | 286 | n/a (forced tool use → 400) |
| Opus 5 | 286 | 406 |
| Opus 4.8 | 290 | 410 |
| Opus 4.7 | 675 | 804 |
| Opus 4.6 / Sonnet 4.6 | 497 | 589 |
| Opus 4.5 / Sonnet 4.5 / Haiku 4.5 | 496 | 588 |
| Sonnet 5 | 354 | 474 |

- Built-in tools: Bash +325 (5/4.8/4.7) / +244 (≤4.6); text editor +700; computer-use ~4,500; browser-use ~6,600.
- Web search: $10 / 1,000 searches + result content as input tokens (in that turn and every later turn).
- Web fetch: tokens only (10 kB page ≈ 2,500 tokens; 500 kB PDF ≈ 125,000).
- Code execution: free with web_search/web_fetch 20260209; else 1,550 free hrs/month/org then $0.05 per container-hour (5-min minimum).
- Managed Agents: token rates + $0.08 per session-hour.

### Token counting (Claude) [V]
- **Images:** `ceil(w/28) × ceil(h/28)`. High-res tier (4.7+): long edge ≤2576 px, cap 4,784 tokens. Standard tier (Haiku 4.5, Sonnet 4.6, Opus ≤4.6): long edge ≤1568 px, cap 1,568. (Old `w·h/750` rule is outdated.)

| Image | Standard | High-res |
|---|---|---|
| 200×200 | 64 | 64 |
| 1000×1000 | 1,296 | 1,296 |
| 1920×1080 | 1,560 | 2,691 |
| 2000×1500 | 1,564 | 3,888 |
| 3840×2160 | 1,560 | 4,784 |

- **PDFs:** text + page image per page. Text 1,500–3,000 tokens/page; image per rule above. Heuristic ~3K–6K tokens/page on 4.7+, ~3K–4.5K older [U]. Limits 32 MB, 600 pages (100 on <1M-context models).
- **Text:** ~4 chars/token (older tokenizer). 4.7+ tokenizer: 1M tokens ≈ 555K words ≈ 2.5M chars.
- **Audio:** no native audio input — must transcribe first.

## 2. Claude on Microsoft Foundry / Bedrock / Vertex

**Microsoft Foundry [V]**
- Same price as Anthropic API (minus negotiated discounts). Billed via Azure Marketplace in Claude Consumption Units (CCU, $0.01 each), hourly metered, monthly invoiced. Cost Management shows one aggregated CCU line.
- Global Standard = list; US Data Zone Standard = 1.1x (Hosted-on-Azure only; Sonnet 5.5 Global only).
- Hosted on Azure: Opus 5.5, Opus 5, Opus 4.8, Sonnet 5.5, Sonnet 5, Haiku 4.5.
- Hosted on Anthropic: above + Fable 5.1, Fable 5, Mythos 5/5.1 (limited), Opus 4.7/4.6/4.5, Sonnet 4.6, Sonnet 4.5.
- Not on Foundry: fast mode, Managed Agents, server-side fallback, 2026-08 computer/browser toolsets. Not on Hosted-on-Azure: code execution, Files API, Agent Skills, programmatic tool calling, newer web search/fetch versions.

**Bedrock:** regional endpoints +10% over global (Sonnet 4.5/Haiku 4.5/Opus 4.5+) [V]; Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 global, $4.40 EU [S].

**Vertex [V]:** global matches first-party; regional/multi-region +10%. Discrepancy: Vertex lists Opus 5.5 batch $2.50/$12.50 vs Anthropic $2/$10 — verify.

## 3. Google Gemini [V, Vertex pricing page]

Global endpoint, USD/1M. Non-global +10% for Gemini 3+. If prompt >200K, the **whole request** is billed at >200K rates.

| Model | Input | Audio in | Output | Cached | Batch in/out | >200K in/out |
|---|---|---|---|---|---|---|
| Gemini 3.1 Pro Preview | 2.00 | 2.00 | 12.00 | 0.20 | 1.00 / 6.00 | 4.00 / 18.00 |
| Gemini 3.8 Flash (promo to 2026-12-31) | 0.75 | 0.75 | 3.75 | 0.075 | 0.375 / 1.875 | same |
| Gemini 3.8/3.7/3.6 Flash (from 2027-01-01) | 1.50 | 1.50 | 7.50 | 0.15 | 0.75 / 3.75 | same |
| Gemini 3.5 Flash | 1.50 | 1.50 | 9.00 | 0.15 | 0.75 / 4.50 | same |
| Gemini 3 Flash Preview | 0.50 | 1.00 | 3.00* | 0.05 | 0.25 / 1.50 | same |
| Gemini 3.5 Flash-Lite | 0.30 | 0.30 | 2.50 | 0.03 | 0.15 / 1.25 | same |
| Gemini 3.1 Flash-Lite | 0.25 | 0.50 | 1.50 | 0.025 | 0.125 / 0.75 | same |
| Gemini 2.5 Pro | 1.25 | 1.25 | 10.00 | 0.125 | 0.625 / 5.00 | 2.50 / 15.00 |
| Gemini 2.5 Flash | 0.30 | 1.00 | 2.50 | 0.03 | 0.15 / 1.25 | same |
| Gemini 2.5 Flash-Lite | 0.10 | 0.30 | 0.40 | 0.01 | 0.05 / 0.20 | same |

\* derived. Priority tier 1.8x. Explicit cache storage $4.50/1M/hr (Pro), $1.00 (Flash). Search grounding Gemini 3: 5,000 free/month then $14/1K queries.

Token counting: audio **32 tokens/s** (Gemini API docs [S]) vs **25 tokens/s** (Vertex page [V]) → make configurable. Images: 2.x 258 per ≤384px or per 768² tile; 3.x media_resolution LOW 280 / MEDIUM 560 / HIGH 1,120 (default 1,120). PDF page on 3.x default 560 + text. Video 258 tokens/s at 1 fps + audio.

## 4. Other vendors (brief)

| Vendor/model | Native in/out/cache (USD/1M) | Vertex partner [V] |
|---|---|---|
| xAI Grok 4.7 | $2 / $6 / $0.50 [S]; >200K $4/$12 | same |
| xAI Grok 4.3 / 4.20 | $1.25 / $2.50 [S] | $1.25 / $2.50 / $0.20 |
| xAI Grok 4.1 Fast | — | $0.20 / $0.50 / $0.05 |
| DeepSeek V4-Pro | $0.66 / $1.98 off-peak, peak 2x [S] | — |
| DeepSeek V4.1-Flash | $0.15 / $0.60 off-peak [S] | — |
| DeepSeek V3.2 / V3.1 / R1 | — | $0.56/$1.68; $0.60/$1.70; $1.35/$5.40 |
| Mistral Large 3 | $0.50 / $1.50 [S] | — |
| Mistral Medium 3.5 | $1.50 / $7.50 [S] | Medium 3 $0.40/$2.00 |
| Mistral Small 4 | $0.15 / $0.60 [S] | Small 3.1 $0.10/$0.30 |
| Meta Llama 4 | Meta Llama API retired 2026-07-06 [S] | Scout $0.25/$0.70; Maverick $0.35/$1.15 |

## Calculator flags
1. Claude image formula `ceil(w/28)·ceil(h/28)`, tier caps 1,568 / 4,784.
2. Claude 4.7+ tokenizer ≈ +30% tokens.
3. Model-specific cache-read multipliers.
4. Foundry Claude = list price, Data Zone 1.1x, feature gaps on Hosted-on-Azure.
5. Gemini audio tokens/s configurable (25 vs 32).
6. Gemini promo price expiry dates → catalog needs `effectiveFrom/effectiveTo`.
7. Gemini >200K reprices entire request → pricing engine needs tiered "whole-request" rules.
8. Re-verify all [S] items.
