/** First-run product tour: step data and seen-state logic. Pure, so it can be tested without a browser. */

import { ensureStorageMigrated } from "./storage-migrate";
ensureStorageMigrated();

/** Bump to show the tour again to everyone who has already finished or skipped it. */
export const TOUR_VERSION = 1;
export const TOUR_KEY = `roi-calculator:tour.v${TOUR_VERSION}`;
export const TOUR_START_EVENT = "studio:tour-start";

export type TourState = "finished" | "skipped";

export interface TourStep {
  id: string;
  /** Page the step needs. Omitted means stay on the current page. */
  route?: string;
  /** Value of the data-tour attribute on the element to highlight. Omitted means a centered card. */
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "welcome", title: "Welcome to the ROI Calculator",
    body: "The ROI Calculator estimates what an AI project costs to build and to run, what it is worth, and when it pays back. Every figure is in CAD and every input can be changed. This tour takes about a minute." },
  { id: "projects", route: "/projects", target: "projects-list", title: "Projects and the sample",
    body: "Each estimate is a project, saved in this browser. The sample project is a worked example: open it, change things, or use New copy of the sample in the sidebar to start again." },
  { id: "summary-tiles", route: "/summary", target: "summary-tiles", title: "The headline numbers",
    body: "Build cost, monthly running cost, benefit at full adoption, payback and ROI sit at the top of the Summary. They update as you change anything else." },
  { id: "summary-charts", route: "/summary", target: "summary-charts", title: "Waterfall and payback",
    body: "The waterfall shows how build and run costs net against the benefit. The line beside it shows the month where the cumulative position turns positive. Both charts have a table view." },
  { id: "build", route: "/build", target: "build-list", title: "Build and the AI Dev Lab",
    body: "Build covers the team, the dev environment and the AI Dev Lab: the tokens and services your team uses while building. Pick a line to edit it." },
  { id: "run", route: "/run", target: "run-workloads", title: "Run workloads",
    body: "Each workload is something the live system does, such as chat, documents or an agent. Select one to set its volume, model and tokens per use." },
  { id: "deployment", route: "/run", target: "run-inspector", title: "Deployment and tier per workload",
    body: "The selected workload shows its settings here, including a Deployment dropdown. Leave it on the project default or set Global, Canada Regional or US Data Zone for this workload alone." },
  { id: "explain", route: "/run", target: "how-calculated", title: "How this is calculated",
    body: "Every workload lists the formula behind its cost, with the price and quantity used. Check these before you trust a total." },
  { id: "roi", route: "/roi", target: "roi-view", title: "Value and ROI, with scenarios",
    body: "Enter the time saved and costs avoided on the left. The views switch between cash position, ROI by capability, sensitivity and Scenarios, which compare what-ifs with your baseline." },
  { id: "export", route: "/report", target: "export", title: "Report and Excel export",
    body: "The Report page lays the project out as a printable document. The sidebar exports the same numbers to Excel or CSV, and Save to file keeps the whole project." },
  { id: "settings", route: "/settings", target: "settings-azure", title: "Settings",
    body: "Defaults live here: timeline, language, Azure deployment type and processing tier, and the Snowflake edition. Prices are shown in CAD. Changing a default updates every workload that has not set its own." },
  { id: "help", target: "help-menu", title: "Help is always here",
    body: "The Help menu has the glossary, prices and sources, a short note on what each page answers, and Take the tour to see this again." },
];

/** The slice of the Storage interface the tour needs. */
export interface TourStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readTourState(storage: TourStorage | null | undefined, key = TOUR_KEY): TourState | null {
  try {
    const v = storage?.getItem(key);
    return v === "finished" || v === "skipped" ? v : null;
  } catch {
    return null;
  }
}

export function writeTourState(storage: TourStorage | null | undefined, state: TourState, key = TOUR_KEY): void {
  try {
    storage?.setItem(key, state);
  } catch {
    /* storage unavailable: the tour may show again next visit */
  }
}

/** Shown until the user has finished or skipped this version. Unreadable storage counts as not seen. */
export const shouldAutoShowTour = (storage: TourStorage | null | undefined, key = TOUR_KEY): boolean => readTourState(storage, key) === null;

export const clampStep = (i: number, count = TOUR_STEPS.length): number => Math.min(Math.max(Math.trunc(Number.isFinite(i) ? i : 0), 0), count - 1);
