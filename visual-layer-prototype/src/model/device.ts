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
import { deviceSide } from "./derive";
import { roomsOf } from "./access";
import { isExterior, type VisualLayer } from "./load";
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

/**
 * Whether this device watches a way in from the street.
 *
 * True for an intercom on a door with the outside on one side of it.
 * Both halves are read off the plan: the product is the one with a
 * lens, and the door is one the building is entered through. So a
 * second entrance intercom would answer true the day it is placed,
 * and this one would stop if its door stopped leading outside.
 */
export function facesExterior(layer: VisualLayer, device: Device): boolean {
  if (device.device_type !== "intercom") return false;
  if (device.host_kind !== "door" || device.host_id === null) return false;
  const door = layer.doors.get(device.host_id);
  if (!door?.wall_id) return false;
  const wall = layer.walls.get(door.wall_id);
  if (!wall) return false;
  return isExterior(wall.room_a) || isExterior(wall.room_b);
}

/**
 * Move a device to the other side of its door.
 *
 * A reader stands on one side and checks the way in to the other, so
 * changing sides turns it round: it now checks the room it stood in.
 * Nothing moves but `guards` — which side it is drawn on is derived
 * from that, never stored.
 *
 * Refused where the other side is the street, which no reader checks
 * the way in to; where the other side already has a reader; and for a
 * device that is not on a door.
 */
export function flipDeviceSide(state: EditState, deviceId: string): EditState {
  const { layer, file } = state;
  const device = must(layer, deviceId);
  if (device.host_kind !== "door" || device.host_id === null) {
    throw new OperationRejected(`${device.name} is not on a door.`);
  }
  const door = layer.doors.get(device.host_id);
  if (!door || door.wall_id === null) {
    throw new OperationRejected(`${device.name} is not on a door with two sides.`);
  }
  const here = deviceSide(layer, device);
  const other = here === "a" ? "b" : "a";
  const target = doorSides(layer, door.id).find((s) => s.side === other);
  if (!target) {
    throw new OperationRejected(`${door.name} has no other side.`);
  }
  if (isExterior(target.guardsRoomId)) {
    throw new OperationRejected(
      `The other side of ${door.name} is outside. A reader cannot check the way in to the street.`,
    );
  }
  if (target.takenBy !== null && target.takenBy !== deviceId) {
    const taken = file.devices.find((d) => d.id === target.takenBy);
    throw new OperationRejected(
      `${taken?.name ?? "A device"} is already on that side of ${door.name}.`,
    );
  }

  const devices = file.devices.map((d) =>
    d.id === deviceId ? { ...d, guards: [target.guardsRoomId] } : d,
  );
  // The room it now checks the way into has to be visible, as when it
  // was placed.
  const guarded = layer.rooms.get(target.guardsRoomId);
  const rooms =
    guarded && !guarded.surfaced
      ? file.rooms.map((r) => (r.id === guarded.id ? { ...r, surfaced: true } : r))
      : file.rooms;

  return commit(state, "flip_device", `Change door side — ${device.name}`, {
    ...file,
    rooms,
    devices,
  });
}

export function placedOn(layer: VisualLayer, device: Device): string | null {
  if (device.host_id === null) return null;
  const floor = layer.floors.find((f) => f.id === device.floor_id);
  return floor?.name ?? null;
}

