"""One-off seed of packages/catalog/data from the workgraph.ai canadacentral.CAD price set
(Azure Retail Prices API, CAD, 2026-09-17) plus the research notes in docs/research.
After this, `pnpm prices` owns the Azure and Snowflake fields; edit manual entries by hand.
Superseded for USD-only prices: those now live in packages/catalog/data/usd-list.json and
`pnpm prices:azure` converts them at Azure's current CAD/USD rate. Do not rerun this script
over the catalogue; it predates the Foundry model additions of 2026-10-02."""
import json, os, pathlib

FX = 1.386  # CAD per USD, ratio of Azure CAD/USD meters on 2026-09-17 (only for USD-only list prices)
OUT = pathlib.Path(__file__).resolve().parents[2] / "packages/catalog/data"
SHOW = pathlib.Path("/home/user/workgraph.ai/showcase/cost-calculator/catalogue/prices/canadacentral.CAD")
API = lambda meter=None, note=None: {k: v for k, v in {"kind": "azure-retail-api", "url": "https://prices.azure.com/api/retail/prices", "meterName": meter, "note": note, "retrievedAt": "2026-09-17"}.items() if v}
def USD(url, note="USD list price × 1.386 (Azure CAD/USD meter ratio)"):
    return {"kind": "derived", "url": url, "note": note, "retrievedAt": "2026-10-02"}
SF = lambda note=None: {k: v for k, v in {"kind": "snowflake-consumption-table", "url": "https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf", "note": note, "retrievedAt": "2026-10-02"}.items() if v}
r = lambda x: round(x, 4)
def tp(i, c, o, w=None):
    d = {"input": r(i), "cachedInput": r(c), "output": r(o)}
    if w is not None: d["cacheWrite"] = r(w)
    return d
def dz(p): return {k: r(v * 1.1) for k, v in p.items()}
def usd(i, c, o, w=None): return tp(i * FX, c * FX, o * FX, None if w is None else w * FX)

show = json.load(open(SHOW / "models.json"))
chat = []
TOK = {"o200k": "o200k"}
CTX = {"gpt-5.6": (1050000, 128000), "gpt-5.5": (1050000, 128000), "gpt-5.4": (1050000, 128000), "gpt-5.4-mini": (400000, 128000), "gpt-5.4-nano": (400000, 128000),
       "gpt-5.2": (400000, 128000), "gpt-5.1": (400000, 128000), "gpt-5": (400000, 128000), "gpt-4.1": (1047576, 32768), "gpt-4o": (128000, 16384), "o3": (200000, 100000), "o4-mini": (200000, 100000), "o3-mini": (200000, 100000)}
def ctx(mid):
    for k in sorted(CTX, key=len, reverse=True):
        if mid.startswith(k): return CTX[k]
    return (128000, 16384)
for mid, m in show["chatModels"].items():
    g = tp(m["inputPer1M"], m["cachedInputPer1M"], m["outputPer1M"])
    cw, mo = ctx(mid)
    status = {"ga": "ga", "legacy": "legacy", "deprecated": "deprecated"}.get(m.get("lifecycle"), "ga")
    e = {"id": mid, "label": m.get("label", mid), "platform": "azure", "vendor": "openai", "tokenizer": "o200k", "contextWindow": cw, "maxOutput": mo,
         "prices": {"global": g, "dataZone": dz(g)}, "toolUseOverheadTokens": 0, "batchDiscount": 0.5,
         "lifecycle": {"status": status, "retiresOn": m.get("retiresOn")}, "source": API(m.get("meterName")), "confidence": "verified"}
    if mid.startswith(("gpt-5.4", "gpt-5.5", "gpt-5.6")) and cw > 400000:
        e["longContext"] = {"threshold": 272000, "prices": tp(g["input"] * 2, g["cachedInput"] * 2, g["output"] * 1.5)}
    if mid == "gpt-5.6-sol":
        e["promo"] = {"until": "2026-11-30", "note": "Foundry promo USD 4/20; list USD 5/30"}
        e["prices"]["globalList"] = usd(5, 0.5, 30)
    chat.append(e)

