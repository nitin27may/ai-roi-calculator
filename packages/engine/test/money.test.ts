import { describe, expect, it } from "vitest";
import { cad, cadUnit, compactCad, kcad } from "../src/index.js";

describe("cad", () => {
  it("formats a positive amount with the C$ prefix and thousands separators", () => {
    expect(cad(407719)).toBe("C$407,719");
  });
  it("uses a minus sign (not a hyphen) for negatives", () => {
    expect(cad(-1200)).toBe("−C$1,200");
  });
  it("rounds to the given decimals", () => {
    expect(cad(1.005, 2)).toBe("C$1.01");
  });
});

describe("compactCad", () => {
  it("formats millions with one decimal", () => {
    expect(compactCad(1_234_567)).toBe("C$1.2M");
  });
  it("keeps the sign for negative millions", () => {
    expect(compactCad(-2_000_000)).toBe("−C$2.0M");
  });
});

describe("cadUnit", () => {
  it("uses 2 decimals under C$10", () => {
    expect(cadUnit(0.26)).toBe("C$0.26");
  });
  it("uses 4 decimals under C$0.01", () => {
    expect(cadUnit(0.0021)).toBe("C$0.0021");
  });
  it("falls back to cad()'s whole-number formatting at C$10 and above", () => {
    expect(cadUnit(185_333)).toBe(cad(185_333));
    expect(cadUnit(10)).toBe(cad(10));
  });
  it("keeps the minus sign for small negative amounts", () => {
    expect(cadUnit(-0.26)).toBe("−C$0.26");
  });
  it("shows exactly C$0 for zero", () => {
    expect(cadUnit(0)).toBe("C$0");
  });
});

describe("kcad", () => {
  it("formats thousands as C$Nk", () => {
    expect(kcad(407_719)).toBe("C$408k");
  });
  it("switches to compactCad at or above 1,000k", () => {
    expect(kcad(1_234_567)).toBe(compactCad(1_234_567));
  });
  it("falls back to cad below 1,000", () => {
    expect(kcad(500)).toBe("C$500");
  });
});
