/**
 * Access mode: showing what a selection can reach.
 *
 * The question this mode answers is "who gets in where", and the model
 * already answers it — `reachable` walks the doors a set of devices
 * opens. What is added here is who holds which devices, and the two
 * rules that are about people rather than about doors.
 *
 * The groups are stored — who is in which is a fact about the building
 * that nothing could derive — and they are state the screens hold and
 * hand down, seeded from the building's data. A person's reach is the
 * union of the groups they are in, read fresh from whatever the groups
 * are now.
 */
import groupsFile from "../fixtures/access_groups.json";
import { accessType, buildAdjacency, reachable } from "./access";
import type { VisualLayer } from "./load";
import { allPeople } from "./building";
import { OperationRejected } from "./edit";
import { EXTERIOR, type Room } from "./types";

/** A permission set, as the building's data defines it. */
export interface AccessGroup {
  id: string;
  name: string;
  devices: string[];
  people: string[];
}

interface GroupRecord {
  id: string;
  name: string;
  devices: string[];
  people: string[];
}

const GROUPS = (groupsFile as { access_groups: GroupRecord[] }).access_groups;

/**
 * The building's access groups.
 *
 * Read, not derived. An earlier version of this built thirty-two
 * "groups" out of the access profiles and named them after the rooms
 * their devices guarded — which was a per-apartment permission set
 * dressed up as a group. There are four: Maintenance, the two
 * commercial units, and the gym.
 */
export function accessGroups(): AccessGroup[] {
  return GROUPS.map((g) => ({
    id: g.id,
    name: g.name,
    devices: [...g.devices],
    people: [...g.people],
  }));
}

/**
 * Everything a person can open.
 *
 * Two sources, and the data states both: the devices they hold in their
 * own right — their flat's door and the entrance intercom — and the
 * devices of every group they are in.
 *
 * The personal half used to be derived here, by finding the devices
 * guarding somebody's flat and adding them. That was wrong in a way
 * worth keeping a note of: four flats have no entrance door yet, so
 * their residents hold the intercom and nothing else, and the data says
 * so. Deriving it would have granted a key to a door that is not there.
 */
export function devicesHeldBy(
  layer: VisualLayer,
  personId: string,
  groups: readonly AccessGroup[] = GROUPS,
): string[] {
  const held = new Set<string>();

  const person = allPeople(layer).find((x) => x.id === personId);
  for (const id of person?.accessPoints ?? []) held.add(id);

  for (const group of groups) {
    if (!group.people.includes(personId)) continue;
    for (const id of group.devices) held.add(id);
  }

  return [...held];
}

/** How a space is drawn in access mode. */
export type AccessShade = "none" | "open" | "closed";

/**
 * Which spaces a set of devices gets you into.
 *
 * With nothing selected there is no question being asked, so nothing is
 * answered — every space reads the same and the plan is grey. With a
 * selection, the walk from the entrance says which spaces are behind a
 * door it opens and which are not, and every space is one or the other.
 */
/**
 * Which question is being asked.
 *
 * A **person** is checked from the street: can this human, carrying
 * what they carry, get from the pavement to here? Everything they pass
 * through on the way is theirs, shared spaces included.
 *
 * A **group or a set of devices** is a different question — not about
 * anybody's journey but about what these devices open. So the answer
 * starts at each device's own door and goes further *in*. It does not
 * hand you the space you were standing in to use the device: the
 * technical room's reader opens the technical room, and the lobby on
 * the other side of that door is where you already were, not something
 * the reader grants.
 */
export type AccessFrom = "outside" | "devices";

export function accessShading(
  layer: VisualLayer,
  allowed: ReadonlySet<string>,
  from: AccessFrom = "outside",
): Map<string, AccessShade> {
  const out = new Map<string, AccessShade>();
  if (allowed.size === 0) {
    for (const room of layer.file.rooms) out.set(room.id, "none");
    return out;
  }

  const seen =
    from === "outside"
      ? reachable(layer, EXTERIOR, { allowedDevices: allowed }).seen
      : beyondTheDevices(layer, allowed);

  for (const room of layer.file.rooms) {
    out.set(room.id, seen.has(room.id) ? "open" : "closed");
  }
  return out;
}

/** The colours access mode paints with. */
export const ACCESS_COLORS: Record<AccessShade, string | null> = {
  // No question asked, so no answer drawn.
  none: "#C9CDD2",
  open: "#7FC49A",
  closed: "#E0A3A3",
};

/** What to fill a room with, for the canvas's `paint`. */
export function accessPaint(
  shading: Map<string, AccessShade>,
): (room: Room) => string | null {
  return (room) => ACCESS_COLORS[shading.get(room.id) ?? "none"];
}

