# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-07

First public release.

### Added

- Cost and ROI engine: one monthly ledger for labour, AI Dev Lab, dev environment, run, platform, maintenance and transition costs, with payback, ROI and NPV. All prices in CAD, with the CAD/USD rate measured from Azure meters.
- Price catalogue with source, retrieval date and confidence on every entry, plus refresh scripts for the Azure Retail Prices API and the Snowflake credit table (`pnpm prices`).
- Build estimate: rate card, named people and role counts, workstreams and templates, per-workstream allocation with month windows, and the AI Dev Lab (bake-offs, harness iterations, regression, evaluation, red teaming, synthetic data, fine-tuning, coding tools) with a month plan.
- Run estimate: production workloads for speech, documents, email, embeddings, AI Search, retrieval, chat, voice and agent harnesses, with per-workload deployment (Global, Canada Regional, US Data Zone) and a Standard or Batch tier.
- Executive Summary page (#13): verdict, headline tiles, waterfall, cumulative cash line and top cost drivers.
- Ranges, IRR and CFO measures (#18): cautious, expected and optimistic cases, IRR, hurdle rate, terminal value and risk weighting.
- Benefits: benchmark library with sources and confidence, per-task, per-user-week and per-queue capabilities, avoided costs and headcount, adoption and realisation, licence overlap, sensitivity tornado, before and after view and savings levers.
- Scenarios, projects library with templates, undo and redo, and file import and export.
- Capacity (PTU) sizing with pay-as-you-go against hourly, 1-month and 1-year reservations.
- Use-case wizard and recipes (#19) and a first-run product tour (#17).
- Field help, glossary and inline validation (#15).
- Report v2 and scenario comparison (#20), with charts in the Excel export.
- Token calculator, including the guided file and agent token estimator (#25), with cache writes, reasoning tokens, language, tokenizer and long-context pricing (#14).
- Exports: Excel workbook, CSV line items, JSON project file and a printable report.
- Editable AI Dev Lab cost grid, fixed monthly allowance and AI Dev Lab settings card (#36).
- Selective build labour: exclude lines from cost and set manual hourly rates (#33).
- Snowflake Cortex credits and the CAD conversion shown on Run, Settings, Tokens and exports (#34).
- Any-project scope gap analysis (#37) and the open-source plan (#38, #39).
- Open-source files: MIT licence, Code of Conduct, Contributing, Security and Support policies, issue and pull request templates (#40).

### Changed

- Hosting, tool fees, images and PTU now flow through the ledger (#21).
- Feature model and per-workload timing (#16).
- Responsive layout, accessibility and dark mode (#22); wizard uses the benefit types from the ROI page (#23).
- Month labels and captions, an explicit cost basis on headline numbers and a pricing model setting (#28, #29).
- The sidebar lists every project as a collapsible row (#32).
- Add menus open downward when there is no room above (#35).
- Renamed the product to ROI Calculator and the packages to `@roi-calculator/*` (#52). Old project files and browser storage keys are still read.
- Internal references removed before the public announcement (#41).

### Fixed

- Review fixes: delete any project, and exclude build labour consistently in every figure (#30).
- Glossary page is scrollable (#28).
- Azure meter mappings found on the first live price refresh.
- Workbook export test types (#24).
