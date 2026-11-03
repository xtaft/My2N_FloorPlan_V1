/**
 * The rest of the "What is deliberately absent" table: everything a consumer
 * might reach for that the fixture refuses to store.
 */
import { must, type VisualLayer } from "./load";
import { accessType, roomsOf } from "./access";
import { add, doorGeometry, negate, normal, unit } from "./geometry";
import {
  EXTERIOR,
  type Device,
  type Door,
  type Point,
  type Room,
  type Wall,
} from "./types";

/** A room's doors: the doors on the room's walls. */
export function doorsOfRoom(layer: VisualLayer, room: Room): Door[] {
  const out: Door[] = [];
  for (const wallId of room.walls) {
    for (const door of layer.doorsOnWall.get(wallId) ?? []) out.push(door);
  }
  // Virtual doors have no wall, so they are found by their stored pair.
  for (const door of layer.file.doors) {
    if (door.kind === "virtual" && door.rooms?.includes(room.id)) out.push(door);
  }
  return out;
}

/** Which rooms are neighbours: the ones on the other side of a shared wall. */
export function neighboursOf(layer: VisualLayer, room: Room): Set<string> {
  const out = new Set<string>();
  for (const wallId of room.walls) {
    const w = must(layer.walls, wallId, "wall");
    for (const other of [w.room_a, w.room_b]) {
      if (other !== room.id && other !== EXTERIOR) out.add(other);
    }
  }
  return out;
}

/** An envelope's outer walls: walls whose two rooms are in different envelopes. */
export function groupOuterWalls(layer: VisualLayer, groupId: string): Wall[] {
  const members = new Set(
    layer.file.rooms.filter((r) => r.group_id === groupId).map((r) => r.id),
  );
  return layer.file.walls.filter((w) => {
    const aIn = members.has(w.room_a);
    const bIn = members.has(w.room_b);
    return aIn !== bIn;
  });
}

/** An envelope's entrances: doors with exactly one side in the envelope. */
export function groupEntrances(layer: VisualLayer, groupId: string): Door[] {
  const members = new Set(
    layer.file.rooms.filter((r) => r.group_id === groupId).map((r) => r.id),
  );
  return layer.file.doors.filter((door) => {
    const [a, b] = roomsOf(layer, door);
    return members.has(a) !== members.has(b);
  });
}

/**
 * A device's side of a door follows from `guards`, never stored. A reader
 * guarding `room_a` draws on the `room_a` side — physically where it is. A
 * stored side would go stale the moment a wall's room pair changed.
 */
export function deviceSide(
  layer: VisualLayer,
  device: Device,
): "a" | "b" | null {
  if (device.host_kind !== "door" || device.host_id === null) return null;
  const door = layer.doors.get(device.host_id);
  if (!door) return null;
  const [a] = roomsOf(layer, door);
  return device.guards.includes(a) ? "a" : "b";
}

/** How far off the wall a reader glyph sits, in canvas units. */
export const DEVICE_OFFSET = 16;

/**
 * Where to draw a device.
 *
 * A room-hosted device carries its own position. A door-hosted one is placed
 * off the door, on the side it guards — physically where the reader is. The
 * side comes from `guards` against the wall's room pair, so it cannot go stale
 * the way a stored side would.
 */
export function deviceAnchor(
  layer: VisualLayer,
  device: Device,
): Point | null {
  if (device.host_id === null) return null;

  if (device.host_kind === "room") {
    return device.position
      ? { x: device.position[0], y: device.position[1] }
      : null;
  }
  if (device.host_kind !== "door") return null;

  const door = layer.doors.get(device.host_id);
  if (!door || door.wall_id === null) return null; // a virtual door has no place
  const geom = doorGeometry(layer, door);
  if (!geom) return null;

  const wall = must(layer.walls, door.wall_id, "wall");
  const n = unit(normal(layer, wall)); // toward room_a
  const toward = deviceSide(layer, device) === "b" ? negate(n) : n;
  const mid = {
    x: (geom.p1.x + geom.p2.x) / 2,
    y: (geom.p1.y + geom.p2.y) / 2,
  };
  return add(mid, toward, DEVICE_OFFSET);
}

/**
 * A wall is drawn when:
 *
 *     room_a and room_b are in different groups
 *       OR either room is surfaced
 *
 * One derived rule, no flags on walls. Rooms default to hidden; the group is
 * what the map shows and what the user operates on.
 */
export function isWallVisible(
  layer: VisualLayer,
  wall: Wall,
  showAllRooms = false,
): boolean {
  if (showAllRooms) return true;
  const a = layer.rooms.get(wall.room_a);
  const b = layer.rooms.get(wall.room_b);
  // A wall onto the exterior is always a boundary between two envelopes.
  if (!a || !b) return true;
  if (a.surfaced || b.surfaced) return true;
  return a.group_id !== b.group_id;
}

/** A room or group holds no colour of its own; the type owns it. */
export function roomColor(layer: VisualLayer, room: Room): string {
  const type = accessType(layer, room);
  if (!type) return "#DADDE1"; // unbound is a valid state, rendered distinctly
  return layer.spaceTypes.get(type)?.color ?? "#DADDE1";
}

export function spaceTypeName(
  layer: VisualLayer,
  room: Room,
): string {
  const type = accessType(layer, room);
  if (!type) return "Unassigned";
  return layer.spaceTypes.get(type)?.name ?? type;
}

/** A segmented but not-yet-assigned space is a real thing to resolve. */
export function isUnbound(layer: VisualLayer, room: Room): boolean {
  return accessType(layer, room) === null;
}

/**
 * The envelope chain from a room up to the top, for the drawer and for
 * breadcrumbs. Guarded against a cycle, which reparenting must reject anyway.
 */
export function envelopeChain(layer: VisualLayer, room: Room): string[] {
  const chain: string[] = [];
  let id = room.group_id;
  const guard = new Set<string>();
  while (id !== null && !guard.has(id)) {
    guard.add(id);
    chain.push(id);
    id = layer.groups.get(id)?.parent_group_id ?? null;
  }
  return chain;
}

/**
 * The shafts, by identity. A shaft with a single member gets no vertical doors
 * and is worth flagging: it usually means the other floors were not tagged.
 */
export function shaftMembers(layer: VisualLayer): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const g of layer.file.groups) {
    if (g.shaft_id === null) continue;
    const list = out.get(g.shaft_id);
    if (list) list.push(g.id);
    else out.set(g.shaft_id, [g.id]);
  }
  return out;
}

/**
 * Door-hosted devices whose `guards` is empty still exist on the door, now
 * checking nothing. That is a configuration error worth surfacing, not a
 * record to throw away.
 */
export function unguardedDevices(layer: VisualLayer): Device[] {
  return layer.file.devices.filter(
    (d) =>
      d.host_kind === "door" && d.host_id !== null && d.guards.length === 0,
  );
}
