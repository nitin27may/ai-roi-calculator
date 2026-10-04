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
| E1 | Cache writes are never billed. `chatCost` supports `cacheWrite`, but no caller passes it. | `pricing.ts:140`, callers in `workloads.ts`, `harness.ts` | Claude with caching is underestimated (writes cost about 1.25× input) |
| E2 | Reasoning tokens are only counted for agents. Chat, llm, email triage, summary, enrichment, the retrieval planner, playground and synthetic have none. | `workloads.ts:42,59,70,90,101,124`, `devlab.ts` | GPT-5.x at medium effort can be several times the visible output |
| E3 | The language multiplier is defined but never used. | `heuristics.ts:14` (fr 1.3, es 1.2, hi 1.4…) | Bilingual Canadian workloads are underestimated |
| E4 | The production agent never passes `warmPrefix`. Caching rules aren't modelled (1,024-token minimum, 128-token steps, TTL). | `workloads.ts:108` | Cached share is wrong in both directions |
| E5 | The tokenizer multiplier is skipped in the voice cascade LLM, red-team probes and coding-agent tokens. | `workloads.ts:202`, `devlab.ts:92,104` | Claude-family costs are understated by up to 1.35× |
| E6 | The long-context check uses the average prompt, so late turns that cross the threshold are missed. Documents sent straight to a model are checked per page and have no output tokens. Claude has no `longContext`. | `workloads.ts:52` | Understated for long documents and long chats |
| E7 | No hosting or infrastructure model: Agent Service thread storage, Cosmos DB, App Service, AKS, private endpoints, egress, Defender and monitoring tied to volume are all missing. APIM has no Consumption or Premium tier. The Container Apps vCPU price is 0. | `unit-prices.json` | Total cost of ownership is missing for execs |
| E8 | PTU is advisory only and never reaches the ledger. Break-even uses the Global price for every deployment. There is no PTU base plus pay-as-you-go spillover, no TPM quota check, and non-OpenAI models are unsupported. | `ptu.ts:50-84` | Capacity decisions aren't reflected in cost |
| E9 | Ranges are narrow: percentiles apply to agents only, Dev Lab is fixed at P50, there are no per-workload ranges, and sensitivity has no price, cache, model or FX drivers. | `devlab.ts:23`, `sensitivity.ts` | Headline numbers carry no confidence range |
| E10 | Retries and guardrails cover agents only. Chat and llm have no 429 or timeout re-sends. Prompt Shields and groundedness checks aren't tied to volume. | `harness.ts:120` | Slight underestimate |
| E11 | Everything is monthly from go-live. There is no one-time ingestion or backfill, no per-workload start or end, no index growth over time and no price-decline trend. Contingency applies to labour only. | `ledger.ts:71-80`, `project.ts` | "Optimise 10 books" or "ingest the backlog" can't be expressed |
| E12 | Scenarios and sensitivity ignore Snowflake volumes (`rowsPerMonth`, `rows`). | `scenarios.ts:8` | Snowflake projects don't scale |
| E13 | Hard-coded values: retrieval planner 2,000 in / 350 out, red-team scoring 200 out, no voice function-call tokens. | `workloads.ts:90`, `devlab.ts:105` | Hidden assumptions |
| E14 | The ROI model is thin for a CFO: no IRR, discounted payback, risk-weighted benefits, capex/opex split, amortisation, terminal value or hurdle rate. | `roi.ts` | A CFO can't approve on it |
| E15 | Missing pricing features: Priority and Flex tiers (skipped for now, must be configurable), built-in tool fees by volume (web search, file search, code interpreter, computer use), image and vision tokens, MAI image and voice models. | `schema.ts`, `workloads.ts` | Partial coverage |
| E16 | No tests for the embeddings, continuousEval, contentSafety and llm workloads, cache writes or free allowances. PTU and sensitivity have 4 cases each. | `packages/engine/test` | Regressions would go unnoticed |

---
Part of the [audit and product plan](README.md). Status: [PROGRESS.md](../PROGRESS.md).
