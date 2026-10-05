/** Glossary terms. Plain language first, the technical meaning underneath. Rendered by app/glossary and linked from field hints. */
export interface GlossaryTerm {
  id: string;
  term: string;
  plain: string;
  technical: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: "token",
    term: "Token",
    plain: "The unit a model reads and writes. A token is a short piece of a word, so a typical English word is a little over one token. Models are priced per million tokens.",
    technical: "A subword unit produced by the model's tokenizer. The studio uses about 1.33 tokens per English word and applies per-language multipliers for other languages (Settings, Default language).",
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
    technical: "Hidden chain-of-thought tokens billed at the output rate. For agent harnesses the studio adds roughly 500, 2,000 or 6,000 reasoning tokens per step for low, medium and high effort. Models without a reasoning mode ignore the setting.",
  },
  {
    id: "cache-write",
    term: "Cache write",
    plain: "The first time a prefix is stored in the cache. Some providers charge a little extra for the write, and then much less every time the prefix is read back.",
    technical: "Anthropic-style prompt caching bills a write at a premium over base input and a read at a discount. Azure OpenAI caching has no write premium. The studio applies a write premium only to models whose price list carries one.",
  },
  {
    id: "deployment-types",
    term: "Deployment type (Global, Canada Regional, US Data Zone)",
    plain: "Where Azure runs your model. Global is cheapest and may process data in any Azure region. A regional or data-zone deployment keeps processing inside Canada or the US and costs more. Pick the one your data rules allow.",
    technical: "Azure OpenAI deployment SKUs: Global Standard, Regional (Canada) and Data Zone (US). Each has its own price per model and not every model is offered in every deployment. When a model is unavailable the studio flags it instead of pricing it from another deployment.",
  },
  {
    id: "processing-tiers",
    term: "Processing tier (Standard, Batch)",
    plain: "Standard answers immediately. Batch costs about half as much, but results come back within a day, so it suits overnight jobs such as evaluation runs and synthetic data and does not suit live chat.",
    technical: "Azure OpenAI Global Batch is billed at a discount to Standard and runs asynchronously with a 24-hour completion window. Priority and Flex tiers exist but are not priced in the studio yet.",
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
    id: "harness",
    term: "Harness",
    plain: "The setup around an agent that decides how many tokens one task uses: its instructions, its tools, how many steps it takes and how much each tool returns.",
    technical: "A reusable agent profile: system prompt, tool definitions, steps, tool calls per step, result size, reasoning effort and caps. The same harness feeds Dev Lab experiments and production agent workloads, so one edit flows through both.",
  },
  {
    id: "p50-p90",
    term: "P50 and P90",
    plain: "P50 is the typical case: half of tasks use less and half use more. P90 is a bad day: nine in ten tasks use less. Budget on P50 and look at P90 to see how much headroom you need.",
    technical: "Percentiles of cost per agent task. The studio takes P50 from the harness inputs and estimates P90 as 1.8 times the steps and 1.5 times the tool-result size. The percentile switch on the Run page chooses which one the totals use.",
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
    technical: "The rate that sets NPV to zero. The studio's current ROI and NPV figures use the discount rate you enter, and IRR is on the roadmap.",
  },
  {
    id: "realisation",
    term: "Realisation",
    plain: "How much of the time saved turns into real value. If a tool saves 100 hours and people spend half of that on other useful work, realisation is 50% and only half the hours count as a benefit.",
    technical: "A factor applied to hours saved before they are multiplied by the loaded hourly rate: benefit = hours saved x adoption x realisation x rate.",
  },
];

export const glossaryById = (id: string): GlossaryTerm | undefined => GLOSSARY.find((g) => g.id === id);
