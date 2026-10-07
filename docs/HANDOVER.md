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
pnpm prices:resources --check    # resource catalogue (VMs, databases, storage): report only, fails on ambiguous or unmatched meters
pnpm prices:resources            # writes packages/catalog/data/resources/*.json (never touches the AI model prices)
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

Typed infrastructure resources (VMs, App Service plans, databases, storage) live in `packages/catalog/data/resources/<category>.json`, one file per category: compute, database, storage, messaging, network, security, monitoring, data, licences. A3 filled compute, database and storage from the Retail API and A4 the rest (sections below).

- A file is `{ category, note?, types[], unitPrices[] }`. `loadCatalog` validates each file, merges `unitPrices` into `catalog.unitPrices` (so Prices & sources lists them) and exposes `catalog.resourceTypes`. To add a category, add its JSON file and one import in `packages/catalog/src/resource-data.ts` and one line in `lazy.ts` (see A4).
- A `ResourceType` has `inputs` (what the user enters), `meters` (billed quantities: an input times an optional factor, `hourly`, `scalesWithSize`), `options` (`payg`, `ri1`, `ri3`, `ahb`, `devtest`), an optional `retail` block for the refresh (A3), and `skus`. Each SKU maps meter ids to `unitPriceId`s. Adding a SKU is a data change only.
- A unit price is CAD per unit-month. For an `hourly` meter it is the cost of 730 hours, scaled by hours / 730 on pay-as-you-go.
- `UnitPrice.options.{ri1,ri3,ahb,devtest}` hold the other prices, each with its own `source`. `UnitPrice.manual { price, note, retrievedAt }` replaces the pay-as-you-go price, adds a "manual" note to the ledger and shows as "manual" in Prices & sources. The refresh must never overwrite it. Option prices stay as refreshed.
- A declared option with no price on a unit needs an explicit reason in `attrs["fallback.<option>"]` (for example `fallback.ahb` on a Linux VM). Free items set `attrs.free: true` (the only case where a price may be 0).
- Engine: `Project.resources[]` (`ResourceSchema`, default empty) priced by `resources.ts` `resourceLines`. Each resource is costed as production at 730 hours in the production months, stream `run`, fixed. A reserved term uses the reserved price when the type offers it, else pay-as-you-go with a note. Hybrid Benefit uses the `ahb` price. A project with no resources adds no lines (the v5 golden test depends on that). With environments (A6), `envIds` selects the environments a resource exists in.
- `packages/catalog/test/resources-coverage.test.ts` is the coverage gate: every SKU and meter has an existing price of 0 or more, every declared option has a price or a fallback note, every price has `retrievedAt`, and no price declared in a resource file is orphaned. The help entries for the resource fields (`resourceType` and friends) are used by the Infrastructure page (A7), so `help.test.ts` covers them.

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

The page that edits environments and resources is `/infrastructure` (A7, below). Resources are defined once, as production. `Project.environments[]` (`EnvironmentSchema`, optional, default empty) says where and how they run.

- `EnvironmentSchema { id, label, production, sizeFactor (1), schedule: { hoursPerDay, daysPerMonth } | { hoursPerMonth } (730), fromMonth?, toMonth?, pricing: payg | devtest }`. Empty or absent `environments` means one implicit production environment at 730 hours in the production months, exactly the A2 behaviour (the v5 golden test depends on it). `Resource.envIds` selects the environments a resource exists in; absent means all defined environments, and it is ignored when none are defined.
- Cost per resource, environment and month = sum over the SKU's meters of quantity x option price x (hourly pay-as-you-go, Hybrid Benefit or dev/test meter ? hours / 730 : 1) x (meter scales with size ? size factor : 1). Reserved terms bill 730 hours whatever the schedule (size factor still applies); a scheduled environment on a reserved term adds a note. `pricing: devtest` uses the `devtest` option price when the type offers it and the unit has one, else pay-as-you-go with a note. A reserved term wins over dev/test.
- Billed months: `fromMonth` and `toMonth` bound them, and an absent bound is the edge of the default phase. Non-production defaults to the build months (1 to `buildMonths`), production to the production months (`buildMonths + 1` to the horizon). So UAT with `fromMonth: 5, toMonth: 6` is billed in months 5 and 6 only, and a DR environment with `production: true, fromMonth: 4` runs from month 4 to the end.
- Streams: production-environment lines stay in stream `run`, fixed. Non-production lines go to the new stream `env` (`Stream`, `STREAMS`). `Month.byStream.env` exists only when a project has such lines, so v5 stream shapes and the golden fixture are unchanged; read it with `envCost(month)` or `byStream.env ?? 0`. With environments defined, line ids are `resource:<id>:<meter>:<envId>` and labels end with the environment name; without, ids are as in A2.
- Totals: `env` in build months is added to `totals.build`; `env` in the steady-state production month is added to `runRate`. `costSplit` puts env in Build in build months and Platform in production months. The AI dev-cost cut (`devCutPct`) is not applied to resource or environment lines. Contingency follows `contingencyScope` like other non-labour build costs. Environment and resource lines stay out of the base of "maintenance as a percent of build".
- Cost bases: `run` (Running cost only) = run + platform, so non-production environments after go-live are excluded. `runMaint` and `full` include `env`. The `COST_BASES` hint texts say so.
- Allocation: `env` is a shared stream (shared pool under `runMaint` and `full`, labelled "Environments"). Report: stream wording "Environments", Excel month rows have an "Environments" column (0 when none), the Report page chart adds an "Environments" series only when any is above 0, and the Excel summary picture folds it into Platform.
- Help entries exist for the environment fields (`environmentLabel` and friends); glossary has "Environment", "Size factor" and "Schedule (hours per month)". The Infrastructure page (A7) uses them.
- Tests: `packages/engine/test/environments.test.ts`.

