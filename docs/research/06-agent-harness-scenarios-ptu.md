# Agent harness cost model, scenario catalog, PTU break-even (researched 2026-10-02)

Microsoft Learn / azure.microsoft.com / prices.azure.com were blocked; Microsoft content comes from `MicrosoftDocs/azure-ai-docs` and `MicrosoftDocs/architecture-center` on GitHub. **[verify]** = third-party or memory — ship as editable defaults.

## 1. Agent harness cost model

### 1.1 Anchoring facts
| Fact | Value | Source |
|---|---|---|
| Agents vs chat | agents ≈ **4×** chat tokens; multi-agent ≈ **15×** | Anthropic, *multi-agent research system* |
| Token usage explains performance | 80% of variance (BrowseComp) | same |
| Subagents | 3–5 typical, >10 complex | same |
| Claude tool-use overhead | Opus/Sonnet 5.5: 286; Opus 5: 286/406; Sonnet 5: 354/474; Opus 4.7: 675/804; 4.5–4.6 & Haiku 4.5: ~496/588 | Claude docs |
| Billed tool tokens | `tools` param + `tool_use` + `tool_result`, every request | same |
| MCP tool-list overhead | GitHub 35 tools ≈ 26K; Slack 11 ≈ 21K; Sentry 5 ≈ 3K; 58 tools ≈ 55K | Anthropic, *Advanced tool use* |
| Tool search / deferred loading | −85% (77K → 8.7K) | same |
| Programmatic tool calling | −37% | same |
| Code execution with MCP | −98.7% in one example | Anthropic |
| Anthropic cache | write 1.25× (5m) / 2× (1h); read 0.1× (Opus 5.5 0.05×; Fable 5.1 0.025×); min prefix 512–4,096 | Claude docs |
| Azure OpenAI cache | cached reads discounted on Standard, up to 100% on PTU; no write charge before GPT-5.6; GPT-5.6+ cache writes, `prompt_cache_key`, 30-min TTL; >~15 RPM per prefix may miss; min prefix 1,024 | azure-ai-docs |
| Reasoning tokens | billed as output; Claude 4.5+/4.6+ keep prior thinking in context (billed as input); changing effort invalidates cache | Claude docs |
| Default loop caps | OpenAI Agents SDK `max_turns` 10; LangGraph `recursion_limit` 25 | SDK docs |
| Variance | same task can vary ~30× in tokens across runs | arXiv 2604.22750 |
| Microsoft guidance | Magentic most variable; group chat ≤3 agents; cap maker-checker iterations; compact context; small models for routing/formatting | Architecture Center |

### 1.2 Single-agent loop — closed form
Symbols: `S` system prompt · `D = n_tools × t_tool + O_sys` · `U` task + injected context · `P = S + D + U` · `a` visible output/step · `h` hidden reasoning/step · `κ` 1 if reasoning kept in context · `c` tool calls/step · `r` tool-result tokens · `g = a + κh + c·r` · `T` steps.

- Input at step k: `X_k = P + (k−1)·g`
- `IN = T·P + g·T(T−1)/2` (quadratic)
- `OUT = T·(a + h) + a_final`
- With caching (η = cache-alive probability, η_x = cross-task warm prefix):
  - `CACHED = η_x(S+D) + η·[(T−1)·P + g·(T−1)(T−2)/2]`, `NEW = IN − CACHED`
  - `Cost = p_in·(m_r·CACHED + m_w·NEW) + p_out·OUT` (Anthropic m_r 0.1, m_w 1.25/2.0; Azure pre-5.6 m_r = cached/input, m_w 1.0)
- Compaction: per-step simulation (trigger `C_trig`, summary `σ`, keep_recent); makes growth ~linear.
- Worst case under caps: `IN_worst = Σ_{k=1..T_max} min(P + (k−1)g_max, W)`, `OUT_worst = T_max·M`; no cache.
- Retries/failures: `E[cost] = Cost_task·(1 + ρ) + f_fail·Cost(T_max)`; show P50 and P90.
- `Monthly = Tasks × (E[cost] + ToolFees) + Hosting + Observability + Safety`

**Worked example** (GPT-5-class $1.25 / $0.125 / $10; P = 5,000; a 300; c 1.3; r 1,500; g ≈ 2,250; T 8; h 1,000):
| Case | Tokens | Cost |
|---|---|---|
| Single chat call | 5K in, 0.5K out | ≈ $0.011 |
| Agent, no cache | IN 103K, OUT 10.4K | **$0.233** (~20× chat) |
| Agent, η = 1 | cached 82K, new 21K | **$0.140** |

Once caching is on, output + reasoning dominate → expose reasoning effort as a first-class input.

