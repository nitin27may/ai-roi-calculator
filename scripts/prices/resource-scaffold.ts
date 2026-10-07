/**
 * pnpm prices:scaffold
 *
 * Writes the type skeletons of catalogue part 1 (compute, database, storage) to packages/catalog/data/resources/:
 * inputs, meters, options, the `retail` rules and the SKU lists. It writes no prices. `pnpm prices:resources` then
 * fills every unit price from the Retail API. Unit prices already in a file are kept for SKUs that stay in the list
 * and dropped for SKUs that leave it, so re-running the scaffold after editing a list is safe.
 *
 * To add a SKU to an existing type: append it to the list below (or edit the JSON by hand: add a SKU with an `armSku`
 * and a `prices` map), then run `pnpm prices:resources`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatResourceFile } from "./format.js";
import { buildPart2 } from "./resource-scaffold-part2.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "packages/catalog/data/resources");

type Json = Record<string, any>;
type Os = "linux" | "windows";

const input = (id: string, label: string, unit: string, help: string) => ({ id, label, unit, help });
const meter = (id: string, label: string, quantityInput: string, hourly: boolean, scalesWithSize: boolean, factor?: number) =>
  ({ id, label, quantity: { input: quantityInput, ...(factor ? { factor } : {}) }, hourly, scalesWithSize });

/** Fills `prices` with one unit price id per meter: `<type>-<sku>-<meter>`. */
function sku(typeId: string, id: string, label: string, meterIds: string[], extra: Json = {}): Json {
  const { shared, ...rest } = extra;
  return { id, label, attrs: {}, ...rest, prices: Object.fromEntries(meterIds.map((m) => [m, shared?.[m] ?? `${typeId}-${id}-${m}`])) };
}

const AHB_VM = { kind: "linux-twin", note: "A Windows size takes the Linux price of the same size (the Windows Server licence is removed). Linux sizes have no licence component, so Hybrid Benefit does not apply to them." };
const NO_AHB_SQL = { kind: "unavailable", note: "The Retail API lists the vCore rate with the SQL licence included and publishes no compute-only meter, so Hybrid Benefit is not priced. Add a manual price if you hold Software Assurance." };

// ---------------------------------------------------------------- compute

interface VmSize { name: string; vcpu: number; mem: number }
const VM_SIZES: VmSize[] = [
  { name: "B2ms", vcpu: 2, mem: 8 }, { name: "B4ms", vcpu: 4, mem: 16 },
  { name: "B2s_v2", vcpu: 2, mem: 8 }, { name: "B4s_v2", vcpu: 4, mem: 16 }, { name: "B8s_v2", vcpu: 8, mem: 32 },
  { name: "D2s_v5", vcpu: 2, mem: 8 }, { name: "D4s_v5", vcpu: 4, mem: 16 }, { name: "D8s_v5", vcpu: 8, mem: 32 }, { name: "D16s_v5", vcpu: 16, mem: 64 }, { name: "D32s_v5", vcpu: 32, mem: 128 },
  { name: "D4ds_v5", vcpu: 4, mem: 16 },
  { name: "D2s_v6", vcpu: 2, mem: 8 }, { name: "D4s_v6", vcpu: 4, mem: 16 }, { name: "D8s_v6", vcpu: 8, mem: 32 }, { name: "D16s_v6", vcpu: 16, mem: 64 },
  { name: "D4as_v6", vcpu: 4, mem: 16 },
  { name: "E2s_v5", vcpu: 2, mem: 16 }, { name: "E4s_v5", vcpu: 4, mem: 32 }, { name: "E8s_v5", vcpu: 8, mem: 64 }, { name: "E16s_v5", vcpu: 16, mem: 128 }, { name: "E32s_v5", vcpu: 32, mem: 256 },
  { name: "E4s_v6", vcpu: 4, mem: 32 }, { name: "E8s_v6", vcpu: 8, mem: 64 }, { name: "E16s_v6", vcpu: 16, mem: 128 },
  { name: "F2s_v2", vcpu: 2, mem: 4 }, { name: "F4s_v2", vcpu: 4, mem: 8 }, { name: "F8s_v2", vcpu: 8, mem: 16 }, { name: "F16s_v2", vcpu: 16, mem: 32 },
];
const pretty = (armSku: string) => armSku.replace(/_v(\d)/, " v$1");
const slug = (armSku: string) => armSku.toLowerCase().replace(/_/g, "-");

function vmType(): Json {
  const skus: Json[] = [];
  for (const s of VM_SIZES) for (const os of ["linux", "windows"] as Os[]) {
    const id = `${slug(s.name)}-${os}`;
    skus.push(sku("vm", id, `${pretty(s.name)}, ${os === "linux" ? "Linux" : "Windows"} (${s.vcpu} vCPU, ${s.mem} GiB)`, ["compute"], { armSku: `Standard_${s.name}`, attrs: { os, vcpu: s.vcpu, memoryGiB: s.mem, series: s.name[0] } }));
  }
  return {
    id: "vm", label: "Virtual machine", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/virtual-machines/windows/",
    note: "Compute only: add managed disks, backup, public IPs and bandwidth as their own resources. AKS and Windows node pools are priced as these VMs. Spot and low-priority rates are not offered.",
    inputs: [input("count", "Machines", "machines", "How many identical machines run in production.")],
    meters: [meter("compute", "Compute", "count", true, true)],
    options: ["payg", "ri1", "ri3", "ahb", "devtest"], ahb: AHB_VM,
    retail: {
      filter: "serviceName eq 'Virtual Machines' and armRegionName eq '{region}' and armSkuName eq '{armSku}'",
      productName: { linux: "^Virtual Machines [A-Za-z0-9 ]+ Series$", windows: "^Virtual Machines [A-Za-z0-9 ]+ Series Windows$" },
      meters: { compute: { meterName: "^(?!.*(Spot|Low Priority))", unit: "VM-month (730 h)" } },
      windowsLicence: true,
    },
    skus,
  };
}

const DISK_SIZES: [string, number][] = [["4", 32], ["6", 64], ["10", 128], ["15", 256], ["20", 512], ["30", 1024], ["40", 2048], ["50", 4096], ["60", 8192], ["70", 16384], ["80", 32767]];
function diskType(id: string, label: string, letter: string, product: string, options: string[]): Json {
  return {
    id, label, category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/managed-disks/",
    note: "Locally redundant (LRS) disks, billed per disk. Disk transactions (Standard SSD and HDD), bursting, snapshots and zone-redundant disks are not included.",
    inputs: [input("disks", "Disks", "disks", "How many disks of this size.")],
    meters: [meter("disk", "Disk", "disks", false, true)],
    options,
    retail: {
      filter: "serviceName eq 'Storage' and armRegionName eq '{region}' and productName eq '" + product + "'",
      productName: `^${product}$`, skuName: "^{armSku} LRS$",
      meters: { disk: { meterName: "^{armSku} LRS Disk$", unit: "disk-month", ...(options.includes("ri1") ? { options: ["payg", "ri1"] } : {}) } },
    },
    skus: DISK_SIZES.map(([n, gib]) => sku(id, `${letter.toLowerCase()}${n}`, `${letter}${n}, ${gib >= 1024 ? `${gib / 1024} TiB` : `${gib} GiB`}`, ["disk"], { armSku: `${letter}${n}`, attrs: { sizeGiB: gib } })),
  };
}