def az(mid, label, vendor, tok, cw, mo, p, overhead=0, status="ga", conf="single-source", url="https://learn.microsoft.com/azure/ai-foundry/", note=None, retires=None):
    return {"id": mid, "label": label, "platform": "azure", "vendor": vendor, "tokenizer": tok, "contextWindow": cw, "maxOutput": mo,
            "prices": {"global": p, "dataZone": dz(p)}, "toolUseOverheadTokens": overhead, "batchDiscount": 0.5 if vendor == "anthropic" else 0,
            "lifecycle": {"status": status, "retiresOn": retires}, "source": USD(url, note or "USD list price × 1.386 (Azure CAD/USD meter ratio)"), "confidence": conf}
CLAUDE = "https://platform.claude.com/docs/en/about-claude/pricing"
chat += [
    az("gpt-6.1-sol", "GPT-6.1 Sol", "openai", "o200k", 1050000, 128000, usd(2, 0.1, 10, 2.5), conf="cross-checked", url="https://github.com/MicrosoftDocs/azure-ai-docs"),
    az("gpt-6-astra", "GPT-6 Astra", "openai", "o200k", 1050000, 128000, usd(10, 1, 50, 12.5), conf="cross-checked", url="https://github.com/MicrosoftDocs/azure-ai-docs"),
    az("gpt-6-sol", "GPT-6 Sol", "openai", "o200k", 1050000, 128000, usd(2, 0.2, 10, 2.5), conf="cross-checked", url="https://github.com/MicrosoftDocs/azure-ai-docs"),
    az("gpt-6-luna", "GPT-6 Luna", "openai", "o200k", 1050000, 128000, usd(0.1, 0.01, 0.5, 0.125), url="https://github.com/MicrosoftDocs/azure-ai-docs"),
    az("claude-opus-5-5", "Claude Opus 5.5 (Foundry)", "anthropic", "claude-47", 1000000, 128000, usd(4, 0.2, 20, 5), 286, conf="cross-checked", url=CLAUDE, note="Foundry bills Claude at Anthropic list price (CCU); USD × 1.386"),
    az("claude-sonnet-5-5", "Claude Sonnet 5.5 (Foundry)", "anthropic", "claude-47", 1000000, 128000, usd(2, 0.2, 10, 2.5), 286, conf="cross-checked", url=CLAUDE, note="Foundry bills Claude at Anthropic list price (CCU); USD × 1.386"),
    az("claude-opus-4-8", "Claude Opus 4.8 (Foundry)", "anthropic", "claude-47", 1000000, 128000, usd(5, 0.5, 25, 6.25), 290, conf="cross-checked", url=CLAUDE),
    az("claude-sonnet-4-6", "Claude Sonnet 4.6 (Foundry)", "anthropic", "claude-legacy", 1000000, 128000, usd(3, 0.3, 15, 3.75), 497, status="legacy", conf="cross-checked", url=CLAUDE),
    az("claude-haiku-4-5", "Claude Haiku 4.5 (Foundry)", "anthropic", "claude-legacy", 200000, 64000, usd(1, 0.1, 5, 1.25), 496, conf="cross-checked", url=CLAUDE),
    az("deepseek-v4-pro", "DeepSeek V4 Pro", "deepseek", "other", 1000000, 64000, usd(1.74, 0.145, 3.48)),
    az("grok-4.3", "Grok 4.3", "xai", "other", 256000, 64000, usd(1.25, 0.2, 2.5)),
    az("llama-4-maverick", "Llama 4 Maverick", "meta", "other", 128000, 8192, usd(0.25, 0.25, 1.0)),
    az("mistral-large-3", "Mistral Large 3", "mistral", "other", 256000, 32000, usd(0.5, 0.5, 1.5), status="preview"),
    az("mai-thinking-1", "MAI-Thinking-1", "microsoft", "other", 256000, 32000, usd(2, 0.2, 8), status="preview"),
]
def sfm(mid, label, vendor, tok, cw, mo, cin, cout, routing, conf="single-source", status="ga", note=None):
    return {"id": "sf:" + mid, "label": label + " (Snowflake)", "platform": "snowflake", "vendor": vendor, "tokenizer": tok, "contextWindow": cw, "maxOutput": mo,
            "credits": {"input": cin, "output": cout}, "snowflakeRouting": routing, "toolUseOverheadTokens": 0, "batchDiscount": 0,
            "lifecycle": {"status": status}, "source": SF(note), "confidence": conf}
