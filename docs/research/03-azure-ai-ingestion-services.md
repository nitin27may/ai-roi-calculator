# Azure AI ingestion services pricing (checked 2026-10-02)

## Source caveat
- **prices.azure.com was blocked by this research container's egress proxy** (403). No Retail API JSON / `meterName` values were captured. WebFetch to azure.microsoft.com / learn.microsoft.com was also blocked.
- Sources used: WebSearch summaries + a clone of `MicrosoftDocs/azure-ai-docs` (commit 3e69dc49, 2026-10-02) — authoritative for units, billing rules and model names.
- Confidence: **H** official docs or multiple sources agree · **M** one or two secondary sources · **L / UNVERIFIED** memory or conflicting.
- Naming: products are now "... in Foundry Tools". Retail API serviceName probably `Foundry Tools` with older meters under `Cognitive Services` (unconfirmed).
- USD, pay-as-you-go S0, East US list price unless noted.

## 1. Azure Speech
| Feature | Unit | Price | Free (F0) | Conf. |
|---|---|---|---|---|
| STT real-time, standard | audio hr | $1.00 | 5 h/mo | H |
| STT batch, standard | audio hr | $0.18 | shared | H |
| STT fast transcription | audio hr | $0.66 (some say $0.36) | – | CONFLICT |
| Real-time add-ons (diarization, continuous LID, pronunciation) | audio hr / feature | +$0.30 | – | M |
| Diarization on batch | – | included | – | M |
| Custom speech real-time | audio hr | $1.20 | 5 h + 1 hosted model | H |
| Custom speech batch | audio hr | $0.225 (one source $0.45) | – | M |
| Custom speech training | compute hr | $10 | – | M |
| Custom speech endpoint hosting | model-hr | $0.0538 (~$39/mo) | – | M |
| STT commitment tiers | month | 2,000 h = $1,600 (overage $0.80); 10,000 h = $6,500 ($0.65); 50,000 h = $25,000 ($0.50) | – | M |
| Conversation transcription multichannel | – | retired 2025-03-28 | – | M |
| Speech translation | audio hr (≤2 targets) | $2.50; extra targets at Translator $10/1M chars | 5 h | H |
| LLM Speech (enhanced mode, preview) | audio hr | UNVERIFIED | – | – |
| Neural TTS | 1M chars | $15 | 0.5M chars | H |
| Neural HD TTS | 1M chars | $22 (cut from $30, Mar 2026) | – | M |
| Custom neural voice std / HD | 1M chars | $24 / $48 | – | M |
| Custom neural voice training | compute hr | $52 (cap $936) | – | M |
| Custom neural voice hosting | model-hr | $4.04 | – | M |

TTS billing: every character incl. spaces, punctuation and SSML; CJK chars count as 2.

## 2. Microsoft MAI models (verified to exist in docs)
| Model | Status | Unit | Price | Conf. |
|---|---|---|---|---|
| MAI-Transcribe-1 | deprecated 2026-08-20 | audio hr | $0.36 | H |
| MAI-Transcribe-1.5 | supported | audio hr | $0.36 | M |
| **MAI-Transcribe-2** | preview, 60 langs, diarization, word timestamps | audio hr | **$0.10 intro until 2026-12-31** | M |
| MAI-Transcribe-2-Streaming | preview (2026-10-01) | audio hr | $0.54 intro until 2026-12-31 | M |
| MAI-Voice-1 | preview | 1M chars | $22 | M |
| MAI-Voice-2 / 2.1 | preview | 1M chars | $22 | M |
| MAI-Voice-2(.1)-Flash | preview | 1M chars | $15 | M |
| MAI-Image-2 | – | 1M tokens | $5 text in / $33 image out (~$0.034 per 1024² image) | M |
| MAI-Image-2e | – | 1M tokens | $5 / $19.50 | M |
| MAI-Image-2.5 | – | 1M tokens | $5 text in / $8 image in / $47 out | M |
| MAI-Image-2.5-Pro | – | 1M tokens | $5 / $8 / $108 | M |
| MAI-Image-2.6 | – | 1M tokens | $5 / $8 / $38 | M |
| MAI-Image-2.6-Flash | – | 1M tokens | $1.75 / $2.50 / $19 | M |

MAI-Transcribe is called via Speech LLM Speech API (`transcriptions:transcribe?api-version=2025-10-15`, `enhancedMode.model="MAI-Transcribe-2"`). Pricing page: azure.microsoft.com/pricing/details/ai-foundry-models/microsoft/.

## 3. Azure OpenAI audio (comparison)
| Model | Effective rate | Conf. |
|---|---|---|
| whisper | $0.36 / audio hr | M |
| gpt-4o-transcribe | ~$0.006/min ($0.36/h) | M |
| gpt-4o-mini-transcribe | ~$0.003/min ($0.18/h) | M |
| gpt-4o-transcribe-diarize | ~$0.36/h | M |

