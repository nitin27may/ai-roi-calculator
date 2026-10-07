import { describe, expect, it } from "vitest";
import { loadCatalog } from "@roi-calculator/catalog";
import { CURRENT_PROJECT_VERSION, PROJECT_TEMPLATES, ProjectSchema, blankProject, buildLedger, hidesAiChoices, meetingIntelligence, migrateProject, projectTypes, usesAi, type Project, type ProjectType } from "../src/index.js";

const cat = loadCatalog();
const base = (): Project => ProjectSchema.parse(blankProject("Types"));
const withTypes = (...sets: ProjectType[][]): Project => {
  const p = base();
  p.features = sets.map((types, i) => ({ id: `f${i}`, label: `F${i}`, types }));
  return p;
};

describe("projectTypes", () => {
  it("is empty when nothing is chosen, de-duplicated and in display order otherwise", () => {
    expect(projectTypes(base())).toEqual([]);
    expect(projectTypes(withTypes([], []))).toEqual([]);
    expect(projectTypes(withTypes(["ai", "automation"], ["automation", "newApp"]))).toEqual(["newApp", "automation", "ai"]);
  });
});

describe("usesAi truth table", () => {
  const sample = () => structuredClone(ProjectSchema.parse(meetingIntelligence));
  it("a blank project with no types, workloads or activities is not AI", () => expect(usesAi(base())).toBe(false));
  it("a feature typed ai is AI", () => expect(usesAi(withTypes(["ai"]))).toBe(true));
  it("a feature typed automation only is not AI", () => expect(usesAi(withTypes(["automation"]))).toBe(false));
  it("an AI workload keeps the AI pages whatever the types say", () => {
    const p = sample();
    p.features.forEach((f) => (f.types = ["automation"]));
    expect(usesAi(p)).toBe(true);
  });
  it("fixed and hosting workloads are not AI", () => {
    const p = withTypes(["automation"]);
    p.workloads = sample().workloads.filter((w) => w.kind === "fixed" || w.kind === "hosting");
    expect(p.workloads.length).toBeGreaterThan(0);
    expect(usesAi(p)).toBe(false);
  });
  it("a tooling activity is not AI but any other Dev Lab activity is", () => {
    const s = sample();
    const p = withTypes(["automation"]);
    p.build.activities = s.build.activities.filter((a) => a.kind === "tooling");
    expect(usesAi(p)).toBe(false);
    p.build.activities = s.build.activities.filter((a) => a.kind !== "tooling").slice(0, 1);
    expect(usesAi(p)).toBe(true);
  });
});

describe("hidesAiChoices", () => {
  it("gates only when a type is chosen and none is ai", () => {
    expect(hidesAiChoices(base())).toBe(false);
    expect(hidesAiChoices(withTypes([]))).toBe(false);
    expect(hidesAiChoices(withTypes(["automation"]))).toBe(true);
    expect(hidesAiChoices(withTypes(["automation"], ["ai"]))).toBe(false);
  });
});

describe("v5 to v6 migration", () => {
  const sources = [["sample", meetingIntelligence as unknown], ...PROJECT_TEMPLATES.map((t) => [t.id, t.make(`v5 ${t.id}`) as unknown] as const)] as const;
  const v5 = (p: unknown) => ({ ...(structuredClone(p) as Record<string, unknown>), version: 5 });

  for (const [name, project] of sources) {
    it(`${name}: identical lines and totals`, () => {
      const migrated = ProjectSchema.parse(migrateProject(v5(project)));
      const current = ProjectSchema.parse(project);
      expect(migrated.version).toBe(CURRENT_PROJECT_VERSION);
      const a = buildLedger(migrated, cat), b = buildLedger(current, cat);
      expect(a.totals).toEqual(b.totals);
      a.months.forEach((mo, i) => {
        expect(mo.lines.map((l) => [l.id, l.cost])).toEqual(b.months[i]!.lines.map((l) => [l.id, l.cost]));
        expect(mo.byStream).toEqual(b.months[i]!.byStream);
      });
      expect(usesAi(migrated)).toBe(usesAi(current));
    });
  }

  it("types the sample's features ai", () => {
    const m = ProjectSchema.parse(migrateProject(v5(meetingIntelligence)));
    expect(m.features.map((f) => f.types)).toEqual([["ai"], ["ai"]]);
  });

  it("gives a feature with only fixed or hosting workloads no type, and an unlinked item to the single feature", () => {
    const raw = {
      ...v5(blankProject("m")), features: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      workloads: [
        { kind: "fixed", id: "w1", label: "Platform", featureId: "a", group: "g", items: [] },
        { kind: "hosting", id: "w2", label: "Host", featureId: "a" },
        { kind: "llm", id: "w3", label: "LLM", featureId: "b" },
      ],
    };
    const m = migrateProject(raw) as { features: { id: string; types: string[] }[] };
    expect(m.features).toEqual([{ id: "a", label: "A", types: [] }, { id: "b", label: "B", types: ["ai"] }]);
    const single = migrateProject({ ...raw, features: [{ id: "a", label: "A" }], workloads: [{ kind: "llm", id: "w3", label: "LLM" }] }) as { features: { types: string[] }[] };
    expect(single.features[0]!.types).toEqual(["ai"]);
  });

  it("follows an activity's workstream to its feature and ignores tooling", () => {
    const raw = {
      ...v5(blankProject("m")), features: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      build: { ...(blankProject("m").build as object), workstreams: [{ id: "ws", label: "WS", featureId: "b" }], activities: [{ kind: "playground", id: "x", label: "X", workstreamId: "ws" }, { kind: "tooling", id: "t", label: "T", featureId: "a" }] },
    };
    const m = migrateProject(raw) as { features: { id: string; types: string[] }[] };
    expect(m.features.map((f) => f.types)).toEqual([[], ["ai"]]);
  });
});
