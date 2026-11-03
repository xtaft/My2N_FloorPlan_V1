/**
 * The pending floor list — the whole state of making a floor plan.
 */
import { describe, expect, it } from "vitest";
import {
  addBlankFloor,
  addFloors,
  fitToBuilding,
  BUILDING_FLOORS,
  allChecked,
  markChecked,
  moveFloor,
  nextUnchecked,
  removeFloor,
  reverseFloors,
  setGroundFloor,
  storeyLevels,
  storeyName,
  type FloorList,
} from "./index";

const pdfs = (...names: string[]) =>
  names.map((name) => ({ name, source: "pdf" as const }));

const three = (): FloorList => addFloors([], pdfs("a.pdf", "b.pdf", "c.pdf"));

describe("adding floors", () => {
  it("keeps the order they arrived in, highest first", () => {
    expect(three().map((f) => f.name)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
  });

  it("gives each one its own id", () => {
    const ids = three().map((f) => f.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("expects spaces from a PDF and not from anything else", () => {
    const mixed = addFloors([], [
      { name: "plan.pdf", source: "pdf" },
      { name: "scan.jpg", source: "image" },
    ]);
    expect(mixed.map((f) => f.segmented)).toEqual([true, false]);
  });

  it("adds a blank floor with nothing behind it", () => {
    const after = addBlankFloor(three());
    const blank = after[after.length - 1];
    expect(blank.source).toBeNull();
    expect(blank.segmented).toBe(false);
    expect(blank.name).toBe("Floor 4");
  });

  it("starts nothing as checked", () => {
    expect(three().some((f) => f.checked)).toBe(false);
  });
});

describe("the ground floor", () => {
  it("is the bottom one until somebody says otherwise", () => {
    const floors = three();
    expect(floors.filter((f) => f.ground).map((f) => f.name)).toEqual([
      "c.pdf",
    ]);
  });

  it("is exactly one, however the list changes", () => {
    const one = (floors: FloorList) => floors.filter((f) => f.ground).length;
    let floors = three();
    expect(one(floors)).toBe(1);

    floors = addFloors(floors, pdfs("d.pdf"));
    expect(one(floors)).toBe(1);

    floors = setGroundFloor(floors, floors[0].id);
    expect(one(floors)).toBe(1);

    // Removing the ground floor hands the job to another.
    floors = removeFloor(floors, floors[0].id);
    expect(one(floors)).toBe(1);
  });

  it("stays where it was put when an unrelated floor goes", () => {
    let floors = three();
    floors = setGroundFloor(floors, floors[1].id);
    floors = removeFloor(floors, floors[0].id);
    expect(floors.find((f) => f.ground)!.name).toBe("b.pdf");
  });

  it("is nobody when there are no floors", () => {
    expect(removeFloor(addFloors([], pdfs("a.pdf")), "pending:1")).toEqual([]);
  });

  it("refuses to be a floor that is not there", () => {
    const floors = three();
    expect(setGroundFloor(floors, "pending:99")).toBe(floors);
  });
});

describe("ordering floors", () => {
  it("moves one to where it was dropped", () => {
    const floors = three();
    const after = moveFloor(floors, floors[2].id, 0);
    expect(after.map((f) => f.name)).toEqual(["c.pdf", "a.pdf", "b.pdf"]);
  });

  it("does nothing when it lands where it started", () => {
    const floors = three();
    expect(moveFloor(floors, floors[1].id, 1)).toBe(floors);
  });

  it("clamps a drop past either end", () => {
    const floors = three();
    expect(moveFloor(floors, floors[0].id, 99).map((f) => f.name)).toEqual([
      "b.pdf",
      "c.pdf",
      "a.pdf",
    ]);
    expect(moveFloor(floors, floors[2].id, -5).map((f) => f.name)).toEqual([
      "c.pdf",
      "a.pdf",
      "b.pdf",
    ]);
  });

  it("turns the whole list over, for a folder scanned bottom-up", () => {
    expect(reverseFloors(three()).map((f) => f.name)).toEqual([
      "c.pdf",
      "b.pdf",
      "a.pdf",
    ]);
  });

  it("leaves the ground floor on the same page it was", () => {
    // Reversing says which end is up, not which floor is the ground one.
    const floors = three();
    const ground = floors.find((f) => f.ground)!.name;
    expect(reverseFloors(floors).find((f) => f.ground)!.name).toBe(ground);
  });
});

describe("storeys", () => {
  it("counts up from the ground floor", () => {
    const floors = three(); // c is ground
    const levels = storeyLevels(floors);
    expect(levels.get(floors[2].id)).toBe(0);
    expect(levels.get(floors[1].id)).toBe(1);
    expect(levels.get(floors[0].id)).toBe(2);
  });

  it("goes negative below ground", () => {
    let floors = three();
    floors = setGroundFloor(floors, floors[0].id);
    const levels = storeyLevels(floors);
    expect(levels.get(floors[1].id)).toBe(-1);
    expect(levels.get(floors[2].id)).toBe(-2);
  });

  it("names them the way the editor does", () => {
    expect(storeyName(0)).toBe("ground floor");
    expect(storeyName(3)).toBe("floor 3");
    expect(storeyName(-2)).toBe("basement 2");
  });
});

describe("checking floors", () => {
  it("is not done until every floor has been looked at", () => {
    let floors = three();
    expect(allChecked(floors)).toBe(false);
    for (const f of floors) floors = markChecked(floors, f.id);
    expect(allChecked(floors)).toBe(true);
  });

  it("is not done when there are no floors at all", () => {
    expect(allChecked([])).toBe(false);
  });

  it("offers the next one that has not been read", () => {
    let floors = three();
    expect(nextUnchecked(floors, null)!.name).toBe("a.pdf");

    floors = markChecked(floors, floors[0].id);
    expect(nextUnchecked(floors, floors[0].id)!.name).toBe("b.pdf");
  });

  it("comes back round for one skipped earlier", () => {
    let floors = three();
    floors = markChecked(floors, floors[1].id);
    floors = markChecked(floors, floors[2].id);
    // Standing on the last floor, the one still unread is the first.
    expect(nextUnchecked(floors, floors[2].id)!.name).toBe("a.pdf");
  });

  it("has nothing left to offer once they are all read", () => {
    let floors = three();
    for (const f of floors) floors = markChecked(floors, f.id);
    expect(nextUnchecked(floors, null)).toBeNull();
  });
});

describe("settling on the building's storeys", () => {
  it("pads a short list with floors of its own", () => {
    const after = fitToBuilding(addFloors([], pdfs("a.pdf", "b.pdf")));
    expect(after).toHaveLength(BUILDING_FLOORS);
    expect(after.map((f) => f.name)).toEqual([
      "a.pdf",
      "b.pdf",
      "Floor 3",
      "Floor 4",
      "Floor 5",
    ]);
  });

  it("keeps the pages that came first when there are too many", () => {
    const many = addFloors([], pdfs("1", "2", "3", "4", "5", "6", "7"));
    expect(fitToBuilding(many).map((f) => f.name)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("leaves a list that is already the right length alone", () => {
    const five = addFloors([], pdfs("1", "2", "3", "4", "5"));
    expect(fitToBuilding(five)).toBe(five);
  });

  it("pads with floors the check screen can check", () => {
    // A padded floor stands for a page, so it is read like a page rather
    // than turning up as one nothing could be detected on.
    for (const f of fitToBuilding(addFloors([], pdfs("a.pdf")))) {
      expect(f.segmented).toBe(true);
      expect(f.checked).toBe(false);
    }
  });

  it("still ends up with exactly one ground floor", () => {
    const one = (l: FloorList) => l.filter((f) => f.ground).length;
    expect(one(fitToBuilding(addFloors([], pdfs("a.pdf"))))).toBe(1);
    expect(one(fitToBuilding(addFloors([], pdfs("1", "2", "3", "4", "5", "6"))))).toBe(1);
    expect(fitToBuilding([])).toHaveLength(BUILDING_FLOORS);
  });

  it("makes every floor a storey with a name", () => {
    const floors = fitToBuilding(addFloors([], pdfs("a.pdf")));
    const levels = storeyLevels(floors);
    expect([...levels.values()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(storeyName(levels.get(floors[0].id)!)).toBe("floor 4");
    // The page that was uploaded keeps its place; the padding went under
    // it, so the bottom of the list is the ground floor.
    expect(floors[0].name).toBe("a.pdf");
    expect(floors.at(-1)!.ground).toBe(true);
  });
});
