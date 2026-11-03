/**
 * Importing a space list — the contract the template states.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  applySpaceList,
  initEditState,
  matchSpaceList,
  normalise,
  parseSpaceList,
  summarise,
  undo,
  type EditState,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/** The template's own shape: a title, an instruction, then the header. */
const header = [
  ["Space list for import into My2N"],
  ["Fill in one row per space..."],
  [],
  ["Name", "Floor", "Type", "Note"],
];

const sheet = (...rows: string[][]) => [...header, ...rows];

describe("normalise", () => {
  it("ignores case, surrounding space and diacritics", () => {
    expect(normalise("  Kuchyně  ")).toBe("kuchyne");
    expect(normalise("LIVING  ROOM")).toBe("living room");
    expect(normalise("Lobby")).toBe(normalise(" lobby "));
  });
});

describe("parseSpaceList", () => {
  it("finds the header below the title rows", () => {
    const rows = parseSpaceList(sheet(["5.01", "5NP", "Apartment", "note"]));
    expect(rows).toEqual([
      { name: "5.01", floor: "5NP", type: "Apartment", note: "note", line: 5 },
    ]);
  });

  it("skips the blank rows a template is padded with", () => {
    const rows = parseSpaceList(
      sheet(["Lobby", "", "", ""], ["", "", "", ""], ["Storage", "", "", ""]),
    );
    expect(rows.map((r) => r.name)).toEqual(["Lobby", "Storage"]);
  });

  it("takes the columns in whatever order they are in", () => {
    const rows = parseSpaceList([
      ["Type", "Name"],
      ["Apartment", "5.01"],
    ]);
    expect(rows[0]).toMatchObject({ name: "5.01", type: "Apartment" });
  });

  it("works with Name alone", () => {
    const rows = parseSpaceList([["Name"], ["Lobby"]]);
    expect(rows[0]).toMatchObject({ name: "Lobby", floor: "", type: "" });
  });

  it("refuses a sheet with no Name column", () => {
    expect(() => parseSpaceList([["Room", "Level"], ["a", "b"]])).toThrow(
      OperationRejected,
    );
  });
});

describe("matchSpaceList", () => {
  it("matches a space drawn on the plan, within its floor", () => {
    const { layer } = state();
    const [m] = matchSpaceList(
      layer,
      parseSpaceList(sheet(["Living room", "floor 1", "Apartment", ""])),
    );
    expect(m.kind).toBe("plan");
    expect(layer.rooms.get(m.roomId!)!.floor_id).toBe("1:floor");
  });

  it("matches through case and accents", () => {
    const { layer } = state();
    const [m] = matchSpaceList(
      layer,
      parseSpaceList(sheet(["  lIVING room ", "floor 1", "", ""])),
    );
    expect(m.kind).toBe("plan");
  });

  it("needs the floor to tell two rooms of the same name apart", () => {
    // Every storey has a Living room, so a row without a floor takes the
    // first and a row with one takes that storey's.
    const { layer } = state();
    const [withFloor] = matchSpaceList(
      layer,
      parseSpaceList(sheet(["Living room", "floor 3", "", ""])),
    );
    expect(layer.rooms.get(withFloor.roomId!)!.floor_id).toBe("3:floor");
  });

  it("gives two rows of one name two rooms, where there are two", () => {
    // Floor 1 has seven living rooms, one per flat, so a second row naming
    // one is not a duplicate — it is the next flat's.
    const { layer } = state();
    const matches = matchSpaceList(
      layer,
      parseSpaceList(
        sheet(["Living room", "floor 1", "", ""], ["Living room", "floor 1", "", ""]),
      ),
    );
    expect(matches.map((m) => m.kind)).toEqual(["plan", "plan"]);
    expect(matches[0].roomId).not.toBe(matches[1].roomId);
  });

  it("claims a space once, so a second row falls through", () => {
    // One hallway per storey, so the second row has nothing left to take.
    const { layer } = state();
    const matches = matchSpaceList(
      layer,
      parseSpaceList(
        sheet(["Hallway", "floor 1", "", ""], ["Hallway", "floor 1", "", ""]),
      ),
    );
    expect(matches.map((m) => m.kind)).toEqual(["plan", "new"]);
  });

  it("adds a row that names nothing here", () => {
    const { layer } = state();
    const [m] = matchSpaceList(
      layer,
      parseSpaceList(sheet(["Penthouse", "floor 4", "Apartment", ""])),
    );
    expect(m.kind).toBe("new");
    expect(m.floorId).toBe("4:floor");
  });

  it("flags a floor and a category this building does not have", () => {
    const { layer } = state();
    const [m] = matchSpaceList(
      layer,
      parseSpaceList(sheet(["Penthouse", "5NP", "Retail unit", ""])),
    );
    expect(m.unknownFloor).toBe(true);
    expect(m.floorId).toBeNull();
    expect(m.unknownType).toBe(true);
    expect(m.typeId).toBeNull();
  });

  it("counts what an import would do before it does it", () => {
    const { layer } = state();
    const matches = matchSpaceList(
      layer,
      parseSpaceList(
        sheet(
          ["Living room", "floor 1", "Apartment", ""],
          ["Penthouse", "5NP", "", ""],
        ),
      ),
    );
    expect(summarise(matches)).toMatchObject({
      matchedOnPlan: 1,
      added: 1,
      unknownFloors: 1,
    });
  });
});

