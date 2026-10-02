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

The price-refresh scripts have **never run against the live sources**: both endpoints were blocked in the build environment. Expect to adjust meter mappings on the first run.

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

**Prices to confirm by hand** (`pnpm validate` lists all of them):
- **Fine-tuning** (`ft-train-*`, `ft-hosting`): USD list price × 1.386, marked `unverified`.
- **Snowflake Cortex credit rates:** low confidence until the PDF parse has been checked.
- **USD-only prices** (marked `derived`): converted at 1.386 CAD/USD. Replace them with CAD meters when the Retail API has them.
- **Benchmarks:** several are low-confidence or vendor-funded. The app shows this next to each benchmark.

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

**A new price**
1. Add the entry to `packages/catalog/data/*.json` with `source` and `confidence`.
2. Add a meter rule in `scripts/prices/azure-map.ts` if the Retail API carries it.

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

There is no CI yet. A minimal workflow is a good first pull request: install, test, typecheck and build on push to `main` and on pull requests.

---

## 6. Open items and ideas

| Item | Status |
|---|---|
| Set `main` as the default branch | **To do**: section 1 |
| First live price refresh (Azure, Snowflake) | **To do**: section 3; expect mapping fixes |
| Confirm fine-tune and Snowflake rates | **To do**: `pnpm validate` lists them |
| CI workflow (test, typecheck, build) | Suggested |
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
