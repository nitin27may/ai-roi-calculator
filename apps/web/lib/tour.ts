/** First-run product tour: step data and seen-state logic. Pure, so it can be tested without a browser. */

import { ensureStorageMigrated } from "./storage-migrate";
ensureStorageMigrated();

/** Bump to show the tour again to everyone who has already finished or skipped it. */
export const TOUR_VERSION = 2;
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
    body: "The ROI Calculator estimates what a project costs to build and to run, what it saves or earns, and when it pays back. It suits new applications, enhancements, automation, migrations, replacing a system with SaaS, and AI. Every figure is in CAD and every input can be changed. This tour takes about a minute." },
  { id: "projects", route: "/projects", target: "projects-list", title: "Projects and the sample",
    body: "Each estimate is a project, saved in this browser. The sample project is a worked example: open it, change things, or use New copy of the sample in the sidebar to start again. New estimate asks what kind of change you are making and builds a starting point." },
  { id: "summary-tiles", route: "/summary", target: "summary-tiles", title: "The headline numbers",
    body: "Build cost, annual running cost, benefit per year, payback and ROI sit at the top of the Summary. They update as you change anything else. Below them are the current-state comparison, the scorecard and the finance measures." },
  { id: "summary-charts", route: "/summary", target: "summary-charts", title: "Waterfall and payback",
    body: "The waterfall shows how build and run costs net against the benefit. The line beside it shows the month where the cumulative position turns positive. Both charts have a table view." },
  { id: "build", route: "/build", target: "build-list", title: "Build: team, phases and delivery",
    body: "Build covers the team and rate card, the delivery phases, one-time delivery costs such as vendor fees and training, and the engineering tools and lab used while building. Pick a line to edit it." },
  { id: "infrastructure", route: "/infrastructure", target: "infra-environments", title: "Environments and infrastructure",
    body: "Define the environments (dev, test, UAT, production, disaster recovery) with their size and hours, then add each server, database or service once and say which environments it exists in. Reserved pricing, Hybrid Benefit and dev/test pricing are options on each resource." },
  { id: "run", route: "/run", target: "run-workloads", title: "Run: what it costs once it is live",
    body: "Each line is something the live system costs: hosting, seats and licences, a vendor or support contract, a fee per transaction and, for AI projects, model workloads. Select one to set its volume and price." },
  { id: "run-inspector", route: "/run", target: "run-inspector", title: "Settings for the selected line",
    body: "The selected line shows its inputs here: volume, price, when it starts and, where it applies, which environments or deployment it uses. Anything left unset follows the project default." },
  { id: "explain", route: "/run", target: "how-calculated", title: "How this is calculated",
    body: "Every line lists the formula behind its cost, with the price and quantity used. Check these before you trust a total." },
  { id: "roi", route: "/roi", target: "roi-view", title: "Value and ROI",
    body: "Enter the time saved, the costs avoided and the one-off benefits on the left, then set how much of that you expect to realise. Payback, NPV and ROI follow from this page." },
  { id: "current-state", route: "/roi", target: "roi-views", title: "Current state and scorecard",
    body: "The views switch between cash position, ROI by capability, the current state, the scorecard, sensitivity and scenarios. Current state lists what the work costs today and what each line saves once the change is live. The scorecard tracks benefits that are not money, such as speed or risk, and can put a value on them." },
  { id: "export", route: "/report", target: "export", title: "Report and Excel export",
    body: "The Report page lays the project out as a printable document. The sidebar exports the same numbers to Excel or CSV, and Save to file keeps the whole project." },
  { id: "settings", route: "/settings", target: "settings-azure", title: "Settings",
    body: "Defaults live here: timeline, language, discount rate, how engineering tools and the lab are costed, and the platform defaults for Azure and Snowflake. Prices are shown in CAD. Changing a default updates every line that has not set its own." },
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
