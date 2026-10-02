# Azure AI Search, rerankers, evaluations, red teaming, Agent Service, supporting infra (checked 2026-10-02)

## Source caveat
prices.azure.com, azure.microsoft.com and learn.microsoft.com were blocked (403) in the research container. Limits and formulas come from `MicrosoftDocs/azure-ai-docs` (cloned 2026-10-02; e.g. `search-limits-quotas-capacity.md` dated 09/16/2026). Prices come from WebSearch snippets of Azure pricing pages, `github.com/truefoundry/models` (pricing YAML, commit 2026-10-01), microsoft.com/bing, and third-party blogs. **[UNVERIFIED]** items need checking. USD, US East list price.

## 1. Azure AI Search

### 1a. Dedicated tiers (1 SU = 1 replica × 1 partition; billed SU = R × P; month = 730 h)
| Tier | $/SU/hr | $/SU/mo | Storage/partition | Vector quota/partition (GB) | Max P | Max R | Max SU | Max indexes | Max indexers | Docs/index |
|---|---|---|---|---|---|---|---|---|---|---|
| Free | 0 | 0 | 50 MB/service | n/a | – | – | – | 3 | 3 | – |
| Basic | 0.101 | 73.73 | 15 GB | 5 | 3* | 3 | 9* (3?) | 15 | 15 | 24B |
| S1 | 0.336 | 245.28 | 160 GB | 35 | 12 | 12 | 36 | 50 | 50 | 24B |
| S2 | 1.344 | 981.12 | 512 GB | 150 | 12 | 12 | 36 | 200 | 200 | 24B |
| S3 | 2.688 | 1,962.24 | 1 TB | 300 | 12 | 12 | 36 | 200 | 200 | 24B |
| S3 HD | 2.688 | 1,962.24 | 1 TB | 300 | 3 | 12 | 36 | 1,000/partition, 3,000/service (100 GB/index) | preview, 24h/day | 2B |
| L1 | 3.839 | 2,802.47 | 2 TB | 150 | 12 | 12 | 36 | 10 | 10 | 288B |
| L2 | 7.677 | 5,604.21 | 4 TB | 300 | 12 | 12 | 36 | 10 | 10 | 576B |
| Serverless Developer (preview) | CU-hr + GB-month, rates not published | – | – | 300 MB vector/index; 1 GB/index | – | – | – | 30 | 30 | – |

\*Docs contradict themselves on Basic max SU (9 vs 3) — confirm.

Notes:
- Partition sizes increased 2024-04-03 (Basic–S3) and 2024-05-17 (L1/L2). No new increases in 2025–2026. Some regions (Israel Central, Qatar Central, Spain Central, South India) remain on old limits.
- Serverless: CU-hour (1 CU ≈ 1 vCPU + 8 GB) + indexed GB-month; billing starts 2026-09-13; rates "$-" [UNVERIFIED]. 50 QPS/index throttle.
- SLA: 2 replicas read-only, 3 replicas read+write.
- Indexer: max run 2 h (multitenant) / 24 h (private); min schedule 5 min.
- Blob indexer file limits: Basic 16 MB/512K chars; S1 128 MB/4M; S2 256 MB/8M; S3 256 MB/16M; L1/L2 256 MB/4M.
- Skillsets ≤30 skills; language skills ≤50,000 chars/input. Push API 16 MB/request, 1,000 docs/batch.
- Semantic ranker concurrency per SU: Basic 2, S1 3, S2+ 4.

### 1b. Premium features
| Feature | Unit | Price | Free | Status |
|---|---|---|---|---|
| Semantic ranker (Standard plan) | 1K requests | $1.00 | 1,000/mo | verified (snippet) |
| Agentic retrieval (Foundry IQ knowledge bases) | 1M agentic reasoning tokens | $0.022 | 50M tokens/mo | free tier verified, rate UNVERIFIED |
| Agentic retrieval query planning / answer synthesis | LLM tokens | your Azure OpenAI deployment | – | verified |
| Image extraction (document cracking) | 1K images | $1.00 (0–1M); ~$0.80 / ~$0.65 above | 20/indexer/day | partial |
| Text extraction | – | free | – | verified |
| Custom Entity Lookup | 1K records | ~$1.00 | – | UNVERIFIED |
| Built-in AI skills (OCR, Image Analysis, Language, CU) | per tx | Foundry Tools rates | 20 docs/indexer/day | verified |
| Utility skills / custom WebApi skills | – | free (pay your compute) | – | verified |
| Integrated vectorization | tokens | embedding model rate | – | verified |

