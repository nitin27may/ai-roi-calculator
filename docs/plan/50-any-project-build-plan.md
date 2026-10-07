# Any-project build plan (2026-10-07)

Turns the decisions in [30-any-project-gaps.md](30-any-project-gaps.md) into PR-sized phases. One phase is one PR, rebased on main, with CI green. Existing AI projects must keep identical totals throughout.

## Findings that shape the plan
1. The golden migration test checks line counts, not only money. A new feature must add no lines when its fields are missing or empty. A line that costs C$0 would fail the test.
2. `devCutPct` cuts every build line, including Dev Lab and dev environment, not just labour. The AI-assisted productivity setting sits next to it and does not replace it.
3. The price fetcher keeps only `type === "Consumption"` rows, and `RetailRow` has no reservation term. Both change in A3, with today's default left as it is.
4. The ledger has a closed list of cost streams (`STREAMS` in `ledger.ts`). New streams are added as new keys that stay 0 for old projects.

## Phases

| # | PR | Depends on | Parallel with |
|---|---|---|---|
| A0 | Lock current totals in a v5 golden fixture | none | none |
| A1 | Project types per feature; show AI pages only when a feature uses AI (schema v6) | A0 | A2, A5 |
| A2 | Catalogue format and engine pricing of resources (no UI) | A0 | A1, A5 |
| A3 | Price refresh for reserved, Hybrid Benefit and dev/test; catalogue part 1 (compute, databases, storage) | A2 | A5, A6 |
| A4 | Catalogue part 2: messaging, networking, security, monitoring, data, licences (data only) | A3 | A5 to A9 |
| A5 | Current state and savings | A0 | A1 to A4 |
| A6 | Environments and the infrastructure engine | A2 | A5 |
| A7 | Environments and infrastructure page | A6, A1 | A5, A8 |
| A8 | Run cost beyond AI: seats, contracts, per-transaction fees | A0 | A5 to A7 |
| A9 | Delivery model: phases, full role card, non-labour delivery costs | A0 | A5 to A8 |
| A10 | Engineering tools & lab, with AI-assisted productivity | A9, A1 | A11 |
| A11 | Non-financial scorecard | A5 | A10 |
| A12 | Templates, recipes and the wizard step "What kind of change?", including cheques to online | A1, A5 to A11 | none |
| A13 | Generic scenario and sensitivity levers | A5, A6, A9 | A14 |
| A14 | Portfolio grouped by project type | A1, A11 | A13 |
| A15 | Wording sweep: name, tour, story, Overview lanes, KPI labels, glossary, docs | all | none |

Every phase ships its `help.ts` entries (the coverage test fails without them) and adds to `docs/HANDOVER.md`.