chat += [
    sfm("claude-sonnet-5-5", "Claude Sonnet 5.5", "anthropic", "claude-47", 1000000, 128000, 1.10, 5.50, "any-region", "unverified", "preview", "derived from list price pattern (list ÷ 2 × 1.1)"),
    sfm("claude-opus-5-5", "Claude Opus 5.5", "anthropic", "claude-47", 1000000, 128000, 2.20, 11.00, "any-region", "unverified", "preview", "derived from list price pattern (list ÷ 2 × 1.1)"),
    sfm("claude-sonnet-4-5", "Claude Sonnet 4.5", "anthropic", "claude-legacy", 200000, 64000, 1.65, 8.25, "any-region", "cross-checked"),
    sfm("claude-haiku-4-5", "Claude Haiku 4.5", "anthropic", "claude-legacy", 200000, 64000, 0.55, 2.75, "any-region"),
    sfm("openai-gpt-5.4", "GPT-5.4", "openai", "o200k", 400000, 128000, 1.38, 8.25, "azure-cross-region", status="preview"),
    sfm("openai-gpt-5", "GPT-5", "openai", "o200k", 272000, 8192, 0.69, 5.50, "azure-cross-region"),
    sfm("openai-gpt-5-mini", "GPT-5 mini", "openai", "o200k", 272000, 8192, 0.14, 1.10, "azure-cross-region"),
    sfm("openai-gpt-4.1", "GPT-4.1", "openai", "o200k", 128000, 32000, 1.00, 4.00, "native", status="legacy"),
    sfm("llama3.3-70b", "Llama 3.3 70B", "meta", "other", 128000, 8192, 0.36, 0.36, "azure-cross-region"),
    sfm("llama3.1-8b", "Llama 3.1 8B", "meta", "other", 128000, 8192, 0.11, 0.11, "native"),
    sfm("mistral-large2", "Mistral Large 2", "mistral", "other", 128000, 8192, 1.00, 3.00, "native", status="legacy"),
]

emb = []
for mid, m in show["embeddingModels"].items():
    emb.append({"id": mid, "label": m["label"], "platform": "azure", "dims": m["dims"], "maxInputTokens": 8192, "per1M": m["per1M"],
                "lifecycle": {"status": "ga", "retiresOn": m.get("retiresOn")}, "source": API(m.get("meterName"), None if m.get("azureNative") else "USD 0.02 × 1.386; 1K meter rounds to 0"),
                "confidence": "verified" if m.get("azureNative") else "cross-checked"})
emb.append({"id": "cohere-embed-v4", "label": "Cohere Embed v4 (1536d)", "platform": "azure", "dims": 1536, "maxInputTokens": 128000, "per1M": r(0.12 * FX), "lifecycle": {"status": "ga"}, "source": USD("https://ai.azure.com"), "confidence": "single-source"})
for mid, dims, cr, ctxl in [("snowflake-arctic-embed-m-v1.5", 768, 0.03, 512), ("snowflake-arctic-embed-l-v2.0", 1024, 0.05, 512), ("voyage-multilingual-2", 1024, 0.07, 32000)]:
    emb.append({"id": "sf:" + mid, "label": mid + " (Snowflake)", "platform": "snowflake", "dims": dims, "maxInputTokens": ctxl, "credits": cr, "lifecycle": {"status": "ga"}, "source": SF(), "confidence": "single-source"})

SPEECH = "https://azure.microsoft.com/pricing/details/speech/"
tm = show["transcriptionModels"]
def sp(**k):
    base = {"platform": "azure", "diarization": "included", "lifecycle": {"status": "ga"}, "confidence": "single-source"}
    base.update(k); return base