Agentic retrieval worked example (docs): 2,000 retrievals × 3 subqueries × 50 chunks × 500 tokens = 150M tokens → $3.30; query planning gpt-4o-mini (2,000 in + 350 out) → $1.02; total ≈ $4.32.

### 1c. Embedding rates (Foundry Global)
text-embedding-3-small $0.02/1M · text-embedding-3-large $0.13/1M · Cohere embed-v-4-0 $0.12/1M.

### 1d. Sizing formulas
```
raw_vector_bytes = N_chunks × Σ_fields(dims × bytes_per_dim)
  bytes_per_dim: float32 4 | half 2 | int16 2 | sbyte 1 | binary 1/8
vector_index_mem = raw_vector_bytes × (1 + HNSW_overhead) × (1 + deleted_docs_ratio)
  HNSW_overhead (m=4, float32): 96d 20% | 200d 8% | 768d 2% | 1536d 1% | 3072d 0.5%
  deleted_docs_ratio default ~10%
Quantization: int8 ÷4; binary ÷32 raw (docs: up to 28×)
  rescoring with preserveOriginals keeps float32 on disk only
Disk ≈ 3 × vector index (HNSW + original + stored copy); stored:false saves up to 50%
Partitions = max(ceil(disk_GB / storage_per_partition), ceil(vector_GB / vector_quota_per_partition))
Replicas = max(SLA (2 or 3), ceil(peak_QPS / QPS_per_replica))   # QPS/replica must be benchmarked
Monthly = R × P × $/SU/hr × 730 + semantic + agentic + enrichment
Semantic ranker input ≤2,048 tokens/doc, reranks top 50.
```
Example: 1M chunks × 1536-d float32 = 6.14 GB raw ≈ 6.8 GB index → S1 1 partition; Basic 2 partitions; Basic + int8 ≈ 1.7 GB → 1 partition.

## 2. Rerankers
| Reranker | Unit | Price |
|---|---|---|
| AI Search semantic ranker | 1K queries | $1.00 after 1K free |
| Cosmos DB semantic reranker (preview) | 1K calls | $1.00 |
| Cohere Rerank v3.5 (Foundry) | 1K searches | $2.00 |
| Cohere Rerank v3 En/Multi | 1K searches | $2.00 |
| Cohere Rerank 4.0 Fast | 1K searches | $2.00 |
| Cohere Rerank 4.0 Pro | 1K searches | $2.50 |

A Cohere "search" = 1 query + ≤100 docs (~500 tokens each) [UNVERIFIED for Foundry].

## 3. Foundry evaluations
| Item | Billing | Price |
|---|---|---|
| NLP evaluators (F1, BLEU, ROUGE, GLEU, METEOR) | no model calls | free (compute only) |
| AI-assisted quality evaluators (groundedness, relevance, coherence, fluency, similarity, retrieval, intent resolution, task adherence, tool-call accuracy, rubric) | judge-model tokens on your deployment | model rates |
| Risk & safety evaluators (hate, sexual, violence, self-harm, protected material, XPIA, code vuln, ungrounded attributes, Groundedness Pro) | "AI evaluations" meter | **$20 / 1M input, $60 / 1M output** [UNVERIFIED] |
| Continuous / cloud batch evaluation | judge tokens + safety meter | as above |
| Trace storage | App Insights / Log Analytics | $2.30/GB |

Limits: 2 MB/row, 100K rows/batch eval.

