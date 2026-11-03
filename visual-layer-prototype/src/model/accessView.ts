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
import type { Room } from "./types";

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

/**
 * Where the walk starts: the space the building is entered through.
 *
 * Everything is measured from the front door, because that is where
 * somebody actually arrives. Starting anywhere else would answer a
 * question about a person who is already inside.
 */
function defaultEntrance(layer: VisualLayer): string | null {
  const ground = layer.floors[0];
  const rooms = ground ? (layer.roomsByFloor.get(ground.id) ?? []) : [];
  const lobby = rooms.find((r) => accessType(layer, r) === "circulation");
  return lobby?.id ?? rooms[0]?.id ?? null;
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

  const start = defaultEntrance(layer) ?? layer.file.rooms[0]?.id;
  if (!start) return out;

  const seen = reachable(layer, start, { allowedDevices: allowed }).seen;
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
