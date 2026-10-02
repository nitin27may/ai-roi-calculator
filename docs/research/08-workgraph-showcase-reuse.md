# Existing showcase: `workgraph.ai/showcase/cost-calculator`, architecture and reuse plan

This analysis was read-only, done at commit 85cbbc6 on 2026-10-02.

**Stack:** Vite, React 19, Tailwind v4, Zustand, Zod 4, CEL, and a pnpm workspace with `engine`, `fetcher` and `cli` packages.

**Size:** about 16K lines of code, plus the catalogue JSON.

## 1. Features
- **Cost tab**
  - Project globals: users, adoption, working days, deployment type, cache hit, retry %, reasoning allowance, and model tiers (main / mini / vision / embedding / transcription).
  - Grouped component cards with drag-and-drop ordering.
  - A token table for agents and retrieval.
  - "How this is calculated" traces.
- **Delivery tab:** build phases costed from a rate card, plus contingency. Maintenance is entered either as effort or as a % of build.
- **ROI tab:** capabilities (from a benchmark library or entered by hand), avoided costs, changeover and transition costs, one-off benefits, an unallocated-cost explainer, a cash-flow chart and payback.
- **Summary:** breakdown by category and group, plus a ±25% usage range.
- **Token guide:** a single-request estimator with paste-to-count (`gpt-tokenizer` o200k, lazy-loaded), sizing tables, language multipliers and what-ifs.
- **Catalogue browser:** shows the price `asOf` date and how old it is.
- **Settings:** rate card, current-state baseline and ROI projection settings.
- **Templates:** enterprise-intelligence, rag-starter, automation, application-modernisation.

## 2. Data model
- **ComponentType (JSON):** inputs (`number`, `percent`, `select`, `sku`, `model`, `componentRef`, `table`…), CEL `variables`, `outputs`, `lines` and a `pricing` spec. There are 29 types; 23 of them have a fetcher pricing spec.
- **PriceFile:** generated per `region.currency`, with tables, scalars and `meta.meterName`.
- **ModelCatalogue:** chat models (input / cached / output, Global and DZ, lifecycle), embeddings and transcription.
- **Project:** globals, groups, components (values may be literals or `{bind: "id.output"}`), roles, currentState, roi, delivery, scenarios, customTypes and priceOverrides.
- **Evaluation:**
  1. Order components by dependency (topological sort, with cycle errors).
  2. Phase 1 evaluates variables and outputs.
  3. Phase 2 evaluates each line to a **monthly** cost, with a trace.
  4. Delivery maintenance is added as a synthetic component.
  5. Totals are computed.
- **Everything is monthly.** One-offs only exist through a magic `oneOffCost` output.
- **Model pricing:** `chatCost` covers Global vs DZ, one global cache hit, retries and a reasoning %. It has no batch, priority, PTU, long-context, cache-write, tokenizer, promo or free-tier handling.
- **Currency:** a single price set, `canadacentral.CAD`. USD-only prices are converted with a derived FX rate, which falls back silently to 1.386.

## 3. ROI (`roi.ts`)
- **Capability value.**
  - `activeUsers = users × adoption`.
  - Tasks come from the linked component's `tasksPerMonth`, or from users × tasks/day × working days.
  - Minutes saved come from a preset (conservative / typical / optimistic) or an override.
  - Net hours = gross hours × realisation %. Value = net hours × role hourly rate.
  - Presets: conservative 25/30, typical 40/40, optimistic 65/60 (adoption / realisation).
- **Cost allocation.**
  - Shared categories and components are spread pro-rata to direct cost. All other cost goes to the linked capabilities.
  - Anything left over is reported as Unallocated, with a reason.
  - Allocation always reconciles to total cost.
- **Avoided cost.**
  - Two modes: amount, or headcount (people before − after × hours × rate).
  - Treated as a benefit and never netted against cost. Not subject to adoption or realisation.
  - Starts at a start month. Can be conditional. Can claim against current-state lines.
- **Transition costs and one-off benefits:** placed in specific months.
- **Projection.**
  - Ramp over `rampMonths` (with a quirk: anything over 12 months jumps to full at month 13).
  - User growth and rate escalation in annual steps.
  - Fixed, semi-fixed and variable cost classes, keyed by **hard-coded category names**.
  - Payback is a fractional month.
- **Not implemented:** NPV, IRR, discount rate and Monte-Carlo ranges.
- **Benchmarks (`roi.json`):** 12 capabilities with sourced savings and confidence ratings, 13 roles in CAD/h, and a 7-phase delivery plan template.

## 4. Delivery (`delivery.ts`)
- **Build:** each line is people × weeks × h/week, or a fixed number of hours, times the rate. Contingency % is applied on top.
- **Maintenance:** entered as team effort, or as % of build per year.
- **No AI or token usage during development.** The plan's component 13b is entirely new.

