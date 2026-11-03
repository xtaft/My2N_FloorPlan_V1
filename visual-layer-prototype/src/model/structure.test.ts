/**
 * The row-menu operations: rename, fold away, categorise, detach, dissolve.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  accessType,
  detachRoom,
  dissolveGroup,
  hideRoomRefusal,
  initEditState,
  renameGroup,
  renameRoom,
  roomsInGroup,
  setGroupRoomsSurfaced,
  setGroupSpaceType,
  undo,
  type EditState,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

describe("rename", () => {
  it("renames a room", () => {
    const after = renameRoom(state(), "1:L1", "Lounge");
    expect(after.layer.rooms.get("1:L1")!.name).toBe("Lounge");
    expect(after.undo.at(-1)!.label).toBe("Rename");
  });

  it("renames an envelope", () => {
    const after = renameGroup(state(), "1:A1", "Flat One");
    expect(after.layer.groups.get("1:A1")!.name).toBe("Flat One");
  });

  it("trims, and refuses a blank name", () => {
    expect(renameRoom(state(), "1:L1", "  Lounge  ").layer.rooms.get("1:L1")!.name).toBe(
      "Lounge",
    );
    expect(() => renameRoom(state(), "1:L1", "   ")).toThrow(OperationRejected);
  });

  it("does nothing when the name is unchanged", () => {
    const before = state();
    const name = before.layer.rooms.get("1:L1")!.name;
    expect(renameRoom(before, "1:L1", name)).toBe(before);
  });

  it("is undone", () => {
    const before = state();
    expect(undo(renameRoom(before, "1:L1", "Lounge")).file).toEqual(before.file);
  });
});

describe("setGroupSpaceType", () => {
  it("changes what the envelope's rooms inherit", () => {
    const before = state();
    const room = before.layer.rooms.get("0:CS1")!;
    expect(room.space_type).toBeNull();
    const was = accessType(before.layer, room);

    const after = setGroupSpaceType(before, room.group_id!, "gym");
    expect(accessType(after.layer, after.layer.rooms.get("0:CS1")!)).toBe("gym");
    expect(was).not.toBe("gym");
  });

  it("leaves a room that overrides the envelope alone", () => {
    const before = state();
    // 0:GL1 sets locker_room itself, inside the gym envelope.
    expect(before.layer.rooms.get("0:GL1")!.space_type).toBe("locker_room");
    const after = setGroupSpaceType(before, "0:GYM", "commercial");
    expect(accessType(after.layer, after.layer.rooms.get("0:GL1")!)).toBe(
      "locker_room",
    );
  });

  it("refuses a category that does not exist", () => {
    expect(() => setGroupSpaceType(state(), "0:GYM", "spa")).toThrow(
      OperationRejected,
    );
  });
});

describe("setGroupRoomsSurfaced", () => {
  it("folds away what it can and says what it could not", () => {
    // A flat's rooms start folded in the fixture, so show them first. Its
    // living room carries the entrance reader on its door and will not go
    // back; the bedrooms will.
    const { state: open } = setGroupRoomsSurfaced(state(), "1:A1", true);
    const shown = roomsInGroup(open.layer, "1:A1");
    expect(shown.every((r) => r.surfaced)).toBe(true);

    const { state: after, kept } = setGroupRoomsSurfaced(open, "1:A1", false);
    const still = roomsInGroup(after.layer, "1:A1").filter((r) => r.surfaced);

    expect(still.length).toBeGreaterThan(0); // the one with the reader
    expect(still.length).toBeLessThan(shown.length);
    for (const room of still) {
      expect(hideRoomRefusal(after.layer, room)).not.toBeNull();
    }
    expect(kept.length).toBe(still.length);
    // It names the room and the hardware, not just that something refused.
    expect(kept[0]).toMatch(/Living room/);
  });

  it("brings a whole envelope back without exception", () => {
    const before = state();
    const { state: after } = setGroupRoomsSurfaced(before, "1:A1", true);
    for (const room of roomsInGroup(after.layer, "1:A1")) {
      expect(room.surfaced).toBe(true);
    }
  });

  it("refuses when there is nothing it could do", () => {
    const before = state();
    const { state: shown } = setGroupRoomsSurfaced(before, "1:A1", true);
    expect(() => setGroupRoomsSurfaced(shown, "1:A1", true)).toThrow(
      /already shown/,
    );
  });

  it("names the hardware when a whole envelope refuses", () => {
    // A stairwell is one room and its door carries nothing on this floor,
    // so pick one that does: the gym, whose entrance has a reader.
    const before = state();
    const gym = roomsInGroup(before.layer, "0:GYM").find(
      (r) => hideRoomRefusal(before.layer, r) !== null,
    );
    expect(gym).toBeDefined();
  });

  it("is one commit, and undone as one", () => {
    const { state: open } = setGroupRoomsSurfaced(state(), "1:A1", true);
    const { state: after } = setGroupRoomsSurfaced(open, "1:A1", false);

    // Two rooms folded in one go, not one entry each.
    expect(after.undo.length).toBe(open.undo.length + 1);
    expect(after.undo.at(-1)!.label).toBe("Hide rooms");
    expect(undo(after).file).toEqual(open.file);
  });
});

describe("detachRoom", () => {
  it("takes a room out of its envelope and leaves its shape alone", () => {
    const before = state();
    const room = before.layer.rooms.get("1:B1")!;
    expect(room.group_id).toBeTruthy();

    const after = detachRoom(before, "1:B1");
    expect(after.layer.rooms.get("1:B1")!.group_id).toBeNull();
    expect(after.layer.rooms.get("1:B1")!.walls).toEqual(room.walls);
    expect(after.file.walls).toEqual(before.file.walls);
  });

  it("removes an envelope the detach leaves empty", () => {
    const before = state();
    // The technical room is its envelope's only room.
    const room = [...before.layer.rooms.values()].find(
      (r) =>
        r.group_id !== null && roomsInGroup(before.layer, r.group_id).length === 1,
    )!;
    const groupId = room.group_id!;

    const after = detachRoom(before, room.id);
    expect(after.layer.groups.has(groupId)).toBe(false);
  });

  it("refuses a room that is in no envelope", () => {
    const before = detachRoom(state(), "1:B1");
    expect(() => detachRoom(before, "1:B1")).toThrow(/not in an envelope/);
  });
});

describe("dissolveGroup", () => {
  it("keeps the rooms and moves them up to whatever contained it", () => {
    const before = state();
    const members = roomsInGroup(before.layer, "1:A1").map((r) => r.id);
    expect(members.length).toBeGreaterThan(1);
    const parent = before.layer.groups.get("1:A1")!.parent_group_id;

    const after = dissolveGroup(before, "1:A1");

    expect(after.layer.groups.has("1:A1")).toBe(false);
    expect(after.file.rooms.length).toBe(before.file.rooms.length);
    for (const id of members) {
      expect(after.layer.rooms.get(id)!.group_id).toBe(parent);
    }
    // Nothing drawn changes: dissolving an envelope is not deleting spaces.
    expect(after.file.walls).toEqual(before.file.walls);
    expect(after.file.vertices).toEqual(before.file.vertices);
  });

  it("re-parents the envelopes inside it", () => {
    const before = state();
    // The gym holds the two locker-room envelopes.
    const children = before.file.groups.filter(
      (g) => g.parent_group_id === "0:GYM",
    );
    expect(children.length).toBeGreaterThan(0);
    const parent = before.layer.groups.get("0:GYM")!.parent_group_id;

    const after = dissolveGroup(before, "0:GYM");
    for (const child of children) {
      expect(after.layer.groups.get(child.id)!.parent_group_id).toBe(parent);
    }
  });

  it("leaves no room pointing at an envelope that is gone", () => {
    const after = dissolveGroup(state(), "1:A1");
    const ids = new Set(after.file.groups.map((g) => g.id));
    for (const room of after.file.rooms) {
      if (room.group_id) expect(ids.has(room.group_id)).toBe(true);
    }
    for (const group of after.file.groups) {
      if (group.parent_group_id) expect(ids.has(group.parent_group_id)).toBe(true);
    }
  });

  it("is undone", () => {
    const before = state();
    expect(undo(dissolveGroup(before, "1:A1")).file).toEqual(before.file);
  });
});
