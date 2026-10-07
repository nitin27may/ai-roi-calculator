# Maintainer notes: ROI Calculator

How to set the project up, run the app, refresh prices, and continue development.

- **Repository:** https://github.com/nitin27may/roi-calculator
- **Rename note, 2026-10-06: the product is now "ROI Calculator" (formerly "AI Cost & ROI Studio"). Workspace packages are `@roi-calculator/engine|catalog|web` (formerly `@studio/*`), the root package is `roi-calculator`, the project file schema id is `roi-calculator/project`, and browser storage keys use the `roi-calculator:` prefix. Old project files (`ai-cost-roi-studio/project`) and old storage keys are still read. The GitHub repository and local folder were `ai-roi-calculator` and are renamed to `roi-calculator` after this change merges (repo rename pending).

---

## 1. Set up

**Requirements**

- **Node.js 22** (built and tested on 22.22).
- **pnpm 10.** It is pinned in `package.json` as `pnpm@10.28.0`; `corepack enable` picks the pinned version up.
- **Git.**

```bash
git clone https://github.com/nitin27may/roi-calculator.git
cd roi-calculator
corepack enable          # once per machine
pnpm install
pnpm test                # expect: 121 passed
pnpm typecheck           # expect: no output
pnpm dev                 # http://localhost:3000
```

**First run in the browser:**

1. Projects are saved in the browser, under `localStorage` key `roi-calculator:library`. Browsers that saved projects before the rename have them under `ai-cost-roi-studio:library`; on first load `apps/web/lib/storage-migrate.ts` copies old keys (`ai-cost-roi-studio:*` and `studio.*`) to the new `roi-calculator:` names once, and leaves the old keys in place, so a new machine or browser starts with the sample project.
2. To move projects between machines, use **Save to file** (`*.aicost.json`) on the old machine and **Open file as new project** on the new one.
3. If a browser has an older copy of the sample, use **New copy of the sample** to get the current one: workstreams, named developers, benchmark-based capability.

**Production build** (faster to click through):

```bash
pnpm --filter @roi-calculator/web build
pnpm --filter @roi-calculator/web start     # http://localhost:3000
```

**Sharing a URL for a demo** (the app stays on your machine):

```bash
cloudflared tunnel --url http://localhost:3000    # prints a https://….trycloudflare.com address
```

---

## 2. Refresh prices (do this first on a networked machine)

The first live run was on 2026-10-02 (reports dated 2026-10-03, UTC). It needed the mapping fixes listed under "Gotchas from the first live run" below; both scripts now run clean (Azure: 0 mapping errors; Snowflake: 21 of 21 entries matched).

```bash
pnpm prices:azure --check        # dry run: writes reports/prices-azure-<date>.md, changes nothing
pnpm prices:azure                # writes packages/catalog/data/*.json and meta.asOf
pnpm prices:snowflake --check    # downloads the Credit Consumption Table PDF and reports matches
pnpm prices:snowflake            # writes the Snowflake credit rates
pnpm validate                    # catalogue check + list of prices that still need a human look
pnpm test                        # must stay green after a refresh
```

**Azure (`scripts/prices/azure.ts`)**
- Queries the Retail Prices API with `currencyCode=CAD` for `canadacentral`. Change the region with `--region`.
- Each price is matched by the regex rules in `scripts/prices/azure-map.ts`. A rule must match **exactly one** meter, otherwise it is reported as an error.
- Meters that no rule matches are listed as "unmapped" in the report. Add a rule for each one that matters.
- Responses are cached in `.cache/prices/<date>/`. Delete that folder to force a fresh download.

**Snowflake (`scripts/prices/snowflake.ts`)**
- Reads the AI features table of the PDF. Pass a downloaded copy with `--pdf path/to/CreditConsumptionTable.pdf`.
- Every number it reads is written to the report together with the surrounding text. Read the report before trusting the numbers.

**Everything is CAD; USD-only prices follow the exchange rate**
- Azure prices come from the Retail API in CAD wherever a meter exists.
- Prices Microsoft publishes only in USD (Claude on Foundry, GPT-6.1 Sol until it gets a meter, MAI-Transcribe, preview tools, fine-tuning) are kept as USD in `packages/catalog/data/usd-list.json`, one entry per catalogue item and one key per field path.
- `pnpm prices:azure` first measures Azure's own CAD/USD rate (the ratio of the same meters in both currencies, about 5,000 of them), stores it in `meta.json` as `fx`, converts every `usd-list.json` price, and then applies CAD meters on top. A CAD meter always wins over a USD price.
- The Prices page and the report state the rate. On 2026-10-02 it was 1.41655, the same figure Azure's pricing page embeds for October.
- When a USD-only model gets a Retail API meter, add its pattern to `azure-map.ts` and remove it from `usd-list.json`.

