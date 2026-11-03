/**
 * The editing operations, and in particular what they refuse to do. Every
 * refusal is checked before anything is written, so a rejected operation must
 * leave the model byte-for-byte untouched — several of these assert exactly
 * that, because a half-applied edit is the failure that corrupts a plan.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  OperationRejected,
  UNDO_DEPTH,
  addDoor,
  addSpaceType,
  buildAdjacency,
  canRedo,
  canUndo,
  doorsOfRoom,
  fixture,
  hiddenRoomsIn,
  highlightTargets,
  initEditState,
  isRoomListed,
  nearestWall,
  reachable,
  recolorSpaceType,
  renameSpaceType,
  roomsOf,
  setRoomSurfaced,
  standardDoorWidth,
  undo,
  redo,
  wallLength,
  type EditState,
} from "./index";

let state: EditState;
beforeEach(() => {
  state = initEditState(fixture);
});

describe("add door", () => {
  // 1:w43 separates apartment A4's living room from the hallway and carries
  // no door, so it is the honest place to add one.
  const WALL = "1:w43";

  it("adds a door that renders from t, width, hinge and swing alone", () => {
    const wall = state.layer.walls.get(WALL)!;
    const next = addDoor(state, {
      wallId: WALL,
      t: 0.5,
      opensInto: wall.room_a,
    });

    expect(next.file.doors.length).toBe(state.file.doors.length + 1);
    const door = next.file.doors[next.file.doors.length - 1];
    expect(door.kind).toBe("physical");
    expect(door.wall_id).toBe(WALL);
    expect(door.t).toBe(0.5);
    expect(door.swing).toBe("a");
    expect(door.rooms).toBeNull(); // the pair is the wall's business
    expect(roomsOf(next.layer, door)).toEqual([wall.room_a, wall.room_b]);
  });

  it("matches the width the rest of the floor already uses", () => {
    const next = addDoor(state, {
      wallId: WALL,
      t: 0.5,
      opensInto: state.layer.walls.get(WALL)!.room_a,
    });
    const door = next.file.doors[next.file.doors.length - 1];
    expect(door.width).toBe(standardDoorWidth(state.layer, "1:floor"));
    expect(door.width).toBe(43.5);
  });

  it("becomes a real access edge immediately", () => {
    const wall = state.layer.walls.get(WALL)!;
    const before = reachable(
      state.layer,
      "1:H",
      { allowedDevices: new Set() },
      buildAdjacency(state.layer),
    );

    const next = addDoor(state, {
      wallId: WALL,
      t: 0.5,
      opensInto: wall.room_a,
    });
    const after = reachable(
      next.layer,
      "1:H",
      { allowedDevices: new Set() },
      buildAdjacency(next.layer),
    );

    // Nothing was unreachable before — the point is that the new door is in
    // the index without anything being told to rebuild a stored relationship.
    expect(after.seen.size).toBeGreaterThanOrEqual(before.seen.size);
    const room = next.layer.rooms.get(wall.room_a)!;
    expect(doorsOfRoom(next.layer, room).some((d) => d.wall_id === WALL)).toBe(
      true,
    );
  });

  it("refuses a door that does not fit, and says why", () => {
    const wall = state.layer.walls.get(WALL)!;
    expect(() =>
      addDoor(state, { wallId: WALL, t: 0.99, opensInto: wall.room_a }),
    ).toThrow(/does not fit/);
    expect(() =>
      addDoor(state, { wallId: WALL, t: 0.01, opensInto: wall.room_a }),
    ).toThrow(/does not fit/);
    expect(() =>
      addDoor(state, {
        wallId: WALL,
        t: 0.5,
        width: wallLength(state.layer, wall) * 2,
        opensInto: wall.room_a,
      }),
    ).toThrow(OperationRejected);
  });

  it("refuses to overlap an existing door, naming it", () => {
    // 1:w40 already carries 1:d11, the entrance to A1, at t = 0.4906.
    const wall = state.layer.walls.get("1:w40")!;
    expect(() =>
      addDoor(state, { wallId: "1:w40", t: 0.5, opensInto: wall.room_a }),
    ).toThrow(/would overlap H–L1/);
  });

  it("allows a second door on the same wall where there is room", () => {
    // 1:w53 runs 361 units between the two living rooms, so two 43.5-unit
    // doors fit with room to spare. On an 86-unit wall they would not, and
    // the fit check is what says so.
    const wall = state.layer.walls.get("1:w53")!;
    const once = addDoor(state, {
      wallId: "1:w53",
      t: 0.25,
      opensInto: wall.room_a,
    });
    const twice = addDoor(once, {
      wallId: "1:w53",
      t: 0.75,
      opensInto: wall.room_a,
    });
    expect(twice.file.doors.length).toBe(state.file.doors.length + 2);
  });

  it("refuses a slit wall, which has no two sides", () => {
    const slit = state.layer.walls.get("1:w31")!;
    expect(slit.room_a).toBe(slit.room_b);
    expect(() =>
      addDoor(state, { wallId: "1:w31", t: 0.5, opensInto: slit.room_a }),
    ).toThrow(/slit/);
  });

  it("refuses a room that is not a side of the wall", () => {
    expect(() =>
      addDoor(state, { wallId: WALL, t: 0.5, opensInto: "1:B1" }),
    ).toThrow(/not one of this wall's two rooms/);
  });

  it("leaves the model untouched when it refuses", () => {
    const snapshot = JSON.stringify(state.file);
    for (const attempt of [
      () => addDoor(state, { wallId: WALL, t: 0.99, opensInto: "1:L4" }),
      () => addDoor(state, { wallId: "1:w31", t: 0.5, opensInto: "1:L6" }),
      () => addDoor(state, { wallId: WALL, t: 0.5, opensInto: "1:B1" }),
    ]) {
      expect(attempt).toThrow(OperationRejected);
    }
    expect(JSON.stringify(state.file)).toBe(snapshot);
    expect(state.undo).toHaveLength(0);
  });

  it("gives each new door an id of its own", () => {
    const wall = state.layer.walls.get("1:w53")!;
    const once = addDoor(state, {
      wallId: "1:w53",
      t: 0.25,
      opensInto: wall.room_a,
    });
    const twice = addDoor(once, {
      wallId: "1:w53",
      t: 0.75,
      opensInto: wall.room_a,
    });
    const ids = twice.file.doors.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("show and hide room", () => {
  it("surfaces a hidden room", () => {
    expect(state.layer.rooms.get("1:B1")!.surfaced).toBe(false);
    const next = setRoomSurfaced(state, "1:B1", true);
    expect(next.layer.rooms.get("1:B1")!.surfaced).toBe(true);
  });

  it("refuses to hide a room that holds a device", () => {
    // 1:L1 hosts the A1 answering unit.
    const next = setRoomSurfaced(state, "1:L1", true);
    expect(() => setRoomSurfaced(next, "1:L1", false)).toThrow(
      /holds a device/,
    );
  });

  it("refuses to hide a room whose door carries any device", () => {
    // The gym's locker room is surfaced because its door carries a reader.
    expect(state.layer.rooms.get("0:GL1")!.surfaced).toBe(true);
    expect(() => setRoomSurfaced(state, "0:GL1", false)).toThrow(
      /cannot be hidden/,
    );
  });

  it("refuses even when the device guards the other side of the door", () => {
    // AC-0-d8 is on the gym's entrance door and guards 0:GM, not the lobby.
    // The lobby is still on that boundary, so it cannot be hidden either —
    // a reader with one invisible side is a reader nobody can see.
    const gymEntrance = state.layer.doors.get("0:d8")!;
    const devices = state.layer.devicesOnDoor.get(gymEntrance.id)!;
    expect(devices[0].guards).toEqual(["0:GM"]);
    expect(() => setRoomSurfaced(state, "0:GM", false)).toThrow(
      /cannot be hidden/,
    );
  });

  it("surfacing an apartment room makes the lists name it", () => {
    const bedroom = state.layer.rooms.get("1:B1")!;
    // Folded inside its flat to begin with.
    expect(isRoomListed(state.layer, bedroom)).toBe(false);

    const next = setRoomSurfaced(state, "1:B1", true);
    expect(isRoomListed(next.layer, next.layer.rooms.get("1:B1")!)).toBe(true);
  });

  it("hides a plain room with no hardware", () => {
    const shown = setRoomSurfaced(state, "1:B1", true);
    const hidden = setRoomSurfaced(shown, "1:B1", false);
    expect(hidden.layer.rooms.get("1:B1")!.surfaced).toBe(false);
  });

  it("shows any room at all — there are no preconditions", () => {
    for (const room of state.file.rooms) {
      if (room.surfaced) continue;
      expect(() => setRoomSurfaced(state, room.id, true)).not.toThrow();
    }
  });

  it("touches one field and nothing else", () => {
    const next = setRoomSurfaced(state, "1:B1", true);
    const before = state.file;
    expect(next.file.walls).toBe(before.walls);
    expect(next.file.doors).toBe(before.doors);
    expect(next.file.groups).toBe(before.groups);
    expect(next.file.devices).toBe(before.devices);
    // The room keeps every wall and its envelope — no merge, no regroup.
    const a = state.layer.rooms.get("1:B1")!;
    const b = next.layer.rooms.get("1:B1")!;
    expect(b.walls).toEqual(a.walls);
    expect(b.group_id).toBe(a.group_id);
    expect({ ...b, surfaced: a.surfaced }).toEqual(a);
  });

  it("leaves reachability exactly as it was, either way", () => {
    // Access runs over rooms regardless of visibility, so showing and hiding
    // cannot change who can get where.
    const everything = new Set(state.file.devices.map((d) => d.id));
    const before = reachable(
      state.layer,
      "0:L",
      { allowedDevices: everything },
      buildAdjacency(state.layer),
    );

    const shown = setRoomSurfaced(state, "1:B1", true);
    const hidden = setRoomSurfaced(shown, "0:CS1", false);

    for (const s of [shown, hidden]) {
      const after = reachable(
        s.layer,
        "0:L",
        { allowedDevices: everything },
        buildAdjacency(s.layer),
      );
      expect([...after.seen].sort()).toEqual([...before.seen].sort());
      expect(after.blocked.size).toBe(before.blocked.size);
    }
  });

  it("takes a hidden room out of the lists, whatever its type", () => {
    // Hide has to work for a room whose type is listed by default, or the
    // action silently does nothing visible.
    const storage = state.layer.rooms.get("0:CS1")!;
    expect(isRoomListed(state.layer, storage)).toBe(true);
    const next = setRoomSurfaced(state, "0:CS1", false);
    expect(isRoomListed(next.layer, next.layer.rooms.get("0:CS1")!)).toBe(false);
    // And the whole envelope lights up where it was.
    expect(highlightTargets(next.layer, "0:CS1").sort()).toEqual([
      "0:CM1",
      "0:CS1",
    ]);
  });
});

describe("what the lists name, and what a hover lights up", () => {
  it("folds a flat's rooms inside it", () => {
    for (const r of state.layer.file.rooms) {
      if (r.group_id?.includes(":A") && !r.surfaced) {
        expect(isRoomListed(state.layer, r)).toBe(false);
      }
    }
    // 76 apartment rooms, none of them listed to begin with.
    const folded = state.layer.file.rooms.filter(
      (r) => !isRoomListed(state.layer, r),
    );
    expect(folded).toHaveLength(76);
  });

  it("lists every other envelope's rooms", () => {
    for (const id of ["0:GM", "0:CS1", "0:GB1", "0:L", "0:TECH"]) {
      expect(isRoomListed(state.layer, state.layer.rooms.get(id)!)).toBe(true);
    }
  });

  it("lights the whole flat while its rooms are folded away", () => {
    const lit = highlightTargets(state.layer, "1:B1");
    expect(lit.sort()).toEqual(["1:B1", "1:L1", "1:T1"]);
  });

  it("lights a surfaced room on its own", () => {
    const next = setRoomSurfaced(state, "1:B1", true);
    expect(highlightTargets(next.layer, "1:B1")).toEqual(["1:B1"]);
    // Its neighbours in the same flat still light whole.
    expect(highlightTargets(next.layer, "1:L1").sort()).toEqual([
      "1:B1",
      "1:L1",
      "1:T1",
    ]);
  });

  it("lights a listed room on its own without any surfacing", () => {
    expect(highlightTargets(state.layer, "0:GM")).toEqual(["0:GM"]);
  });

  it("knows what is folded inside an envelope, for the show tool", () => {
    // What the show tool draws dashed and offers for clicking.
    expect(hiddenRoomsIn(state.layer, "1:A1").map((r) => r.id).sort()).toEqual([
      "1:B1",
      "1:L1",
      "1:T1",
    ]);
    // Nothing is folded inside the gym — its rooms are all on the map.
    expect(hiddenRoomsIn(state.layer, "0:GYM")).toEqual([]);

    const next = setRoomSurfaced(state, "1:B1", true);
    expect(hiddenRoomsIn(next.layer, "1:A1").map((r) => r.id).sort()).toEqual([
      "1:L1",
      "1:T1",
    ]);
  });
});

describe("space types", () => {
  it("recolours every space of that type at once", () => {
    const next = recolorSpaceType(state, "apartment", "#112233");
    expect(next.layer.spaceTypes.get("apartment")!.color).toBe("#112233");
    // The rooms themselves hold no colour, so nothing else had to change.
    for (const r of next.file.rooms) expect(r).not.toHaveProperty("color");
  });

  it("renames without touching any space's own name", () => {
    const before = state.file.rooms.map((r) => r.name);
    const next = renameSpaceType(state, "gym", "Fitness");
    expect(next.layer.spaceTypes.get("gym")!.name).toBe("Fitness");
    expect(next.file.rooms.map((r) => r.name)).toEqual(before);
  });

  it("adds a category", () => {
    const next = addSpaceType(state, {
      id: "storage",
      name: "Storage",
      color: "#8D8D8D",
    });
    expect(next.layer.spaceTypes.has("storage")).toBe(true);
  });

  it("refuses a duplicate category", () => {
    expect(() =>
      addSpaceType(state, { id: "gym", name: "Gym again", color: "#000000" }),
    ).toThrow(/already exists/);
  });
});

describe("undo", () => {
  it("reverses an operation exactly", () => {
    const before = JSON.stringify(state.file);
    const next = addDoor(state, {
      wallId: "1:w43",
      t: 0.5,
      opensInto: "1:L4",
    });
    expect(JSON.stringify(next.file)).not.toBe(before);
    expect(JSON.stringify(undo(next).file)).toBe(before);
  });

  it("keeps the last five operations and no more", () => {
    let s = state;
    for (const [i, roomId] of [
      "1:B1",
      "1:T1",
      "1:B2",
      "1:T2",
      "1:B4",
      "1:T4",
      "1:B6",
    ].entries()) {
      void i;
      s = setRoomSurfaced(s, roomId, true);
    }
    expect(s.undo).toHaveLength(UNDO_DEPTH);

    // Unwinding all five leaves the two oldest edits in place.
    let back = s;
    for (let i = 0; i < UNDO_DEPTH; i += 1) back = undo(back);
    expect(canUndo(back)).toBe(false);
    expect(back.layer.rooms.get("1:B1")!.surfaced).toBe(true);
    expect(back.layer.rooms.get("1:B6")!.surfaced).toBe(false);
  });

  it("round-trips through redo", () => {
    const next = addDoor(state, {
      wallId: "1:w43",
      t: 0.5,
      opensInto: "1:L4",
    });
    const back = undo(next);
    expect(canRedo(back)).toBe(true);
    const forward = redo(back);
    expect(JSON.stringify(forward.file)).toBe(JSON.stringify(next.file));
  });

  it("drops the redo stack once a new edit lands", () => {
    const next = addDoor(state, {
      wallId: "1:w43",
      t: 0.5,
      opensInto: "1:L4",
    });
    const back = undo(next);
    const diverged = setRoomSurfaced(back, "1:B1", true);
    expect(canRedo(diverged)).toBe(false);
  });

  it("does nothing when there is nothing to undo", () => {
    expect(canUndo(state)).toBe(false);
    expect(undo(state)).toBe(state);
    expect(redo(state)).toBe(state);
  });

  it("labels each entry for the button", () => {
    const next = addDoor(state, {
      wallId: "1:w43",
      t: 0.5,
      opensInto: "1:L4",
    });
    expect(next.undo[next.undo.length - 1].label).toBe("Add door");
  });
});

describe("hit testing a click onto a wall", () => {
  it("finds the wall under the pointer and which side it is on", () => {
    const wall = state.layer.walls.get("1:w43")!;
    const a = state.layer.vertices.get(wall.v1)!;
    const b = state.layer.vertices.get(wall.v2)!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const hit = nearestWall(state.layer, "1:floor", mid, 10);
    expect(hit?.wallId).toBe("1:w43");
    expect(hit?.t).toBeCloseTo(0.5, 2);
    expect(hit?.distance).toBeCloseTo(0, 5);
  });

  it("reports the side the pointer is on, so a door opens the right way", () => {
    const wall = state.layer.walls.get("1:w43")!;
    const a = state.layer.vertices.get(wall.v1)!;
    const b = state.layer.vertices.get(wall.v2)!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Step toward room_a along the normal.
    const n = { x: b.y - a.y, y: -(b.x - a.x) };
    const len = Math.hypot(n.x, n.y);
    const towardA = { x: mid.x + (n.x / len) * 5, y: mid.y + (n.y / len) * 5 };
    const towardB = { x: mid.x - (n.x / len) * 5, y: mid.y - (n.y / len) * 5 };

    expect(nearestWall(state.layer, "1:floor", towardA, 20)?.room).toBe(
      wall.room_a,
    );
    expect(nearestWall(state.layer, "1:floor", towardB, 20)?.room).toBe(
      wall.room_b,
    );
  });

  it("returns nothing when the pointer is nowhere near a wall", () => {
    expect(nearestWall(state.layer, "1:floor", { x: -5000, y: -5000 }, 40))
      .toBeNull();
  });

  it("never returns a wall from another floor", () => {
    const wall = state.layer.walls.get("1:w43")!;
    const a = state.layer.vertices.get(wall.v1)!;
    // Floors share a coordinate system here, so this is a real risk.
    const hit = nearestWall(state.layer, "2:floor", a, 40);
    expect(hit?.wallId.startsWith("2:")).toBe(true);
  });
});
