# Audit: project flexibility

## 2.3 Flexibility gaps (project shapes)

| # | Gap | Detail |
|---|---|---|
| F1 | No single Feature entity (closed in P5) | A workstream (build), a capability (benefit) and its workloads are linked only through `capability.componentIds`, which mixes ids and isn't validated. Workloads don't belong to a feature. |
| F2 | No use-case layer | Nothing turns "N documents × pages" or "N users × questions" into a linked pipeline (extraction → embeddings → index → retrieval → chat). Each workload is typed separately and has to be kept consistent by hand. |
| F3 | Timing (closed in P5) | Every workload is monthly from go-live on one project-wide ramp. There is no start or end month and no one-time volume. |
| F4 | Agents assumed (closed in P5) | `ensureHarness` (`templates.ts:55-58`) silently adds an agent harness. Evaluation's `scoredShare` assumes bake-off, iterations and regression. |
| F5 | Templates | Only meeting, rag, email, voice and blank exist. Missing: extraction only, batch LLM only, book or document optimisation, a multi-agent project, copilot without RAG, search only, Snowflake Cortex, content generation, translation, non-AI and hybrid. Defaults are hard-coded to gpt-5.4 and gpt-5.4-mini. |
| F6 | Benefits | Benefits are mostly time saved. There are no revenue, quality or error-cost, or risk benefits. Avoided costs can't be attributed to a capability. `volumeFrom` ignores rows, tokens and chunks. |
| F7 | Fixed costs (closed in P5) | Every fixed item needs a catalogue `unitPriceId`, so an amount like "C$2,000/month for a vendor licence" can't be entered. |
| F8 | Token calculator | The Tokens page adds single workloads, not pipelines. Its Emails and Snowflake modes are missing (DESIGN.md §6 promises Emails). |
| F9 | Storage | Projects live in one browser's localStorage. There is no sharing and no portfolio view. `version: z.literal(1)` has no migration path (`project.ts:246`, `apps/web/lib/store.ts`). |

## 2.5 Pending items already listed in the docs

- From HANDOVER §6:
  - Fine-tune rates are still derived from USD.
  - Monte Carlo NPV.
  - Side-by-side project comparison.
  - No mobile layout.
  - Sensitivity moves one input at a time.
  - Before/after covers only capabilities with a baseline.
  - List prices only.
  - Storage is per browser.
- Elsewhere:
  - GPT-5.6 Priority and Flex tiers (now: make the tier configurable, don't price it yet).
  - No image workload.
  - The DESIGN §5 "model swap and ramp length" lever is partly covered by scenarios.

---
Part of the [audit and product plan](README.md). Status: [PROGRESS.md](../PROGRESS.md).
