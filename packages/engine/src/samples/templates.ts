import type { Project } from "../project.js";
import { meetingIntelligence } from "./meeting-intelligence.js";
import { DEFAULT_HARNESS, newActivity, newWorkload } from "../templates.js";

/** A minimal valid project: rate card, a small team, no Dev Lab activities or workloads. */
export function blankProject(name: string, startDate = nextMonth()): Project {
  return {
    schema: "ai-cost-roi-studio/project", version: 1, name, startDate,
    settings: { azureDeployment: "global", snowflake: { routing: "global", edition: "enterprise" } },
    timeline: { buildMonths: 4, horizonMonths: 36, adoptionRampMonths: 6 },
    rateCard: [
      { id: "dev", label: "AI developer", hourlyRate: 95 },
      { id: "architect", label: "Solution architect", hourlyRate: 120 },
      { id: "knowledgeWorker", label: "Knowledge worker", hourlyRate: 62.5 },
    ],
    harnesses: [],
    build: { team: [{ roleId: "dev", people: 2, hoursPerMonth: 160, experiments: true }, { roleId: "architect", people: 0.5, hoursPerMonth: 160, experiments: false }], contingencyPct: 10, activities: [], environment: [{ id: "logs", label: "App Insights (dev)", unitPriceId: "log-analytics-ingest", quantity: 5 }] },
    workloads: [],
    maintenance: { mode: "pctOfBuild", pctPerYear: 20 },
    benefits: { capabilities: [], avoidedCosts: [], oneOff: [] },
    roi: { basis: "full", benefitPreset: "typical", devCutPct: 0, maintCutPct: 0, transitionCosts: [], growthPctPerYear: 0, rateEscalationPctPerYear: 2, discountRatePct: 8 },
    scenarios: [],
  };
}

function nextMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

const withActivities = (p: Project, kinds: Parameters<typeof newActivity>[1][]) => { for (const k of kinds) p.build.activities.push(newActivity(p, k)); return p; };

function contractsRag(name: string): Project {
  const p = blankProject(name);
  p.timeline.buildMonths = 4;
  withActivities(p, ["playground", "iterations", "evaluation", "redteam", "tooling"]);
  const it = p.build.activities.find((a) => a.kind === "iterations");
  if (it?.kind === "iterations") it.runsPerDevPerDay = 6;
  p.workloads.push(
    { ...newWorkload(p, "documents"), id: "contracts", label: "Contract ingestion", pagesPerMonth: 30000 } as Project["workloads"][number],
  );
  p.workloads.push({ ...newWorkload(p, "embeddings"), id: "embed", label: "Embeddings", tokensPerMonth: 40_000_000 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "aiSearch"), id: "index", label: "Contract index", chunks: 600_000 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "retrieval"), id: "retrieval", label: "Retrieval", queriesPerMonth: 40_000 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "chat"), id: "chat", label: "Contract Q&A", users: 250, conversationsPerUser: 15 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "continuousEval"), id: "ceval", label: "Continuous evaluation", interactionsPerMonth: 15_000 } as Project["workloads"][number]);
  p.workloads.push(newWorkload(p, "fixed"));
  p.benefits.capabilities.push({ id: "review", label: "Faster contract review", hoursSavedPerMonth: 400, roleId: "knowledgeWorker", componentIds: ["contracts", "embed", "index", "retrieval", "chat"] });
  return p;
}

function emailTriage(name: string): Project {
  const p = blankProject(name);
  p.harnesses.push({ ...DEFAULT_HARNESS, id: "triage", label: "Triage agent", tools: 6, steps: 4 });
  withActivities(p, ["bakeoff", "iterations", "regression", "evaluation", "redteam", "tooling"]);
  p.workloads.push({ ...newWorkload(p, "email"), id: "mail", label: "Inbound email", emailsPerMonth: 120_000 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "llm"), id: "classify", label: "Classification (Batch)", callsPerMonth: 120_000, modelId: "gpt-5.4-mini", inputTokens: 900, outputTokens: 60, batchShare: 0.8 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "agent"), id: "agent", label: "Triage agent", harnessId: "triage", tasksPerMonth: 30_000 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "contentSafety"), id: "safety", label: "Prompt Shields", requestsPerMonth: 120_000 } as Project["workloads"][number]);
  p.workloads.push(newWorkload(p, "fixed"));
  p.benefits.capabilities.push({ id: "triage", label: "Email triage and routing", hoursSavedPerMonth: 900, roleId: "knowledgeWorker", componentIds: ["mail", "classify", "agent"] });
  return p;
}

function callCentre(name: string): Project {
  const p = blankProject(name);
  p.timeline.buildMonths = 5;
  withActivities(p, ["playground", "iterations", "evaluation", "redteam", "tooling"]);
  p.workloads.push({ ...newWorkload(p, "voiceAgent"), id: "voice", label: "Voice agent", callsPerMonth: 20_000, minutesPerCall: 6, telephonyPerMinute: 0.02 } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "transcription"), id: "qa", label: "Call transcripts for QA", hoursPerMonth: 2000, engineId: "speech-batch" } as Project["workloads"][number]);
  p.workloads.push({ ...newWorkload(p, "continuousEval"), id: "ceval", label: "Call quality evaluation", interactionsPerMonth: 20_000, sampleShare: 0.1 } as Project["workloads"][number]);
  p.workloads.push(newWorkload(p, "fixed"));
  p.benefits.capabilities.push({ id: "deflect", label: "Calls handled without an agent", hoursSavedPerMonth: 1200, roleId: "knowledgeWorker", componentIds: ["voice", "qa"] });
  return p;
}

export const PROJECT_TEMPLATES: { id: string; label: string; detail: string; make: (name: string) => Project }[] = [
  { id: "meeting", label: "Meeting intelligence", detail: "Transcription, summaries, follow-up agent, RAG over meetings (the sample)", make: (name) => ({ ...structuredClone(meetingIntelligence), name }) },
  { id: "rag", label: "Contract / policy RAG", detail: "Document ingestion, AI Search, Q&A chat, evaluation", make: contractsRag },
  { id: "email", label: "Email triage agent", detail: "Email ingestion, Batch classification, triage agent with a bake-off", make: emailTriage },
  { id: "voice", label: "Call-centre voice agent", detail: "Real-time voice agent, call transcripts, quality evaluation", make: callCentre },
  { id: "blank", label: "Blank", detail: "A small team and nothing else; add activities and workloads yourself", make: (name) => blankProject(name) },
];
