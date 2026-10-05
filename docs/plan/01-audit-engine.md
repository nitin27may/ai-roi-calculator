# Audit: token and cost engine

## 2.1 What is already strong (keep)

- **Agent token simulation** (`packages/engine/src/harness.ts:68-121`):
  - growing history, per-step caching with a warm static prefix, tool-definition tokens plus a per-model tool overhead;
  - reasoning tokens (capped, optionally kept in history), compaction calls, the context-window cap;
  - P90/worst multipliers (`packages/catalog/src/heuristics.ts:41-44`) and retries.
- **Pricing** (`packages/engine/src/pricing.ts`):
  - Global / Canada Regional / US Data Zone per model, with availability alerts;
  - promo end dates, long-context repricing, lifecycle and retirement notes;
  - tokenizer multipliers, Snowflake credits.
  - All prices are in CAD at the measured FX rate. The live refresh runs with 0 mapping errors, and batch discounts are now derived from Azure meters (PR #9).
- **Workloads:** chat with RAG and a router split; agent tool fees; a realtime voice and STT→LLM→TTS cascade; AI Search tier and partition sizing; Document Intelligence and Content Understanding; email; Content Safety; Snowflake warehouse lines.
- **Dev Lab:** all nine activities, with month plans, workstreams and per-person effort.
- **Ledger and ROI:**
  - adoption ramp, growth, labour escalation, free allowances;
  - payback, NPV, three cost bases;
  - four benefit drivers with benchmark presets, licence overlap;
  - a one-at-a-time sensitivity tornado, seven savings levers, scenarios.
- **Explainability:** every line carries a formula string, and "How this is calculated" blocks exist on the Run page.
- **Exports:** Excel (6 sheets), CSV, JSON project file, print-to-PDF Report.
- **Design base:** a calm spruce/green palette, a good type pairing (Bricolage Grotesque, IBM Plex Sans and Mono), and a top-of-page KPI bar on every project page.

## 2.2 Token and cost accuracy gaps (ranked by effect on the estimate)

| # | Gap | Where | Effect |
|---|---|---|---|
| E1 | ~~Cache writes are never billed.~~ **Fixed (P3).** The agent harness writes the static prefix to cache once per cache lifetime (first step, the non-warm share) and the chat workload writes the system prompt once per conversation; both bill at the model's `cacheWrite` rate, falling back to `input` (no surcharge, no double count) for models with none. | `harness.ts`, `workloads.ts` (`chat`) | Claude with caching was underestimated |
| E2 | ~~Reasoning tokens are only counted for agents.~~ **Fixed (P3).** `ChatModel.reasoning` marks reasoning models in the catalogue; chat, llm, transcription summaries, document enrichment, email triage, the retrieval planner, and the playground/synthetic Dev Lab activities now take a `reasoning` setting (default `"none"`) and bill reasoning tokens as output on reasoning models only. | `workloads.ts`, `devlab.ts`, `schema.ts` | GPT-5.x at medium effort can be several times the visible output |
| E3 | ~~The language multiplier is defined but never used.~~ **Fixed (P3)** for chat and the generic `llm` workload: `settings.language` (default `"en"`) and an optional per-workload `language` scale input/output text tokens. Not yet wired into the agent harness, document enrichment, the retrieval planner or Dev Lab — left for a follow-up. | `heuristics.ts:14`, `workloads.ts` | Bilingual Canadian workloads were underestimated |
| E4 | ~~The production agent never passes `warmPrefix`.~~ **Fixed (P3).** The `agent` workload passes `warmPrefix` once `tasksPerMonth` crosses `heuristics.agents.warmPrefix.tasksPerMonthThreshold` (1,000/month, 90% warm). The harness also enforces the ~1,024-token minimum cacheable prompt (`heuristics.agents.minCacheableTokens`) for every caller, below which nothing is cached or written. 128-token cache steps and TTL decay are still not modelled. | `workloads.ts` (`agent`), `harness.ts` | Cached share is wrong in both directions |
| E5 | ~~The tokenizer multiplier is skipped in the voice cascade LLM, red-team probes and coding-agent tokens.~~ **Fixed (P3)** in all three places. | `workloads.ts` (`cascadeCall`), `devlab.ts` (`redteam`, `tooling`) | Claude-family costs were understated by up to 1.35× |
| E6 | ~~The long-context check uses the average prompt, so late turns that cross the threshold are missed.~~ **Fixed (P3)** for chat: the share of turns at/after the one whose own prompt crosses the model's threshold now bills at the long-context rate. Documents sent straight to a model now carry a real (non-zero default) `outputTokens` count. **Not fixed:** no verified Foundry long-context price was found for any Claude model, so `longContext` was not added to the Claude catalogue entries — do not invent one. | `workloads.ts` (`chat`, `documents`) | Understated for long documents and long chats |
| E7 | ~~No hosting or infrastructure model.~~ **Fixed (P10).** A `hosting` workload kind carries presets for Agent Service thread storage, Cosmos DB, App Service, AKS, Container Apps, private endpoints, egress, Defender, monitoring tied to volume, and APIM Consumption and Premium. Every item shows its source and confidence. Prices come only from the Retail API (12 new catalogue entries, Canada Central, CAD). Where there is no verified price (AKS node VMs, private endpoint hourly and data processed, the Agent Service Cosmos sizing) the item is an "enter your own" amount that starts at C$0. The Container Apps vCPU price (was 0) is now C$0.0000482 per vCPU-second and memory C$0.00000567 per GiB-second, with the free grants; both are single-source and derived from USD, so treat memory as about 12% precise. Effect: the sample and Meeting intelligence run rate rises C$144.09 a month; every other template is unchanged. | `unit-prices.json` | Total cost of ownership is missing for execs |
| E8 | ~~PTU is advisory only.~~ **Fixed (P10)** for chat, llm and agent workloads: an optional PTU mode books a fixed reserved-capacity line plus pay-as-you-go spillover (automatic from load above capacity, or a share you set). Break-even and the Capacity page use each workload's own deployment (a column shows it, and a selector forces one deployment for what-if comparison). A TPM quota field raises an Overview alert when peak load exceeds it and never changes a cost. Default is pay-as-you-go, so existing totals are unchanged. **Not fixed:** non-OpenAI models are still not on the PTU table; they stay pay-as-you-go with an alert. | `ptu.ts:50-84` | Capacity decisions aren't reflected in cost |
| E9 | Ranges are narrow: percentiles apply to agents only, Dev Lab is fixed at P50, there are no per-workload ranges, and sensitivity has no price, cache, model or FX drivers. | `devlab.ts:23`, `sensitivity.ts` | Headline numbers carry no confidence range |
| E10 | Retries and guardrails cover agents only. Chat and llm have no 429 or timeout re-sends. Prompt Shields and groundedness checks aren't tied to volume. | `harness.ts:120` | Slight underestimate |
| E11 | (Closed in P5 except index growth and a price-decline trend.) Everything is monthly from go-live. There is no one-time ingestion or backfill, no per-workload start or end, no index growth over time and no price-decline trend. Contingency applies to labour only. | `ledger.ts:71-80`, `project.ts` | "Optimise 10 books" or "ingest the backlog" can't be expressed |
| E12 | Scenarios and sensitivity ignore Snowflake volumes (`rowsPerMonth`, `rows`). | `scenarios.ts:8` | Snowflake projects don't scale |
| E13 | ~~Hard-coded values.~~ **Fixed (P10).** `settings.assumptions` holds the retrieval planner tokens (2,000 in / 350 out), red-team scoring output (200), voice function-call tokens per turn (default 0, because none were priced before) and the peak-to-average factor (3). The old numbers are the defaults and the Settings page edits them. | `workloads.ts:90`, `devlab.ts:105` | Hidden assumptions |
| E14 | The ROI model is thin for a CFO: no IRR, discounted payback, risk-weighted benefits, capex/opex split, amortisation, terminal value or hurdle rate. | `roi.ts` | A CFO can't approve on it |
| E15 | Priority and Flex tiers are still skipped (must stay configurable). **Done (P10):** built-in tool fees by volume on chat and agent workloads (catalogue prices for grounding with Bing, MAI web grounding and the Agent Service code interpreter; web search, file search calls and computer use are "enter your own" because no verified price exists), and image input tokens for chat and llm workloads with documented formulas (OpenAI tiles and patches, Anthropic width times height over 750). The formula constants were recalled from the vendor guides and not re-fetched, so check them against current docs. **Skipped:** MAI image models, because no verifiable price exists. MAI voice and transcription were already in the catalogue. | `schema.ts`, `workloads.ts` | Partial coverage |
| E16 | ~~No tests for the embeddings, continuousEval, contentSafety and llm workloads, cache writes or free allowances.~~ **Fixed (P3)**: `workloads.test.ts` covers all four workload kinds, E1 cache writes, E2 reasoning gating, E3 language, E4 warm prefix and the ledger's free-allowance adjustment. PTU and sensitivity still have 4 cases each (not this phase's scope). | `packages/engine/test` | Regressions would go unnoticed |

---
Part of the [audit and product plan](README.md). Status: [PROGRESS.md](../PROGRESS.md).
