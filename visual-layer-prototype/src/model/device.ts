/**
 * What can be done to a device once the plan exists.
 *
 * Two things, which is what the design's menu offers: rename it, and take
 * it off whatever it is on. Everything else about a device — where it is
 * drawn, which side of a wall it reads from, whether it is in the way — is
 * derived from its host and its `guards`, so there is nothing else here to
 * set.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import type { VisualLayer } from "./load";
import type { Device } from "./types";

/** The devices are stored as a list, so a lookup is a find. */
function must(layer: VisualLayer, deviceId: string): Device {
  const device = layer.file.devices.find((d) => d.id === deviceId);
  if (!device) throw new OperationRejected(`No such device: ${deviceId}`);
  return device;
}

/**
 * What a device is attached to, which is what its menu can offer to undo.
 *
 * A reader is on a door, an answering unit is in a space, and a device
 * with no host is already unassigned — the menu still shows the item for
 * it, greyed, because an action that vanishes is harder to find than one
 * that is visibly unavailable.
 */
export function deviceHost(device: Device): "door" | "space" | null {
  if (device.host_id === null) return null;
  return device.host_kind === "door" ? "door" : "space";
}

export function renameDevice(
  state: EditState,
  deviceId: string,
  name: string,
): EditState {
  const device = must(state.layer, deviceId);
  const next = name.trim();
  if (next === "") {
    throw new OperationRejected("A device needs a name.");
  }
  if (next === device.name) return state;

  return commit(state, "rename_device", "Rename device", {
    ...state.file,
    devices: state.file.devices.map((d) =>
      d.id === deviceId ? { ...d, name: next } : d,
    ),
  });
}

/**
 * Take a device off its door or out of its space.
 *
 * The record stays — a device is a provisioned piece of hardware, and
 * losing it because somebody edited the plan would lose a real thing. It
 * goes back to the unplaced list, which is where a device waits to be put
 * somewhere, the same state everything arrives in before the plan exists.
 *
 * Its guards go with its place. A reader verifies entry into a room
 * *through a particular door*; off the door there is no entry for it to
 * verify, and keeping the old room would claim a check that nothing can
 * carry out.
 */
export function unassignDevice(state: EditState, deviceId: string): EditState {
  const device = must(state.layer, deviceId);
  if (device.host_id === null) {
    throw new OperationRejected(`${device.name} is not placed anywhere.`);
  }

  const devices = state.file.devices.map((d) =>
    d.id === deviceId ? { ...d, host_id: null, guards: [] } : d,
  );

  return commit(
    state,
    "unassign_device",
    device.host_kind === "door" ? "Unassign from door" : "Unassign from space",
    {
      ...state.file,
      devices,
      unplaced_devices: devices
        .filter((d) => d.host_id === null)
        .map((d) => d.id),
    },
  );
}

/** A device as the devices panel lists it. */
export interface DeviceRow {
  device: Device;
  /** The storey it is on, or null while it is not on one. */
  floorName: string | null;
  /** The space it is in or the one it guards, or null while unplaced. */
  placeName: string | null;
  /** Its category, for the Type filter. */
  type: string;
}

/**
 * Every device, with where it is said in the words the panel uses.
 *
 * A device in a space is listed by that space. A device on a door is
 * listed by what it guards rather than by the door, because "A1 Entrance"
 * on a row under a door called "A1 Entrance" says one thing twice — and
 * what somebody looking down this list wants to know is which space the
 * reader is protecting.
 */
export function deviceRows(layer: VisualLayer): DeviceRow[] {
  return layer.file.devices
    .map((device) => ({
      device,
      floorName: placedOn(layer, device),
      placeName: placeOf(layer, device),
      type: device.device_type,
    }))
    .sort((a, b) => a.device.name.localeCompare(b.device.name));
}

function placedOn(layer: VisualLayer, device: Device): string | null {
  if (device.host_id === null) return null;
  const floor = layer.floors.find((f) => f.id === device.floor_id);
  return floor?.name ?? null;
}

function placeOf(layer: VisualLayer, device: Device): string | null {
  if (device.host_id === null) return null;

  if (device.host_kind === "room") {
    const room = layer.rooms.get(device.host_id);
    if (!room) return null;
    const group = room.group_id ? layer.groups.get(room.group_id) : undefined;
    // The flat, not the living room inside it: the unit is the thing the
    // building is administered by.
    return group?.name ?? room.name;
  }

  const guarded = device.guards
    .map((id) => layer.rooms.get(id))
    .find((r) => r !== undefined);
  if (guarded) {
    const group = guarded.group_id
      ? layer.groups.get(guarded.group_id)
      : undefined;
    return group?.name ?? guarded.name;
  }
  return layer.doors.get(device.host_id)?.name ?? null;
}

/** The categories present, for the Type filter's own list. */
export function deviceTypes(layer: VisualLayer): string[] {
  return [...new Set(layer.file.devices.map((d) => d.device_type))].sort();
}

/** Whether a device reads as unassigned, which the panel can filter on. */
export function isUnassigned(device: Device): boolean {
  return device.host_id === null;
}

