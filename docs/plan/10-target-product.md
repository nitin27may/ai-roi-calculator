# Target product

## 3.2 Information architecture (navigation)

```
Quick tools:   Token calculator
Projects:      All projects (portfolio)   |   New estimate (wizard)
<Project>:     Summary (exec, default)
               Features (per feature: workloads + Dev Lab + benefit)
               Build (team, Dev Lab plan)
               Run (workloads, infra)
               Value & ROI
               Capacity (PTU)
               Report (cover + exec page + appendix)
               Settings (deployment, tier, currency/FX, timeline)
Data:          Prices & sources
Help:          Take the tour | Glossary | How estimates work
```

## 3.3 Executive Summary page (spec)

| Executive question | Element | Notes |
|---|---|---|
| What does it cost and what does it return? | Headline tiles: total cost over plan; build; steady-state annual run; benefit per year; NPV; payback month | Each tile shows a low–high range under the figure once ranges exist (P8) |
| Should we do it? | Verdict chip: "Pays back in month 26 · NPV positive", with an icon and text | Thresholds come from Settings (hurdle rate, payback limit) |
| How do build, run and benefit net out? | Horizontal waterfall: build → year-1 run → later run → benefit → net | Replaces the mixed bar and line chart as the lead visual |
| When do we break even? | Cumulative cash line with the payback marker and a P10–P90 band | Band added in P8 |
| What does one unit cost? | Bullet chart: cost per user per month, per transaction, per document, against today's manual cost | Unit chosen per feature |
| Where does the money go? | Ranked bar of the top 5 cost drivers, plus "Other" | No pie charts |
| What changes the answer most? | Mini tornado of the 3 biggest sensitivity drivers | Links to the full tab |
| What's risky? | Alert summary by severity (unavailable model, retiring model, low-confidence price, unverified assumption) | Fixes V2 |
| What's the story? | The story sentence from the Overview, kept editable | V6 |
| Options? | Scenario dumbbell chart: baseline against each scenario, on NPV and run cost | Added in P11 |

Every chart has a "View as table" toggle. The tiles and charts reuse a single engine function, `summarize()` in `packages/engine/src/report.ts`, so the Summary page, the Report and the Excel export always show the same numbers.

**P4 delivery notes (deviations):**
- The waterfall and the mini tornado are built from plain HTML/CSS percentage-width bars (the same technique the existing sensitivity tornado on Value & ROI already uses), not a raw `<svg>`. An SVG version hit label collisions at narrow widths — the row label and the amount label share the same text layer and can overlap once a bar runs close to either edge. The HTML version keeps the row label in its own grid column (so it can never collide with the amount label) and moves the amount label inside the bar once it would otherwise run past the edge. Same semantic colours, same "View as table" affordance, no chart library either way.
- The bullet chart for unit cost is a single bar with a tick mark at today's manual cost, rather than a full qualitative-range bullet chart — there's no qualitative range (poor/ok/good) defined for these costs yet, so a plain bar-plus-marker is the honest version of "against today's manual cost".
- The low–high range slot on the headline tiles and the P10–P90 band on the cumulative line are left out entirely (no empty placeholder), per P8's own scope; they land with ranges in P8.
- The scenario dumbbell chart is out of scope here; it is P11's row, unchanged.

## 3.4 Guided estimation (use-case wizard), spec

Steps:
1. **What are you building?** Cards for each recipe: book or document optimisation, document extraction, knowledge search (RAG), search only, chat assistant, single agent, multi-agent, batch processing, email triage, voice or call centre, Snowflake Cortex analytics, content generation, translation, non-AI or hybrid. Several can be picked, and each becomes a feature.
2. **How much?** Plain questions per recipe, for example:
   - "How many documents or books? Pages each? How many passes?"
   - "How many users? Questions per user per day?"
   - "One-time backlog, monthly new volume, or both?"
3. **How should it run?** Deployment, defaulted from Settings. Model, with a recommended model and the reason shown, but not preselected. Quality versus cost slider. Batch allowed?
4. **Building it.** Team size and months, and which Dev Lab activities apply. Defaults are proportional to the features chosen.
5. **What's it worth?** Benefit type per feature (time saved, cost avoided, revenue, quality, risk), with the benchmark presets.
6. **Review.** Every derived workload and assumption is listed with its source. All are editable. Then create.

Recipes are declarative data (`packages/engine/src/usecases.ts`). Each maps answers to features, workloads, Dev Lab activities and capabilities. Templates become recipe presets. No agent is added unless the recipe needs one.

## 3.5 Help, glossary and tour, spec

- **Field help.** A non-modal hint popover on every field gives its plain meaning, unit, an example and where the default comes from. It opens on hover, focus or tap, closes with Esc, and animates smoothly.
- **Glossary.** Covers token, input/cached/output, reasoning tokens, cache write, deployment types, processing tiers, PTU, AI Dev Lab, harness, P50/P90, NPV, payback, IRR and realisation. It is reachable from Help and from every hint.
- **Inline validation.** Out-of-range values are explained ("Max 100% — this is a share of calls"), not silently clamped. Raw schema errors are never shown.
- **Product tour.** Shown on first visit and on each step until finished or explicitly skipped. Back, Next, Skip, and an "n of N" counter. A spotlight highlights the current element. Esc skips. Reduced motion is respected. The seen-state is stored per tour version, and the tour can be relaunched from Help. No heavy dependency: a small in-house component using an SVG mask (driver.js, about 5 KB, is the fallback). Proposed steps:
  1. Welcome and what the ROI Calculator estimates.
  2. Projects and the sample.
  3. New estimate wizard.
  4. Summary tiles.
  5. Waterfall and payback.
  6. Features.
  7. Build and Dev Lab.
  8. Run workloads and the deployment dropdown.
  9. "How this is calculated".
  10. Value & ROI and scenarios.
  11. Report and Excel.
  12. Settings (deployment, tier, FX).
  13. Help menu.
- **Page intros.** A dismissible one-paragraph "What this page answers" at the top of each page.

## 3.6 Processing tier design (configurable now, priced later)

- Add `ProcessingTier = standard | batch` next to `Deployment` in `packages/catalog/src/schema.ts:57`. Keep the enum open for `priority` and `flex`.
- Add `ChatModel.tiers` (a price or factor per tier), replacing `batchDiscount`.
- Add `settings.processingTier` and an optional per-workload and per-activity `tier`.
- Turn `PriceBook.withDeployment` into `withPricing({deployment, tier})`. The tier applies after the deployment price in `tokenPrices` (`pricing.ts:113-118`), in the same way as promo and long-context prices.
- Line meters carry the tier so PTU grouping doesn't mix tiers.
- If a tier isn't available (for example Batch on Canada Regional), fall back to Standard and raise a visible alert, the same way `unavailable()` works.
- Adding Priority or Flex later means:
  - mapping the `PP` and `Flex` meters in `scripts/prices/azure-map.ts`;
  - adding the enum value;
  - catalogue data.
  
  No engine rework.

---
Part of the [audit and product plan](README.md). Status: [PROGRESS.md](../PROGRESS.md).
