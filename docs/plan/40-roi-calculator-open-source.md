# Next: rename to roi-calculator and open-source standard (2026-10-07)

This is the next phase, ahead of the any-project build work in [30-any-project-gaps.md](30-any-project-gaps.md). The rename comes first so that the any-project work lands under the final name.

## Done already
- GitHub About is set. The description is "Local, offline cost and ROI calculator for technology projects: build team, environments, Azure infrastructure, run cost and benefits, in CAD. Includes a token calculator for AI workloads." The homepage is the live site.
- Topics are set: roi-calculator, cost-estimation, business-case, tco, finops, azure, azure-pricing, cloud-cost, token-calculator, azure-openai, nextjs, typescript.

## 1. Rename to `roi-calculator`

| Item | Today | Target |
|---|---|---|
| GitHub repo | `nitin27may/ai-roi-calculator` | `nitin27may/roi-calculator` (GitHub redirects the old URL) |
| Local folder | `~/workspace/ai-roi-calculator` | `~/workspace/roi-calculator`, with `origin` updated |
| Root package | `ai-roi-calculator` | `roi-calculator` |
| Workspace packages | `@studio/engine`, `@studio/catalog`, `@studio/web` | `@roi-calculator/engine`, `@roi-calculator/catalog`, `@roi-calculator/web` |
| Product name in the UI | "AI Cost & ROI Studio" (layout title, sidebar, tour, intros, workbook, report) | "ROI Calculator"; the token calculator stays a quick tool inside it |
| Project file schema id | `ai-cost-roi-studio/project` | `roi-calculator/project`, with a `migrateProject` step that still reads the old id, and a golden fixture |
| localStorage keys | `ai-cost-roi-studio:*` | Keep reading the old keys and copy them to the new ones once, so no saved project is lost |
| Cloudflare Pages | project `token-calculator`, at token-calculator-532.pages.dev | New Pages project `roi-calculator`. The old URL stays live with a notice and a link. Then update the homepage in About |
| Docs | README, HANDOVER, PLAN, DESIGN | Updated to the new name, with a dated rename note |

Saved projects and exported JSON files from before the rename must open with identical totals. A test enforces this.

## 2. Open-source standard

| Area | What to add |
|---|---|
| Licence | `LICENSE` file and the `license` field in each package.json. MIT is recommended (simple, permissive, fits a calculator). Nitin decides |
| Community files | `CONTRIBUTING.md` (setup, the test/typecheck/validate/build chain, branch and PR rules, how to add a resource or price), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (private reporting via GitHub security advisories), `SUPPORT.md` |
| GitHub templates | Issue forms: bug, feature request, price correction (resource, region, expected price, source link), new resource request. A PR template with the checklist. `CODEOWNERS` |
| Automation | Dependabot for npm and GitHub Actions. CodeQL scanning. Secret scanning and push protection on. Branch protection already requires CI |
| Releases | Semantic version tags, `CHANGELOG.md` (Keep a Changelog), GitHub Releases with notes. The first release is `v1.0.0` after the rename |
| README | Badges (CI, licence, release), one screenshot, what it does in three lines, quick start, features, a Mermaid architecture diagram, how prices are sourced and refreshed, a disclaimer (estimates from list prices; not a quote), contributing link, roadmap link |
| Disclaimers and attribution | Prices come from the public Azure Retail Prices API and Snowflake's published rates. State this and the price date. Benchmarks keep their source links |
| Clean-up before announcing | Remove or neutralise internal references in docs, data and tests. A scan found WorkGraph, personal and internal-host names in README, docs (HANDOVER, PLAN, DESIGN, PR_DESCRIPTION, research/08), `packages/catalog/data/benchmarks.json`, `packages/engine/test/benefits.test.ts`, `scripts/prices/*.ts` and `scripts/seed/seed_catalog.py`. Move internal-only notes out of the repo. Run a full-history secret scan (gitleaks) |
| Repo settings | Discussions on; labels (bug, enhancement, pricing, good first issue, help wanted); "Use this template" off; social preview image |
| Docs | Keep `docs/` as the handbook: architecture, how calculations work, how to add a resource, how to add a recipe, pricing refresh |

## 3. Order of work
Each item is one PR, rebased on main, CI green, then merged and deployed.
1. Clean-up of internal references, plus a gitleaks history scan.
2. Licence and community files, issue and PR templates, CODEOWNERS, Dependabot, CodeQL.
3. Rename: product name, packages, schema id with migration, storage keys, docs. Then rename the GitHub repo, the local folder, `origin` and the memory notes.
4. New Cloudflare Pages project `roi-calculator`, a notice on the old site, and the homepage updated in About.
5. README rewrite, CHANGELOG, `v1.0.0` release.

## Decisions needed from Nitin
1. Licence: MIT (recommended), Apache-2.0, or another?
2. Product name in the UI: "ROI Calculator", or something more distinctive?
3. The new Pages URL: create `roi-calculator` now (the old URL stays live), or keep the current URL?
4. Is it all right to remove internal names (WorkGraph and others) from the docs, data and tests, keeping a private copy outside the repo?
