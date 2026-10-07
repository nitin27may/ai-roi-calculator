import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { ProjectSchema, blankProject, buildLedger, chequesTemplate, computeRoi, meetingIntelligence, roiOptions, type Project } from "@roi-calculator/engine";
import { storySegments, storyText } from "../lib/story";

const catalog = loadCatalog();
const story = (p: Project) => {
  const l = buildLedger(p, catalog, "p50");
  const r = computeRoi(l, p.roi.basis, p.roi.discountRatePct, roiOptions(p));
  const delivery = l.months.reduce((s, m) => s + (m.byStream.delivery ?? 0), 0);
  return storyText(storySegments(p, { deliveryCad: delivery, paybackMonth: r.paybackMonth ?? null }), "BASIS");
};
const noGaps = (t: string) => {
  expect(t).not.toMatch(/ {2}|\bfor\s+months|\bNaN\b|undefined|\bnull\b/);
  expect(t).not.toMatch(/testing 0 candidate/);
};

describe("story sentence", () => {
  it("keeps the candidate-models line for the AI sample", () => {
    const t = story(ProjectSchema.parse(meetingIntelligence));
    expect(t).toMatch(/^\d+ developers build for \d+ months, testing \d+ candidate models\. Then /);
    expect(t).toMatch(/users adopt it over \d+ months\. ROI is measured on BASIS\.$/);
    noGaps(t);
  });

  it("describes a non-AI project by team, build months, environments and go-live, with no model talk", () => {
    const p = ProjectSchema.parse(chequesTemplate("Cheques"));
    const t = story(p);
    expect(t).not.toMatch(/candidate|developers build/);
    expect(t).toMatch(/\d+ (people build|person builds) for \d+ months/);
    expect(t).toMatch(/with \d+ environments?/);
    expect(t).toMatch(/Then .*over \d+ months\./);
    expect(t).toMatch(/(Payback comes in month \d+|It does not pay back within the plan)\. ROI is measured on BASIS\.$/);
    noGaps(t);
  });

  it("names delivery costs when the project has some", () => {
    const p = ProjectSchema.parse(chequesTemplate("Cheques"));
    const l = buildLedger(p, catalog, "p50");
    if (l.months.some((m) => (m.byStream.delivery ?? 0) > 0)) expect(story(p)).toMatch(/of delivery costs/);
    const t = storyText(storySegments(p, { deliveryCad: 12_500, paybackMonth: 14 }), "BASIS");
    expect(t).toMatch(/with .*C\$12,500 of delivery costs/);
    expect(t).toContain("Payback comes in month 14.");
  });

  it("reads generically when build labour is excluded", () => {
    const p = ProjectSchema.parse(chequesTemplate("Cheques"));
    p.build.includeLabour = false;
    const t = story(p);
    expect(t).toMatch(/^Build labour is excluded from every figure\. The build runs for \d+ months/);
    expect(t).not.toMatch(/AI Dev Lab|candidate|developers/);
    noGaps(t);
  });

  it("keeps the engineering lab wording for an AI project with labour excluded", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    p.build.includeLabour = false;
    const t = story(p);
    expect(t).toMatch(/^Build labour is excluded from every figure\. The engineering lab runs for \d+ months, testing \d+ candidate models/);
    expect(t).not.toContain("AI Dev Lab");
  });

  it("leaves out numbers the project does not have", () => {
    const p = ProjectSchema.parse(blankProject("Blank", "2027-01-01"));
    p.build.team = [];
    p.workloads = [];
    p.environments = [];
    const t = story(p);
    expect(t).toMatch(/^The build runs for \d+ months\. Then it goes live and reaches full use over \d+ months\./);
    expect(t).not.toMatch(/environment|delivery|people|developers|candidate/);
    noGaps(t);
  });

  it("falls back from a missing experimenting team and a missing user count on an AI project", () => {
    const p = ProjectSchema.parse(meetingIntelligence);
    for (const t of p.build.team) t.experiments = false;
    p.workloads = p.workloads.filter((w) => w.kind !== "chat");
    const t = story(p);
    expect(t).toMatch(/^The build runs for \d+ months, testing \d+ candidate models\. Then your users adopt it over \d+ months\./);
    noGaps(t);
  });

  it("uses singular words for one person and one environment", () => {
    const p = ProjectSchema.parse(blankProject("One", "2027-01-01"));
    p.build.team = [{ ...p.build.team[0]!, people: 1, experiments: false }];
    const t = story(p);
    expect(t).toContain("1 person builds for");
  });
});
