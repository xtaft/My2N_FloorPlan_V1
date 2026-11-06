/**
 * Shafts, and what a category change does to them.
 *
 * The fixture has two: shaft_stairs and shaft_lift, each one envelope per
 * storey across five floors, linked by four virtual doors apiece.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  initEditState,
  isShaftType,
  reachable,
  setRoomSpaceType,
  shaftImpact,
  shaftRuns,
  shaftStoreys,
  undo,
  type EditState,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/** The virtual doors linking a shaft's rooms. */
function links(s: EditState, shaftId: string): string[] {
  const rooms = new Set(
    shaftStoreys(s.layer, shaftId).flatMap((g) =>
      s.file.rooms.filter((r) => r.group_id === g.id).map((r) => r.id),
    ),
  );
  return s.file.doors
    .filter(
      (d) =>
        d.kind === "virtual" &&
        d.rooms &&
        rooms.has(d.rooms[0]) &&
        rooms.has(d.rooms[1]),
    )
    .map((d) => d.id);
}

describe("shaft basics", () => {
  it("knows which categories make a shaft", () => {
    expect(isShaftType("stairs")).toBe(true);
    expect(isShaftType("elevator")).toBe(true);
    expect(isShaftType("apartment")).toBe(false);
    expect(isShaftType(null)).toBe(false);
  });

  it("reads a shaft as one unbroken run of storeys", () => {
    const { layer } = state();
    expect(shaftStoreys(layer, "shaft_stairs").length).toBe(5);
    expect(shaftRuns(layer, "shaft_stairs")).toEqual([[0, 1, 2, 3, 4]]);
    expect(shaftRuns(layer, "shaft_lift")).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("has a link for each pair of adjacent storeys", () => {
    const s = state();
    expect(links(s, "shaft_stairs").length).toBe(4);
    expect(links(s, "shaft_lift").length).toBe(4);
  });
});

describe("shaftImpact", () => {
  it("is nothing for a room that is not in a shaft", () => {
    const { layer } = state();
    expect(shaftImpact(layer, "1:L1", "gym")).toBeNull();
  });

  it("is nothing when a shaft room stays a shaft", () => {
    const { layer } = state();
    expect(shaftImpact(layer, "2:S", "elevator")).toBeNull();
  });

  it("breaks the run in two when a middle storey leaves", () => {
    const { layer } = state();
    const impact = shaftImpact(layer, "2:S", "technical")!;
    expect(impact.shaftId).toBe("shaft_stairs");
    expect(impact.before).toEqual([[0, 1, 2, 3, 4]]);
    // Not one run with a long step: a door from 1 to 3 would walk past a
    // floor that is no longer in the shaft at all.
    expect(impact.after).toEqual([
      [0, 1],
      [3, 4],
    ]);
    expect(impact.lostLinks).toBe(2);
  });

  it("only shortens the run when an end storey leaves", () => {
    const { layer } = state();
    const impact = shaftImpact(layer, "4:S", "technical")!;
    expect(impact.after).toEqual([[0, 1, 2, 3]]);
    expect(impact.lostLinks).toBe(1);
  });
});

describe("setRoomSpaceType", () => {
  it("assigns a category to a room that is in no shaft", () => {
    const before = state();
    const after = setRoomSpaceType(before, "1:L1", "gym");
    expect(after.layer.rooms.get("1:L1")!.space_type).toBe("gym");
    expect(after.file.doors.length).toBe(before.file.doors.length);
  });

  it("takes a room out of its shaft and rebuilds the links", () => {
    const before = state();
    expect(links(before, "shaft_stairs").length).toBe(4);

    const after = setRoomSpaceType(before, "2:S", "technical");

    expect(after.layer.rooms.get("2:S")!.space_type).toBe("technical");
    // Technical is not what the Stairs envelope is, so the room leaves it —
    // and that envelope held nothing else, so it goes too, shaft id and all.
    expect(after.layer.rooms.get("2:S")!.group_id).toBeNull();
    expect(after.layer.groups.has("2:gS")).toBe(false);
    expect(shaftStoreys(after.layer, "shaft_stairs").length).toBe(4);
    // 0-1 and 3-4 survive; 1-2 and 2-3 are gone and nothing spans the gap.
    expect(links(after, "shaft_stairs").length).toBe(2);
    expect(shaftRuns(after.layer, "shaft_stairs")).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it("leaves the other shaft alone", () => {
    const before = state();
    const after = setRoomSpaceType(before, "2:S", "technical");
    expect(links(after, "shaft_lift").length).toBe(4);
    expect(after.layer.groups.get("2:gE")!.shaft_id).toBe("shaft_lift");
  });

  it("never links across the storey that left", () => {
    // The trap: pairing adjacent entries in the member list rather than
    // adjacent levels would fabricate a staircase from floor 1 to floor 3.
    const after = setRoomSpaceType(state(), "2:S", "technical");
    for (const d of after.file.doors) {
      if (d.kind !== "virtual" || !d.rooms) continue;
      const levels = d.rooms.map((id) => {
        const room = after.layer.rooms.get(id)!;
        return after.layer.floors.find((f) => f.id === room.floor_id)!.level;
      });
      expect(Math.abs(levels[0] - levels[1])).toBe(1);
    }
  });

  it("cuts what the access search can reach", () => {
    // The point of the warning. With the stairs broken at floor 2 and the
    // lift gone too, nothing above floor 2 is reachable from the ground.
    const before = setRoomSpaceType(state(), "2:E", "technical");
    const after = setRoomSpaceType(before, "2:S", "technical");

    const reach = (s: EditState) =>
      reachable(s.layer, "0:L", {
        allowedDevices: new Set(s.file.devices.map((d) => d.id)),
      }).seen;

    const was = reach(state());
    const now = reach(after);
    expect(was.has("4:S")).toBe(true);
    expect(now.has("4:S")).toBe(false);
    expect(now.has("1:S")).toBe(true);
  });

  it("is undone completely", () => {
    const before = state();
    const after = setRoomSpaceType(before, "2:S", "technical");
    expect(after.file).not.toEqual(before.file);
    expect(undo(after).file).toEqual(before.file);
    expect(after.undo.at(-1)!.kind).toBe("set_space_type");
    expect(after.undo.at(-1)!.label).toBe("Change category");
  });

  it("does nothing when the category is already that", () => {
    const before = state();
    const after = setRoomSpaceType(before, "2:S", "stairs");
    expect(after).toBe(before);
    expect(after.undo.length).toBe(0);
  });

  it("refuses a category that does not exist", () => {
    expect(() => setRoomSpaceType(state(), "1:L1", "penthouse")).toThrow(
      OperationRejected,
    );
  });

  it("takes a stairwell out of the stairs when it is called a lift", () => {
    // Still vertical circulation, so nothing about shafts objects — but it
    // is no longer what the Stairs envelope says its spaces are, so it
    // leaves, and leaving the envelope is leaving the shaft.
    const before = state();
    const after = setRoomSpaceType(before, "2:S", "elevator");

    expect(after.layer.rooms.get("2:S")!.group_id).toBeNull();
    expect(after.layer.groups.has("2:gS")).toBe(false);
    expect(shaftStoreys(after.layer, "shaft_stairs").length).toBe(4);
    expect(shaftRuns(after.layer, "shaft_stairs")).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });
});