## Data model and migration
- One version bump, to v6, in A1. After that every new field is optional or an array that defaults to empty, and a missing value means today's behaviour. A later phase that must restructure data bumps to v7 with its own `migrate.ts` step and golden test.
- **A0:** `packages/engine/test/fixtures/v5-golden.json`, generated once from main and never regenerated. It covers the sample and all 15 templates: each month's line ids and costs, `byStream`, totals, `computeRoi`, `summarize()` headline figures and `summaryRows`. `test/golden-v5.test.ts` stays green in every later phase.
- **A1:** `ProjectType = newApp | enhancement | automation | replatform | saas | ai`. `FeatureSchema.types` may be empty, meaning not chosen. A new `types.ts` has `projectTypes(p)` and `usesAi(p)`. `usesAi` is true when any feature lists `ai`, or the project has any AI workload or Dev Lab activity other than `tooling`, so legacy projects keep their AI pages. Migration v5 to v6 adds `types: ["ai"]` to features that own AI workloads or activities.
- **A2:** `ResourceSchema { id, label, featureId?, typeId, skuId, inputs, term: payg | ri1 | ri3, ahb, envIds? }` and a top-level `resources` array defaulting to empty. New `resources.ts` with `resourceLines`. Until A6, resources price as production at 730 hours a month.
- **A5:** `CurrentLineSchema { id, label, category (people, licence, infrastructure, transaction, contract, other), featureId?, confidencePct?, basis, change, decommission? }`. Basis is monthly, FTE (role, FTE, hours) or per transaction (unit cost, volume or volume from a workload). Change is keep, reduce (percent, from month, follows adoption) or retire. A conditional decommission with `assumed: false` adds nothing. The ledger adds `MonthBenefit.currentState`, the saving per line. `summarize()` gains `currentVsTarget { currentMonthly, targetMonthly, saving, dualRunningCost }`. Dual running needs no field: target costs start at their own month and current costs fall only from their change month, so the overlap appears by itself. `avoidedCosts` stays.
- **A6:** `EnvironmentSchema { id, label, production, sizeFactor, schedule (hoursPerDay x daysPerMonth, or hoursPerMonth; default 730), fromMonth?, toMonth?, pricing: payg | devtest }`. Empty `environments` means one implicit production environment. Cost per resource, environment and month is the sum over the SKU's meters of quantity x option price x (hours / 730 for hourly pay-as-you-go meters) x (size factor for meters that scale with size). Reserved capacity bills 730 hours regardless of schedule, with a note. Production lines go to `run` (fixed). Non-production lines go to a new `env` stream, counted in `totals.build` during build months and in `runRate`.
- **A8:** new workload kinds `seats`, `contract` and `transactionFee`, added to the union so old files still parse.
- **A9:** `timeline.phases` from the standard list (discovery, design, build, test, migration or cutover, deploy, hypercare). `TeamLineSchema` gains `phaseId?` and `effort? { people, weeks, hoursPerWeek }`. Hypercare lines may run past `buildMonths` as labour, only when `phaseId === "hypercare"`. `build.deliveryCosts` (vendor, training, communications, data migration, other) go to a new `delivery` stream. New roles in `benchmarks.json`: BA, BSA, QA, PM, Scrum master, DevOps, DBA, UX, data engineer, tech lead, change and training, support analyst, each with a rate source.
- **A10:** `build.aiAssist { productivityPctByRole }`. A labour line costs hours x (1 - pct). Seat and token cost come from the existing `tooling` activity. `summarize()` gains `aiAssist { hoursSaved, labourSaved, toolCost, net }`. `devCutPct` is kept, and the UI warns when both are set.
- **A11:** `ScoreItemSchema { id, label, dimension (speed, customer, employee, compliance, agility, other), measure, unit, before, after, higherIsBetter, weightPct, confidencePct, featureId?, monetise? }`, stored in `benefits.scorecard`. Only monetised items enter NPV and payback.
- **A13:** two new scenario edit kinds: `scaleRates` and `shiftMonths` (decommission or go-live).

## Catalogue format and price refresh
- **Files:** `packages/catalog/data/resources/<category>.json`, one per category (compute, database, storage, messaging, network, security, monitoring, data, licences), loaded by `loadCatalog` and lazily per category in the web app to keep the static bundle small.
- **Type shape:** `ResourceType { id, label, category, docsUrl?, inputs[], meters[], options[], retail?, skus[] }`. Each meter has a quantity source, whether it is hourly and whether it scales with size. Each SKU maps meters to `unitPriceId`s. Adding a SKU is a data change only.
- **`UnitPrice` additions:** optional `options` (ri1, ri3, ahb, devtest, each with price and source) and optional `manual { price, note, retrievedAt }`. The refresh never overwrites a manual price, and Prices & sources shows a "manual" note.
- **Refresh (A3):**
  - `retail.ts` gets `retailSource({ types })`, default `["Consumption"]` so today's output is unchanged, and `RetailRow` gains `reservationTerm`, `type` and `armSkuName`.
  - A new `scripts/prices/resources.ts` handles pay-as-you-go (`Consumption`; Windows or Linux chosen by product name), reserved (`type eq 'Reservation'`, term 1 or 3 years, monthly price = retail price / (12 x years)), Hybrid Benefit (Windows VMs take the Linux twin price; SQL takes the compute-only meter) and dev/test (`DevTestConsumption`, falling back to pay-as-you-go with a note).
  - Prices with no Retail API meter (GitHub, Copilot, Microsoft 365, any SaaS) use `source.kind: "vendor-doc"` with a URL, date and confidence. USD-only prices go through the measured FX rate.
  - `--check` reports SKUs matched, options missing and rows that match more than one price.
