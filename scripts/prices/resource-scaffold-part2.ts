/**
 * Catalogue part 2 (A4): messaging, network, security, monitoring, data and licences. Same system as part 1
 * (`resource-scaffold.ts`): this file writes the type skeletons and the Retail API rules, `pnpm prices:resources` writes the
 * prices. A SKU lists its meters and, for each, either a Retail API rule (`rule`), a reference to an existing unit price in
 * `unit-prices.json` (`ref`), a free tier (`free`) or a vendor-doc seat price (`vendor`).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Json = Record<string, any>;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const input = (id: string, label: string, unit: string, help: string) => ({ id, label, unit, help });
const meter = (id: string, label: string, quantityInput: string, hourly: boolean, scalesWithSize: boolean, factor?: number) =>
  ({ id, label, quantity: { input: quantityInput, ...(factor ? { factor } : {}) }, hourly, scalesWithSize });

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Exact, anchored pattern for a Retail API name. */
const rx = (s: string) => `^${esc(s)}$`;

interface VendorSeat { usd: number; url: string; note: string }
/** Vendor-doc prices (no Retail API row) that the scaffold writes itself: USD list price times the measured FX rate. */
const VENDOR: Json[] = [];
const TODAY = new Date().toISOString().slice(0, 10);
const FX: number = JSON.parse(readFileSync(join(ROOT, "packages/catalog/data/meta.json"), "utf8")).fx.usdToCad;

type Entry = { rule: Json } | { ref: string } | { free: string; unit?: string } | { vendor: VendorSeat; unit: string };
const rule = (r: Json): Entry => ({ rule: r });
const ref = (id: string): Entry => ({ ref: id });
const free = (why: string, unit?: string): Entry => ({ free: why, ...(unit ? { unit } : {}) });
const vendor = (usd: number, url: string, note: string, unit: string): Entry => ({ vendor: { usd, url, note }, unit });

function sku(typeId: string, id: string, label: string, entries: Record<string, Entry>, attrs: Json = {}, extra: Json = {}): Json {
  const prices: Json = {};
  const retail: Json = {};
  for (const [m, e] of Object.entries(entries)) {
    const priceId = "ref" in e ? e.ref : `${typeId}-${id}-${m}`;
    prices[m] = priceId;
    if ("rule" in e) retail[m] = e.rule;
    else if ("free" in e) retail[m] = { free: e.free, ...(e.unit ? { unit: e.unit } : {}) };
    else if ("vendor" in e) {
      VENDOR.push({
        id: priceId, label: `${label} · ${m}`, platform: "azure", unit: e.unit, price: Number((e.vendor.usd * FX).toFixed(4)), attrs: { usdList: e.vendor.usd },
        source: { kind: "vendor-doc", url: e.vendor.url, note: `${e.vendor.note}; USD ${e.vendor.usd} x ${FX} (USD list price, unverified: not a Retail API meter, excludes tax and agreements)`, retrievedAt: TODAY },
        confidence: "unverified",
      });
    }
  }
  return { id, label, attrs, ...extra, prices, ...(Object.keys(retail).length ? { retail } : {}) };
}

interface TypeSpec {
  id: string; label: string; category: string; docs: string; note: string; inputs: Json[]; meters: Json[]; options?: string[];
  filter?: string; precise?: boolean; regionOverride?: string; regionNote?: string; skus: Json[];
}
function type(t: TypeSpec): Json {
  return {
    id: t.id, label: t.label, category: t.category, docsUrl: t.docs, note: t.note, inputs: t.inputs, meters: t.meters, options: t.options ?? ["payg"],
    ...(t.filter ? { retail: { filter: t.filter, productName: ".", ...(t.precise ? { precise: true } : {}), ...(t.regionOverride ? { regionOverride: t.regionOverride, regionNote: t.regionNote } : {}), meters: {} } } : {}),
    skus: t.skus,
  };
}

const svc = (name: string, global = false) =>
  `serviceName eq '${name}' and ${global ? "(armRegionName eq '{region}' or armRegionName eq 'Global')" : "armRegionName eq '{region}'"}`;
/** A meter rule on one product: exact meter name, optional product and tier. */
const m = (meterName: string, product?: string, extra: Json = {}): Json => ({ meterName: rx(meterName), ...(product ? { productName: rx(product) } : {}), ...extra });

// ---------------------------------------------------------------- messaging

