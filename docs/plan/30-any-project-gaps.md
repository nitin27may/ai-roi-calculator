# Any-project scope: gap analysis (2026-10-07)

## Context
The owner wants the calculator to estimate cost and ROI for any change, not only AI. A project can be one of these types, or a mix:
- **Automation:** for example, RPA or workflow.
- **Replatform or migration:** for example, lift-and-shift, move to PaaS, or replace with SaaS.
- **New application or new process:** for example, paying claims online instead of printing and couriering cheques.
- **Enhancement:** a new feature in an existing app.
- **AI:** today's scope.

Each project needs:
- **Build cost:** people by role (developer, architect, BA, BSA, QA, PM and so on), plus tools.
- **Infrastructure per environment:** Postgres, SQL Server, App Service, VMs and so on, for dev, test, UAT and prod.
- **Production run cost.**
- **Savings:** money, plus time, speed and experience.

The Dev Lab must also work without AI, and it must treat AI-assisted development and testing as a normal productivity input.

Two references:
- **The current repo:** this repository.
- **An earlier internal calculator** (not part of this repository).

Both were mapped read-only on 2026-10-07. This step only produces the gap list and the brainstorm agenda. No code is written until the brainstorm decisions are made.

## What already carries over (generic today)
- **Ledger and ROI:**
  - one ledger, `summarize()`, payback, NPV, IRR, hurdle, terminal value, capex/amortisation and scenarios (`packages/engine/src/roi.ts`, `ledger.ts`, `report.ts`);
  - streams: labour, devlab, devenv, run, platform, maint, transition.
- **Team and maintenance:** team lines with phase, allocations, `costed` and `rateOverride`; the rate card; contingency; maintenance as a team or a % of build.
- **Benefits:**
  - capabilities (hours, per task, per user per week, per volume);
  - avoided costs (amount or headcount);
  - value items (revenue, quality, risk);
  - one-off benefits and transition costs.
- **Costs with no catalogue price:** cash items and fixed items (`CashItemSchema`, `FixedItemSchema` in `project.ts`), and hosting presets (`hosting.ts`).

## What the earlier internal calculator has that we lack (reuse it)
- **Current state:**
  - itemised "what we pay today" lines (`CurrentStateLineSchema`, `showcase/.../schema.ts:499`) and `computeCurrentState`;
  - avoided costs that `replace` a current line and can be `conditional`, for example "only if the old system is decommissioned".
- **Resource type files:** each resource is a JSON file in `catalogue/types/*.json` with Retail API filters and form inputs. Types: Postgres flexible (9 SKUs, storage, backup, HA), App Service P1v3/P2v3, AKS cluster and node pools (11 VM SKUs), Container Apps, ACR, Blob, Files, Redis, Key Vault, APIM, App Config, private endpoint, NAT gateway, Log Analytics, Neo4j, SaaS subscription per seat, and fixed-fee contracts. The price fetcher is in `showcase/.../packages/fetcher`.
- **Delivery plan:**
  - phases: discovery, design, build, test, migration/cutover, deploy, hypercare;
  - effort entered as hours or as people × weeks;
  - a 15% contingency;
  - a richer role card: BA, QA, PM, DevOps, UX, data engineer, tech lead, support analyst.
- **Template:** `application-modernisation.json`, which has a current state, dual running and conditional decommissioning.

