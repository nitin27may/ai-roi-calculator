# AI Cost & ROI Studio — consolidated design

Mockup: `docs/design/mockup.html` (open locally in a browser; also shared as a private claude.ai page).
Supersedes the scope split in PLAN.md §0/§11: the token calculator and the ROI calculator are **one app**.

## Decisions (2026-10-02)
| Topic | Decision |
|---|---|
| Runtime | **Local and offline.** `pnpm dev` / `pnpm start` on the user's machine. No hosting, no sign-in, no cloud database. |
| Persistence | Browser storage plus project files (`*.aicost.json`) that can be saved and opened. |
| Currency | **CAD only.** Every price is stored and shown in CAD. |
| Providers | **Azure** (Foundry models including Claude on Foundry, Speech, Document Intelligence, Content Understanding, AI Search, Content Safety, evaluation, infrastructure) and **Snowflake** (Cortex). No direct Anthropic, OpenAI or Google. |
| Discounts | None. List prices only. |
| Price updates | Local fetch scripts that crawl the sources and rewrite the JSON catalogue: `pnpm prices`, `pnpm prices:azure`, `pnpm prices:snowflake`. The app itself makes no network calls. |
| Stack | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; a pnpm workspace with a pure-TS `engine` and `catalog`. |

## 1. The core idea: one timeline, three cost streams, one benefit stream
Every project is a single month-by-month timeline:

```
 Month:      1 ............ B | B+1 .............................................. H
 Phase:      BUILD            | PRODUCTION (adoption ramps 0 → 100% over R months)
 Streams:    Build labour     |
             AI Dev Lab       |
             Dev environment  |
                              | Production AI usage   (scales with adoption)
                              | Platform & infra      (fixed from go-live)
                              | Maintenance           (labour or % of build)
 Benefit:                     | Benefit               (scales with adoption × preset)
```

Every screen is a view onto this timeline:
- **Overview** shows the whole timeline: KPIs, stacked cost by month, benefit line, cumulative net, and warnings.
- **Build** edits the Build-phase streams.
- **Run** edits the production streams.
- **Value & ROI** edits the benefits and picks which streams count as cost.

## 2. Shared definitions, two usage profiles
The same agent harness, evaluation suite and document pipeline exist during development and in production. They are used very differently:

| | Build (AI Dev Lab) | Run (production) |
|---|---|---|
| Who drives volume | developers and automation | end users |
| Volume unit | eval cases × models × repeats × sweeps; iterations per developer per day; nightly runs | tasks, conversations, pages, hours per month |
| Models | many candidates, narrowing month by month | one, sometimes two with routing |
| Cache hit | low (prompts change constantly), default 30% | high, default 80% |
| Evaluation | every case scored | sampled, e.g. 5% |
| Red teaming | scans per sprint, mostly before go-live | per release |

So a project has **definitions**: harnesses, eval suites, document pipelines, chat flows. Their per-unit cost per model is computed once, for example "one harness run on gpt-5.4 = CAD 0.38 at P50". Build activities and Run workloads then reference those definitions and multiply by their own volumes. If a developer changes the harness (more tools, more steps), both the Build burn and the production run-rate update.

## 3. Build phase = labour + AI Dev Lab + dev environment
### 3.1 Labour (from the rate card)
Roles and rates (CAD/h). Team lines are entered as people × months × hours/month, or as phases. Contingency %. This is ported from an earlier internal calculator's delivery model.

### 3.2 AI Dev Lab (the new part)
These are activities that consume tokens and AI services while the app is built. The "6-month build, 2–3 developers running agents around the clock" case is modelled explicitly.

| Activity | Inputs | Formula per month m |
|---|---|---|
| **Model bake-off** | candidate models (each with an active window M1–Mx), eval cases, repeats, sweeps per month | Σ over active models: cases × repeats × sweeps[m] × harnessRunCost(model, devCache) |
| **Harness iterations** | developers, iterations per dev per day, working days, subset size, chosen model(s), early-month factor | devs × iters × days × subset × harnessRunCost(chosen) |
| **Automated / overnight regression** | on/off, runs per night, nights, full dataset, model(s), starting month | nights × runs × cases × harnessRunCost |
| **Foundry evaluation** | evaluators (template tokens from the SDK), judge model, share of runs scored, safety evaluators | scoredCases × Σ evaluators judgeCost + safety-meter tokens |
| **AI red teaming** | scans per month, categories, objectives, strategies, multi-turn depth, active months | scans × categories × objectives × (1 + strategies) × (targetCost + safetyCost) |
| **Playground & prompt work** | calls per dev per day, tokens per call, model | devs × calls × days × callCost |
| **AI coding tools** | GitHub Copilot seats (CAD/seat) and/or Claude-on-Foundry coding tokens per developer | seats × price + devs × tokenBudget |
| **Batch share** | % of offline runs sent through Batch (−50%) | applied to bake-off and regression |