speech = [
    sp(id="mai-transcribe-2", label="MAI-Transcribe-2", via="Azure Speech (LLM Speech API)", mode="batch", perAudioHour=r(0.10 * FX), afterPromoMultiplier=3.6,
       promo={"until": "2026-12-31", "note": "Introductory USD 0.10/h; list unpublished — assumes USD 0.36/h after"}, lifecycle={"status": "preview"}, source=USD("https://microsoft.ai/news/")),
    sp(id="mai-transcribe-1.5", label="MAI-Transcribe-1.5", via="Azure Speech (LLM Speech API)", mode="batch", perAudioHour=r(0.36 * FX), source=USD("https://microsoft.ai/news/")),
    sp(id="mai-transcribe-2-streaming", label="MAI-Transcribe-2 Streaming", via="Azure Speech", mode="streaming", perAudioHour=r(0.54 * FX), promo={"until": "2026-12-31"}, lifecycle={"status": "preview"}, source=USD("https://microsoft.ai/news/")),
    sp(id="speech-batch", label="Speech to text, batch", via="Azure Speech", mode="batch", perAudioHour=r(0.18 * FX), source=USD(SPEECH), confidence="cross-checked"),
    sp(id="speech-fast", label="Speech to text, fast transcription", via="Azure Speech", mode="fast", perAudioHour=r(0.66 * FX), source=USD(SPEECH, "Sources conflict: USD 0.66 vs 0.36 per hour"), confidence="unverified"),
    sp(id="speech-realtime", label="Speech to text, real-time", via="Azure Speech", mode="realtime", perAudioHour=r(1.0 * FX), diarization="add-on", diarizationAddOnPerHour=r(0.30 * FX), source=USD(SPEECH), confidence="cross-checked"),
    sp(id="gpt-4o-mini-transcribe", label="gpt-4o-mini-transcribe", via="Foundry", mode="batch", diarization="none",
       tokens={"audioTokensPerSecond": 10, "audioInputPer1M": tm["gpt-4o-mini-transcribe"]["audioInputPer1M"], "textOutputPer1M": tm["gpt-4o-mini-transcribe"]["textOutputPer1M"]},
       lifecycle={"status": "ga", "retiresOn": "2027-06-15"}, source=API("gpt-4o-mini-transcribe-aud-inp-glbl Tokens"), confidence="verified"),
    sp(id="gpt-4o-transcribe", label="gpt-4o-transcribe", via="Foundry", mode="batch", diarization="none",
       tokens={"audioTokensPerSecond": 10, "audioInputPer1M": tm["gpt-4o-transcribe"]["audioInputPer1M"], "textOutputPer1M": tm["gpt-4o-transcribe"]["textOutputPer1M"]},
       lifecycle={"status": "deprecated", "retiresOn": "2026-10-15", "replacement": "gpt-4o-mini-transcribe"}, source=API("gpt-4o-transcribe-aud-inp-glbl Tokens"), confidence="verified"),
    sp(id="gpt-transcribe", label="gpt-transcribe", via="Foundry", mode="batch", diarization="none", perAudioHour=tm["gpt-transcribe"]["perAudioHour"], source=API("gpt-transcribe Gl Unit"), confidence="verified"),
    sp(id="whisper", label="Whisper", via="Foundry", mode="batch", diarization="none", perAudioHour=r(0.36 * FX), lifecycle={"status": "deprecated", "retiresOn": "2026-12-15"}, source=USD("https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/")),
    sp(id="cu-audio", label="Content Understanding audio", via="Foundry Tools", mode="batch", perAudioHour=r(0.46 * FX), source=USD("https://github.com/MicrosoftDocs/azure-ai-docs", "Extraction USD 0.36/h + contextualization USD 0.10/h; LLM tokens extra"), confidence="cross-checked"),
    {"id": "sf:ai-transcribe", "label": "AI_TRANSCRIBE", "platform": "snowflake", "via": "Snowflake Cortex", "mode": "batch", "creditsPerHour": 0.175, "diarization": "included",
     "lifecycle": {"status": "ga"}, "source": SF("Target USD 0.35 per audio hour from 2026-06-01; 50 tokens/s"), "confidence": "single-source"},
]

