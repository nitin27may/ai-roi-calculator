import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOUR_KEY, TOUR_STEPS, TOUR_VERSION, clampStep, readTourState, shouldAutoShowTour, writeTourState, type TourStorage } from "../lib/tour";

const root = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
const source = [...walk("app"), ...walk("components")].filter((f) => f !== "components/product-tour.tsx").map((f) => readFileSync(join(root, f), "utf8")).join("\n");
const routes = new Set(readdirSync(join(root, "app")).filter((n) => statSync(join(root, "app", n)).isDirectory()).map((n) => `/${n}`));

const memory = (): TourStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("tour seen-state", () => {
  it("shows on a first visit", () => expect(shouldAutoShowTour(memory())).toBe(true));
  it("keeps showing until finished or skipped", () => {
    const s = memory();
    expect(shouldAutoShowTour(s)).toBe(true);
    expect(shouldAutoShowTour(s)).toBe(true);
  });
  it("skip persists", () => {
    const s = memory();
    writeTourState(s, "skipped");
    expect(readTourState(s)).toBe("skipped");
    expect(shouldAutoShowTour(s)).toBe(false);
  });
  it("finish persists", () => {
    const s = memory();
    writeTourState(s, "finished");
    expect(s.data.get(TOUR_KEY)).toBe("finished");
    expect(shouldAutoShowTour(s)).toBe(false);
  });
  it("a version bump shows it again", () => {
    const s = memory();
    writeTourState(s, "finished");
    expect(shouldAutoShowTour(s, `roi-calculator:tour.v${TOUR_VERSION + 1}`)).toBe(true);
  });
  it("the key carries the version", () => expect(TOUR_KEY).toBe(`roi-calculator:tour.v${TOUR_VERSION}`));
  it("relaunch starts at step 1 whatever is stored", () => {
    const s = memory();
    writeTourState(s, "skipped");
    expect(clampStep(0)).toBe(0);
    expect(readTourState(s)).toBe("skipped");
  });
  it("ignores unknown stored values", () => {
    const s = memory();
    s.setItem(TOUR_KEY, "banana");
    expect(shouldAutoShowTour(s)).toBe(true);
  });
  it("survives blocked or missing storage", () => {
    const broken: TourStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(shouldAutoShowTour(broken)).toBe(true);
    expect(() => writeTourState(broken, "skipped")).not.toThrow();
    expect(shouldAutoShowTour(null)).toBe(true);
  });
  it("clamps the step index", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(999)).toBe(TOUR_STEPS.length - 1);
    expect(clampStep(Number.NaN)).toBe(0);
  });
});

describe("tour step data", () => {
  it("has unique ids and no empty text", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const s of TOUR_STEPS) { expect(s.title.trim()).not.toBe(""); expect(s.body.trim()).not.toBe(""); }
  });
  it("points every route at a real page", () => {
    for (const s of TOUR_STEPS) if (s.route) expect(routes.has(s.route), `${s.id}: ${s.route}`).toBe(true);
  });
  it("has a data-tour attribute in the app source for every target", () => {
    for (const s of TOUR_STEPS) if (s.target) expect(new RegExp(`data-tour=(\\{[^}]*)?"${s.target}"`).test(source), `${s.id}: ${s.target}`).toBe(true);
  });
  it("uses no emojis", () => {
    for (const s of TOUR_STEPS) expect(/\p{Extended_Pictographic}/u.test(s.title + s.body)).toBe(false);
  });
  it("is launchable from the Help menu", () => {
    expect(readFileSync(join(root, "components/help-menu.tsx"), "utf8")).toContain("Take the tour");
  });
});