function messaging(): Json[] {
  const T = "service-bus";
  const SB = "Service Bus";
  const serviceBus = type({
    id: T, label: "Service Bus namespace", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/service-bus/",
    note: "Basic (operations), Standard (base charge plus operations beyond the 13M included) and Premium (messaging units). Operations use the first paid volume tier, so the cheaper tiers above 100M operations are not applied. Brokered connections, geo-replication, Hybrid Connections and WCF Relay are not included.",
    inputs: [input("namespaces", "Namespaces", "namespaces", "Standard namespaces billed the monthly base charge."), input("opsM", "Operations", "million operations", "Messaging operations a month, in millions. Standard includes the first 13 million."), input("mus", "Messaging units", "units", "Premium messaging units, billed per hour.")],
    meters: [meter("base", "Base charge", "namespaces", false, false), meter("ops", "Operations", "opsM", false, false), meter("mu", "Messaging units", "mus", true, true)],
    filter: svc(SB),
    skus: [
      sku(T, "basic", "Basic (pay per operation)", { base: free("Basic has no base charge."), ops: rule(m("Basic Messaging Operations", SB, { skuName: "^Basic$" })), mu: free("Messaging units apply to Premium only.") }),
      sku(T, "standard", "Standard (base charge plus operations)", { base: rule(m("Standard Base Unit", SB, { uom: "^1/Month$" })), ops: rule(m("Standard Messaging Operations", SB, { tier: "paid" })), mu: free("Messaging units apply to Premium only.") }),
      sku(T, "premium", "Premium (per messaging unit)", { base: free("Premium is billed per messaging unit."), ops: free("Operations are included in Premium."), mu: rule(m("Premium Messaging Unit", SB)) }),
    ],
  });

  const EG = "event-grid";
  const eventGrid = type({
    id: EG, label: "Event Grid", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/event-grid/",
    note: "Event Grid Standard operations (the first 100,000 a month are free; this prices the paid tier), MQTT operations and namespace throughput units. Custom topics and domains use the same operation price.",
    inputs: [input("opsM", "Event operations", "million operations", "Publish, delivery and management operations a month, in millions."), input("mqttM", "MQTT operations", "million operations", "MQTT publish and delivery operations a month, in millions."), input("tus", "Throughput units", "units", "Namespace throughput units, billed per hour.")],
    meters: [meter("ops", "Event operations", "opsM", false, false), meter("mqtt", "MQTT operations", "mqttM", false, false), meter("tu", "Throughput units", "tus", true, true)],
    filter: svc("Event Grid"),
    skus: [sku(EG, "standard", "Standard", { ops: rule(m("Standard Event Operations", undefined, { tier: "paid" })), mqtt: rule(m("Standard MQTT Operations", undefined, { tier: "paid" })), tu: rule(m("Standard Throughput Unit")) })],
  });

  const EH = "event-hubs";
  const hubs = type({
    id: EH, label: "Event Hubs", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/event-hubs/",
    note: "Throughput units (Basic, Standard), processing units (Premium) or capacity units (Dedicated) per hour, plus ingress events on Basic and Standard. Capture, the Kafka endpoint, extended retention and geo-replication are not included.",
    inputs: [input("units", "Units", "units", "Throughput, processing or capacity units, billed per hour."), input("ingressM", "Ingress events", "million events", "Events received a month, in millions (Basic and Standard).")],
    meters: [meter("units", "Units", "units", true, true), meter("ingress", "Ingress events", "ingressM", false, false)],
    filter: svc("Event Hubs"),
    skus: [
      sku(EH, "basic", "Basic (throughput units)", { units: rule(m("Basic Throughput Unit")), ingress: rule(m("Basic Ingress Events")) }),
      sku(EH, "standard", "Standard (throughput units)", { units: rule(m("Standard Throughput Unit")), ingress: rule(m("Standard Ingress Events")) }),
      sku(EH, "premium", "Premium (processing units)", { units: rule(m("Premium Processing Unit")), ingress: free("Ingress is included in Premium.") }),
      sku(EH, "dedicated", "Dedicated (capacity units)", { units: rule(m("Dedicated Capacity Unit")), ingress: free("Ingress is included in Dedicated.") }),
    ],
  });

  const LA = "logic-apps-consumption";
  const logicConsumption = type({
    id: LA, label: "Logic Apps, Consumption", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/logic-apps/",
    note: "Pay per action: built-in, standard connector and enterprise connector actions. Data retention, integration accounts and the Integration Service Environment are not included.",
    inputs: [input("builtinK", "Built-in actions", "thousand actions", "Built-in actions (HTTP, control flow) a month, in thousands."), input("standardK", "Standard connector actions", "thousand actions", "Standard connector actions a month, in thousands."), input("enterpriseK", "Enterprise connector actions", "thousand actions", "Enterprise connector actions a month, in thousands.")],
    meters: [meter("builtin", "Built-in actions", "builtinK", false, false, 1000), meter("standard", "Standard connector actions", "standardK", false, false, 1000), meter("enterprise", "Enterprise connector actions", "enterpriseK", false, false, 1000)],
    filter: svc("Logic Apps"), precise: true,
    skus: [sku(LA, "pay-per-action", "Consumption (pay per action)", {
      builtin: rule(m("Consumption Built-in Actions", "Logic Apps", { tier: "paid", unit: "action" })),
      standard: rule(m("Consumption Standard Connector Actions", "Logic Apps", { unit: "action" })),
      enterprise: rule(m("Consumption Enterprise Connector Actions", "Logic Apps", { unit: "action" })),
    })],
  });

  const LS = "logic-apps-standard";
  const logicStandard = type({
    id: LS, label: "Logic Apps, Standard (workflow plan)", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/logic-apps/",
    note: "Workflow Standard plan instances: vCPU and memory per hour. Storage, networking and connector charges outside the plan are not included.",
    inputs: [input("instances", "Instances", "instances", "Workflow plan instances running all month.")],
    meters: [meter("compute", "Compute", "instances", true, true)],
    filter: svc("Logic Apps"),
    skus: ([["ws1", "WS1", 1, 3.5], ["ws2", "WS2", 2, 7], ["ws3", "WS3", 4, 14]] as [string, string, number, number][]).map(([id, label, vcpu, mem]) =>
      sku(LS, id, `${label} (${vcpu} vCPU, ${mem} GiB)`, { compute: rule({ productName: rx("Logic Apps"), parts: [{ meterName: rx("Standard vCPU Duration"), factorAttr: "vcpu" }, { meterName: rx("Standard Memory Duration"), factorAttr: "memoryGiB" }], unit: "instance-month (730 h)" }) }, { vcpu, memoryGiB: mem })),
  });

  const APIM = "apim-gateway";
  const API = "API Management";
  const apim = type({
    id: APIM, label: "API Management (tiers billed per unit)", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/api-management/",
    note: "Gateway units per hour for Developer, Basic, Standard, Premium and the v2 tiers. Developer, Basic v2, Standard v2 and Premium (classic) use the prices in Prices & sources (the `apim-*` entries). Calls beyond the included amount on v2 tiers, secondary units, workspaces and self-hosted gateways are not included. Consumption is its own resource type.",
    inputs: [input("units", "Units", "units", "Gateway units, billed per hour.")],
    meters: [meter("units", "Units", "units", true, true)],
    filter: svc(API),
    skus: [
      sku(APIM, "developer", "Developer", { units: ref("apim-developer") }),
      sku(APIM, "basic", "Basic (classic)", { units: rule(m("Basic Unit", API, { skuName: "^Basic$", unit: "unit-month (730 h)" })) }),
      sku(APIM, "standard", "Standard (classic)", { units: rule(m("Standard Unit", API, { skuName: "^Standard$", unit: "unit-month (730 h)" })) }),
      sku(APIM, "premium", "Premium (classic)", { units: ref("apim-premium") }),
      sku(APIM, "basic-v2", "Basic v2", { units: ref("apim-basic-v2") }),
      sku(APIM, "standard-v2", "Standard v2", { units: ref("apim-standard-v2") }),
      sku(APIM, "premium-v2", "Premium v2", { units: rule(m("Premium v2 Unit", API, { skuName: "^Premium v2$", unit: "unit-month (730 h)" })) }),
    ],
  });
  const apimConsumption = type({
    id: "apim-consumption", label: "API Management, Consumption", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/api-management/",
    note: "Pay per call. Uses the `apim-consumption-calls` price, which is the first paid tier (after 1 million free calls).",
    inputs: [input("calls10k", "Calls", "10K calls", "API calls a month, in tens of thousands.")],
    meters: [meter("calls", "Calls", "calls10k", false, false)],
    skus: [sku("apim-consumption", "consumption", "Consumption (pay per call)", { calls: ref("apim-consumption-calls") })],
  });

  const RL = "relay";
  const relay = type({
    id: RL, label: "Azure Relay (Hybrid Connections)", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/service-bus/",
    note: "Hybrid Connections listeners per hour and data above the included 5 GB. WCF Relay is a legacy offer and is not included.",
    inputs: [input("listeners", "Listeners", "listeners", "Hybrid Connections listeners, billed per hour."), input("dataGB", "Data transferred", "GB", "Data sent through the relay a month.")],
    meters: [meter("listeners", "Listeners", "listeners", true, true), meter("data", "Data transfer", "dataGB", false, false)],
    filter: svc(SB),
    skus: [sku(RL, "hybrid-connections", "Hybrid Connections", { listeners: rule(m("Hybrid Connections Listener Unit", SB)), data: rule(m("Hybrid Connections Data Transfer", SB, { tier: "paid" })) })],
  });

  const NH = "notification-hubs";
  const NHP = "Notification Hubs";
  const notif = type({
    id: NH, label: "Notification Hubs", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/notification-hubs/",
    note: "Namespace charge and pushes beyond the included amount (first paid volume tier). The Availability Zones and Private Link options are not included.",
    inputs: [input("namespaces", "Namespaces", "namespaces", "Namespaces billed the monthly charge."), input("pushesM", "Pushes", "million pushes", "Pushes a month, in millions.")],
    meters: [meter("unit", "Namespace", "namespaces", false, false), meter("pushes", "Pushes", "pushesM", false, false)],
    filter: svc(NHP),
    skus: [
      sku(NH, "free", "Free", { unit: free("The Free tier has no charge."), pushes: free("The Free tier includes 1 million pushes.") }),
      sku(NH, "basic", "Basic", { unit: rule(m("Basic Unit", NHP)), pushes: rule(m("Basic Pushes", NHP, { tier: "paid" })) }),
      sku(NH, "standard", "Standard", { unit: rule(m("Standard Unit", NHP, { skuName: "^Standard$" })), pushes: rule(m("Standard Pushes", NHP, { tier: "paid" })) }),
    ],
  });

  const ADF = "Azure Data Factory v2";
  const df = (id: string, label: string, product: string, runs: string, move: string, act: string) => sku("data-factory", id, label, {
    runs: rule(m(runs, ADF, { unit: "1K runs" })), movement: rule(m(move, ADF, { usage: true })), activity: rule(m(act, ADF, { usage: true })),
  });
  const adf = type({
    id: "data-factory", label: "Data Factory pipelines (v2)", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/data-factory/data-pipeline/",
    note: "Orchestration activity runs, data movement (DIU-hours) and pipeline activity hours by integration runtime. Read and write operations, monitoring operations, inactive pipelines, SSIS and mapping data flows (separate type) are not included.",
    inputs: [input("runsK", "Activity runs", "thousand runs", "Orchestration activity runs a month, in thousands."), input("diuHours", "Data movement", "DIU-hours", "Data movement a month, in data integration unit-hours."), input("activityHours", "Pipeline activity", "hours", "External and pipeline activity execution hours a month.")],
    meters: [meter("runs", "Orchestration activity runs", "runsK", false, false), meter("movement", "Data movement", "diuHours", false, false), meter("activity", "Pipeline activity", "activityHours", false, false)],
    filter: svc(ADF),
    skus: [
      df("azure-ir", "Azure integration runtime", ADF, "Cloud Orchestration Activity Run", "Cloud Data Movement", "Cloud Pipeline Activity"),
      df("managed-vnet-ir", "Azure managed VNet integration runtime", ADF, "Azure Managed VNET Orchestration Activity Run", "Azure Managed VNET Data Movement", "Azure Managed VNET Pipeline Activity"),
      df("self-hosted-ir", "Self-hosted integration runtime", ADF, "Self Hosted Orchestration Activity Run", "Self Hosted Data Movement", "Self Hosted Pipeline Activity"),
    ],
  });
  const flows = type({
    id: "data-factory-dataflow", label: "Data Factory mapping data flows", category: "messaging", docs: "https://azure.microsoft.com/pricing/details/data-factory/data-pipeline/",
    note: "vCore-hours of data flow cluster time. Reserved capacity (1 and 3 years) exists for General Purpose and Compute Optimized and is not priced here.",
    inputs: [input("vcoreHours", "Cluster time", "vCore-hours", "Data flow compute a month, in vCore-hours (cores x hours the cluster runs).")],
    meters: [meter("vcore", "Compute", "vcoreHours", false, false)],
    filter: svc(ADF),
    skus: [["general-purpose", "General Purpose"], ["compute-optimized", "Compute Optimized"], ["memory-optimized", "Memory Optimized"]].map(([id, label]) =>
      sku("data-factory-dataflow", id!, label!, { vcore: rule({ productName: rx(`Azure Data Factory v2 Data Flow - ${label}`), meterName: rx("vCore"), usage: true }) })),
  });
  return [serviceBus, eventGrid, hubs, logicConsumption, logicStandard, apim, apimConsumption, relay, notif, adf, flows];
}

// ---------------------------------------------------------------- network

