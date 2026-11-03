/**
 * Shafts: the stairwells and lift cores that link the floors, and what
 * happens to them when a room's category changes.
 *
 * A shaft is a `shaft_id` shared by one envelope on each storey, and the only
 * thing joining those storeys in the access graph is a chain of virtual
 * doors — no wall, just a connection. Nothing else crosses a floor, so a room
 * leaving its shaft is not a cosmetic change: it cuts the chain, and every
 * floor on the far side stops being reachable that way.
 *
 * Which is why assigning a category here is an operation with a warning
 * rather than a dropdown. The warning has to be true, so this computes what
 * actually breaks rather than saying something vague about structure.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { must, type VisualLayer } from "./load";
import type { Door, Group, VisualLayerFile } from "./types";

/** The categories that make a space part of the vertical circulation. */
export const SHAFT_TYPES: ReadonlySet<string> = new Set(["stairs", "elevator"]);

export function isShaftType(type: string | null | undefined): boolean {
  return type !== null && type !== undefined && SHAFT_TYPES.has(type);
}

/** The envelopes carrying one shaft, in storey order. */
export function shaftStoreys(layer: VisualLayer, shaftId: string): Group[] {
  const level = (g: Group) => layer.floors.find((f) => f.id === g.floor_id)?.level ?? 0;
  return layer.file.groups
    .filter((g) => g.shaft_id === shaftId)
    .sort((a, b) => level(a) - level(b));
}

/** The storeys a shaft reaches, in order. */
function memberLevels(layer: VisualLayer, shaftId: string): number[] {
  return shaftStoreys(layer, shaftId).map(
    (g) => layer.floors.find((f) => f.id === g.floor_id)?.level ?? 0,
  );
}

/**
 * The runs of consecutive storeys a shaft actually connects.
 *
 * Vertical doors pair **adjacent levels**, not adjacent entries in the list:
 * a door from level 1 straight to level 3 would let the access search walk
 * past a floor that is not in the shaft at all. So a shaft missing its
 * middle storey is not one shaft with a long step, it is two shafts.
 */
export function shaftRuns(layer: VisualLayer, shaftId: string): number[][] {
  const levels = memberLevels(layer, shaftId);
  const runs: number[][] = [];
  for (const level of levels) {
    const last = runs[runs.length - 1];
    if (last && level - last[last.length - 1] === 1) last.push(level);
    else runs.push([level]);
  }
  return runs;
}

/**
 * The virtual doors a shaft should have: one between each pair of members on
 * adjacent storeys. Regenerated rather than patched, so the chain can never
 * drift out of step with the membership.
 */
function verticalDoors(file: VisualLayerFile, layer: VisualLayer, shaftId: string): Door[] {
  const members = shaftStoreys(layer, shaftId);
  const levelOf = (g: Group) =>
    layer.floors.find((f) => f.id === g.floor_id)?.level ?? 0;
  const roomOf = (g: Group) => file.rooms.find((r) => r.group_id === g.id);

  const out: Door[] = [];
  for (let i = 0; i + 1 < members.length; i += 1) {
    const lower = members[i];
    const upper = members[i + 1];
    if (levelOf(upper) - levelOf(lower) !== 1) continue;
    const a = roomOf(lower);
    const b = roomOf(upper);
    if (!a || !b) continue;
    out.push({
      id: `vd:${shaftId}:${levelOf(lower)}-${levelOf(upper)}`,
      name: `${lower.name.toLowerCase()} ${levelOf(lower)}→${levelOf(upper)}`,
      kind: "virtual",
      wall_id: null,
      t: null,
      width: null,
      hinge: null,
      swing: null,
      rooms: [a.id, b.id],
    });
  }
  return out;
}

/** Whether a door is one of this shaft's vertical links. */
function isLinkOf(
  door: Door,
  shaftRoomIds: ReadonlySet<string>,
): boolean {
  if (door.kind !== "virtual" || !door.rooms) return false;
  return shaftRoomIds.has(door.rooms[0]) && shaftRoomIds.has(door.rooms[1]);
}

