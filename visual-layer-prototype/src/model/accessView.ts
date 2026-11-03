/**
 * Access mode: showing what a selection can reach.
 *
 * The question this mode answers is "who gets in where", and the model
 * already answers it — `reachable` walks the doors a set of devices
 * opens. What is added here is who holds which devices, and the two
 * rules that are about people rather than about doors.
 *
 * Nothing is stored. An access group is a profile read a different way,
 * and a person's reach is the union of the groups they are in.
 */
import groupsFile from "../fixtures/access_groups.json";
import { accessType, reachable } from "./access";
import type { VisualLayer } from "./load";
import { allPeople } from "./building";
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
export function devicesHeldBy(layer: VisualLayer, personId: string): string[] {
  const held = new Set<string>();

  const person = allPeople(layer).find((x) => x.id === personId);
  for (const id of person?.accessPoints ?? []) held.add(id);

  for (const group of GROUPS) {
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
export function accessShading(
  layer: VisualLayer,
  allowed: ReadonlySet<string>,
): Map<string, AccessShade> {
  const out = new Map<string, AccessShade>();
  if (allowed.size === 0) {
    for (const room of layer.file.rooms) out.set(room.id, "none");
    return out;
  }

  // The walk starts outside the building, not in the lobby.
  //
  // Starting inside would hand everybody the lobby for free, because a
  // walk always reaches where it begins — and the shop and gym staff do
  // not hold the entrance intercom. They come in through their own door
  // from the street and cannot get into the rest of the building, which
  // is only true on the plan if the street is where they start.
  const seen = reachable(layer, EXTERIOR, { allowedDevices: allowed }).seen;
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