export function placeOf(layer: VisualLayer, device: Device): string | null {
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


// ------------------------------------------------- putting a device somewhere

/**
 * Which devices go where.
 *
 * A reader or an intercom is a thing you present a credential to on your
 * way through a doorway, so it goes on a door. An answering unit is the
 * thing that rings inside a flat, so it goes in a space. This is not a
 * policy — it is what the hardware is.
 */
export function goesOnDoors(deviceType: string): boolean {
  return deviceType !== "answering_unit";
}

/** One side of a doorway, and whether anything is already reading there. */
export interface DoorSide {
  side: "a" | "b";
  /** The room you stand in on this side. */
  fromRoomId: string;
  /** The room a device here would check entry into — the other one. */
  guardsRoomId: string;
  /** The device already here, if any. */
  takenBy: string | null;
}

/**
 * The two sides of a doorway.
 *
 * A device is drawn on the side access is verified *from* and guards the
 * room on the other side: you present your card where you are standing to
 * get in to where you are not. Both halves of that come from one choice,
 * which is why a drop only has to say which side was dropped on.
 */
export function doorSides(layer: VisualLayer, doorId: string): DoorSide[] {
  const door = layer.doors.get(doorId);
  if (!door || door.wall_id === null) return [];
  const [a, b] = roomsOf(layer, door);
  if (a === b) return []; // a slit is not a way through

  const on = layer.devicesOnDoor.get(doorId) ?? [];
  const takenOn = (side: "a" | "b") =>
    on.find((d) => deviceSide(layer, d) === side)?.id ?? null;

  return [
    { side: "a", fromRoomId: a, guardsRoomId: b, takenBy: takenOn("a") },
    { side: "b", fromRoomId: b, guardsRoomId: a, takenBy: takenOn("b") },
  ];
}

/** The sides a device could still be dropped on. */
export function freeDoorSides(layer: VisualLayer, doorId: string): DoorSide[] {
  return doorSides(layer, doorId).filter((s) => s.takenBy === null);
}

/**
 * Put a reader or an intercom on one side of a doorway.
 *
 * The side says everything: the device is drawn there, and it checks
 * entry into the room on the other side.
 *
 * A room that was folded away inside its flat is surfaced by this. Once
 * something checks the way in, that way in is a thing the manager has to
 * see — but it stays in its envelope, because gaining a reader does not
 * make a bedroom stop being part of the flat.
 */
export function placeDeviceOnDoor(
  state: EditState,
  deviceId: string,
  doorId: string,
  side: "a" | "b",
): EditState {
  const { layer, file } = state;
  const device = must(layer, deviceId);

  if (!goesOnDoors(device.device_type)) {
    throw new OperationRejected(
      `${device.name} is an answering unit. It belongs in a space, not on a door.`,
    );
  }

  const door = layer.doors.get(doorId);
  if (!door) throw new OperationRejected(`No such door: ${doorId}`);
  if (door.wall_id === null) {
    throw new OperationRejected(
      `${door.name} is a vertical link between storeys. It has no sides to stand on.`,
    );
  }

  const target = doorSides(layer, doorId).find((s) => s.side === side);
  if (!target) {
    throw new OperationRejected(`${door.name} has no ${side} side.`);
  }
  if (target.takenBy !== null && target.takenBy !== deviceId) {
    const taken = layer.file.devices.find((d) => d.id === target.takenBy);
    throw new OperationRejected(
      `${taken?.name ?? "A device"} is already on that side of ${door.name}.`,
    );
  }

  const wall = layer.walls.get(door.wall_id);
  const devices = file.devices.map((d) =>
    d.id === deviceId
      ? {
          ...d,
          host_kind: "door" as const,
          host_id: doorId,
          position: null,
          guards: [target.guardsRoomId],
          floor_id: wall ? layer.rooms.get(wall.room_a)?.floor_id ?? null : null,
        }
      : d,
  );

  // The room it now checks the way into has to be visible, or there is a
  // check on the map with nothing to point at.
  const guarded = layer.rooms.get(target.guardsRoomId);
  const rooms =
    guarded && !guarded.surfaced
      ? file.rooms.map((r) =>
          r.id === guarded.id ? { ...r, surfaced: true } : r,
        )
      : file.rooms;

  return commit(state, "place_device", `Place ${device.name}`, {
    ...file,
    rooms,
    devices,
    unplaced_devices: devices.filter((d) => d.host_id === null).map((d) => d.id),
  });
}

/**
 * Put an answering unit in a space.
 *
 * A unit belongs to the flat rather than to one of its rooms, so a drop
 * anywhere inside an envelope puts it in the envelope — the room the
 * record names is where it is drawn, and the drawing already centres it
 * on the flat.
 */
export function placeDeviceInSpace(
  state: EditState,
  deviceId: string,
  roomId: string,
): EditState {
  const { layer, file } = state;
  const device = must(layer, deviceId);

  if (goesOnDoors(device.device_type)) {
    throw new OperationRejected(
      `${device.name} reads credentials at a doorway. Drop it on one side of a door.`,
    );
  }

  const room = layer.rooms.get(roomId);
  if (!room) throw new OperationRejected(`No such space: ${roomId}`);

  const already = (layer.devicesInRoom.get(roomId) ?? []).find(
    (d) => d.id !== deviceId && d.device_type === device.device_type,
  );
  if (already) {
    throw new OperationRejected(
      `${already.name} is already in ${room.name}.`,
    );
  }

  const devices = file.devices.map((d) =>
    d.id === deviceId
      ? {
          ...d,
          host_kind: "room" as const,
          host_id: roomId,
          guards: [],
          floor_id: room.floor_id,
        }
      : d,
  );

  return commit(state, "place_device", `Place ${device.name}`, {
    ...file,
    devices,
    unplaced_devices: devices.filter((d) => d.host_id === null).map((d) => d.id),
  });
}
