# Audit and product plan (2026-10-04)

This folder records the end-to-end audit of the calculator and the plan to make it an executive-grade, use-case driven estimator.

| File | Content |
|---|---|
| [01-audit-engine.md](01-audit-engine.md) | Token and cost accuracy: what is strong, ranked gaps E1-E16 |
| [02-audit-ux.md](02-audit-ux.md) | Presentation and UX gaps U1-U11, browser findings V1-V6 |
| [03-audit-flexibility.md](03-audit-flexibility.md) | Project-shape gaps F1-F9, items already pending in other docs |
| [10-target-product.md](10-target-product.md) | Navigation, Executive Summary, use-case wizard, help and tour, processing-tier design |
| [20-roadmap.md](20-roadmap.md) | Phases P0-P12, dependencies, deferred items, risks, verification |
| [../PROGRESS.md](../PROGRESS.md) | The living done/pending matrix, updated in every PR |

## Context

**Users**
- **Executives** (CIO, CTO, CFO, VPs of each technology stream, directors) make funding decisions in seconds. They need the answer at a glance, a sense of how certain it is, and detail only on request.
- **Solution architects** build the estimate. They need every assumption visible and editable.

**Purpose.** Estimate what an AI initiative costs to research and build, and what it costs to run. That covers:
- the AI Dev Lab: exploratory token spend while developers try things, which nobody can estimate today;
- production usage;
- infrastructure.

These costs are set against the conventional ROI case, which now includes AI.

**Inputs come from the use case**, for example:
- "optimise 10 books";
- "ingest N documents";
- "AI Search over X";
- "N users ask questions".

The tool then helps pick resources and configuration.

**It must not be tied to one use case.** A project can have:
- many features or one;
- many agents, one agent or none (AI Search only, extraction only, batch LLM);
- AI mixed with non-AI work.

**Decisions so far**
- **Deployments:** US Data Zone Standard and Canada Regional Standard are what's used now. Global stays selectable for audio and transcription.
- **Processing tiers:** Priority and Flex are not priced now, but the tier must be configurable so adding them later is data only.
- **Progress matrix:** a done/pending table is kept and shown after every merge.
- **Guided input:** people who don't know tokens are guided through it.
- **Product tour:** a first-run tour shows every step until the user skips or finishes it, and can be relaunched from Help.

**How the audit was done (2026-10-04)**
- Three read-only code audits: engine, UI, and project flexibility.
- An independent design review.
- A browser pass on https://token-calculator-532.pages.dev at 1853×905 (desktop) and 820×1100 (tablet).

## Principles

1. **Answer first, detail on demand.** Every page leads with the answer to one executive question. The detail sits one click below.
2. **One meaning per colour, everywhere:**
   - orange: build and Dev Lab;
   - green: run;
   - teal: benefit;
   - slate: other;
   - red: risk and alerts only.
   - No purple, and nothing is shown by colour alone.
3. **Every number explains itself.** A hover or tap shows the formula, inputs, source and confidence. This reuses the existing line formulas.
4. **Ranges, not false precision.** Headline figures show low, expected and high. Assumption confidence is visible.
5. **Plain language on top, technical terms underneath:**
   - "Building & testing (AI Dev Lab)";
   - "Typical / Busy month / Worst case (P50 / P90 / worst)";
   - "Reuse of earlier prompt (cache hit)".
6. **Use case in, configuration out.** Users describe the work; the tool proposes resources. The tool recommends but never preselects choices the user owns. Every derived assumption is editable and cites its source.
7. **Any shape of project.** Features own their workloads, Dev Lab activities and benefits. Agents are optional. Non-AI costs and benefits are first-class.
8. **Configurable, not hard-coded.** Deployment (Global / Canada Regional / US Data Zone) and processing tier (Standard / Batch now; Priority / Flex later as data) are set per project and per workload.
9. **CAD everywhere,** shown as C$, with the FX date stated on every export.
- [30-any-project-gaps.md](30-any-project-gaps.md): moving from AI-only to any project type (automation, migration, new process, enhancement, AI); gaps and brainstorm agenda.
