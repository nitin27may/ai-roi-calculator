import type { Catalog } from "@roi-calculator/catalog";
import type { HostingItem, Workload } from "./project.js";

/**
 * Requests a month a workload serves, for hosting items that scale with volume (`perRequests`). Workloads with no
 * natural request count (fixed items, evaluations of storage, hosting stacks that state their own) return undefined.
 */
export function requestVolume(w: Workload): number | undefined {
  switch (w.kind) {
    case "chat": return w.users * w.conversationsPerUser * w.turns * (1 + (w.resendShare ?? 0));
    case "llm": return w.callsPerMonth * (1 + (w.resendShare ?? 0));
    case "agent": return w.tasksPerMonth;
    case "retrieval": return w.queriesPerMonth;
    case "voiceAgent": return w.callsPerMonth;
    case "email": return w.emailsPerMonth;
    case "documents": return w.pagesPerMonth;
    case "contentSafety": return w.requestsPerMonth;
    case "continuousEval": return w.interactionsPerMonth;
    case "hosting": return w.requestsPerMonth;
    case "transactionFee": return w.volumePerMonth;
    default: return undefined;
  }
}

/** Requests a month for every workload that has a count, keyed by workload id. */
export function requestVolumes(workloads: readonly Workload[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of workloads) {
    const v = requestVolume(w);
    if (v !== undefined) out.set(w.id, v);
  }
  return out;
}

export interface HostingPreset {
  id: string;
  label: string;
  /** What the stack covers and what it leaves out. */
  summary: string;
  /** The sizing assumptions behind the starting quantities, in plain words. They are starting points, not catalogue facts. */
  assumptions: string[];
  items: HostingItem[];
}

const fixed = (id: string, label: string, unitPriceId: string, quantity: number): HostingItem => ({ basis: "fixed", id, label, unitPriceId, quantity });
const perReq = (id: string, label: string, unitPriceId: string, unitsPer1KRequests: number): HostingItem => ({ basis: "perRequests", id, label, unitPriceId, unitsPer1KRequests });
const own = (id: string, label: string, note: string): HostingItem => ({ basis: "cash", id, label, amountCad: 0, note });

const HOURS = 730;
const SECONDS_PER_MONTH = HOURS * 3600;

/**
 * Hosting and platform presets (E7). Every price is a catalogue price; where the catalogue has no verified price the
 * item is an "enter your own" CAD amount that starts at 0 so nothing is invented. Quantities are sizing assumptions to edit.
 */
