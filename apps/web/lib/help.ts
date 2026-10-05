/**
 * Field help, keyed by field id. One entry per input in the studio.
 *
 * - Inputs rendered from `components/fields.tsx` use the spec `key` as the id.
 * - Inputs written directly in a page pass the id to `<Field help="...">`, which is typed against this table.
 * `apps/web/test/help.test.ts` fails if a spec key or a `<Field>` has no entry here.
 */
export interface HelpEntry {
  /** What the field means, in plain words. */
  meaning: string;
  /** The unit, or what the number counts. */
  unit: string;
  /** A worked example. */
  example: string;
  /** Where the starting value comes from. */
  source: string;
  /** Glossary term id to link to. */
  term?: string;
  /** Why a value above the maximum (or below the minimum) is refused. Shown in the inline validation message. */
  limit?: string;
}

const SAMPLE = "Starts from the sample project. Replace it with your own figure.";
const HEUR = "A catalogue default drawn from published figures. Override it when you have measured your own.";
const PRICE = "The list of models and prices in Prices & sources, as of the date in the sidebar.";
const DEFAULT_SETTINGS = "Inherits the project default in Settings unless you pick one here.";
const SHARE = "this is a share of the total";

const e = (meaning: string, unit: string, example: string, source: string, extra: Pick<HelpEntry, "term" | "limit"> = {}): HelpEntry => ({ meaning, unit, example, source, ...extra });
const model = (what: string, example = "A small model for routine work, a larger one for hard reasoning."): HelpEntry => e(`The model used for ${what}.`, "A model from the price list", example, PRICE);
const tokens = (what: string, example: string, source = SAMPLE): HelpEntry => e(`The number of tokens in ${what}.`, "Tokens", example, source, { term: "token" });
const share = (what: string, example: string, source = SAMPLE): HelpEntry => e(what, "Percent", example, source, { limit: SHARE });
const perMonth = (what: string, unit: string, example: string): HelpEntry => e(what, unit, example, SAMPLE);
const factors = e(
  "How hard the activity runs in each month, as a multiplier on its usual volume. 1 means full intensity, 0 means off, 0.5 means half.",
  "Multiplier per month, comma-separated",
  "0.5, 1, 1, 0.5 runs half-strength in months 1 and 4 and full in months 2 and 3.",
  "Starts from the plan shape you chose. The plan grid on the Build page edits the same numbers.",
);

