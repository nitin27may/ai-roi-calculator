import { describe, expect, it } from "vitest";
import { menuPlacement } from "../lib/menu-keys";

describe("menuPlacement", () => {
  it("opens upward when it fits above", () => expect(menuPlacement(500, 100, 300)).toEqual({ up: true, maxHeight: 500 }));
  it("opens downward when it does not fit above and there is more room below", () => expect(menuPlacement(60, 600, 300)).toEqual({ up: false, maxHeight: 600 }));
  it("stays upward and scrolls when neither side fits but above is larger", () => expect(menuPlacement(250, 100, 300)).toEqual({ up: true, maxHeight: 250 }));
  it("never returns a tiny height", () => expect(menuPlacement(10, 5, 300).maxHeight).toBe(120));
});