Judge prompt template sizes (chars ÷ 4 from `.prompty` files in azure-sdk-for-python):
| Evaluator | Template tokens | max output |
|---|---|---|
| Coherence | ~1,620 | 800 |
| Fluency | ~1,140 | 800 |
| Groundedness (with query) | ~1,590 | 800 |
| Groundedness (no query) | ~1,370 | 800 |
| Relevance | ~2,080 | 800 |
| Similarity | ~1,200 | 800 |
| Retrieval | ~4,170 | 1,600 |
| Response completeness | ~1,800 | 800 |
| Intent resolution | ~2,140 | 800 |
| Task adherence | ~1,860 | 3,000 |
| Task completion | ~2,900 | 1,500 |
| Tool call accuracy | ~2,690 | 5,000 |
| Tool selection | ~2,020 | 3,000 |
| Tool output utilization | ~2,050 | 1,500 |

`judge_input ≈ template + query + response + context`; typical output 100–400 tokens [estimate].
`eval_cost = Σ_evaluators rows × (in_tok × $in + out_tok × $out)`

## 4. AI Red Teaming Agent (PyRIT-based)
- Billed on the **AI evaluations meter** (attack generation + scoring safety-model tokens) + target model/agent tokens at normal rates. Multiturn/Crescendo/Tense use an adversarial LLM → extra tokens. No per-scan fee found [UNVERIFIED].
- Risk categories: hate, sexual, violence, self-harm, protected material, code vulnerability, ungrounded attributes; agent-only: prohibited actions, sensitive data leakage, task adherence, XPIA.
- 24 attack strategies: Easy (21: AnsiAttack, AsciiArt, AsciiSmuggler, Atbash, Base64, Binary, Caesar, CharacterSpace, CharSwap, Diacritic, Flip, Leetspeak, Morse, ROT13, SuffixAppend, StringJoin, UnicodeConfusable, UnicodeSubstitution, Url, Jailbreak, IndirectAttack); Moderate (Tense); Difficult (Multiturn, Crescendo). Groups EASY / MODERATE / DIFFICULT.
- `num_objectives` default 10 per risk category. Probes ≈ categories × objectives × (1 + strategies). Default 4 × 10 × 1 = 40; with EASY+MODERATE+DIFFICULT 4 × 10 × 6 = 240. Multiturn strategies multiply by turns.

## 5. Foundry Agent Service
| Component | Unit | Price | Status |
|---|---|---|---|
| Agents, runs, threads | – | no charge; pay model tokens (history re-sent) | verified |
| File Search vector storage | GB/day | $0.11 (first 1 GB free) | verify |
| File Search tool calls | 1K calls | ~$2.50 | UNVERIFIED |
| Code Interpreter | session (1 h) | $0.033 | snippet |
| Grounding with Bing / Web Search | 1K transactions | $14 | verified |
| AI Search tool / Foundry IQ | – | billed via Search | verified |
| Deep Research (o3-deep-research) | 1M tokens | $10 in / $2.50 cached / $40 out + Bing; retiring 2026-11-19 | snippet |
| Memory (preview) | – | chat + embedding tokens | verified |
| Hosted agents (GA 2026-07-09) | vCPU-hr / GiB-hr | $0.0994 / $0.0118 | UNVERIFIED |

## 6. Supporting infrastructure
| Service | Unit | Price |
|---|---|---|
| Blob Hot LRS | GB-month | ~$0.018 (possible cut to $0.0165 [UNVERIFIED]) |
| Cosmos DB serverless | 1M RU / GB-month | $0.25 / $0.25 |
| Functions Flex Consumption | GB-s / 1M exec | $0.000026 / $0.40 (free 100K GB-s, 1M exec) |
| Container Apps consumption | vCPU-s / GiB-s / 1M req | $0.000024 / $0.000003 / $0.40 |
| Log Analytics / App Insights | GB ingested | Analytics $2.30; Basic $0.50; Auxiliary $0.05; 5 GB free |
| API Management | – | Consumption $3.50/1M calls; Basic v2 ~$150/mo; Standard v2 ~$700/mo |
| Microsoft Graph mail APIs | – | free (throttled) |
| Graph Teams export APIs | per message | unmetered since 2025-08-25 |

## Items to verify
Image extraction tiers >1M; Custom Entity Lookup; agentic retrieval $/1M; Serverless rates; safety eval meter $20/$60; File Search pricing; hosted agent rates; Blob price cut; Basic tier max SU.
