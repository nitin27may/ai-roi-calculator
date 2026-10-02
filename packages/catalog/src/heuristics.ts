/**
 * Conversion factors used to turn business volumes (pages, minutes, emails, steps) into
 * tokens. Sources are in docs/research/05 and 06; every value is a default the user can
 * override per project.
 */
export const heuristics = {
  tokens: {
    /** o200k tokens per English word for business prose. */
    perWord: 1.33,
    charsPerToken: 4.0,
    /** Multiplier relative to o200k for the same text. */
    tokenizerMultiplier: { o200k: 1.0, "claude-legacy": 1.1, "claude-47": 1.35, other: 1.0 },
    /** Multiplier relative to English (o200k-class tokenizers). */
    language: { en: 1.0, fr: 1.3, es: 1.2, de: 1.25, zh: 1.0, ja: 1.5, hi: 1.4, ar: 1.2 },
  },
  pages: {
    wordsPerPage: { plain: 500, dense: 700, slide: 40, spreadsheet: 1350 },
    /** Document Intelligence Layout markdown overhead vs raw text. */
    layoutMarkdownOverhead: 1.15,
    /** Tokens per page when a PDF is sent straight to the model (text + page image). */
    directPdfTokensPerPage: { o200k: 1400, "claude-legacy": 2300, "claude-47": 3200, other: 1400 },
    /** Characters per billed page for DOCX/HTML/TXT/EML in Document Intelligence and Content Understanding. */
    charsPerBilledPage: 3000,
  },
  email: { bodyWords: 150, overheadTokens: 100, attachmentShare: 0.25, attachmentsPerEmail: 1.5, pagesPerAttachment: 5, attachmentDedupe: 0.7 },
  speech: {
    wordsPerMinute: 140,
    /** Transcript format overhead: plain names, timestamps + speaker, WebVTT. */
    diarizationOverhead: { none: 0, names: 0.15, timestamps: 0.35, vtt: 0.75 },
    summaryOutputTokens: 500,
  },
  chat: { userTurn: 100, assistantTurn: 350, turnsPerConversation: 4, systemPrompt: 500, ragTemplate: 100 },
  rag: { chunkTokens: 512, overlap: 0.25, topK: 5 },
  agents: {
    systemPrompt: 1500,
    tokensPerTool: 250,
    stepsP50: 8,
    toolCallsPerStep: 1.3,
    toolResultTokens: 1500,
    outputPerStep: 300,
    reasoningPerStep: { none: 0, low: 500, medium: 2000, high: 6000 },
    /** P90 multipliers on steps and tool-result size (published runs vary ~30×; P90 ≈ 1.8× steps). */
    p90: { steps: 1.8, toolResult: 1.5 },
    retryRate: 0.05,
  },
  search: { hnswOverhead: 0.01, deletedDocs: 0.1, diskToVectorRatio: 3, bytesPerTextToken: 4 },
  evaluation: {
    /** Judge prompt template tokens per evaluator (azure-ai-evaluation .prompty files). */
    templateTokens: {
      groundedness: 1590, relevance: 2080, coherence: 1620, fluency: 1140, similarity: 1200, retrieval: 4170,
      responseCompleteness: 1800, intentResolution: 2140, taskAdherence: 1860, taskCompletion: 2900,
      toolCallAccuracy: 2690, toolSelection: 2020, toolOutputUtilization: 2050,
    },
    judgeOutputTokens: 300,
    safetyEvaluatorTokens: { input: 1500, output: 200 },
  },
  redTeam: { objectivesPerCategory: 10, probeInputTokens: 650, probeOutputTokens: 300, multiTurnFactor: 4 },
} as const;

export type Heuristics = typeof heuristics;
