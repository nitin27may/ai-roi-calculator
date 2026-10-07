# Progress

Updated in every PR and posted after every merge. Plan: [docs/plan](plan/README.md).

| # | Area | Item | Status | PR | Notes |
|---|---|---|---|---|---|
| 1 | Prices | CAD everywhere, FX measured | Done | #3 | |
| 2 | Deployments | Global / Canada Regional / US Data Zone per workload | Done | #4, #5 | |
| 3 | Hosting | Cloudflare Pages static export | Done | #6, #8 | `pnpm run deploy` |
| 4 | Dev Lab | Sample covers all 9 activities | Done | #7 | |
| 5 | Prices | Batch discounts from Azure meters | Done | #9 | |
| 6 | Plan | Audit and plan docs | Done | #10 | P0 |
| 7 | Foundation | Migration, C$, palette | Done | #11 | P1 |
| 8 | Pricing | Configurable processing tier | Done | #12 | P2; Priority and Flex deferred |
| 9 | Accuracy | Token accuracy I | Done | #14 | P3 |
| 10 | Exec | Summary page | Done | #13 | P4 |
| 11 | Flexibility | Feature model and timing | Done | #16 | P5 |
| 12 | Guidance | Help, glossary, validation | Done | #15 | P6 |
| 13 | Guidance | Product tour | Done | #17 | P7 |
| 14 | Accuracy / CFO | Ranges, IRR, risk weighting | Done | #18 | P8; see docs/plan/20-roadmap.md and 10-target-product.md |
| 15 | Flexibility | Use-case wizard | Done | #19 | P9 |
| 16 | Coverage | Infra, tools, images, PTU in ledger | Done | #21 | P10 |
| 17 | Exec | Report v2, comparison | Done | #20 | P11 |
| 18 | Quality | Responsive, accessibility | Done | #22 | P12; P9b wizard benefit types in #23 |
| 19 | Guidance / Coverage | Guided file and agent token estimator | Done | #25 | P13 |
| 20 | Review fixes | Month labels and captions, explicit cost basis, pricing model setting | Done | #28, #29, #30 | Month 1 headers and legends; Default ROI cost basis and Pricing model (pay-as-you-go or PTU) in Settings; basis shown on headline numbers; Delete any project (inline confirm, empty library stays empty); Exclude build labour flows through every figure; collapsible project menu in the sidebar; sidebar lists every project as its own collapsible row, and the project section disappears with an empty library; per-line Costed toggle and manual hourly rate on the build team, with an editable rate card; Snowflake lines show credits, CAD per credit and manual or catalogue rate on Run, Settings, Tokens and the Line items export |
| 21 | Scope | Any-project scope: gap analysis | Done | #37 | docs/plan/30-any-project-gaps.md; brainstorm next |
| 22 | Repo | Rename to roi-calculator and open-source standard | Done | #40, #41, #52, #53 | docs/plan/40-roi-calculator-open-source.md; About and topics set 2026-10-07; licence and community files added; internal references cleaned; product and packages renamed (repo rename pending); README and CHANGELOG written (Done), v1.0.0 released; new site name deferred |
| 23 | Scope | Any-project build (environments, resource master, current vs target, benefit scorecard) | Next | | Brainstorm done 2026-10-07; phased plan A0 to A15 in docs/plan/50-any-project-build-plan.md; A0 (v5 golden fixture) done; A2 catalogue format and engine pricing of resources done (no UI, seed data only); A5 current state and savings done (itemised lines, keep, reduce or retire, dual running, Summary tile); A1 project types (schema v6, per-feature types, AI pages gated by visibility only) done; A6 environments engine done (environments, env stream, cost bases; A7 infrastructure page done (/infrastructure: environments grid, resource picker and cards, totals strip, Overview and KPI show the env stream); A8 run cost beyond AI done (seats, contracts and per-transaction fees as non-AI workload kinds on Run); A9 delivery model done (delivery phases, people x weeks effort, hypercare billed after go-live, delivery costs stream, standard role list) |

Status values: Pending, In progress, In review, Done, Deferred.
