import { describe, expect, it } from "vitest";
import { blankProject, meetingIntelligence, ProjectSchema, type Project, type ProjectType } from "@roi-calculator/engine";
import { activityKindsFor, projectNavViews, workloadKindsFor } from "../lib/nav";

const typed = (p: Project, types: ProjectType[]): Project => { const q = structuredClone(p); q.features = [{ id: "f", label: "F", types }]; return q; };
const blank = () => ProjectSchema.parse(blankProject("x"));
const hrefs = (p: Project) => projectNavViews(p).map((v) => v.href);

describe("Capacity (PTU) nav gating", () => {
  it("shows Capacity for a blank project and the sample", () => {
    expect(hrefs(blank())).toContain("/capacity");
    expect(hrefs(ProjectSchema.parse(meetingIntelligence))).toContain("/capacity");
  });
  it("hides Capacity when the project does not use AI", () => {
    expect(hrefs(typed(blank(), ["automation"]))).not.toContain("/capacity");
  });
  it("shows Capacity again once a feature is AI", () => {
    expect(hrefs(typed(blank(), ["automation", "ai"]))).toContain("/capacity");
  });
  it("keeps the other pages in order", () => {
    expect(hrefs(typed(blank(), ["automation"]))).toEqual(["/summary", "/overview", "/build", "/run", "/roi", "/report", "/settings"]);
  });
});

describe("add-menu gating", () => {
  const kinds = [{ kind: "chat" }, { kind: "fixed" }, { kind: "hosting" }];
  const acts = [{ kind: "bakeoff" }, { kind: "tooling" }];
  it("shows everything until a type is chosen, and when a feature is AI", () => {
    expect(workloadKindsFor(blank(), kinds)).toEqual(kinds);
    expect(workloadKindsFor(typed(blank(), ["ai"]), kinds)).toEqual(kinds);
    expect(activityKindsFor(blank(), acts)).toEqual(acts);
  });
  it("hides AI kinds when types are chosen and none is AI", () => {
    const p = typed(blank(), ["saas"]);
    expect(workloadKindsFor(p, kinds).map((k) => k.kind)).toEqual(["fixed", "hosting"]);
    expect(activityKindsFor(p, acts).map((k) => k.kind)).toEqual(["tooling"]);
  });
});