export interface ShaftImpact {
  shaftId: string;
  /** What the shaft is called, for the message — "Stairs", "Elevator". */
  name: string;
  /** Storeys it links now, and would link after. */
  before: number[][];
  after: number[][];
  /** Vertical links that would be dropped. */
  lostLinks: number;
  /** The storey the room being changed sits on. */
  level: number;
}

/**
 * What changing this room's category would do to the vertical circulation,
 * or null if it does nothing. Used to decide whether to ask, and to say what
 * is at stake in terms a manager can check against the building.
 */
export function shaftImpact(
  layer: VisualLayer,
  roomId: string,
  nextType: string | null,
): ShaftImpact | null {
  const room = layer.rooms.get(roomId);
  if (!room) return null;
  if (!isShaftType(room.space_type) || isShaftType(nextType)) return null;

  const group = room.group_id ? layer.groups.get(room.group_id) : undefined;
  const shaftId = group?.shaft_id;
  if (!group || !shaftId) return null;

  const level = layer.floors.find((f) => f.id === room.floor_id)?.level ?? 0;
  const before = shaftRuns(layer, shaftId);
  const after = splitRuns(before, level);

  return {
    shaftId,
    name: group.name,
    before,
    after,
    lostLinks: countLinks(before) - countLinks(after),
    level,
  };
}

function countLinks(runs: number[][]): number {
  return runs.reduce((acc, run) => acc + Math.max(0, run.length - 1), 0);
}

/** The runs that remain once one storey drops out of the shaft. */
function splitRuns(runs: number[][], level: number): number[][] {
  const out: number[][] = [];
  for (const run of runs) {
    const kept = run.filter((l) => l !== level);
    if (kept.length === 0) continue;
    // Removing a storey from the middle breaks the run in two.
    let current: number[] = [];
    for (const l of kept) {
      if (current.length === 0 || l - current[current.length - 1] === 1) {
        current.push(l);
      } else {
        out.push(current);
        current = [l];
      }
    }
    if (current.length) out.push(current);
  }
  return out;
}

/**
 * Assign a room's category.
 *
 * A room that stops being a stairwell or a lift leaves its shaft: the
 * envelope's `shaft_id` is cleared and the shaft's vertical doors are
 * regenerated from what is left. They are rebuilt rather than patched, so
 * the chain cannot drift out of step with the membership.
 *
 * Joining a shaft is not the mirror of this. Giving some room the stairs
 * category says what it is, not which stairwell it is part of, and there is
 * no answer to that in the data — a building can have several.
 */
export function setRoomSpaceType(
  state: EditState,
  roomId: string,
  nextType: string | null,
): EditState {
  const { layer, file } = state;
  const room = must(layer.rooms, roomId, "room");

  if (nextType !== null && !layer.spaceTypes.has(nextType)) {
    throw new OperationRejected(`There is no "${nextType}" category.`);
  }
  if (room.space_type === nextType) return state;

  const rooms = file.rooms.map((r) =>
    r.id === roomId ? { ...r, space_type: nextType } : r,
  );

  const impact = shaftImpact(layer, roomId, nextType);
  if (!impact) {
    return commit(state, "set_space_type", "Change category", { ...file, rooms });
  }

  // Out of the shaft: clear the envelope's id, then rebuild the links.
  const groups = file.groups.map((g) =>
    g.id === room.group_id ? { ...g, shaft_id: null } : g,
  );

  const shaftRoomIds = new Set(
    shaftStoreys(layer, impact.shaftId).flatMap((g) =>
      file.rooms.filter((r) => r.group_id === g.id).map((r) => r.id),
    ),
  );
  const kept = file.doors.filter((d) => !isLinkOf(d, shaftRoomIds));

  const next: VisualLayerFile = { ...file, rooms, groups, doors: kept };
  const rebuilt = verticalDoors(
    next,
    { ...layer, file: next, groups: new Map(groups.map((g) => [g.id, g])) },
    impact.shaftId,
  );

  return commit(state, "set_space_type", "Change category", {
    ...next,
    doors: [...kept, ...rebuilt],
  });
}
