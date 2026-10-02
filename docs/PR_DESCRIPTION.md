# AI Cost & ROI Studio: research, plan and full build

## Summary

This is a local-first, offline calculator for the token cost, delivery cost and ROI of AI use cases on Azure (including Claude on Foundry) and Snowflake.

- All money is in CAD. No discounts are applied.
- Prices live in versioned JSON catalogues and are refreshed by local scripts.

## What's included

### Research and design
- `docs/research/01–08`: Azure OpenAI and Foundry models, Claude and other vendors, ingestion services, AI Search, evaluation and red teaming, token heuristics, agent harness and PTU sizing, Snowflake Cortex, and reuse from workgraph.
- `docs/PLAN.md` and `docs/DESIGN.md` (the design decisions override the plan), plus an interactive mockup.

### Price catalogue (`packages/catalog`)
- Zod-validated CAD catalogues: chat models, embeddings, speech, realtime, PTU, AI Search tiers, unit prices, Snowflake settings and benchmarks.
- Every entry records its source, a confidence rating and its lifecycle (promotions, retirements).
- USD-only prices are converted at 1.386 CAD/USD and marked `derived`.

### Cost engine (`packages/engine`, pure TypeScript)
- **Pricing.** Date-aware price book with Data Zone pricing, long-context pricing, tokenizer multipliers, and Snowflake AI and platform credits.
- **Agent harness simulator.** Simulates each step of an agent run: growing history, caching, compaction and token caps, with P50, P90 and worst-case results.
- **Production workloads.**
  - Ingestion and processing: transcription, documents (extract or direct to the LLM), email, embeddings.
  - Search and chat: AI Search sizing, retrieval with reranking, chat with routing.
  - Agents and voice: agents, voice agent (realtime vs a speech → LLM → speech cascade).
  - Quality and safety: continuous evaluation, content safety.
  - Snowflake: AI_COMPLETE, AI functions, Cortex Search, warehouses.
- **AI Dev Lab (build phase).**
  - Activities: model bake-offs, harness iterations, regression, Foundry evaluation, red teaming, playground, coding tools, synthetic data and fine-tuning.
  - Month plan, so each activity's intensity can vary by month.
  - **Workstreams:** people get a share of their time per feature, including moves between features and periods back on an earlier feature. Iteration-type work scales with the people on a feature; bake-offs, regression and red teaming run once per feature.
  - Spend per person, with an optional monthly budget.
- **Monthly ledger and ROI.**
  - Cash flow, payback and NPV, with cost bases for run only, run plus maintenance, or the full lifecycle.
  - Growth, rate escalation, transition costs and one-off benefits.
  - ROI per capability, with build cost carried in through workstreams.
- **Benefits.**
  - Benchmark library ported from workgraph.
  - Time saved per task, per user-week or per item in a queue, with adoption, realisation and licence overlap.
  - Avoided costs as a fixed amount or as headcount.
  - Before/after comparison, and a sensitivity tornado with combined best and worst cases.
- **Other tools.** Savings levers, scenarios, PTU sizing (Microsoft's method) and report rows.

### Web app (`apps/web`, Next.js 15, Tailwind v4, Zustand)
- Pages: Overview (timeline across build and production), Build, Run, Value & ROI, Capacity (PTU), Token calculator, Prices, Settings, Projects, Report.
- Projects are saved in the browser, with templates, undo/redo, and Excel, CSV and printable report export.

### Price refresh scripts (`scripts/prices`)
- Azure Retail Prices API in CAD, with meter mapping and a report of unmapped meters.
- Snowflake Credit Consumption Table PDF parser.

## How to test

```bash
pnpm install
pnpm test        # 121 tests (engine, catalogue, price scripts)
pnpm typecheck
pnpm dev         # http://localhost:3000, then "New copy of the sample"
pnpm prices      # refresh CAD prices (needs internet access)
```

## Known limitations

- `pnpm prices` has not been run against the live Azure API or the Snowflake PDF; both were blocked in the build environment.
- Fine-tune prices are unverified, and Snowflake credit rates are low-confidence.
- Some benchmarks are low-confidence or vendor-funded. The app shows this next to each one.
- The sensitivity tornado moves one input at a time; the combined cases show bounds, not probabilities.