st = json.load(open(SHOW / "azure.ai-search.json"))["tables"]["tiers"]
LIM = {"free": (0.05, 0, 1, 1, 3), "basic": (15, 5, 3, 3, 15), "s1": (160, 35, 12, 12, 50), "s2": (512, 150, 12, 12, 200), "s3": (1024, 300, 12, 12, 200)}
search = []
for tid, t in st.items():
    s, v, p, rep, idx = LIM[tid]
    search.append({"id": tid, "label": t["label"], "perSUMonth": t["perMonth"], "storageGBPerPartition": s, "vectorGBPerPartition": v, "maxPartitions": p, "maxReplicas": rep, "maxIndexes": idx, "source": API(t["meterName"]), "confidence": "verified"})
search.append({"id": "s3hd", "label": "Standard S3 HD", "perSUMonth": st["s3"]["perMonth"], "storageGBPerPartition": 1024, "vectorGBPerPartition": 300, "maxPartitions": 3, "maxReplicas": 12, "maxIndexes": 3000, "source": API(), "confidence": "cross-checked"})
for tid, usdm, s, v, idx in [("l1", 2802.47, 2048, 150, 10), ("l2", 5604.21, 4096, 300, 10)]:
    search.append({"id": tid, "label": f"Storage Optimized {tid.upper()}", "perSUMonth": r(usdm * FX), "storageGBPerPartition": s, "vectorGBPerPartition": v, "maxPartitions": 12, "maxReplicas": 12, "maxIndexes": idx, "source": USD("https://azure.microsoft.com/pricing/details/search/"), "confidence": "single-source"})

sc = lambda f: json.load(open(SHOW / f)).get("scalars", {})
di, ca, la, blob, kv, ha = sc("azure.ai.document-intelligence.json"), sc("azure.container-apps.apps.json"), sc("azure.monitor.log-analytics.json"), sc("azure.storage.blob.json"), sc("azure.key-vault.json"), sc("azure.foundry.hosted-agent.json")
apim = json.load(open(SHOW / "azure.api-management.json"))["tables"]["tiers"]
def up(id, label, unit, price=None, conf="verified", src=None, **k):
    e = {"id": id, "label": label, "platform": "azure", "unit": unit, "source": src or API(), "confidence": conf}
    if price is not None: e["price"] = r(price)
    e.update(k); return e
def upu(id, label, unit, usd_price, url, conf="single-source", note=None, **k):
    return up(id, label, unit, usd_price * FX, conf, USD(url, note or "USD list price × 1.386 (Azure CAD/USD meter ratio)"), **k)
def sfu(id, label, unit, credits, ctype="ai", conf="single-source", note=None, **k):
    e = {"id": id, "label": label, "platform": "snowflake", "unit": unit, "credits": credits, "creditType": ctype, "source": SF(note), "confidence": conf}
    e.update(k); return e
