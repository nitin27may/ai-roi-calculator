import { describe, expect, it } from "vitest";
import { ProjectSchema, meetingIntelligence } from "@roi-calculator/engine";
import { describeIssue, humanizeIssue, pathLabel, rangeMessage } from "../lib/validation";
import { GLOSSARY } from "../lib/glossary";
import { nextMenuIndex } from "../lib/menu-keys";

describe("rangeMessage", () => {
  it("explains a share above 100%", () => {
    expect(rangeMessage(150, { min: 0, max: 100, suffix: "%" })).toBe("Max 100%: this is a share of the total. 150% was not applied.");
  });
  it("uses the field's own reason when given", () => {
    expect(rangeMessage(25, { min: 1, max: 20 }, "more repeats add cost with no extra signal")).toBe("Max 20: more repeats add cost with no extra signal. 25 was not applied.");
  });
  it("explains a negative value", () => {
    expect(rangeMessage(-1, { min: 0 })).toBe("Min 0: this cannot be negative. -1 was not applied.");
  });
  it("explains a value below a positive minimum", () => {
    expect(rangeMessage(0, { min: 1 })).toBe("Min 1. 0 was not applied.");
  });
  it("accepts in-range and non-finite values", () => {
    expect(rangeMessage(50, { min: 0, max: 100, suffix: "%" })).toBeNull();
    expect(rangeMessage(NaN, { min: 0 })).toBeNull();
  });
});

describe("schema issue wording", () => {
  it("names the field, not the path", () => {
    expect(pathLabel(["timeline", "buildMonths"])).toBe("Build months");
    expect(pathLabel(["a", 3, "someOtherKey"])).toBe("Some other key");
    expect(pathLabel([])).toBe("That value");
  });
  it("turns a real refused edit into a sentence with no path or schema text", () => {
    const bad = structuredClone(meetingIntelligence) as unknown as { timeline: { buildMonths: number } };
    bad.timeline.buildMonths = -4;
    const r = ProjectSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (r.success) return;
    const msg = humanizeIssue(r.error.issues[0]);
    expect(msg).toMatch(/^That change was not applied\. /);
    expect(msg).not.toMatch(/timeline\.|Number must|Expected/);
  });
  it("handles a missing issue and unknown codes", () => {
    expect(describeIssue(undefined)).toMatch(/no longer be valid/);
    expect(describeIssue({ path: ["x"], message: "m", code: "custom" })).toBe("X is not valid. Check the value and try again.");
    expect(describeIssue({ path: ["name"], message: "m", code: "invalid_type", expected: "string", received: "undefined" })).toBe("Name needs a value.");
  });
});

describe("glossary", () => {
  it("covers the required terms with plain and technical text", () => {
    const need = ["token", "input-cached-output", "reasoning-tokens", "cache-write", "deployment-types", "processing-tiers", "ptu", "ai-dev-lab", "harness", "p50-p90", "npv", "payback", "irr", "realisation"];
    const have = new Map(GLOSSARY.map((t) => [t.id, t]));
    for (const id of need) {
      const t = have.get(id);
      expect(t, id).toBeDefined();
      expect(t!.plain.length).toBeGreaterThan(30);
      expect(t!.technical.length).toBeGreaterThan(30);
    }
    expect(new Set(GLOSSARY.map((t) => t.id)).size).toBe(GLOSSARY.length);
  });
});

describe("nextMenuIndex", () => {
  it("wraps and jumps", () => {
    expect(nextMenuIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextMenuIndex("ArrowDown", -1, 3)).toBe(0);
    expect(nextMenuIndex("ArrowUp", 0, 3)).toBe(2);
    expect(nextMenuIndex("ArrowUp", -1, 3)).toBe(2);
    expect(nextMenuIndex("Home", 2, 3)).toBe(0);
    expect(nextMenuIndex("End", 0, 3)).toBe(2);
    expect(nextMenuIndex("a", 0, 3)).toBeNull();
    expect(nextMenuIndex("ArrowDown", 0, 0)).toBeNull();
  });
});