- **Coverage tests:** every SKU and meter points to an existing `unitPriceId` with a price of 0 or more (0 only when marked free); every declared option has a price or an explicit fallback note; every price has `retrievedAt`; no orphaned `unitPriceId`. A recorded-rows fixture tests reserved, Hybrid Benefit and dev/test parsing.

## UI per phase
- **A1:** a multi-select "Type of change" on the feature form, nothing preselected. Capacity (PTU) is hidden from the nav when `!usesAi`. Build hides harness, bake-off and AI experiment activities, and Run hides AI workload kinds, unless a feature is AI. The token calculator stays under Quick tools.
- **A5:** a Current state table on `/roi` (category, basis, change, decommission toggle), a "Current vs target" Summary tile, and Report and Excel through `summarize()`.
- **A7:** a new `/infrastructure` page with an environments grid and a resource list (type and SKU pickers, inputs, term, Hybrid Benefit, environments). Nav order: Summary, Overview, Build, Infrastructure, Run, Value & ROI.
- **A8:** Run's add menu gains Seats and licences, Vendor or support contract, and Per-transaction fee.
- **A9:** a phase timeline strip on Build, a role picker from the full card, effort as hours or people x weeks, and a Delivery costs section.
- **A10:** an "Engineering tools & lab" section on Build (tools and licences, test environments linking to Infrastructure, load testing, AI-assisted development with a percentage per role). "AI experiments" is collapsible and shown only when `usesAi`.
- **A11:** a scorecard table on `/roi` and a scorecard tile on Summary.
- **A12:** wizard step 1 becomes "What kind of change?" with the six types, nothing preselected. Later steps branch: AI recipes for AI; non-AI recipes ask for volumes, current-state lines and environments.
- **A13:** the scenario and sensitivity panels list the generic levers.
- **A14:** `/projects` gets group-by-type and filter chips, and the compare view adds payback and scorecard.
- **A15:** tour rewritten (`TOUR_VERSION` 2), `intros.ts` and the story no longer assume candidate models. Overview lanes become Delivery and Engineering tools, with Model bake-off only for AI. The KPI "of it AI Dev Lab" becomes "of it engineering tools & lab". New glossary terms: environment, reserved instance, Azure Hybrid Benefit, dev/test pricing, current state, dual running, decommission, scorecard, per-transaction cost.

## Tests and acceptance
Every phase keeps `golden-v5` and the v2 golden test green, `help.test.ts` passing, and typecheck, tests and CI green.
- **A1:** v5 to v6 migration gives identical lines and totals; a truth table for `usesAi`; a nav test that Capacity is hidden for a non-AI project.
- **A2, A6:** a dev environment at size factor 0.5 on a 10 h x 22 day schedule costs production x 0.5 x 220 / 730. Reserved ignores the schedule. Dev/test falls back to pay-as-you-go with a note. Empty `environments` costs the same as production at 730 hours.
- **A3, A4:** the coverage test, plus reserved, Hybrid Benefit and dev/test parsing on recorded rows.
- **A5:** reduce against retire, a conditional line with `assumed: false`, follows-adoption ramp, FTE escalation, and the dual-running figure.
- **A9:** a hypercare line is costed after go-live; delivery costs go to the `delivery` stream; people x weeks gives the right hours.
- **A10:** `aiAssist` cuts hours only for listed roles, and `net = labourSaved - toolCost`.
- **A11:** a non-monetised item does not change NPV.
- **A12:** each new template parses and has a pinned golden.
- **A13, A14:** levers move totals in the expected direction; a grouping test in `compare.test.ts`.

### Worked example: cheques to online payments (A12, `cheque-template.test.ts`)
Every figure is an illustrative assumption to replace. Test price: C$1,800 a month for production resources, all hour-billed.

