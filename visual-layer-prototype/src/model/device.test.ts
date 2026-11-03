/**
 * Renaming a device and taking it off what it is on.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  EXTERIOR,
  deviceAnchor,
  facesExterior,
  doorSides,
  freeDoorSides,
  goesOnDoors,
  placeDeviceInSpace,
  placeDeviceOnDoor,
  roomsOf,
  deviceHost,
  deviceRows,
  deviceTypes,
  initEditState,
  isUnassigned,
  renameDevice,
  unassignDevice,
  undo,
  type EditState,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/** A reader on a door, and an answering unit in a flat. */
const READER = "AC-1-d11";
const UNIT = "AN-A1";

const find = (st: EditState, id: string) =>
  st.file.devices.find((d) => d.id === id)!;

describe("what a device is on", () => {
  it("is the door, the space, or nothing", () => {
    const st = state();
    expect(deviceHost(find(st, READER))).toBe("door");
    expect(deviceHost(find(st, UNIT))).toBe("space");
    expect(deviceHost({ ...find(st, UNIT), host_id: null })).toBeNull();
  });
});

describe("renaming a device", () => {
  it("renames it and nothing else", () => {
    const before = state();
    const after = renameDevice(before, READER, "Front door reader");
    expect(find(after, READER).name).toBe("Front door reader");
    expect(after.file.devices.length).toBe(before.file.devices.length);
    expect(find(after, READER).guards).toEqual(find(before, READER).guards);
    expect(after.undo.at(-1)!.label).toBe("Rename device");
  });

  it("trims what it is given", () => {
    expect(find(renameDevice(state(), UNIT, "  Hallway unit "), UNIT).name).toBe(
      "Hallway unit",
    );
  });

  it("refuses an empty name", () => {
    expect(() => renameDevice(state(), UNIT, "   ")).toThrow(OperationRejected);
  });

  it("does nothing when the name has not changed", () => {
    const before = state();
    const same = find(before, UNIT).name;
    expect(renameDevice(before, UNIT, same)).toBe(before);
  });

  it("refuses a device that is not there", () => {
    expect(() => renameDevice(state(), "nope", "x")).toThrow(OperationRejected);
  });

  it("is undone", () => {
    const before = state();
    expect(undo(renameDevice(before, UNIT, "Something")).file).toEqual(
      before.file,
    );
  });
});

describe("unassigning a device", () => {
  it("takes a reader off its door and keeps the record", () => {
    const before = state();
    const after = unassignDevice(before, READER);
    const now = find(after, READER);

    expect(after.file.devices.length).toBe(before.file.devices.length);
    expect(now.host_id).toBeNull();
    expect(after.file.unplaced_devices).toContain(READER);
    expect(after.undo.at(-1)!.label).toBe("Unassign from door");
  });

  it("drops what it was checking, because it cannot check it any more", () => {
    // A reader verifies entry into a room through a door. Off the door
    // there is no entry to verify, so keeping the room would claim a
    // check nothing carries out.
    const before = state();
    expect(find(before, READER).guards).not.toEqual([]);
    expect(unassignDevice(before, READER).file.devices
      .find((d) => d.id === READER)!.guards).toEqual([]);
  });

  it("takes it off the map too", () => {
    const before = state();
    expect(deviceAnchor(before.layer, find(before, READER))).not.toBeNull();
    const after = unassignDevice(before, READER);
    expect(deviceAnchor(after.layer, find(after, READER))).toBeNull();
  });

  it("says space rather than door for a unit in a flat", () => {
    expect(unassignDevice(state(), UNIT).undo.at(-1)!.label).toBe(
      "Unassign from space",
    );
  });

  it("refuses one that is already off", () => {
    const once = unassignDevice(state(), READER);
    expect(() => unassignDevice(once, READER)).toThrow(OperationRejected);
  });

  it("is undone, place and guards together", () => {
    const before = state();
    expect(undo(unassignDevice(before, READER)).file).toEqual(before.file);
  });
});

