/** Glossary terms. Plain language first, the technical meaning underneath. Rendered by app/glossary and linked from field hints. */
export interface GlossaryTerm {
  id: string;
  term: string;
  plain: string;
  technical: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: "scorecard",
    term: "Scorecard",
    plain: "A short list of benefits that are not money, such as faster payment, happier customers, less rework for staff, lower compliance risk or a quicker response to change. Each has a before and an after value. The scorecard sits next to the financial ROI and does not change it, unless you put a price on an item.",
    technical: "Improvement of an item = (after - before) / before when higher is better and (before - after) / before when lower is better; undefined when before is 0. Composite index = sum(weight x improvement) / sum(weight) over items with a weight. Confidence is shown beside it and does not discount it. A monetised item adds units moved in the good direction x value per unit x monthly volume x confidence to each production month, following the adoption ramp from go-live; only those amounts enter NPV, payback and IRR.",
  },
  {
    id: "score-dimension",
    term: "Dimension",
    plain: "The kind of benefit a scorecard item is: speed, customer experience, employee experience, compliance and risk, agility, or other. It groups the items and does nothing to the numbers.",
    technical: "A label on a scorecard item. It has no effect on the improvement, the composite index or the monetised value.",
  },
  {
    id: "current-state",
    term: "Current state and dual running",
    plain: "Current state is what the work costs today, line by line: people, licences, infrastructure and costs per transaction such as stock, postage or courier. Each line can be kept, reduced or retired from a chosen month. Dual running is the stretch where the old cost is still being paid while the new one already is.",
    technical: "Saving in a month = current cost minus what remains. A reduce that follows adoption ramps with the adoption ramp; a retire starts in its month; a conditional line that is not assumed saves nothing. People lines rise with rate escalation. Dual-running cost sums, over months where the new run cost is billed, the cost of lines due to go away that has not yet gone.",
  },
  {
    id: "environment",
    term: "Environment",
    plain: "A separate copy of the system that runs for a purpose: dev for building, test for checking, UAT for the business to sign off, production for real use, DR for disaster recovery. You define resources once, as production, and each environment runs a smaller or shorter-lived version of them.",
    technical: "Each environment has a size factor, a schedule, optional first and last billed months and a pricing choice (pay-as-you-go or dev/test). Production environments are billed from go-live under running cost. Non-production environments are billed in the build months by default and are counted as environment cost, which Running cost only leaves out.",
  },
  {
    id: "size-factor",
    term: "Size factor",
    plain: "How big an environment is next to production. 0.5 means half the size, so half the cost for the parts of the price that grow with size.",
    technical: "Multiplies the quantity-times-price of every meter marked as scaling with size (compute, storage, throughput). Flat meters such as a fixed monthly fee ignore it. Reserved prices are scaled too, but not by the schedule.",
  },
  {
    id: "schedule-hours-per-month",
    term: "Schedule (hours per month)",
    plain: "How many hours a month an environment is switched on. A dev environment on for 10 hours a day, 22 days a month, runs 220 hours instead of 730, so it costs about 30% of an always-on copy.",
    technical: "Hours a day times days a month, or hours a month directly; 730 means always on. Hourly pay-as-you-go and dev/test meters are scaled by hours divided by 730. A reservation bills 730 hours whatever the schedule, so scheduling a reserved resource saves nothing and the line says so.",
  },
  {
    id: "delivery-phase",
    term: "Delivery phase",
    plain: "A stage of the build, such as discovery, design, build, test, migration and cutover, deploy and hypercare. Team lines can be placed in a phase so the cost reads by stage.",
    technical: "A phase is a label with a first and last project month. The standard list is spread over the build months by choice, never added on its own. A team line in a phase follows the phase's months unless it has its own From and To. Phases may overlap.",
  },
  {
    id: "hypercare",
    term: "Hypercare",
    plain: "The weeks after go-live when the delivery team stays close to the system to fix early problems. It is the one delivery phase that can run past the end of the build.",
    technical: "Team lines in the hypercare phase are billed as labour in the production months the phase covers, with contingency, and are counted with build cost. No other line is billed after the last build month. Without a hypercare phase that ends after the build, nothing is billed after go-live.",
  },
  {
    id: "delivery-costs",
    term: "Delivery costs",
    plain: "Costs of getting the project live that are not people's time and not infrastructure: vendor or integrator work, training, communications, data migration.",
    technical: "Each item is a one-off amount in a build month or a monthly amount in every build month, in its own stream. They count in build cost and the Full lifecycle basis only, take contingency when it covers all costs, are not reduced by the AI dev-cost cut, and are in the base of maintenance as a percent of build, like the dev environment.",
  },
  {
    id: "snowflake-credit",
    term: "Snowflake credit",
    plain: "Snowflake bills in credits, not dollars. The ROI Calculator shows the credits each workload uses and multiplies them by what one credit costs you in Canadian dollars, so you can see both numbers.",
    technical: "AI credits cover Cortex AI functions, Search, Agents and the REST API; platform credits cover warehouses and similar compute. CAD = credits x CAD per credit. The default CAD per credit comes from the catalogue (routing for AI credits, edition for platform credits); Settings, Snowflake lets you replace either with your contract rate, and a manual tag marks the figures that use it.",
  },
  {
    id: "token",
    term: "Token",
    plain: "The unit a model reads and writes. A token is a short piece of a word, so a typical English word is a little over one token. Models are priced per million tokens.",
    technical: "A subword unit produced by the model's tokenizer. The ROI Calculator uses about 1.33 tokens per English word and applies per-language multipliers for other languages (Settings, Default language).",
  },
  {
    id: "input-cached-output",
    term: "Input, cached and output tokens",
    plain: "Input is what you send: instructions, the question, documents. Output is what the model writes back, and it costs several times more per token. Cached input is a repeated opening the provider has seen recently, billed at a fraction of the normal input price.",
    technical: "Azure OpenAI bills three rates per model: uncached input, cached input and output. A cache hit rate on a field is the share of input tokens that land on a cached prefix. Caching only applies to prompts that repeat their first tokens exactly, and not below about 1,024 tokens.",
  },
  {
    id: "reasoning-tokens",
    term: "Reasoning tokens",
    plain: "Thinking the model does before it answers. You never see this text, but you pay for it as output. Higher reasoning effort gives better answers on hard tasks and a larger bill.",
    technical: "Hidden chain-of-thought tokens billed at the output rate. For agent harnesses the ROI Calculator adds roughly 500, 2,000 or 6,000 reasoning tokens per step for low, medium and high effort. Models without a reasoning mode ignore the setting.",
  },
  {
    id: "cache-write",
    term: "Cache write",
    plain: "The first time a prefix is stored in the cache. Some providers charge a little extra for the write, and then much less every time the prefix is read back.",
    technical: "Anthropic-style prompt caching bills a write at a premium over base input and a read at a discount. Azure OpenAI caching has no write premium. The ROI Calculator applies a write premium only to models whose price list carries one.",
  },
  {
    id: "deployment-types",
    term: "Deployment type (Global, Canada Regional, US Data Zone)",
    plain: "Where Azure runs your model. Global is cheapest and may process data in any Azure region. A regional or data-zone deployment keeps processing inside Canada or the US and costs more. Pick the one your data rules allow.",
    technical: "Azure OpenAI deployment SKUs: Global Standard, Regional (Canada) and Data Zone (US). Each has its own price per model and not every model is offered in every deployment. When a model is unavailable the ROI Calculator flags it instead of pricing it from another deployment.",
  },
  {
    id: "processing-tiers",
    term: "Processing tier (Standard, Batch)",
    plain: "Standard answers immediately. Batch costs about half as much, but results come back within a day, so it suits overnight jobs such as evaluation runs and synthetic data and does not suit live chat.",
    technical: "Azure OpenAI Global Batch is billed at a discount to Standard and runs asynchronously with a 24-hour completion window. Priority and Flex tiers exist but are not priced in the ROI Calculator yet.",
  },
  {
    id: "ptu",
    term: "PTU (provisioned throughput)",
    plain: "Reserved model capacity that you pay for by the hour or by the month whether you use it or not. It gives steady speed and a predictable bill, and it only beats pay-as-you-go when the capacity stays busy.",
    technical: "Provisioned Throughput Units. Each model publishes tokens per minute per PTU, with a minimum deployment size and a purchase increment. The Capacity page sizes PTUs from peak requests per minute, prompt and response size and the cached share.",
  },
  {
    id: "ai-dev-lab",
    term: "AI Dev Lab",
    plain: "The model spend of the build phase: the experiments, test runs and evaluations the team runs while building the feature, before anyone uses it in production.",
    technical: "A set of build-phase activities (bake-off, iterations, regression, evaluation, red team, playground, synthetic data, fine-tuning, tooling) priced from the same token prices as production and shown apart from labour in the build cost.",
  },
  {
    id: "dev-lab-typed-cost",
    term: "Typed Dev Lab cost",
    plain: "A C$ amount you type into one cell of the Build cost grid to replace what the ROI Calculator calculated for that activity and month. Edited cells are marked, and you can reset any of them to the calculation.",
    technical: "Stored per activity as a month-to-CAD map. A typed amount replaces that activity's calculated lines for the month and is final: contingency and the AI development-cost cut are not applied on top. A fixed monthly Dev Lab allowance, if set, replaces the whole calculation and the typed cells for every build month.",
  },
  {
    id: "harness",
    term: "Harness",
    plain: "The setup around an agent that decides how many tokens one task uses: its instructions, its tools, how many steps it takes and how much each tool returns.",
    technical: "A reusable agent profile: system prompt, tool definitions, steps, tool calls per step, result size, reasoning effort and caps. The same harness feeds Dev Lab experiments and production agent workloads, so one edit flows through both.",
  },
  {
    id: "image-tokens",
    term: "Image tokens",
    plain: "A picture sent to a model is charged in tokens, like text. Bigger pictures cost more, up to a cap, and each model family counts them its own way. A page with a chart can cost more in picture tokens than in words.",
    technical: "OpenAI GPT-4o class models use 512 px tiles (85 tokens plus 170 per tile, or a flat 85 at low detail). GPT-5.4 class models use 32 px patches times a model multiplier, capped at 1,536 patches. Claude uses width x height / 750, capped near 1,600 tokens. A model with no published formula in the catalogue is flagged unverified and adds no picture tokens.",
  },
  {
    id: "tool-result",
    term: "Tool result",
    plain: "What a tool sends back to the agent: a file's contents, search hits, or what a program printed. The model reads it as input, so a large result costs money now and again on every later step.",
    technical: "Tokens returned by tool calls and appended to the conversation. The harness takes one average size per step. For a code interpreter that is the printed output of the code, about 3 tokens a spreadsheet cell.",
  },
  {
    id: "agent-loop",
    term: "Agent loop",
    plain: "One round of an agent's work: the model is called, it asks for a tool, the tool runs, and the result goes back. A task is several loops. A step cap and a token budget stop a loop that will not end.",
    technical: "One model call per loop. The ROI Calculator simulates each call, so cost follows the real prompt size at every step, with caching, compaction and the context window applied. The run reports why it stopped: finished, step cap, token budget or context window.",
  },
  {
    id: "history-growth",
    term: "History growth",
    plain: "The model remembers nothing between calls, so every loop re-sends the instructions, the question and everything said and returned so far. The prompt gets bigger each loop, and total input grows much faster than the number of loops.",
    technical: "Input on loop k is the fixed prefix plus the history from loops 1 to k-1, so total input grows roughly with the square of the step count. Caching makes the repeated part cheaper, and compaction replaces old history with a summary.",
  },
  {
    id: "code-interpreter",
    term: "Code interpreter",
    plain: "A sandbox where the agent writes a small program, runs it and reads what it prints. It lets the agent analyse a big spreadsheet without putting every row in the conversation. The code the agent writes is billed as output, and each session has a fee.",
    technical: "Azure AI Foundry Agent Service Code Interpreter is billed per session, from the catalogue. Generated code and its printed output both stay in the history that later loops re-send, so the harness has separate inputs for code tokens and execution-output tokens per step.",
  },
  {
    id: "token-budget",
    term: "Token budget",
    plain: "A limit on the total tokens one task may use. When the agent crosses it the task stops, so a task that goes wrong cannot run up a large bill. It is checked between calls, so the call that crosses the line still finishes.",
    technical: "Input (cached included) plus output tokens, summed over every call and every compaction call. The harness checks it before each call after the first. The result carries a stop reason of token budget when it is what ended the run.",
  },
  {
    id: "p50-p90",
    term: "P50 and P90",
    plain: "P50 is the typical case: half of tasks use less and half use more. P90 is a bad day: nine in ten tasks use less. Budget on P50 and look at P90 to see how much headroom you need.",
    technical: "Percentiles of cost per agent task. The ROI Calculator takes P50 from the harness inputs and estimates P90 as 1.8 times the steps and 1.5 times the tool-result size. The percentile switch on the Run page chooses which one the totals use.",
  },
  {
    id: "npv",
    term: "NPV (net present value)",
    plain: "What the whole stream of costs and benefits is worth in today's money. A dollar next year is worth less than a dollar now, so later months count for less. A positive NPV means the project returns more than the discount rate.",
    technical: "The sum of monthly net cash flow (benefit minus cost), each month divided by (1 + r) raised to the month number, where r is the monthly equivalent of the annual discount rate set on Value & ROI.",
  },
  {
    id: "payback",
    term: "Payback",
    plain: "The month in which the money earned back overtakes the money spent. Before that month the project is still in the red on a running total.",
    technical: "The first month from which cumulative net cash flow stays at zero or above. It is not discounted. It reads as more than the plan length when it does not happen within the horizon.",
  },
  {
    id: "irr",
    term: "IRR (internal rate of return)",
    plain: "The yearly return the project earns on the money put in. It is the discount rate at which the project exactly breaks even. Compare it with what else the money could earn.",
    technical: "The rate that sets NPV to zero, found on the monthly cash flows and shown as a yearly rate. It includes any terminal value you set. It is undefined when the flows never change sign, and with several sign changes the figure is the root nearest zero.",
  },
  {
    id: "realisation",
    term: "Realisation",
    plain: "How much of the time saved turns into real value. If a tool saves 100 hours and people spend half of that on other useful work, realisation is 50% and only half the hours count as a benefit.",
    technical: "A factor applied to hours saved before they are multiplied by the loaded hourly rate: benefit = hours saved x adoption x realisation x rate.",
  },
  {
    id: "month-index",
    term: "Month index (M1)",
    plain: "Months are numbered from the start of the project. Month 1, shortened to M1, is the first build month. Months 1 to 6 are build by default and the rest are production, and the numbers can be turned into calendar months with the start date in Settings.",
    technical: "A 1-based index into the ledger. The build length and plan length are Build months and Plan length in Settings. Tables write Month 1; tight charts write M1 and carry this legend.",
  },
  {
    id: "intensity",
    term: "Intensity",
    plain: "How hard an activity runs in a given month. 100% means the full volumes set on the activity, 50% means half and 0% means it is switched off that month.",
    technical: "A per-month multiplier between 0 and 1 applied to an AI Dev Lab activity's volumes before pricing. Labour and any per-person items additionally scale with headcount where the activity says so.",
  },
  {
    id: "project-type",
    term: "Project type",
    plain: "The kind of change a feature is. There are six: new application or process, enhancement to an existing application, automation, replatform or migration, replace with SaaS, and AI. A feature can have more than one, and none is chosen until you pick it.",
    technical: "Stored as a list on each feature. The project's types are the union across its features. Types only decide what is shown: the Capacity (PTU) page and the AI choices in the Build and Run add menus appear when a feature is AI or the project already has AI workloads or Dev Lab activities. They never change a cost.",
  },
  {
    id: "type-new-app",
    term: "New application or process",
    plain: "Something built or set up from scratch, with nothing existing to change.",
    technical: "Project type newApp. Its costs are the build and the run of the new thing; any current cost it replaces is entered separately.",
  },
  {
    id: "type-enhancement",
    term: "Enhancement to an existing application",
    plain: "New capability added to a system that stays in place.",
    technical: "Project type enhancement. Only the added work and the added running cost belong in the estimate.",
  },
  {
    id: "type-automation",
    term: "Automation",
    plain: "Replacing manual steps with software or robots, so people spend their time on something else.",
    technical: "Project type automation. The benefit is usually time saved or cost avoided; it needs no AI workloads, so the AI pages stay hidden.",
  },
  {
    id: "type-replatform",
    term: "Replatform or migration",
    plain: "Moving an existing system to a new platform or host, often to cut running cost or retire old hardware.",
    technical: "Project type replatform. The estimate is the migration build plus the new platform's running cost, set against what the old platform costs.",
  },
  {
    id: "type-saas",
    term: "Replace with SaaS",
    plain: "Retiring a system you run and buying a hosted product instead.",
    technical: "Project type saas. Subscription or seat fees replace the running cost; the build is mostly configuration, integration and migration.",
  },
  {
    id: "type-ai",
    term: "AI",
    plain: "A feature that uses models, agents or other AI services. Choosing it keeps the AI pages, such as Capacity (PTU), and the AI choices in the add menus visible.",
    technical: "Project type ai. It is also treated as true for any project that already has AI workloads or Dev Lab activities other than AI coding tools, so older projects keep their AI pages.",
  },
];

export const glossaryById = (id: string): GlossaryTerm | undefined => GLOSSARY.find((g) => g.id === id);