## Infrastructure page (A7)

- `/infrastructure` (nav: after Build). `components/infrastructure.tsx`: totals strip, environments grid, resource list with an inline picker (category, type, filtered SKU list capped at 50, so it scales to hundreds of SKUs), one card per resource.
- Pure helpers: `apps/web/lib/infrastructure.ts` (quick-adds, schedule mode switch, month bounds, environment removal that cleans `envIds`, term options from the SKU's priced options, picker filtering). Display maths: `packages/engine/src/infrastructure.ts` (`resourceCostRows`, `environmentCostRows`, `infrastructureSummary`), read from the ledger lines, never repriced. Per-environment figures are read at the first month the environment is billed.
- Nothing is preselected: quick-adds set only the name and production flag; a new resource has no quantity (costs 0, with a note) and pay-as-you-go. `envIds` is stored absent when every environment is ticked.
- Overview: production resource lines move from the "Production AI usage" lane to "Platform & infrastructure", and an "Environments" lane appears when there are env lines. KPI Build subtitle and Build page subtitle name the environment cost.
- Gotcha: a zustand selector must not return a fresh `?? []` (infinite render); default after selecting.
- Tests: `packages/engine/test/infrastructure.test.ts`, `apps/web/test/infrastructure.test.ts`.

## Run cost beyond AI (A8)

Three workload kinds, added to the union (old files parse, no version bump): `seats`, `contract`, `transactionFee`. Engine in `runcost.ts`, panels in `apps/web/components/run-cost-panels.tsx`, add-menu labels "Seats and licences", "Vendor or support contract", "Per-transaction fee". They are not AI kinds (`NON_AI_WORKLOADS`), so they stay in the Run add menu when only non-AI types are chosen. A new item is empty and costs nothing until a price source is chosen.

- `seats { seats, volumeFrom?, unitPriceId? | cadPerSeat?, followsAdoption, freeSeats? }`: (seats or the linked workload's users, minus free seats) x price per seat-month. Stream `platform`; behaviour `usage` when `followsAdoption` (ramp share and growth apply), else `fixed` (every seat from go-live). `volumeFrom` takes a chat workload's users or another seats item's seats (`userCounts`); there is no project-level user count. Catalogue prices offered are units `seat-month`, `user-month`, `licence-month`.
- `contract { amountCad, cadence: monthly | yearly, escalationPct? }` plus the common start and end months: stream `platform`, fixed. A yearly amount is accrued as one twelfth a month. Escalation is `(1 + pct) ^ whole years since the contract's start month` (go-live unless `startMonth` is set), applied in `ledger.ts` (`contractEscalation`) and written into the line formula.
- `transactionFee { volumePerMonth, volumeFrom?, unitPriceId? | cadPerTxn? }`: volume x price per transaction, stream `run`, behaviour `usage` (ramp and growth). A catalogue price per 1K, 10K or 1M is divided down to one transaction. `volumeFrom` uses `requestVolumes`, which now includes `transactionFee`. Its one-time volume uses `volumePerMonth` and ignores `volumeFrom`.
- Empty seats, a zero amount, a zero volume or a missing price add no line (the v5 golden test depends on that). Unknown `volumeFrom` ids fail `projectIssues`.
- Known wording gap for A15: Excel, Overview and Report call the `run` stream "Production AI usage", so per-transaction fees sit under that label. Left alone on purpose; the wording sweep owns it.
- Run page: the workload remove button now asks inline first, naming the monthly cost and the links lost (all kinds).
- Tests: `packages/engine/test/run-cost.test.ts`, `apps/web/test/run-cost-state.test.ts`, gating in `nav-gating.test.ts`; help ids `seats*`, `contract*`, `txn*`.
## Delivery model (A9)

Optional fields only: no version bump, and a project without them adds no lines and moves no figure (the v5 golden test passes unchanged).

- **Phases.** `timeline.phases?: { id, label, fromMonth, toMonth }[]`. Nothing is added until "Use standard phases" is clicked (Build, Delivery, Delivery phases). `standardPhases(buildMonths, horizonMonths)` spreads discovery, design, build, test, migration, deploy over the build months (reference shares of a 12-month build: 1, 2, 5, 2, 1, 1; each phase starts after the previous one ends, so only the last phases of a very short build share a month) and puts hypercare at months B+1 to B+2, cut at the horizon.
- **Team lines.** `TeamLineSchema` gains `phaseId?` and `effort? { people, weeks, hoursPerWeek }`. The free-text `phase` still works and wins the label. A line's window (`lineWindow` in `delivery.ts`) is its own From/To, else its phase's months, else the whole build, always cut to the last build month. Choosing a phase in the picker writes that phase's months into From/To.
- **Effort.** Hours per month for the line = people x weeks x hoursPerWeek / months in the window (`lineMonthlyHours`). Example: 2 x 12 x 40 = 960 h over months 1 to 3 is 320 h a month. A window of 0 months gives 0. `effort.people` is mirrored into the line's `people`, which still drives Dev Lab volumes. Effort is a build-labour input; maintenance team lines ignore it. Switching a line to people x weeks keeps its current monthly hours (at 40 h a week); switching back keeps them as hours per person per month.
- **Hypercare.** The only way a line is billed after the last build month: `phaseId === "hypercare"` and the project's hypercare phase ends after `buildMonths`. The line bills as stream `labour` to the end of the phase (cut at the horizon), with contingency and the dev-cost cut like other build labour, no rate escalation. Any other line with months past the build is cut at the build. Hypercare labour is counted in `totals.build`, `totals.buildLabour`, the Team row and the Summary build figure (not in first-year running), and in the "maintenance as a percent of build" base only if it falls in a build month (it does not).
- **Delivery costs.** `build.deliveryCosts?: (CashItem & { category: vendor | training | comms | dataMigration | other })[]`. Billed in build months as the new stream `delivery` (once: in its month, capped at the last build month, month 1 when empty; monthly: every build month). `Month.byStream.delivery` exists only when a project has such lines (like `env`); read it with `deliveryCost(month)`. Counted in `totals.build`, `costSplit` build and allocation shared pool; in the cost bases under `full` only (`run` and `runMaint` leave it out). Contingency applies only when `contingencyScope` is "all". The dev-cost cut does not apply to it. It stays in the base of "maintenance as a percent of build", like the dev environment (it is scaled by the cut so the base is not distorted). Report and Excel use the label "Delivery costs" (month rows have a column, 0 when none; the Report chart and the Overview lane appear only when there is some).
- **Standard roles.** `benchmarks.json` gains `availableRoles` (14 delivery roles, each `source: "Assumption"`, `confidence: "unverified"`, CAD per hour). It is separate from `roles`, which other features read, so no existing rate changed. The rate card editor offers "Add role from the standard list" (roles not already on the card; nothing preselected). Nothing is added to existing projects or templates. The rates are placeholders for the owner to review.
- **Gotchas.** The `edit` store function runs the callback once and validates after, so side effects (selection state) go outside it. A phase removed in the UI also clears `phaseId` on its lines. Tests: `packages/engine/test/delivery.test.ts`, `apps/web/test/delivery-model.test.ts`.

## Resource price refresh and catalogue part 1 (A3)

Catalogue: 31 types and 277 SKUs in `compute.json` (VMs Linux and Windows in B, D, E and F series, managed disks, AKS control plane, App Service plans, Functions Premium, Flex Consumption and Consumption, Container Instances, Static Web Apps, Container Registry), `database.json` (Azure SQL vCore and DTU, SQL Managed Instance, SQL Server licences for VMs, PostgreSQL and MySQL flexible servers, Cosmos DB, Azure Cache for Redis, Azure Managed Redis) and `storage.json` (Blob, Data Lake Gen2, Files pay-as-you-go and provisioned v2, Queue, Table). The `note` on each type says what it leaves out. Container Apps stay in `unit-prices.json` (`container-apps-*`).

- **Refresh:** `scripts/prices/resources.ts` (`pnpm prices:resources`). For every type with a `retail` block it prices each SKU meter from the Retail API in CAD, region from `meta.json`:
  - pay-as-you-go: `Consumption` rows; a unit price is the hourly price x 730 for an hourly meter, daily x 30.4167, else the row's own unit.
  - reserved: `Reservation` rows with `reservationTerm` "1 Year" or "3 Years"; monthly = retail price / (12 x years). Windows VMs: the reservation covers compute only, so the Windows price is the Linux reservation plus the Windows licence at pay-as-you-go (source kind `derived`, with the note).
  - Hybrid Benefit: the type's `ahb` rule. `linux-twin` (VMs): a Windows size takes the Linux price of the same size, a Linux size gets a fallback note. `licence-free` (SQL Server licence): bring your own licence, price 0. `unavailable` (Azure SQL Database and Managed Instance): the Retail API lists the vCore rate licence included and has no compute-only meter, so those types do not declare `ahb`; add a manual price if the owner holds Software Assurance.
  - dev/test: `DevTestConsumption` rows. Linux VMs, databases and most services have none, so they carry `fallback.devtest` and pay-as-you-go applies.
  - Each option has its own `source` (meterName and a note; the pay-as-you-go source also has the OData `filter` that returns the row and the product and SKU name). A meter with no row gets a `fallback.<option>` note, never a guessed price.
- **Rules** live in the type JSON, not in code: `retail.filter` (with `{region}`, and `{armSku}` for one query per SKU), `productName` (one regex, or one per `attrs.os`), `skuName`, `meters.<id>` as a regex or `{ meterName, productName, skuName, tier, unit, options, free, divisor, parts }`. A SKU can override a meter's rule with its own `retail` (SQL tiers, Redis products, free tiers). `parts` sums rows times SKU attributes (Functions Premium: vCPU rate x vCPUs + GiB rate x GiB). `precise: true` takes small per-unit prices (under 0.05) from the USD row x `meta.fx.usdToCad`, because CAD rows carry four decimals (0.0001 for a true 0.0000368). If a meter has no CAD row, the USD price x the same rate is used and the source says `derived`.
- **Uniqueness:** a rule must match exactly one distinct price. Identical duplicate rows count once. More than one distinct price is reported as ambiguous and nothing is written for it; `--check` exits 1 on ambiguous or unmatched meters. Fix by tightening the regex, not by choosing a row by hand.
- **Adding a SKU:** add it to the type's list in `scripts/prices/resource-scaffold.ts` (or add the JSON SKU with `armSku` and a `prices` map by hand), then `pnpm prices:resources`. `pnpm prices:scaffold` rewrites the type skeletons and keeps existing unit prices for SKUs that stay; it writes no prices.
- **Files:** the report is `reports/prices-resources-<date>.md` (per type: SKUs, priced meters, options priced, ambiguous, unmatched, and options with no price). `scripts/prices/format.ts` writes one SKU and one unit price per line so a diff stays reviewable. The category files are loaded lazily by the web app since A4.
- **Gotchas:** Static Web Apps is a global service and the API lists it under East US 2 (`retail.regionOverride`). Redis Standard and Premium have a "Cache" meter (the pair) and a "Cache Instance" meter (one node, half the price); the catalogue uses "Cache" and no reserved price, because reservations are per node. Disk transactions, snapshots and bursting are not priced. Flex Consumption and Consumption do not apply the monthly free grant. Cosmos DB autoscale is the AP1 meter (AP1 to AP4 carry the same per-100 RU/s price). Data Lake Gen2 uses the "General Block Blob v2 Hierarchical Namespace" product; an older "Azure Data Lake Storage Gen2 Hierarchical Namespace" product with transactions about 9% cheaper also exists. Queue Storage uses classic "Queues"; "Queues v2" is about ten times dearer and not documented. Engine tests that need resources use a fixture catalogue (`packages/engine/test/fixtures/resource-catalog.ts`) so a refresh cannot move them.
- **Tests:** `scripts/prices/test/resources.test.ts` (recorded rows in `scripts/prices/test/fixtures/resource-rows.json`: reserved, Hybrid Benefit, dev/test, USD fallback, ambiguity, manual price kept) and the wider `packages/catalog/test/resources-coverage.test.ts`.

## Non-financial scorecard (A11)

Optional field only: `benefits.scorecard?: ScoreItem[]`, no version bump. An absent or empty scorecard adds no lines, benefits or rows and moves no figure (the v5 golden test passes unchanged). Engine in `packages/engine/src/scorecard.ts`; UI in `apps/web/components/scorecard.tsx`.

- **Item.** `{ id, label, dimension (speed | customer | employee | compliance | agility | other), measure, unit, before, after, higherIsBetter, weightPct, confidencePct, featureId?, monetise? { cadPerUnit, volumePerMonth?, volumeFrom? } }`.
- **Improvement %.** (after - before) / |before| when higher is better, (before - after) / |before| when lower is better. Before = 0 gives no percentage (shown "n/a") and the item stays out of the composite. Direction is "better", "worse" or "no change".
- **Composite index.** sum(weightPct x improvement) / sum(weightPct) over items with weight above 0 and a defined improvement; null when none. Confidence is shown beside each item and does not discount the index.
- **Monetised value.** good-direction units x cadPerUnit x monthly volume x confidencePct / 100, where good-direction units = after - before (higher is better) or before - after (lower is better); negative when the item moves the wrong way (a cost). Volume is the linked workload's items, else the figure entered. In the ledger it starts at go-live, follows the adoption ramp, and has no growth or escalation. It lands in `MonthBenefit.scorecard[id]`, `Month.benefit` and `totals.benefitRate`, so ROI, payback, NPV and IRR include only monetised items. A non-monetised item is absent from the ledger.
- **Outputs.** `summarize()` gains `scorecard { count, composite, monetisedMonthly }` only with items; `summaryRows` adds three rows; Excel gets a "Scorecard" sheet and a "Scorecard value" Months column only with items; the Report gets a table; Summary gets a Scorecard card; the feature breakdown and allocation credit a monetised item to its `featureId`.
- **UI.** Scorecard tab on `/roi`. The add menu picks a dimension and starts an example measure (before and after both 0, weight 0, nothing monetised), so a new item moves nothing until you enter values. The better/worse chip carries text.
- **Gotchas.** Do not monetise something already counted as time saved or an avoided cost. Tests: `packages/engine/test/scorecard.test.ts`, `apps/web/test/scorecard.test.ts`.
## Engineering tools & lab (A10)

Optional fields only: no version bump; `golden-v5.test.ts` passes unchanged because an absent `aiAssist` adds no lines and moves no figure.

- **Build page.** The section formerly called AI Dev Lab is "Engineering tools & lab". Stream names (`devlab`, `devenv`) and the Excel row "of which AI Dev Lab" are unchanged (the golden fixture pins that label; A15 owns it). Left list: Tools and licences (sel `env`), Test environments, AI-assisted development, then a collapsible "AI experiments" group (the nine activity kinds minus `tooling`), shown only when `showsAiExperiments(p)` (alias of `showsAiPages`: hidden once types are chosen and none is AI and the project has no AI work). Panels: `apps/web/components/engineering-lab.tsx`.
- **Tools.** Cash items in `build.environment` (stream `devenv`), added from `ENGINEERING_TOOL_KINDS` via `addEngineeringTool` (`lab.ts`): IDE and developer licences, CI/CD, test tooling, load-testing service, other. `CashItem.perPerson?` multiplies the amount by the people on the build team in the billed month (sum of `people` over lines active that month, costed or not). A new tool costs C$0 until an amount is typed. Catalogue services can still be added. Tools are subject to `devCutPct` like other `devenv` lines.
- **Test environments.** Not a new cost system: the panel shows the `env` stream over the build months and links to `/infrastructure`.
- **AI-assisted development.** `build.aiAssist?: { productivityPctByRole: Record<roleId, 0..90> }`. `teamLines` bills build labour (and hypercare) hours as `hours x (1 - pct/100)` for listed roles; maintenance lines are untouched. Cost per line = hours x (1 - pct) x rate x contingency x `devCutPct` factor, so the two cuts MULTIPLY and setting both double counts (the Build panel and the Value & ROI page warn). Empty by default; `setAiAssistPct` drops `aiAssist` when the last role is cleared.
- **`summarize().aiAssist`** (only when `aiAssist` is set): `hoursSaved` and `labourSaved` are the difference in the labour stream between the real ledger and a ledger of the same project without `aiAssist` (so contingency and `devCutPct` are included exactly as billed, hypercare too); `toolCost` is the `tooling` activity's devlab lines over the build months as billed (0 when a fixed Dev Lab allowance replaces the calculation); `net = labourSaved - toolCost`. Shown as a Summary card, a Report section and four Excel summary rows. Cost: one extra `buildLedger` call per summarize, only when set.
- **Gotchas.** A `tooling` activity is created only by an explicit click ("Add seats and tokens" or the "AI-assisted development" tool menu entry). Tests: `packages/engine/test/ai-assist.test.ts`, `apps/web/test/engineering-lab.test.ts`.

## Catalogue part 2 and lazy resource loading (A4)

Catalogue: 53 types and 258 SKUs in `messaging.json` (Service Bus, Event Grid, Event Hubs, Logic Apps Consumption and Standard, API Management, Relay, Notification Hubs, Data Factory pipelines and data flows), `network.json` (peering, private endpoints, NAT, public IPs, Application Gateway v2, Front Door Standard and Premium, Load Balancer, VPN and ExpressRoute gateways and circuits, Firewall, Bastion, DDoS IP Protection, DNS, data transfer bands), `security.json` (Key Vault, Managed and Dedicated HSM, Defender for Cloud plans, Sentinel, Entra ID), `monitoring.json` (Log Analytics ingestion, retention and archive, Application Insights, alert rules, App Configuration, Backup instances and storage, Site Recovery, Automation), `data.json` (Fabric F SKUs and OneLake, Synapse dedicated and serverless, Databricks DBU, Power BI Embedded, Stream Analytics) and `licences.json` (Azure DevOps users and jobs, GitHub seats, Power BI and Power Platform seats, a placeholder SaaS seat). The `note` on each type says what it leaves out. Skeletons and rules live in `scripts/prices/resource-scaffold-part2.ts`; `pnpm prices:scaffold messaging network security monitoring data licences` rewrites them (name the categories: without names it also rewrites part 1, whose committed JSON has been refreshed since the scaffold last ran).

- **New rule fields** (all optional, in the type or SKU `retail`): `uom` (regex on the unit of measure: Service Bus Standard has a "Standard Base Unit" row per month and one per hour), `usage` (a per-hour price billed by the hour used, such as DBU-hours and DIU-hours, not scaled to 730 hours), `multiplyBy` (a numeric SKU attribute the price is multiplied by: Fabric CUs, Synapse units of 100 DWU), `reservation` (the reserved price is a different product or meter: Fabric reservations). Filters may name two regions, `(armRegionName eq '{region}' or armRegionName eq 'Global')`, for services the API lists under Global; identical rows still count once and different prices are reported as ambiguous. `regionOverride` is used for Front Door, ExpressRoute circuits and DNS, which the API lists by zone (`Zone 1`).
- **References:** a SKU meter may point at a unit price in `unit-prices.json` (`apim-*`, `key-vault-ops`, `log-analytics-ingest`, `egress-gb`, `defender-*`, `copilot-*`). The refresh skips those ids (they are refreshed by `pnpm prices:azure`), the coverage test lets them stand without a retail rule, and a resource file may not redefine one. A type whose meters are all references has no `retail` block (`apim-consumption`).
- **Free meters:** a SKU lists every meter of its type; a meter that does not apply (the Basic Service Bus base charge, a Premium commitment's ingestion) is a `free` rule with the reason, priced 0 and marked `attrs.free`.
- **Vendor-doc prices** (Entra ID P1 and P2, Power BI Pro and Premium Per User, Power Apps Premium, Power Automate Premium, DDoS IP Protection) carry the USD list price in `attrs.usdList`, the page URL and the fetch date, confidence `unverified`. `pnpm prices:resources` recomputes them from `meta.fx.usdToCad`, so they move with the exchange rate. The `saas-seat` placeholder costs 0 until the user sets a manual price in Prices & sources.
- **Gaps (not in the Retail API, not priced):** Microsoft 365 E3 and E5 (price page unreadable), GitHub Team, Windows Server licence per core (use the Hybrid Benefit price difference on the VM), DDoS Network Protection, Cloud HSM, Stream Analytics V2 and dedicated clusters, Sentinel data lake, Application Gateway v1 and for Containers, Front Door classic, Azure Relay WCF, ExpressRoute Direct and Global Reach, Private DNS Resolver endpoints, Managed Prometheus, Logic Apps integration accounts and ISE, Event Hubs capture, Kafka endpoint and extended retention, Power BI Premium (P SKUs, replaced by Fabric), custom-metric ingestion.
- **Decisions:** volume tiers use the first paid tier (the cheaper bands above it are not applied; egress is offered as explicit bands instead). Fabric offers 1-year reservations only (the API's 3-year row is exactly 3x the 1-year row). Service Bus Standard and Log Analytics commitment tiers bill the daily tier price x 30.4167; data above a commitment is not modelled.
- **Lazy loading:** `loadCatalog()` stays synchronous and complete (engine, tests, CI). The web app uses `loadCoreCatalog()` (no resource categories) and adds categories in place from one dynamic import per category (`packages/catalog/src/lazy.ts`, `loadResourceCategories`). `apps/web/lib/compute.ts` holds the shared `catalog`, `ensureResources()`, `useResourcesReady()` and `useResourceVersion()`: `useLedger` starts the load as soon as the project has a resource and recomputes when it lands; Infrastructure shows "Loading prices" until then; Prices & sources and the project library wait for it; the Excel export awaits it. The catalog package is `sideEffects: false`; that is what lets the bundler drop the static resource imports in `loadCatalog()` from the web build. Adding a category: the schema enum, one import in `resource-data.ts`, one line in `lazy.ts`.
- **Tests:** `scripts/prices/test/resources-part2.test.ts` (recorded rows for `uom`, first paid tier, free meters, `multiplyBy` with a separate reservation product, `usage`, referenced prices, ambiguity and the vendor-doc FX recompute), the widened `resources-coverage.test.ts`, `packages/catalog/test/lazy.test.ts`, and the picker tests in `apps/web/test/infrastructure.test.ts`.

## Portfolio by project type (A14)

- **Grouping and filtering** (`apps/web/lib/portfolio.ts`, `/projects`). A project's keys are `projectTypes(p)` (A1) or `notSet` when no feature has a type. Grouping by type lists a mixed project in each of its groups; the totals line above the cards counts every project once, group headers count within the group (so group counts can add up to more than the overall count). Chips filter with OR: a project shows when any of its keys is on; with chips on and grouping on, only the named groups show. Header figures are sums of `compareFigures()` (build, run per month, NPV, paying back), so there is no second set of maths.
- **Persistence.** `roi-calculator:portfolio` in localStorage, `{ groupBy, filter }`, read after mount (static export) and written only after the first read. Nothing is stored until the user chooses; unknown values are dropped.
- **Compare.** `COMPARE_ROWS` is unchanged; `EXTRA_COMPARE_ROWS` (lib/compare.ts) adds discounted payback, saving per month from current state (A5 `currentVsTarget().saving`), scorecard composite and monetised value per month (A11 `scoreRows`). `extraFigures()` reads those helpers directly instead of calling `summarize()` for every project (summarize also runs ranges and sensitivity); the figures are the ones `summarize().scorecard` and `.currentVsTarget` hold. Missing data shows "n/a" and takes no part in the Best mark. Column headers show the type chips. There is no comparison export in the app, so none was added.
- **Cards** show "Saves X a month against the current state" and "Scorecard N% better" only when the project has current-state lines or scorecard items.
- **Gotcha.** The first card carries `data-tour="projects-list"`; with grouping on only the first group's first card does, so a mixed project does not duplicate the tour target.
- Tests: `apps/web/test/portfolio.test.ts`.
## Templates, recipes and the wizard (A12)

Step 1 of the wizard is "What kind of change?": six cards (the A1 types), nothing chosen at the start. Below them the recipes offered for the chosen kinds appear; pick several kinds to mix them. Each recipe becomes a feature and carries the chosen kinds it belongs to (`featureTypes` in `apps/web/lib/wizard.ts`: the recipe's types among those chosen). `WizardState.types` holds the kinds; `toggleType` drops the recipes only offered under a kind that is un-chosen.

- **Steps branch** (`stepsFor`): "How should it run" (deployment, tier, model choice) appears only when an AI recipe is picked; "Building it" (generic developers and length, Dev Lab) only when a recipe without a plan of its own is picked. A non-AI-only project goes What, How much, What it is worth, Review. `STEPS` is still the full list of six.
- **Plan recipes** (`packages/engine/src/recipes-plan.ts`, data only): cheques to online payments, RPA, lift and shift, replatform to PaaS, replace with SaaS, new application, enhancement, data platform. `Recipe.plan` marks them, `Recipe.types` says where they are offered (AI recipes have no list and mean `["ai"]`; use `recipeTypes`, `recipesForTypes`). They are in `PLAN_RECIPES` and `ALL_RECIPES`; `RECIPES` is unchanged (the 15 older recipes) because existing tests iterate it. `recipeById` searches `ALL_RECIPES`.
- **What a plan recipe returns** (`RecipeResult.plan`, `PlanParts`): rate-card roles, team lines (standard phases from A9, plus a one-person hypercare line; the cheques recipe bills every role for the whole build to match the plan's worked example), delivery costs, environments, catalogue resources, current-state lines, scorecard items (unmonetised starters), maintenance and contingency. Run workloads (seats, contracts, transaction fees) come back as ordinary workloads; the benefit comes from `recipe.benefit(values)` through the existing benefit types (cheques, lift and shift, PaaS and SaaS have none because their saving is in the current-state lines, so nothing is counted twice).
- **Merging** (`assemble` in `usecases.ts`, shared by `buildWizardProject` and the catalogue-free `buildPlanProject`): a plan-only project has no AI developer or architect lines, no dev environment cash items, a 60-month horizon, a 6-month ramp, no rate escalation, the first plan recipe's maintenance and 15% contingency on labour, and standard phases. A plan recipe beside an AI recipe keeps the AI team (the Building it step) and the longer of the two build lengths. Environments merge by id; once any is defined production is added (resources would not bill otherwise) and a resource with no `envIds` gets `["prod"]`.
- **Environments question** (new `multi` question kind, answer is a comma list, default empty): dev and test at 0.5 size on 10 h x 22 d, running to the horizon (the plan's net figures include them after go-live); UAT at 1.0 size on the same hours for the last two build months. Nothing is ticked at the start; ticking none costs production only. Decommission questions ("Will it be switched off?") start on "not decided", which leaves the saving out (`assumed: false`).
- **Assumptions.** Every number is an illustrative assumption: question help source is "Illustrative assumption: replace with your figure", lines carry "(assumption)" in their label, and the review step lists the derived figures with editable targets (`Assumption.target.collection` gained `currentLines`, `deliveryCosts`, `resources`). Resource lines are the only catalogue-priced items. Several defaults give a negative NPV over 60 months (lift and shift, PaaS, SaaS, new application, enhancement, data platform): they are placeholders, not advice.
- **Reference template.** `chequesTemplate` (`samples/all-templates.ts`) is the cheques recipe with envs `dev,test,uat` and the lease decision "yes". `PROJECT_TEMPLATES` is still the five version-5 templates because `golden-v5.test.ts` asserts its keys equal the fixture's; the app uses `ALL_PROJECT_TEMPLATES` (the five plus cheques, "Blank" last as the store's fallback).
- **Tests.** `cheque-template.test.ts` pins the plan's worked example against a fixture catalogue with a C$1,800 a month production resource (the shipped template uses an App Service plan and an Azure SQL database, so its own figure differs). Its comment explains the small differences: the engine does the exact 1,800 x 0.5 x 220 / 730 = 271.23 where the plan rounds to 271, so the build is C$3.7 higher and the 60-month cumulative C$29 higher. `recipes-plan.test.ts` parses every plan recipe, checks every referenced catalogue id exists, that none uses AI, and pins totals in `fixtures/recipes-golden.json` (generated once with `GENERATE_GOLDEN_RECIPES=1`; it stores the catalogue entries it was priced with, so a price refresh does not move it; never regenerate it to make a failure pass).
- **Gotchas.** `recipes-plan.ts` imports only types from `usecases.ts` (the reverse import is a runtime one), so keep it that way. The reconciliation saving in the cheques recipe follows adoption: the plan's table says "reduce 50%", but its month 7 to 12 total of C$84,273 only works when it ramps with the others.

## Generic scenario and sensitivity levers (A13)

Code: `packages/engine/src/transforms.ts` holds the transforms; `levers.ts`, `scenarios.ts` and `sensitivity.ts` call them, so a lever, a saved scenario edit and a sensitivity bar always mean the same change.

- **New scenario edits:** `{ kind: "scaleRates", factor, scope? }` and `{ kind: "shiftMonths", target: "decommission" | "golive", by }`. A lever edit may carry `amount`. All optional, so old files parse unchanged; no schema version bump.
- **Levers** (`LEVERS`, each with `group: "ai" | "generic"`, optional `param` bounds, `saves`). `applicableLevers()` lists the ones that fit; `evaluateLevers()` (Overview, Report) lists only cost levers (`saves`), so the AI list is unchanged. `leverEffect()` gives the cost and NPV change shown in the scenario panel.
  - **Reserved coverage** (`reserve1y`, `reserve3y`, 10 to 100%, default 50): every pay-as-you-go resource with a cheaper reserved price for the term is split in production into a pay-as-you-go row (1 - c of every quantity input) and a reserved row (c). Non-production keeps the whole resource at pay-as-you-go (reserved bills 730 h). Quantities can be fractional: a blend, not a purchase order.
  - **SKU size** (`skuUp`, `skuDown`, one step): siblings are the same type with identical text attributes (OS, series, tier), ordered by pay-as-you-go price (unit price x quantity factor, summed over meters). Only types where every SKU has a numeric size attribute (vCPU, memory, GiB) qualify. No sibling in the direction: the resource is skipped.
  - **Non-production hours** (`envHours`, 10 to 100% of today's hours, default 50): scales hours per day (capped at 24) or monthly hours of non-production environments. Reserved still bills 730.
  - **Volume** (`volume`, 25 to 400%, default 120): transaction-fee volumes, per-transaction current-state volumes and seat counts that are typed in. Volumes read from another workload follow it. AI workloads, hosting requests and benefit volumes do not move.
  - **Build length** (`deliveryLength`, 50 to 200%, default 120): build months x factor, rounded, 1 to 24. Explicit team and phase windows scale in proportion (start floor((k-1) r)+1, end ceil(k r)); people and hours a month stay, so labour moves with length; people x weeks lines keep total hours. Months after go-live shift by the change.
  - **Go-live** (`goLive`, -12 to +12 months, default +3) and the edit `shiftMonths golive`: build length changes by the shift; open-ended and to-the-end windows follow; explicit months after go-live (hypercare, later environments, workload and benefit start months, current-state change months) shift too. The horizon does not move.
  - **Decommission date** (`decommission`, -12 to +24 months, default +6) and the edit `shiftMonths decommission`: every reduced or retired current-state line's change month moves, never before go-live; kept lines stay.
  - **Labour rates** (`labourRates`, 50 to 150%, default 110) and the edit `scaleRates`: scope `delivery` (default) scales build and maintenance team rates only. A role used only by delivery has its rate-card rate scaled; a role that also values a benefit or a current-state people line keeps its rate and its team lines get a manual rate instead, so benefit value and current-state cost never move. Scope `all` moves every rate and manual rate.
  - **Adoption** (`adoptionRamp`, 0 to 24 months, default half of today's; `adoptionShare`, 10 to 100%, default 80, sets `roi.adoptionPct`).
- **Sensitivity drivers added:** resource and environment cost (+-20% of every resource quantity), current-state savings (+-20% of each line's cost today), transaction volume (+-30%), seat count (+-25%), decommission timing (6 months later or earlier). Build length, delivery rates and adoption ramp already existed. Each appears only when the project has the parts. AI-only drivers (AI run volume, token prices, cache hit, model choice) are hidden when `hidesAiChoices && !usesAi`; blank and legacy projects keep them.
- **Gotchas:** `totals.build` includes non-production environment cost, so labour tests sum the `labour` stream. A saved lever edit that no longer applies to the project is ignored, not an error. The Scenarios lever picker starts empty on purpose (nothing preselected).
- **Tests:** `packages/engine/test/generic-levers.test.ts`.

## Plan and progress

The 2026-10-04 audit and the roadmap are in [docs/plan](plan/README.md). The done/pending matrix is [docs/PROGRESS.md](PROGRESS.md); update it in every PR.