DIURL, CUURL, SEARCHURL, CSURL = "https://azure.microsoft.com/pricing/details/ai-document-intelligence/", "https://github.com/MicrosoftDocs/azure-ai-docs", "https://azure.microsoft.com/pricing/details/search/", "https://azure.microsoft.com/pricing/details/content-safety/"
FTURL = "https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/"
FT_MODELS = [("gpt-4.1", "GPT-4.1", 25), ("gpt-4.1-mini", "GPT-4.1 mini", 5), ("gpt-4.1-nano", "GPT-4.1 nano", 1.5), ("gpt-4o", "GPT-4o", 25), ("gpt-4o-mini", "GPT-4o mini", 3.3)]
units = [
    up("di-read", "Document Intelligence Read", "1K pages", di["readPer1KPages"], attrs={"overflowPer1K": di["readOverflowPer1KPages"], "overflowAfterPages": di["readOverflowAfterPages"]}, freePerMonth=0),
    up("di-layout", "Document Intelligence Layout", "1K pages", di["layoutPer1KPages"]),
    up("di-prebuilt", "Document Intelligence prebuilt (invoice, receipt, ID…)", "1K pages", di["layoutPer1KPages"], "cross-checked"),
    upu("di-custom", "Document Intelligence custom extraction", "1K pages", 30, DIURL),
    upu("di-addon-highres", "Document Intelligence add-on (high-res, formulas, fonts)", "1K pages", 6, DIURL),
    upu("di-query-fields", "Document Intelligence query fields", "1K pages", 10, DIURL),
    upu("cu-doc-standard", "Content Understanding document, standard", "1K pages", 5, CUURL, "cross-checked"),
    upu("cu-doc-basic", "Content Understanding document, basic OCR", "1K pages", 1, CUURL),
    upu("cu-doc-minimal", "Content Understanding digital files (DOCX, EML, MSG…)", "1K pages", 0.01, CUURL, "unverified", "Pricing page shows '$-'; one secondary source says ~USD 0.01"),
    upu("cu-context-standard", "Content Understanding contextualization", "1M tokens", 1, CUURL, "cross-checked"),
    upu("cu-video", "Content Understanding video extraction", "hour", 1, CUURL, "cross-checked"),
    up("search-semantic", "AI Search semantic ranker", "1K queries", sc("azure.ai-search.json")["semanticRankerPer1K"], freePerMonth=1),
    upu("search-agentic", "AI Search agentic retrieval", "1M tokens", 0.022, SEARCHURL, "unverified", freePerMonth=50),
    upu("search-image-extract", "AI Search image extraction", "1K images", 1, SEARCHURL),
    upu("rerank-cohere-3.5", "Cohere Rerank 3.5", "1K searches", 2, "https://ai.azure.com"),
    upu("rerank-cohere-4-fast", "Cohere Rerank 4 Fast", "1K searches", 2, "https://ai.azure.com"),
    upu("rerank-cohere-4-pro", "Cohere Rerank 4 Pro", "1K searches", 2.5, "https://ai.azure.com"),
    upu("safety-text", "Content Safety text moderation", "1K records", 0.375, CSURL, freePerMonth=5),
    upu("safety-image", "Content Safety image moderation", "1K images", 0.75, CSURL, freePerMonth=5),
    upu("safety-prompt-shields", "Content Safety Prompt Shields", "1K records", 0.375, CSURL, "unverified"),
    upu("eval-safety-input", "Foundry AI evaluations meter, input", "1M tokens", 20, "https://azure.microsoft.com/pricing/details/ai-foundry/", "unverified"),
    upu("eval-safety-output", "Foundry AI evaluations meter, output", "1M tokens", 60, "https://azure.microsoft.com/pricing/details/ai-foundry/", "unverified"),
    upu("bing-grounding", "Grounding with Bing Search", "1K transactions", 14, "https://www.microsoft.com/en-us/bing/apis/grounding-pricing", "cross-checked"),
    upu("code-interpreter", "Agent Service Code Interpreter", "session", 0.033, "https://azure.microsoft.com/pricing/details/foundry-agent-service/"),
    upu("file-search-storage", "Agent Service File Search storage", "GB-day", 0.11, "https://azure.microsoft.com/pricing/details/foundry-agent-service/", freePerMonth=1),
    up("language-records", "Azure Language (PII, summarization)", "1K records", sc("azure.ai.language.json")["per1KRecords"]),
    up("translator-text", "Translator text", "1M chars", sc("azure.ai.translator.json")["textPer1MChars"]),
    up("container-apps-vcpu-s", "Container Apps vCPU (active)", "vCPU-second", ca["vcpuActiveSecond"], attrs={"freeVcpuSeconds": 180000}),
    up("container-apps-gib-s", "Container Apps memory", "GiB-second", ca["gibSecond"], attrs={"freeGibSeconds": 360000}),
    up("container-apps-requests", "Container Apps requests", "1M requests", ca["requestsPer1M"], freePerMonth=2),
    up("log-analytics-ingest", "Log Analytics / App Insights ingestion", "GB", la["ingestPerGB"], freePerMonth=la["freeGBPerMonth"]),
    up("blob-hot", "Blob Storage hot LRS", "GB-month", blob["hotPerGBMonth"]),
    up("key-vault-ops", "Key Vault operations", "10K operations", kv["opsPer10K"]),
    up("apim-developer", "API Management Developer", "month", apim["developer"]["perMonth"]),
    up("apim-basic-v2", "API Management Basic v2", "month", apim["basicV2"]["perMonth"]),
    up("apim-standard-v2", "API Management Standard v2", "month", apim["standardV2"]["perMonth"]),
    up("hosted-agent-vcpu-h", "Foundry hosted agent vCPU", "vCPU-hour", ha["vcpuHour"], "cross-checked"),
    up("hosted-agent-gib-h", "Foundry hosted agent memory", "GiB-hour", ha["gibHour"], "cross-checked"),
    upu("copilot-business", "GitHub Copilot Business seat", "seat-month", 19, "https://github.com/features/copilot/plans", "cross-checked"),
    upu("copilot-enterprise", "GitHub Copilot Enterprise seat", "seat-month", 39, "https://github.com/features/copilot/plans", "cross-checked"),
    # Fine-tuning (Azure OpenAI): training per 1M tokens, hosting per deployment-hour. Not checked against the Retail API.
    *[upu(f"ft-train-{m}", f"Fine-tuning training, {lbl}", "1M training tokens", usd, FTURL, "unverified", attrs={"baseModelId": m}) for m, lbl, usd in FT_MODELS],
    upu("ft-train-o4-mini-rft", "Reinforcement fine-tuning, o4-mini", "training hour", 100, FTURL, "unverified", attrs={"baseModelId": "o4-mini"}),
    upu("ft-hosting", "Fine-tuned deployment hosting", "hour", 1.70, FTURL, "unverified"),
    sfu("sf-parse-layout", "AI_PARSE_DOCUMENT layout", "1K pages", 3.33, note="Conflicting third-party figure of ~USD 0.04/page"),
    sfu("sf-parse-ocr", "AI_PARSE_DOCUMENT OCR", "1K pages", 0.50),
    sfu("sf-ai-extract", "AI_EXTRACT", "1M tokens", 5.0, attrs={"tokensPerPage": 970}),
    sfu("sf-ai-classify", "AI_CLASSIFY / AI_FILTER", "1M tokens", 1.39),
    sfu("sf-ai-translate", "AI_TRANSLATE", "1M tokens", 1.50),
    sfu("sf-cortex-guard", "Cortex Guard", "1M tokens", 0.25),
    sfu("sf-search-serving", "Cortex Search serving", "GB-month", 6.3, conf="cross-checked"),
    sfu("sf-analyst", "Cortex Analyst (direct API)", "1K messages", 67, "platform"),
]

