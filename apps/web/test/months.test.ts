import { describe, expect, it } from "vitest";
import { calendarMonth, monthLegendText, monthTitle, MONTH_TABLE_NOTES } from "../lib/months";
import { GLOSSARY } from "../lib/glossary";
import { HELP } from "../lib/help";

describe("month labelling", () => {
  it("maps project months to calendar months across a year end", () => {
    expect(calendarMonth("2027-01-01", 1)).toBe("Jan 2027");
    expect(calendarMonth("2027-11-01", 3)).toBe("Jan 2028");
  });
  it("legend states what M1 is and where build ends", () => {
    const t = monthLegendText("2027-01-01", 6, 36);
    expect(t).toContain("M1 = month 1 of the project");
    expect(t).toContain("months 1–6 are build");
    expect(t).toContain("months 7–36 are production");
  });
  it("tooltip says build or production", () => {
    expect(monthTitle("2027-01-01", 2, 6)).toContain("build month");
    expect(monthTitle("2027-01-01", 9, 6)).toContain("production month");
  });
  it("every table caption is non-empty plain text", () => {
    for (const v of Object.values(MONTH_TABLE_NOTES)) expect(v.length).toBeGreaterThan(40);
  });
});

describe("new glossary and help entries", () => {
  it("has month index and intensity terms", () => {
    expect(GLOSSARY.find((g) => g.id === "month-index")?.term).toMatch(/M1/);
    expect(GLOSSARY.find((g) => g.id === "intensity")).toBeTruthy();
  });
  it("has help for the pricing model and cost basis settings", () => {
    expect(HELP.settingsPricingModel.meaning).toMatch(/Provisioned/);
    expect(HELP.settingsCostBasis.meaning).toMatch(/life cycle/);
  });
});