export const HOSTING_PRESETS: readonly HostingPreset[] = [
  {
    id: "agent-service",
    label: "Foundry Agent Service thread storage (Cosmos DB)",
    summary: "Agent Service keeps threads, messages and agent state in a Cosmos DB account you own. This prices that account. Agent Service itself has no hosting fee; model tokens and tools are priced in the agent workload.",
    assumptions: ["3,000 RU/s provisioned (three containers at 1,000 RU/s), the figure Microsoft's standard agent setup describes; check it against current docs", "50 GB of thread storage", "Defender for Cosmos DB on the same throughput"],
    items: [fixed("cosmos-throughput", "Cosmos DB provisioned throughput", "cosmos-ru-100", 30), fixed("cosmos-storage", "Cosmos DB thread storage", "cosmos-storage-gb", 50), fixed("defender-cosmos", "Defender for Cosmos DB", "defender-cosmos-100ru", 30)],
  },
  {
    id: "cosmos",
    label: "Cosmos DB",
    summary: "One provisioned-throughput Cosmos DB account with Defender. No backup, multi-region or analytical store.",
    assumptions: ["1,000 RU/s provisioned", "100 GB stored", "Defender for Cosmos DB on the same throughput"],
    items: [fixed("cosmos-throughput", "Cosmos DB provisioned throughput", "cosmos-ru-100", 10), fixed("cosmos-storage", "Cosmos DB storage", "cosmos-storage-gb", 100), fixed("defender-cosmos", "Defender for Cosmos DB", "defender-cosmos-100ru", 10)],
  },
  {
    id: "app-service",
    label: "App Service (Linux, Premium v3)",
    summary: "Two always-on Premium v3 instances for an API or web front end, with Defender for App Service. No slots, autoscale or reserved-instance discount.",
    assumptions: ["2 instances of P1v3 (2 vCPU, 8 GB)", "Defender for App Service on both"],
    items: [fixed("app-instances", "App Service P1v3 instances", "app-service-p1v3-linux", 2), fixed("defender-app", "Defender for App Service", "defender-app-service-node", 2)],
  },
  {
    id: "aks",
    label: "AKS cluster",
    summary: "AKS Standard control plane and Defender for Containers. Node pool virtual machines are not in the catalogue, so they are an amount you enter.",
    assumptions: ["One cluster with the uptime SLA", "12 vCores under Defender for Containers (three 4-vCPU nodes)", "Node pool VM cost: enter your own"],
    items: [fixed("aks-control", "AKS Standard control plane", "aks-uptime-sla", 1), fixed("defender-containers", "Defender for Containers", "defender-containers-vcore", 12), own("aks-nodes", "AKS node pool virtual machines (monthly)", "No verified catalogue price for node VMs. Enter your own monthly amount.")],
  },
  {
    id: "container-apps",
    label: "Container Apps (always on)",
    summary: "One always-on replica on the Consumption plan with request charges. Active-usage rates apply; idle rates and the monthly free grant are handled by the catalogue.",
    assumptions: ["1 vCPU and 2 GiB running all month", "Container Apps request charges follow volume"],
    items: [fixed("ca-vcpu", "Container Apps vCPU-seconds", "container-apps-vcpu-s", SECONDS_PER_MONTH), fixed("ca-memory", "Container Apps GiB-seconds", "container-apps-gib-s", SECONDS_PER_MONTH * 2), perReq("ca-requests", "Container Apps requests", "container-apps-requests", 0.001)],
  },
  {
    id: "private-endpoints",
    label: "Private endpoints",
    summary: "Private endpoint hourly and data-processed charges. The hourly meter is not in the Retail API for the region, so both are amounts you enter.",
    assumptions: ["Number of endpoints and data volume are yours to enter"],
    items: [own("pe-hourly", "Private endpoints (monthly)", "No verified catalogue price. Enter endpoints x hours x your rate."), own("pe-data", "Private Link data processed (monthly)", "No verified catalogue price. Enter your own.")],
  },
  {
    id: "apim-consumption",
    label: "API Management (Consumption)",
    summary: "Per-call pricing with the first million calls free each month.",
    assumptions: ["One gateway call per request in the workload's volume"],
    items: [perReq("apim-calls", "API Management Consumption calls", "apim-consumption-calls", 0.1)],
  },
  {
    id: "apim-premium",
    label: "API Management (Premium)",
    summary: "One Premium unit, for private networking and multi-region gateways. No extra units or regions.",
    assumptions: ["1 unit in one region"],
    items: [fixed("apim-unit", "API Management Premium unit", "apim-premium", 1)],
  },
  {
    id: "monitoring",
    label: "Monitoring (Log Analytics)",
    summary: "Log ingestion that grows with request volume. No retention beyond the included period, no Application Insights sampling changes.",
    assumptions: ["About 2 KB of logs and traces per request (0.002 GB per 1,000 requests)"],
    items: [perReq("logs", "Log Analytics ingestion", "log-analytics-ingest", 0.002)],
  },
  {
    id: "egress",
    label: "Outbound data transfer",
    summary: "Data leaving Azure to the internet, with the first 100 GB a month free.",
    assumptions: ["About 50 KB sent per request (0.05 GB per 1,000 requests)"],
    items: [perReq("egress", "Outbound data transfer", "egress-gb", 0.05)],
  },
];

export const hostingPreset = (id: string) => HOSTING_PRESETS.find((p) => p.id === id);

export interface HostingItemMeta {
  /** Where the price comes from: a catalogue source kind, or "your own amount". */
  source: string;
  confidence: "verified" | "cross-checked" | "single-source" | "unverified" | "enter-your-own";
  /** True when the number is yours, not the catalogue's. */
  enterYourOwn: boolean;
}

/** Source and confidence for a hosting item, read from the catalogue entry it prices against. */
export function hostingItemMeta(it: HostingItem, cat: Catalog): HostingItemMeta {
  if (it.basis === "cash") return { source: "Your own amount", confidence: "enter-your-own", enterYourOwn: true };
  const u = cat.unitPrices.find((x) => x.id === it.unitPriceId);
  if (!u) return { source: "Not in the catalogue", confidence: "unverified", enterYourOwn: false };
  const src = u.source.kind === "azure-retail-api" ? "Azure Retail Prices API" : u.source.kind === "derived" ? "Derived from the Retail API" : u.source.kind;
  return { source: src, confidence: u.confidence, enterYourOwn: false };
}
