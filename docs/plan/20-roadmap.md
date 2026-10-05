# Roadmap

## Phases (one phase = one PR, in order)

| # | Phase | Delivers | Main gaps closed | Acceptance |
|---|---|---|---|---|
| P0 | Plan docs | This plan split into `docs/plan/*`, plus `docs/PROGRESS.md` | none | Docs merged |
| P1 | Foundation | Project migration chain (v1→v2); C$ formatting with compact form; one shared palette; progress matrix wired | F9 (migration), V1, V3 | Old saved projects load with identical totals |
| P2 | Processing tier | Configurable tier (Standard/Batch), alerts for unavailable tiers | E15 (tier part) | Batch results identical to today |
| P3 | Token accuracy I | Cache writes, reasoning everywhere, language multiplier, warm prefix, tokenizer gaps, long context, missing workload tests | E1–E6, E16 | One test per gap; golden total change explained |
| P4 | Executive Summary | Executive Summary spec in 10-target-product.md (point estimates), plain labels, alert summary | U1, U3, V2, V4, V6 | Desktop screenshot review |
| P5 | Feature model and timing | Feature entity; per-workload start, end and ramp; one-time volumes; free-text CAD items; non-labour contingency; no silent agent; Run grouped by feature | F1, F3, F4, F7, E11 | Migration puts existing projects into one feature. Delivered: schema v3, golden fixture proves totals identical (packages/engine/test/golden-migration.test.ts) |
| P6 | Guided input and help | Hints, glossary, inline validation, page intros, keyboard and labels | U7, U8, part of U10 | Every field has help |
| P7 | Product tour | Help, glossary and tour spec in 10-target-product.md | U6 | Skip persists after reload; relaunch works |
| P8 | Ranges and CFO depth | Per-workload ranges, Dev Lab percentiles, retries, wider sensitivity, IRR, discounted payback, risk weighting, capex/opex, new benefit types | E9, E10, E12, E14, F6, U2 | IRR checked against known cash flows |
| P9 | Use-case wizard | Use-case wizard spec in 10-target-product.md, with all recipes; templates become presets | F2, F5, F8 | Each recipe's output validates against the schema |
| P10 | Infra, tools, images, PTU | Hosting presets, tool fees by volume, image tokens, PTU in the ledger, editable hard-coded values | E7, E8, E13, E15 | Container Apps price fixed |
| P11 | Report v2 and comparison | Cover, exec page, appendix, ranges, Excel charts, scenario and project comparison, portfolio cards | U4, U5, U9 | Printed PDF reviewed |
| P12 | Responsive and accessibility | Collapsible sidebar, contrast ≥ 4.5:1, text ≥ 12px, chart tables, dark-mode toggle | U10, U11, V5 | Tablet screenshots |

**Dependencies**
- P5 must come before P9.
- P6 must come before P7, because the tour points at the help controls.
- P8 fills in the ranges in P4.

**Deferred**
- Priority and Flex prices (data only after P2).
- Monte Carlo NPV.
- Cloud storage and sharing.
- MAI image and voice models.
- USD-derived fine-tune rates.

**Risks**
- **P3 changes saved estimates.** Show a one-time "estimates updated" notice and record the version.
- **The wizard can look authoritative.** Show sources and keep everything editable.
- **Chart scope.** Stay on hand-rolled SVG with 4–5 new building blocks (Waterfall, RangeBar, Bullet, Dumbbell, Ranked bar), each with a table view.
- **Static export.** The tour, the wizard and anything that reads localStorage stay client-only.

## Verification for every build phase

- Tests, typecheck, catalogue validation and the web build pass. Golden totals are unchanged, or the change is stated.
- Local dev on port 3317 is checked with Playwright: desktop light-theme screenshots of every page touched, with charts at 2×. Tablet screenshots for P12. For the tour: skip, reload, relaunch.
- PR, CI pass, merge, `pnpm run deploy`, live check. Then update `docs/PROGRESS.md` and post the matrix.

---
Part of the [audit and product plan](README.md). Status: [PROGRESS.md](../PROGRESS.md).
