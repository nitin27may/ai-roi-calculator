# AI Token & Cost Calculator — Research Summary and Build Plan

Status: **plan only, no code yet** · Date: 2026-10-02 · Research notes: [`docs/research/`](./research)

Platform stance: **Azure is the primary AI platform**: models, ingestion, search, evaluation, safety and hosting. **Snowflake Cortex** is a secondary model-serving provider, billed in credits. Anthropic-direct and Google prices are kept as reference and comparison points only.

**Scope boundary.**
- **This tool, the token calculator,** answers one question: *what will AI consumption cost?* Consumption means tokens plus metered AI services (OCR pages, transcription hours, embeddings, AI Search, evaluation, red teaming, safety). The answer is broken out per lifecycle phase:
  - **development**: month 1, 2, 3… of building, experimenting and evaluating
  - **production**: the monthly run-rate once the use case is live
- **The ROI calculator** comes later. It will be ported selectively from `workgraph.ai/showcase/cost-calculator`; see [research/08](./research/08-workgraph-showcase-reuse.md) and §11.
  - It owns the end-to-end view: development effort and labour (roles, rate card, delivery phases), the always-on resources, the current-state baseline, benefits, avoided cost and payback.
  - It consumes this tool's output through a narrow contract. It does not recompute tokens.

---

## 0. What the research changed (read this first)

These findings shape the design. Several of them push back on the original idea.

1. **Prices are a moving target, and some have expiry dates.**
   - Examples: GPT-5.6 Sol is list $5/$30 but promo $4/$20 until 2026-11-30. MAI-Transcribe-2 is $0.10/hr only until 2026-12-31. Gemini Flash promos end 2027-01-01. Whisper and gpt-image-1 are being deprecated within weeks.
   - A static JSON file that someone "updates sometimes" would be wrong within a month.
   - So the catalog needs `effectiveFrom/effectiveTo`, promo overrides, deprecation dates and a scheduled refresh pipeline. See §3.
2. **Only part of Azure pricing is machine-readable.**
   - The Azure Retail Prices API (`prices.azure.com`) covers model tokens, PTU, Speech, Document Intelligence and AI Search SKUs.
   - Its meter names are inconsistent: `GPT 5 inpt Glbl`, `gpt 4o 0513 Input Data Zone Tokens`, and some units per 1K, others per 1M. It therefore needs a curated mapping layer plus human review.
   - Many items have **no API at all** and must be curated by hand with a "last verified" date:
     - semantic ranker, agentic retrieval and evaluation/red-team meters
     - Content Safety sub-features and Foundry Agent Service tools
     - Claude-on-Foundry and Snowflake credits
3. **Not every price could be verified yet.**
   - This research container could not reach `prices.azure.com`, `azure.microsoft.com` or `learn.microsoft.com` because the egress proxy blocked them.
   - Azure numbers in the research come from the Microsoft docs GitHub repo, the LiteLLM price mirror (which itself cites the Retail API) and search snippets. Each value carries a confidence tag.
   - The first job of the build is a sync script, run from GitHub Actions where the API is reachable, that confirms every number.
4. **Tokens differ by model family, not just price.**
   - Claude 4.7+ (Opus 5.5, Sonnet 5.5, Fable) produces **~30–45% more tokens** for the same text than OpenAI's o200k tokenizer.
   - Non-English text varies up to 5× (Hindi on older tokenizers).
   - A "tokens per page" input is not model-neutral. The engine must estimate in **words/characters/pages/minutes** and convert per model.
5. **Sending documents directly to an LLM costs very different amounts by model.**
   - A PDF page sent as text plus image is ≈1,400 tokens on GPT-4o, ≈2,300 on Claude, ≈2,700–4,800 on Claude 4.7+, and ≈560 on Gemini 3.
   - For comparison, OCR costs $1.50 per 1K pages with Document Intelligence Read, then ≈650 text tokens per page.
   - The calculator should show "direct-to-LLM vs OCR→RAG" side by side. This comparison is the most useful single feature for the 100-page example.
6. **Agent cost is quadratic, high-variance, and dominated by output/reasoning once caching is on.**
   - Every step re-sends the growing history.
   - The same task can vary ~30× in tokens between runs (published measurement).
   - Agent estimates must show **expected (P50), P90, and a hard worst case under the caps** (max turns × max context). A single number would mislead.
7. **PTU is almost never cheaper on token cost alone.**
   - Microsoft sizes PTU so that a fully used PTU costs about the same as pay-as-you-go: break-even ≈100% utilization for monthly reservations and ≈85% for yearly.
   - PTU is bought for latency, throughput and residency. The calculator should say this plainly rather than present PTU as a savings lever.
8. **Free tiers and commitment tiers apply per resource or subscription, not per workload.**
   - Examples: 5 free hours of Speech per month, the first 1K semantic queries, 50M agentic-retrieval tokens, 5 GB of Log Analytics.
   - They must be applied **after** aggregating all components in a project. Applying them per component double-counts the discount.
