# AI Cost & ROI Studio

A local, offline calculator for what an AI use case costs to **build** and to **run**, and whether it pays back. Everything is priced in **CAD**, and the only providers are **Azure** (Foundry models including Claude on Foundry, Speech, Document Intelligence, Content Understanding, AI Search, Content Safety, evaluation) and **Snowflake Cortex**.

> **Picking this up on a new machine?** Start with [docs/HANDOVER.md](docs/HANDOVER.md): setup, price refresh, code map and open items.

- **Build.** Labour from a rate card by delivery phase, plus the **AI Dev Lab**: the tokens and AI services the team uses while building. That covers model bake-offs across candidate models, harness iterations, nightly regression, Foundry evaluation, AI red teaming, the playground and AI coding tools.
- **Workstreams and people.**
  - A workstream is a feature with one or more agents. Each team line (a named seat or a role count) gets a share of its time per workstream; whatever is left is project-wide work.
  - Iterations and playground work in a workstream scale with the people on it.
  - Bake-offs, regression and red teaming in a workstream run once, however many people share it, so a shared agent is not counted twice.
  - Labour follows the shares.
  - A capability that links a workstream carries that workstream's build cost into its own ROI.
  - Breakdowns are available by workstream, by person (with an optional monthly AI budget per person and over-budget months highlighted) and by model.
- **Workstream templates.** Single agent, RAG feature, multi-agent feature (planner and worker harnesses) and shared component. Each sets up its harnesses and scoped activities across the build; people are allocated separately.
- **Synthetic data and fine-tuning.**
  - Synthetic data: generation ÷ pass rate, with an optional judge filter and Batch.
  - Fine-tuning: training per 1M tokens (or per hour for RFT) plus hosting hours. Fine-tune prices are unverified list prices.
- **Editable dev environment.** Add, remove and re-price the services the team runs while building.
- **Benefit evidence.** Capabilities can come from a benchmark library ported from workgraph: 12 capabilities, each with sources, a confidence rating and a vendor-funded flag.
  - Hours are worked out per task, per user-week or per item in a queue.
  - Gross hours × realisation = net hours, valued at the role's rate.
  - Presets (conservative / typical / optimistic) pick each benchmark's saving and the default adoption and realisation.
  - Adoption and realisation can be overridden for the project or per capability.
  - Licence overlap (e.g. Microsoft 365 Copilot) is deducted.
  - Each capability can go live in its own month.
  - Savings are capped at the task's baseline.
  - Capabilities entered as net hours are left alone.
- **Avoided headcount.** An avoided cost can be FTE × hours × the role's rate (rising with rate escalation). A warning flags a likely double count with time saved at the same role.
- **Before / after.** The work's monthly cost today, from benchmark baselines across all users plus avoided costs, against the cost with AI (remaining time, AI usage, platform and maintenance).
- **Sensitivity.** A tornado of NPV for ten inputs, each moved one at a time: savings column, adoption, realisation, users, value of time, delivery rates, AI run volume, build length, adoption ramp and growth. It also shows the combined cases: everything at its low end and everything at its high end.
- **Capability volume from workloads.** A capability can take its users (or queue items) from a workload, so the number is entered once and moves with the workload.
- **Month plan.** Every Dev Lab activity has an intensity per build month (sweeps for bake-offs), set in a grid or by applying a shape (ramp up, front-loaded, final third only).
- **Optional labour, evaluation and maintenance.**
  - Untick "Include labour cost" to cost AI spend only.
  - Mark a workstream as not evaluated.
  - Set maintenance to None.
- **Add, remove and rename items.** Dev Lab activities and production workloads can be added from templates, removed or renamed.
- **Run.** Production workloads: transcription with every speech engine side by side, documents, email, embeddings, AI Search sizing, retrieval, chat, agent harnesses at P50, P90 or worst case under caps, continuous evaluation, Content Safety and platform costs.
- **Value & ROI.** Measure benefits against running cost only, running plus maintenance, or the full lifecycle. You get payback month, ROI, NPV at your discount rate, and cost and benefit by year.
  - **Benefits:** time-saving capabilities, avoided costs with start months, and one-off benefits.
  - **Costs and assumptions:** transition costs in month windows, yearly growth and rate escalation.
  - **ROI by capability:** linked workloads are direct cost, and shared cost is split pro rata. Anything left over is shown as unallocated, with the reason.
  - **Scenarios:** swap a model, change usage, build length or team size, or apply a lever, then compare against the baseline and adopt the one you want.
- **Savings levers.** Concrete changes (Batch for regression, narrowing the bake-off, model routing, cheaper speech engines…), each with the saving it would give.
- **Capacity (PTU).** Sizes provisioned throughput for each production model the way Microsoft does. It compares pay-as-you-go with PTU billed hourly, on a 1-month reservation and on a 1-year reservation. It shows utilisation and the utilisation needed to break even, and includes a calculator for sizing a single deployment.
- **Projects.** Keep several projects in the browser and create new ones from templates: meeting intelligence, contract RAG, email triage agent, call-centre voice agent, or blank. Each project card shows build cost, run-rate and payback. Projects can be opened, duplicated or deleted.
- **Export.** An Excel workbook (summary, months, line items with formulas, ROI by capability, assumptions, and prices used with source and confidence), a CSV of line items, and a printable report you can save as PDF.
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