describe("the devices panel's list", () => {
  it("has every device, by name", () => {
    const rows = deviceRows(state().layer);
    expect(rows.length).toBe(state().file.devices.length);
    const names = rows.map((r) => r.device.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it("says the storey and the space a device is in", () => {
    const rows = deviceRows(state().layer);
    const unit = rows.find((r) => r.device.id === UNIT)!;
    // The flat, not the living room inside it.
    expect(unit.placeName).toBe("A1");
    expect(unit.floorName).toBe("floor 1");
  });

  it("says what a reader guards rather than naming its door twice", () => {
    const reader = deviceRows(state().layer).find(
      (r) => r.device.id === READER,
    )!;
    expect(reader.placeName).toBe("A1");
  });

  it("says nothing about where an unassigned device is", () => {
    const after = unassignDevice(state(), READER);
    const row = deviceRows(after.layer).find((r) => r.device.id === READER)!;
    expect(row.floorName).toBeNull();
    expect(row.placeName).toBeNull();
    expect(isUnassigned(row.device)).toBe(true);
  });

  it("knows which categories are in the building, for the filter", () => {
    expect(deviceTypes(state().layer)).toEqual([
      "access_unit",
      "answering_unit",
      "intercom",
    ]);
  });
});

describe("the sides of a doorway", () => {
  it("has two, each checking the way into the other room", () => {
    const layer = state().layer;
    const sides = doorSides(layer, "1:d11");
    expect(sides.map((s) => s.side)).toEqual(["a", "b"]);
    for (const s of sides) {
      expect(s.fromRoomId).not.toBe(s.guardsRoomId);
    }
    // One side is the room the other side guards, and the other way round.
    expect(sides[0].fromRoomId).toBe(sides[1].guardsRoomId);
    expect(sides[1].fromRoomId).toBe(sides[0].guardsRoomId);
  });

  it("says which side is already read, and leaves one free", () => {
    const layer = state().layer;
    const sides = doorSides(layer, "1:d11");
    const taken = sides.filter((s) => s.takenBy !== null);
    expect(taken.map((s) => s.takenBy)).toEqual([READER]);
    expect(freeDoorSides(layer, "1:d11")).toHaveLength(1);
  });

  it("offers both sides of a door nothing reads", () => {
    const after = unassignDevice(state(), READER);
    expect(freeDoorSides(after.layer, "1:d11")).toHaveLength(2);
  });

  it("knows a reader goes on a door and a unit does not", () => {
    expect(goesOnDoors("access_unit")).toBe(true);
    expect(goesOnDoors("intercom")).toBe(true);
    expect(goesOnDoors("answering_unit")).toBe(false);
  });
});

describe("placing a device on a door", () => {
  /** The reader, taken off so it can be put back by hand. */
  const loose = () => unassignDevice(state(), READER);

  it("checks the room on the far side from where it is put", () => {
    const before = loose();
    const [side] = doorSides(before.layer, "1:d11");
    const after = placeDeviceOnDoor(before, READER, "1:d11", side.side);
    const now = find(after, READER);

    expect(now.host_kind).toBe("door");
    expect(now.host_id).toBe("1:d11");
    expect(now.guards).toEqual([side.guardsRoomId]);
    expect(after.file.unplaced_devices).not.toContain(READER);
  });

  it("draws it on the side it was dropped on", () => {
    // The side it reads from and the room it checks are two halves of
    // one choice, so putting it back where it was restores both.
    const original = state();
    const was = find(original, READER);
    const back = placeDeviceOnDoor(
      loose(),
      READER,
      "1:d11",
      doorSides(original.layer, was.id === READER ? "1:d11" : "1:d11").find(
        (s) => s.guardsRoomId === was.guards[0],
      )!.side,
    );
    expect(find(back, READER).guards).toEqual(was.guards);
    expect(deviceAnchor(back.layer, find(back, READER))).toEqual(
      deviceAnchor(original.layer, was),
    );
  });

  it("refuses a side something is already reading", () => {
    const before = state();
    const taken = doorSides(before.layer, "1:d11").find(
      (s) => s.takenBy !== null,
    )!;
    const other = unassignDevice(before, "AN-A1"); // any other device
    expect(() =>
      placeDeviceOnDoor(other, "IC-0-d10", "1:d11", taken.side),
    ).toThrow(/already on that side/);
  });

  it("refuses an answering unit, which is not a thing you badge at", () => {
    expect(() =>
      placeDeviceOnDoor(unassignDevice(state(), UNIT), UNIT, "1:d11", "a"),
    ).toThrow(/belongs in a space/);
  });

  it("surfaces the room it now checks the way into", () => {
    // A bedroom is folded inside its flat. Put a reader on its door and
    // the room has to be visible, or the check points at nothing.
    const before = loose();
    const bedroom = before.layer.rooms.get("1:B1")!;
    expect(bedroom.surfaced).toBe(false);

    const door = before.file.doors.find(
      (d) =>
        d.wall_id !== null &&
        roomsOf(before.layer, d).includes("1:B1"),
    )!;
    const side = doorSides(before.layer, door.id).find(
      (s) => s.guardsRoomId === "1:B1",
    )!;
    const after = placeDeviceOnDoor(before, READER, door.id, side.side);

    const now = after.layer.rooms.get("1:B1")!;
    expect(now.surfaced).toBe(true);
    // And it is still in the flat: a reader does not move a room out.
    expect(now.group_id).toBe(bedroom.group_id);
  });

  it("is undone", () => {
    const before = loose();
    expect(undo(placeDeviceOnDoor(before, READER, "1:d11", "a")).file).toEqual(
      before.file,
    );
  });
});

describe("placing a device in a space", () => {
  const loose = () => unassignDevice(state(), UNIT);

  it("puts the unit in the room and takes it off the waiting list", () => {
    const after = placeDeviceInSpace(loose(), UNIT, "1:L1");
    const now = find(after, UNIT);
    expect(now.host_kind).toBe("room");
    expect(now.host_id).toBe("1:L1");
    expect(now.guards).toEqual([]);
    expect(after.file.unplaced_devices).not.toContain(UNIT);
  });

  it("refuses a reader, which has no doorway there to read at", () => {
    expect(() =>
      placeDeviceInSpace(unassignDevice(state(), READER), READER, "1:L1"),
    ).toThrow(/at a doorway/);
  });

  it("refuses a second unit in a space that has one", () => {
    const loose2 = unassignDevice(state(), "AN-A2");
    expect(() => placeDeviceInSpace(loose2, "AN-A2", "1:L1")).toThrow(
      /already in/,
    );
  });

  it("is undone", () => {
    const before = loose();
    expect(undo(placeDeviceInSpace(before, UNIT, "1:L1")).file).toEqual(
      before.file,
    );
  });
});

describe("facesExterior", () => {
  it("is the intercom on a door to the street, and nothing else", () => {
    const layer = state().layer;
    // The camera on the detail card hangs off this, so it is worth
    // pinning: one device qualifies, and it qualifies for two reasons
    // that are both read off the plan rather than stored.
    const yes = layer.file.devices.filter((d) => facesExterior(layer, d));
    expect(yes.map((d) => d.id)).toEqual(["IC-0-d10"]);

    const intercom = yes[0];
    expect(intercom.device_type).toBe("intercom");
    const door = layer.doors.get(intercom.host_id!)!;
    const wall = layer.walls.get(door.wall_id!)!;
    expect([wall.room_a, wall.room_b]).toContain(EXTERIOR);
  });

  it("says no to a reader on the same kind of door", () => {
    const layer = state().layer;
    // The gym and the shops are entered from the street too, and the
    // readers on them have no lens — the product is half the rule.
    const gym = layer.file.devices.find((d) => d.name === "Gym Entrance")!;
    expect(gym.device_type).not.toBe("intercom");
    expect(facesExterior(layer, gym)).toBe(false);
  });

  it("says no to a device with no door under it", () => {
    const layer = state().layer;
    const unit = layer.file.devices.find((d) => d.id === "AN-A1")!;
    expect(facesExterior(layer, unit)).toBe(false);
  });
});