### 1.3 Multi-agent patterns
| Pattern | Calls/task | Coupling | Formula |
|---|---|---|---|
| Single / ReAct | T | one growing history | §1.2 |
| Sequential | Σ T_i | next agent gets last output or full transcript | `Σ Cost_i(U_i)` with U_i growing in `full` mode |
| Concurrent fan-out/in | Σ T_i + aggregator | same input to N; aggregator sees N outputs | `Σ Cost_i(U) + Cost_agg(U + N·out)` |
| Orchestrator–workers | T_o + Σ T_w | workers fresh; orchestrator grows by summaries | `Cost_orch(g_o = a_o + spawns·s_w) + N·Cost_worker` |
| Handoff | Σ segments | full or filtered history transfer | cache miss at each handoff |
| Group chat / maker-checker | R × (manager + speaker) | shared thread | quadratic in rounds R |
| Magentic | ~3 manager calls + 1 worker per round | ledgers | wide P50/P90 |

Quick mode: chat baseline × 4 (agent) or × 15 (multi-agent).

### 1.4 Default parameters
| Parameter | Default | Range |
|---|---|---|
| System prompt | 1,500 | 300–8,000 |
| Tools per agent | 10 | 1–60 |
| Tokens per tool | 250 (MCP ~750) | 100–2,000 |
| Tool-use overhead | 300 | 286–675 |
| Task input | 500 (+ RAG chunks) | |
| Steps per task | 8 | 3–50 |
| Tool calls per step | 1.3 | 1–4 |
| Tool result | 1,500 | 200–10K+ |
| Visible output/step | 300 | 100–800 |
| Reasoning/step | none 0 / low 500 / med 2,000 / high 6,000 | |
| Cache hit η | 0.8 | 0–0.95 |
| Cross-task warm prefix | 0.5 | |
| max_turns | 10 / 25 | |
| max_tokens/call | 4,096 | 1K–64K |
| Compaction trigger / summary | 100K / 3K (off) | |
| Retry rate | 5% | |
| Hard-fail rate | 2% (billed at T_max) | |
| Subagents | 3 | 3–10+ |
| Subagent summary | 1,500 | |

### 1.5 Agent runtime hosting
- **Foundry Agent Service:** no charge for agents themselves; pay model tokens + tools (File Search storage $/GB/day, Code Interpreter ~$0.03/session [verify], Bing grounding $14/1K [verify vs $35], AI Search, BYO Cosmos/Storage).
- **Foundry hosted agents:** $0.0994/vCPU-hr + $0.0118/GiB-hr [verify]; sizes 0.5/1, 1/2, 2/4; idle timeout default 15 min billed. `Sessions × (active_min + idle_min)/60 × (vCPU·0.0994 + GiB·0.0118)`.
- **Container Apps (self-hosted Agent Framework/LangGraph):** $0.000024/vCPU-s, $0.000003/GiB-s; free 180K vCPU-s, 360K GiB-s, 2M requests.
- **Durable agents (Durable Task Scheduler):** Consumption per action; Dedicated per Capacity Unit. `actions/task ≈ 1 + 2·(LLM calls + tool calls)`.