**Deployments: Global, Canada Regional or US Data Zone, per workload (decided 2026-10-04)**
- Settings holds the project's default deployment; every Azure workload on the Run page has its own Deployment dropdown ("Project default" unless changed). Typical setup: chat on Canada Regional or US Data Zone, transcription on Global.
- **Global Standard**: every Foundry model, including the OpenAI audio and realtime models (gpt-4o-transcribe family, gpt-transcribe, realtime). Requests can be processed in any Azure region.
- **Azure Speech and MAI-Transcribe are not Foundry deployments.** They run in an Azure Speech (Cognitive Services / Foundry Tools) resource, so for them the deployment means where the resource is: Canada Regional = a resource in Canada (Azure Speech only; MAI-Transcribe is not offered in Canada), Global and US Data Zone = a resource in a US region such as East US. Their `via` says "Azure Speech (Cognitive Services)".
- The transcription comparison on the Run page marks engines the workload's deployment does not offer ("Global only") and its button switches both engine and deployment ("Use on Global").
- **Canada Regional Standard** (data stays in Canada): only gpt-4o (2024-11-20), gpt-4.1-mini, the three OpenAI embedding models and Azure Speech. Canada Central has no Regional Standard column at all in Microsoft's matrix. Prices come from the Canada East "regnl" meters, about 1.1x US Data Zone.
- **US Data Zone Standard** (East US / East US 2): all GPT-5.x and GPT-6 except the 5.1/5.2 codex variants and 5.4-pro (Global only), older GPT and o-series models, Claude Opus 5.5 / Opus 5 / Opus 4.8 / Sonnet 5.5 / Sonnet 5, DeepSeek V4 Pro, Grok 4.3 and Mistral Large 3. MAI-Transcribe and Whisper run in US regions and count as available.
- **Global only:** every OpenAI audio and realtime model, Anthropic-hosted Claude models and Haiku 4.5, MAI-Thinking/Cyber/Code, Llama 4 Maverick, the 5.1/5.2 codex variants and 5.4-pro. Cohere Embed v4 is in no region table (offered nowhere until confirmed). MAI-DS-R1 is retired (2026-02-27).
- **Availability is `availableIn` on each entry**, taken from Microsoft's region tables (MicrosoftDocs/azure-ai-docs `foundry-models/includes/model-matrix/deployments-standard.md` and `marketplace-deployments-standard.md`, repo snapshot 2026-10-03). It is curated by hand: the Retail API has Data Zone meters for models Microsoft does not offer under Data Zone (5.1 codex), so a price never implies availability.
- Model pickers list what the project's deployment offers first and label the rest "(not offered in …)". A workload that uses one is priced at the closest tier and Overview shows a "Not offered" note.
- The Prices page is the filterable catalogue: offered in, platform, type, vendor, status, with the Global, Canada Regional and US Data Zone price side by side.
- **Per-1K meters are rounded to 4 decimals in CAD** (gpt-4.1-mini regional showed 0.0007 for 0.000686). The refresh replaces them with the USD twin × the rate (`preciseRows`).

**Model coverage (2026-10-02); see the deployment section above for what each deployment offers**
- Azure OpenAI: GPT-5.1 and later, including codex, codex-mini, codex-max and pro variants, GPT-5.6 sol/terra/luna and GPT-6 astra/sol/luna, from Retail API meters. GPT-6.1 Sol is USD-only for now. Retired chat variants (gpt-5.1/5.2/5.3-chat) are not in the catalogue. Older models (gpt-5, 4.1, 4o, o-series) are kept for existing projects.
- Claude on Foundry: every model Microsoft lists (Fable 5.1/5, Opus 5.5/5/4.8/4.7/4.6/4.5, Sonnet 5.5/5/4.6/4.5, Haiku 4.5) at Anthropic's USD list price. Data Zone (US, 1.1x) only for the Azure-hosted ones: Opus 5.5, Opus 5, Opus 4.8, Sonnet 5.5, Sonnet 5. `batchDiscount` is 0 because Foundry documents only the Messages API for Claude.
- MAI: Thinking-1, Cyber-1-Flash, Code-1.1-Flash and DS-R1 from Retail API meters; MAI-Transcribe-2 and 1.5 from USD prices. MAI image models are not modelled (the app has no image workload).
- Transcription: Azure Speech real-time, batch and fast (canadacentral meters), Whisper, gpt-transcribe, gpt-live-transcribe, gpt-realtime-whisper, gpt-4o-transcribe, gpt-4o-transcribe-diarize, gpt-4o-mini-transcribe (2025-12-15), MAI-Transcribe.

