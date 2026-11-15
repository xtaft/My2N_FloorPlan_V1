/**
 * The wheel's arithmetic. The listener itself needs a browser; what it
 * multiplies by, and where that leaves the view, does not.
 */
import { describe, expect, it } from "vitest";
import { wheelFactor, zoomAbout } from "./wheelZoom";

const wheel = (deltaY: number, more: Partial<{ deltaMode: number; ctrlKey: boolean }> = {}) =>
  wheelFactor({ deltaY, deltaMode: 0, ctrlKey: false, ...more });

describe("wheelFactor", () => {
  it("makes one notch of a mouse wheel about a tenth", () => {
    expect(wheel(-100)).toBeCloseTo(1.105, 3);
    expect(wheel(100)).toBeCloseTo(0.905, 3);
  });

  it("undoes a notch in with a notch out", () => {
    expect(wheel(-100) * wheel(100)).toBeCloseTo(1, 12);
  });

  it("moves a touchpad's small deltas by small amounts", () => {
    expect(wheel(-4)).toBeCloseTo(1.004, 3);
    expect(wheel(-4)).toBeGreaterThan(1);
  });

  it("weights a pinch ten times a scroll", () => {
    expect(wheel(-3, { ctrlKey: true })).toBeCloseTo(Math.exp(0.03), 9);
  });

  it("never lets one event change the scale by more than a notch", () => {
    expect(wheel(-2400)).toBeCloseTo(wheel(-100), 12);
    expect(wheel(-100, { ctrlKey: true })).toBeCloseTo(wheel(-100), 12);
    expect(wheel(5000)).toBeCloseTo(wheel(100), 12);
  });

  it("reads lines as lines", () => {
    // Firefox: three lines a notch.
    expect(wheel(-3, { deltaMode: 1 })).toBeCloseTo(Math.exp(0.099), 9);
  });
});

describe("zoomAbout", () => {
  const view = { scale: 2, positionX: -100, positionY: 40 };
  const pointer = { x: 300, y: 200 };

  it("keeps the point under the pointer where it is", () => {
    const planX = (pointer.x - view.positionX) / view.scale;
    const planY = (pointer.y - view.positionY) / view.scale;
    const next = zoomAbout(view, pointer, 1.1, 0.4, 8);
    expect(next.scale).toBeCloseTo(2.2, 12);
    expect(planX * next.scale + next.positionX).toBeCloseTo(pointer.x, 9);
    expect(planY * next.scale + next.positionY).toBeCloseTo(pointer.y, 9);
  });

  it("stops at the limits without sliding the plan", () => {
    const atMax = zoomAbout({ ...view, scale: 8 }, pointer, 1.1, 0.4, 8);
    expect(atMax).toEqual({ ...view, scale: 8 });
    const atMin = zoomAbout({ ...view, scale: 0.4 }, pointer, 0.9, 0.4, 8);
    expect(atMin).toEqual({ ...view, scale: 0.4 });
  });

  it("takes many notches to cross the range, not one", () => {
    let v = { scale: 1, positionX: 0, positionY: 0 };
    let notches = 0;
    while (v.scale < 8) {
      v = zoomAbout(v, pointer, wheelFactor({ deltaY: -100, deltaMode: 0, ctrlKey: false }), 0.4, 8);
      notches += 1;
    }
    expect(notches).toBeGreaterThan(15);
  });
});
