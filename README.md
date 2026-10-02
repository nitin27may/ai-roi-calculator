# AI Cost & ROI Studio

A local, offline calculator for what an AI use case costs to **build** and to **run**, and whether it pays back. Everything is priced in **CAD**, and the only providers are **Azure** (Foundry models including Claude on Foundry, Speech, Document Intelligence, Content Understanding, AI Search, Content Safety, evaluation) and **Snowflake Cortex**.

- **Build.** Labour from a rate card by delivery phase, plus the **AI Dev Lab**: the tokens and AI services the team uses while building. That covers model bake-offs across candidate models, harness iterations, nightly regression, Foundry evaluation, AI red teaming, the playground and AI coding tools.
- **Add, remove and rename items.** Dev Lab activities and production workloads can be added from templates, removed or renamed.
- **Run.** Production workloads: transcription with every speech engine side by side, documents, email, embeddings, AI Search sizing, retrieval, chat, agent harnesses at P50, P90 or worst case under caps, continuous evaluation, Content Safety and platform costs.
- **Value & ROI.** Measure benefits against running cost only, running plus maintenance, or the full lifecycle. You get payback month, ROI, NPV at your discount rate, and cost and benefit by year.
  - **Benefits:** time-saving capabilities, avoided costs with start months, and one-off benefits.
  - **Costs and assumptions:** transition costs in month windows, yearly growth and rate escalation.
  - **ROI by capability:** linked workloads are direct cost, and shared cost is split pro rata. Anything left over is shown as unallocated, with the reason.
  - **Scenarios:** swap a model, change usage, build length or team size, or apply a lever, then compare against the baseline and adopt the one you want.
- **Savings levers.** Concrete changes (Batch for regression, narrowing the bake-off, model routing, cheaper speech engines…), each with the saving it would give.
- **Token calculator.** Quick estimates with no project: text (exact o200k count in the browser), documents (every route compared), audio, and a single agent run.

## Run it

Requires Node 20+ and pnpm 10.

```bash
pnpm install
pnpm build      # builds the web app
pnpm --filter @studio/web start   # http://localhost:3000
# or, while developing:
pnpm dev
```

The app makes no network calls while you use it. Projects are saved in the browser. Use **Save to file** / **Open file** to keep `*.aicost.json` copies.

## Prices

The catalogue lives in `packages/catalog/data/*.json`, and every price is CAD. Each entry records its source, retrieval date and a confidence level (`verified`, `cross-checked`, `single-source`, `unverified`), plus promo windows and retirement dates. The app uses these to warn you when a promo ends or a model retires inside your plan.

```bash
pnpm prices:azure       # Azure Retail Prices API (currencyCode=CAD) → updates Azure entries, reports unmapped meters
pnpm prices:snowflake   # Snowflake Credit Consumption Table (PDF) → updates Cortex credit rates
pnpm prices             # both
```

Items with no price API are curated by hand in the same JSON files. These include the semantic ranker free tier, agentic retrieval, the Foundry evaluation meter, Content Safety sub-features and MAI promos. Keep `source.retrievedAt` current when you edit them.

## Layout

```
apps/web            Next.js app (Tailwind, local fonts, Zustand store)
packages/catalog    CAD price catalogue (JSON) + Zod schemas + token heuristics
packages/engine     Pure TypeScript cost engine: harness simulator, workloads, AI Dev Lab, monthly ledger, ROI, levers
scripts/prices      Local price fetchers
docs/               Research notes, design, plan, mockup
```

## Checks

```bash
pnpm test        # engine and catalogue tests
pnpm typecheck
```