**Prices to confirm by hand** (`pnpm validate` lists all of them):
- **Fine-tuning** (`ft-train-*`, `ft-hosting`): USD list prices, marked `unverified`.
- **MAI-Transcribe-2 Streaming:** no official SKU found; the entry is kept because the Run page uses it, marked `unverified`.
- **Long-context threshold for GPT-5.5, 5.6 and 6.x:** 272K input tokens, as for GPT-5.4. Microsoft documents the number only for 5.4.
- **Context and output limits** for MAI-Cyber-1-Flash, MAI-Code-1.1-Flash and MAI-DS-R1 are not published; the catalogue uses 256K/32K and 128K/32K.
- **Snowflake Cortex credit rates:** check the PDF context in the report after each refresh.
- **Benchmarks:** several are low-confidence or vendor-funded. The app shows this next to each benchmark.

**Gotchas from the first live run**
- **`--check` exits 1 whenever any price changed.** That is drift detection, not a failure; read the report.
- **Azure renames meters without notice.** On 2026-10-02: `embedding-ada-glbl-new` became `embedding-ada-glbl`, transcribe text output went from `txt-opt` to `txt-out`, and Language moved from `S Text Records` to the tiered `Standard Text Records` (tier 0 is used).
- **`gpt-transcribe` is billed under the product `Azure OpenAI Media`**, not the chat products. `SPEECH_PRODUCTS` in `azure-map.ts` fetches it.
- **Most Azure "changes" can be exchange-rate moves.** On 2026-10-02 almost every CAD price moved by +2.2% at once.
- **The Snowflake PDF text has spaced separators** ("claude - sonnet - 4 - 5", "AI_EXTRACT – arctic - extract") and footnote markers between a name and its rate ("5", "5 , 22"). The parser accepts both and reads only decimal numbers as rates.
- **The Snowflake parser reads Table 6(a), the AI_COMPLETE rates.** Tables 6(b) to 6(e) price the same models differently (prompt caching, REST, CoWork, CoCo). Rows that say "See … below" are skipped in favour of the later row in Table 6(g).
- **MAI Global meters are priced per region** (MAI-Thinking-1 cached input is 0.2833 in East US 2, 0.3541 in US Gov). The refresh takes Canada first, then East US 2 (`GLOBAL_REGIONS`).
- **Data Zone has two prices** (US 1.1x, EU 1.2x) under the same meter name; the US one is used (`DZ_REGIONS`). Data Zone meter names vary: "Dz", "DZ", "Dzone", "Data Zone", "DataZone".
- **A catalogue entry with Data Zone prices but no Data Zone meter is a mapping error**, not a deletion: an earlier version silently dropped Data Zone prices when the pattern missed.
- **Engine tests read rates from the catalogue**, so a refresh should not break them. If a test does break after a refresh, it has a hard-coded price.

Commit refreshed catalogues together with the generated report so every price change has a record:

```bash
git checkout -b prices/$(date +%F)
git add packages/catalog/data reports
git commit -m "Refresh CAD prices $(date +%F)"
git push -u origin HEAD && gh pr create --fill --base main
```

---

## 3. How the code is organised