function premiumSsdV2Type(): Json {
  return {
    id: "disk-premium-ssd-v2", label: "Managed disk, Premium SSD v2", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/managed-disks/",
    note: "You pay for provisioned capacity, IOPS and throughput separately. Each disk includes 3,000 IOPS and 125 MB/s at no charge: enter only what you provision above that. Locally redundant only.",
    inputs: [input("gib", "Capacity", "GiB", "Provisioned capacity per all disks."), input("iops", "Extra IOPS", "IOPS", "Provisioned IOPS above the free 3,000 per disk."), input("mbps", "Extra throughput", "MB/s", "Provisioned throughput above the free 125 MB/s per disk.")],
    meters: [meter("capacity", "Capacity", "gib", true, true), meter("iops", "Extra IOPS", "iops", true, true), meter("throughput", "Extra throughput", "mbps", true, true)],
    options: ["payg"],
    retail: {
      filter: "serviceName eq 'Storage' and armRegionName eq '{region}' and productName eq 'Azure Premium SSD v2'", productName: "^Azure Premium SSD v2$", skuName: "^Premium LRS$", precise: true,
      meters: {
        capacity: { meterName: "^Premium LRS Provisioned Capacity$", unit: "GiB-month (730 h)" },
        iops: { meterName: "^Premium LRS Provisioned IOPS$", tier: "paid", unit: "IOPS-month (730 h)" },
        throughput: { meterName: "^Premium LRS Provisioned Throughput \\(MBps\\)$", tier: "paid", unit: "MB/s-month (730 h)" },
      },
    },
    skus: [sku("disk-premium-ssd-v2", "lrs", "Premium SSD v2, locally redundant", ["capacity", "iops", "throughput"], { armSku: "Premium LRS" })],
  };
}

function aksType(): Json {
  return {
    id: "aks-cluster", label: "AKS cluster (control plane)", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/kubernetes-service/",
    note: "The cluster management fee only. Node pools are virtual machines: add the Linux or Windows VM sizes and their disks as resources. Load balancers, public IPs and monitoring are separate.",
    inputs: [input("clusters", "Clusters", "clusters", "How many clusters.")],
    meters: [meter("control-plane", "Control plane", "clusters", true, false)],
    options: ["payg"],
    retail: {
      filter: "serviceName eq 'Azure Kubernetes Service' and armRegionName eq '{region}'", productName: "^Azure Kubernetes Service$", skuName: "^Standard$",
      meters: { "control-plane": { meterName: "^Standard Uptime SLA$", unit: "cluster-month (730 h)" } },
    },
    skus: [
      sku("aks-cluster", "free", "Free tier (no uptime SLA)", ["control-plane"], { retail: { "control-plane": { free: "The Free tier has no cluster management fee; nodes are billed as virtual machines.", unit: "cluster-month (730 h)" } } }),
      sku("aks-cluster", "standard", "Standard tier (financially backed uptime SLA)", ["control-plane"]),
      sku("aks-cluster", "premium", "Premium tier (uptime SLA and long-term support)", ["control-plane"], { retail: { "control-plane": { meterName: "^Standard Long Term Support$" } } }),
    ],
  };
}

const ASP_TIERS: { name: string; product: string; sizes: { sku: string; label: string; vcpu: number; mem: number }[] }[] = [
  { name: "Basic", product: "Basic", sizes: [{ sku: "B1", label: "B1", vcpu: 1, mem: 1.75 }, { sku: "B2", label: "B2", vcpu: 2, mem: 3.5 }, { sku: "B3", label: "B3", vcpu: 4, mem: 7 }] },
  { name: "Standard", product: "Standard", sizes: [{ sku: "S1", label: "S1", vcpu: 1, mem: 1.75 }, { sku: "S2", label: "S2", vcpu: 2, mem: 3.5 }, { sku: "S3", label: "S3", vcpu: 4, mem: 7 }] },
  { name: "Premium v3", product: "Premium v3", sizes: [
    { sku: "P0v3", label: "P0v3", vcpu: 1, mem: 4 }, { sku: "P1 v3", label: "P1v3", vcpu: 2, mem: 8 }, { sku: "P2 v3", label: "P2v3", vcpu: 4, mem: 16 }, { sku: "P3 v3", label: "P3v3", vcpu: 8, mem: 32 },
    { sku: "P1mv3", label: "P1mv3", vcpu: 2, mem: 16 }, { sku: "P2mv3", label: "P2mv3", vcpu: 4, mem: 32 }, { sku: "P3mv3", label: "P3mv3", vcpu: 8, mem: 64 } ] },
  { name: "Premium v4", product: "Premium v4", sizes: [{ sku: "P1v4", label: "P1v4", vcpu: 2, mem: 8 }, { sku: "P2v4", label: "P2v4", vcpu: 4, mem: 16 }, { sku: "P3v4", label: "P3v4", vcpu: 8, mem: 32 }] },
  { name: "Isolated v2", product: "Isolated v2", sizes: [
    { sku: "I1 v2", label: "I1v2", vcpu: 2, mem: 8 }, { sku: "I2 v2", label: "I2v2", vcpu: 4, mem: 16 }, { sku: "I3 v2", label: "I3v2", vcpu: 8, mem: 32 },
    { sku: "I4 v2", label: "I4v2", vcpu: 16, mem: 64 }, { sku: "I5 v2", label: "I5v2", vcpu: 32, mem: 128 }, { sku: "I6 v2", label: "I6v2", vcpu: 64, mem: 256 } ] },
];
function aspType(): Json {
  const skus: Json[] = [];
  for (const os of ["linux", "windows"] as Os[]) for (const t of ASP_TIERS) for (const z of t.sizes) {
    skus.push(sku("app-service-plan", `${z.label.toLowerCase()}-${os}`, `${t.name} ${z.label}, ${os === "linux" ? "Linux" : "Windows"} (${z.vcpu} vCPU, ${z.mem} GiB)`, ["plan"], { armSku: z.sku, attrs: { os, tier: t.name, vcpu: z.vcpu, memoryGiB: z.mem } }));
  }
  const tiers = ASP_TIERS.map((t) => t.product).join("|");
  return {
    id: "app-service-plan", label: "App Service plan", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/app-service/linux/",
    note: "The plan instances only; apps on the plan cost nothing extra. Free, Shared and Isolated v1 plans, the App Service Environment stamp fee, custom domains and IP SSL are not included.",
    inputs: [input("instances", "Instances", "instances", "Number of instances the plan scales out to in production.")],
    meters: [meter("plan", "Plan instances", "instances", true, true)],
    options: ["payg", "ri1", "ri3", "devtest"],
    retail: {
      filter: "serviceName eq 'Azure App Service' and armRegionName eq '{region}'",
      productName: { linux: `^Azure App Service (${tiers}) Plan - Linux$`, windows: `^Azure App Service (${tiers}) Plan$` }, skuName: "^{armSku}$",
      meters: { plan: { meterName: ".", unit: "instance-month (730 h)" } },
    },
    skus,
  };
}