## Gaps (both tools)
| # | Gap | Today | Needed |
|---|---|---|---|
| G1 | Project type | Everything is framed as AI: name, tour, wizard step 1, story ("testing N candidate models"), Overview lanes ("Model bake-off"…), KPI "of it AI Dev Lab", Capacity (PTU) always in the nav | A project type (or mix of types) per project and per feature; AI-only pages and terms shown only when AI is used; neutral product name and wording |
| G2 | Environments | No dev/test/UAT/prod model in either tool. Only `build.environment` during build | An environment list per project. For each: resources (or a multiplier of prod), hours per month (for example dev 10 h × 22 days), start and end months, and dev/test pricing |
| G3 | Infrastructure catalogue | Missing from ours: Postgres, Azure SQL, SQL MI, SQL Server on VM, VMs (Linux/Windows), App Service tiers other than P0/P1v3 Linux, Functions, Service Bus, Event Grid, Front Door/App Gateway, Logic Apps, Data Factory, Backup/Site Recovery, storage tiers. The old tool has Postgres, VMs (as AKS nodes) and Redis, but not SQL, Windows, reserved pricing or a Service Bus | Typed resources with SKU pickers, priced by the Retail API refresh (`scripts/prices`), porting the old type files. Pricing options: pay-as-you-go, 1- or 3-year reserved, savings plan, Azure Hybrid Benefit |
| G4 | Current state against target state | Ours: lump-sum avoided costs. The old tool: current-state lines plus dual running | Itemised current state (people, licences, infrastructure, and per-transaction costs such as cheque stock, printing, postage, courier, reconciliation and re-issue), against the target state. Savings come from the difference, with decommission timing and dual running |
| G5 | Unit economics | Per-volume time savings only | Per-transaction cost before and after × volume, for non-labour costs (for example, a cheque at C$X against an EFT at C$Y per payment), plus transaction fees in the target state (payment gateway, API calls) |
| G6 | Non-financial benefits | None in either tool | A benefit scorecard: speed (cycle time in days to hours), customer experience (CSAT/NPS), employee experience, compliance/risk, agility. Each has a before/after measure, a weight and a confidence. Each can be turned into money (for example, faster payment means fewer "where is my cheque" calls, valued at call cost). It is shown next to the financial ROI and kept out of NPV unless monetised |
| G7 | Delivery model | Team lines with an optional phase. AI-flavoured roles. No BSA, QA, PM, DBA, UX or change roles | Standard phases (discovery → hypercare) with templates; a full role card (BA, BSA, QA, PM, Scrum master, DevOps, DBA, UX, data engineer, tech lead, change/training); non-labour delivery costs (vendor professional services, training, communications, data migration) |
| G8 | Dev Lab without AI | All nine Dev Lab activities are AI. AI-assisted development is a seat cost (`tooling`) plus a flat `devCutPct` | Rename to "Engineering tools & lab": dev tools and licences, test environments, load/performance testing, and AI-assisted development with a productivity factor per role that lowers build effort and shows the saving. AI experiments become an optional section |
| G9 | Run cost beyond AI | `fixed`/`hosting` workloads only | Production made of environment resources plus licences per user, vendor and support contracts, per-transaction fees and support headcount; AI usage is one kind among them |
| G10 | Templates and wizard | 15 recipes, of which only `nonai` is not AI (one lump sum) | Non-AI recipes: cheques to online payments, RPA/automation, lift-and-shift, replatform to PaaS, replace with SaaS, new app for a new process, enhancement to an existing app, data platform. Wizard step 1 becomes "What kind of change?" |
| G11 | Scenarios and sensitivity | Levers are AI (bake-off, Batch, cache, routing, STT) | Generic levers too: reserved %, SKU size, environment hours, volume, labour rates, delivery length, adoption, decommission month |
| G12 | Portfolio | Compare and portfolio cards exist | Group and filter by project type; compare payback and the benefit scorecard across types |

## Resource master (G3 in detail)

The aim is a master catalogue that covers the 80–90% of Azure resources real projects use. Each resource is a typed entry: SKU picker, quantity inputs, environment, hours per month. Each is priced from the Azure Retail Prices API by the existing `scripts/prices` refresh. Anything missing is added later as data, not code.