9. **No existing tool does end-to-end scenario costing.**
   - Existing tools cover per-call token price (llm-prices, Helicone, PricePerToken), RAG-only cost, or Azure SKUs without workload modelling (the Azure Pricing Calculator).
   - None chains source mix → OCR → chunk/embed → AI Search SKU → query traffic → agents → evaluation → red teaming. That chain is the product's reason to exist.

---

## 1. Product scope

### 1.1 Core user flow
1. Create a **Project**, for example "Contracts Copilot". Set project-wide assumptions:
   - region / data zone
   - currency
   - EA/MACC discount %
   - Snowflake $/credit
   - language mix
   - planning horizon
   - monthly growth %
2. Add **Workload components** from a palette, such as "Document ingestion", "AI Search index", "RAG chat" or "Agent harness". Start from blank or from a **scenario template**.
3. For each component:
   - enter volumes in business units: pages per month, emails per day, meeting hours, conversations, tasks
   - pick the service or model, or **compare up to N models side by side**
4. See a live **cost breakdown**:
   - by component, Azure service, meter, and monthly vs one-time
   - a 12/24/36-month projection with growth
   - P50/P90 ranges for agents
5. Every number has an **"explain" popover** showing the formula, the inputs and the price-catalog entry, with source URL, confidence and verified date.
6. **Lifecycle view.** Show cost per phase: Development (per month and in total, for the build duration), optional Pilot, and Production (monthly run-rate plus a 12/24/36-month projection). This is the headline output, for example "build months 1–3: $X/month; production: $Y/month".
7. **Save, share and export** as JSON, CSV/XLSX, PDF summary or a shareable link. Each estimate is stamped with the catalog version used, and a "Re-price with latest catalog" button shows the deltas.

### 1.2 Workload component catalog (v1 = ★)
Each component turns business inputs into **usage quantities** (tokens, pages, hours, SU-hours…) and then into **line items** priced from the catalog. Formulas and defaults are in `docs/research/05` and `06`.

| # | Component | Key inputs | Produces line items for |
|---|---|---|---|
| ★1 | **Document ingestion** | pages per month and initial backfill; mix (digital PDF / scanned / Office / spreadsheet / slides); words per page (500 plain, 700 dense, 40 slide); extraction service (DI Read / Layout / Prebuilt / Custom; Content Understanding Basic / Standard; Mistral OCR; none); add-ons; optional LLM enrichment (summary/metadata per doc) | Document Intelligence or Content Understanding pages; enrichment LLM tokens; Blob storage |
| ★2 | **Email ingestion** | mailboxes, emails per user per day (default 121), body words (150), thread depth, dedupe quoted text, % with attachments (25%), attachments per email (1.5), pages per attachment (5), attachment dedupe factor (0.7) | Graph (free); Content Understanding Minimal pages for bodies (ceil(chars/3000)); attachment pages routed through component 1's extraction logic |
| ★3 | **Direct-to-LLM document processing** | pages, questions per document, model(s), page-as-image on/off, image detail | per-model page tokens (text + image formulas), cache write/read for repeated questions; **auto-compares against OCR→RAG** |
| ★4 | **Chunking & embedding** | source tokens (from 1–3 or manual), chunk size 512, overlap 25%, embedding model, dimensions, re-embed frequency per year | embedding tokens (one-time backfill + monthly delta + re-embed); query-time embeddings |
| ★5 | **Azure AI Search index** | chunks, dimensions, quantization (none/int8/binary), stored on/off, text bytes per chunk, deleted-docs ratio, SLA (2 or 3 replicas), peak QPS, tier (auto-recommend) | SU-hours (R×P), using the sizing formula in research/04 §1d; image extraction; skillset transactions |
| ★6 | **Retrieval** | queries per month, % semantic ranker, top-k, reranker (semantic / Cohere 3.5 / 4 Fast / 4 Pro), agentic retrieval (subqueries, chunks, tokens per chunk, planner model) | semantic ranker after 1K free; Cohere per 1K searches; agentic reasoning tokens after 50M free; planner LLM tokens |
| ★7 | **RAG chat / conversations** | users, conversations per user per month, turns (4), user turn (100), answer (350), system prompt (500), top-k × chunk, history mode (full / window / summary), cache hit %, reasoning effort, model(s) | LLM input/cached/output tokens with history growth; content-safety records |
| ★8 | **Meeting / audio transcription** | meeting hours per month, speakers, STT engine (MAI-Transcribe-2, Speech batch/fast/real-time, gpt-4o(-mini)-transcribe, Whisper, CU audio), diarization, post-processing (summary 500 tokens, action items, minutes) with model | audio-hour meters; transcript tokens (140 wpm ≈ 11K tokens/hr + diarization overhead) into summary LLM |
| ★9 | **Agent harness** | see §1.3 | per-agent LLM tokens (P50/P90/worst), tool fees (Bing, Code Interpreter, File Search, AI Search), hosting |
| ★10 | **Evaluation** | rows per run, runs per month, evaluators selected (each has a template-token size from the SDK), judge model, context/response sizes, safety evaluators on/off, continuous eval sample % | judge LLM tokens; AI-evaluations safety meter ($/1M in/out) |
| ★11 | **AI red teaming** | risk categories, objectives per category (10), attack strategies (Easy/Moderate/Difficult or custom), multi-turn depth, target model/agent cost per probe, runs per month/release | probes = categories × objectives × (1 + strategies); safety-meter tokens; target-model tokens |
| ★12 | **Content safety / guardrails** | requests, chars in+out, images, features (moderation, Prompt Shields, groundedness, protected material) | Content Safety text records (1K chars) and images |
| ★13 | **Generic LLM line** | free-form: calls per month, input/cached/output/reasoning tokens, model, deployment type | escape hatch for anything not modelled |
| ★13b | **Development & experimentation (build phase)** | see §1.4; links to an agent harness, evaluation and red-team component | one-time build-phase LLM, eval and red-team tokens; dev tooling tokens |
| 14 | Voice / call-center agent | calls, minutes, talk ratio, turns, realtime model or cascade (STT+LLM+TTS) | realtime audio tokens (10/s in, 20/s out) or cascaded meters |
| 15 | Batch extraction / classification | items, tokens per item, % batchable | Batch −50% |
| 16 | Translation | chars, target languages, Translator vs LLM | Translator chars or LLM tokens |
| 17 | Image generation / vision | images, size/quality | per-image / image tokens |
| 18 | Video analysis | hours, Content Understanding video vs frame sampling | CU video + contextualization |
| 19 | Fine-tuning | training tokens, epochs, hosting months | training + $1.70/hr hosting |
| 20 | Observability | requests, spans, prompt capture | Log Analytics GB after 5 GB free |
| 21 | Platform & hosting | Container Apps / Functions / Foundry hosted agents / APIM / Cosmos / Blob / private endpoints | flat or usage lines per environment |
| 22 | Snowflake Cortex workload | model, tokens, AI SQL functions (AI_COMPLETE, AI_EMBED, AI_PARSE_DOCUMENT…), Cortex Search GB, warehouse size/hours | credits × $/credit (see §6) |
| 23 | Copilot / Copilot Studio seats & credits | licensed users, credits | per-seat + credit packs (optional, later) |