function network(): Json[] {
  const VN = svc("Virtual Network", true);
  const peering = type({
    id: "vnet-peering", label: "Virtual network peering", category: "network", docs: "https://azure.microsoft.com/pricing/details/virtual-network/",
    note: "Data in and out through the peering, per GB. Inter-region peering is priced for the catalogue region's zone; other zones differ.",
    inputs: [input("inGB", "Inbound data", "GB", "Data received over the peering a month."), input("outGB", "Outbound data", "GB", "Data sent over the peering a month.")],
    meters: [meter("in", "Inbound", "inGB", false, false), meter("out", "Outbound", "outGB", false, false)], filter: VN,
    skus: [
      sku("vnet-peering", "intra-region", "Same region", { in: rule(m("Intra-Region Ingress", "Virtual Network Peering")), out: rule(m("Intra-Region Egress", "Virtual Network Peering")) }),
      sku("vnet-peering", "inter-region", "Between regions (global peering)", { in: rule(m("Inter-Region Ingress", "Global Virtual Network Peering")), out: rule(m("Inter-Region Egress", "Global Virtual Network Peering")) }),
    ],
  });
  const PL = "Virtual Network Private Link";
  const pe = type({
    id: "private-endpoint", label: "Private endpoint", category: "network", docs: "https://azure.microsoft.com/pricing/details/private-link/",
    note: "Endpoint hours and data processed in each direction (first volume tier). Private Link service and fixed-bandwidth endpoints are not included.",
    inputs: [input("endpoints", "Endpoints", "endpoints", "Private endpoints, billed per hour."), input("inGB", "Inbound data", "GB", "Data processed inbound a month."), input("outGB", "Outbound data", "GB", "Data processed outbound a month.")],
    meters: [meter("endpoint", "Endpoints", "endpoints", true, true), meter("in", "Data processed, inbound", "inGB", false, false), meter("out", "Data processed, outbound", "outGB", false, false)], filter: VN,
    skus: [sku("private-endpoint", "standard", "Standard", { endpoint: rule(m("Standard Private Endpoint", PL)), in: rule(m("Standard Data Processed - Ingress", PL, { tier: 0 })), out: rule(m("Standard Data Processed - Egress", PL, { tier: 0 })) })],
  });
  const nat = type({
    id: "nat-gateway", label: "NAT gateway", category: "network", docs: "https://azure.microsoft.com/pricing/details/azure-nat-gateway/",
    note: "Gateway hours and data processed. The public IPs it uses are separate resources.",
    inputs: [input("gateways", "Gateways", "gateways", "NAT gateways, billed per hour."), input("dataGB", "Data processed", "GB", "Data processed a month.")],
    meters: [meter("gateway", "Gateway", "gateways", true, true), meter("data", "Data processed", "dataGB", false, false)], filter: svc("NAT Gateway", true),
    skus: [sku("nat-gateway", "standard", "Standard", { gateway: rule(m("Standard Gateway", "NAT Gateway")), data: rule(m("Standard Data Processed", "NAT Gateway")) })],
  });
  const IP = "IP Addresses";
  const pip = type({
    id: "public-ip", label: "Public IP address", category: "network", docs: "https://azure.microsoft.com/pricing/details/ip-addresses/",
    note: "IPv4 addresses billed per hour. Public IP prefixes are not included.",
    inputs: [input("ips", "Addresses", "addresses", "Public IP addresses.")], meters: [meter("ip", "Address", "ips", true, true)], filter: VN,
    skus: [
      sku("public-ip", "standard-static", "Standard, static IPv4", { ip: rule(m("Standard IPv4 Static Public IP", IP)) }),
      sku("public-ip", "basic-static", "Basic, static IPv4", { ip: rule(m("Basic IPv4 Static Public IP", IP)) }),
      sku("public-ip", "basic-dynamic", "Basic, dynamic IPv4", { ip: rule(m("Basic IPv4 Dynamic Public IP", IP)) }),
      sku("public-ip", "global-static", "Global, static IPv4", { ip: rule(m("Global IPv4 Static Public IP", IP)) }),
    ],
  });

  const AG = "app-gateway";
  const ag = (id: string, label: string, product: string, prefix: string) => sku(AG, id, label, { fixed: rule(m(`${prefix} Fixed Cost`, product)), cu: rule(m(`${prefix} Capacity Units`, product)) });
  const appGw = type({
    id: AG, label: "Application Gateway v2", category: "network", docs: "https://azure.microsoft.com/pricing/details/application-gateway/",
    note: "The fixed hourly charge plus capacity units (enter the average number running). v1 gateways, Application Gateway for Containers and the discounted WAF policy rate are not included.",
    inputs: [input("gateways", "Gateways", "gateways", "Gateways billed the fixed charge."), input("cus", "Capacity units", "capacity units", "Average capacity units in use across the month.")],
    meters: [meter("fixed", "Fixed charge", "gateways", true, true), meter("cu", "Capacity units", "cus", true, true)], filter: svc("Application Gateway"),
    skus: [ag("standard-v2", "Standard v2", "Application Gateway Standard v2", "Standard"), ag("waf-v2", "WAF v2", "Application Gateway WAF v2", "Standard"), ag("basic-v2", "Basic v2", "Application Gateway Basic v2", "Basic")],
  });

  const FD = "Azure Front Door";
  const fdSku = (id: string, label: string, p: string) => sku("front-door", id, label, {
    base: rule(m(`${p} Base Fees`, FD)), requests: rule(m(`${p} Requests`, FD, { tier: 0, uom: "^10K$" })), out: rule(m(`${p} Data Transfer Out`, FD, { tier: 0 })),
  });
  const frontDoor = type({
    id: "front-door", label: "Front Door Standard and Premium", category: "network", docs: "https://azure.microsoft.com/pricing/details/frontdoor/",
    note: "Base fee, requests and edge-to-client data transfer, first volume tier. Billed by zone: this uses Zone 1 (North America and Europe). Custom domains, WAF policies and rules, origin transfer and the classic tiers are not included.",
    inputs: [input("profiles", "Profiles", "profiles", "Front Door profiles billed the base fee."), input("requests10k", "Requests", "10K requests", "Requests a month, in tens of thousands."), input("outGB", "Data transfer out", "GB", "Data sent from the edge to clients a month.")],
    meters: [meter("base", "Base fee", "profiles", false, false), meter("requests", "Requests", "requests10k", false, false), meter("out", "Data transfer out", "outGB", false, false)],
    filter: svc("Azure Front Door Service"), regionOverride: "Zone 1", regionNote: "Front Door is billed by zone; the Retail API lists Zone 1 (North America and Europe) rather than a region.",
    skus: [fdSku("standard", "Standard", "Standard"), fdSku("premium", "Premium", "Premium")],
  });

  const LB = "Load Balancer";
  const lb = type({
    id: "load-balancer", label: "Load Balancer", category: "network", docs: "https://azure.microsoft.com/pricing/details/load-balancer/",
    note: "Standard and Global: the charge that covers the first five rules, rules beyond five, and data processed. Gateway Load Balancer and the free Basic tier are not included.",
    inputs: [input("balancers", "Load balancers", "load balancers", "Load balancers billed the base charge (includes five rules)."), input("extraRules", "Extra rules", "rules", "Load-balancing and outbound rules beyond the first five, across all balancers."), input("dataGB", "Data processed", "GB", "Data processed a month.")],
    meters: [meter("base", "Base charge", "balancers", true, true), meter("rules", "Extra rules", "extraRules", true, true), meter("data", "Data processed", "dataGB", false, false)], filter: svc(LB, true),
    skus: [
      sku("load-balancer", "standard", "Standard", { base: rule(m("Standard Included LB Rules and Outbound Rules", LB)), rules: rule(m("Standard Overage LB Rules and Outbound Rules", LB)), data: rule(m("Standard Data Processed", LB)) }),
      sku("load-balancer", "global", "Global (cross-region)", { base: rule(m("Global Included LB Rules and Outbound Rules", LB)), rules: rule(m("Global Overage LB Rules and Outbound Rules", LB)), data: free("The Retail API lists Global data processed at 0.") }),
    ],
  });

  const vpnNames: [string, string][] = [["basic", "Basic"], ...[1, 2, 3, 4, 5].flatMap((n) => [[`vpngw${n}`, `VpnGw${n}`], [`vpngw${n}az`, `VpnGw${n}AZ`]] as [string, string][])];
  const vpn = type({
    id: "vpn-gateway", label: "VPN Gateway", category: "network", docs: "https://azure.microsoft.com/pricing/details/vpn-gateway/",
    note: "Gateway hours. Site-to-site and point-to-site connections beyond those included, and the advanced connectivity add-on, are not included.",
    inputs: [input("gateways", "Gateways", "gateways", "VPN gateways, billed per hour.")], meters: [meter("gateway", "Gateway", "gateways", true, true)], filter: svc("VPN Gateway"),
    skus: vpnNames.map(([id, name]) => sku("vpn-gateway", id, name === "Basic" ? "Basic" : name, { gateway: rule(m(name === "Basic" ? "Basic Gateway" : name, "VPN Gateway", { skuName: rx(name) })) })),
  });

  const ER = "ExpressRoute";
  const erGw = type({
    id: "expressroute-gateway", label: "ExpressRoute gateway", category: "network", docs: "https://azure.microsoft.com/pricing/details/vpn-gateway/",
    note: "Virtual network gateway hours. ErGwScale is priced per scale unit (at least two).",
    inputs: [input("gateways", "Gateways or scale units", "units", "Gateways, or ErGwScale scale units, billed per hour.")], meters: [meter("gateway", "Gateway", "gateways", true, true)], filter: svc(ER),
    skus: [
      sku("expressroute-gateway", "standard", "Standard", { gateway: rule(m("Standard Gateway", "ExpressRoute Standard Gateway")) }),
      sku("expressroute-gateway", "high-performance", "High Performance", { gateway: rule(m("High Performance Gateway", "ExpressRoute High Performance Gateway")) }),
      sku("expressroute-gateway", "ultra-performance", "Ultra Performance", { gateway: rule(m("Ultra High Performance Gateway", "ExpressRoute Ultra High Performance Gateway")) }),
      sku("expressroute-gateway", "ergw1az", "ErGw1AZ", { gateway: rule(m("ErGw1AZ Gateway", "ExpressRoute Gateway")) }),
      sku("expressroute-gateway", "ergw2az", "ErGw2AZ", { gateway: rule(m("ErGw2AZ Gateway", "ExpressRoute Gateway")) }),
      sku("expressroute-gateway", "ergw3az", "ErGw3AZ", { gateway: rule(m("ErGw3AZ Gateway", "ExpressRoute Gateway")) }),
      sku("expressroute-gateway", "ergwscale", "ErGwScale (per scale unit)", { gateway: rule(m("ErGwScale Unit", "ExpressRoute Gateway")) }),
    ],
  });
  const BW: [string, string][] = [["50 Mbps", "50 Mbps"], ["100 Mbps", "100 Mbps"], ["200 Mbps", "200 Mbps"], ["500 Mbps", "500 Mbps"], ["1 Gbps", "1 Gbps"], ["2 Gbps", "2 Gbps"], ["5 Gbps", "5 Gbps"], ["10 Gbps", "10 Gbps"]];
  const circuits: Json[] = [];
  for (const tier of ["Standard", "Premium"]) for (const model of ["Metered", "Unlimited"]) for (const [bw, label] of BW) {
    const id = `${tier.toLowerCase()}-${model.toLowerCase()}-${bw.toLowerCase().replace(/ /g, "")}`;
    circuits.push(sku("expressroute-circuit", id, `${tier}, ${model.toLowerCase()} data, ${label}`, { circuit: rule({ meterName: rx(`${tier} ${model} Data ${bw} Circuit`), productName: rx(ER), skuName: rx(`${bw} ${model} Data`) }) }));
  }
  const erCircuit = type({
    id: "expressroute-circuit", label: "ExpressRoute circuit", category: "network", docs: "https://azure.microsoft.com/pricing/details/expressroute/",
    note: "The monthly circuit fee by bandwidth and plan. Metered plans also bill outbound data per GB, which is not included; the unlimited plan has no data charge. Billed by zone: this uses Zone 1. ExpressRoute Direct, Global Reach and the gateway (separate type) are not included.",
    inputs: [input("circuits", "Circuits", "circuits", "ExpressRoute circuits.")], meters: [meter("circuit", "Circuit", "circuits", false, false)],
    filter: svc(ER), regionOverride: "Zone 1", regionNote: "ExpressRoute circuits are billed by zone; the Retail API lists Zone 1 (North America and Europe) rather than a region.", skus: circuits,
  });

  const FW = "Azure Firewall";
  const firewall = type({
    id: "azure-firewall", label: "Azure Firewall", category: "network", docs: "https://azure.microsoft.com/pricing/details/azure-firewall/",
    note: "Deployment hours and data processed for Basic, Standard and Premium. Secured virtual hub deployments and capacity units are not included.",
    inputs: [input("firewalls", "Firewalls", "firewalls", "Firewall deployments, billed per hour."), input("dataGB", "Data processed", "GB", "Data processed a month.")],
    meters: [meter("deployment", "Deployment", "firewalls", true, true), meter("data", "Data processed", "dataGB", false, false)], filter: svc(FW),
    skus: ["Basic", "Standard", "Premium"].map((t) => sku("azure-firewall", t.toLowerCase(), t, { deployment: rule(m(`${t} Deployment`, FW)), data: rule(m(`${t} Data Processed`, FW)) })),
  });

  const BA = "Azure Bastion";
  const bastion = type({
    id: "bastion", label: "Azure Bastion", category: "network", docs: "https://azure.microsoft.com/pricing/details/azure-bastion/",
    note: "Host hours and additional scale-out instances. Outbound data transfer is billed as internet egress.",
    inputs: [input("hosts", "Bastion hosts", "hosts", "Bastion hosts, billed per hour."), input("extra", "Additional instances", "instances", "Scale-out instances beyond the two included, billed per hour.")],
    meters: [meter("host", "Host", "hosts", true, true), meter("extra", "Additional instances", "extra", true, true)], filter: svc(BA),
    skus: [
      sku("bastion", "basic", "Basic", { host: rule(m("Basic Gateway", BA)), extra: free("Basic does not scale beyond two instances.") }),
      sku("bastion", "standard", "Standard", { host: rule(m("Standard Gateway", BA)), extra: rule(m("Standard Additional Gateway", BA)) }),
      sku("bastion", "premium", "Premium", { host: rule(m("Premium Gateway", BA)), extra: rule(m("Premium Additional Gateway", BA)) }),
    ],
  });

  const DDOS_URL = "https://azure.microsoft.com/pricing/details/ddos-protection/";
  const ddos = type({
    id: "ddos-ip-protection", label: "DDoS IP Protection", category: "network", docs: DDOS_URL,
    note: "Per protected public IP address. The Retail API has no DDoS meter and the Network Protection price (which covers 100 IPs) was not published in the page text, so only IP Protection is listed. Vendor price, not verified against a meter.",
    inputs: [input("ips", "Protected IPs", "addresses", "Public IP addresses with DDoS IP Protection.")], meters: [meter("ip", "Protected IP", "ips", false, false)],
    skus: [sku("ddos-ip-protection", "ip-protection", "DDoS IP Protection", { ip: vendor(199, DDOS_URL, "Azure DDoS Protection pricing page, IP Protection USD 199 per public IP a month, fetched " + TODAY, "IP-month") })],
  });

  const DNSN = "Azure DNS";
  const dns = type({
    id: "azure-dns", label: "Azure DNS", category: "network", docs: "https://azure.microsoft.com/pricing/details/dns/",
    note: "Hosted zones (first 25 zones; the lower rate beyond is not applied) and queries (first billion). Record sets and Private Resolver endpoints are not included. Billed by zone: this uses Zone 1.",
    inputs: [input("zones", "Zones", "zones", "Hosted DNS zones."), input("queriesM", "Queries", "million queries", "DNS queries a month, in millions.")],
    meters: [meter("zones", "Zones", "zones", false, false), meter("queries", "Queries", "queriesM", false, false)],
    filter: svc(DNSN), regionOverride: "Zone 1", regionNote: "Azure DNS is billed by zone; the Retail API lists Zone 1 rather than a region.",
    skus: [
      sku("azure-dns", "public", "Public DNS", { zones: rule(m("Public Zone", DNSN, { tier: 0, unit: "zone-month" })), queries: rule(m("Public Queries", DNSN, { tier: 0 })) }),
      sku("azure-dns", "private", "Private DNS", { zones: rule(m("Private Zone", DNSN, { tier: 0, unit: "zone-month" })), queries: rule(m("Private Queries", DNSN, { tier: 0 })) }),
    ],
  });

  const BWN = "Bandwidth";
  const eg = (id: string, label: string, product: string, tier: number, extra: Json = {}) => sku("internet-egress", id, label, { out: rule({ meterName: rx("Standard Data Transfer Out"), productName: rx(product), tier, ...extra }) });
  const egress = type({
    id: "internet-egress", label: "Data transfer out (internet and between regions)", category: "network", docs: "https://azure.microsoft.com/pricing/details/bandwidth/",
    note: "Outbound data per GB. The Microsoft global network tiers are volume bands: pick the band that matches the month's total (the first 100 GB are free and the band above 100 GB is the `egress-gb` price). Inbound data is free. Continent-specific rates differ.",
    inputs: [input("outGB", "Data out", "GB", "Data sent out a month, within the chosen band.")], meters: [meter("out", "Data out", "outGB", false, false)], filter: svc(BWN),
    skus: [
      sku("internet-egress", "mgn-100gb-10tb", "Microsoft global network, 100 GB to 10 TB", { out: ref("egress-gb") }),
      eg("mgn-10-50tb", "Microsoft global network, 10 to 50 TB", "Rtn Preference: MGN", 10335), eg("mgn-50-150tb", "Microsoft global network, 50 to 150 TB", "Rtn Preference: MGN", 51295),
      eg("mgn-150-500tb", "Microsoft global network, 150 to 500 TB", "Rtn Preference: MGN", 153695), eg("mgn-over-500tb", "Microsoft global network, over 500 TB", "Rtn Preference: MGN", 512095),
      eg("internet-100gb-10tb", "Routing preference Internet, 100 GB to 10 TB", "Bandwidth - Routing Preference: Internet", 100), eg("internet-10-50tb", "Routing preference Internet, 10 to 50 TB", "Bandwidth - Routing Preference: Internet", 10100),
      eg("internet-50-150tb", "Routing preference Internet, 50 to 150 TB", "Bandwidth - Routing Preference: Internet", 50100), eg("internet-over-150tb", "Routing preference Internet, over 150 TB", "Bandwidth - Routing Preference: Internet", 150100),
      sku("internet-egress", "inter-region", "Between regions (same continent)", { out: rule({ meterName: rx("Standard Inter-Region Data Transfer"), productName: rx("Rtn Preference: MGN"), tier: 0 }) }),
      sku("internet-egress", "inter-az-out", "Between availability zones, outbound", { out: rule({ meterName: rx("Standard Inter-Availability Zone Data Transfer Out"), productName: rx("Rtn Preference: MGN"), tier: 0 }) }),
    ],
  });
  return [peering, pe, nat, pip, appGw, frontDoor, lb, vpn, erGw, erCircuit, firewall, bastion, ddos, dns, egress];
}

