# Azure price refresh 2026-10-04

Source: Azure Retail Prices API, currency CAD, region canadacentral (Foundry models: Global meters).

- 67 values changed, **5 moved more than 30%** (check before using)
- 0 mapping errors
- 224 Foundry meters not in the catalogue

## Exchange rate

1 USD = 1.41655 CAD (was 1.41655). Azure Retail Prices API: CAD/USD ratio of 5083 matched meters (productName eq 'Azure OpenAI GPT5').
USD-only list prices in `usd-list.json` were converted at this rate: 0 values changed.

## Changes

| Entry | Field | Was | Now | Change |
|---|---|---|---|---|
| gpt-4.1 | prices.global.input | 2.8 | 2.8331 | +1.2% |
| gpt-4.1 | prices.global.cachedInput | 0.7 | 0.7083 | +1.2% |
| gpt-4.1 | prices.global.output | 11.3 | 11.3324 | +0.3% |
| gpt-4.1 | prices.dataZone.input | 3.1 | 3.1164 | +0.5% |
| gpt-4.1 | prices.dataZone.cachedInput | 0.8 | 0.7791 | -2.6% |
| gpt-4.1 | prices.dataZone.output | 12.5 | 12.4656 | -0.3% |
| gpt-4.1-mini | prices.global.input | 0.6 | 0.5666 | -5.6% |
| gpt-4.1-mini | prices.global.cachedInput | 0.1 | 0.1417 | **+41.7%** |
| gpt-4.1-mini | prices.global.output | 2.3 | 2.2665 | -1.5% |
| gpt-4.1-mini | prices.dataZone.input | 0.6 | 0.6233 | +3.9% |
| gpt-4.1-mini | prices.dataZone.cachedInput | 0.2 | 0.1558 | -22.1% |
| gpt-4.1-mini | prices.dataZone.output | 2.5 | 2.4931 | -0.3% |
| gpt-4.1-mini | prices.regional.input | – | 0.6856 | new |
| gpt-4.1-mini | prices.regional.cachedInput | – | 0.1714 | new |
| gpt-4.1-mini | prices.regional.output | – | 2.7424 | new |
| gpt-4.1-nano | prices.global.input | 0.1 | 0.1417 | **+41.7%** |
| gpt-4.1-nano | prices.global.cachedInput | 0.1 | 0.0354 | **-64.6%** |
| gpt-4.1-nano | prices.global.output | 0.6 | 0.5666 | -5.6% |
| gpt-4.1-nano | prices.dataZone.input | 0.2 | 0.1558 | -22.1% |
| gpt-4.1-nano | prices.dataZone.cachedInput | 0.2 | 0.0397 | **-80.2%** |
| gpt-4.1-nano | prices.dataZone.output | 0.6 | 0.6233 | +3.9% |
| gpt-4o | prices.global.input | 3.5 | 3.5414 | +1.2% |
| gpt-4o | prices.global.cachedInput | 1.8 | 1.7707 | -1.6% |
| gpt-4o | prices.global.output | 14.2 | 14.1655 | -0.2% |
| gpt-4o | prices.dataZone.input | 3.9 | 3.8955 | -0.1% |
| gpt-4o | prices.dataZone.cachedInput | 1.9 | 1.9478 | +2.5% |
| gpt-4o | prices.dataZone.output | 15.6 | 15.5821 | -0.1% |
| gpt-4o | prices.regional.input | – | 4.2851 | new |
| gpt-4o | prices.regional.cachedInput | – | 2.1432 | new |
| gpt-4o | prices.regional.output | – | 17.1403 | new |
| gpt-4o-mini | prices.global.input | 0.2 | 0.2125 | +6.2% |
| gpt-4o-mini | prices.global.cachedInput | 0.1 | 0.1062 | +6.2% |
| gpt-4o-mini | prices.global.output | 0.8 | 0.8499 | +6.2% |
| gpt-4o-mini | prices.dataZone.input | 0.2 | 0.2337 | +16.8% |
| gpt-4o-mini | prices.dataZone.cachedInput | 0.1 | 0.1176 | +17.6% |
| gpt-4o-mini | prices.dataZone.output | 0.9 | 0.9349 | +3.9% |
| o3 | prices.global.input | 2.8 | 2.8331 | +1.2% |
| o3 | prices.global.cachedInput | 0.7 | 0.7083 | +1.2% |
| o3 | prices.global.output | 11.3 | 11.3324 | +0.3% |
| o3 | prices.dataZone.input | 3.1 | 3.1164 | +0.5% |
| o3 | prices.dataZone.cachedInput | 0.8 | 0.7791 | -2.6% |
| o3 | prices.dataZone.output | 12.5 | 12.4656 | -0.3% |
| o4-mini | prices.global.input | 1.6 | 1.5582 | -2.6% |
| o4-mini | prices.global.cachedInput | 0.4 | 0.3896 | -2.6% |
| o4-mini | prices.global.output | 6.2 | 6.2328 | +0.5% |
| o4-mini | prices.dataZone.input | 1.7 | 1.714 | +0.8% |
| o4-mini | prices.dataZone.cachedInput | 0.4 | 0.4292 | +7.3% |
| o4-mini | prices.dataZone.output | 6.9 | 6.8561 | -0.6% |
| mai-ds-r1 | prices.global.input | 1.9 | 1.9123 | +0.6% |
| mai-ds-r1 | prices.global.cachedInput | 1.9 | 1.9123 | +0.6% |
| mai-ds-r1 | prices.global.output | 7.6 | 7.6494 | +0.7% |
| mai-ds-r1 | prices.dataZone.input | 2.1 | 2.1036 | +0.2% |
| mai-ds-r1 | prices.dataZone.cachedInput | 2.1 | 2.1036 | +0.2% |
| mai-ds-r1 | prices.dataZone.output | 8.4 | 8.4143 | +0.2% |
| text-embedding-3-large | per1M | 0.2 | 0.1842 | -7.9% |
| text-embedding-3-large | deployments.regional | – | 0.2238 | new |
| text-embedding-3-large | deployments.dataZone | – | 0.2026 | new |
| text-embedding-3-small | per1M | 0.0277 | 0.0283 | +2.2% |
| text-embedding-3-small | deployments.regional | – | 0.0354 | new |
| text-embedding-3-small | deployments.dataZone | – | 0.0312 | new |
| text-embedding-ada-002 | per1M | 0.1 | 0.1417 | **+41.7%** |
| text-embedding-ada-002 | deployments.regional | – | 0.1714 | new |
| text-embedding-ada-002 | deployments.dataZone | – | 0.1558 | new |
| gpt-4o-transcribe | tokens.audioInputPer1M | 8.5 | 8.4993 | -0.0% |
| gpt-4o-transcribe | tokens.textOutputPer1M | 14.2 | 14.1655 | -0.2% |
| gpt-4o-transcribe-diarize | tokens.audioInputPer1M | 8.5 | 8.4993 | -0.0% |
| gpt-4o-transcribe-diarize | tokens.textOutputPer1M | 14.2 | 14.1655 | -0.2% |