function functionsPremiumType(): Json {
  return {
    id: "functions-premium", label: "Azure Functions Premium plan", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/functions/",
    note: "Always-on instances of the Elastic Premium plan (EP1 to EP3), priced as vCPU-hours plus GiB-hours. Instances above the minimum scale out and are billed the same way: enter the average instance count.",
    inputs: [input("instances", "Instances", "instances", "Average number of instances running in production.")],
    meters: [meter("instance", "Plan instances", "instances", true, true)],
    options: ["payg"],
    retail: {
      filter: "serviceName eq 'Functions' and armRegionName eq '{region}' and productName eq 'Premium Functions'", productName: "^Premium Functions$", skuName: "^Premium$",
      meters: { instance: { unit: "instance-month (730 h)", parts: [{ meterName: "^Premium vCPU Duration$", factorAttr: "vcpu" }, { meterName: "^Premium Memory Duration$", factorAttr: "memoryGiB" }] } },
    },
    skus: [
      sku("functions-premium", "ep1", "EP1 (1 vCPU, 3.5 GiB)", ["instance"], { attrs: { vcpu: 1, memoryGiB: 3.5 } }),
      sku("functions-premium", "ep2", "EP2 (2 vCPU, 7 GiB)", ["instance"], { attrs: { vcpu: 2, memoryGiB: 7 } }),
      sku("functions-premium", "ep3", "EP3 (4 vCPU, 14 GiB)", ["instance"], { attrs: { vcpu: 4, memoryGiB: 14 } }),
    ],
  };
}