for t in search:
    units.append({"id": f"search-su-{t['id']}", "label": f"AI Search {t['label']} search unit", "platform": "azure", "unit": "SU-month", "price": t["perSUMonth"], "source": t["source"], "confidence": t["confidence"]})

TTSURL = "https://azure.microsoft.com/pricing/details/speech/"
units += [
    upu("tts-neural", "Azure Speech neural text to speech", "1M chars", 15, TTSURL, "cross-checked"),
    upu("tts-neural-hd", "Azure Speech neural HD text to speech", "1M chars", 22, TTSURL),
    upu("tts-mai-voice-2", "MAI-Voice-2 text to speech", "1M chars", 22, "https://microsoft.ai/news/"),
    upu("tts-mai-voice-2-flash", "MAI-Voice-2.1-Flash text to speech", "1M chars", 15, "https://microsoft.ai/news/"),
    upu("tts-gpt-4o-mini", "gpt-4o-mini-tts (≈ USD 0.015/min)", "1M chars", 15 / 0.9, "https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/", "unverified", "Derived from ~USD 0.015 per minute at ~900 characters per minute"),
]
RT = "https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/"
realtime = [
    {"id": "gpt-realtime-2.1", "label": "gpt-realtime-2.1", "text": usd(4, 0.4, 24), "audio": usd(32, 0.4, 64), "audioTokensPerSecondIn": 10, "audioTokensPerSecondOut": 20,
     "lifecycle": {"status": "ga"}, "source": USD(RT), "confidence": "cross-checked"},
    {"id": "gpt-realtime-2.1-mini", "label": "gpt-realtime-2.1-mini", "text": usd(0.6, 0.06, 2.4), "audio": usd(10, 0.3, 20), "audioTokensPerSecondIn": 10, "audioTokensPerSecondOut": 20,
     "lifecycle": {"status": "ga"}, "source": USD(RT), "confidence": "cross-checked"},
    {"id": "gpt-realtime-1.5", "label": "gpt-realtime-1.5", "text": usd(4, 0.4, 16), "audio": usd(32, 0.4, 64), "audioTokensPerSecondIn": 10, "audioTokensPerSecondOut": 20,
     "lifecycle": {"status": "ga"}, "source": USD(RT), "confidence": "single-source"},
]

