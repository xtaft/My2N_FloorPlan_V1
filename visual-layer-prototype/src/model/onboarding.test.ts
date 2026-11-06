/**
 * The pending floor list — the whole state of making a floor plan.
 */
import { describe, expect, it } from "vitest";
import {
  addBlankFloor,
  addFloors,
  fitToBuilding,
  storeyFromName,
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

describe("matching pages to the building's storeys", () => {
  const names = (l: FloorList) => l.map((f) => f.name);
  const levelOf = (l: FloorList, name: string) =>
    storeyLevels(l).get(l.find((f) => f.name === name)!.id);

  it("reads the storey off a page's name", () => {
    expect(storeyFromName("ground.pdf")).toBe(0);
    expect(storeyFromName("Ground Floor.pdf")).toBe(0);
    expect(storeyFromName("first.pdf")).toBe(1);
    expect(storeyFromName("2nd floor.pdf")).toBe(2);
    expect(storeyFromName("floor 3.pdf")).toBe(3);
    expect(storeyFromName("Level-4.PDF")).toBe(4);
    expect(storeyFromName("L2.pdf")).toBe(2);
    expect(storeyFromName("3.pdf")).toBe(3);
    expect(storeyFromName("basement.pdf")).toBe(-1);
    expect(storeyFromName("a.pdf")).toBeNull();
    expect(storeyFromName("scan 2024.pdf")).toBeNull();
  });

  it("puts named pages on their storeys whatever the marker said", () => {
    // Dropped ground first, so it sits on top of the list, and the
    // marker left on the bottom page — the wrong one. The names win.
    const after = fitToBuilding(addFloors([], pdfs("ground.pdf", "first.pdf")));
    expect(after).toHaveLength(BUILDING_FLOORS);
    expect(levelOf(after, "ground.pdf")).toBe(0);
    expect(levelOf(after, "first.pdf")).toBe(1);
    expect(after.find((f) => f.ground)!.name).toBe("ground.pdf");
    expect(after.find((f) => f.name === "ground.pdf")!.floor_id).toBe("0:floor");
    expect(after.find((f) => f.name === "first.pdf")!.floor_id).toBe("1:floor");
  });

  it("fills the rest from the ground up, reading the list from the bottom", () => {
    // No names to go on: the bottom page is the ground floor, the one
    // above it floor 1, and the storeys left over get pages of their own.
    const after = fitToBuilding(addFloors([], pdfs("a.pdf", "b.pdf")));
    expect(names(after)).toEqual(["floor 4", "floor 3", "floor 2", "a.pdf", "b.pdf"]);
    expect(levelOf(after, "b.pdf")).toBe(0);
    expect(levelOf(after, "a.pdf")).toBe(1);
  });

  it("mixes the two: named pages pinned, the rest around them", () => {
    const after = fitToBuilding(addFloors([], pdfs("a.pdf", "floor 2.pdf", "b.pdf")));
    expect(levelOf(after, "floor 2.pdf")).toBe(2);
    expect(levelOf(after, "b.pdf")).toBe(0);
    expect(levelOf(after, "a.pdf")).toBe(1);
    expect(names(after)).toEqual(["floor 4", "floor 3", "floor 2.pdf", "a.pdf", "b.pdf"]);
  });

  it("leaves out the pages that would be above the roof", () => {
    const many = addFloors([], pdfs("1", "2", "3", "4", "5", "6", "7"));
    // Bare numbers name storeys; 5, 6 and 7 have no floor to stand for.
    expect(names(fitToBuilding(many))).toEqual(["4", "3", "2", "1", "ground floor"]);
  });

  it("is a storey for every drawn floor, each knowing which", () => {
    const after = fitToBuilding(addFloors([], pdfs("a.pdf")));
    expect([...storeyLevels(after).values()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(after.map((f) => f.floor_id)).toEqual(["4:floor", "3:floor", "2:floor", "1:floor", "0:floor"]);
    expect(after.filter((f) => f.ground)).toHaveLength(1);
    for (const f of after) {
      expect(f.segmented).toBe(true);
      expect(f.checked).toBe(false);
    }
    expect(fitToBuilding([])).toHaveLength(BUILDING_FLOORS);
  });
});