// ---------------------------------------------------------------- security

function security(): Json[] {
  const KV = "Key Vault";
  const kvSku = (id: string, label: string, tier: string, hsm: Entry) => sku("key-vault", id, label, { ops: ref("key-vault-ops"), advanced: rule(m("Advanced Key Operations", KV, { skuName: rx(tier) })), hsmkeys: hsm });
  const kv = type({
    id: "key-vault", label: "Key Vault", category: "security", docs: "https://azure.microsoft.com/pricing/details/key-vault/",
    note: "Operations (the `key-vault-ops` price), advanced key operations (RSA 3072/4096 and ECC) and HSM-protected RSA 2048 keys on Premium. Certificate renewals, automated rotation and the volume tiers for HSM advanced keys are not included.",
    inputs: [input("ops10k", "Operations", "10K operations", "Secret, certificate and key operations a month, in tens of thousands."), input("advanced10k", "Advanced key operations", "10K operations", "RSA 3072/4096 and ECC key operations a month, in tens of thousands."), input("hsmKeys", "HSM-protected keys", "keys", "RSA 2048 keys protected by an HSM (Premium).")],
    meters: [meter("ops", "Operations", "ops10k", false, false), meter("advanced", "Advanced key operations", "advanced10k", false, false), meter("hsmkeys", "HSM-protected keys", "hsmKeys", false, false)],
    filter: svc(KV),
    skus: [kvSku("standard", "Standard", "Standard", free("Standard vaults use software-protected keys, with no per-key charge.")), kvSku("premium", "Premium (HSM-backed keys)", "Premium", rule(m("Premium HSM-protected RSA 2048-bit key", KV, { skuName: "^Premium$" })))],
  });
  const hsm = type({
    id: "managed-hsm", label: "Managed HSM and dedicated HSM", category: "security", docs: "https://azure.microsoft.com/pricing/details/key-vault/",
    note: "Hourly pool or instance charge. Azure Managed HSM bills per pool; Dedicated HSM is the older single-tenant offer. Key and operation charges on Managed HSM are not included.",
    inputs: [input("pools", "Pools or instances", "units", "HSM pools or instances, billed per hour.")], meters: [meter("pool", "Pool", "pools", true, true)], filter: svc(KV),
    skus: [
      sku("managed-hsm", "managed-b1", "Managed HSM pool, Standard B1", { pool: rule(m("Standard B1 Instance", "Key Vault HSM Pool")) }),
      sku("managed-hsm", "dedicated", "Dedicated HSM instance", { pool: rule(m("Standard Instance", "Azure Dedicated HSM")) }),
    ],
  });

  const DEF = "serviceName eq 'Microsoft Defender for Cloud' and (armRegionName eq '{region}' or armRegionName eq 'Global')";
  const defHour = (id: string, label: string, product: string, meterName: string, unit: string) => sku("defender-plan", id, label, { units: rule(m(meterName, product, { unit })) }, {}, {});
  const defender = type({
    id: "defender-plan", label: "Defender for Cloud plan (billed by the hour)", category: "security", docs: "https://azure.microsoft.com/pricing/details/defender-for-cloud/",
    note: "Per protected unit per hour; the unit differs by plan (shown in the SKU name). App Service, Containers and Cosmos DB use the `defender-*` prices in Prices & sources. Defender for APIs, AI Services, DevOps, Key Vault, DNS and the pre-purchase plan are not included.",
    inputs: [input("units", "Protected units", "units", "Servers, instances, vCores, accounts or subscriptions, as the SKU says.")], meters: [meter("units", "Protected units", "units", true, true)], filter: DEF,
    skus: [
      defHour("servers-p1", "Servers Plan 1 (per server)", "Microsoft Defender for Servers", "Standard P1 Node", "server-month (730 h)"),
      defHour("servers-p2", "Servers Plan 2 (per server)", "Microsoft Defender for Servers", "Standard P2 Node", "server-month (730 h)"),
      defHour("sql-machines", "SQL servers on machines (per server)", "Microsoft Defender for SQL", "Standard Instance", "server-month (730 h)"),
      sku("defender-plan", "app-service", "App Service (per instance)", { units: ref("defender-app-service-node") }),
      sku("defender-plan", "containers", "Containers (per vCore)", { units: ref("defender-containers-vcore") }),
      sku("defender-plan", "cosmos-db", "Cosmos DB (per 100 RU/s)", { units: ref("defender-cosmos-100ru") }),
      defHour("storage", "Storage (per storage account)", "Microsoft Defender for Storage", "Standard Node", "account-month (730 h)"),
      defHour("resource-manager", "Resource Manager (per subscription)", "Microsoft Defender for Resource Manager", "Per node Std Node", "subscription-month (730 h)"),
      defHour("cspm", "Defender CSPM (per billable resource)", "Microsoft Defender CSPM", "Standard Node", "resource-month (730 h)"),
    ],
  });
  const defServer = type({
    id: "defender-database", label: "Defender for Cloud plan (per server, monthly)", category: "security", docs: "https://azure.microsoft.com/pricing/details/defender-for-cloud/",
    note: "Defender for Azure SQL Database servers and for open-source relational databases, per server per month.",
    inputs: [input("servers", "Servers", "servers", "Database servers protected.")], meters: [meter("servers", "Servers", "servers", false, false)], filter: DEF,
    skus: [
      sku("defender-database", "sql", "Azure SQL Database (per server)", { servers: rule(m("Standard Node", "Microsoft Defender for SQL", { uom: "^1/Month$" })) }),
      sku("defender-database", "postgresql", "PostgreSQL (per server)", { servers: rule(m("Standard Node", "Microsoft Defender for PostgreSQL")) }),
      sku("defender-database", "mysql", "MySQL (per server)", { servers: rule(m("Standard Node", "Microsoft Defender for MySQL")) }),
    ],
  });

  const SEN = "Sentinel";
  const commits = [100, 200, 300, 400, 500, 1000, 2000, 5000];
  const sentinel = type({
    id: "sentinel", label: "Microsoft Sentinel", category: "security", docs: "https://azure.microsoft.com/pricing/details/microsoft-sentinel/",
    note: "The Sentinel charge per GB ingested, pay-as-you-go or a daily commitment tier. Log Analytics ingestion and retention are billed separately (add a Log Analytics resource). Data beyond a commitment tier is billed at that tier's effective rate and is not modelled. The data lake, SAP solution and the free benefits are not included.",
    inputs: [input("gb", "Data ingested", "GB", "Data analysed by Sentinel a month, pay-as-you-go."), input("commitments", "Commitment tiers", "tiers", "Commitment tiers of the SKU's daily size.")],
    meters: [meter("gb", "Pay-as-you-go ingestion", "gb", false, false), meter("commit", "Commitment tier", "commitments", false, false)], filter: svc(SEN),
    skus: [
      sku("sentinel", "payg", "Pay-as-you-go", { gb: rule(m("Pay-as-you-go Analysis", SEN)), commit: free("No commitment tier on pay-as-you-go.") }),
      ...commits.map((g) => sku("sentinel", `commit-${g}`, `${g.toLocaleString("en-US")} GB a day commitment`, { gb: free("Ingestion up to the commitment is covered by the tier charge."), commit: rule(m(`${g} GB Commitment Tier Capacity Reservation`, SEN, { unit: "tier-month" })) })),
    ],
  });

  const ENTRA = "https://www.microsoft.com/security/business/microsoft-entra-pricing";
  const entra = type({
    id: "entra-id", label: "Microsoft Entra ID (per user)", category: "security", docs: ENTRA,
    note: "Per user per month, annual commitment, list price. Vendor price converted from USD, not a Retail API meter. Free and Microsoft 365 bundled editions are not listed.",
    inputs: [input("users", "Users", "users", "Licensed users.")], meters: [meter("users", "Users", "users", false, false)],
    skus: [
      sku("entra-id", "p1", "Entra ID P1", { users: vendor(7, ENTRA, "Microsoft Entra pricing page: P1 USD 7.00 user a month, paid yearly, fetched " + TODAY, "user-month") }),
      sku("entra-id", "p2", "Entra ID P2", { users: vendor(10, ENTRA, "Microsoft Entra pricing page: P2 USD 10.00 user a month, paid yearly, fetched " + TODAY, "user-month") }),
    ],
  });
  return [kv, hsm, defender, defServer, sentinel, entra];
}

