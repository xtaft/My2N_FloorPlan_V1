/**
 * The grid's arithmetic: how big a cell is at a zoom, and where the
 * lines are put. The painting needs a browser; this does not.
 */
import { describe, expect, it } from "vitest";
import { gridCell, gridStyle } from "./planGrid";

describe("gridCell", () => {
  it("is 24 pixels at 100%", () => {
    expect(gridCell(1)).toBe(24);
  });

  it("grows and shrinks with the plan", () => {
    expect(gridCell(2)).toBe(48);
    expect(gridCell(0.75)).toBe(18);
  });

  it("stays a comfortable size at every zoom the canvas allows", () => {
    for (let scale = 0.3; scale <= 8; scale *= 1.07) {
      const cell = gridCell(scale);
      expect(cell).toBeGreaterThanOrEqual(12);
      expect(cell).toBeLessThan(60);
    }
  });

  it("re-divides by five, so the lines that stay are lines that were there", () => {
    // Zoomed in past the largest cell, each cell splits into five.
    expect(gridCell(4)).toBeCloseTo((24 * 4) / 5, 9);
    // Zoomed out past the smallest, five cells become one.
    expect(gridCell(0.4)).toBeCloseTo(24 * 0.4 * 5, 9);
  });

  it("does not hang or vanish on a scale that makes no sense", () => {
    expect(gridCell(0)).toBe(24);
    expect(gridCell(Number.NaN)).toBe(24);
    expect(gridCell(Number.POSITIVE_INFINITY)).toBe(24);
  });
});

describe("gridStyle", () => {
  it("draws every fifth line stronger", () => {
    const { backgroundSize } = gridStyle({ scale: 1, positionX: 0, positionY: 0 });
    expect(backgroundSize).toBe("120px 120px, 120px 120px, 24px 24px, 24px 24px");
  });

  it("moves with the plan when it is panned", () => {
    const { backgroundPosition } = gridStyle({ scale: 1, positionX: -37.5, positionY: 12 });
    expect(backgroundPosition.split(", ")).toEqual(Array(4).fill("-37.5px 12px"));
  });
});