### 1.3 Agent harness model (component 9)
- **Harness** = a pattern plus 1–N agents. Patterns:
  - single (ReAct)
  - sequential
  - concurrent (fan-out/fan-in)
  - orchestrator–workers / supervisor
  - handoff
  - group chat / maker-checker
  - magentic
- **Per agent:**
  - model; system prompt; tool count × tokens per tool (or MCP server presets: GitHub ≈26K, Slack ≈21K…); provider tool-use overhead (286–675, from the model catalog)
  - steps per task; tool calls per step; tool-result size; visible output per step; reasoning effort (none/low/med/high → 0/500/2K/6K, billed as output)
  - cache hit %; context compaction (trigger, summary size)
- **Caps (the user's "max token for the harness"):**
  - `maxTurns`
  - `maxTokensPerCall`
  - `maxContextTokens` (compaction trigger)
  - `taskTokenBudget`, a hard total; the engine truncates the simulation when it is hit and flags it
- **Reliability:** retry rate (5%) and hard-fail rate (2%, billed at maxTurns).
- **Volumes:** tasks per day/month.
- **Engine:** per-step simulation, not a closed form, so that caps, compaction, caching and handoff cache-misses are exact. Outputs:
  - P50 (defaults)
  - P90 (steps × p90 factor, larger tool results)
  - **worst case under caps**
  - per-agent breakdown, and a "tokens by step" chart showing the quadratic growth
- **Quick mode:** for users who only know a chat baseline, apply ×4 for an agent and ×15 for multi-agent (Anthropic's published ratios).

### 1.4 Development & experimentation cost (component 13b)
Building an agent is not one run per task. Each design change re-runs the harness over an evaluation dataset, often against several candidate models, several times each because outputs are non-deterministic. Then everything is scored. This build-phase spend is invisible in a production-only estimate. For low-volume internal agents it can **exceed the first year of runtime cost**.

**Inputs:**
- **Team and duration:** build duration (weeks), engineers, working days per week.
- **Linked components:** an agent harness, which supplies the per-task cost by model; an evaluation component, which supplies the per-case judge cost; and a red-team component.
- **Experiment loop:**
  - experiment iterations per engineer per day
  - dataset size (cases) and the **% of the dataset per iteration** (a smoke subset vs a full run)
  - **models compared** per iteration (multi-select)
  - **repeats per case**, for variance and pass^k (default 3)
  - judge on/off per iteration
- **Cache and batch:**
  - dev cache-hit % (lower than production, because prompts change constantly; default 30%)
  - share of offline runs sent through **Batch (−50%)**
- **Ad-hoc work:** playground and prompt-iteration calls per engineer per day, with average in/out tokens.
- **CI regression evals:** PRs per week × regression subset × models × repeats.
- **Red-team passes:** red-team runs per release × releases during the build.
- **Optional AI dev tooling:** coding-assistant tokens or seats per engineer, e.g. GitHub Copilot or Claude Code.
- **Model strategy:** "iterate on cheap model, final runs on frontier", expressed as a split %.

**Formula sketch** (per-case cost comes from the linked components at dev cache/batch settings):
```
case_cost(m)   = harness_task_cost(m, η_dev, batch_share) + judge_on × eval_case_cost
iteration_cost = Σ_m∈models  dataset × subset% × repeats × case_cost(m)
build_cost     = weeks × days × engineers × (iterations/day × iteration_cost + adhoc_calls × adhoc_cost + tooling/day)
               + weeks × PRs/week × regression_subset × Σ_m repeats × case_cost(m)
               + releases × red_team_run_cost
```

**Output:**
- the build phase as a **one-time** line, kept separate from monthly run cost
- a chart of cumulative cost: build, then pilot, then production
- the warning "build spend = N months of production"

**Project lifecycle phases.** Projects get optional phases (Build → Pilot → Production), each with its own volume multipliers and durations. Build components (13b) only bill in Build. Runtime components scale by phase. This timeline is also the hook for the ROI module (§11).

### 1.5 Cross-cutting modifiers (applied in the engine, in this order)
1. **Tokenizer family multiplier.** Base is o200k = 1.00. Claude ≤4.6 is 1.10, Claude ≥4.7 is 1.35, Gemini is 1.00. These values come from the model catalog.
2. **Language-mix multiplier.** Per tokenizer family; for example Hindi is 1.4 on o200k and 5.5 on legacy Claude.
3. **Modality formulas:**
   - image/page tokens per provider: OpenAI tiles or patches, Claude `ceil(w/28)·ceil(h/28)` with tier caps, Gemini media_resolution
   - audio tokens per second
4. **Prompt caching:** model-specific read multipliers (0.1 / 0.05 / 0.025 / Azure cached price) and write multipliers (1.25 / 2.0 / Azure GPT-5.6+ cache writes).
5. **Deployment type:**
   - Global = 1.0
   - Data Zone = ×1.10 (EU GPT-6 = ×1.20)
   - Regional = per-region price
   - Batch / Flex = ×0.5
   - Priority = model-specific ×1.75–2.5
6. **Long-context rule.** Above a per-model threshold (272K on GPT-5.4+, 200K on Gemini), the **whole request** is billed at the long-context rate.
7. **Promo/effective-date resolution** against the estimate's "as of" date.
8. **Aggregation per meter across the project**, then free tiers and commitment tiers.
9. **Discounts:** EA/MACC %, per-provider negotiated %, and Snowflake contract $/credit.
10. **Currency conversion,** from a USD base with an FX table in the catalog.

---

## 2. Domain model (TypeScript, validated with Zod)

```
Project { id, name, owner, createdAt, catalogVersion, asOfDate,
          assumptions: { region, dataZone, currency, discounts{provider→%}, snowflakeCreditPrice,
                         languageMix{lang→share}, horizonMonths, growthPctPerMonth },
          environments?: [dev|test|prod] (optional multiplier per env),
          components: Component[] }

Component { id, type: ComponentType, name, enabled, inputs: <type-specific, Zod schema>,
            modelSelection: { primary: ModelRef, compare?: ModelRef[] },
            links?: { sourceComponentId → feeds tokens/chunks } }   // e.g. ingestion → embedding → index

UsageQuantity { meterRef, quantity, unit, cadence: one-time|monthly, scenario: p50|p90|worst, trace[] }

LineItem { componentId, provider, service, sku, meterRef, quantity, unit, unitPrice, cost,
           cadence, freeTierApplied, discountApplied, priceSource{catalogEntryId, confidence, verifiedAt} }

Estimate { projectId, catalogVersion, lineItems[], totals{monthly, oneTime, byService, byComponent, byMonth[]} }
```

**Component links matter.** Ingestion produces tokens and chunks. Embedding consumes them. Index sizing consumes the chunk count and dimensions. Retrieval and RAG chat consume top-k × chunk size. The user enters page volumes once, and the downstream components derive their quantities from them, with the option to override.

---

## 3. Pricing data architecture

### 3.1 Layout: JSON in git as the source of truth
```
data/
  catalog/
    manifest.json                    # catalog version, generatedAt, per-file hash + lastVerified
    models/
      azure-openai.json              # GPT-6.x/5.x/4.x, o-series, embeddings, audio, image, video
      azure-foundry-partners.json    # DeepSeek, Grok, Llama, Mistral, Cohere, Kimi, MAI-*, FLUX, Claude-on-Foundry
      anthropic.json                 # reference / direct
      google-gemini.json             # reference
      snowflake-cortex.json          # credits per 1M tokens per model + AI SQL functions
    services/
      azure-ai-search.json           # tiers, limits, semantic, agentic, enrichment
      azure-speech.json              # STT/TTS/translation/custom + MAI-Transcribe/Voice
      azure-document-intelligence.json
      azure-content-understanding.json
      azure-content-safety.json
      azure-language-translator-vision.json
      azure-foundry-evaluations.json # AI-evaluations meter, judge-template token sizes
      azure-foundry-agent-service.json  # Bing, Code Interpreter, File Search, hosted agents
      azure-infra.json               # Blob, Cosmos, Functions, Container Apps, APIM, Log Analytics
      snowflake-platform.json        # $/credit by edition/region, warehouse credits/hr, Cortex Search
    ptu.json                         # $/PTU-hr per deployment type, reservations, per-model TPM/PTU, min/increment, ratio
    fx.json
  heuristics/
    tokenizers.json                  # family multipliers, language multipliers, chars/words per token
    content.json                     # words/page by type, email stats, wpm, diarization overhead, table formats
    modality.json                    # image/page/audio token formulas + params per provider
    agents.json                      # pattern defaults, MCP server presets, reasoning effort tokens
    evaluators.json                  # evaluator → template tokens, max output
  templates/                         # scenario templates (Meeting assistant, Contract RAG, Email triage agent…)
  mappings/
    azure-retail-meters.json         # regex/meterName → catalog entry id (the hard part)
```

### 3.2 Price entry schema (simplified)
```ts
PriceEntry {
  id: "azure-openai:gpt-5.4:global:input",   // stable id
  provider, service, product, model?, sku,
  dimension: "input"|"cached_input"|"cache_write"|"output"|"reasoning"|"audio_in"|"audio_out"|"image_out"|
             "page"|"hour"|"su_hour"|"query"|"record"|"char"|"gb_month"|"credit"|...,
  unit: { per: 1_000_000, of: "token" } | { per: 1000, of: "page" } | { per: 1, of: "hour" } ...,
  price: number, currency: "USD",
  deploymentType?: "global"|"datazone-us"|"datazone-eu"|"regional"|"batch"|"priority"|"flex"|"ptu",
  region?: string, contextTier?: "short"|"long",
  tiers?: [{ upTo: number, price }],               // volume tiers (DI Read >1M pages, Vision…)
  freeAllowance?: { quantity, period: "month", scope: "resource"|"subscription" },
  effectiveFrom, effectiveTo?, promo?: { listPrice, until },
  deprecation?: { date, replacement },
  source: { kind: "retail-api"|"vendor-doc"|"litellm"|"manual", url, meterId?, meterName?, retrievedAt },
  confidence: "verified"|"cross-checked"|"single-source"|"unverified",
  notes?
}
ModelEntry { id, provider, family, displayName, version, tokenizerFamily, contextWindow, maxInput, maxOutput,
             longContextThreshold?, modalities[], imageTokenFormula?, toolUseOverhead?{auto, forced},
             cacheReadMultiplier?, minCacheablePrefix?, ptu?{tpmPerPtu, outputRatio, min, increment, normalizedWeights?},
             availability{deploymentTypes[], regions?[]}, deprecation?, priceRefs[] }
```

### 3.3 Refresh pipeline (GitHub Actions, weekly plus manual dispatch)
| Source | Method | Covers |
|---|---|---|
| Azure Retail Prices API | `scripts/sync/azure-retail.ts`: paged `$filter` queries (`serviceName eq 'Foundry Models'`, `'Foundry Tools'`/`'Cognitive Services'`, `'Azure Cognitive Search'`, PTU reservations, storage/infra); normalize 1K→1M units; map meters through `mappings/azure-retail-meters.json` | Azure model tokens, PTU, Speech, DI, Search SKUs, infra |
| LiteLLM `model_prices_and_context_window.json` | fetch and diff | **cross-check only** (flags disagreements; never overwrites) |
| Anthropic docs (`platform.claude.com/docs/en/about-claude/pricing.md`, plain markdown) | parse tables | Claude (direct; Foundry = same list price) |
| Vertex AI pricing page | parse | Gemini reference |
| Snowflake Service Consumption Table (PDF) | download and parse tables | Cortex credits |
| Everything else | `manual` entries with `lastVerified` | semantic ranker, agentic retrieval, eval/red-team meter, Content Safety sub-features, Agent Service tools, MAI promos |

**Reuse from the showcase.** Lift `packages/fetcher` `retail.ts` (paging, retry, cache) and `match.ts` (regex matching that refuses ambiguous meters) from workgraph.ai. Also lift its ~20 hand-written Azure OpenAI meter regexes as seed mapping data. Add what it lacks:
- discovery across `serviceName eq 'Foundry Models'`, with an unmapped-meter report
- PTU reservations (it currently drops non-Consumption meters)
- batch, priority, long-context and cache-write meters
- USD base pricing
- confidence and effective dates
- scheduling in CI (today it is run by hand only)

Pipeline steps:
1. Fetch the sources.
2. Normalize the data.
3. Validate with Zod.
4. Run sanity rules:
   - price > 0
   - a change of more than ±30% is flagged
   - unmapped new meters are listed
   - promo `effectiveTo` dates that are already past are flagged
   - deprecations within 30 days are flagged
5. Write the JSON and a `CHANGELOG` entry.
6. **Open a PR** with a human-readable diff table.

A person reviews and merges. Merging bumps the catalog version and redeploys.

**Unmapped meters are not silently dropped.** They go to `reports/unmapped-meters.md` so new models such as "gpt-6.2" show up in the PR.

### 3.4 Runtime behaviour
- The catalog is bundled at build time as static JSON. No database is needed for prices, and the files are small.
- The UI shows a **staleness badge** per entry: verified less than 30 days ago is green, less than 90 days is amber, older is red. The source link sits beside it.
- **Org overrides:** the user can enter negotiated discounts and custom prices, stored with the project. These never mutate the catalog.
- **Catalog versions are kept** (`data/catalog` history plus a release tag). Saved estimates record the version they were priced with and can be re-priced.

**Why JSON in git instead of a database for v1:** it gives reviewable diffs, a free audit trail, a static deploy and no backend secrets. If an admin UI for editing prices becomes necessary later, the same schema moves into Cosmos DB or Postgres unchanged.

---

## 4. Calculation engine

- Lives in `packages/engine`: pure TypeScript with no React, deterministic, with exhaustive unit tests (Vitest).
- Pipeline: `Project + Catalog + asOfDate → per-component usage (p50/p90/worst) → link resolution → price lookup with modifiers (§1.5) → project-level aggregation per meter → free tiers / commitment tiers → discounts → FX → Estimate`.
- Every quantity carries a `trace` (formula id plus inputs) that drives the "explain this number" UI.
- **Golden tests** come from published worked examples:
  - Content Understanding docs: 10-page RAG doc ≈ $0.132; 1 h call audio ≈ $0.47
  - agentic retrieval example ≈ $4.32
  - PTU sizing example: gpt-5.2 at 1,000 RPM → 110 PTU, 80 with 50% cache
  - Claude image-token table
  - the agent worked example ($0.233 uncached / $0.140 cached)
- **Sensitivity:** tornado-style output listing the top 5 inputs that move the total.
- **Optional exact token counting:**
  - OpenAI-family text: in-browser `gpt-tokenizer`, o200k, lazy-loaded
  - Claude: Next.js server routes that call Anthropic `count_tokens`; Gemini: `countTokens`. Both need a key on the server and are optional
  - other models: heuristics

---

## 5. Tech stack and repo structure

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, latest stable) + TypeScript** | user preference; server routes for optional token-count proxies and future auth |
| UI | **Tailwind CSS v4 + shadcn/ui** (Radix) + lucide icons | user preference; accessible, themeable |
| Forms & validation | React Hook Form + Zod (schemas shared with the engine and the catalog) | one schema source |
| State | Zustand (project editor), URL-state for share links | simple, no server needed in v1 |
| Tables | TanStack Table | line-item grid, model comparison matrix |
| Charts | Recharts (or visx) following the dataviz guidelines | breakdown donut/bar, monthly projection, agent step growth |
| Tokenizer | gpt-tokenizer (o200k, dynamic import) | fastest pure JS, ~1 MB gzip lazy |
| Export | CSV, XLSX (SheetJS), PDF (react-pdf or print CSS) | stakeholder sharing |
| Tests | Vitest (engine, catalog validation), Playwright (E2E) | |
| Monorepo | pnpm workspaces: `apps/web`, `packages/engine`, `packages/catalog` (schemas + data + loaders), `scripts/sync` | engine reusable (CLI, API, Excel add-in later) |
| Persistence v1 | localStorage + JSON import/export + compressed share URL | zero backend |
| Persistence v2 | Entra ID sign-in + Cosmos DB (projects, org overrides, sharing) | Azure-native |
| Hosting | Azure Static Web Apps (hybrid Next.js) or Azure Container Apps | Azure-first |
| CI | GitHub Actions: lint, typecheck, test, catalog-validate; scheduled price sync → PR | |

---

## 6. Snowflake Cortex (secondary model provider)
Full research: [research/07](./research/07-snowflake-cortex.md).

### How Snowflake is modelled
Snowflake is treated as a **provider with two credit currencies**. It is not a separate calculator.
- **AI Credits** (since 2026-04-01) cover AI Functions, Cortex Search, Parse Document, Agents, CoWork, Cortex Code and the REST API.
  - Price: **$2.00** with global cross-region routing; **$2.20** with regional or disabled routing.
  - The price is the same for every edition. ACV discounts apply; capacity discounts do not.
- **Platform Credits** cover warehouses, storage, Cortex Analyst direct ("legacy") and fine-tuning.
  - The price depends on edition and region, for example Enterprise in Azure East US 2 is $3.00, or it comes from the customer's contract.
- Project assumptions add:
  - `snowflake.edition`
  - `snowflake.region`
  - `snowflake.crossRegion` (ANY_REGION / AZURE_US / AZURE_EU / DISABLED), which sets the AI Credit price
  - `snowflake.platformCreditPrice`
  - `snowflake.acvDiscountPct`

### Catalog entries
`snowflake-cortex.json` holds, per model and per function:
- credits per 1M tokens, with input and output separate
- REST API USD rates, including cache read
- credits per 1K pages for Parse Document LAYOUT and OCR
- tokens per second for AI_TRANSCRIBE
- availability per cross-region setting

`snowflake-platform.json` holds:
- warehouse credits per hour by size
- the Cortex Search serving rate of 6.3 AI Credits per GB-month
- Analyst at 67 Platform Credits per 1,000 messages

Sync source: the Consumption Table PDF, parsed for Table 6(a)/(b)/(c)/(e)/(g).

### Lines a Snowflake workload produces
- AI_COMPLETE or REST tokens, priced as credits × P_ai.
- Fixed-rate AI SQL functions (AI_CLASSIFY, AI_EXTRACT…).
  - Includes the **hidden system-prompt overhead** and per-row label re-billing.
  - AI_EXTRACT counts each document page as 970 input tokens.
- AI_PARSE_DOCUMENT pages, as an alternative to Document Intelligence.
- AI_TRANSCRIBE hours, about $0.35/hr, as an alternative to MAI-Transcribe or Azure Speech.
- AI_EMBED tokens.
- Cortex Search:
  - serving: **fixed monthly** cost of 6.3 × GB indexed, where GB = rows × (vectors × dims × 4 + row bytes)
  - re-embedding on change
- **Warehouse overhead.** Size (MEDIUM by default, 4 credits/hr) × runtime hours × Platform Credit price. Runtime is a user input with a heuristic default; it often dominates cost for cheap models.
- Cortex Analyst messages and Agents orchestration tokens. The orchestration rates are unverified, so they are flagged.

### Rules and warnings the engine enforces
- **Claude is not available under AZURE_US or AZURE_EU.** Selecting Claude on an Azure-hosted Snowflake account forces ANY_REGION or AWS_* routing. The UI warns that data leaves Azure, crossing to AWS over the public internet with mTLS.
- **Gemini requires ANY_REGION.**
- **Native-region model lists differ.** West Europe natively serves only Llama and Mistral models.

### Comparison view
A workload component can target Azure OpenAI, Claude on Foundry and Snowflake Cortex side by side, using the same token estimate. Each target applies its own tokenizer multiplier. Each target adds its own platform overhead: Snowflake warehouse time, or Foundry Data Zone ×1.1.

### Verify first
Most Snowflake model rates have medium or low confidence.
- These Claude and GPT-5.x AI_COMPLETE rates are derived, not confirmed:
  - Claude Opus 5 and 5.5
  - Claude Sonnet 5 and 5.5
  - GPT-5.5, 5.6 and 6
- Agents orchestration, fine-tuning, provisioned throughput and Batch Search rates are missing.
- AI_PARSE_DOCUMENT has conflicting figures: 3.33 credits per 1K pages vs "$0.04 per page".
- A reported +50% "promotional" price change on 2026-09-01 is unconfirmed.

These must be confirmed from the PDF in P1, or from the customer's `RATE_SHEET_DAILY` view, before any Snowflake number is quoted.

---

## 7. UX outline

- **Projects list → Project editor.** Left: component palette and templates. Center: component cards with inputs and smart defaults. Right: live total and breakdown.
- **Model comparison matrix:** in any LLM-consuming component, choose "compare" to get a table of monthly cost per model, with deployment type and confidence.
- **Assumptions drawer:** every default (words per page, wpm, chunk size…) is visible and editable, with its source citation.
- **Scenario templates** to seed projects:
  1. Meeting assistant: transcription, summary, action items, RAG over minutes
  2. Contract/Policy RAG: ingestion, index, chat, eval
  3. Email triage agent: email ingestion, classification batch, agent with tools
  4. Call-center voice agent
  5. Enterprise research multi-agent with Bing grounding
  6. Backfill OCR of a scanned archive
- **Reports:** an executive summary (monthly run-rate, one-time, top cost drivers, risks such as promo expiry and deprecations) and a detailed line-item sheet.
- **Warnings engine:**
  - a model is deprecated before the horizon ends
  - a promo expires inside the horizon
  - the long-context threshold is crossed
  - the index exceeds tier limits
  - a PTU is under-utilized
  - Hosted-on-Azure Claude doesn't support a selected tool

---

## 8. Delivery phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0: Foundations** | monorepo, Zod schemas, catalog seeded from the research tables (with confidence tags), catalog validation in CI | `pnpm test` green; catalog loads |
| **P1: Price sync** | Azure Retail sync plus meter mapping, Anthropic docs parser, LiteLLM cross-check, PR bot, unmapped-meter report | first sync PR confirms or corrects every [S]/[U] Azure price |
| **P2: Engine core** | modifiers pipeline, components ★1–8 and ★13, links, aggregation, free tiers, golden tests | golden tests pass |
| **P3: UI v1** | project editor, component cards, comparison matrix, breakdown charts, explain popovers, localStorage, JSON/CSV export, share link | 100-page doc and 1-hour meeting scenarios end-to-end in the browser |
| **P4: Agents, eval, red team, dev-phase cost** | ★9 agent harness simulator (P50/P90/worst, caps), ★10 evaluation, ★11 red teaming, ★12 content safety, **13b development & experimentation + lifecycle phases (Dev months → Production)**; templates | agent worked example reproduced; dev-month cost reproduces a hand calculation |
| **P5: Snowflake + PTU** | Snowflake Cortex catalog and component, PTU sizing and break-even view | Azure vs Snowflake comparison works |
| **P6: Extended components** | 14–21; XLSX/PDF export; projection and growth; sensitivity | |
| **P7: Multi-user (optional)** | Entra ID, Cosmos DB, org overrides, sharing, deploy to Azure | |
| **P8: ROI module (after the token calculator is accepted)** | port the ROI, delivery and rate-card logic from workgraph.ai behind the §11 contract | showcase golden ROI tests ported and passing |

---

## 9. Decisions needed from you

1. **Persistence for v1.** Local-only (browser plus export/share link), or sign-in with Entra ID and Cosmos DB from day one? Recommendation: local-only first; the engine and catalog are the hard part.
2. **Hosting target.** Azure Static Web Apps or Azure Container Apps?
3. **Pricing review workflow.** Is weekly auto-PR plus human merge acceptable, and who reviews?
4. **Negotiated pricing.** Should the tool hold org-specific EA/MACC discounts and the Snowflake $/credit, or keep everything at list price with per-project overrides?
5. **Currency.** USD only, or also INR/EUR/GBP with an FX table?
6. **Scope of non-Azure vendors.** Keep Anthropic-direct and Gemini as reference columns, or hide them and show only Azure plus Snowflake?
7. **Copilot / Copilot Studio licensing** (components 23): in scope or not?

---

## 10. Risks

- **Price accuracy.** Mitigated by the sync pipeline, confidence tags, staleness badges and "verify" warnings. The first sync PR has to happen before anyone uses the numbers for a customer quote.
- **Heuristic error.** Tokens per page, agent steps and similar are estimates. Mitigated by P50/P90 ranges, editable assumptions, an optional exact token count, and a later "calibrate from actual usage" import (Azure Cost Management export or App Insights token metrics).
- **Meter mapping drift.** New Azure meter names break the regexes. Mitigated by the unmapped-meter report in every sync PR.
- **Scope creep.** 23 component types is a lot. v1 ships ★1–13 and the rest come from demand.

---

## 11. Future ROI integration (design now, build in P8)

Full analysis: [research/08](./research/08-workgraph-showcase-reuse.md).

**Port, not copy.**
- **Keep:** the showcase ROI's capability valuation, cost allocation that reconciles to total (with an unallocated explainer), avoided cost treated as a benefit, transition costs, one-off benefits, rate escalation, fractional payback, delivery/rate-card labour costing, and the benchmark library.
- **Do not carry over:**
  - CEL formulas in the core
  - the monthly-only cost lines
  - cost classes keyed to category-name strings
  - magic output names
  - the CAD and canadacentral defaults

**Contract the token calculator must expose from day one**, so ROI plugs in without refactoring:
```ts
interface ConsumptionEstimate {
  catalogVersion: string; currency: string; asOfDate: string;
  phases: { id: "dev"|"pilot"|"prod"; startMonth: number; months: number }[];
  byMonth: { month: number; phase: string; p50: number; p90: number }[];  // the single cost projection
  lines: { componentId: string; componentName: string; meterRef: string; cadence: "one-time"|"monthly";
           phase: string; monthly: number; oneTime: number;
           costBehaviour: "fixed"|"semiFixed"|"variable";   // catalog data, not category names
           roiAllocation: "shared"|"direct" }[];
  businessVolume: Record<string /*componentId*/, { tasksPerMonth?: number; users?: number; itemsPerMonth?: number }>;
}
```

**Rules for the integration:**
- ROI takes `byMonth` as its cost side. It projects **benefits only**: adoption ramp, growth, wage escalation, avoided cost.
- `implementationCost` = delivery labour + one-time consumption, meaning the 13b build-phase tokens and ingestion backfill.
- **One project-level rate card** (roles with hourly rates) is shared by 13b (who runs experiments), Delivery and ROI.
- Costs reach ROI already converted to the project currency.
- The ROI band runs from (P90 cost, conservative benefit) to (P50 cost, optimistic benefit).
