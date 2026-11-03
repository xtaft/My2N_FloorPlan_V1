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
import { accessType, reachable, roomsInGroup } from "./access";
import type { VisualLayer } from "./load";
import { residents } from "./building";
import type { Room } from "./types";

/** A permission set, as the access panel lists it. */
export interface AccessGroup {
  id: string;
  name: string;
  devices: string[];
  people: string[];
}

/**
 * The building's access groups.
 *
 * A profile is already "a set of devices and the people who hold them",
 * which is what an access group is — so this renames rather than
 * invents. The name is derived from what the group admits to, because
 * "P17" tells nobody anything and the thing a manager is looking for is
 * the group that opens a particular door.
 */
export function accessGroups(layer: VisualLayer): AccessGroup[] {
  return layer.profiles
    .map((profile) => ({
      id: profile.id,
      name: groupName(layer, profile.rooms),
      devices: [...profile.devices],
      people: [...profile.people],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function groupName(layer: VisualLayer, rooms: string[]): string {
  // The rooms a profile lists are the ones its devices guard. The last
  // is the one it is really for: resident profiles read [lobby, flat],
  // and the flat is what distinguishes one from another.
  for (const id of [...rooms].reverse()) {
    const room = layer.rooms.get(id);
    if (!room) continue;
    const group = room.group_id ? layer.groups.get(room.group_id) : undefined;
    const where = group?.name ?? room.name;
    return accessType(layer, room) === "apartment"
      ? `${where} residents`
      : `${where} access`;
  }
  return "Access group";
}

/**
 * The way in that everybody has.
 *
 * Somebody who cannot get through the front door holds a key to nothing,
 * so the main entrance is not something a resident's group has to grant.
 * It is found rather than named: the devices guarding the space the
 * building is entered through.
 */
export function mainEntranceDevices(layer: VisualLayer): string[] {
  const lobby = defaultEntrance(layer);
  if (!lobby) return [];
  return layer.file.devices
    .filter((d) => d.host_kind === "door" && d.guards.includes(lobby))
    .map((d) => d.id);
}

function defaultEntrance(layer: VisualLayer): string | null {
  const ground = layer.floors[0];
  const rooms = ground ? (layer.roomsByFloor.get(ground.id) ?? []) : [];
  const lobby = rooms.find((r) => accessType(layer, r) === "circulation");
  return lobby?.id ?? rooms[0]?.id ?? null;
}

/** The devices guarding any room of an envelope — the way into a flat. */
export function devicesIntoGroup(layer: VisualLayer, groupId: string): string[] {
  const inside = new Set(roomsInGroup(layer, groupId).map((r) => r.id));
  return layer.file.devices
    .filter(
      (d) => d.host_kind === "door" && d.guards.some((g) => inside.has(g)),
    )
    .map((d) => d.id);
}

/**
 * Everything a person can open.
 *
 * Their groups, and then the two things a resident has regardless: their
 * own front door and the building's. Neither is a group they were added
 * to — a resident who was left out of one would still be able to go
 * home, and showing them locked out of their own flat would be a lie
 * about the building rather than a finding about the data.
 */
export function devicesHeldBy(layer: VisualLayer, personId: string): string[] {
  const held = new Set<string>();
  for (const profile of layer.profiles) {
    if (!profile.people.includes(personId)) continue;
    for (const id of profile.devices) held.add(id);
  }

  const home = residents(layer).find((r) => r.id === personId);
  if (home) {
    for (const id of devicesIntoGroup(layer, home.apartment_id)) held.add(id);
    for (const id of mainEntranceDevices(layer)) held.add(id);
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
