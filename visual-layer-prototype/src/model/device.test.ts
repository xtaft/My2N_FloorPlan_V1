/**
 * Renaming a device and taking it off what it is on.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  deviceAnchor,
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