/** Whether this door lets you into `into` with what is held. */
function admits(
  layer: VisualLayer,
  doorId: string,
  into: string,
  allowed: ReadonlySet<string>,
): boolean {
  const guards = (layer.devicesOnDoor.get(doorId) ?? []).filter((d) =>
    d.guards.includes(into),
  );
  if (guards.length === 0) return true;
  return guards.some((d) => allowed.has(d.id));
}

/**
 * What a set of devices opens, and what lies beyond it.
 *
 * Each device admits you to the room it guards; from there the walk
 * carries on through whatever else is unlocked, and stops at any door
 * asking for something not held.
 *
 * It never goes back out through the device's own door. That door is
 * how you arrived, so the room on its far side is where you were
 * standing — not somewhere the device let you in to. Without this the
 * technical room's reader would hand you the lobby, and through the
 * lobby every shared space in the building, which is the opposite of
 * what a reader on an inside door means.
 */
function beyondTheDevices(
  layer: VisualLayer,
  allowed: ReadonlySet<string>,
): Set<string> {
  const adjacency = buildAdjacency(layer);
  const open = new Set<string>();

  for (const device of layer.file.devices) {
    if (!allowed.has(device.id)) continue;
    if (device.host_kind !== "door" || device.host_id === null) continue;
    const arrivedBy = device.host_id;

    for (const start of device.guards) {
      const queue = [start];
      open.add(start);
      for (let head = 0; head < queue.length; head += 1) {
        for (const { door, other } of adjacency.get(queue[head]) ?? []) {
          if (door.id === arrivedBy) continue; // the way you came in
          if (other === EXTERIOR || open.has(other)) continue;
          if (!admits(layer, door.id, other, allowed)) continue;
          open.add(other);
          queue.push(other);
        }
      }
    }
  }

  return open;
}

/**
 * Where in the building a selection gets you, for the tree.
 *
 * The map shows one storey, so it cannot answer "everywhere in the
 * building" — a key that opens every hallway looks the same on each
 * floor as a key that opens one. The tree can answer it, with a mark on
 * every row the selection reaches.
 *
 * Circulation, stairs and lifts are left out on purpose. They are not
 * guarded, so they light up for anybody holding anything, and marking
 * them would put a badge on every floor of the building and say
 * nothing. What is worth knowing is which *rooms* somebody gets into —
 * a flat, a shop, the technical room — so a floor is marked when it
 * holds one of those.
 */
export interface AccessBadges {
  rooms: Set<string>;
  groups: Set<string>;
  floors: Set<string>;
}

const NOT_WORTH_MARKING = new Set(["circulation", "stairs", "elevator"]);

export function accessBadges(
  layer: VisualLayer,
  shading: Map<string, AccessShade> | null,
): AccessBadges {
  const out: AccessBadges = {
    rooms: new Set(),
    groups: new Set(),
    floors: new Set(),
  };
  if (!shading) return out;

  for (const room of layer.file.rooms) {
    if (shading.get(room.id) !== "open") continue;
    const type = accessType(layer, room);
    if (type !== null && NOT_WORTH_MARKING.has(type)) continue;

    out.rooms.add(room.id);
    out.floors.add(room.floor_id);
    // Every envelope it sits in, so a flat is marked by its rooms and
    // a building-level group by whatever is inside it.
    let groupId = room.group_id;
    while (groupId) {
      out.groups.add(groupId);
      groupId = layer.groups.get(groupId)?.parent_group_id ?? null;
    }
  }

  return out;
}

// ------------------------------------------------------------ membership

/** The groups a person is in. */
export function groupsOf(
  groups: readonly AccessGroup[],
  personId: string,
): AccessGroup[] {
  return groups.filter((g) => g.people.includes(personId));
}

/**
 * Put a person in a group. From then on they hold its devices, which
 * is the whole of what being in a group means here — the next look at
 * where they can get already shows it.
 */
export function addPersonToGroup(
  groups: readonly AccessGroup[],
  groupId: string,
  personId: string,
): AccessGroup[] {
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new OperationRejected(`There is no group "${groupId}".`);
  if (group.people.includes(personId)) {
    throw new OperationRejected(`They are already in ${group.name}.`);
  }
  return groups.map((g) =>
    g.id === groupId ? { ...g, people: [...g.people, personId] } : g,
  );
}

/** Take a person out of a group. Its devices go with it. */
export function removePersonFromGroup(
  groups: readonly AccessGroup[],
  groupId: string,
  personId: string,
): AccessGroup[] {
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new OperationRejected(`There is no group "${groupId}".`);
  if (!group.people.includes(personId)) {
    throw new OperationRejected(`They are not in ${group.name}.`);
  }
  return groups.map((g) =>
    g.id === groupId
      ? { ...g, people: g.people.filter((x) => x !== personId) }
      : g,
  );
}
