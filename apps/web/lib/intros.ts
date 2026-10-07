/** "What this page answers" paragraphs for the project pages. Dismissal is stored per page. */
export const INTROS: Record<string, string> = {
  "/summary": "What will this project cost, and does it pay back? This page gives the answer in one screen: the build cost, the monthly running cost, the benefit once it is in use, and when the money comes back. Start here, then open the other pages to change the inputs behind it.",
  "/overview": "Where does the money go, month by month? This page splits the plan into build and production, shows which costs and services drive the total, and flags anything that needs a decision before the numbers can be trusted.",
  "/build": "What does it cost to build, and who does the work? Set the timeline, the team, the delivery phases and costs, and the engineering tools & lab (tools, AI-assisted development and, for AI projects, experiments) here. Environments are costed on Infrastructure. The build total in the bar above is the sum of everything on this page.",
  "/infrastructure": "What do the servers, plans and databases cost, and where do they run? Define the environments (dev, test, UAT, production, disaster recovery) with their size and hours, then add each resource once and say which environments it exists in. Every figure here is already in the totals above and on the Summary.",
  "/run": "What does it cost to run once it is live? Describe each line by how much it is used: hosting, seats and licences, contracts, fees per transaction and, for AI projects, workloads with the tokens each use takes. Then set the price, and for AI the model and deployment. The monthly run-rate in the bar above updates as you change it.",
  "/roi": "What is it worth, and when does it pay back? Add the time it saves and the costs it avoids, then set how much of that you expect to actually realise. The Current state and Scorecard views hold what the work costs today and the benefits that are not money. Payback, NPV and ROI in the bar above follow from this page.",
  "/capacity": "How many provisioned throughput units (PTU) would this need? Enter the peak load and the page sizes a PTU deployment, so you can compare reserved capacity with pay-as-you-go pricing.",
  "/report": "What can be handed to someone else? This page lays the numbers out as a printable report. Print it or save it as PDF; the sidebar also exports Excel and CSV.",
  "/tokens": "This is one quick tool inside the ROI Calculator, for projects that use AI models. How many tokens does this file or this agent use, and what does that cost? Describe a document by its pages and pictures, or an agent by its steps, and see the tokens and cost per model. The stepper under each result shows every sum, so you can check it by hand.",
  "/settings": "What do the defaults assume? Language, timeline, discount rate, how the engineering tools & lab is costed, and the deployment type, processing tier and Snowflake options live here. Changing one updates every page that did not set its own value.",
};

import { ensureStorageMigrated } from "./storage-migrate";
ensureStorageMigrated();

export const introKey = (path: string) => `roi-calculator:intro:${path}`;
export const INTRO_RESET_EVENT = "studio:intro-reset";
