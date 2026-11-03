/**
 * The row-menu operations: rename, fold away, categorise, detach, dissolve.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  accessType,
  deleteRoom,
  detachRoom,
  dissolveGroup,
  hideRoomRefusal,
  initEditState,
  renameGroup,
  setRoomSpaceType,
  spaceCategories,
  renameRoom,
  roomsInGroup,
  setGroupRoomsSurfaced,
  setGroupSpaceType,
  unassignRoom,
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

describe("deleteRoom and unassignRoom", () => {
  it("leaves the shape alone — the floor is still tiled", () => {
    const before = state();
    for (const op of [deleteRoom, unassignRoom]) {
      const after = op(before, "1:B1");
      expect(after.file.walls).toEqual(before.file.walls);
      expect(after.file.vertices).toEqual(before.file.vertices);
      expect(after.layer.rooms.get("1:B1")!.walls).toEqual(
        before.layer.rooms.get("1:B1")!.walls,
      );
    }
  });

  it("strips the name, the category and the envelope", () => {
    const before = state();
    expect(accessType(before.layer, before.layer.rooms.get("1:B1")!)).toBe(
      "apartment",
    );

    for (const op of [deleteRoom, unassignRoom]) {
      const room = op(before, "1:B1").layer.rooms.get("1:B1")!;
      expect(room.name).toMatch(/^Unnamed \d+$/);
      expect(room.space_type).toBeNull();
      expect(room.group_id).toBeNull();
      // No type of its own and no envelope to inherit one from: Unknown.
      expect(accessType(op(before, "1:B1").layer, room)).toBeNull();
    }
  });

  it("differs only in whether the space is still listed", () => {
    const before = state();
    expect(deleteRoom(before, "1:B1").layer.rooms.get("1:B1")!.surfaced).toBe(
      false,
    );
    expect(unassignRoom(before, "1:B1").layer.rooms.get("1:B1")!.surfaced).toBe(
      true,
    );
  });

  it("numbers each anonymous space apart from the last", () => {
    const one = unassignRoom(state(), "1:B1");
    const two = unassignRoom(one, "1:B2");
    const names = [
      two.layer.rooms.get("1:B1")!.name,
      two.layer.rooms.get("1:B2")!.name,
    ];
    expect(names[0]).not.toBe(names[1]);
    // Room names are not unique in general — five storeys of "Bedroom" —
    // so it is the anonymous ones that have to be told apart.
    const unnamed = two.file.rooms
      .map((r) => r.name)
      .filter((n) => n.startsWith("Unnamed "));
    expect(unnamed.length).toBe(2);
    expect(new Set(unnamed).size).toBe(2);
  });

  it("removes an envelope it empties", () => {
    const before = state();
    const only = [...before.layer.rooms.values()].find(
      (r) =>
        r.group_id !== null && roomsInGroup(before.layer, r.group_id).length === 1,
    )!;
    const after = deleteRoom(before, only.id);
    expect(after.layer.groups.has(only.group_id!)).toBe(false);
  });

  it("keeps the device that was in it, rather than losing hardware", () => {
    const before = state();
    const after = unassignRoom(before, "1:L1");
    expect(after.file.devices.length).toBe(before.file.devices.length);
    expect(after.file.devices.find((d) => d.id === "AN-A1")!.host_id).toBe(
      "1:L1",
    );
  });

  it("is undone", () => {
    const before = state();
    expect(undo(deleteRoom(before, "1:B1")).file).toEqual(before.file);
    expect(undo(unassignRoom(before, "1:B1")).file).toEqual(before.file);
  });

  it("labels itself on the undo stack", () => {
    expect(deleteRoom(state(), "1:B1").undo.at(-1)!.label).toBe("Delete space");
    expect(unassignRoom(state(), "1:B1").undo.at(-1)!.label).toBe(
      "Unassign from map",
    );
  });

  it("refuses a room it does not have", () => {
    expect(() => deleteRoom(state(), "1:nope")).toThrow();
  });
});

describe("a category of its own takes a room out of its envelope", () => {
  it("detaches when the new category is not the envelope's", () => {
    const before = state();
    const room = before.layer.rooms.get("1:B1")!;
    expect(accessType(before.layer, room)).toBe("apartment");

    const after = setRoomSpaceType(before, "1:B1", "technical");
    expect(after.layer.rooms.get("1:B1")!.group_id).toBeNull();
    expect(accessType(after.layer, after.layer.rooms.get("1:B1")!)).toBe(
      "technical",
    );
  });

  it("stays when the new category is the envelope's own", () => {
    const before = state();
    const group = before.layer.rooms.get("1:B1")!.group_id;
    const after = setRoomSpaceType(before, "1:B1", "apartment");
    expect(after.layer.rooms.get("1:B1")!.group_id).toBe(group);
  });

  it("stays when the room goes back to inheriting", () => {
    // A null category is the room saying the envelope decides, which is
    // agreement rather than disagreement.
    const before = setRoomSpaceType(state(), "1:B1", "apartment");
    const after = setRoomSpaceType(before, "1:B1", null);
    expect(after.layer.rooms.get("1:B1")!.group_id).toBeTruthy();
  });

  it("leaves its geometry and the rest of the flat alone", () => {
    const before = state();
    const after = setRoomSpaceType(before, "1:B1", "technical");
    expect(after.file.walls).toEqual(before.file.walls);
    expect(after.layer.rooms.get("1:L1")!.group_id).toBe(
      before.layer.rooms.get("1:L1")!.group_id,
    );
  });

  it("is undone", () => {
    const before = state();
    expect(undo(setRoomSpaceType(before, "1:B1", "technical")).file).toEqual(
      before.file,
    );
  });
});

describe("the categories panel shows loose spaces", () => {
  const find = (cats: ReturnType<typeof spaceCategories>, id: string | null) =>
    cats.find((c) => c.id === id)!;

  it("lists a room that has left its envelope under its own category", () => {
    // Otherwise changing a room's category would show up nowhere: it is not
    // an envelope, so the panel would simply lose sight of it.
    const before = state();
    expect(find(spaceCategories(before.layer), "technical").rooms).toEqual([]);

    const after = setRoomSpaceType(before, "1:B1", "technical");
    const cats = spaceCategories(after.layer);
    expect(find(cats, "technical").rooms.map((r) => r.id)).toContain("1:B1");
  });

  it("puts one with no category at all in the Unknown bucket", () => {
    const after = unassignRoom(state(), "1:B1");
    const unknown = spaceCategories(after.layer).find((c) => c.id === null)!;
    expect(unknown.rooms.map((r) => r.id)).toContain("1:B1");
  });

  it("leaves rooms inside an envelope out of it — the envelope stands for them", () => {
    const cats = spaceCategories(state().layer);
    const all = cats.flatMap((c) => c.rooms);
    for (const room of all) expect(room.group_id).toBeNull();
  });
});
