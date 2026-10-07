# Contributing to ROI Calculator

Thanks for helping. This is a local, offline cost and ROI calculator for technology projects (Azure infrastructure, team, benefits, and an AI token calculator), priced in CAD. It is a static app: no server, no accounts, no telemetry.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js 22 (CI runs 22).
- pnpm 10.28.0. The version is pinned in the `packageManager` field of `package.json`; with Corepack enabled (`corepack enable`) the right one is picked up automatically.

## Install and run

```bash
git clone https://github.com/nitin27may/roi-calculator.git
cd roi-calculator
pnpm install
pnpm dev          # Next.js dev server on http://localhost:3000
```

Layout:

| Path | What it holds |
| --- | --- |
| `packages/catalog` | Price and model data (JSON) and the schema that validates it |
| `packages/engine` | Cost, ROI and allocation maths, project schema, migrations, use-case recipes |
| `apps/web` | The Next.js static-export UI |
| `scripts/prices` | Price refresh scripts (Azure Retail Prices API, Snowflake) |

## Verify before you push

Run the whole chain. CI runs the same checks.

```bash
pnpm test
pnpm typecheck
pnpm --filter @studio/web exec tsc --noEmit    # the root typecheck does not cover apps/web
pnpm validate                                  # catalogue integrity
pnpm --filter @studio/web build
```

## Branches and pull requests

- One change per PR. A price refresh, a bug fix and a new feature are three PRs.
- Branch from `main` and rebase on the latest `main` before you open or update the PR. No merge commits.
- CI ("Test, typecheck, build") must pass. A PR is not merged while it is red.
- Tests ship with the change. If it is testable, it has a test in the same PR.
- Say whether the golden totals moved. If they did, explain why in the PR.
- If you change the project shape, bump the project version, add a step to `migrateProject` in `packages/engine/src/migrate.ts`, and add a golden fixture under `packages/engine/test/fixtures/` showing that an older saved project still produces the same figures. A saved project must keep costing what it did.
- Every new input field needs an entry in `apps/web/lib/help.ts`. `apps/web/test/help.test.ts` fails when one is missing.
- For UI changes, attach screenshots (light and dark, desktop first).

## Adding a resource or a price

Catalogue data lives in `packages/catalog/data/` as JSON, validated by `packages/catalog/src/schema.ts`.

1. Add the entry to the right file (for example `unit-prices.json` for per-unit Azure meters, `chat-models.json` for models). Each entry carries a `source` (kind, URL, meter name, `retrievedAt` date) and a `confidence`.
2. Prices are CAD. If you only have a USD price, add it to `usd-list.json` so the FX step converts it; do not convert by hand.
3. Run `pnpm validate`, then `pnpm test`.
4. Where the price comes from the Azure Retail Prices API, add the meter mapping in `scripts/prices/azure-map.ts` so `pnpm prices:azure` keeps it fresh. Snowflake is handled by `scripts/prices/snowflake.ts`. `pnpm prices:azure --check` reports drift without writing.
5. Cite your source in the PR. A price with no source is not merged.

Price refreshes write a report to `reports/`; include it in the PR.

## Adding a use-case recipe

Recipes are data in `packages/engine/src/usecases.ts`. A recipe asks a few plain questions and turns the answers into features, workloads, Dev Lab activities, workstreams and benefits. Rules:

- A recipe never picks a model; the user does.
- A recipe never adds an agent harness unless it is an agent recipe.
- Every question needs `help` text (meaning, example, source).
- Add a test that builds the recipe with its defaults and checks the resulting project passes `ProjectSchema`.

## Commit style

- Short imperative subject, under about 72 characters: "Add price correction issue form".
- Body explains why, not what, when the reason is not obvious.
- One logical change per commit.

## Code style

- TypeScript, strict mode. No `any` unless there is a comment saying why.
- Keep the engine pure: no I/O, no `Date.now()` or randomness in calculations.
- Comments explain why, not what.
- Match the surrounding code. There is no separate formatter step; follow what is already in the file.
- Plain, direct wording in UI text, docs and commit messages.

## Gotchas

- `pnpm typecheck` does not type-check `apps/web`. Run the web `tsc` command above.
- The web app is a static export. Anything that needs a server will not work.
- Never hand-edit prices that a script manages; change the mapping and rerun the script.
