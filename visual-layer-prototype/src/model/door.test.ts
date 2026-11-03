/**
 * Flipping and removing doors, and what a category does when it is emptied.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  accessType,
  deleteDoor,
  deleteSpaceType,
  doorGeometry,
  flipDoorHinge,
  flipDoorSwing,
  initEditState,
  reassignSpaceType,
  spacesInCategory,
  undo,
  type EditState,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/** A physical door with a reader on it: A1's entrance. */
const DOOR = "1:d11";

describe("flipping a door", () => {
  it("swaps which room the leaf opens into", () => {
    const before = state();
    const was = before.layer.doors.get(DOOR)!.swing;
    const after = flipDoorSwing(before, DOOR);
    expect(after.layer.doors.get(DOOR)!.swing).not.toBe(was);
    expect(flipDoorSwing(after, DOOR).layer.doors.get(DOOR)!.swing).toBe(was);
  });

  it("swaps which end the leaf is hinged on", () => {
    const before = state();
    const was = before.layer.doors.get(DOOR)!.hinge;
    const after = flipDoorHinge(before, DOOR);
    expect(after.layer.doors.get(DOOR)!.hinge).not.toBe(was);
    expect(flipDoorHinge(after, DOOR).layer.doors.get(DOOR)!.hinge).toBe(was);
  });

  it("leaves the opening exactly where it was", () => {
    // Only the arc moves. A flip that shifted the hole would be a different
    // door in a different place.
    const before = state();
    const was = doorGeometry(before.layer, before.layer.doors.get(DOOR)!)!;
    for (const flip of [flipDoorSwing, flipDoorHinge]) {
      const after = flip(before, DOOR);
      const now = doorGeometry(after.layer, after.layer.doors.get(DOOR)!)!;
      expect(now.p1).toEqual(was.p1);
      expect(now.p2).toEqual(was.p2);
    }
  });

  it("changes nothing else", () => {
    const before = state();
    const after = flipDoorSwing(before, DOOR);
    expect(after.file.walls).toEqual(before.file.walls);
    expect(after.file.rooms).toEqual(before.file.rooms);
    expect(after.file.devices).toEqual(before.file.devices);
    expect(after.file.doors.length).toBe(before.file.doors.length);
  });

  it("refuses a vertical link, which has no sides", () => {
    const before = state();
    const virtual = before.file.doors.find((d) => d.kind === "virtual")!;
    expect(() => flipDoorSwing(before, virtual.id)).toThrow(OperationRejected);
    expect(() => flipDoorHinge(before, virtual.id)).toThrow(/no sides to flip/);
  });

  it("is undone", () => {
    const before = state();
    expect(undo(flipDoorSwing(before, DOOR)).file).toEqual(before.file);
  });
});

describe("deleteDoor", () => {
  it("takes the door out and leaves the wall", () => {
    const before = state();
    const wallId = before.layer.doors.get(DOOR)!.wall_id!;
    const after = deleteDoor(before, DOOR);

    expect(after.layer.doors.has(DOOR)).toBe(false);
    expect(after.file.doors.length).toBe(before.file.doors.length - 1);
    expect(after.layer.walls.has(wallId)).toBe(true);
    expect(after.file.walls).toEqual(before.file.walls);
  });

  it("orphans the reader on it rather than destroying it", () => {
    const before = state();
    expect(before.layer.devicesOnDoor.get(DOOR)!.length).toBeGreaterThan(0);

    const after = deleteDoor(before, DOOR);
    const reader = after.file.devices.find((d) => d.id === "AC-1-d11")!;
    expect(reader).toBeDefined();
    expect(reader.host_id).toBeNull();
    expect(reader.guards).toEqual([]);
    expect(after.file.unplaced_devices).toContain("AC-1-d11");
    expect(after.file.devices.length).toBe(before.file.devices.length);
  });

  it("is undone, reader and all", () => {
    const before = state();
    expect(undo(deleteDoor(before, DOOR)).file).toEqual(before.file);
  });
});

describe("reassignSpaceType", () => {
  it("moves every space of one category into another", () => {
    const before = state();
    const was = spacesInCategory(before.layer, "locker_room");
    expect(was.rooms).toBeGreaterThan(0);

    const after = reassignSpaceType(before, "locker_room", "gym");
    expect(spacesInCategory(after.layer, "locker_room").rooms).toBe(0);
    expect(spacesInCategory(after.layer, "gym").rooms).toBe(
      spacesInCategory(before.layer, "gym").rooms + was.rooms,
    );
  });

  it("can move them out of every category", () => {
    const before = state();
    const after = reassignSpaceType(before, "locker_room", null);
    for (const room of after.file.rooms) {
      expect(room.space_type).not.toBe("locker_room");
    }
    // The category itself is still there, just empty.
    expect(after.layer.spaceTypes.has("locker_room")).toBe(true);
  });

  it("refuses a category that does not exist, either end", () => {
    expect(() => reassignSpaceType(state(), "spa", "gym")).toThrow(
      OperationRejected,
    );
    expect(() => reassignSpaceType(state(), "gym", "spa")).toThrow(
      OperationRejected,
    );
  });
});

describe("deleteSpaceType", () => {
  it("removes the category and lets its spaces fall back to inheriting", () => {
    const before = state();
    const locker = before.file.rooms.find((r) => r.space_type === "locker_room")!;

    const after = deleteSpaceType(before, "locker_room");

    expect(after.layer.spaceTypes.has("locker_room")).toBe(false);
    expect(after.layer.rooms.get(locker.id)!.space_type).toBeNull();
    // It sits in the gym, so that is what it reads as now.
    expect(accessType(after.layer, after.layer.rooms.get(locker.id)!)).toBe(
      "gym",
    );
  });

  it("leaves a space with nothing to inherit reading as Unknown", () => {
    const before = state();
    // Give a room its own category, with no envelope behind it.
    const loose = before.file.rooms.find((r) => r.group_id === null);
    if (!loose) {
      // Every room in the fixture is in an envelope; make one that is not.
      const seeded = initEditState({
        ...before.file,
        rooms: before.file.rooms.map((r) =>
          r.id === "1:B1" ? { ...r, group_id: null, space_type: "technical" } : r,
        ),
      });
      const after = deleteSpaceType(seeded, "technical");
      expect(accessType(after.layer, after.layer.rooms.get("1:B1")!)).toBeNull();
    }
  });

  it("refuses a category that does not exist", () => {
    expect(() => deleteSpaceType(state(), "spa")).toThrow();
  });

  it("is undone", () => {
    const before = state();
    expect(undo(deleteSpaceType(before, "locker_room")).file).toEqual(
      before.file,
    );
  });
});