## 5. Price fetcher
- **retail.ts:** pages through the Retail API (up to 60 pages) with retry/backoff and a disk cache. It keeps Consumption prices only, so **no PTU reservations**.
- **match.ts:** regex matching on meter, product and SKU, with a `DEFAULT_EXCLUDE` list. **It throws unless exactly one meter matches.** That is good.
- **build.ts:** unit conversion (per 1M, hour × 730, day × 30.42), `sum` and `sameAs`, and provenance tracking.
- **models.ts:** about 20 chat models with hand-written meter regexes (e.g. `^5\\.4 inp {r} 1M`).
  - DZ prices come from eastus2 meters; legacy models use Global × 1.10.
  - text-embedding-3-small is hard-coded at USD 0.02 × FX.
  - Lifecycle data is curated by hand.
- **Drift check:** `--check` exits 1 on drift.
- **It is run by hand only.** CI never calls the API.
- **Gaps:**
  - no discovery and no unmapped-meter report
  - Azure OpenAI only, so no Foundry partner, Speech, CU or Content Safety meters
  - no batch, priority, PTU, long-context or cache-write meters
  - no confidence or effective dates
  - single region and currency

## 6. Persistence and export
- **store.ts:** validates the project against the schema on every edit, keeps merged undo/redo (100 steps) and autosaves.
- **library.ts:** stores projects in localStorage, with File System Access and a download fallback.
- **report.ts:** one report model rendered three ways: CSV, JSON and PDF (jsPDF; the brand colour is hard-coded).
- **Also:** JSON Schemas generated from Zod (with a staleness test), and a CLI with `evaluate` and `validate`.

## 7. Tests
About 120 Vitest cases.
- **Covered:** CEL, evaluation, delivery, avoided cost, catalogue completeness, the fetcher, golden template totals, CLI, and schema freshness.
- **Not covered:** the model-catalogue builder, FX, the UI, and allocation edge cases.

## 8. Quality
**Strengths**
- The engine is pure and deterministic.
- Errors are explicit and every number has an explain trace.
- Zod discipline is strong.
- The ROI model is careful: allocation reconciles, avoided cost is treated as a benefit.
- Benchmarks carry provenance.
- The fetcher is strict and has a drift check.

**Weaknesses**
- Costs are monthly only.
- There is **no meter or line-item abstraction**, which blocks project-wide free tiers, discounts, unit-price display and P50/P90 ranges.
- CEL quirks: an int-literal hack and a module-global scope.
- Magic output names: `tasksPerMonth`, `licensedUsers`, `oneOffCost`.
- Values that should be data are hard-coded: cost-class category names, CAD/canadacentral defaults, FX 1.386, 730 h, the DZ ×1.10, the embedding price, and the brand colour.

## 9. Reuse verdicts
| Module | Verdict | Target |
|---|---|---|
| fetcher `retail.ts` | reuse (add USD base, configurable pages) | sync transport |
| fetcher `match.ts` | reuse + extend with an unmapped-meter pass | meter mapping |
| fetcher `build.ts` unit logic | port → emit `PriceEntry` | normaliser |
| fetcher `models.ts` | replace; lift the regex knowledge as seed mapping data | `models/azure-openai.json` |
| `priceDrift` / `--check` | port | sync PR diff table |
| Zod schema patterns, `ValueSource` evidence, JSON-schema gen | port pattern | `packages/catalog` |
| CEL engine | replace with typed TS components; possibly keep later as sandboxed custom-formula component | engine |
| 23 infra type pricing specs (AKS, APIM, Postgres, Redis, Container Apps, Key Vault, PE, NAT, Storage, Log Analytics, hosted agent, AI Search, DI, Language, Translator) | port as data | services catalog / ROI infra |
| `ai.agent` / `ai.retrieval` / `ai.knowledge-ingestion` | reference only (seed defaults) | components 1, 4, 6, 7, 9 |
| `chatCost` | replace | modifiers pipeline |
| `token-guide.json`, `estimate.ts`, Estimator | port | heuristics + token guide UI |
| `roi.ts` | port with changes | ROI module |
| `delivery.ts` + roles | port | ROI labour + 13b team inputs |
| `scenario.ts` | port | what-if |
| `benchmarks/roi.json` | reuse as data (currency-tag rates) | ROI benchmarks |
| store/library patterns | port with changes (catalogVersion, share URL, SSR guards) | editor store |
| report model + renderers | port pattern | export |
| React UI | replace (Next.js + shadcn); keep UX ideas | UI |

## 10. Reconciliation for future ROI integration
1. **Narrow interface.** ROI reads a `RoiCostInput` adapter (monthly lines with cost class and allocation, one-offs by month, business volumes, and optionally `byMonth[]`), not the engine internals.
2. **Cost behaviour is data.** `costBehaviour` (fixed / semiFixed / variable) and `roiAllocation` (shared / direct) become catalog fields instead of category-name lists.
3. **Typed `businessVolume` output** (`tasksPerMonth`, `users`) replaces the magic output names.
4. **One cost projection.** The token engine owns cost-by-month, using lifecycle phases and growth. ROI projects benefits only and subtracts the engine's monthly cost.
5. **Implementation cost** = delivery labour + one-time line items (13b build tokens, backfill, setup).
6. **Currency.** ROI inputs are in the project currency. The engine converts costs from USD to the project currency before handing them to ROI.
7. **Uncertainty.** Use P50 cost with the selected benefit preset, and show a band from (P90 cost, conservative) to (P50 cost, optimistic).
8. **Typed components** in the core.
9. **One project-level rate card** shared by 13b, Delivery and ROI.