## 2. Scenario catalog
| # | Scenario | Inputs | Formula sketch |
|---|---|---|---|
| 1 | Voice / call-center agent (realtime) | calls/mo, minutes, talk ratio, model, prompt+tools, turns, % cached, telephony $/min | `calls × Σ_turns Tok_audio(P + history, out) + telephony`; or cascade STT + LLM + TTS |
| 2 | Cascaded speech pipeline | audio hrs, real-time/batch, add-ons, TTS chars | `hrs·rate + hrs·Σaddons + chars/1e6·TTS` |
| 3 | Translation | chars, pages, Translator vs LLM, languages | `chars·langs/1e6·rate` or LLM tokens × langs |
| 4 | Image generation | images, size/quality, prompt | `imgs·(prompt·p_in + img_out·p_out)` |
| 5 | Vision / image understanding | images, detail | `Tok(text + img_tokens, out)` |
| 6 | Video analysis | hours, audio-only vs video, fps | `min·rate` or frames × img tokens + transcript |
| 7 | OCR backfill of scanned archives | pages, % scanned, tier, one-time | `scanned·ocr/1000 + digital·digital/1000` one-time + monthly delta |
| 8 | Classification/extraction at scale (Batch) | items, tokens in/out, % batchable | `items·Tok·(batch·0.5 + (1−batch))` |
| 9 | Code assistants / GitHub Copilot | devs, plan, overage | `devs·seat + overage` |
| 10 | Microsoft 365 Copilot | licensed users, metered messages | `licensed·30 + msgs·0.01` [verify] |
| 11 | Copilot Studio agents | conversations, event mix | credits (classic 1, generative 2, action 5, graph grounding 10…) × $0.01 or $200/25K packs [verify] |
| 12 | Fine-tuning | training tokens, epochs, tier, hosting months | `tok·epochs·p_train + 1.70·730·deployments + inference` |
| 13 | Guardrails / content safety | requests, chars, images, features | `req·ceil(chars/1000)·0.38/1000·checks + imgs·0.75/1000` |
| 14 | Observability | requests, KB/request, prompt capture, retention | `GB = req·(spans·KB + prompts·tokens·4B)/1e6`; `max(0, GB−5)·2.30` |
| 15 | Continuous online evaluation | sample %, evaluators, judge model | `samples·n_eval·Tok(ctx + rubric, out)` |
| 16 | Synthetic data generation | examples, pass rate | `N/pass·(Tok_gen + Tok_judge)` ×0.5 batch |
| 17 | Re-embedding on model change | corpus tokens, changes/yr | `corpus·p_emb·changes/12` + 2× Search SUs during cutover |
| 18 | Data growth | corpus, growth %, horizon | `corpus_m = corpus_0·(1+g)^m`; 12/24/36-month projection |
| 19 | AI Search extras | queries, % semantic, agentic tokens | `SU·rate + semantic + agentic` |
| 20 | Web grounding | grounded queries | `q·calls·14/1000` |
| 21 | Query-time embeddings | queries × tokens | `q·tok·p_emb` |
| 22 | Long-context caching vs RAG | doc tokens, questions per TTL | `D·m_w + (Q−1)·D·m_r` vs `Q·k·chunk` |
| 23 | Model routing / cascades | % small, escalation | `s·p_small + (1−s)·p_large + esc·p_large` |
| 24 | Human-in-the-loop review | % reviewed, min, $/hr | `items·rate·min/60·$hr` |
| 25 | Networking & platform | private endpoints, APIM, Key Vault, egress | flat monthly per environment |

## 3. PTU sizing and break-even

### 3.1 Microsoft sizing method
- `InputTPM = PeakRPM × prompt`, `OutputTPM = PeakRPM × response`
- `NormTPM = InputTPM·(1 − cache_rate) + ratio_out·OutputTPM` (cached deducted 100%, except GPT-6 normalized accounting)
- `PTU = roundUp(NormTPM / TPM_per_PTU, increment)`, ≥ minimum
- Docs example: gpt-5.2, 1,000 RPM, 200 in, 20 out → 360K NormTPM → 105.9 → **110 PTU**; 50% cache → **80**.
- GPT-6: `NormTPM = Σ category_TPM × (category price / short-context input price)`.
- gpt-5.4 / gpt-4.1: >128K prompts not supported on PTU → spillover to Standard.

### 3.2 Billing facts
Hourly per deployed PTU whether used or not; cannot pause. Reservations 1-month / 1-year, scoped by deployment type. Rates [verify]: Global $1.00/hr, DZ ~$1.10, Regional ~$2.00; reservation ~$260/PTU-month; 1-year ~$2,652 (~$221/mo).

### 3.3 Break-even
- `Cap = TPM_per_PTU × 43,200` normalized tokens/month
- `V = Cap × p_in` (PAYG value)
- `u* = R_ptu / V`; PTU cheaper only when utilization `u > u*`
- Calibration: gpt-5 4,750 × 43,200 = 205M × $1.25 = $256 ≈ $260 reservation → u* ≈ 1.0. gpt-4.1 and GPT-6 Sol likewise ≈ $259.

| Billing | Break-even utilization |
|---|---|
| Monthly reservation | ~100% |
| 1-year reservation | ~85% |
| Hourly | ~285% (never) |

**PTU is bought for latency SLA, throughput guarantee and residency — not savings** — except with heavy caching (cached input consumes 0 PTU capacity on pre-GPT-6 models but is still charged on PAYG).

Calculator output: PTU count (Microsoft rounding), monthly cost hourly/1-month/1-year, PAYG cost for same tokens, break-even load factor, hybrid (PTU at P50 + PAYG spillover).

## Sources
Anthropic engineering posts (multi-agent research system, advanced tool use, code execution with MCP); Claude docs (tool use, prompt caching, extended thinking, compaction); azure-ai-docs (PTU sizing & billing, prompt caching, batch, fine-tuning cost, hosted agents); Architecture Center agent design patterns; OpenAI Agents SDK; arXiv 2604.22750; Container Apps & Durable Task Scheduler billing; Copilot Studio / M365 Copilot pricing (third-party); Content Understanding pricing explainer; Grounding with Bing pricing.
