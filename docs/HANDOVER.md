# Handover: AI Cost & ROI Studio

What you need to pick this project up on another machine: finish the repository setup, run the app, refresh prices, and continue development.

- **Repository:** https://github.com/nitin27may/token-calculator
- **State at handover (2026-10-02):** `main` and `claude/research-and-plan` point to the same commit. All work is merged into `main`. 121 tests pass, and the type check and production build are clean.

---

## 1. Finish the repository setup (GitHub CLI)

`main` has everything, but GitHub still uses `claude/research-and-plan` as the default branch. On a machine with `gh` logged in:

```bash
gh auth status                                   # make sure you are logged in as nitin27may
gh repo edit nitin27may/token-calculator --default-branch main
gh repo view nitin27may/token-calculator --json defaultBranchRef -q .defaultBranchRef.name   # prints: main

# Optional: delete the old branch (identical to main). Only after the default has changed.
gh api -X DELETE repos/nitin27may/token-calculator/git/refs/heads/claude/research-and-plan
```

Recommended after that:

- **Protect `main`.** Require a pull request and passing checks before merging:
  ```bash
  gh api -X PUT repos/nitin27may/token-calculator/branches/main/protection \
    -F required_status_checks=null -F enforce_admins=false \
    -F 'required_pull_request_reviews[required_approving_review_count]=0' -F restrictions=null
  ```
- **Work on short-lived branches** (`feature/…`) and merge through pull requests from now on.
- **`docs/PR_DESCRIPTION.md`** summarises everything built so far. Reuse it for release notes.

---

## 2. Set up a new machine

**Requirements**

- **Node.js 22** (built and tested on 22.22).
- **pnpm 10.** It is pinned in `package.json` as `pnpm@10.28.0`; `corepack enable` picks the pinned version up.
- **Git.** `gh` is only needed for section 1.

```bash
git clone https://github.com/nitin27may/token-calculator.git
cd token-calculator
corepack enable          # once per machine
pnpm install
pnpm test                # expect: 121 passed
pnpm typecheck           # expect: no output
pnpm dev                 # http://localhost:3000
```

**First run in the browser:**

1. Projects are saved in the browser, under `localStorage` key `ai-cost-roi-studio:library`, so a new machine or browser starts with the sample project.
2. To move projects between machines, use **Save to file** (`*.aicost.json`) on the old machine and **Open file as new project** on the new one.
3. If a browser has an older copy of the sample, use **New copy of the sample** to get the current one: workstreams, named developers, benchmark-based capability.

**Production build** (faster to click through):

```bash
pnpm --filter @studio/web build
pnpm --filter @studio/web start     # http://localhost:3000
```

**Sharing a URL for a demo** (the app stays on your machine):

```bash
cloudflared tunnel --url http://localhost:3000    # prints a https://….trycloudflare.com address
```

---

## 3. Refresh prices (do this first on a networked machine)

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

## 4. How the code is organised

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

## 5. Checks before every push

```bash
pnpm test && pnpm typecheck && pnpm --filter @studio/web build
```

- `pnpm typecheck` does **not** cover `apps/web`; the Next.js build does. Run both.
- After changing the sample project, run `npx tsx scripts/sample-summary.ts` to print its headline numbers.

CI (`.github/workflows/ci.yml`) runs the same three on every pull request and on push to `main`. Branch protection on `main` requires it to pass.

---

## 6. Open items and ideas

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

## 7. Where the decisions are written down

- **`docs/DESIGN.md`:** design decisions and why they were made. Read this before redesigning a screen.
- **`docs/PLAN.md`:** the original plan and scope.
- **`docs/research/`:** pricing and behaviour research with sources, the starting point when a price looks wrong.
- **`README.md`:** the feature list.
- **`docs/PR_DESCRIPTION.md`:** a summary of everything built in the first iteration.

## Hosting (Cloudflare Pages)

The web app is a static export (`output: "export"` in `apps/web/next.config.ts`; all state is in the browser, no server routes). It is published to the Pages project `token-calculator` at https://token-calculator-532.pages.dev. Deploy with `pnpm run deploy` from the repo root.

Gotchas:
- Use wrangler 3 for Pages. Wrangler 4 delegates `pages` commands to Workers auto-configuration and will not create or deploy a Pages project from this workspace.
- `pnpm deploy` is a built-in pnpm command and does not run the script; always use `pnpm run deploy`.
- Auth is the existing `wrangler login --device` token on nks-ubuntu. Never put a Cloudflare token in the repo.
- Adding a server route, middleware or `cookies()`/`headers()` call breaks the export. Build will fail; do not remove `output: "export"` to get around it.

## Batch and processing tiers

- `batchDiscount` is derived on every `pnpm prices:azure` run: 1 minus the Global Batch input meter over the Global standard input meter. No Batch meter means 0, because Azure does not offer Batch for that model.
- As of 2026-10-04 Batch meters exist for GPT-4 and o-series, GPT-5 to 5.5 (including 5.2 pro and 5.4 pro) at 50%. They do not exist for GPT-5.6, GPT-6, the Codex models, Claude or MAI, so those are 0. The refresh picks them up when Azure publishes them.
- GPT-5.6 has Standard (`Std`) and Priority (`PP`) meters. Priority and Flex are not modelled yet.