```
apps/web                 Next.js 15 app (App Router, Tailwind v4, Zustand)
  app/<page>/page.tsx    overview, build, run, roi, capacity, tokens, prices, settings, projects, report
  components/            shell (nav, KPI bar, undo/redo), charts, fields (form specs), add-menu, explain
  lib/                   store (project library, undo), compute (ledger hooks), export (xlsx/csv), format
packages/catalog         CAD price data (data/*.json), Zod schemas, heuristics, benchmarks
packages/engine          pure TypeScript cost engine; no UI or network code
  src/project.ts         the project file schema (Zod) — the contract for *.aicost.json
  src/pricing.ts         PriceBook: date-aware prices, Data Zone, long context, tokenizer factors, credits
  src/harness.ts         per-step agent harness simulation (P50 / P90 / worst)
  src/workloads.ts       production workloads → cost lines
  src/devlab.ts          AI Dev Lab activities → cost lines; labour lines; per-month effort per person
  src/workstreams.ts     build cost by workstream, by person (budget check), by model
  src/ledger.ts          monthly ledger: build months, then production; benefits; totals
  src/roi.ts             payback, NPV, by year
  src/benefits.ts        capability hours (benchmarks, adoption, realisation), avoided cost, before/after
  src/allocation.ts      ROI per capability (workload and workstream links)
  src/sensitivity.ts     tornado and combined low/high cases
  src/scenarios.ts, levers.ts, ptu.ts, report.ts, plan.ts, templates.ts
  src/samples/           meeting-intelligence sample and project templates
  test/                  vitest suites (engine behaviour and scenarios)
scripts/prices           live price refresh (Azure Retail API, Snowflake PDF) and their tests
scripts/seed             seed_catalog.py: original catalogue generator (keep in sync if you rerun it)
scripts/validate-catalog.ts   `pnpm validate`
docs/research            vendor and service research notes (01–08)
docs/PLAN.md, DESIGN.md  plan and design decisions (DESIGN.md wins where they differ)
```

### Core ideas (read before changing the engine)

**The ledger**
- One monthly timeline per project: build months first, then production months up to the horizon.
- Each cost is a line with a stream: `labour`, `devlab`, `devenv`, `run`, `platform`, `maint` or `transition`.
- Each line carries a formula string, which is how the app explains every number.

**Production**
- Usage lines scale with the adoption ramp and growth; fixed lines are billed in full.
- `runRate` is taken at the first month of full adoption.

**AI Dev Lab**
- *Effort-driven* activities (iterations, playground) scale with the people on the activity's workstream, or with everyone when the activity is project-wide.
- *Artefact-driven* activities (bake-off, regression, red teaming) run once per workstream.
- Evaluation scores the runs of the other activities in its scope.
- People have allocations: a share of their time per workstream, optionally limited to some months. One person can have several periods on the same workstream.
- Allocations above 100% in a month are scaled down to 100% for that month.

**Benefits**
- Each capability is worked out in one of four ways: net hours, per task, per user-week or per queue item.
- Gross hours × realisation = net hours, valued at the role's rate.
- Presets pick each benchmark's saving and the default adoption and realisation.
- A saving is capped at the task's current duration.

**ROI**
- `basis` chooses which streams count as cost: `run`, `runMaint` or `full`.
- A capability that links a workstream carries that workstream's build cost into its own ROI.

**Optional parts.** Labour (`build.includeLabour`), maintenance (`mode: "none"`) and evaluation (per workstream) can each be switched off.

### Adding things

**A new workload type**
1. Add it to `WorkloadSchema` in `project.ts`.
2. Add its lines in `workloads.ts` and its defaults in `newWorkload` (`templates.ts`).
3. Add its form fields in `WORKLOAD_SPECS` (`apps/web/components/fields.tsx`).
4. Add a test.

**A new Dev Lab activity**
1. Add it to `DevActivitySchema`, including `...Scope` and `monthFactors`.
2. Add a `case` in `devLabLines`, with defaults in `newActivity` and an entry in `ACTIVITY_KINDS`.
3. Add its form fields in `ACTIVITY_SPECS`, and a line in `describe()` in `apps/web/app/build/page.tsx`.
4. Add a test.

**A new price or model**
1. Add the entry to `packages/catalog/data/*.json` with `source` and `confidence` (prices can start at 0).
2. If the Retail API carries it, add a meter rule in `scripts/prices/azure-map.ts`. Otherwise add its USD list prices to `usd-list.json`.
3. Run `pnpm prices:azure` to fill the CAD prices.

**A new benchmark:** add it to `packages/catalog/data/benchmarks.json` with its source, confidence and `vendorFunded` flag.

**Project file changes**
- Keep new fields optional, or give them defaults, so saved `*.aicost.json` files keep loading.
- A project that fails validation is dropped silently from the library, so test with an old file.

---

## 4. Checks before every push

