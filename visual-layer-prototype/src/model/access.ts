/**
 * The access graph and the reachability search.
 *
 * Two graphs, kept apart:
 *   containment — a tree: floor > group (envelope) > room. Rendering, selection,
 *                 the drawer. Envelopes have no access role at all.
 *   access      — a graph over ROOMS. Every room is a node, every door is an
 *                 edge. Cycles are normal.
 */
import { must, type VisualLayer } from "./load";
import { EXTERIOR, type Device, type Door, type Room } from "./types";

/**
 * A door's room pair is not stored — except for a virtual door, which has no
 * wall to ask.
 */
export function roomsOf(layer: VisualLayer, door: Door): [string, string] {
  if (door.kind === "virtual") {
    if (door.rooms === null) {
      throw new Error(`virtual door without its room pair: ${door.id}`);
    }
    return door.rooms;
  }
  if (door.wall_id === null) {
    throw new Error(`${door.kind} door without a wall: ${door.id}`);
  }
  const w = must(layer.walls, door.wall_id, "wall");
  return [w.room_a, w.room_b];
}

/**
 * A room's type is its own, else the nearest ancestor envelope that defines
 * one. This inheritance is what makes room-level access workable: all four
 * bedrooms in a flat inherit `apartment` from the envelope, and a locker room
 * with its own reader sets `space_type` explicitly and overrides.
 */
export function accessType(layer: VisualLayer, room: Room): string | null {
  if (room.space_type) return room.space_type;
  let groupId = room.group_id;
  const guard = new Set<string>();
  while (groupId !== null && !guard.has(groupId)) {
    guard.add(groupId);
    const g = layer.groups.get(groupId);
    if (!g) return null;
    if (g.space_type) return g.space_type;
    groupId = g.parent_group_id;
  }
  return null;
}

export interface AccessEdge {
  door: Door;
  other: string;
}

export type Adjacency = Map<string, AccessEdge[]>;

/**
 * Built once per topology change. Nothing is dropped: the bedroom doors inside
 * a flat are real edges, they just carry no device, so they are traversed
 * freely. The difference from envelope-level traversal shows up only where a
 * device sits on an interior door — which is the case this model exists for.
 *
 * Vertical travel is not special: virtual doors sit in the same index.
 */
/**
 * A region of the floor nobody has said anything about: no category of its
 * own and no envelope to inherit one from.
 *
 * It is what is left when a space is unassigned or deleted — the walls have
 * to belong to something, because the floor is tiled, but there is no space
 * there as far as the building is concerned. So it is in neither panel, and
 * the access search does not walk it: checking whether somebody can reach
 * an area nobody has claimed answers a question nobody asked, and letting
 * a route pass through one would report access that no door grants.
 *
 * Derived rather than flagged. A hidden bedroom is not this — it still sits
 * in a flat — and a loose room given a category of its own is not either.
 */
export function isUnidentified(room: Room): boolean {
  return room.space_type === null && room.group_id === null;
}

export function buildAdjacency(layer: VisualLayer): Adjacency {
  const adj: Adjacency = new Map();
  const link = (from: string, door: Door, other: string) => {
    const list = adj.get(from);
    if (list) list.push({ door, other });
    else adj.set(from, [{ door, other }]);
  };

  const blank = new Set(
    layer.file.rooms.filter(isUnidentified).map((r) => r.id),
  );

  for (const door of layer.file.doors) {
    const [a, b] = roomsOf(layer, door);
    // A slit wall is a degenerate self-loop, not an access edge.
    if (a === b) continue;
    // A door onto an unclaimed area is not a way anywhere.
    if (blank.has(a) || blank.has(b)) continue;
    link(a, door, b);
    link(b, door, a);
  }
  return adj;
}

export interface Reachability {
  /** Rooms the profile can get to. */
  seen: Set<string>;
  /** room -> the door that got us there. Walk it backwards for the route. */
  via: Map<string, string | null>;
  /** room -> the door that refused us. This answers "why can't they get in". */
  blocked: Map<string, string>;
}

export interface ReachOptions {
  /**
   * Device ids the profile holds. A guarding device not in here refuses.
   * This is the model: access is per unit, and the only thing separating A1's
   * entrance from A2's is which reader it is.
   */
  allowedDevices?: ReadonlySet<string>;
  /**
   * An escape hatch for a blanket rule over a kind of space — "any technical
   * room", say. Not the access model: every flat is `space_type = "apartment"`,
   * so deciding by type alone would open all of them at once.
   */
  canEnter?: (accessType: string | null, room: Room) => boolean;
}