const SECONDS_PER_MONTH = 2_628_000;
function functionsFlexType(): Json {
  const free = (why: string, unit: string) => ({ free: why, unit });
  return {
    id: "functions-flex-consumption", label: "Azure Functions Flex Consumption", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/functions/",
    note: "Pay per execution plus GB-seconds. On-demand instances scale to zero; always-ready instances add a baseline charge for the memory you keep warm. The monthly free grant (100,000 GB-seconds and 250,000 executions) is not applied: enter usage above it.",
    inputs: [input("alwaysReadyGB", "Always-ready memory", "GB", "Memory of the always-ready instances, kept warm all month."), input("execGbSeconds", "Execution", "GB-seconds", "Memory in GB times seconds of execution per month."), input("executionsM", "Executions", "million", "Executions per month, in millions.")],
    meters: [meter("baseline", "Always-ready baseline", "alwaysReadyGB", false, false, SECONDS_PER_MONTH), meter("execution", "Execution time", "execGbSeconds", false, false), meter("executions", "Executions", "executionsM", false, false, 100000)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'Functions' and armRegionName eq '{region}' and productName eq 'Flex Consumption'", productName: "^Flex Consumption$", precise: true, meters: { baseline: { unit: "GB-second" }, execution: { unit: "GB-second" }, executions: { unit: "10 executions" } } },
    skus: [
      sku("functions-flex-consumption", "on-demand", "On demand", ["baseline", "execution", "executions"], { retail: {
        baseline: free("On-demand instances have no baseline charge.", "GB-second"),
        execution: { skuName: "^On Demand$", meterName: "^On Demand Execution Time$", tier: "paid" }, executions: { skuName: "^On Demand$", meterName: "^On Demand Total Executions$", tier: "paid" },
      }, shared: { baseline: "functions-flex-consumption-no-baseline" } }),
      sku("functions-flex-consumption", "always-ready", "Always ready", ["baseline", "execution", "executions"], { retail: {
        baseline: { skuName: "^Always Ready$", meterName: "^Always Ready Baseline$" }, execution: { skuName: "^Always Ready$", meterName: "^Always Ready Execution Time$" }, executions: { skuName: "^Always Ready$", meterName: "^Always Ready Total Executions$" },
      } }),
    ],
  };
}

function functionsConsumptionType(): Json {
  return {
    id: "functions-consumption", label: "Azure Functions Consumption plan", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/functions/",
    note: "Pay per execution plus GB-seconds, scaling to zero. The monthly free grant (400,000 GB-seconds and 1 million executions) is not applied: enter usage above it.",
    inputs: [input("execGbSeconds", "Execution", "GB-seconds", "Memory in GB times seconds of execution per month."), input("executionsM", "Executions", "million", "Executions per month, in millions.")],
    meters: [meter("execution", "Execution time", "execGbSeconds", false, false), meter("executions", "Executions", "executionsM", false, false, 100000)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'Functions' and armRegionName eq '{region}' and productName eq 'Functions'", productName: "^Functions$", skuName: "^Standard$", precise: true, meters: { execution: { meterName: "^Standard Execution Time$", tier: "paid", unit: "GB-second" }, executions: { meterName: "^Standard Total Executions$", tier: "paid", unit: "10 executions" } } },
    skus: [sku("functions-consumption", "standard", "Consumption plan", ["execution", "executions"])],
  };
}

function aciType(): Json {
  return {
    id: "container-instances", label: "Azure Container Instances", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/container-instances/",
    note: "Linux container groups billed per vCPU-hour and GiB-hour of run time. GPU and Windows containers are not included. Enter the vCPUs and GiB that run all month, or use a schedule.",
    inputs: [input("vcpu", "vCPUs", "vCPUs", "Total vCPUs allocated to running container groups."), input("memoryGiB", "Memory", "GiB", "Total memory allocated to running container groups.")],
    meters: [meter("vcpu", "vCPU", "vcpu", true, true), meter("memory", "Memory", "memoryGiB", true, true)],
    options: ["payg"],
    retail: {
      filter: "serviceName eq 'Container Instances' and armRegionName eq '{region}' and productName eq 'Container Instances'", productName: "^Container Instances$", precise: true,
      meters: { vcpu: { meterName: "^{armSku} vCPU Duration$", skuName: "^{armSku}$", unit: "vCPU-month (730 h)" }, memory: { meterName: "^{armSku} Memory Duration$", skuName: "^{armSku}$", unit: "GiB-month (730 h)" } },
    },
    skus: [
      sku("container-instances", "standard", "Standard (Linux)", ["vcpu", "memory"], { armSku: "Standard" }),
      sku("container-instances", "confidential", "Confidential containers", ["vcpu", "memory"], { armSku: "Confidential containers ACI" }),
    ],
  };
}

function swaType(): Json {
  return {
    id: "static-web-app", label: "Static Web Apps", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/app-service/static/",
    note: "Per app per month. Bandwidth above the included allowance is a separate input. The Retail API lists this global service under East US 2, so the price is taken from there.",
    inputs: [input("apps", "Apps", "apps", "Number of Static Web Apps."), input("bandwidthGB", "Extra bandwidth", "GB", "Bandwidth above the included allowance, per month.")],
    meters: [meter("app", "App", "apps", false, false), meter("bandwidth", "Extra bandwidth", "bandwidthGB", false, false)],
    options: ["payg"],
    retail: {
      filter: "serviceName eq 'Azure App Service' and productName eq 'Static Web Apps' and armRegionName eq '{region}'", productName: "^Static Web Apps$", skuName: "^Standard$",
      regionOverride: "eastus2", regionNote: "Static Web Apps is a global service; the Retail API lists it under East US 2.",
      meters: { app: { meterName: "^Standard App$", unit: "app-month" }, bandwidth: { meterName: "^Standard Bandwidth Usage$", tier: "paid", unit: "GB" } },
    },
    skus: [
      sku("static-web-app", "free", "Free plan", ["app", "bandwidth"], { retail: { app: { free: "The Free plan has no monthly fee.", unit: "app-month" }, bandwidth: { free: "The Free plan has a bandwidth cap and no overage billing.", unit: "GB" } } }),
      sku("static-web-app", "standard", "Standard plan", ["app", "bandwidth"]),
    ],
  };
}

function acrType(): Json {
  return {
    id: "container-registry", label: "Azure Container Registry", category: "compute", docsUrl: "https://azure.microsoft.com/pricing/details/container-registry/",
    note: "The daily registry fee as a monthly price (30.4 days) plus storage above the included amount (Basic 10 GB, Standard 100 GB, Premium 500 GB). Geo-replication, ACR Tasks and data transfer are not included.",
    inputs: [input("registries", "Registries", "registries", "Number of registries."), input("extraStorageGB", "Extra storage", "GB", "Storage above the amount included in the tier.")],
    meters: [meter("registry", "Registry", "registries", false, false), meter("storage", "Extra storage", "extraStorageGB", false, true)],
    options: ["payg"],
    retail: {
      filter: "serviceName eq 'Container Registry' and armRegionName eq '{region}'", productName: "^Container Registry$", skuName: "^{armSku}$",
      meters: { registry: { meterName: "^{armSku} Registry Unit$", unit: "registry-month (30.4 days)" }, storage: { meterName: "^Data Stored$", unit: "GB-month" } },
    },
    skus: ["Basic", "Standard", "Premium"].map((t) => sku("container-registry", t.toLowerCase(), t, ["registry", "storage"], { armSku: t })),
  };
}

// ---------------------------------------------------------------- database

function sqlDbType(): Json {
  const gp = "SQL Database Single/Elastic Pool General Purpose";
  const rows: { id: string; label: string; compute: Json; storage: Json; options?: string[] }[] = [
    { id: "gp-gen5", label: "General Purpose, provisioned (Gen5)", compute: { productName: `^${gp} - Compute Gen5$`, skuName: "^vCore$", meterName: "^vCore$" }, storage: { productName: `^${gp} - Storage$`, skuName: "^General Purpose$", meterName: "^General Purpose Data Stored$" } },
    { id: "gp-gen5-zr", label: "General Purpose, provisioned, zone redundant (Gen5)", compute: { productName: `^${gp} - Compute Gen5$`, skuName: "^vCore ZR Zone Redundancy$", meterName: "^Zone Redundancy vCore$" }, storage: { productName: `^${gp} - Storage$`, skuName: "^General Purpose Zone Redundancy$", meterName: "^General Purpose Zone Redundancy Data Stored$" } },
    { id: "gp-serverless", label: "General Purpose, serverless (Gen5)", compute: { productName: "^SQL Database General Purpose - Serverless - Compute Gen5$", skuName: "^1 vCore$", meterName: "^vCore$" }, storage: { productName: `^${gp} - Storage$`, skuName: "^General Purpose$", meterName: "^General Purpose Data Stored$" }, options: ["payg"] },
    { id: "bc-gen5", label: "Business Critical (Gen5)", compute: { productName: "^SQL Database Single/Elastic Pool Business Critical - Compute Gen5$", skuName: "^vCore$", meterName: "^vCore$" }, storage: { productName: "^SQL Database Single/Elastic Pool Business Critical - Storage$", skuName: "^Business Critical$", meterName: "^Business Critical Data Stored$" } },
    { id: "hyperscale-gen5", label: "Hyperscale, provisioned (Gen5)", compute: { productName: "^SQL Database SingleDB/Elastic Pool Hyperscale - Compute Gen5$", skuName: "^vCore$", meterName: "^vCore$" }, storage: { productName: "^SQL Database SingleDB Hyperscale - Storage$", skuName: "^Hyperscale$", meterName: "^Hyperscale Data Stored$" } },
    { id: "hyperscale-serverless", label: "Hyperscale, serverless (Gen5)", compute: { productName: "^SQL Database SingleDB Hyperscale - Serverless - Compute Gen5$", skuName: "^1 vCore$", meterName: "^vCore$" }, storage: { productName: "^SQL Database SingleDB Hyperscale - Storage$", skuName: "^Hyperscale$", meterName: "^Hyperscale Data Stored$" }, options: ["payg"] },
  ];
  const reserved = ["payg", "ri1", "ri3"];
  return {
    id: "sql-db-vcore", label: "Azure SQL Database (vCore)", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/azure-sql-database/single/",
    note: "Single databases on the vCore model, licence included. For serverless enter the average active vCores. Elastic pools, backup storage beyond the free allowance, zone-redundant Business Critical, IO charges and Hybrid Benefit are not priced; see the Hybrid Benefit rule.",
    inputs: [input("vcores", "vCores", "vCores", "vCores per database (for serverless, the average active vCores)."), input("storageGB", "Data storage", "GB", "Provisioned data storage in GB.")],
    meters: [meter("compute", "Compute", "vcores", true, true), meter("storage", "Data storage", "storageGB", false, true)],
    options: reserved, ahb: NO_AHB_SQL,
    retail: {
      filter: "serviceName eq 'SQL Database' and armRegionName eq '{region}'",
      meters: { compute: { unit: "vCore-month (730 h)" }, storage: { unit: "GB-month", options: ["payg"] } },
    },
    skus: rows.map((r) => sku("sql-db-vcore", r.id, r.label, ["compute", "storage"], { retail: { compute: { ...r.compute, ...(r.options ? { options: r.options } : {}) }, storage: r.storage } })),
  };
}

function sqlDtuType(): Json {
  const tiers: [string, string, string, number][] = [["b", "Basic", "B", 5], ["s0", "Standard", "S0", 10], ["s1", "Standard", "S1", 20], ["s2", "Standard", "S2", 50], ["s3", "Standard", "S3", 100], ["p1", "Premium", "P1", 125], ["p2", "Premium", "P2", 250], ["p4", "Premium", "P4", 500], ["p6", "Premium", "P6", 1000]];
  return {
    id: "sql-db-dtu", label: "Azure SQL Database (DTU)", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/azure-sql-database/single/",
    note: "Single databases on the DTU model, priced per database per month (daily rate x 30.4). Storage up to the tier's included amount is part of the price. Elastic pools and extra storage are not included.",
    inputs: [input("databases", "Databases", "databases", "Number of databases on this tier.")],
    meters: [meter("database", "Database", "databases", false, true)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'SQL Database' and armRegionName eq '{region}'", productName: "^SQL Database Single (Basic|Standard|Premium)$", skuName: "^{armSku}$", meters: { database: { meterName: ".", unit: "database-month (30.4 days)" } } },
    skus: tiers.map(([id, tier, armSku, dtu]) => sku("sql-db-dtu", id, `${tier} ${armSku} (${dtu} DTU)`, ["database"], { armSku, attrs: { dtu } })),
  };
}

function sqlMiType(): Json {
  const rows = [
    { id: "gp-gen5", label: "General Purpose (Gen5)", cp: "General Purpose - Compute Gen5", st: "General Purpose", storage: "General Purpose Data Stored" },
    { id: "gp-premium", label: "General Purpose (Premium series)", cp: "General Purpose - Premium Series Compute", st: "General Purpose", storage: "General Purpose Data Stored" },
    { id: "bc-gen5", label: "Business Critical (Gen5)", cp: "Business Critical - Compute Gen5", st: "Business Critical", storage: "Business Critical Data Stored" },
    { id: "bc-premium", label: "Business Critical (Premium series)", cp: "Business Critical - Premium Series Compute", st: "Business Critical", storage: "Business Critical Data Stored" },
  ];
  return {
    id: "sql-mi", label: "Azure SQL Managed Instance", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/azure-sql-managed-instance/single/",
    note: "vCore compute with the SQL licence included, plus storage. Memory-optimized and zone-redundant instances, backup storage beyond the free allowance, IO charges and Hybrid Benefit are not priced; see the Hybrid Benefit rule.",
    inputs: [input("vcores", "vCores", "vCores", "vCores per instance."), input("storageGB", "Storage", "GB", "Reserved storage in GB.")],
    meters: [meter("compute", "Compute", "vcores", true, true), meter("storage", "Storage", "storageGB", false, true)],
    options: ["payg", "ri1", "ri3"], ahb: NO_AHB_SQL,
    retail: { filter: "serviceName eq 'SQL Managed Instance' and armRegionName eq '{region}'", meters: { compute: { unit: "vCore-month (730 h)" }, storage: { unit: "GB-month", options: ["payg"] } } },
    skus: rows.map((r) => sku("sql-mi", r.id, r.label, ["compute", "storage"], { retail: {
      compute: { productName: `^SQL Managed Instance ${r.cp}$`, skuName: "^vCore$", meterName: "^vCore$" },
      storage: { productName: `^SQL Managed Instance ${r.st} - Storage$`, skuName: `^${r.st}$`, meterName: `^${r.storage}$` },
    } })),
  };
}

function sqlLicenceType(): Json {
  const skus = [["standard", "Standard"], ["enterprise", "Enterprise"], ["web", "Web"]];
  return {
    id: "sql-server-licence", label: "SQL Server licence on a virtual machine", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/virtual-machines/sql-server/",
    note: "The SQL Server licence only, per vCPU. Add the Windows or Linux VM and its disks as separate resources. With Azure Hybrid Benefit you bring your own licence and the licence meter is 0.",
    inputs: [input("vcpus", "vCPUs", "vCPUs", "Total vCPUs of the VMs that run SQL Server.")],
    meters: [meter("licence", "SQL Server licence", "vcpus", true, true)],
    options: ["payg", "ahb", "devtest"],
    ahb: { kind: "licence-free", note: "Azure Hybrid Benefit for SQL Server: you bring your own licence with Software Assurance, so Azure bills no licence meter. The Retail API lists its Hybrid Benefit licence meters at 0." },
    retail: {
      filter: "serviceName eq 'Virtual Machines Licenses' and productName eq '{armSku}'", productName: "^{armSku}$", skuName: "^64 vCPU VM$",
      meters: { licence: { meterName: "^64 vCPU VM License$", divisor: 64, unit: "vCPU-month (730 h)" } },
    },
    skus: skus.map(([id, e]) => [id!, e!] as const).map(([id, e]) => sku("sql-server-licence", id, `SQL Server ${e}`, ["licence"], { armSku: `SQL Server ${e}` })),
  };
}

function pgmyType(kind: "postgres" | "mysql"): Json {
  const pg = kind === "postgres";
  const name = pg ? "PostgreSQL" : "MySQL";
  const p = (s: string) => `^Azure Database for ${name} Flexible Server ${s}$`;
  const series = pg
    ? [
      { id: "gp-ddsv5", label: "General Purpose, Ddsv5", prod: "General Purpose Ddsv5 Series Compute" }, { id: "gp-ddsv6", label: "General Purpose, Ddsv6", prod: "General Purpose Ddsv6 Series Compute" },
      { id: "mo-edsv5", label: "Memory Optimized, Edsv5", prod: "Memory Optimized Edsv5 Series Compute" }, { id: "mo-edsv6", label: "Memory Optimized, Edsv6", prod: "Memory Optimized Edsv6 Series Compute" },
    ]
    : [
      { id: "gp-ddsv5", label: "General Purpose, Ddsv5", prod: "General Purpose Ddsv5 Series Compute" }, { id: "gp-ddsv6", label: "General Purpose, Ddsv6", prod: "General Purpose Ddsv6 Series Compute" },
      { id: "mo-eadsv5", label: "Memory Optimized, Eadsv5", prod: "Memory Optimized Eadsv5 Series Compute" }, { id: "mo-edsv6", label: "Memory Optimized, Edsv6", prod: "Memory Optimized Edsv6 Series Compute" },
    ];
  const storageProduct = pg ? "Azure Database for PostgreSQL Flex Server Storage" : "Azure Database for MySQL Flexible Server Storage";
  const id = `${kind}-flexible`;
  return {
    id, label: `Azure Database for ${name} (flexible server)`, category: "database", docsUrl: `https://azure.microsoft.com/pricing/details/${pg ? "postgresql" : "mysql"}/flexible-server/`,
    note: "General Purpose and Memory Optimized compute per vCore, plus provisioned storage. For high availability enter the vCores of the primary and the standby. Backup storage beyond the included amount, extra IOPS and read replicas are not included.",
    inputs: [input("vcores", "vCores", "vCores", "Total vCores across all servers (double it for zone-redundant high availability)."), input("storageGB", "Storage", "GB", "Provisioned storage in GB.")],
    meters: [meter("compute", "Compute", "vcores", true, true), meter("storage", "Storage", "storageGB", false, true)],
    options: ["payg", "ri1", "ri3"],
    retail: { filter: `serviceName eq 'Azure Database for ${name}' and armRegionName eq '{region}'`, meters: { compute: { unit: "vCore-month (730 h)" }, storage: { unit: "GB-month", options: ["payg"] } } },
    skus: series.map((s) => sku(id, s.id, s.label, ["compute", "storage"], { retail: {
      compute: { productName: p(s.prod), skuName: "^vCore$", meterName: "^vCore$" },
      storage: { productName: `^${storageProduct}$`, skuName: "^Storage$", meterName: "^Storage Data Stored$" },
    } })),
  };
}

function pgmyBurstType(kind: "postgres" | "mysql"): Json {
  const pg = kind === "postgres";
  const name = pg ? "PostgreSQL" : "MySQL";
  const sizes = pg
    ? [["b1ms", "B1ms", "B1MS", 1, 2], ["b2s", "B2s", "B2S", 2, 4], ["b2ms", "B2ms", "B2ms", 2, 8], ["b4ms", "B4ms", "B4ms", 4, 16], ["b8ms", "B8ms", "B8ms", 8, 32]]
    : [["b1ms", "B1ms", "B1MS", 1, 2], ["b2s", "B2s", "B2S", 2, 4], ["b2ms", "B2ms", "Standard_B2ms2", 2, 8], ["b4ms", "B4ms", "Standard_B4ms", 4, 16], ["b8ms", "B8ms", "Standard_B8ms", 8, 32]];
  const storageProduct = pg ? "Azure Database for PostgreSQL Flex Server Storage" : "Azure Database for MySQL Flexible Server Storage";
  const id = `${kind}-flexible-burstable`;
  return {
    id, label: `Azure Database for ${name} (flexible server, Burstable)`, category: "database", docsUrl: `https://azure.microsoft.com/pricing/details/${pg ? "postgresql" : "mysql"}/flexible-server/`,
    note: "Burstable servers priced per server, plus provisioned storage. For development, test and light workloads. No reserved pricing for Burstable in the Retail API.",
    inputs: [input("servers", "Servers", "servers", "Number of servers."), input("storageGB", "Storage", "GB", "Provisioned storage in GB, all servers.")],
    meters: [meter("compute", "Compute", "servers", true, true), meter("storage", "Storage", "storageGB", false, true)],
    options: ["payg"],
    retail: {
      filter: `serviceName eq 'Azure Database for ${name}' and armRegionName eq '{region}'`,
      productName: `^Azure Database for ${name} Flexible Server Burstable BS Series Compute$`, skuName: "^{armSku}$",
      meters: { compute: { meterName: ".", unit: "server-month (730 h)" }, storage: { productName: `^${storageProduct}$`, skuName: "^Storage$", meterName: "^Storage Data Stored$", unit: "GB-month" } },
    },
    skus: sizes.map(([sid, label, armSku, vcpu, mem]) => sku(id, sid as string, `${label} (${vcpu} vCPU, ${mem} GiB)`, ["compute", "storage"], { armSku, attrs: { vcpu, memoryGiB: mem } })),
  };
}

function cosmosProvisionedType(): Json {
  return {
    id: "cosmos-db-provisioned", label: "Azure Cosmos DB (provisioned throughput)", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/cosmos-db/autoscale-provisioned/",
    note: "Throughput in units of 100 RU/s, single write region unless the multi-region writes SKU is chosen, plus transactional storage. Each extra region repeats the cost: add one resource per region. Autoscale is priced at the AP1 rate; AP1 to AP4 carry the same per-100-RU/s price. Analytical storage, backup and reserved capacity are not included.",
    inputs: [input("ru100", "Throughput", "100 RU/s", "Provisioned (or autoscale maximum) throughput in units of 100 RU/s; 4,000 RU/s is 40."), input("storageGB", "Storage", "GB", "Transactional storage in GB.")],
    meters: [meter("throughput", "Throughput", "ru100", true, true), meter("storage", "Storage", "storageGB", false, true)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'Azure Cosmos DB' and armRegionName eq '{region}'", meters: { throughput: { unit: "100 RU/s-month (730 h)" }, storage: { unit: "GB-month" } } },
    skus: [
      sku("cosmos-db-provisioned", "standard", "Provisioned, single write region", ["throughput", "storage"], { retail: { throughput: { productName: "^Azure Cosmos DB$", skuName: "^RUs$", meterName: "^100 RU/s$" }, storage: { productName: "^Azure Cosmos DB$", skuName: "^RUs$", meterName: "^Data Stored$" } } }),
      sku("cosmos-db-provisioned", "multi-write", "Provisioned, multi-region writes", ["throughput", "storage"], { retail: { throughput: { productName: "^Azure Cosmos DB$", skuName: "^mRUs$", meterName: "^100 Multi-master RU/s$" }, storage: { productName: "^Azure Cosmos DB$", skuName: "^mRUs$", meterName: "^Data Stored$" } } }),
      sku("cosmos-db-provisioned", "autoscale", "Autoscale, single write region", ["throughput", "storage"], { retail: { throughput: { productName: "^Azure Cosmos DB autoscale$", skuName: "^AP1$", meterName: "^AP1 100 RUs$" }, storage: { productName: "^Azure Cosmos DB$", skuName: "^RUs$", meterName: "^Data Stored$" } } }),
    ],
  };
}

function cosmosServerlessType(): Json {
  return {
    id: "cosmos-db-serverless", label: "Azure Cosmos DB (serverless)", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/cosmos-db/serverless/",
    note: "Request units consumed, in millions, plus transactional storage. Single region only.",
    inputs: [input("requestUnitsM", "Request units", "million RU", "Request units consumed per month, in millions."), input("storageGB", "Storage", "GB", "Transactional storage in GB.")],
    meters: [meter("requests", "Request units", "requestUnitsM", false, false), meter("storage", "Storage", "storageGB", false, true)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'Azure Cosmos DB' and armRegionName eq '{region}'", meters: {
      requests: { productName: "^Azure Cosmos DB serverless$", meterName: "^1M RUs$", unit: "million RU" },
      storage: { productName: "^Azure Cosmos DB$", skuName: "^RUs$", meterName: "^Data Stored$", unit: "GB-month" },
    } },
    skus: [sku("cosmos-db-serverless", "serverless", "Serverless", ["requests", "storage"])],
  };
}

function redisClassicType(): Json {
  const t: [string, string, string[]][] = [["basic", "Basic", ["C0", "C1", "C2", "C3"]], ["standard", "Standard", ["C0", "C1", "C2", "C3", "C4", "C5", "C6"]], ["premium", "Premium", ["P1", "P2", "P3", "P4", "P5"]]];
  const size: Record<string, string> = { C0: "250 MB", C1: "1 GB", C2: "2.5 GB", C3: "6 GB", C4: "13 GB", C5: "26 GB", C6: "53 GB", P1: "6 GB", P2: "13 GB", P3: "26 GB", P4: "53 GB", P5: "120 GB" };
  const skus: Json[] = [];
  for (const [tid, tier, sizes] of t) for (const s of sizes) skus.push(sku("redis-cache", `${tid}-${s.toLowerCase()}`, `${tier} ${s} (${size[s]})`, ["cache"], { armSku: s, attrs: { tier }, retail: { cache: { productName: `^Azure Redis Cache ${tier}$` } } }));
  return {
    id: "redis-cache", label: "Azure Cache for Redis (Basic, Standard, Premium)", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/cache/",
    note: "Per cache per month. Standard and Premium caches are a replicated pair and the price covers both. The Enterprise tiers are replaced by Azure Managed Redis, listed separately. Reserved pricing is per node and is not offered here.",
    inputs: [input("caches", "Caches", "caches", "Number of caches of this size.")],
    meters: [meter("cache", "Cache", "caches", true, true)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'Redis Cache' and armRegionName eq '{region}'", skuName: "^{armSku}$", meters: { cache: { meterName: "^{armSku} Cache$", unit: "cache-month (730 h)" } } },
    skus,
  };
}

function managedRedisType(): Json {
  const t: [string, string, string, string[]][] = [
    ["balanced", "Balanced", "B", ["0", "1", "3", "5", "10", "20", "50", "100", "250", "500"]],
    ["memory", "Memory Optimized", "M", ["10", "20", "50", "100", "250", "500"]],
    ["compute", "Compute Optimized", "X", ["3", "5", "10", "20", "50", "100", "250", "500"]],
    ["flash", "Flash Optimized", "A", ["250", "500", "700"]],
  ];
  const skus: Json[] = [];
  for (const [tid, tier, letter, sizes] of t) for (const s of sizes) skus.push(sku("azure-managed-redis", `${tid}-${letter.toLowerCase()}${s}`, `${tier} ${letter}${s}`, ["instance"], { armSku: `${letter}${s}`, attrs: { tier }, retail: { instance: { productName: `^Azure Managed Redis - ${tier}$` } } }));
  return {
    id: "azure-managed-redis", label: "Azure Managed Redis", category: "database", docsUrl: "https://azure.microsoft.com/pricing/details/managed-redis/",
    note: "Per instance per month, high availability included. The number in the size is its memory in GB (B10 is about 12 GB). Geo-replication and private endpoints are separate.",
    inputs: [input("instances", "Instances", "instances", "Number of instances of this size.")],
    meters: [meter("instance", "Instance", "instances", true, true)],
    options: ["payg", "ri1", "ri3"],
    retail: { filter: "serviceName eq 'Redis Cache' and armRegionName eq '{region}'", skuName: "^{armSku}$", meters: { instance: { meterName: "^{armSku} Cache Instance$", unit: "instance-month (730 h)" } } },
    skus,
  };
}

// ---------------------------------------------------------------- storage

const BLOB_METERS = [
  meter("capacity", "Capacity", "storageGB", false, true), meter("writes", "Write operations", "writeOps10k", false, false),
  meter("reads", "Read operations", "readOps10k", false, false), meter("retrieval", "Data retrieval", "retrievalGB", false, false),
];
const BLOB_INPUTS = [
  input("storageGB", "Capacity", "GB", "Data stored per month."), input("writeOps10k", "Write operations", "10K operations", "Write operations per month, in tens of thousands."),
  input("readOps10k", "Read operations", "10K operations", "Read operations per month, in tens of thousands."), input("retrievalGB", "Data retrieval", "GB", "Data read back from Cool, Cold or Archive per month."),
];
function blobLike(id: string, label: string, product: string, tiers: [string, string[]][], note: string, docs: string, hns: boolean): Json {
  const skus: Json[] = [];
  for (const [tier, reds] of tiers) for (const red of reds) skus.push(sku(id, `${tier.toLowerCase()}-${red.toLowerCase()}`, `${tier}, ${red}`, ["capacity", "writes", "reads", "retrieval"], { armSku: `${tier} ${red}`, attrs: { tier, redundancy: red }, ...(tier === "Hot" ? { retail: { retrieval: { free: "No data retrieval charge on the Hot tier.", unit: "GB" } }, shared: { retrieval: `${id}-free-retrieval` } } : {}) }));
  return {
    id, label, category: "storage", docsUrl: docs, note, inputs: BLOB_INPUTS, meters: BLOB_METERS, options: ["payg"],
    retail: {
      filter: `serviceName eq 'Storage' and armRegionName eq '{region}' and productName eq '${product}'`, productName: `^${product}$`, skuName: "^{armSku}$",
      meters: {
        capacity: { meterName: "Data Stored$", unit: "GB-month" },
        writes: { meterName: hns ? "^(?!.*(Iterative|Priority)).*Write Operations$" : "^(?!.*(Priority|List and Create)).*Write Operations$", unit: "10K operations" },
        reads: { meterName: hns ? "^(?!.*(Iterative|Priority)).*Read Operations$" : "^(?!.*Priority).*Read Operations$", unit: "10K operations" },
        retrieval: { meterName: "^(?!.*(Priority|Query Acceleration)).*Data Retrieval$", unit: "GB" },
      },
    },
    skus,
  };
}

function filesPayType(): Json {
  const tiers: [string, string, string][] = [["standard", "Standard", "Transaction optimized"], ["hot", "Hot", "Hot"], ["cool", "Cool", "Cool"]];
  const skus: Json[] = [];
  for (const [tid, product, label] of tiers) for (const red of ["LRS", "ZRS"]) skus.push(sku("files-pay-as-you-go", `${tid}-${red.toLowerCase()}`, `${label}, ${red}`, ["capacity", "writes", "reads", "retrieval"], { armSku: `${product} ${red}`, attrs: { tier: label, redundancy: red }, ...(tid !== "cool" ? { retail: { retrieval: { free: "No data retrieval charge on this tier.", unit: "GB" } }, shared: { retrieval: "files-pay-as-you-go-free-retrieval" } } : {}) }));
  return {
    id: "files-pay-as-you-go", label: "Azure Files (pay-as-you-go)", category: "storage", docsUrl: "https://azure.microsoft.com/pricing/details/storage/files/",
    note: "Standard file shares billed on used capacity and transactions. Snapshots, metadata and list operations, Azure File Sync and geo-redundant shares are not included.",
    inputs: BLOB_INPUTS, meters: BLOB_METERS, options: ["payg"],
    retail: {
      filter: "serviceName eq 'Storage' and armRegionName eq '{region}' and productName eq 'Files v2'", productName: "^Files v2$", skuName: "^{armSku}$",
      meters: {
        capacity: { meterName: "Data Stored$", unit: "GB-month" }, writes: { meterName: "^(?!.*(List|Soft)).*Write Operations$", unit: "10K operations" },
        reads: { meterName: "^(?!.*(Protocol|Soft)).*Read Operations$", unit: "10K operations" }, retrieval: { meterName: "Data Retrieval$", unit: "GB" },
      },
    },
    skus,
  };
}

function filesProvisionedType(): Json {
  const skus: Json[] = [];
  for (const media of ["SSD", "HDD"]) for (const red of ["LRS", "ZRS"]) skus.push(sku("files-provisioned-v2", `${media.toLowerCase()}-${red.toLowerCase()}`, `${media === "SSD" ? "SSD" : "HDD"}, ${red}`, ["capacity", "iops", "throughput"], { armSku: `${media} ${red}`, attrs: { media, redundancy: red } }));
  return {
    id: "files-provisioned-v2", label: "Azure Files (provisioned v2)", category: "storage", docsUrl: "https://azure.microsoft.com/pricing/details/storage/files/",
    note: "You provision storage, IOPS and throughput for the share. A formula adds a free IOPS and throughput amount to the provisioned storage: enter only IOPS and MiB/s you provision above that.",
    inputs: [input("storageGiB", "Provisioned storage", "GiB", "Provisioned share size."), input("iops", "Extra IOPS", "IOPS", "Provisioned IOPS above the included amount."), input("mibps", "Extra throughput", "MiB/s", "Provisioned throughput above the included amount.")],
    meters: [meter("capacity", "Provisioned storage", "storageGiB", true, true), meter("iops", "Extra IOPS", "iops", true, true), meter("throughput", "Extra throughput", "mibps", true, true)],
    options: ["payg"],
    retail: {
      filter: "serviceName eq 'Storage' and armRegionName eq '{region}' and productName eq 'Azure Files Provisioned v2'", productName: "^Azure Files Provisioned v2$", skuName: "^{armSku}$", precise: true,
      meters: {
        capacity: { meterName: "Provisioned Storage$", unit: "GiB-month (730 h)" }, iops: { meterName: "^(?!.*Free).*Provisioned IOPS$", unit: "IOPS-month (730 h)" },
        throughput: { meterName: "^(?!.*Free).*Provisioned Throughput MiBPS$", unit: "MiB/s-month (730 h)" },
      },
    },
    skus,
  };
}

function queueType(): Json {
  return {
    id: "queue-storage", label: "Queue Storage", category: "storage", docsUrl: "https://azure.microsoft.com/pricing/details/storage/queues/",
    note: "Classic Queue Storage pricing (the Retail API also lists a Queues v2 meter set at about ten times the transaction price; it is not used until Microsoft documents which accounts it applies to).",
    inputs: [input("storageGB", "Capacity", "GB", "Data stored per month."), input("ops10k", "Operations", "10K operations", "Queue operations per month, in tens of thousands.")],
    meters: [meter("capacity", "Capacity", "storageGB", false, true), meter("ops", "Operations", "ops10k", false, false)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'Storage' and armRegionName eq '{region}' and productName eq 'Queues'", productName: "^Queues$", skuName: "^{armSku}$", precise: true, meters: { capacity: { meterName: "Data Stored$", unit: "GB-month" }, ops: { meterName: "Class 1 Operations$", unit: "10K operations" } } },
    skus: ["LRS", "GRS"].map((r) => sku("queue-storage", r.toLowerCase(), `Standard, ${r}`, ["capacity", "ops"], { armSku: `Standard ${r}` })),
  };
}

function tableType(): Json {
  return {
    id: "table-storage", label: "Table Storage", category: "storage", docsUrl: "https://azure.microsoft.com/pricing/details/storage/tables/",
    note: "Capacity and read and write transactions. All transaction types carry the same price.",
    inputs: [input("storageGB", "Capacity", "GB", "Data stored per month."), input("ops10k", "Operations", "10K operations", "Table operations per month, in tens of thousands.")],
    meters: [meter("capacity", "Capacity", "storageGB", false, true), meter("ops", "Operations", "ops10k", false, false)],
    options: ["payg"],
    retail: { filter: "serviceName eq 'Storage' and armRegionName eq '{region}' and productName eq 'Tables'", productName: "^Tables$", skuName: "^{armSku}$", precise: true, meters: { capacity: { meterName: "Data Stored$", unit: "GB-month" }, ops: { meterName: "^Read Operations$", unit: "10K operations" } } },
    skus: ["LRS", "ZRS", "GRS"].map((r) => sku("table-storage", r.toLowerCase(), `Standard, ${r}`, ["capacity", "ops"], { armSku: `Standard ${r}` })),
  };
}

// ---------------------------------------------------------------- assembly

export function buildFiles(): Record<string, Json> {
  const compute = [vmType(), diskType("disk-premium-ssd", "Managed disk, Premium SSD", "P", "Premium SSD Managed Disks", ["payg", "ri1"]), diskType("disk-standard-ssd", "Managed disk, Standard SSD", "E", "Standard SSD Managed Disks", ["payg"]), diskType("disk-standard-hdd", "Managed disk, Standard HDD", "S", "Standard HDD Managed Disks", ["payg"]), premiumSsdV2Type(), aksType(), aspType(), functionsPremiumType(), functionsFlexType(), functionsConsumptionType(), aciType(), swaType(), acrType()];
  const database = [sqlDbType(), sqlDtuType(), sqlMiType(), sqlLicenceType(), pgmyType("postgres"), pgmyBurstType("postgres"), pgmyType("mysql"), pgmyBurstType("mysql"), cosmosProvisionedType(), cosmosServerlessType(), redisClassicType(), managedRedisType()];
  const REDS = ["LRS", "ZRS", "GRS", "RA-GRS"];
  const storage = [
    blobLike("blob-storage", "Blob Storage (block blob)", "General Block Blob v2", [["Hot", REDS], ["Cool", REDS], ["Cold", REDS], ["Archive", ["LRS", "GRS", "RA-GRS"]]],
      "Capacity, write and read operations and data retrieval per tier and redundancy. Early-deletion fees, index tags, lifecycle management, inventory, priority retrieval and archive rehydration are not included.", "https://azure.microsoft.com/pricing/details/storage/blobs/", false),
    blobLike("data-lake-gen2", "Data Lake Storage Gen2 (hierarchical namespace)", "General Block Blob v2 Hierarchical Namespace", [["Hot", ["LRS", "ZRS", "GRS"]], ["Cool", ["LRS", "ZRS", "GRS"]], ["Cold", ["LRS", "ZRS", "GRS"]], ["Archive", ["LRS"]]],
      "Block blob storage with a hierarchical namespace. Capacity, write and read operations and data retrieval; iterative operations, query acceleration, metadata index and early-deletion fees are not included.", "https://azure.microsoft.com/pricing/details/storage/data-lake/", true),
    filesPayType(), filesProvisionedType(), queueType(), tableType(),
  ];
  const files: Record<string, Json> = {};
  for (const [category, types, note] of [
    ["compute", compute, "Part 1 of the catalogue: virtual machines, managed disks, AKS, App Service, Functions Premium, Container Instances, Static Web Apps and Container Registry. Container Apps are priced through unit-prices.json (the `container-apps-*` entries), not here."],
    ["database", database, "Part 1 of the catalogue: Azure SQL (vCore, DTU, Managed Instance), SQL Server licences for VMs, PostgreSQL and MySQL flexible servers, Cosmos DB, Azure Cache for Redis and Azure Managed Redis."],
    ["storage", storage, "Part 1 of the catalogue: Blob, Data Lake Gen2, Files, Queue and Table storage."],
  ] as [string, Json[], string][]) files[category] = { category, note, types, unitPrices: [] };
  Object.assign(files, buildPart2());
  return files;
}

function main() {
  // `pnpm prices:scaffold -- messaging network` rewrites only the named categories.
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const built = buildFiles();
  for (const [category, file] of Object.entries(built)) {
    if (only.length && !only.includes(category)) continue;
    const path = join(OUT, `${category}.json`);
    const existing: Json = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { unitPrices: [] };
    const used = new Set(file.types.flatMap((t: Json) => t.skus.flatMap((s: Json) => Object.values(s.prices))));
    // Vendor-doc and placeholder prices come from the scaffold itself (`file.unitPrices`); Retail API prices are kept from the existing file.
    const own = new Set((file.unitPrices as Json[]).map((u) => u.id));
    file.unitPrices = [...(existing.unitPrices as Json[]).filter((u) => used.has(u.id) && !own.has(u.id) && !String(u.id).startsWith("seed-")), ...file.unitPrices];
    writeFileSync(path, formatResourceFile(file));
    console.log(`${category}: ${file.types.length} types, ${file.types.reduce((n: number, t: Json) => n + t.skus.length, 0)} SKUs`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