```bash
pnpm test && pnpm typecheck && pnpm --filter @roi-calculator/web build
```

- `pnpm typecheck` does **not** cover `apps/web`; the Next.js build does. Run both.
- After changing the sample project, run `npx tsx scripts/sample-summary.ts` to print its headline numbers.

CI (`.github/workflows/ci.yml`) runs the same three on every pull request and on push to `main`. Branch protection on `main` requires it to pass.

---

## 5. Open items and ideas

| Item | Status |
|---|---|
| Set `main` as the default branch | Done 2026-10-02; old branch deleted |
| First live price refresh (Azure, Snowflake) | Done 2026-10-02; see the gotchas in section 3 |
| Confirm fine-tune and Snowflake rates | Snowflake confirmed from the 2026-10 PDF. Fine-tune rates are still USD-derived (`pnpm validate`) |
| CI workflow (test, typecheck, build) | Done 2026-10-02; required on `main` |
| Monte Carlo ranges for NPV (likelihood, not just bounds) | Idea, not started |
| Side-by-side comparison of two projects | Idea, not started |
| Mobile layout | Not designed for phones; built for desktop |

### Limitations to know

- **Sensitivity tornado.** It moves one input at a time; the combined cases are bounds, not probabilities.
- **Before/after.** It only covers capabilities with a baseline. Capabilities entered as net hours appear as a single saving line.
- **Prices.** They are list prices with no discounts. That was a deliberate project rule: CAD only, Azure and Snowflake only.
- **Storage.** Projects live in one browser's storage. Save to file to keep them safe.

---

## 6. Where the decisions are written down

- **`docs/DESIGN.md`:** design decisions and why they were made. Read this before redesigning a screen.
- **`docs/PLAN.md`:** the original plan and scope.
- **`docs/research/`:** pricing and behaviour research with sources, the starting point when a price looks wrong.
- **`README.md`:** the feature list.

## Hosting (Cloudflare Pages)

The web app is a static export (`output: "export"` in `apps/web/next.config.ts`; all state is in the browser, no server routes). It is published to the Pages project `token-calculator` at https://token-calculator-532.pages.dev. The Pages project keeps its original name because Cloudflare cannot rename a project, so the live URL did not change with the repository or product rename. A new site name is deferred; the deploy script keeps `--project-name token-calculator`. Deploy with `pnpm run deploy` from the repo root.

Gotchas:
- Use wrangler 3 for Pages. Wrangler 4 delegates `pages` commands to Workers auto-configuration and will not create or deploy a Pages project from this workspace.
- `pnpm deploy` is a built-in pnpm command and does not run the script; always use `pnpm run deploy`.
- Authenticate with `wrangler login`. Never put a Cloudflare token or account id in the repo.
- Adding a server route, middleware or `cookies()`/`headers()` call breaks the export. Build will fail; do not remove `output: "export"` to get around it.

## Batch and processing tiers

- `ProcessingTier` (`packages/catalog/src/schema.ts`) is `"standard" | "batch"` today; the enum stays open for `priority` and `flex`.
- `batchDiscount` is derived on every `pnpm prices:azure` run: 1 minus the Global Batch input meter over the Global standard input meter. No Batch meter means 0, because Azure does not offer Batch for that model.
- As of 2026-10-04 Batch meters exist for GPT-4 and o-series, GPT-5 to 5.5 (including 5.2 pro and 5.4 pro) at 50%. They do not exist for GPT-5.6, GPT-6, the Codex models, Claude or MAI, so those are 0. The refresh picks them up when Azure publishes them.
- GPT-5.6 has Standard (`Std`) and Priority (`PP`) meters. Priority and Flex are not modelled yet.
- `ChatModel.tiers` (optional) is where a future tier's price lives: `{ factor: number }` (a multiplier on the Standard price, like Batch) or `{ prices: TokenPrices }` (its own published CAD prices). `batch` keeps reading `batchDiscount` directly — `tiers.batch` only needs to exist once a model's Batch price stops being a flat factor off Standard, or a model has no `batchDiscount` data at all. `PriceBook.tierPricing()` (`packages/engine/src/pricing.ts`) is the one accessor both paths go through.
- `PriceBook.withPricing({ deployment, tier })` applies the tier after deployment resolution, the same way promo and long-context scaling do (`pricing.ts`, `applyTier`). `TIER_DEPLOYMENTS` in the same file lists which deployments a tier is offered under (`batch: ["global", "dataZone"]` — Azure Batch is not available under Canada Regional); a tier outside that list falls back to Standard with a `tier-unavailable` note, shown as an Overview alert.
- Adding **Priority** (or Flex) later is three steps, no engine rework:
  1. Add the enum value to `ProcessingTier` in `packages/catalog/src/schema.ts` and to `TIER_LABEL`/`TIERS` in `packages/engine/src/pricing.ts` (and `TIER_DEPLOYMENTS` if the tier has a deployment constraint — Priority is Global/Data Zone only, same as Batch).
  2. Map the `PP` (Priority) or `Flex` meter names in `scripts/prices/azure-map.ts` (next to `batchInputPattern`) and have `scripts/prices/azure.ts` derive and write the price onto `ChatModel.tiers.priority` (as `{ prices }` if Priority publishes its own CAD prices, which is what `PP` meters look like, rather than a flat factor).
  3. Catalogue data: once step 2's script run populates `tiers.priority` on the relevant models, it prices automatically — `settings.processingTier`, a workload's own `tier`, and the Settings/per-workload UI already offer every value in `ProcessingTier`.

