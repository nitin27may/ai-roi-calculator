import { describe, expect, it } from "vitest";
import { isFlatRange } from "../lib/range";

describe("isFlatRange", () => {
  it("is flat when all three cases match", () => expect(isFlatRange({ low: 631, expected: 631, high: 631 })).toBe(true));
  it("is flat for a negative figure that does not vary", () => expect(isFlatRange({ low: -954, expected: -954, high: -954 })).toBe(true));
  it("is flat for zero", () => expect(isFlatRange({ low: 0, expected: 0, high: 0 })).toBe(true));
  it("is not flat when the cases differ by more than half a percent", () => expect(isFlatRange({ low: 1000, expected: 1100, high: 1200 })).toBe(false));
  it("treats a half-percent wobble as flat", () => expect(isFlatRange({ low: 1000, expected: 1002, high: 1004 })).toBe(true));
});