// ---------------------------------------------------------------- monitoring

function monitoring(): Json[] {
  const AM = "Azure Monitor";
  const ingest = type({
    id: "log-analytics-ingestion", label: "Log Analytics ingestion", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/monitor/",
    note: "Analytics logs pay-as-you-go (the `log-analytics-ingest` price: first paid volume tier after the free 5 GB), basic logs, auxiliary logs, or a daily commitment tier. Retention beyond 31 days is its own type. Data beyond a commitment is billed at the tier's effective rate and is not modelled. Application Insights workspace-based data and Sentinel data are billed here too.",
    inputs: [input("gb", "Data ingested", "GB", "Data ingested a month at the SKU's rate."), input("commitments", "Commitment tiers", "tiers", "Commitment tiers of the SKU's daily size.")],
    meters: [meter("gb", "Ingestion", "gb", false, false), meter("commit", "Commitment tier", "commitments", false, false)], filter: svc(AM),
    skus: [
      sku("log-analytics-ingestion", "analytics-payg", "Analytics logs, pay-as-you-go", { gb: ref("log-analytics-ingest"), commit: free("No commitment tier on pay-as-you-go.") }),
      sku("log-analytics-ingestion", "basic-logs", "Basic logs", { gb: rule(m("Basic Logs Data Ingestion", AM, { skuName: "^Basic Logs$" })), commit: free("No commitment tier for basic logs.") }),
      sku("log-analytics-ingestion", "auxiliary-logs", "Auxiliary logs", { gb: rule(m("Auxiliary Logs Data Ingestion", AM, { skuName: "^Auxiliary Logs$" })), commit: free("No commitment tier for auxiliary logs.") }),
      ...[100, 200, 300, 400, 500, 1000, 2000, 5000].map((g) => sku("log-analytics-ingestion", `commit-${g}`, `${g.toLocaleString("en-US")} GB a day commitment`, { gb: free("Ingestion up to the commitment is covered by the tier charge."), commit: rule(m(`${g} GB Commitment Tier Capacity Reservation`, AM, { unit: "tier-month" })) })),
    ],
  });
  const retention = type({
    id: "log-analytics-retention", label: "Log Analytics retention and archive", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/monitor/",
    note: "Analytics logs kept beyond the 31 days included, and long-term archive. Search jobs, restores and data export are not included.",
    inputs: [input("gb", "Data retained", "GB", "Average GB held beyond the included retention.")], meters: [meter("gb", "Retained data", "gb", false, false)],
    filter: "(serviceName eq 'Log Analytics' or serviceName eq 'Azure Monitor') and armRegionName eq '{region}'",
    skus: [
      sku("log-analytics-retention", "interactive", "Interactive retention beyond 31 days", { gb: rule(m("Analytics Logs Data Retention", "Log Analytics", { unit: "GB-month" })) }),
      sku("log-analytics-retention", "archive", "Long-term archive", { gb: rule(m("Data Archive", AM, { unit: "GB-month" })) }),
    ],
  });
  const ai = type({
    id: "application-insights", label: "Application Insights (workspace-based)", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/monitor/",
    note: "Telemetry is ingested into a Log Analytics workspace and billed at the `log-analytics-ingest` price. Standard availability tests are priced per execution. Multi-step web tests and the classic Enterprise plan are not included.",
    inputs: [input("gb", "Telemetry ingested", "GB", "Telemetry ingested into the workspace a month."), input("testsK", "Availability test executions", "thousand executions", "Standard web test executions a month, in thousands.")],
    meters: [meter("ingest", "Telemetry ingestion", "gb", false, false), meter("tests", "Availability tests", "testsK", false, false, 1000)], filter: svc(AM), precise: true,
    skus: [sku("application-insights", "workspace-based", "Workspace-based (pay-as-you-go)", { ingest: ref("log-analytics-ingest"), tests: rule(m("Standard Web Test Execution", AM, { unit: "execution" })) })],
  });
  const alerts = type({
    id: "monitor-alerts", label: "Azure Monitor alert rules", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/monitor/",
    note: "Per monitored time series or per log alert rule per month. The first 10 metric time series are free; this prices the paid rate. Notifications (SMS, voice, email) and action groups are not included.",
    inputs: [input("rules", "Rules or time series", "rules", "Alert rules or monitored time series.")], meters: [meter("rules", "Rules", "rules", false, false)], filter: svc(AM),
    skus: [
      sku("monitor-alerts", "metric-timeseries", "Metric alert, per monitored time series", { rules: rule(m("Alerts Metric Monitored", AM, { tier: "paid", unit: "time series-month" })) }),
      sku("monitor-alerts", "dynamic-threshold", "Dynamic threshold, per time series", { rules: rule(m("Alerts Dynamic Threshold", AM, { unit: "time series-month" })) }),
      ...[["1", "1-minute"], ["5", "5-minute"], ["10", "10-minute"], ["15", "15-minute"]].map(([n, label]) => sku("monitor-alerts", `log-${n}min`, `Log alert rule, ${label} frequency`, { rules: rule(m(`Alerts Resource Monitored at ${n} Minute Frequency`, AM, { unit: "rule-month" })) })),
    ],
  });

  const AC = "App Configuration";
  const acSku = (id: string, label: string, tier: string, ops?: Json) => sku("app-configuration", id, label, {
    instances: rule(m(`${tier} Instance`, AC, { unit: "instance-month (30.4 days)" })),
    replicas: tier === "Developer" ? free("Developer has no replicas.") : rule(m(`${tier} Replica Instance`, AC, { unit: "replica-month (30.4 days)" })),
    ops: ops ? rule(ops) : free("Operations are included."),
  });
  const appConfig = type({
    id: "app-configuration", label: "App Configuration", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/app-configuration/",
    note: "Store charge by tier (billed per day), replicas, and operations beyond the included amount. Snapshots overage and experimentation events are not included.",
    inputs: [input("stores", "Stores", "stores", "App Configuration stores."), input("replicas", "Replicas", "replicas", "Replicas across all stores."), input("ops10k", "Overage operations", "10K operations", "Operations beyond the included quota, in tens of thousands.")],
    meters: [meter("instances", "Stores", "stores", false, false), meter("replicas", "Replicas", "replicas", false, false), meter("ops", "Overage operations", "ops10k", false, false)], filter: svc(AC),
    skus: [
      sku("app-configuration", "free", "Free", { instances: free("The Free tier has no charge."), replicas: free("The Free tier has no replicas."), ops: free("The Free tier has a fixed daily quota, no overage.") }),
      acSku("developer", "Developer", "Developer", m("Developer Overage Operations", AC, { divisor: 0.1, unit: "10K operations" })),
      acSku("standard", "Standard", "Standard", m("Standard Overage Operations", AC)),
      acSku("premium", "Premium", "Premium", m("Premium Overage Operations", AC)),
    ],
  });

  const BK = "Backup";
  const bkInst = (id: string, label: string, meterName: string) => sku("backup-instance", id, label, { instances: rule(m(meterName, BK, { unit: "instance-month" })) });
  const backup = type({
    id: "backup-instance", label: "Azure Backup protected instance", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/backup/",
    note: "The monthly protected-instance fee. Backup storage is a separate type (Backup storage). Instance fees for Azure VMs vary with size in the published table; the Retail API lists one rate.",
    inputs: [input("instances", "Protected instances", "instances", "Machines, databases or file shares protected.")], meters: [meter("instances", "Protected instances", "instances", false, false)], filter: svc(BK),
    skus: [
      bkInst("azure-vm", "Azure virtual machine", "Azure VM Protected Instance"), bkInst("sql-in-vm", "SQL Server in an Azure VM", "SQL Server in Azure VM Protected Instance"),
      bkInst("sap-hana", "SAP HANA in an Azure VM", "SAP HANA on Azure VM Protected Instance"), bkInst("azure-files", "Azure Files share", "Azure Files Protected Instance"),
      bkInst("azure-blobs", "Azure Blobs", "Azure Blob Protected Instance"), bkInst("postgresql", "PostgreSQL", "PostgreSQL Protected Instance"),
      bkInst("on-premises-server", "On-premises server", "On Premises Server Protected Instance"), bkInst("cosmos-db", "Cosmos DB", "Cosmos DB Protected Instance"),
    ],
  });
  const backupStorage = type({
    id: "backup-storage", label: "Azure Backup storage", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/backup/",
    note: "Backup data stored in the vault, per GB a month, by redundancy. Reserved capacity and the archive early-delete fee are not included.",
    inputs: [input("gb", "Backup data", "GB", "Backup data stored in the vault.")], meters: [meter("gb", "Stored data", "gb", false, true)], filter: svc(BK),
    skus: [["lrs", "Standard LRS", "Standard LRS Data Stored"], ["zrs", "Standard ZRS", "Standard ZRS Data Stored"], ["grs", "Standard GRS", "Standard GRS Data Stored"], ["ra-grs", "Standard RA-GRS", "Standard RA-GRS Data Stored"], ["archive-lrs", "Archive LRS", "Archive LRS Data Stored"], ["archive-grs", "Archive GRS", "Archive GRS Data Stored"]].map(([id, label, meterName]) =>
      sku("backup-storage", id!, label!, { gb: rule(m(meterName!, BK, { unit: "GB-month" })) })),
  });
  const asr = type({
    id: "site-recovery", label: "Site Recovery", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/site-recovery/",
    note: "Per protected instance per month. The storage, compute and network used by the replica are separate resources.",
    inputs: [input("instances", "Protected instances", "instances", "Machines replicated.")], meters: [meter("instances", "Protected instances", "instances", false, false)], filter: svc("Azure Site Recovery"),
    skus: [
      sku("site-recovery", "to-azure", "Replicating to Azure", { instances: rule({ meterName: rx("VM Replicated to Azure"), unit: "instance-month" }) }),
      sku("site-recovery", "to-customer-site", "Replicating to a customer-owned site", { instances: rule({ meterName: rx("VM Replicated to System Center"), unit: "instance-month" }) }),
    ],
  });
  const automation = type({
    id: "automation", label: "Automation", category: "monitoring", docs: "https://azure.microsoft.com/pricing/details/automation/",
    note: "Runbook job minutes beyond the free 500 and State Configuration nodes beyond the free five. Watcher tasks and Update Management are not included.",
    inputs: [input("minutes", "Job minutes", "minutes", "Runbook minutes beyond the free 500."), input("nodes", "Non-Azure nodes", "nodes", "State Configuration nodes outside Azure, beyond the free five.")],
    meters: [meter("minutes", "Job minutes", "minutes", false, false), meter("nodes", "Non-Azure nodes", "nodes", false, false)], filter: svc("Automation"),
    skus: [
      sku("automation", "process-automation", "Process automation (runbook minutes)", { minutes: rule(m("Basic Runtime", "Process Automation", { skuName: "^Basic$", tier: "paid", unit: "minute" })), nodes: free("Nodes apply to State Configuration only.") }),
      sku("automation", "state-configuration", "State Configuration (non-Azure nodes)", { minutes: free("Job minutes apply to process automation only."), nodes: rule(m("Non-Azure Node", "Configuration Management", { tier: "paid", unit: "node-month" })) }),
    ],
  });
  return [ingest, retention, ai, alerts, appConfig, backup, backupStorage, asr, automation];
}