## Token accuracy (P3)

- **Cache writes.** `PriceBook.chatCost` bills `cacheWrite` tokens at the model's own `cacheWrite` rate, falling back to `input` when the catalogue has none (no surcharge, no double count — written tokens replace the equivalent plain-input tokens, they aren't added on top). The agent harness (`harness.ts`) writes the static prefix (system prompt + tool definitions) once per cache lifetime, on the first step, for the share that isn't already warm; the `chat` workload writes the system prompt once per conversation (averaged across its turns, since one blended line covers the whole month). Below `heuristics.agents.minCacheableTokens` (1,024), nothing is ever cached or written — this applies to every `simulateHarness` caller (production agent, Dev Lab bake-off/iterations/regression).
- **Reasoning tokens.** `ChatModel.reasoning: boolean` marks reasoning models in the catalogue (o-series, GPT-5.x/6.x, Claude 4.5+ extended thinking, MAI-Thinking, DeepSeek R1-class). A `reasoning` setting ("none"/"low"/"medium"/"high" or an explicit token count, default `"none"`) now exists on the `chat` and `llm` workloads, transcription summaries, document enrichment, email triage, the retrieval planner, and the playground/synthetic Dev Lab activities; it bills as output tokens, and only on models the catalogue marks as reasoning models (`PriceBook.isReasoningModel`).
- **Language.** `settings.language` (default `"en"`) and an optional per-workload `language` scale a call's text input/output tokens by `heuristics.tokens.language`. Wired into `chat` and the generic `llm` workload; audio and page-based volumes are untouched by design. Not yet wired into the agent harness, document enrichment, the retrieval planner or Dev Lab.
- **Warm prefix at production volume.** The `agent` workload now passes `warmPrefix` to the harness once `tasksPerMonth` crosses `heuristics.agents.warmPrefix.tasksPerMonthThreshold` (1,000/month) — the idea being that at that volume, tasks run close enough together to stay inside the provider's cache TTL.
- **Tokenizer multiplier gaps.** Fixed in the voice cascade's LLM leg (`cascadeCall`), Dev Lab red-team probes and coding-agent tokens (`devlab.ts`) — all three previously priced every model as if it used the o200k tokenizer.
- **Long context.** `chat` now checks the turn whose own prompt (not the conversation average) first crosses the model's `longContext.threshold`, and splits the month's turns into a standard-rate line and a long-context-rate line by that share. The documents "direct to model" route carries a real `outputTokens` count (was always 0). No Claude catalogue entry has `longContext` — no verified Foundry long-context price was found for Claude, so none was added; don't invent one without a source.
- **Schema:** every new field is optional with a default, so existing saved `*.aicost.json` files keep validating and (aside from the fixes above, which are deliberate) keep their totals.

## Resource catalogue format (A2)

Typed infrastructure resources (VMs, App Service plans, databases) live in `packages/catalog/data/resources/<category>.json`, one file per category: compute, database, storage, messaging, network, security, monitoring, data, licences. Today only `compute.json` exists and it is **seed data** (three illustrative SKUs, prices marked `unverified`); A3 and A4 replace it with the refreshed catalogue.

