import { describe, expect, it } from "vitest";
import { COMPARE_ROWS, bestIndex } from "../lib/compare";

describe("bestIndex", () => {
  it("picks the lowest when lower is better and the highest otherwise", () => {
    expect(bestIndex([300, 100, 200], true)).toBe(1);
    expect(bestIndex([300, 100, 200], false)).toBe(0);
  });
  it("ignores projects with no value", () => {
    expect(bestIndex([null, 20, 10], true)).toBe(2);
  });
  it("returns -1 for fewer than two values or a tie for best", () => {
    expect(bestIndex([null, 5, null], true)).toBe(-1);
    expect(bestIndex([4, 4, 9], true)).toBe(-1);
    expect(bestIndex([], false)).toBe(-1);
  });
});

describe("COMPARE_ROWS", () => {
  const p = { name: "A", build: 1000, runPerMonth: 50, benefitPerYear: 9000, npv: 123456, paybackMonth: null, irrPct: 352.8 } as never;
  it("covers build, run rate, benefit, NPV, payback and IRR", () => {
    expect(COMPARE_ROWS.map((r) => r.id)).toEqual(["build", "runPerMonth", "benefitPerYear", "npv", "paybackMonth", "irrPct"]);
  });
  it("shows plain words for a missing payback and a capped IRR on the bar, the full figure in the table", () => {
    const pay = COMPARE_ROWS.find((r) => r.id === "paybackMonth")!;
    expect(pay.table(pay.value(p))).toBe("Not within plan");
    const irr = COMPARE_ROWS.find((r) => r.id === "irrPct")!;
    expect(irr.table(irr.value(p))).toBe("352.8% a year");
    expect(irr.bar(irr.value(p))).not.toBe(irr.table(irr.value(p)));
  });
});