// ---------------------------------------------------------------- data

function data(): Json[] {
  const FAB = "serviceName eq 'Microsoft Fabric' and armRegionName eq '{region}'";
  const cus = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  const fabric: Json = {
    id: "fabric-capacity", label: "Microsoft Fabric capacity", category: "data", docsUrl: "https://azure.microsoft.com/pricing/details/microsoft-fabric/",
    note: "F SKUs: capacity units (CU) per hour, pay-as-you-go or a 1-year reservation. Every Fabric capacity-usage meter carries the same CU-hour rate; the Power BI one is the reference. OneLake storage is a separate type. The Retail API's 3-year reservation row is exactly three times the 1-year row, so it is not offered. Power BI Pro licences for viewers below F64 are separate (Licences).",
    inputs: [input("capacities", "Capacities", "capacities", "Fabric capacities of this SKU.")], meters: [meter("capacity", "Capacity", "capacities", true, true)], options: ["payg", "ri1"],
    retail: {
      filter: FAB, productName: ".",
      meters: { capacity: { meterName: rx("Power BI Capacity Usage CU"), productName: rx("Fabric Capacity"), multiplyBy: "cu", unit: "capacity-month (730 h)", reservation: { meterName: rx("Fabric Capacity CU"), productName: rx("Fabric Capacity Reservation") } } },
    },
    skus: cus.map((cu) => sku("fabric-capacity", `f${cu}`, `F${cu} (${cu} CU)`, { capacity: { rule: {} } as Entry }, { cu })),
  };
  // Fabric rules sit on the type (multiplyBy needs the attribute only), so the SKU carries no override.
  for (const s of fabric.skus as Json[]) delete s.retail;
  const onelake = type({
    id: "onelake-storage", label: "OneLake storage", category: "data", docs: "https://azure.microsoft.com/pricing/details/microsoft-fabric/",
    note: "Data stored in OneLake per GB a month. Transactions, BCDR storage and the cache are not included.",
    inputs: [input("gb", "Data stored", "GB", "Data stored in OneLake.")], meters: [meter("gb", "Stored data", "gb", false, true)], filter: FAB,
    skus: [["hot", "Hot"], ["cool", "Cool"]].map(([id, label]) => sku("onelake-storage", id!, label!, { gb: rule(m(`OneLake Storage ${label} Data Stored`, "OneLake", { skuName: rx(`OneLake Storage ${label}`), unit: "GB-month" })) })),
  });

  const dwus = [100, 200, 300, 400, 500, 1000, 1500, 2000, 2500, 3000, 5000, 6000, 7500, 10000, 15000, 30000];
  const SYN = "Azure Synapse Analytics";
  const synapse: Json = {
    id: "synapse-dedicated-sql", label: "Synapse dedicated SQL pool", category: "data", docsUrl: "https://azure.microsoft.com/pricing/details/synapse-analytics/",
    note: "Compute by DWU level (cDWU), per hour, pay-as-you-go or reserved. Every level is the DW100c price times its size. Storage and snapshots are separate. Spark pools, serverless SQL (separate type) and pipelines are not included.",
    inputs: [input("pools", "Pools", "pools", "Dedicated SQL pools of this size, billed per hour while running.")], meters: [meter("compute", "Compute", "pools", true, true)], options: ["payg", "ri1", "ri3"],
    retail: { filter: svc(SYN), productName: ".", meters: { compute: { meterName: rx("100 DWUs"), productName: rx("Azure Synapse Analytics Dedicated SQL Pool"), skuName: rx("DW100c"), multiplyBy: "units100", unit: "pool-month (730 h)" } } },
    skus: dwus.map((d) => sku("synapse-dedicated-sql", `dw${d}c`, `DW${d}c (${d.toLocaleString("en-US")} DWU)`, { compute: { rule: {} } as Entry }, { dwu: d, units100: d / 100 })),
  };
  for (const s of synapse.skus as Json[]) delete s.retail;
  const serverless = type({
    id: "synapse-serverless-sql", label: "Synapse serverless SQL pool", category: "data", docs: "https://azure.microsoft.com/pricing/details/synapse-analytics/",
    note: "Per TB of data processed. Storage is billed separately.",
    inputs: [input("tb", "Data processed", "TB", "Data processed by queries a month.")], meters: [meter("tb", "Data processed", "tb", false, false)], filter: svc(SYN),
    skus: [sku("synapse-serverless-sql", "standard", "Serverless SQL pool", { tb: rule(m("Standard Data Processed", "Azure Synapse Analytics Serverless SQL Pool", { unit: "TB" })) })],
  });

  const dbu = (id: string, label: string, name: string) => sku("databricks-dbu", id, label, { dbu: rule({ meterName: rx(name), usage: true }) });
  const databricks = type({
    id: "databricks-dbu", label: "Databricks (DBU only)", category: "data", docs: "https://azure.microsoft.com/pricing/details/databricks/",
    note: "Databricks units (DBU) only. The virtual machines the cluster runs on are billed separately: add them as VM resources. Serverless SKUs include the compute. Pre-purchase plans, model serving beyond the DBU rate and the compliance add-ons are not included.",
    inputs: [input("dbuHours", "DBU consumed", "DBU-hours", "DBUs consumed a month (DBU rate per node-hour x node-hours).")], meters: [meter("dbu", "DBUs", "dbuHours", false, false)], filter: svc("Azure Databricks"),
    skus: [
      dbu("premium-jobs", "Premium, jobs compute", "Premium Jobs Compute DBU"), dbu("premium-jobs-photon", "Premium, jobs compute Photon", "Premium Jobs Compute Photon DBU"), dbu("premium-jobs-light", "Premium, jobs light compute", "Premium Jobs Light Compute DBU"),
      dbu("premium-all-purpose", "Premium, all-purpose compute", "Premium All-purpose Compute DBU"), dbu("premium-all-purpose-photon", "Premium, all-purpose Photon", "Premium All-Purpose Photon DBU"),
      dbu("premium-sql-classic", "Premium, SQL classic", "Premium SQL Analytics DBU"), dbu("premium-sql-pro", "Premium, SQL pro", "Premium SQL Compute Pro DBU"), dbu("premium-sql-serverless", "Premium, SQL serverless", "Premium Serverless SQL DBU"),
      dbu("premium-dlt-core", "Premium, Delta Live Tables core", "Premium Core Compute Delta Live Tables DBU"), dbu("premium-dlt-pro", "Premium, Delta Live Tables pro", "Premium Pro Compute Delta Live Tables DBU"), dbu("premium-dlt-advanced", "Premium, Delta Live Tables advanced", "Premium Advanced Compute Delta Live Tables DBU"),
      dbu("premium-serverless-jobs", "Premium, serverless jobs", "Premium Automated Serverless Compute DBU"), dbu("premium-serverless-interactive", "Premium, serverless interactive", "Premium Interactive Serverless Compute DBU"),
      dbu("premium-model-training", "Premium, model training", "Premium Model Training DBU"), dbu("premium-model-serving", "Premium, serverless model serving", "Premium Serverless Realtime Inferencing DBU"),
      dbu("standard-jobs", "Standard, jobs compute", "Standard Jobs Compute DBU"), dbu("standard-jobs-photon", "Standard, jobs compute Photon", "Standard Jobs Compute Photon DBU"), dbu("standard-jobs-light", "Standard, jobs light compute", "Standard Jobs Light Compute DBU"),
      dbu("standard-all-purpose", "Standard, all-purpose compute", "Standard All-purpose Compute DBU"), dbu("standard-all-purpose-photon", "Standard, all-purpose Photon", "Standard All-Purpose Photon DBU"), dbu("standard-sql", "Standard, SQL analytics", "Standard SQL Analytics DBU"),
    ],
  });
  const pbi = type({
    id: "power-bi-embedded", label: "Power BI Embedded (A SKUs)", category: "data", docs: "https://azure.microsoft.com/pricing/details/power-bi-embedded/",
    note: "Embedded capacity nodes per hour. Fabric F SKUs are the successor and a separate type.",
    inputs: [input("nodes", "Nodes", "nodes", "Embedded capacities, billed per hour.")], meters: [meter("node", "Node", "nodes", true, true)], filter: svc("Power BI Embedded"),
    skus: [1, 2, 3, 4, 5, 6].map((n) => sku("power-bi-embedded", `a${n}`, `A${n}`, { node: rule(m(`A${n} Node`, "Power BI Embedded", { unit: "node-month (730 h)" })) })),
  });
  const asa = type({
    id: "stream-analytics", label: "Stream Analytics", category: "data", docs: "https://azure.microsoft.com/pricing/details/stream-analytics/",
    note: "Standard streaming units per hour. The V2 SKUs (tiered by hours used) and dedicated clusters are not included.",
    inputs: [input("sus", "Streaming units", "units", "Streaming units, billed per hour.")], meters: [meter("su", "Streaming units", "sus", true, true)], filter: svc("Stream Analytics"),
    skus: [sku("stream-analytics", "standard", "Standard", { su: rule(m("Standard Streaming Unit", "Stream Analytics", { unit: "unit-month (730 h)" })) })],
  });
  return [fabric, onelake, synapse, serverless, databricks, pbi, asa];
}