- A file is `{ category, note?, types[], unitPrices[] }`. `loadCatalog` validates each file, merges `unitPrices` into `catalog.unitPrices` (so Prices & sources lists them) and exposes `catalog.resourceTypes`. To add a category, add its JSON file and one line to `RESOURCE_FILES` in `packages/catalog/src/index.ts`.
- A `ResourceType` has `inputs` (what the user enters), `meters` (billed quantities: an input times an optional factor, `hourly`, `scalesWithSize`), `options` (`payg`, `ri1`, `ri3`, `ahb`, `devtest`), an optional `retail` block for the refresh (A3), and `skus`. Each SKU maps meter ids to `unitPriceId`s. Adding a SKU is a data change only.
- A unit price is CAD per unit-month. For an `hourly` meter it is the cost of 730 hours, scaled by hours / 730 on pay-as-you-go.
- `UnitPrice.options.{ri1,ri3,ahb,devtest}` hold the other prices, each with its own `source`. `UnitPrice.manual { price, note, retrievedAt }` replaces the pay-as-you-go price, adds a "manual" note to the ledger and shows as "manual" in Prices & sources. The refresh must never overwrite it. Option prices stay as refreshed.
- A declared option with no price on a unit needs an explicit reason in `attrs["fallback.<option>"]` (for example `fallback.ahb` on a Linux VM). Free items set `attrs.free: true` (the only case where a price may be 0).
- Engine: `Project.resources[]` (`ResourceSchema`, default empty) priced by `resources.ts` `resourceLines`. Each resource is costed as production at 730 hours in the production months, stream `run`, fixed. A reserved term uses the reserved price when the type offers it, else pay-as-you-go with a note. Hybrid Benefit uses the `ahb` price. A project with no resources adds no lines (the v5 golden test depends on that). With environments (A6), `envIds` selects the environments a resource exists in.
- `packages/catalog/test/resources-coverage.test.ts` is the coverage gate: every SKU and meter has an existing price of 0 or more, every declared option has a price or a fallback note, every price has `retrievedAt`, and no price declared in a resource file is orphaned. The help entries for the resource fields (`resourceType` and friends) exist but no screen uses them yet, so `help.test.ts` does not cover them until A7.

## Current state and savings (A5)