**Monthly profile.** A preset like "Typical agent build" sets which activities are active in which months and with what intensity:
- Explore (M1–2): wide bake-off, playground-heavy.
- Build (M3–4): iterations, nightly regression, two models.
- Harden (M5–6): one model, full evaluation, red teaming.

The user edits the activity × month grid directly. The mockup's heat-table is that grid.

**Outputs:**
- AI Dev Lab spend per month, by activity and by model
- spend per developer per month
- **"AI Dev Lab spend = N months of production"**
- share of Build cost that is AI vs labour

### 3.3 Dev environment
Fixed monthly infrastructure during the build: AI Search Basic, Container Apps dev, App Insights, Storage, Foundry project. It uses the same components as production infrastructure, at dev SKUs.

## 4. Run phase = AI consumption + platform + maintenance
Workloads are grouped as in the mockup:

| Group | Workloads |
|---|---|
| Ingestion | documents (OCR vs direct-to-LLM), emails and attachments, **speech-to-text** (every engine: MAI-Transcribe, Speech batch/fast/real-time, gpt-4o(-mini)-transcribe, Whisper, Content Understanding audio, Snowflake AI_TRANSCRIBE), summaries |
| Retrieval | embeddings, AI Search tier sizing, semantic ranker, agentic retrieval, rerankers, Cortex Search |
| Conversation | RAG chat with history growth |
| Voice | real-time voice agent, or cascaded STT → LLM → TTS |
| Agents | harness runs at P50 / P90 / worst-under-caps |
| Quality & safety | continuous evaluation, Content Safety, Prompt Shields |
| Platform | Container Apps, App Service, AKS, APIM, Key Vault, Storage, App Insights, Cosmos/Postgres/Redis, private endpoints. Ported from an earlier internal calculator's infrastructure types. |

**Cost behaviour.** Each line is either `usage` (scales with adoption) or `fixed` (from go-live). This is stored in the catalogue, not inferred from category names.

**Maintenance.** Entered as labour (FTE × rate) or as % of build per year.

## 5. Value & ROI
- **Benefits** (ported from an earlier internal calculator's ROI model):
  - capabilities with time saved, valued at role rates, adoption and realisation
  - avoided costs: licences retired, headcount avoided
  - one-off benefits
  - conservative / typical / optimistic presets
- **Cost basis selector:**
  - **Running cost only.** Production AI + platform vs benefit. Answers "does it pay for itself once built?"; this is how an existing app is judged.
  - **Running + maintenance.**
  - **Full lifecycle.** Build labour + AI Dev Lab + dev environment + run + maintenance.
- **Levers:**
  - "Reduce development cost by x%" and "reduce maintenance cost by x%" as what-if sliders
  - benefit preset
  - later: model swap ("what if production used gpt-5.4-mini") and adoption ramp length
- **Outputs:** payback month, ROI over the horizon, cost and benefit by year, cumulative cash chart, unallocated-cost explainer (ported).

## 6. Quick tools (no project needed)
A **token calculator** with input modes:
- **Text:** paste text and count per tokenizer family.
- **Documents:** pages, comparing every route (OCR + LLM, direct-to-LLM per model, Snowflake parse).
- **Audio:** hours across every speech engine.
- **Emails:** volume and attachments.
- **Agent run:** single run, P50/P90/worst.

Each result has **Add to project**, which turns it into a workload or a Dev Lab activity.

## 7. Prices (CAD, offline)
- **Azure:** Retail Prices API with `currencyCode='CAD'`, so Azure prices are native CAD and need no FX. The fetcher is lifted from the earlier calculator (`retail.ts`, `match.ts`), with discovery and an unmapped-meter report added. The seed is that calculator's `canadacentral.CAD` set (2026-09-17).
- **Snowflake:** bills in credits.
  - Project settings take **CAD per AI credit** and **CAD per platform credit** directly, so no FX table is needed.
  - Defaults are derived once from the USD list price and written into the catalogue as CAD.
  - Credits per model and function come from the Credit Consumption Table PDF (`pnpm prices:snowflake`).
- **Curated items with no API** (semantic ranker extras, evaluation meter, Content Safety features, MAI promos) live in `data/catalog/manual/*.json`, each with `verifiedAt` and a source URL.
- Every entry carries `effectiveFrom/To`, promo and deprecation dates, and a confidence level. These drive the warnings shown on the Overview.

## 8. Engine contract (summary)
```
Project → definitions (harness, evalSuite, docPipeline, chatFlow) → unitCosts per model
        → buildActivities × monthProfile → BuildLines[m]
        → workloads × adoption(m) → RunLines[m]
        → maintenance → MaintLines[m]
        → benefits × adoption(m) × preset → Benefit[m]
        → aggregate per meter per month (free tiers once per meter) → MonthLedger[1..H]
        → ROI(basis, levers) over MonthLedger
```
Every line carries a quantity, unit, unit price in CAD, meter ref, formula trace, cost behaviour and stream (build/run/maint). The "explain" popover reads the trace.