describe("applySpaceList", () => {
  const run = (s: EditState, grid: string[][]) =>
    applySpaceList(s, matchSpaceList(s.layer, parseSpaceList(grid)));

  it("renames and re-types what it matched on the plan", () => {
    const before = state();
    const after = run(
      before,
      sheet(["living ROOM", "floor 1", "Commercial unit", "south facing"]),
    );
    const room = after.layer.rooms.get("1:L1")!;
    expect(room.name).toBe("living ROOM"); // the list is the newer spelling
    expect(room.space_type).toBe("commercial");
    expect(room.note).toBe("south facing");
  });

  it("leaves the category alone when the row names none", () => {
    // A blank Type says nothing, which is not the same as saying unknown.
    const before = state();
    const was = before.layer.rooms.get("1:L1")!.space_type;
    const after = run(before, sheet(["Living room", "floor 1", "", ""]));
    expect(after.layer.rooms.get("1:L1")!.space_type).toBe(was);
  });

  it("sets unknown when the row names a category this building lacks", () => {
    const before = state();
    const after = run(before, sheet(["Living room", "floor 1", "Retail unit", ""]));
    expect(after.layer.rooms.get("1:L1")!.space_type).toBeNull();
  });

  it("adds what it could not match to the list of spaces to place", () => {
    const before = state();
    const after = run(before, sheet(["Penthouse", "floor 4", "Apartment", "top"]));
    const added = after.file.unplaced_spaces!;
    expect(added.length).toBe(1);
    expect(added[0]).toMatchObject({
      name: "Penthouse",
      floor_id: "4:floor",
      space_type: "apartment",
      note: "top",
    });
    // Nothing was drawn for it: the plan is untouched.
    expect(after.file.rooms.length).toBe(before.file.rooms.length);
    expect(after.file.walls).toEqual(before.file.walls);
  });

  it("deletes nothing", () => {
    const before = state();
    const after = run(before, sheet(["Living room", "floor 1", "Gym", ""]));
    expect(after.file.rooms.length).toBe(before.file.rooms.length);
    expect(after.file.walls.length).toBe(before.file.walls.length);
    expect(after.file.doors.length).toBe(before.file.doors.length);
    expect(after.file.devices.length).toBe(before.file.devices.length);
    expect(after.file.groups.length).toBe(before.file.groups.length);
  });

  it("updates rather than duplicates when the same list is imported twice", () => {
    const before = state();
    const grid = sheet(
      ["Living room", "floor 1", "Gym", ""],
      ["Penthouse", "floor 4", "Apartment", ""],
    );
    const once = run(before, grid);
    const twice = run(once, grid);

    expect(twice.file.unplaced_spaces!.length).toBe(1);
    expect(twice.file.rooms.length).toBe(before.file.rooms.length);
    expect(twice.layer.rooms.get("1:L1")!.space_type).toBe("gym");
  });

  it("matches an unplaced space on the second run instead of adding another", () => {
    const before = state();
    const once = run(before, sheet(["Penthouse", "floor 4", "", ""]));
    const twice = run(once, sheet(["Penthouse", "floor 4", "Apartment", "now typed"]));

    expect(twice.file.unplaced_spaces!.length).toBe(1);
    expect(twice.file.unplaced_spaces![0]).toMatchObject({
      space_type: "apartment",
      note: "now typed",
    });
  });

  it("keeps the devices in a room it renamed", () => {
    const before = state();
    const after = run(before, sheet(["Living room", "floor 1", "", ""]));
    expect(after.file.devices.find((d) => d.id === "AN-A1")!.host_id).toBe(
      "1:L1",
    );
  });

  it("is undone", () => {
    const before = state();
    const after = run(before, sheet(["Living room", "floor 1", "Gym", ""]));
    expect(after.file).not.toEqual(before.file);
    expect(undo(after).file).toEqual(before.file);
    expect(after.undo.at(-1)!.kind).toBe("import_spaces");
  });

  it("refuses an empty list", () => {
    expect(() => applySpaceList(state(), [])).toThrow(OperationRejected);
  });
});