## Mapping errors

None.

## Meters with no catalogue entry

New models usually appear here first. Add an entry to `packages/catalog/data/chat-models.json` and a pattern to `scripts/prices/azure-map.ts`.

- Azure Deepseek Models · R1 Inp glbl Tokens
- Azure Deepseek Models · R1 Outp glbl Tokens
- Azure Deepseek Models · V3 Inp glbl Tokens
- Azure Deepseek Models · V3 Outp glbl Tokens
- Azure Deepseek Models · V3-0324 Inp glbl Tokens
- Azure Deepseek Models · V3-0324 Outp glbl Tokens
- Azure Deepseek Models · V3.1 Inp glbl Tokens
- Azure Deepseek Models · V3.1 Outp glbl Tokens
- Azure Deepseek Models · V3.2 Inp glbl Tokens
- Azure Deepseek Models · V3.2 Outp glbl Tokens
- Azure Deepseek Models · V3.2 SP Inp glbl Tokens
- Azure Deepseek Models · V3.2 SP Outp glbl Tokens
- Azure Deepseek Models · V4 Flash 0731 Inp glbl Tokens
- Azure Deepseek Models · V4 Flash 0731 Outp glbl Tokens
- Azure Deepseek Models · V4 Flash 0731 cached glbl Tokens
- Azure Deepseek Models · V4 Flash Inp glbl Tokens
- Azure Deepseek Models · V4 Flash Outp glbl Tokens
- Azure Deepseek Models · V4 Flash cached glbl Tokens
- Azure Deepseek Models · V4 Pro Inp glbl Tokens
- Azure Deepseek Models · V4 Pro Outp glbl Tokens
- Azure Deepseek Models · V4 Pro cached glbl Tokens
- Azure OpenAI GPT5 · 5.2 chat 0210 cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · 5.2 chat 0210 inp Gl 1M Tokens
- Azure OpenAI GPT5 · 5.2 chat 0210 opt Gl 1M Tokens
- Azure OpenAI GPT5 · 5.3 chat cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · 5.3 chat inp Gl 1M Tokens
- Azure OpenAI GPT5 · 5.3 chat opt Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5 Chat Inpt Glbl 1M Tokens
- Azure OpenAI GPT5 · GPT 5 Chat cchd Inpt Glbl 1M Tokens
- Azure OpenAI GPT5 · GPT 5 Chat outpt Glbl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.1 chat cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.1 chat inp Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.1 chat opt Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.2 chat cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.2 chat inp Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.2 chat opt Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.2 pro inp Gl 1M Tokens
- Azure OpenAI GPT5 · GPT 5.2 pro opt Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 05052026 cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 05052026 inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 05052026 opt Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 05282026 cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 05282026 inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 05282026 opt Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 07012026 cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 07012026 inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 07012026 opt Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 08062026 cd inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 08062026 inp Gl 1M Tokens
- Azure OpenAI GPT5 · chat-latest 08062026 opt Gl 1M Tokens
- Azure OpenAI GPT5 · gpt 5 pro inp glbl Tokens
- Azure OpenAI GPT5 · gpt 5 pro out glbl Tokens
- Azure OpenAI GPT5 · gpt-5-codex-ccchd-inp-glbl Tokens
- Azure OpenAI GPT5 · gpt-5-codex-inp-glbl Tokens
- Azure OpenAI GPT5 · gpt-5-codex-out-glbl Tokens
- Azure OpenAI Reasoning · codex mini inp cchd glbl Tokens
- Azure OpenAI Reasoning · codex mini inp glbl Tokens
- Azure OpenAI Reasoning · codex mini out glbl Tokens
- Azure OpenAI Reasoning · o3-deep research 0626-inp-cchd-glbl 1M Tokens
- Azure OpenAI Reasoning · o3-deep research 0626-inp-glbl 1M Tokens
- Azure OpenAI Reasoning · o3-deep research 0626-out-glbl 1M Tokens
- Azure OpenAI · Assistants-File Search-glbl GB
- Azure OpenAI · Image-DALL-E-2-glbl Images
- Azure OpenAI · Image-Dall-E-3 HD HighRes-glbl Images
- Azure OpenAI · Image-Dall-E-3 HD LowRes-glbl Images
- Azure OpenAI · Image-Dall-E-3 Std HighRes-glbl Images
- Azure OpenAI · Image-Dall-E-3 Std LowRes-glbl Images
- Azure OpenAI · babbage-002-FT-Hstng-glbl Unit
- Azure OpenAI · babbage-002-FT-Inp-glbl Tokens
- Azure OpenAI · babbage-002-FT-Outp-glbl Tokens
- Azure OpenAI · babbage-002-FT-Trng-glbl Unit
- Azure OpenAI · babbage-002-FT-Trng-glbl tkn Tokens
- Azure OpenAI · babbage-002-base-glbl Tokens
- Azure OpenAI · computer-use-inpt-glbl Tokens
- Azure OpenAI · computer-use-outp-glbl Tokens
- Azure OpenAI · davinci-002-FT-Hstng-glbl Unit
- Azure OpenAI · davinci-002-FT-Inp-glbl Tokens
- Azure OpenAI · davinci-002-FT-Outp-glbl Tokens
- Azure OpenAI · davinci-002-FT-Trng-glbl Unit
- Azure OpenAI · davinci-002-FT-Trng-glbl tkn Tokens
- Azure OpenAI · davinci-002-base-glbl Tokens
- Azure OpenAI · file-search-tool-calls-glbl Calls
- Azure OpenAI · gpt 4.1 dev ft training glbl Tokens
- Azure OpenAI · gpt 4.1 mini dev ft training glbl Tokens
- Azure OpenAI · gpt 4.1 nano dev ft training glbl Tokens
- Azure OpenAI · gpt 4.5 0227 Inp glbl Tokens
- Azure OpenAI · gpt 4.5 0227 Outp glbl Tokens
- Azure OpenAI · gpt 4.5 0227 cached Inp glbl Tokens
- Azure OpenAI · gpt 4o 0806 cached Inp glbl Tokens
- Azure OpenAI · gpt 4o dev ft cchd inpt glbl Tokens
- Azure OpenAI · gpt 4o dev ft inpt glbl Tokens
- Azure OpenAI · gpt 4o dev ft opt glbl Tokens
- Azure OpenAI · gpt 4o dev ft training glbl Tokens
- Azure OpenAI · gpt 4o mini dev ft cchd inpt glbl Tokens
- Azure OpenAI · gpt 4o mini dev ft inpt glbl Tokens
- Azure OpenAI · gpt 4o mini dev ft opt glbl Tokens
- Azure OpenAI · gpt 4o mini dev ft training glbl Tokens
- Azure OpenAI · gpt-35-turbo-Instruct-Inp-glbl Tokens
- Azure OpenAI · gpt-35-turbo-Instruct-Outp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-0125 Inp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-0125 Outp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-1106 Inp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-1106 Outp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-FT-Hstng-glbl Unit
- Azure OpenAI · gpt-35-turbo16K-FT-Inp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-FT-Outp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-Inp-glbl Tokens
- Azure OpenAI · gpt-35-turbo16K-Outp-glbl Tokens
- Azure OpenAI · gpt-35-turbo4K-FT-Hstng-glbl Unit
- Azure OpenAI · gpt-35-turbo4K-Inp-glbl Tokens
- Azure OpenAI · gpt-35-turbo4K-Outp-glbl Tokens
- Azure OpenAI · gpt-4-32K-Inp-glbl Tokens
- Azure OpenAI · gpt-4-32K-Outp-glbl Tokens
- Azure OpenAI · gpt-4-8K-FT-Hstng-glbl Unit
- Azure OpenAI · gpt-4-8K-Inp-glbl Tokens
- Azure OpenAI · gpt-4-8K-Outp-glbl Tokens
- Azure OpenAI · gpt-4-turbo-Vision-128K Inp-glbl Tokens
- Azure OpenAI · gpt-4-turbo-Vision-128K Outp-glbl Tokens
- Azure OpenAI · gpt-4-turbo128K Inp-glbl Tokens
- Azure OpenAI · gpt-4-turbo128K Outp-glbl Tokens
- Azure OpenAI · gpt-4.1-dev-ft cchd inpt glbl Tokens
- Azure OpenAI · gpt-4.1-dev-ft inpt glbl Tokens
- Azure OpenAI · gpt-4.1-dev-ft opt glbl Tokens
- Azure OpenAI · gpt-4.1-mini-dev-ft cchd inpt glbl Tokens
- Azure OpenAI · gpt-4.1-mini-dev-ft inpt glbl Tokens
- Azure OpenAI · gpt-4.1-mini-dev-ft opt glbl Tokens
- Azure OpenAI · gpt-4.1-nano-dev-ft cchd inpt glbl Tokens
- Azure OpenAI · gpt-4.1-nano-dev-ft inpt glbl Tokens
- Azure OpenAI · gpt-4.1-nano-dev-ft opt glbl Tokens
- Azure OpenAI · gpt-4o-0806-FT-Hstng-glbl Unit
- Azure OpenAI · gpt-4o-0806-FT-Trng-glbl tkn Tokens
- Azure OpenAI · gpt-4o-0806-FT-inp-glbl Tokens
- Azure OpenAI · gpt-4o-0806-FT-outp-glbl Tokens
- Azure OpenAI · gpt-4o-0806-Inp-glbl Tokens
- Azure OpenAI · gpt-4o-0806-Outp-glbl Tokens
- Azure OpenAI · gpt-4o-0806-cached-FT-inp-glbl Tokens
- Azure OpenAI · gpt-4o-aud-0603 Inp glbl Tokens
- Azure OpenAI · gpt-4o-aud-0603 Outp glbl Tokens
- Azure OpenAI · gpt-4o-aud-0603-txt Inp glbl Tokens
- Azure OpenAI · gpt-4o-aud-0603-txt Outp glbl Tokens
- Azure OpenAI · gpt-4o-aud-1217 Inp glbl Tokens
- Azure OpenAI · gpt-4o-aud-1217 Outp glbl Tokens
- Azure OpenAI · gpt-4o-aud-1217-txt Inp glbl Tokens
- Azure OpenAI · gpt-4o-aud-1217-txt Outp glbl Tokens
- Azure OpenAI · gpt-4o-mini-0718-FT-Hstng-glbl Unit
- Azure OpenAI · gpt-4o-mini-0718-FT-Outp-glbl Tokens
- Azure OpenAI · gpt-4o-mini-0718-FT-Trng-glbl Tokens
- Azure OpenAI · gpt-4o-mini-0718-FT-inp-glbl Tokens
- Azure OpenAI · gpt-4o-mini-0718-cached-FT-inp-glbl Tokens
- Azure OpenAI · gpt-4o-mini-transcribe-aud-inp-glbl Tokens
- Azure OpenAI · gpt-4o-mini-transcribe-txt-inp-glbl Tokens
- Azure OpenAI · gpt-4o-mini-transcribe-txt-out-glbl Tokens
- Azure OpenAI · gpt-4o-mini-tts-aud-out-glbl Tokens
- Azure OpenAI · gpt-4o-mini-tts-txt-inp-glbl Tokens
- Azure OpenAI · gpt-4o-rt-aud-0603 Inp glbl Tokens
- Azure OpenAI · gpt-4o-rt-aud-0603 Outp glbl Tokens
- Azure OpenAI · gpt-4o-rt-aud-0603 cchd Inp glbl Tokens
- Azure OpenAI · gpt-4o-rt-aud-1217 Inp glbl Tokens
- Azure OpenAI · gpt-4o-rt-aud-1217 Outp glbl Tokens
- Azure OpenAI · gpt-4o-rt-aud-1217 cchd Inp glbl Tokens
- Azure OpenAI · gpt-4o-rt-txt-0603 Inp glbl Tokens
- Azure OpenAI · gpt-4o-rt-txt-0603 Outp glbl Tokens
- Azure OpenAI · gpt-4o-rt-txt-0603 cchd Inp glbl Tokens
- Azure OpenAI · gpt-4o-rt-txt-1217 Inp glbl Tokens
- Azure OpenAI · gpt-4o-rt-txt-1217 Outp glbl Tokens
- Azure OpenAI · gpt-4o-rt-txt-1217 cchd Inp glbl Tokens
- Azure OpenAI · gpt-4o-transcribe-txt-inp-glbl Tokens
- Azure OpenAI · gpt-image-1-inp-cached-img-glbl Tokens
- Azure OpenAI · gpt-image-1-inp-cached-txt-glbl Tokens
- Azure OpenAI · gpt-image-1-inp-img-glbl Tokens
- Azure OpenAI · gpt-image-1-inp-txt-glbl Tokens
- Azure OpenAI · gpt-image-1-output-img-glbl Tokens
- Azure OpenAI · gpt4o realtime cached audio inp glbl Tokens
- Azure OpenAI · gpt4o realtime cached text inp glbl Tokens
- Azure OpenAI · gpt4o realtime prvw text inp glbl Tokens
- Azure OpenAI · gpt4o realtime prvw text outp glbl Tokens
- Azure OpenAI · gpt4o realtimePrvw audio inp glbl Tokens
- Azure OpenAI · gpt4o realtimePrvw audio outp glbl Tokens
- Azure OpenAI · gpt4omini-aud1217 Inp glbl Tokens
- Azure OpenAI · gpt4omini-aud1217 Outp glbl Tokens
- Azure OpenAI · gpt4omini-aud1217-txt Inp glbl Tokens
- Azure OpenAI · gpt4omini-aud1217-txt Outp glbl Tokens
- Azure OpenAI · gpt4omini-rt-aud1217 Inp glbl Tokens
- Azure OpenAI · gpt4omini-rt-aud1217 Outp glbl Tokens
- Azure OpenAI · gpt4omini-rt-aud1217 cchd Inp glbl Tokens
- Azure OpenAI · gpt4omini-rt-txt1217 Inp glbl Tokens
- Azure OpenAI · gpt4omini-rt-txt1217 Outp glbl Tokens
- Azure OpenAI · gpt4omini-rt-txt1217 cchd Inp glbl Tokens
- Azure OpenAI · o1 1217 Inp glbl Tokens
- Azure OpenAI · o1 1217 Outp glbl Tokens
- Azure OpenAI · o1 1217 cached Inp glbl Tokens
- Azure OpenAI · o1 mini cached input glbl Tokens
- Azure OpenAI · o1 mini input glbl Tokens
- Azure OpenAI · o1 mini output glbl Tokens
- Azure OpenAI · o1 preview cached input glbl Tokens
- Azure OpenAI · o1 preview input glbl Tokens
- Azure OpenAI · o1 preview output glbl Tokens
- Azure OpenAI · o1-pro Inp glbl Tokens
- Azure OpenAI · o1-pro Outp glbl Tokens
- Azure OpenAI · o1-pro cached Inp glbl Tokens
- Azure OpenAI · o3 mini 0131 cached input glbl Tokens
- Azure OpenAI · o3 mini 0131 input glbl Tokens
- Azure OpenAI · o3 mini 0131 output glbl Tokens
- Azure OpenAI · o3-pro Inp glbl Tokens
- Azure OpenAI · o3-pro Outp glbl Tokens
- MAI Models · Image 2 Output glbl Tokens
- MAI Models · Image 2 Text Input glbl Tokens
- MAI Models · Image 2.5 Flash Image Input glbl Tokens
- MAI Models · Image 2.5 Flash Image Output glbl Tokens
- MAI Models · Image 2.5 Flash Text Input glbl Tokens
- MAI Models · Image 2.5 Image Input glbl Tokens
- MAI Models · Image 2.5 Image Output glbl Tokens
- MAI Models · Image 2.5 Pro Image Input glbl 1M Tokens
- MAI Models · Image 2.5 Pro Image Output glbl 1M Tokens
- MAI Models · Image 2.5 Pro Text Input glbl 1M Tokens
- MAI Models · Image 2.5 Text Input glbl Tokens
- MAI Models · Image 2.6 Flash Image Input Glbl 1M Tokens
- MAI Models · Image 2.6 Flash Image Output Glbl 1M Tokens
- MAI Models · Image 2.6 Image Input Glbl 1M Tokens
- MAI Models · Image 2.6 Image Output Glbl 1M Tokens
- MAI Models · Image 2.6 Text Input Glbl 1M Tokens
- MAI Models · Image 2e Output glbl Tokens
- MAI Models · Image 2e Text Input glbl Tokens
- MAI Models · Img 2.6 Flash Text In Glbl 1M Tokens