export const HELP = {
  // Shared by Dev Lab activities and Run workloads (keys match components/fields.tsx)
  harnessId: e("The agent setup (instructions, tools, steps) whose token use this activity or workload copies.", "A harness from the Run page", "Use the coding-agent harness for a bake-off that tests coding tasks.", "Harnesses are defined on the Run page. The sample ships with a few.", { term: "harness" }),
  cases: e("How many test cases one run goes through.", "Cases", "200 cases means every run scores 200 prompts.", SAMPLE),
  monthFactors: e("How busy this activity is in each build month, as a multiplier on the base amount.", "Multiplier per month (1 = full)", "1, 1, 0.5 means full effort in months 1 and 2, then half in month 3.", SAMPLE),
  repeats: e("How many times each case is repeated to smooth out model randomness.", "Runs per case", "3 repeats gives three scores per case to average.", SAMPLE, { limit: "more than 20 repeats rarely adds accuracy and usually means a typo" }),
  sweepsPerMonth: e("How many full comparison sweeps happen in each month of the build.", "Sweeps per month, one number per month", "2, 1, 1 means two sweeps in month 1 and one in months 2 and 3.", "Starts from the sample plan. The plan grid on the Build page edits the same numbers."),
  cacheHit: share("The share of input tokens served from the provider's prompt cache at the cheaper cached rate.", "60% means 6 of every 10 input tokens are billed as cached.", "Starts from the sample project. Measure the real rate from your provider's usage report once you have traffic."),
  batchShare: share("The share of calls sent through the Batch tier, which costs about half as much but returns results within a day.", "100% for an overnight evaluation, 0% for anything a person waits on.", "Starts from the sample project. Batch needs a deployment that offers it."),
  modelId: model("this step"),
  runsPerDevPerDay: perMonth("How many experiment runs each developer starts per working day.", "Runs per developer per day", "4 runs a day across 5 developers is 20 runs a day."),
  subsetCases: e("How many test cases each quick run uses. A subset keeps day-to-day runs cheap.", "Cases", "50 of a 500-case set.", SAMPLE),
  workingDays: perMonth("The working days in a month that this activity runs.", "Days", "21 for a normal month, 19 allowing for holidays."),
  runsPerMonth: perMonth("How many times the job runs each month.", "Runs", "4 means one weekly run."),
  fromMonth: e("The first month the activity or cost line starts.", "Month number, counted from the first build month", "3 means it starts in the third month.", SAMPLE),
  judgeModelId: model("judging answers (the judge scores another model's output)", "A strong model, because the judge sets the quality bar."),
  queryTokens: tokens("each question sent to the evaluator", "A short question is about 30 tokens."),
  contextTokens: tokens("the retrieved context sent with each question", "Five chunks of 512 tokens is about 2,560."),
  responseTokens: tokens("each answer being judged", "A paragraph answer is about 150 tokens."),
  safetyEvaluators: e("How many safety evaluators run on every item (violence, self-harm, hate and so on).", "Evaluators", "4 runs four safety checks per item.", "Catalogue default per evaluator; each one is billed as a model call.", { limit: "there are at most 12 evaluators to choose from" }),
  targetModelId: model("the system being attacked in the red-team scan", "The model you plan to put into production."),
  scansPerMonth: perMonth("How many red-team scans run each month.", "Scans", "1 means a scan at the end of each month."),
  categories: e("How many risk categories the red team probes.", "Categories", "6 covers violence, hate, sexual, self-harm and two more.", HEUR, { limit: "there are 11 risk categories" }),
  objectivesPerCategory: e("How many attack objectives are tried in each category.", "Objectives", "10 objectives in each of 6 categories is 60 attacks.", HEUR),
  strategies: e("How many attack strategies are applied to each objective (encoding tricks, role play and so on).", "Strategies", "3 strategies triples the attack count.", HEUR, { limit: "the library has at most 24 strategies" }),
  multiTurnShare: share("The share of attacks that run as a multi-turn conversation instead of a single message. Multi-turn attacks cost about four times as much.", "25% means a quarter of attacks are conversations.", HEUR),
  callsPerDevPerDay: perMonth("How many playground calls each developer makes per working day.", "Calls per developer per day", "30 calls a day while prompting by hand."),
  inputTokens: tokens("what you send in one call (instructions plus content)", "A page of text is about 700 tokens."),
  outputTokens: tokens("what the model writes back in one call", "A short answer is about 150 tokens."),
  reasoning: e("How hard the model thinks before it answers. Thinking is billed as output.", "None, low, medium or high", "Medium on a model that supports reasoning adds a few thousand hidden tokens per step.", "Starts from the sample project. Models without a reasoning mode ignore it.", { term: "reasoning-tokens" }),
  generatorModelId: model("writing synthetic training examples"),
  acceptedPerMonth: perMonth("How many generated examples survive filtering and are kept, each month.", "Examples", "2,000 kept examples need more than 2,000 generated when the pass rate is below 100%."),
  passRate: share("The share of generated examples that pass quality checks and are kept. A lower rate means more generation per kept example.", "80% means 5 are generated for every 4 kept.", SAMPLE),
  genInputTokens: tokens("the prompt used to generate one example", "A template with two seed examples is about 800 tokens."),
  genOutputTokens: tokens("one generated example", "A short conversation is about 400 tokens."),
  judgeInputTokens: tokens("what the judge reads per example", "The example plus a grading rubric, about 1,000 tokens."),
  judgeOutputTokens: tokens("the judge's verdict per example", "A score and one line of reasoning is about 100 tokens."),
  trainingPriceId: e("The base model and training method being tuned. Each has its own price per million training tokens.", "A training price from the list", "Supervised fine-tuning of a small model is the cheapest option.", PRICE),
  examples: perMonth("How many examples are in the training file.", "Examples", "1,000 is a common first set."),
  tokensPerExample: tokens("one training example", "A short prompt and answer is about 500 tokens."),
  epochs: e("How many times the training set is passed through the model.", "Passes", "3 epochs bills the training tokens three times.", "Catalogue default; the training service picks a value when you do not.", { limit: "more than 50 passes is far outside normal practice" }),
  hoursPerRun: e("How many hours of training one run takes. Only reinforcement fine-tuning bills by the hour.", "Hours", "6 hours at the hourly training rate.", SAMPLE),
  deployments: perMonth("How many tuned models are kept deployed. Each one is billed for hosting.", "Deployments", "2 means two tuned models are hosted at the same time."),
  hostingHoursPerMonth: e("The hours per month a tuned model stays deployed.", "Hours", "744 is a full month, 160 is working hours only.", SAMPLE, { limit: "a month has at most 744 hours" }),
  copilotSeatsPerDev: e("Coding-assistant licences per developer.", "Seats per developer", "1 is one licence each.", SAMPLE, { limit: "more than 2 seats per developer is almost always a mistake" }),
  copilotPlan: e("Which GitHub Copilot plan is bought. The plan sets the price per seat per month.", "Business or Enterprise", "Business for most teams.", "Seat prices are in Prices & sources."),
  codingModelId: model("the coding agent that runs beyond the included seat allowance"),
  deployment: e("Where Azure runs the model for this workload: Global, Canada Regional or US Data Zone. Regional and data-zone deployments cost more.", "Deployment type", "Canada Regional if data must stay in Canada.", DEFAULT_SETTINGS, { term: "deployment-types" }),
  hoursPerMonth: perMonth("The hours of activity in a month: audio to transcribe, or hours a resource runs.", "Hours", "300 hours of meeting audio, or 160 hours of warehouse time."),
  engineId: e("The service that turns audio into text. Each has its own price per audio hour.", "A speech engine from the list", "A cheaper engine when speaker labels are not needed.", PRICE),
  diarize: e("Whether the transcript labels who said what. It adds tokens to the transcript and, on some engines, a separate fee.", "Yes or no", "Yes for meeting minutes, no for a plain dictation.", SAMPLE),
  pagesPerMonth: perMonth("How many pages are processed each month.", "Pages", "20,000 pages is about 400 documents of 50 pages."),
  pageType: e("What a typical page looks like. Denser pages hold more words and so more tokens.", "Plain, dense, slide or spreadsheet", "Plain is about 500 words, a slide about 40.", HEUR, { term: "token" }),
  emailsPerMonth: perMonth("How many emails are processed each month.", "Emails", "50,000 emails in a shared claims inbox."),
  bodyExtractorId: e("The service that reads the text of the email body.", "An extraction service from the list", "A plain-text extractor is enough for most bodies.", PRICE),
  attachmentExtractorId: e("The service that reads the text of attachments such as PDFs and scans.", "An extraction service from the list", "Document layout analysis for scanned attachments.", PRICE),
  attachmentShare: share("The share of emails that carry attachments.", "25% means one email in four.", HEUR),
  attachmentsPerEmail: e("How many attachments an email with attachments carries on average.", "Attachments", "1.5 is typical.", HEUR),
  pagesPerAttachment: e("How many pages an average attachment has.", "Pages", "5 pages for a typical PDF.", HEUR),
  dedupe: share("The share of attachments left after removing duplicates such as signature images and repeated forwards.", "70% means 3 in 10 are dropped as duplicates.", HEUR),
  tokensPerMonth: tokens("everything embedded in a month", "1,000 documents of 700 tokens is 700,000 tokens."),
  chunks: perMonth("How many chunks of text are stored in the search index.", "Chunks", "200,000 chunks is about 100 million tokens of source text."),
  embeddingModelId: e("The model that turns text into vectors for search. Its vector size drives index storage.", "An embedding model from the list", "A 1,536-dimension model stores half as much as a 3,072-dimension one.", PRICE),
  bytesPerDim: e("How many bytes the index stores for each vector number. Smaller storage is cheaper and slightly less precise.", "Bytes per dimension", "float32 is 4 bytes, int8 is 1.", "Catalogue default is float32, the safe choice."),
  chunkTokens: tokens("one chunk of text", "512 is a common chunk size.", HEUR),
  replicas: e("How many copies of the search index run for availability and query speed.", "Replicas", "2 keeps the service up while one copy updates.", SAMPLE, { limit: "Azure AI Search allows at most 12 replicas" }),
  queriesPerMonth: perMonth("How many search queries are run each month.", "Queries", "100,000 queries."),
  semanticShare: share("The share of queries that use the semantic ranker, which has its own fee per thousand queries.", "100% means every query is re-ranked.", SAMPLE),
  tier: e("Standard answers at once. Batch costs about half but takes up to a day.", "Standard or Batch", "Batch for overnight jobs, Standard for anything interactive.", DEFAULT_SETTINGS, { term: "processing-tiers" }),
  users: perMonth("How many people use the chat each month.", "Users", "500 users in one business unit."),
  conversationsPerUser: perMonth("How many separate conversations a user starts each month.", "Conversations per user per month", "8 means about two a week."),
  turns: e("How many question-and-answer exchanges happen in one conversation. Each turn re-sends the history, so cost grows faster than linearly.", "Turns", "4 turns is a short back-and-forth.", "Catalogue default of 4 turns per conversation."),
  systemPromptTokens: tokens("the standing instructions sent with every call", "500 tokens is a page of instructions."),
  userTurnTokens: tokens("one user message", "A short question is about 100 tokens.", HEUR),
  assistantTurnTokens: tokens("one answer", "A paragraph answer is about 350 tokens.", HEUR),
  topK: e("How many chunks the search returns and the chat reads for each question.", "Chunks", "5 chunks of 512 tokens adds about 2,500 tokens per question.", HEUR),
  language: e("The language of the text. Non-English text uses more tokens for the same meaning.", "A language", "Japanese needs about 1.5 times the tokens of English.", "Inherits the project default in Settings unless you pick one here.", { term: "token" }),
  tasksPerMonth: perMonth("How many tasks the agent completes each month.", "Tasks", "10,000 tasks a month."),
  interactionsPerMonth: perMonth("How many live interactions happen each month, before sampling.", "Interactions", "100,000 chat turns a month."),
  sampleShare: share("The share of live interactions that are scored by the judge. Sampling keeps monitoring cheap.", "10% scores one interaction in ten.", SAMPLE),
  requestsPerMonth: perMonth("How many calls are sent to the content-safety service each month.", "Requests", "200,000 requests."),
  charsPerRequest: perMonth("How many characters each request checks.", "Characters", "1,000 characters is a long paragraph."),
  callsPerMonth: perMonth("How many calls the workload makes each month.", "Calls", "50,000 calls a month."),
  cachedInputTokens: e("How many of the input tokens come from the prompt cache and are billed at the cheaper cached rate.", "Tokens", "1,500 of a 2,000-token prompt are the same every time.", SAMPLE, { term: "input-cached-output" }),
  minutesPerCall: e("The average length of a voice call.", "Minutes", "6 minutes.", SAMPLE),
  turnsPerCall: e("How many back-and-forth exchanges a call has.", "Turns", "12 turns in a six-minute call.", SAMPLE),
  agentTalkShare: share("The share of call time the agent is speaking. Spoken output costs more than listening.", "40% means the caller talks for 60% of the call.", SAMPLE),
  telephonyPerMinute: e("What the phone line costs per minute, outside model charges.", "C$ per minute", "C$0.015 per minute on a SIP trunk.", "Not in the catalogue. Take it from your telephony provider's invoice."),
  rowsPerMonth: perMonth("How many table rows the query processes each month.", "Rows", "1,000,000 rows."),
  functionId: e("The Snowflake Cortex function applied to each row (classify, summarise, translate and so on).", "A Cortex function from the list", "Summarise for call notes.", PRICE),
  tokensPerRow: tokens("the text in one row, including any labels you pass", "A paragraph of call notes is about 300 tokens."),
  hiddenPromptTokens: tokens("the instructions Snowflake adds to each call behind the scenes", "Around 100 tokens for classification functions."),
  outputTokensPerRow: tokens("the result for one row", "A one-word label is about 5 tokens."),
  rows: perMonth("How many rows are indexed in the Cortex Search service.", "Rows", "500,000 documents."),
  vectorColumns: e("How many text columns in each row are turned into vectors.", "Columns", "1 for a single body column.", SAMPLE, { limit: "Cortex Search supports at most 8 vector columns" }),
  avgRowBytes: e("The average size of one row in storage.", "Bytes", "4,000 bytes is about a page of text.", SAMPLE),
  changedShareMonthly: share("The share of rows that change each month and must be re-embedded.", "5% means one row in twenty is updated.", SAMPLE),
  size: e("The Snowflake warehouse size. Each step up doubles the credits used per hour.", "Warehouse size", "Small uses 2 credits an hour.", "Credit rates per size are published by Snowflake and shown in the list."),
  tools: e("How many tools the agent can call. Every tool definition is sent with every call.", "Tools", "12 tools at 250 tokens each is 3,000 tokens per call.", HEUR, { limit: "an agent with more than 100 tools will not work reliably" }),
  tokensPerTool: tokens("one tool definition (name, description and parameters)", "250 tokens is typical.", HEUR),
  userInputTokens: tokens("the task text the user gives the agent", "A short request with one attachment summary is about 500 tokens."),
  steps: e("How many model calls a typical task takes. Half of tasks take fewer, half take more.", "Steps", "8 steps for a typical coding task.", HEUR, { term: "p50-p90" }),
  toolCallsPerStep: e("How many tool calls the agent makes in one step.", "Calls", "1.3 means a few steps call two tools at once.", HEUR),
  toolResultTokens: tokens("what one tool call returns to the agent", "A file read or search result is about 1,500 tokens.", HEUR),
  outputPerStep: tokens("what the agent writes in one step, excluding hidden reasoning", "A short plan and a tool call is about 300 tokens.", HEUR),
  finalOutputTokens: tokens("the agent's final answer", "A summary of the work is about 500 tokens."),
  maxTurns: e("The most steps the agent may take before it is stopped. It caps the worst case.", "Steps", "25 stops a runaway task.", SAMPLE),
  maxTokensPerCall: e("The most tokens a single call may use. It caps the worst case.", "Tokens", "120,000.", SAMPLE, { term: "token" }),
  compactAtTokens: e("When the conversation reaches this size the agent summarises it to keep later calls small. 0 turns this off.", "Tokens, 0 for off", "60,000 compacts a long task halfway.", SAMPLE),
  retryRate: share("The share of steps that fail and have to run again.", "5% means one step in twenty is repeated.", HEUR),

  // Settings page
  projectName: e("The name of this estimate, shown in the sidebar, reports and exports.", "Text", "Claims assistant, phase 1.", "You choose it."),
  startMonth: e("The calendar month in which the build starts. It labels the months on every chart and export.", "Month and year", "January 2027.", "Starts from the sample project. It does not change any cost."),
  buildMonths: e("How many months the build phase lasts. Dev Lab spend and team cost run during this time. Production starts after it.", "Months", "6 means build runs in months 1 to 6 and go-live is month 7.", SAMPLE, { limit: "the studio models builds of 1 to 24 months" }),
  horizonMonths: e("How long the plan runs in total, from the start of the build. ROI, NPV and payback are measured over it.", "Months", "36 shows three years.", SAMPLE, { limit: "the plan length is between 12 and 120 months" }),
  adoptionRamp: e("How many months it takes users to reach full adoption after go-live. Benefits and usage rise in a straight line over this time.", "Months", "6 means half the users are active by the third month.", SAMPLE, { limit: "the ramp is between 0 and 24 months" }),
  settingsLanguage: e("The default language of the text being processed. Non-English text uses more tokens, and workloads can override it.", "A language", "French needs about 1.3 times the tokens of English.", "English unless you change it.", { term: "token" }),
  settingsDeployment: e("Where Azure runs your models by default. Workloads can override it. Global is cheapest; regional and data-zone deployments keep processing in Canada or the US.", "Deployment type", "Canada Regional if data must stay in Canada.", "Global unless you change it. Prices come from the Azure price list.", { term: "deployment-types" }),
  settingsTier: e("The default processing tier for every Azure model call. Batch costs about half but only suits work that can wait up to a day.", "Standard or Batch", "Standard for chat, Batch for overnight evaluation.", "Standard unless you change it.", { term: "processing-tiers" }),
  sfRouting: e("Whether Snowflake may run AI functions in any region (Global) or only in the regions you name. Regional costs more.", "Global or Regional", "Regional if data must stay within one region.", "Snowflake's published credit rates for each routing."),
  sfEdition: e("Your Snowflake edition. It sets the price of a credit.", "Standard, Enterprise or Business Critical", "Enterprise for most companies.", "Snowflake's published list prices."),
  sfAiCredit: e("What one Snowflake AI credit costs you, in Canadian dollars.", "C$ per credit", "C$2.60.", "Starts from Snowflake's list price for your edition. Replace it with your contract rate."),
  sfPlatformCredit: e("What one Snowflake platform credit (warehouse time) costs you, in Canadian dollars.", "C$ per credit", "C$3.90.", "Starts from Snowflake's list price for your edition. Replace it with your contract rate."),

  // Token calculator
  tokPages: e("How many pages of documents to price.", "Pages", "100 pages.", "A starting value for the calculator."),
  tokSummaryModel: model("summarising the pages"),
  tokAudioHours: e("How many hours of audio to price.", "Hours", "10 hours.", "A starting value for the calculator."),

  // Build page
  devBudget: e("A monthly AI Dev Lab spending limit for each person who runs experiments. When set, the studio reports the plan against it.", "C$ per person per month", "C$500 means a team of 5 has C$2,500 a month.", "Blank until you set one. Nothing is capped; it is a comparison line.", { term: "ai-dev-lab" }),
  hourlyRate: e("The loaded hourly cost of this role, including salary, benefits and overhead. It prices team time and the value of hours saved.", "C$ per hour", "C$95 for a mid-level developer.", "Starts from the sample project. Use your finance team's loaded rate."),
  contingency: e("An allowance added on top of the build cost for what you have not foreseen.", "Percent of build cost", "15% on a C$400,000 build adds C$60,000.", "Starts from the sample project. 10% to 20% is common.", { limit: "a contingency above 100% would more than double the build" }),
  workstream: e("The feature this activity belongs to. Costs roll up by workstream on the Overview and Summary pages.", "A workstream", "Project-wide for work that serves every feature.", "Project-wide until you pick one."),

  // Run page
  maintenancePct: e("Yearly upkeep as a share of the build cost: fixes, prompt updates and model migrations.", "Percent of build cost per year", "15% on a C$400,000 build is C$60,000 a year.", "Starts from the sample project. 15% to 25% is typical for software.", { limit: "a share of the build cost, so it cannot go above 100%" }),
  docRoute: e("How the documents reach the model: read the text out first, or send the PDF straight to a model that can read pages.", "Extract first or direct to model", "Extract first is cheaper for plain text, direct is simpler for layouts.", SAMPLE),
  docExtractor: e("The service that turns document pages into text before the model sees them.", "An extraction service from the list", "Layout analysis for tables and forms.", PRICE),
  docModel: model("reading the pages directly"),
  docOutputTokens: tokens("the model's output for one page", "A page of extracted text is about 700 tokens."),

  // Capacity page
  ptuDeployment: e("The deployment type to size and price reserved capacity for. Reserved capacity is priced per deployment type.", "Global, Data Zone or Regional", "Data Zone for data that must stay in the US.", "Starts with the project default.", { term: "ptu" }),
  peakFactor: e("How much busier the busiest minute is than the average minute. Reserved capacity must cover the peak, not the average.", "Multiple of the average load", "3 means the peak is three times the average.", "Starts at a cautious default. Measure it from your own request logs.", { term: "ptu", limit: "a peak above 20 times the average is a sign the average is wrong" }),
  ptuModel: model("the capacity sizing", "The model you expect to run on reserved capacity."),
  peakRpm: e("The most requests you expect in one minute.", "Requests per minute", "120 in the busiest minute of the day.", "Starts from the sample project. Take it from logs or a load test.", { term: "ptu" }),
  cachedShare: share("The share of each prompt that comes from the cache. Cached tokens use less of the reserved capacity.", "50% means half of each prompt is cached.", "Starts from the sample project."),
  ptuPrompt: tokens("the prompt in one request, at its largest typical size", "A RAG prompt with 5 chunks is about 3,000 tokens."),
  ptuResponse: tokens("one response", "A paragraph answer is about 350 tokens."),

  // Value and ROI
  growth: e("How much usage grows each year after the first. It scales production cost and benefit together.", "Percent per year", "20% means year two is 1.2 times year one.", "Starts from the sample project. Zero is the cautious choice.", { limit: "growth is held between minus 50% and 500% a year" }),
  escalation: e("How much model and labour prices rise each year.", "Percent per year", "3% a year.", "Starts from the sample project. Model prices have mostly fallen, so zero is a fair default.", { limit: "price rises above 50% a year are outside the range the studio models" }),
  discount: e("The yearly rate used to turn future money into today's money. It reflects what else the company could earn on the funds.", "Percent per year", "10% is a common corporate hurdle rate.", "Starts from the sample project. Use your finance team's hurdle rate.", { term: "npv", limit: "a discount rate above 50% a year is outside the range the studio models" }),
  fteAvoided: e("How many full-time people's work the project avoids or replaces.", "Full-time equivalents", "2.5 means the work of two and a half people.", SAMPLE),
  hoursPerFte: e("The hours in a month that one full-time person works.", "Hours per month", "160 is a standard month.", "Starts at 160, a full-time month."),
  role: e("Whose hourly rate prices the hours avoided.", "A role from the rate card", "Analyst for report work.", "The rate card on the Build page."),
  avoidedMonthly: e("A fixed monthly saving that is not tied to hours, such as a licence you can cancel or a vendor you stop paying.", "C$ per month", "C$8,000 a month for a retired tool.", SAMPLE),
  adoption: share("The share of intended users who actually use it once it is fully rolled out.", "70% means 70 of every 100 users are active.", "Starts from the sample project. Pilots usually show lower rates than hoped.", ),
  realisation: share("The share of the time saved that turns into real value, instead of being absorbed by other work.", "50% means half of the saved hours count as a benefit.", "Starts from the sample project. 30% to 60% is cautious.", ),
  licensed: share("The share of users who already pay for an equivalent tool (for example Microsoft 365 Copilot), so you do not count its cost twice.", "40% means 4 in 10 users already have a licence.", "Blank means none. Take it from your licence report."),
  roiWorkingDays: e("The working days in a month, used to turn per-day savings into monthly value.", "Days", "21 for a normal month.", "Starts at 21.", { limit: "a month has at most 31 days" }),
  capSavingUnit: e("Whether the saving is measured in minutes or as a percent of the time the task takes today.", "Minutes or percent", "10 minutes per task, or 25% of a 40-minute task.", "Starts from the benchmark for this capability."),
  capDriver: e("How the hours saved are worked out: a total you enter, minutes saved per task, or minutes saved per user each week.", "A method", "Per user per week suits an assistant everyone opens daily.", SAMPLE),
  capRole: e("Whose hourly rate prices the hours saved.", "A role from the rate card", "Claims adjuster.", "The rate card on the Build page."),
  capVolumeFrom: e("Where the number of users or items comes from: typed here, or read from a production workload so the two never disagree.", "Entered here or a workload", "Read users from the chat workload.", "Entered here until you link a workload."),
  capUsers: e("The number of users, read from the linked workload. Change it there.", "Users", "500.", "Read from the workload you linked."),
  capItems: e("The number of items per month, read from the linked workload. Change it there.", "Items per month", "20,000 emails.", "Read from the workload you linked."),
  capSavings: e("The time saved in this scenario: conservative, typical or optimistic. The dot marks the scenario the project uses.", "Minutes, or percent when saving is in percent", "Typical 8 minutes, optimistic 12.", "Starts from the benchmark for this capability, with its source on the card.", { limit: "a percent saving cannot go above 100%" }),
  contingencyScope: e("Which build costs the contingency percentage is added to.", "Build labour only, or labour plus Dev Lab, environment and one-time costs", "With 15% and all costs selected, a C$10,000 environment adds C$1,500.", "Starts as build labour only, which is how earlier versions of the project priced it."),
  featureId: e("The feature this item belongs to. Features group workloads, workstreams and capabilities so each can be costed and reported on its own.", "A feature, or shared by the project", "Notes and follow-up owns the transcription and follow-up workloads.", "New items join the feature that is selected when you add them."),
  featureDescription: e("A short line on what the feature does for its users.", "Free text", "Answer questions over past meetings and shared documents.", "Written by you. It does not change any cost."),
  wlStartMonth: e("The first month this workload is billed. Before it the workload costs nothing.", "Month number", "10 starts billing three months after go-live in month 7.", "Starts at go-live, the first month after the build.", { limit: "a workload cannot start before go-live or after the end of the plan" }),
  endMonth: e("The last month this workload is billed. After it the workload stops. 0 means it runs to the end of the plan.", "Month number, 0 for no end", "24 stops billing after month 24.", "Starts with no end.", { limit: "an end month cannot be after the end of the plan" }),
  rampMonths: e("How many months the workload takes to reach its full volume after it starts. It overrides the project adoption ramp for this workload only.", "Months", "3 reaches full volume in the third month.", "Starts as the project adoption ramp in Settings.", { limit: "a ramp longer than 24 months is refused" }),
  oneTimeVolume: e("A volume billed once, in a single month, on top of the monthly volume. Use it for a backfill or an initial load.", "The same unit as the workload's monthly volume", "200,000 documents loaded once at go-live.", "Starts at zero, which means no one-time load. It is left out of the monthly run rate."),
  oneTimeMonth: e("The month the one-time volume is billed in.", "Month number", "7 bills the load in go-live month.", "Starts at the workload's first billed month.", { limit: "the month must fall within the plan" }),
  capLiveFrom: e("The first month this benefit starts. Before it, the benefit is zero while costs continue.", "Month number", "9 starts the benefit two months after go-live in month 7.", "Starts at go-live, the first month after the build.", { limit: "a benefit cannot start before go-live or after the end of the plan" }),
  capNetHours: e("The hours saved each month in total, after subtracting any time spent checking or correcting the output.", "Hours per month", "400 hours across all users.", SAMPLE),
  capUsersIn: e("How many people get the time saving.", "Users", "500 users.", SAMPLE),
  capTasksPerDay: e("How many times a user performs the task in a working day.", "Tasks per user per day", "6 tasks a day.", SAMPLE),
  capItemsIn: e("How many items (emails, documents, calls) go through the task each month.", "Items per month", "20,000 emails.", SAMPLE),
  capHandled: share("The share of items the assistant handles. The rest are still done by hand.", "80% means 8 of every 10 items go through it.", SAMPLE),
  capBaseline: e("How long the task takes today without the assistant.", "Minutes", "25 minutes to read and summarise a claim file.", "Starts from the benchmark for this capability, with its source on the card."),
  capOverlap: share("The share of the saving already delivered by a tool people have, such as Microsoft 365 Copilot, so it is not counted twice.", "30% means almost a third of the saving already exists.", "Starts from the benchmark for this capability."),
  itemAmount: e("The amount of the one-off benefit or monthly cost.", "C$", "C$25,000.", SAMPLE),
  itemFrom: e("The month the item happens or starts.", "Month number", "7 is the first month after a 6-month build.", SAMPLE, { limit: "it must fall inside the plan length" }),
  itemTo: e("The last month of the item.", "Month number", "18.", SAMPLE, { limit: "it must fall inside the plan length" }),
  resendShare: e("The share of calls that are sent a second time after a rate-limit error or a timeout. The retry is billed in full.", "Share of calls", "5% means one call in twenty is repeated.", "Starts at 0%, which means no retries are costed.", { limit: "a share cannot be more than 100%" }),
  promptShields: e("Adds Azure Content Safety Prompt Shields, which screens each prompt for injection attacks. It is billed per 1,000 records of text.", "Yes or no", "Yes adds one record for every 1,000 characters of prompt on each call.", "Starts at No. It only adds a cost when the price list has a Prompt Shields price."),
  devLabPercentile: e("How heavy the agent runs in the AI Dev Lab are assumed to be. Typical uses the middle estimate of steps and tool output; heavy uses the 90th percentile.", "Typical (P50) or heavy (P90)", "Heavy prices each Dev Lab run at the cost that only one run in ten exceeds.", "Starts at typical, which is how earlier versions of the project priced it."),
  hurdleRate: e("The lowest yearly return the project must earn to be worth funding. The Summary page says whether the internal rate of return clears it.", "Percent a year", "12% is a typical cost of capital.", "Not set. Leave it at 0 to show no comparison.", { term: "irr", limit: "a rate above 100% is refused" }),
  terminalValue: e("Value the project keeps earning after the plan ends, counted as this many years of the last twelve months' net benefit, added to the final month. It raises NPV and IRR.", "Years", "2 adds two years of the last year's net benefit.", "Not set. 0 counts nothing after the plan ends.", { term: "npv", limit: "more than 20 years is refused" }),
  capexPct: e("The share of build cost your finance team capitalises instead of expensing. It changes how cost is reported over the plan, not the cash flows, NPV or IRR.", "Percent of build cost", "60% capitalises C$60,000 of a C$100,000 build.", "Not set, so all cost is shown as operating cost."),
  amortiseMonths: e("The number of months the capitalised build cost is written off over, in equal steps from go-live.", "Months", "36 writes it off over three years.", "36 months, a common software life.", { limit: "between 1 and 120 months" }),
  confidence: e("How sure you are that this benefit will arrive. Only this share of it is counted, so a doubtful benefit weighs less in cost, NPV and payback.", "Percent that counts", "70% counts seven tenths of the benefit.", "Starts at 100%, which counts the benefit in full."),
  valueRevenue: e("Extra revenue the project brings in each month once it is fully rolled out, such as a faster quote that wins more business.", "C$ per month", "C$50,000 of extra sales a month.", SAMPLE),
  valueMargin: e("The share of the extra revenue that is profit. Only the margin is a benefit.", "Percent of revenue", "40% keeps C$20,000 of C$50,000.", "Starts at 100%, which counts all the revenue. Lower it to the real margin."),
  valueVolume: e("How many items go through the process each month, such as claims, emails or records.", "Items per month", "10,000 claims a month.", SAMPLE),
  valueVolumeFrom: e("Take the item count from a workload so the benefit grows with its volume, counted in rows, tokens, chunks, pages or whatever the workload bills.", "A workload, or entered here", "The claims classifier's rows per month.", "Entered here."),
  valueErrBefore: e("The share of items that go wrong today without the project.", "Percent of items", "5% of invoices have an error.", SAMPLE),
  valueErrAfter: e("The share of items that still go wrong with the project in place.", "Percent of items", "2% of invoices still have an error.", SAMPLE),
  valueCostPerError: e("What one error costs to put right, including rework, refunds and write-offs.", "C$ per error", "C$40 to correct an invoice.", SAMPLE),
  valueEvents: e("How often the bad event happens in a year, such as a compliance breach or a missed fraud case.", "Events per year", "0.5 is one every two years.", SAMPLE),
  valueImpact: e("The full cost of one such event.", "C$ per event", "C$600,000 for a regulatory fine.", SAMPLE),
  valueReduction: e("The share of those events the project prevents. The benefit is the expected loss avoided, spread over the months.", "Percent of events", "50% halves the expected loss.", SAMPLE),
  valueCapability: e("Count this benefit under one capability, so ROI by capability includes it. Totals do not change.", "A capability, or the project as a whole", "Count the retired licence under the notes capability.", "The project as a whole."),
  scnChange: e("What this scenario changes compared with the base case: a model, usage volume, build length, headcount, a lever or a preset.", "A type of change", "Usage volume at 150% to test a busier year.", "You choose it."),
  scnWorkload: e("The workload whose model you are swapping.", "A workload", "The chat workload.", "Workloads on the Run page."),
  scnModel: model("this scenario"),
  scnValue: e("The new value to test against the base case.", "Percent, months or people", "150% of baseline usage.", "You choose it.", { limit: "a scenario outside the range the studio models would give unreliable results" }),
  scnLever: e("A named change, such as turning on prompt caching or moving evaluation to Batch.", "A lever", "Prompt caching on.", "The lever list is built into the studio."),
  scnPreset: e("A benefit set: conservative, typical or optimistic. It changes the time saved on every capability.", "A preset", "Conservative for a board paper.", "You choose it."),
  scnName: e("The name shown for this scenario in tables and charts.", "Text", "Busy year, batch evaluation.", "Suggested from the changes you picked. Edit it if you like."),
} satisfies Record<string, HelpEntry>;

export type HelpId = keyof typeof HELP;
export const helpFor = (id: string): HelpEntry | undefined => (HELP as Record<string, HelpEntry>)[id];