- **Data:** optional `currentState: { lines: CurrentLine[] }` on the project (`CurrentLineSchema` in `project.ts`). Absent or empty means no lines, no ledger lines and no moved figure; `golden-v5.test.ts` stays unchanged. Read it through `currentLines(p)`.
- **Module:** `packages/engine/src/currentstate.ts` holds the maths and the wording helpers. The ledger adds `MonthBenefit.currentState` (saving per line id), which feeds `Month.benefit`, so ROI, payback, NPV, IRR, allocation (project-level benefit), the feature breakdown (follows the line's `featureId`) and the Months sheet pick it up with no other change.
- **Formulas.** Cost today: monthly = amount; fte = FTE x hours x role rate; perTransaction = unit cost x volume (entered, or the linked workload's items). Plan months count from the first build month; a change never starts before go-live. Saving in month m: keep 0; retire = cost from `fromMonth`; reduce = pct x cost from `fromMonth`, ramped by the adoption ramp from that month when `followsAdoption`. People lines escalate by `rateEscalationPctPerYear` each production year (like avoided headcount). A conditional line with `assumed: false` saves nothing. Confidence weights the saving.
- **`summarize().currentVsTarget`:** `currentMonthly` (all lines at go-live, before change), `targetMonthly` (ledger `runRate + maintRate`), `saving` (every change in effect, full adoption, confidence-weighted; also added to `totals.benefitRate`), `dualRunningCost` (over production months where run or platform cost is billed, the part of each line that is due to go but has not yet gone; lines blocked by an unassumed condition are excluded). `summarize().currentLineCount` hides the Summary tile and the extra Excel rows when there are no lines.
- **UI:** the Current state tab on `/roi` (`components/current-state.tsx`), the Current vs target card on Summary and Report, a Current state sheet and four Summary rows in Excel.
- **Gotchas:** an avoided cost or a time-saved capability for the same thing counts twice; the section help says so and nothing checks it. Per-transaction volume does not grow with `growthPctPerYear`. A brand-new line is "keep" so adding it moves nothing until a change is chosen. If A1 or A2 land first, expect small conflicts in `project.ts` and `PROGRESS.md`: keep both sides.

## Project types (A1, schema v6)

- `FeatureSchema.types` lists the kind of change (`newApp`, `enhancement`, `automation`, `replatform`, `saas`, `ai`); empty means not chosen and nothing is preselected. Set on the Run page, select the feature, "Type of change".
- `packages/engine/src/types.ts`: `projectTypes(p)`, `usesAi(p)` (an AI-typed feature, or any workload other than fixed and hosting, or any Dev Lab activity other than tooling), `hidesAiChoices(p)` and `showsAiPages(p)`.
- Gating is visibility only and never moves money. Capacity (PTU) leaves the sidebar, and AI workload and activity kinds leave the add menus, only when at least one feature has a type and none is AI and the project has no AI workloads or activities (menus: types chosen and none AI). Blank and legacy projects are unchanged. `/capacity` still opens by URL with a note. The pure helpers are in `apps/web/lib/nav.ts`.
- Migration 5 to 6 types `["ai"]` on features owning AI workloads or activities (via workstream or feature links, or the single feature when an item has no link) and `[]` on the rest. `golden-v5.test.ts` and its fixture are untouched.

## Environments model (A6)

Engine only; the page that edits environments is A7. Resources are defined once, as production. `Project.environments[]` (`EnvironmentSchema`, optional, default empty) says where and how they run.

- `EnvironmentSchema { id, label, production, sizeFactor (1), schedule: { hoursPerDay, daysPerMonth } | { hoursPerMonth } (730), fromMonth?, toMonth?, pricing: payg | devtest }`. Empty or absent `environments` means one implicit production environment at 730 hours in the production months, exactly the A2 behaviour (the v5 golden test depends on it). `Resource.envIds` selects the environments a resource exists in; absent means all defined environments, and it is ignored when none are defined.
- Cost per resource, environment and month = sum over the SKU's meters of quantity x option price x (hourly pay-as-you-go, Hybrid Benefit or dev/test meter ? hours / 730 : 1) x (meter scales with size ? size factor : 1). Reserved terms bill 730 hours whatever the schedule (size factor still applies); a scheduled environment on a reserved term adds a note. `pricing: devtest` uses the `devtest` option price when the type offers it and the unit has one, else pay-as-you-go with a note. A reserved term wins over dev/test.
- Billed months: `fromMonth` and `toMonth` bound them, and an absent bound is the edge of the default phase. Non-production defaults to the build months (1 to `buildMonths`), production to the production months (`buildMonths + 1` to the horizon). So UAT with `fromMonth: 5, toMonth: 6` is billed in months 5 and 6 only, and a DR environment with `production: true, fromMonth: 4` runs from month 4 to the end.
- Streams: production-environment lines stay in stream `run`, fixed. Non-production lines go to the new stream `env` (`Stream`, `STREAMS`). `Month.byStream.env` exists only when a project has such lines, so v5 stream shapes and the golden fixture are unchanged; read it with `envCost(month)` or `byStream.env ?? 0`. With environments defined, line ids are `resource:<id>:<meter>:<envId>` and labels end with the environment name; without, ids are as in A2.
- Totals: `env` in build months is added to `totals.build`; `env` in the steady-state production month is added to `runRate`. `costSplit` puts env in Build in build months and Platform in production months. The AI dev-cost cut (`devCutPct`) is not applied to resource or environment lines. Contingency follows `contingencyScope` like other non-labour build costs. Environment and resource lines stay out of the base of "maintenance as a percent of build".
- Cost bases: `run` (Running cost only) = run + platform, so non-production environments after go-live are excluded. `runMaint` and `full` include `env`. The `COST_BASES` hint texts say so.
- Allocation: `env` is a shared stream (shared pool under `runMaint` and `full`, labelled "Environments"). Report: stream wording "Environments", Excel month rows have an "Environments" column (0 when none), the Report page chart adds an "Environments" series only when any is above 0, and the Excel summary picture folds it into Platform.
- Help entries exist for the environment fields (`environmentLabel` and friends); glossary has "Environment", "Size factor" and "Schedule (hours per month)". No screen uses them until A7.
- Tests: `packages/engine/test/environments.test.ts`.

## Plan and progress

The 2026-10-04 audit and the roadmap are in [docs/plan](plan/README.md). The done/pending matrix is [docs/PROGRESS.md](PROGRESS.md); update it in every PR.