/**
 * Breadth-first over rooms. Four things carry the weight:
 *
 *  - `seen.has(there)` — buildings have loops. A block around a courtyard, or a
 *    ring hallway cut in two places. Not a tree.
 *  - no checks means free passage — the stated model: a door with no reader is
 *    open.
 *  - `there in device.guards` — only devices guarding the side being ENTERED.
 *    Walking the other way they do not apply: free egress, as in a real
 *    building.
 *  - `blocked` remembers which door refused, which is the question managers
 *    actually ask.
 */
export function reachable(
  layer: VisualLayer,
  start: string,
  options: ReachOptions = {},
  adjacency?: Adjacency,
): Reachability {
  const adj = adjacency ?? buildAdjacency(layer);
  const allowed = options.allowedDevices;

  const seen = new Set<string>([start]);
  const via = new Map<string, string | null>([[start, null]]);
  const blocked = new Map<string, string>();
  const queue: string[] = [start];

  const permits = (device: Device, there: string): boolean => {
    if (allowed && allowed.has(device.id)) return true;
    if (options.canEnter) {
      const room = layer.rooms.get(there);
      if (room) return options.canEnter(accessType(layer, room), room);
    }
    return false;
  };

  for (let head = 0; head < queue.length; head += 1) {
    const here = queue[head];
    for (const { door, other } of adj.get(here) ?? []) {
      if (seen.has(other)) continue;

      const guards = (layer.devicesOnDoor.get(door.id) ?? []).filter((d) =>
        d.guards.includes(other),
      );
      if (guards.length > 0 && !guards.some((d) => permits(d, other))) {
        blocked.set(other, door.id);
        continue; // and everything past it
      }

      seen.add(other);
      via.set(other, door.id);
      queue.push(other);
    }
  }

  return { seen, via, blocked };
}

/**
 * Three render states, and the distinction matters: rendering "blocked here"
 * and "never examined" the same grey leaves a manager with ten dim shapes and
 * no idea which one to fix.
 */
export type RoomAccessState = "reachable" | "blocked" | "unexamined";

export function roomAccessState(
  result: Reachability,
  roomId: string,
): RoomAccessState {
  if (result.seen.has(roomId)) return "reachable";
  if (result.blocked.has(roomId)) return "blocked";
  return "unexamined";
}

/** Walking `via` backwards explains an answer rather than asserting it. */
export function routeTo(
  layer: VisualLayer,
  result: Reachability,
  target: string,
): Door[] {
  const path: Door[] = [];
  let cur = target;
  const guard = new Set<string>();
  for (;;) {
    const doorId = result.via.get(cur);
    if (!doorId || guard.has(cur)) break;
    guard.add(cur);
    const door = must(layer.doors, doorId, "door");
    path.push(door);
    const [a, b] = roomsOf(layer, door);
    cur = b === cur ? a : b;
  }
  return path.reverse();
}

/**
 * Report at envelope level by default and expand to rooms on click. Being
 * blocked at a locker-room door inside a gym you can otherwise enter is a
 * different situation from being blocked at the gym entrance, and both show up
 * in the same result.
 */
export type GroupAccessState =
  | "accessible"
  | "partial"
  | "inaccessible"
  | "empty";

export function groupAccessState(
  layer: VisualLayer,
  result: Reachability,
  groupId: string,
): GroupAccessState {
  const rooms = roomsInGroup(layer, groupId);
  if (rooms.length === 0) return "empty";
  const reached = rooms.filter((r) => result.seen.has(r.id)).length;
  if (reached === 0) return "inaccessible";
  if (reached === rooms.length) return "accessible";
  return "partial";
}

/** Recursive — an envelope's rooms include its descendants'. */
export function roomsInGroup(layer: VisualLayer, groupId: string): Room[] {
  const direct = layer.file.rooms.filter((r) => r.group_id === groupId);
  const nested = (layer.childGroups.get(groupId) ?? []).flatMap((child) =>
    roomsInGroup(layer, child.id),
  );
  return [...direct, ...nested];
}

/** The building entrance: the lowest floor's circulation room. */
export function defaultStartRoom(layer: VisualLayer): string {
  const ground = layer.floors[0];
  const rooms = ground ? (layer.roomsByFloor.get(ground.id) ?? []) : [];
  const lobby = rooms.find((r) => accessType(layer, r) === "circulation");
  return lobby?.id ?? rooms[0]?.id ?? EXTERIOR;
}
