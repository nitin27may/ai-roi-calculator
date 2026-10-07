/** "What this page answers" paragraphs for the project pages. Dismissal is stored per page. */
export const INTROS: Record<string, string> = {
  "/summary": "What will this project cost, and does it pay back? This page gives the answer in one screen: the build cost, the monthly running cost, the benefit once people use it, and when the money comes back. Start here, then open the other pages to change the inputs behind it.",
  "/overview": "Where does the money go, month by month? This page splits the plan into build and production, shows which services drive the cost, and flags anything that needs a decision before the numbers can be trusted.",
  "/build": "What does it cost to build, and who does the work? Set the timeline, the team, the AI Dev Lab allowance and the environments here. The build total in the bar above is the sum of everything on this page.",
  "/run": "What does it cost to run once it is live? Describe each workload by how much it is used and how many tokens each use takes, then pick the model and deployment. The monthly run-rate in the bar above updates as you change it.",
  "/roi": "What is it worth, and when does it pay back? Add the time it saves and the costs it avoids, then set how much of that you expect to actually realise. Payback, NPV and ROI in the bar above follow from this page.",
  "/capacity": "How many provisioned throughput units (PTU) would this need? Enter the peak load and the page sizes a PTU deployment, so you can compare reserved capacity with pay-as-you-go pricing.",
  "/report": "What can be handed to someone else? This page lays the numbers out as a printable report. Print it or save it as PDF; the sidebar also exports Excel and CSV.",
  "/tokens": "How many tokens does this file or this agent use, and what does that cost? Describe a document by its pages and pictures, or an agent by its steps, and see the tokens and cost per model. The stepper under each result shows every sum, so you can check it by hand.",
  "/settings": "What do the defaults assume? Language, deployment type, processing tier, timeline and the Snowflake options live here. Changing one updates every page that did not set its own value.",
};

import { ensureStorageMigrated } from "./storage-migrate";
ensureStorageMigrated();

export const introKey = (path: string) => `roi-calculator:intro:${path}`;
export const INTRO_RESET_EVENT = "studio:intro-reset";
