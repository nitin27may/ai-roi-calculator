import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blankProject, meetingIntelligence, ProjectSchema, showsAiExperiments, type Project, type ProjectType } from "@roi-calculator/engine";
import { GLOSSARY } from "../lib/glossary";
import { HELP } from "../lib/help";
import { TOOL_MENU } from "../lib/engineering-lab";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const typed = (types: ProjectType[]): Project => { const q = ProjectSchema.parse(blankProject("x")); q.features = [{ id: "f", label: "F", types }]; return q; };

describe("AI experiments visibility (same rule as A1)", () => {
  it("is shown for the sample, a blank project and a project with an AI feature", () => {
    expect(showsAiExperiments(ProjectSchema.parse(meetingIntelligence))).toBe(true);
    expect(showsAiExperiments(ProjectSchema.parse(blankProject("x")))).toBe(true);
    expect(showsAiExperiments(typed(["ai"]))).toBe(true);
    expect(showsAiExperiments(typed(["automation", "ai"]))).toBe(true);
  });
  it("is hidden when types are chosen and none is AI", () => {
    expect(showsAiExperiments(typed(["automation"]))).toBe(false);
    expect(showsAiExperiments(typed(["newApp", "replatform"]))).toBe(false);
  });
  it("comes back when a non-AI typed project already has AI work", () => {
    const p = typed(["automation"]);
    p.build.activities.push({ ...ProjectSchema.parse(meetingIntelligence).build.activities.find((a) => a.kind === "bakeoff")! });
    expect(showsAiExperiments(p)).toBe(true);
  });
});

describe("Engineering tools & lab wording", () => {
  const page = read("app/build/page.tsx");
  it("renames the Build page section and keeps AI experiments as a collapsible group", () => {
    expect(page).toContain("Engineering tools & lab");
    expect(page).toContain("AI experiments (");
    expect(page).toContain('aria-expanded={expOpen}');
    expect(page).not.toContain("AI Dev Lab");
  });
  it("renames the Overview lane, the KPI bar and the Summary tile", () => {
    expect(read("app/overview/page.tsx")).toContain('["Engineering tools & lab"');
    expect(read("components/shell.tsx")).toContain("of it engineering tools & lab");
    expect(read("components/shell.tsx")).not.toContain("of it AI Dev Lab");
    expect(read("components/summary-parts.tsx")).toContain("% engineering tools & lab");
  });
  it("keeps AI Dev Lab as a glossary term and adds the new terms", () => {
    const ids = GLOSSARY.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["ai-dev-lab", "engineering-tools-lab", "ai-assisted-development"]));
    expect(GLOSSARY.find((t) => t.id === "engineering-tools-lab")!.term).toBe("Engineering tools & lab");
    expect(GLOSSARY.find((t) => t.id === "ai-dev-lab")!.term).toBe("AI Dev Lab");
  });
  it("offers the five tool kinds and AI-assisted development in the tools add menu", () => {
    expect(TOOL_MENU.map((m) => m.label)).toEqual(["IDE and developer licences", "CI/CD", "Test tooling", "Load-testing service", "Other tool", "AI-assisted development"]);
  });
});

describe("Engineering tools & lab help coverage", () => {
  it("has an entry for every help tip in the section", () => {
    const src = read("components/engineering-lab.tsx");
    const used = [...src.matchAll(/HelpTip id="(\w+)"/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThanOrEqual(3);
    expect(used.filter((id) => !(id in HELP))).toEqual([]);
    for (const id of ["aiAssistPct", "toolPerPerson", "toolAmount"]) expect(HELP[id as keyof typeof HELP], id).toBeDefined();
  });
});