PTUDOC = "https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/foundry/openai/includes/how-to-provisioned-throughput-sizing.md"
def pm(model, tpm, ratio, gmin=15, ginc=5, rmin=50, rinc=50):
    return {"modelId": model, "inputTpmPerPtu": tpm, "outputRatio": ratio, "globalMin": gmin, "globalIncrement": ginc, "regionalMin": rmin, "regionalIncrement": rinc}
ptu = {
    "rates": {
        "global": {"hourly": r(1.00 * FX), "monthlyReservation": r(260 * FX), "yearlyReservationPerMonth": r(2652 / 12 * FX)},
        "dataZone": {"hourly": r(1.10 * FX), "monthlyReservation": r(286 * FX), "yearlyReservationPerMonth": r(2916 / 12 * FX)},
        "regional": {"hourly": r(2.00 * FX), "monthlyReservation": r(286 * FX), "yearlyReservationPerMonth": r(2916 / 12 * FX)},
    },
    "models": [
        pm("gpt-5.6-luna", 30000, 6), pm("gpt-5.6-terra", 3000, 6), pm("gpt-5.6-sol", 1200, 6), pm("gpt-5.5", 1200, 6),
        pm("gpt-5.4", 2400, 6), pm("gpt-5.4-mini", 7900, 6, rmin=25, rinc=25),
        pm("gpt-5.2", 3400, 8), pm("gpt-5.1", 4750, 8), pm("gpt-5", 4750, 8), pm("gpt-5-mini", 23750, 8, rmin=25, rinc=25),
        pm("gpt-4.1", 3000, 4), pm("gpt-4.1-mini", 14900, 4, rmin=25, rinc=25), pm("gpt-4.1-nano", 59400, 4, rmin=25, rinc=25),
        pm("o3", 3000, 4), pm("o4-mini", 5400, 4, rmin=25, rinc=25), pm("gpt-4o", 2500, 4), pm("gpt-4o-mini", 37000, 4, rmin=25, rinc=25),
    ],
    "source": {"kind": "derived", "url": PTUDOC, "note": "Throughput table from Microsoft docs (2026-09-23); rates USD x 1.386 (Global hourly USD 1.00, monthly reservation USD 260, yearly USD 2,652)", "retrievedAt": "2026-10-02"},
    "confidence": "cross-checked",
}

snow = {"aiCreditGlobal": r(2.00 * FX), "aiCreditRegional": r(2.20 * FX),
        "platformCredit": {"standard": r(2 * FX), "enterprise": r(3 * FX), "businessCritical": r(4 * FX), "vps": r(6 * FX)},
        "warehouseCreditsPerHour": {"xs": 1, "s": 2, "m": 4, "l": 8, "xl": 16},
        "source": SF("AI credit USD 2.00 global / 2.20 regional; platform credit Azure East US 2 on-demand; × 1.386"), "confidence": "cross-checked"}

meta = {"currency": "CAD", "asOf": "2026-10-02", "region": "canadacentral",
        "notes": ["Azure prices: Azure Retail Prices API, currencyCode CAD, Global deployment, 2026-09-17.",
                  "USD-only list prices converted at 1.386 CAD/USD (ratio of Azure CAD and USD meters) and marked source.kind = derived.",
                  "Snowflake: credits from the Credit Consumption Table; CAD per credit is a project setting."]}
OUT.mkdir(parents=True, exist_ok=True)
for name, data in [("ptu", ptu), ("realtime-models", realtime), ("meta", meta), ("chat-models", chat), ("embedding-models", emb), ("speech-engines", speech), ("search-tiers", search), ("unit-prices", units), ("snowflake", snow)]:
    json.dump(data, open(OUT / f"{name}.json", "w"), indent=2); print(name, len(data) if isinstance(data, list) else "")