| Group | Resources |
|---|---|
| Compute | Virtual machines, Windows and Linux (B, D, E, F series, current generations), VM scale sets, managed disks (Premium SSD v1/v2, Standard SSD, Standard HDD); AKS (control plane Free / Standard / Premium, node pools priced as VMs, Windows node pools); Container Apps (consumption, dedicated workload profiles); App Service (Basic, Standard, Premium v3, Isolated v2; Windows and Linux); Functions (consumption, flex consumption, premium); Container Instances; Static Web Apps; Container Registry |
| Databases | Azure SQL Database (vCore General Purpose / Business Critical / Hyperscale, serverless, DTU), SQL Managed Instance, SQL Server on a VM (Standard / Enterprise licence, or Azure Hybrid Benefit); PostgreSQL flexible server (compute, storage, backup, HA); MySQL flexible server; Cosmos DB (provisioned, autoscale, serverless RU; storage); Azure Cache for Redis and Azure Managed Redis |
| Storage | Blob (hot, cool, cold, archive; LRS, ZRS, GRS; transactions), Files, Queues, Tables; Data Lake |
| Messaging and integration | Service Bus (Basic, Standard, Premium messaging units), Event Grid, Event Hubs (Standard, Premium, Dedicated), Logic Apps (consumption, standard), API Management (Consumption, Developer, Basic v2, Standard v2, Premium v2, classic Premium units), Relay, Notification Hubs, Data Factory |
| Networking | Virtual network peering, private endpoints, NAT gateway, Application Gateway v2 / WAF, Front Door Standard / Premium, Load Balancer, VPN gateway, ExpressRoute, Azure Firewall, Bastion, DDoS protection, DNS zones, egress |
| Security and identity | Key Vault (Standard, Premium, Managed HSM), Defender for Cloud plans (servers, SQL, App Service, storage, containers, Key Vault), Microsoft Sentinel ingestion, Entra ID P1 / P2 per user |
| Monitoring and management | Log Analytics workspace (analytics and basic logs ingestion, retention, archive), Application Insights, Azure Monitor (metrics, alerts), App Configuration (Free, Standard, Premium), Backup (protected instances and storage), Site Recovery, Automation |
| Data and analytics | Fabric capacity, Synapse, Databricks DBUs, Power BI per user / capacity |
| Licences and seats | Windows Server and SQL Server licences, Azure DevOps users and parallel jobs, GitHub seats, GitHub Copilot, Microsoft 365 / Power Platform seats, any SaaS per seat |
| AI (already covered) | Azure OpenAI and Foundry models, AI Search, Document Intelligence, Speech, Content Safety, Snowflake Cortex |

**Pricing options per resource:**
- pay-as-you-go;
- 1- and 3-year reserved instances;
- savings plan;
- Azure Hybrid Benefit for Windows and SQL;
- dev/test pricing for non-production environments.

**Hours per month:** 730 by default, or a schedule (for example, dev 10 h × 22 days).

**Price data and quality:**
- Every price records its date and the Retail API filter it came from, and can be overridden by hand with a "manual" tag.
- A coverage test fails if a catalogue resource has no price.
- The earlier calculator's type files and its fetcher filters are the starting point. That fetcher dropped reserved and Windows meters on purpose, so those filters change.

## Brainstorm agenda
Asked one question at a time, per CLAUDE.md:
1. **Project types:** what are the names and the list? Is it per project or per feature (a mix)?
2. **Product name:** neutral (for example "Cost & ROI Studio"), and where does the token calculator live?
3. **Environments:** what is the default set (dev, test, UAT, prod, DR?), and is it defined by resources or as multipliers of prod?
4. **Infrastructure catalogue:** which resources come first (Postgres, Azure SQL, SQL MI, VMs, App Service, Functions, Service Bus…), and is reserved or hybrid-benefit pricing in scope now?
5. **Current state:** how detailed (itemised resources and per-transaction costs, or lump sums), and are decommission and dual running per line?
6. **Non-financial benefits:** a scorecard only, or a scorecard with optional monetisation? Which measures (speed, CSAT/NPS, compliance, employee time)?
7. **Dev Lab:** confirm the rename, and how the AI-assisted productivity factor is set (per role, as a %), and whether it reduces build effort or only reports a saving.
8. **Cheque-to-online example:** which numbers to seed as the reference template (volumes, unit costs)?

## Decisions (brainstorm, 2026-10-07)
1. **Project types:** six: new application or process, enhancement to an existing application, automation, replatform or migration, replace with SaaS, and AI. The type is set per feature, so one project can mix types. Nothing is preselected.
2. **Environments:** resources are defined once (production). Each environment (user-defined: dev, test, UAT, production, DR) has a size factor, hours per month (a schedule such as 10 h x 22 days), and a start and end month.
3. **Infrastructure pricing options in the first release:** pay-as-you-go, 1- and 3-year reserved, Azure Hybrid Benefit and dev/test rates. Savings plan is deferred.
4. **Current state:** itemised lines (people, licences, infrastructure, per-transaction costs). Each line can be kept, reduced or retired from a month, with dual running and conditional decommissioning. Savings are the difference between current and target.
5. **Non-financial benefits:** a scorecard with optional monetisation. Only monetised items enter NPV and payback.
6. **AI-assisted development:** a per-role productivity percentage that lowers build hours, plus the tool seat and token cost, with the net saving shown. The Dev Lab becomes "Engineering tools & lab", and AI experiments become an optional section.
7. **Reference template:** "cheques to online payments", seeded with illustrative numbers, each labelled as an assumption to replace.

The phased build plan is in [50-any-project-build-plan.md](50-any-project-build-plan.md).