// ---------------------------------------------------------------- licences

function licences(): Json[] {
  const DO = "serviceName eq 'Azure DevOps' and armRegionName eq 'Global'";
  const devops = type({
    id: "azure-devops-users", label: "Azure DevOps users", category: "licences", docs: "https://azure.microsoft.com/pricing/details/devops/azure-devops-services/",
    note: "Per user per month beyond the five free Basic users. Listed in the Retail API under Global.",
    inputs: [input("users", "Users", "users", "Licensed users.")], meters: [meter("users", "Users", "users", false, false)], filter: DO,
    skus: [
      sku("azure-devops-users", "basic", "Basic (Repos, Boards, Pipelines)", { users: rule(m("Basic User", "Azure Repos and Boards (Basic)", { unit: "user-month" })) }),
      sku("azure-devops-users", "basic-test-plans", "Basic + Test Plans", { users: rule(m("Advanced User", "Azure Repos and Boards", { unit: "user-month" })) }),
      sku("azure-devops-users", "test-plans", "Test Plans (add-on)", { users: rule(m("Standard User", "Azure Test Plans", { unit: "user-month" })) }),
    ],
  });
  const jobs = type({
    id: "azure-devops-jobs", label: "Azure DevOps parallel jobs", category: "licences", docs: "https://azure.microsoft.com/pricing/details/devops/azure-devops-services/",
    note: "Parallel pipeline jobs beyond the free grant, per job per month. Hosted build minutes on larger agents are not included.",
    inputs: [input("jobs", "Parallel jobs", "jobs", "Parallel jobs purchased.")], meters: [meter("jobs", "Parallel jobs", "jobs", false, false)], filter: DO,
    skus: [
      sku("azure-devops-jobs", "microsoft-hosted", "Microsoft-hosted CI/CD", { jobs: rule(m("Microsoft-hosted CI/CD Concurrent Job", "Azure Pipelines", { unit: "job-month" })) }),
      sku("azure-devops-jobs", "self-hosted", "Self-hosted CI/CD", { jobs: rule(m("Self-hosted CI/CD Concurrent Job", "Azure Pipelines", { unit: "job-month" })) }),
    ],
  });
  const gh = type({
    id: "github-seat", label: "GitHub seats", category: "licences", docs: "https://github.com/pricing",
    note: "Per seat or committer per month, from the Retail API (GitHub Enterprise Cloud and the Advanced Security add-ons) and the existing Copilot prices. GitHub Team is not in the Retail API and is not listed. Actions minutes, Codespaces and storage are not included.",
    inputs: [input("seats", "Seats", "seats", "Licensed users or active committers.")], meters: [meter("seats", "Seats", "seats", false, false)], filter: "serviceName eq 'GitHub' and armRegionName eq 'Global'",
    skus: [
      sku("github-seat", "enterprise", "GitHub Enterprise Cloud", { seats: rule(m("Enterprise User", "GitHub Enterprise (GHE)", { unit: "seat-month" })) }),
      sku("github-seat", "copilot-business", "Copilot Business", { seats: ref("copilot-business") }),
      sku("github-seat", "copilot-enterprise", "Copilot Enterprise", { seats: ref("copilot-enterprise") }),
      sku("github-seat", "advanced-security", "Advanced Security (Enterprise, per committer)", { seats: rule(m("Advanced Security GHE Committer", "GitHub Advanced Security GHE", { unit: "committer-month" })) }),
      sku("github-seat", "secret-protection", "Secret Protection (Enterprise, per committer)", { seats: rule(m("Secret Scanning for GHE Committer", "GitHub Advanced Security GHE", { unit: "committer-month" })) }),
      sku("github-seat", "code-security", "Code Security (Enterprise, per committer)", { seats: rule(m("Code Scanning for GHE Committer", "GitHub Advanced Security GHE", { unit: "committer-month" })) }),
    ],
  });
  const PBI = "https://www.microsoft.com/power-platform/products/power-bi/pricing";
  const PAPPS = "https://www.microsoft.com/power-platform/products/power-apps/pricing";
  const PAUTO = "https://www.microsoft.com/power-platform/products/power-automate/pricing";
  const seats = type({
    id: "microsoft-seat", label: "Power BI and Power Platform per-user licences", category: "licences", docs: PBI,
    note: "Vendor list prices per user per month, paid yearly, converted from USD at the catalogue rate. Not Retail API meters, so they are marked unverified. Microsoft 365 E3 and E5 are not listed because their price page could not be read; add them as a manual price on the placeholder SaaS seat.",
    inputs: [input("users", "Users", "users", "Licensed users.")], meters: [meter("users", "Users", "users", false, false)],
    skus: [
      sku("microsoft-seat", "power-bi-pro", "Power BI Pro", { users: vendor(14, PBI, "Power BI pricing page: Pro USD 14.00 user a month, paid yearly, fetched " + TODAY, "user-month") }),
      sku("microsoft-seat", "power-bi-ppu", "Power BI Premium Per User", { users: vendor(24, PBI, "Power BI pricing page: Premium Per User USD 24.00 user a month, paid yearly, fetched " + TODAY, "user-month") }),
      sku("microsoft-seat", "power-apps-premium", "Power Apps Premium", { users: vendor(20, PAPPS, "Power Apps pricing page: Premium USD 20.00 user a month, paid yearly, fetched " + TODAY, "user-month") }),
      sku("microsoft-seat", "power-automate-premium", "Power Automate Premium", { users: vendor(15, PAUTO, "Power Automate pricing page: Premium USD 15.00 user a month, paid yearly, fetched " + TODAY, "user-month") }),
    ],
  });
  const saas = type({
    id: "saas-seat", label: "Other SaaS per seat (set your own price)", category: "licences", docs: "https://github.com/nitin27may/roi-calculator",
    note: "A placeholder with no list price: it costs 0 until you set a manual price for it in Prices & sources (the unit price `saas-seat-custom-seats`). Add one resource per product and use the label to name it.",
    inputs: [input("seats", "Seats", "seats", "Licensed users.")], meters: [meter("seats", "Seats", "seats", false, false)],
    skus: [{ id: "custom", label: "Custom SaaS seat (no price until you set one)", attrs: {}, prices: { seats: "saas-seat-custom-seats" } }],
  });
  VENDOR.push({
    id: "saas-seat-custom-seats", label: "Custom SaaS seat (placeholder)", platform: "azure", unit: "seat-month", price: 0, attrs: { free: true },
    source: { kind: "manual", note: "Placeholder with no price: set a manual price in Prices & sources to cost a SaaS product.", retrievedAt: TODAY }, confidence: "unverified",
  });
  return [devops, jobs, gh, seats, saas];
}

