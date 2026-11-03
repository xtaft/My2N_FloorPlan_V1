/**
 * The rest of the "What is deliberately absent" table: everything a consumer
 * might reach for that the fixture refuses to store.
 */
import { must, topGroups, type VisualLayer } from "./load";
import { accessType, roomsInGroup, roomsOf } from "./access";
import { add, doorGeometry, negate, normal, unit } from "./geometry";
import {
  EXTERIOR,
  type Device,
  type Door,
  type Group,
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

/**
 * The envelopes to show directly under a floor.
 *
 * Every floor in this fixture wraps its envelopes in a single top-level group
 * — `0:floorgroup`, named "Floor 0" — that holds no rooms of its own. Drawing
 * it puts a second floor row underneath the first, naming the same floor
 * twice. It is a pass-through, so its children take its place.
 *
 * The test is whether the group holds rooms, not what it is called: a
 * top-level group that does own rooms is a real envelope and stays.
 */
export function floorEnvelopes(layer: VisualLayer, floorId: string): Group[] {
  const out: Group[] = [];
  for (const group of topGroups(layer, floorId)) {
    const holdsRooms = layer.file.rooms.some((r) => r.group_id === group.id);
    const children = layer.childGroups.get(group.id) ?? [];
    if (!holdsRooms && children.length > 0) out.push(...children);
    else out.push(group);
  }
  return out;
}

/**
 * An envelope's type, by the same inheritance rule rooms use: its own, else
 * the nearest ancestor that defines one.
 */
/**
 * Whether a list — the tree, the categories drawer — names this room, and
 * whether the map treats it as a thing of its own.
 *
 * It is exactly `surfaced`, and deliberately nothing more. Which rooms start
 * out visible is a question for the data, not for a rule here: a flat's rooms
 * arrive unsurfaced so the apartment is what the lists show, and every other
 * envelope's rooms arrive surfaced. Deciding it here instead would mean
 * `surfaced = false` had two different meanings — "this type is folded by
 * default" and "someone hid this one" — and Hide room could never take a
 * locker room out of the tree.
 */
export function isRoomListed(_layer: VisualLayer, room: Room): boolean {
  return room.surfaced;
}

/**
 * What a hover on this room should light up.
 *
 * While a flat's rooms are folded away the flat is the thing on the map, so
 * pointing anywhere inside it highlights the whole envelope. Surface one room
 * and it becomes its own target and highlights alone — the map follows the
 * lists.
 */
export function highlightTargets(layer: VisualLayer, roomId: string): string[] {
  const room = layer.rooms.get(roomId);
  if (!room) return [];
  if (isRoomListed(layer, room)) return [room.id];
  if (!room.group_id) return [room.id];
  return roomsInGroup(layer, room.group_id).map((r) => r.id);
}

/**
 * The single room an envelope amounts to, if that is all it is.
 *
 * A stairwell, a lift car, a lobby, a hallway, the technical room: each is an
 * envelope holding exactly one room of the same name, so listing both puts a
 * row inside an identical row. Where that is the shape, the room stands in
 * for the envelope and the level disappears.
 *
 * An envelope with two rooms (a shop and its storage) or with child envelopes
 * (the gym) is not this, and keeps its level — there the grouping says
 * something the rooms do not.
 */
export function passThroughRoom(
  layer: VisualLayer,
  group: Group,
): Room | null {
  if ((layer.childGroups.get(group.id) ?? []).length > 0) return null;
  const rooms = layer.file.rooms.filter((r) => r.group_id === group.id);
  return rooms.length === 1 ? rooms[0] : null;
}

/**
 * The rooms folded away inside an envelope, descendants included.
 *
 * A hidden room is not in any list and cannot be clicked, so the envelope
 * that contains it is how it is reached: this is what the envelope's menu
 * offers to show.
 */
export function hiddenRoomsIn(layer: VisualLayer, groupId: string): Room[] {
  return roomsInGroup(layer, groupId).filter((r) => !isRoomListed(layer, r));
}

export function groupAccessType(
  layer: VisualLayer,
  group: Group,
): string | null {
  let g: Group | undefined = group;
  const guard = new Set<string>();
  while (g && !guard.has(g.id)) {
    guard.add(g.id);
    if (g.space_type) return g.space_type;
    g = g.parent_group_id ? layer.groups.get(g.parent_group_id) : undefined;
  }
  return null;
}

/** Every top-level envelope in the building, floor by floor. */
export function allEnvelopes(layer: VisualLayer): Group[] {
  return layer.floors.flatMap((f) => floorEnvelopes(layer, f.id));
}

export interface SpaceCategory {
  /** A space type id, or null for the unbound bucket. */
  id: string | null;
  name: string;
  color: string;
  /** The envelopes of this type — apartments, not their rooms. */
  groups: Group[];
}

const UNBOUND_COLOR = "#DADDE1";

/**
 * The categories panel, grouped by ENVELOPE rather than by room.
 *
 * A category counts the apartments in it, not the bedrooms: "Apartments (28)"
 * is the number a manager thinks in, and the rooms appear a level further in.
 * Grouping this way also drops the room-level types out of the top level on
 * its own — `locker_room` and `room` are overrides set on rooms inside the
 * gym, so they show under Gym where they belong rather than as categories of
 * their own.
 *
 * A type with no envelopes still lists: an empty category is a real state,
 * and so is the unbound bucket, which is why it is always present.
 */
export function spaceCategories(layer: VisualLayer): SpaceCategory[] {
  const envelopes = allEnvelopes(layer);
  const byType = new Map<string | null, Group[]>();
  for (const g of envelopes) {
    const key = groupAccessType(layer, g);
    const list = byType.get(key);
    if (list) list.push(g);
    else byType.set(key, [g]);
  }

  const out: SpaceCategory[] = layer.file.space_types
    .filter((t) => (byType.get(t.id) ?? []).length > 0)
    .map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      groups: byType.get(t.id) ?? [],
    }));

  // Unbound is a valid state a manager must resolve, so the bucket is always
  // shown — at zero it says there is nothing to resolve.
  out.push({
    id: null,
    name: "Unknown",
    color: UNBOUND_COLOR,
    groups: byType.get(null) ?? [],
  });
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
 * Which side of its door a device hangs on. Derived from `guards`, never
 * stored: a stored side would go stale the moment a wall's room pair changed.
 *
 * A reader is mounted on the side you verify access FROM, which is the side
 * it does not guard. Guarding `room_a` means you stand in `room_b` and
 * present your card to get in, so the reader is on the `room_b` face. A
 * reader inside the room it protects would protect nothing.
 */
export function deviceSide(
  layer: VisualLayer,
  device: Device,
): "a" | "b" | null {
  if (device.host_kind !== "door" || device.host_id === null) return null;
  const door = layer.doors.get(device.host_id);
  if (!door) return null;
  const [a] = roomsOf(layer, door);
  return device.guards.includes(a) ? "b" : "a";
}

/** How far off the wall a reader glyph sits, in canvas units. */
export const DEVICE_OFFSET = 16;

/**
 * Where to draw a device.
 *
 * A room-hosted device carries its own position. A door-hosted one is placed
 * off the door, on the side `deviceSide` puts it — the side access is
 * verified from, which is the one it does not guard.
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