## 4. Document Intelligence (S0)
| Model / feature | Unit | Price | Notes | Conf. |
|---|---|---|---|---|
| Read | 1,000 pages | $1.50 | $0.60 above 1M pages/mo | M-H |
| Layout | 1,000 pages | $10 | – | M-H |
| Prebuilt (invoice, receipt, ID…) | 1,000 pages | $10 | – | M-H |
| Custom extraction | 1,000 pages | $30 | $20 above 1M | M |
| Custom classification | 1,000 pages | $3 | – | M |
| Add-ons (high-res, formulas, font styles) | 1,000 pages | +$6 | barcode, language, KVP, searchable PDF free | M |
| Query fields | 1,000 pages | +$10 | – | M |
| Custom neural training | hour | first 10 h free then $3/h | – | M |
| Free tier | – | 500 pages/mo | – | M |

**Page definition:** PDF page = 1; image = 1; TIFF frame = 1; **DOCX/HTML: 3,000 chars = 1 page**; XLSX worksheet = 1; PPTX slide = 1. Embedded images in Office files not processed. **Does not accept .eml/.msg.**

## 5. Content Understanding (GA 2025-11-01)
| Component | Unit | Price | Conf. |
|---|---|---|---|
| Document extraction Standard (layout on image-based docs) | 1,000 pages | $5 | H |
| Document extraction Basic (OCR) | 1,000 pages | $1 | M |
| Document extraction Minimal (digital: DOCX, XLSX, PPTX, HTML, TXT, **MSG, EML**) | 1,000 pages | UNVERIFIED (~$0.01?) | L |
| Audio extraction | audio hr | $0.36 | H |
| Video extraction | video hr | $1.00 | H |
| Images | – | no extraction charge | H |
| Standard contextualization | 1M tokens | $1 | H |
| Advanced contextualization | 1M tokens | $3 | H |
| LLM + embedding tokens | – | billed on your own Foundry deployment | H |

Contextualization token counts: 1,000/page; 1,000/image; 100,000/audio hr; 1,000,000/video hr. Training embeddings ~1,500 tokens/page.
Meter is chosen by processing actually performed. **TXT, HTML, MD, XML, MSG, EML: 3,000 chars = 1 page (rounded up)**; XLSX one sheet/page; PPTX one slide/page; DOCX native pagination. Failed requests not charged. Attachment handling undocumented — assume billed separately (UNVERIFIED).

Docs worked examples (GPT-5.2 Global): 10-page RAG doc ≈ $0.132; 10-page invoice ≈ $0.084; 1 h call audio ≈ $0.47; 1 h video ≈ $3.33.

## 6. Vision, Language, Translator
| Service | Unit | Price | Free | Conf. |
|---|---|---|---|---|
| Vision Read OCR / Group 2 | 1,000 tx | $1.50 (0–1M), then ~$1.00 / $0.65 | 5,000/mo | M (one source $2.50) |
| Vision Group 1 | 1,000 tx | $1.00 / $0.80 / $0.65 | same | M |
| Language PII | 1,000 records | ~$1.00 tiered down | 5,000/mo | L |
| Language summarization | 1,000 records | ~$2.00 | 5,000/mo | L-M |
| Translator text | 1M chars | $10 | 2M (F0) | H |
| Document translation | 1M chars | $15 std; $40 custom | – | M |
| Translator LLM mode | tokens | Azure OpenAI rates | – | H |

Language text record = 1,000 chars; each feature billed separately. Translator bills source chars × number of target languages.

## 7. Content Safety
| Feature | Unit | Price | Free | Conf. |
|---|---|---|---|---|
| Text moderation | 1,000 records (≤1,000 code points) | $0.375 | 5,000/mo | M |
| Image moderation | 1,000 images | $0.75 | 5,000/mo | M |
| Prompt Shields | 1,000 records | ~$0.375 | – | L |
| Groundedness detection | 1,000 records | UNVERIFIED | – | – |
| Protected material | 1,000 records | UNVERIFIED | – | – |

## 8. Video Indexer — UNVERIFIED
Per input minute with audio/video presets; no reliable current price. Model video via Content Understanding instead.

## Quick scenario numbers
- **1 h meeting audio:** MAI-Transcribe-2 $0.10 (intro) · Batch STT $0.18 · gpt-4o-mini-transcribe ~$0.18 · Whisper $0.36 · gpt-4o-transcribe-diarize ~$0.36 · CU audio $0.36 + $0.10 + LLM · Real-time + diarization $1.30.
- **100 PDF pages:** DI Read $0.15 · DI Layout/Prebuilt $1.00 · DI Custom $3.00 · CU Standard $0.50 + $0.10 + LLM.
- **Emails:** CU, body = ceil(chars/3000) pages at Minimal; attachments by type; DI cannot ingest .eml/.msg.

## Open items (resolve via Retail API from an unrestricted host)
Fast transcription price; custom speech batch; LLM Speech; CU Minimal; Language tiers; Content Safety Prompt Shields/Groundedness/Protected material; Video Indexer; Vision Read; post-2026 MAI-Transcribe-2 price; all meterNames.
