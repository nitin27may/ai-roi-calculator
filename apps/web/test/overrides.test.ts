import { describe, expect, it } from "vitest";
import { cellLabel, parseOverrideInput } from "../lib/overrides";

describe("parseOverrideInput", () => {
  it("treats blank as the calculation", () => {
    expect(parseOverrideInput("")).toEqual({ kind: "clear" });
    expect(parseOverrideInput("  ")).toEqual({ kind: "clear" });
  });
  it("accepts plain, comma and C$ forms, and zero", () => {
    expect(parseOverrideInput("1250")).toEqual({ kind: "set", value: 1250 });
    expect(parseOverrideInput("C$1,250.50")).toEqual({ kind: "set", value: 1250.5 });
    expect(parseOverrideInput("$ 0")).toEqual({ kind: "set", value: 0 });
  });
  it("refuses negatives, text and absurd values with a message", () => {
    for (const bad of ["-5", "abc", "1e3", "12.3.4", "5000000000"]) expect(parseOverrideInput(bad).kind).toBe("error");
  });
});

describe("cellLabel", () => {
  it("names activity, month and unit", () => expect(cellLabel("AI coding tools", 2)).toBe("AI coding tools, Month 2, C$"));
});
