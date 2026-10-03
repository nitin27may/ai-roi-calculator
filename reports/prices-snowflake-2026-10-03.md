# Snowflake credit refresh 2026-10-03

Source: https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf

Check each match against its context before relying on it.

| Entry | Credits | Context |
|---|---|---|
| sf:claude-sonnet-5-5 | 1.2 / 6 | claude - sonnet - 5 - 5 5 1.20 6.00 AI_COMPLETE – gemini - 2 - 5 - flash 5 0.18 1.50 AI_COMPLETE – gemini - 2 - 5 - flash - lite 5 0.06 0.24 AI_COMPLETE – gemin |
| sf:claude-opus-5-5 | 2.4 / 12 | claude - opus - 5 - 5 5 2.40 12.00 AI_COMPLETE – claude - sonnet - 4 - 5 1.80 9.00 AI_COMPLETE – claude - sonnet - 4 - 6 1.80 9.00 AI_COMPLETE – claude - sonnet |
| sf:claude-sonnet-4-5 | 1.8 / 9 | claude - sonnet - 4 - 5 1.80 9.00 AI_COMPLETE – claude - sonnet - 4 - 6 1.80 9.00 AI_COMPLETE – claude - sonnet - 5 1.20 6.00 AI_COMPLETE – claude - sonnet - 5  |
| sf:claude-haiku-4-5 | 0.6 / 3 | claude - haiku - 4 - 5 0.60 3.00 AI_COMPLETE – claude - opus - 4 - 5 3.00 15.00 AI_COMPLETE – claude - opus - 4 - 6 3.00 15.00 AI_COMPLETE – claude - opus - 4 - |
| sf:openai-gpt-5.4 | 1.5 / 9 | openai - gpt - 5.4 1.50 9.00 AI_COMPLETE – openai - gpt - 5.4 - long - context 3.00 13.50 AI_COMPLETE – openai - gpt - 5.4 - mini 5 0.45 2.70 AI_COMPLETE – op |
| sf:openai-gpt-5 | 0.75 / 6 | openai - gpt - 5 5 0.75 6.00 AI_COMPLETE – openai - gpt - 5 - mini 5 0.15 1.20 AI_COMPLETE – openai - gpt - 5 - nano 5 0.033 0.24 AI_COMPLETE – openai - gpt |
| sf:openai-gpt-5-mini | 0.15 / 1.2 | openai - gpt - 5 - mini 5 0.15 1.20 AI_COMPLETE – openai - gpt - 5 - nano 5 0.033 0.24 AI_COMPLETE – openai - gpt - 5.1 0.75 6.00 AI_COMPLETE – openai - gpt - 5 |
| sf:openai-gpt-4.1 | 1.2 / 4.8 | openai - gpt - 4.1 1.20 4.80 AI_COMPLETE – openai - gpt - 5 5 0.75 6.00 AI_COMPLETE – openai - gpt - 5 - mini 5 0.15 1.20 AI_COMPLETE – openai - gpt - 5 - nan |
| sf:llama3.3-70b | 0.432 / 0.432 | llama3.3 - 70b 0.432 0.432 AI_COMPLETE – llama4 - maverick 0.144 0.582 AI_COMPLETE – ministral - 3 - 8b 0.09 0.09 AI_COMPLETE – mistral - large2 1.20 3.60 |
| sf:llama3.1-8b | 0.132 / 0.132 | llama3.1 - 8b 0.132 0.132 AI_COMPLETE – llama3.3 - 70b 0.432 0.432 AI_COMPLETE – llama4 - maverick 0.144 0.582 AI_COMPLETE – ministral - 3 - 8b 0.09 0.09 |
| sf:mistral-large2 | 1.2 / 3.6 | mistral - large2 1.20 3.60 AI_COMPLETE – mistral - large3 5 0.30 0.90 AI_COMPLETE – mistral - 7b 0.09 0.12 AI_COMPLETE – mixtral - 8x7b 0.27 0.42 AI_COMPLET |
| sf:snowflake-arctic-embed-m-v1.5 | 0.03 | snowflake - arctic - embed - m - v1.5 0.03 AI_EXTRACT – arctic - extract 5.55 AI_FILTER 1.62 AI_GUARDRAILS 0.35 AI_MULTI_EMBED – twelvelabs - marengo - embed -  |
| sf:snowflake-arctic-embed-l-v2.0 | 0.05 | snowflake - arctic - embed - l - v2.0 0.05 AI_EMBED – voyage - multilingual - 2 0.07 AI_EMBED – e5 - base - v2 0.03 AI_EMBED – snowflake - arctic - embed - m 0. |
| sf:voyage-multilingual-2 | 0.07 | voyage - multilingual - 2 0.07 AI_EMBED – e5 - base - v2 0.03 AI_EMBED – snowflake - arctic - embed - m 0.03 AI_EMBED – snowflake - arctic - embed - m - v1.5 0. |
| sf-parse-layout | 3.66 | AI_PARSE_DOCUMENT – Layout 3.66 AI Credits per 1,000 pages AI_PARSE_DOCUMENT – OCR 0.68 AI Credits per 1,000 pages AI Sensitive Data Classification – openai - g |
| sf-parse-ocr | 0.68 | AI_PARSE_DOCUMENT – OCR 0.68 AI Credits per 1,000 pages AI Sensitive Data Classification – openai - gpt - 5 - mini 5 0.15 AI Credits per one million input token |
| sf-ai-extract | 5.55 | AI_EXTRACT – arctic - extract 5.55 AI_FILTER 1.62 AI_GUARDRAILS 0.35 AI_MULTI_EMBED – twelvelabs - marengo - embed - 3 - 0 See “Snowflake AI Features Table, Oth |
| sf-ai-classify | 1.62 | AI_CLASSIFY 1.62 AI_EMBED – voyage - multimodal - 3 0.06 AI_EMBED – multilingual - e5 - large 0.05 AI_EMBED – nv - embed - qa - 4 0.05 AI_EMBED – snowf |
| sf-ai-translate | 1.63 | AI_TRANSLATE 1.63 Extract Answer 0.11 Guard 0.25 Sentiment 0.09 Summarize 0.13 Legacy Cortex Features AI_COMPLETE – llama3 - 70b 1.21 AI_COMPLETE – llam |
| sf-cortex-guard | 0.25 | Guard 0.25 Sentiment 0.09 Summarize 0.13 Legacy Cortex Features AI_COMPLETE – llama3 - 70b 1.21 AI_COMPLETE – llama3 - 8b 0.19 AI_EXTRACT – arcti |
| sf-search-serving | 6.3 | Cortex Search 6.3 AI Credits per GB/mo of indexed data A Provisioned Throughput reservation allows you to reserve continuous access to certain Snowflake |

## Not found

None.