export function buildPart2(): Record<string, Json> {
  VENDOR.length = 0;
  const files: Record<string, Json> = {};
  const notes: Record<string, string> = {
    messaging: "Part 2 of the catalogue: Service Bus, Event Grid, Event Hubs, Logic Apps, API Management, Relay, Notification Hubs and Data Factory.",
    network: "Part 2 of the catalogue: peering, private endpoints, NAT, public IPs, Application Gateway, Front Door, Load Balancer, VPN and ExpressRoute, Firewall, Bastion, DDoS IP Protection, DNS and data transfer.",
    security: "Part 2 of the catalogue: Key Vault, HSMs, Defender for Cloud plans, Microsoft Sentinel and Entra ID.",
    monitoring: "Part 2 of the catalogue: Log Analytics, Application Insights, alerts, App Configuration, Backup, Site Recovery and Automation.",
    data: "Part 2 of the catalogue: Fabric, OneLake, Synapse, Databricks (DBU only), Power BI Embedded and Stream Analytics.",
    licences: "Part 2 of the catalogue: Azure DevOps, GitHub, Power BI and Power Platform seats, and a placeholder SaaS seat.",
  };
  const built: [string, Json[]][] = [["messaging", messaging()], ["network", network()], ["security", security()], ["monitoring", monitoring()], ["data", data()], ["licences", licences()]];
  const vendorByType = (types: Json[]) => {
    const ids = new Set(types.flatMap((t) => t.skus.flatMap((s: Json) => Object.values(s.prices))));
    return VENDOR.filter((u) => ids.has(u.id));
  };
  for (const [category, types] of built) files[category] = { category, note: notes[category], types, unitPrices: vendorByType(types) };
  return files;
}
