import { describe, expect, it } from "vitest";
import { categoryInk } from "./theme";

describe("categoryInk", () => {
  it("darkens a pastel so it can be drawn with, keeping its hue", () => {
    // Light yellow: red and green stay ahead of blue, all three lower.
    expect(categoryInk("#EEDD88")).toBe("#948954");
    expect(categoryInk("#DDDDDD")).toBe("#898989");
  });

  it("leaves anything that is not a six-digit hex alone", () => {
    expect(categoryInk("action.active")).toBe("action.active");
    expect(categoryInk("#abc")).toBe("#abc");
  });
});