Current state, 10,000 payments a month:

| Line | Basis | Monthly | Change |
|---|---|---|---|
| Cheque stock and printing | C$0.40 per cheque | C$4,000 | reduce 90% with adoption |
| Postage | C$1.20 per cheque | C$12,000 | reduce 90% with adoption |
| Courier | 500 x C$15 | C$7,500 | reduce 90% with adoption |
| Re-issues | 200 x C$25 | C$5,000 | reduce 90% with adoption |
| Reconciliation | 2 FTE x 150 h x C$40 | C$12,000 | reduce 50% |
| Printer lease | monthly | C$1,500 | retire at month 18, only if decommissioned |
| **Total** | | **C$42,000** | |

Saving at full adoption is C$31,650 a month, rising to C$33,150 once the lease retires.

Target state: payment gateway 9,000 x C$0.30 = C$2,700 a month; production resources C$1,800; support contract C$500; non-production dev and test at 0.5 size on 220 hours, C$271 each; UAT at 1.0 size, C$542, in months 5 and 6 only.

Build: six months. Team: PM 0.5, BA 1, Dev 3, QA 1, DevOps 0.5, Change 0.5, each at 150 h a month, at C$110, 95, 105, 85, 115 and 85 an hour. Labour is C$97,500 a month, C$585,000 over six months, C$672,750 with 15% contingency. Delivery costs C$35,000 (bank integration C$25k, training C$10k). Non-production environments during build C$4,336. **Build total C$712,086.**

Production with a 6-month adoption ramp: months 7 to 12 net C$84,273 in total; months 13 to 17 C$26,108 a month; from month 18 C$27,608 a month.

| Check | Value |
|---|---|
| Payback | month 36 |
| Cumulative net at month 60 | about C$689,871, undiscounted |
| Same project with the lease not decommissioned | net C$26,108 a month and a later payback; the test checks this |
| AI-assisted development at 20% on Dev | saves C$65,205 of labour over the build including contingency, shown net of seat cost |

## Risks and ordering
- **Order:** lock totals first (A0), then add optional pieces that add no lines (A2, A5, A6, A8 to A11), and change wording last (A15). Gating in A1 is visibility only, so it cannot move money.
- **Line-count golden:** guard every new loop with "empty means no lines".
- **New streams (`env`, `delivery`)** change Excel and Report columns. Add them as 0 and hide them in the UI when 0.
- **Reserved and Hybrid Benefit meters are messy.** The "exactly one price matches" rule may fail. The `--check` report and the manual override are the fallback.
- **Hypercare past build** breaks the assumption that build happens in build months. Limit it to `phaseId === "hypercare"` and test it.
- **Double counting:** `devCutPct` with `aiAssist`, and `avoidedCosts` with current-state lines. Show a warning, not a silent merge.
- **Scale:** about 250 SKUs could bloat the static bundle. Load the catalogue lazily per category.

## Owner review before each phase
- **A0:** confirm the fixture's scope.
- **A1:** type labels and wording; whether the existing non-AI recipe gets no type or "new application".
- **A2, A3:** the catalogue format, the region (Canada Central), the Hybrid Benefit rule per type, and the dev/test fallback.
- **A4:** the SKU list per category (about 80 to 90% coverage), and vendor-doc seat prices with their sources.
- **A5:** current-state categories, and whether savings show as a benefit or as a cost reduction.
- **A6, A7:** whether non-production after go-live counts in "Running cost only" (suggest it counts only in "Running plus maintenance" and "Full lifecycle"); the quick-add for dev, test, UAT and production must not preselect.
- **A8:** whether adoption scales seats.
- **A9:** default rates for the new roles and the phase list.
- **A10:** default productivity percentage per role (suggest empty), and whether to hide `devCutPct` from new projects.
- **A11:** scorecard dimensions and the scoring formula.
- **A12:** every number in the cheques template and the seven other recipes.
- **A13:** which levers and how far each moves.
- **A14:** what counts as a project's type when its features mix types.
- **A15:** the product name wording, confirming each removed AI phrase inline.
