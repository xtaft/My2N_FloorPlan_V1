/**
 * Removing a wall — which is how two rooms become one.
 *
 * There is no standalone merge. The user's model ("take this wall out") and
 * the data operation are the same thing, which keeps the two from drifting
 * apart. Knocking a hole while keeping both spaces is a different intent and
 * a different operation: `state = "opening"`, not implemented here.
 *
 * Every refusal is checked before anything is written.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { indexVisualLayer, must, type VisualLayer } from "./load";
import { vertexOf } from "./geometry";
import { interiorRings, ringsOf, signedArea } from "./rings";
import { groupAccessType } from "./derive";
import {
  EXTERIOR,
  type Device,
  type Group,
  type Room,
  type VisualLayerFile,
  type Wall,
} from "./types";

/** Every wall with this pair of rooms on it, in either order. */
export function sharedWalls(
  layer: VisualLayer,
  aId: string,
  bId: string,
): Wall[] {
  return layer.file.walls.filter(
    (w) =>
      (w.room_a === aId && w.room_b === bId) ||
      (w.room_a === bId && w.room_b === aId),
  );
}

/**
 * Connected components of the shared-wall subgraph.
 *
 * One run merges cleanly. Two or more means the rooms touch in separate
 * places, and unless one encloses the other the region between those runs
 * would belong to nobody.
 */
export function wallRuns(walls: Wall[]): number {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const w of walls) {
    for (const v of [w.v1, w.v2]) if (!parent.has(v)) parent.set(v, v);
  }
  for (const w of walls) {
    const a = find(w.v1);
    const b = find(w.v2);
    if (a !== b) parent.set(a, b);
  }
  return new Set(walls.map((w) => find(w.v1))).size;
}

function areaOf(layer: VisualLayer, room: Room): number {
  return interiorRings(ringsOf(layer, room)).reduce(
    (acc, ring) => acc + Math.abs(signedArea(ring)),
    0,
  );
}

/**
 * Whether `outer` wraps `inner` completely — a lift core inside a car park.
 *
 * Rooms tile the plane here, so "every corner of the inner room is also a
 * corner of the outer one" says it: a room merely adjacent to another always
 * has corners of its own somewhere else. Merging these is valid and the
 * result simply loses a hole, which is why two runs do not condemn it.
 */
function encloses(layer: VisualLayer, outer: Room, inner: Room): boolean {
  const rings = interiorRings(ringsOf(layer, outer));
  if (rings.length < 2) return false;
  const corners = rings.flat();
  const near = (x: number, y: number) =>
    corners.some((c) => Math.abs(c.x - x) < 1e-6 && Math.abs(c.y - y) < 1e-6);
  return interiorRings(ringsOf(layer, inner))
    .flat()
    .every((v) => near(v.x, v.y));
}

/** Apartments outrank plain envelopes, which outrank being unassigned. */
function rank(layer: VisualLayer, groupId: string | null): number {
  if (!groupId) return 0;
  const group = layer.groups.get(groupId);
  if (!group) return 0;
  return groupAccessType(layer, group) === "apartment" ? 2 : 1;
}

export interface DeleteWallRequest {
  wallId: string;
  /**
   * Which room's name and type survive. Not inferable — a kitchen merged
   * with a dining room could reasonably be either — so the caller decides,
   * defaulting to the larger room.
   */
  keep?: string;
  name?: string;
  /** Explicit, because `null` is itself a meaningful choice (inherit). */
  spaceType?: string | null;
  /** Needed only when the two envelopes are of equal standing. */
  groupId?: string | null;
}

/**
 * Delete a wall, merging the rooms on either side of it.
 *
 * The five things this has to get right, all from the doc: every shared wall
 * goes and not just the clicked one, or a wall is left stranded mid-room;
 * doors on shared walls go while doors on retained walls stay; devices on
 * those doors are orphaned and never deleted, because a reader is a
 * provisioned physical asset; one name survives and the caller picks it; and
 * envelope membership resolves by type precedence.
 */
export function deleteWall(
  state: EditState,
  req: DeleteWallRequest,
): EditState {
  const { layer, file } = state;
  const wall = must(layer.walls, req.wallId, "wall");

  // A slit is a cut inside one room: taking it out merges nothing.
  if (wall.room_a === wall.room_b) {
    return removeWalls(state, [wall.id], "Remove wall");
  }

  if (wall.room_a === EXTERIOR || wall.room_b === EXTERIOR) {
    throw new OperationRejected(
      "That wall faces outside. Removing it would open the room to the exterior rather than merge it with anything.",
    );
  }

  const roomA = must(layer.rooms, wall.room_a, "room");
  const roomB = must(layer.rooms, wall.room_b, "room");

  const shared = sharedWalls(layer, roomA.id, roomB.id);
  if (
    wallRuns(shared) > 1 &&
    !encloses(layer, roomA, roomB) &&
    !encloses(layer, roomB, roomA)
  ) {
    throw new OperationRejected(
      `${roomA.name} and ${roomB.name} touch in two places — merging would leave a gap between them that belongs to neither.`,
    );
  }

  // --- who survives --------------------------------------------------------
  const keepId =
    req.keep ?? (areaOf(layer, roomA) >= areaOf(layer, roomB) ? roomA.id : roomB.id);
  if (keepId !== roomA.id && keepId !== roomB.id) {
    throw new OperationRejected(
      `${keepId} is not one of the two rooms this wall separates.`,
    );
  }
  const keep = keepId === roomA.id ? roomA : roomB;
  const gone = keepId === roomA.id ? roomB : roomA;

  // --- which envelope ------------------------------------------------------
  const rankKeep = rank(layer, keep.group_id);
  const rankGone = rank(layer, gone.group_id);
  let groupId: string | null;
  if (rankKeep !== rankGone) {
    groupId = rankKeep > rankGone ? keep.group_id : gone.group_id;
  } else if (keep.group_id === gone.group_id) {
    groupId = keep.group_id;
  } else if (req.groupId !== undefined) {
    if (req.groupId !== keep.group_id && req.groupId !== gone.group_id) {
      throw new OperationRejected(
        "The merged room has to stay in one of the two envelopes it came from.",
      );
    }
    groupId = req.groupId;
  } else {
    const nameOf = (id: string | null) =>
      (id && layer.groups.get(id)?.name) ?? "no envelope";
    throw new OperationRejected(
      `${nameOf(keep.group_id)} and ${nameOf(gone.group_id)} are of the same standing, so which one the merged room belongs to cannot be read off the data. Pick one.`,
    );
  }

  const next = applyRemoval(file, layer, {
    wallIds: shared.map((w) => w.id),
    keepId: keep.id,
    goneId: gone.id,
    name: req.name,
    spaceType: req.spaceType,
    groupId,
  });

  return commit(state, "delete_wall", "Remove wall", next);
}

/** Taking out a slit, which has no second room and so merges nothing. */
function removeWalls(
  state: EditState,
  wallIds: string[],
  label: string,
): EditState {
  const next = applyRemoval(state.file, state.layer, { wallIds });
  return commit(state, "delete_wall", label, next);
}

interface Removal {
  wallIds: string[];
  /** Absent for a slit, where no room disappears. */
  keepId?: string;
  goneId?: string;
  name?: string;
  spaceType?: string | null;
  groupId?: string | null;
}

function applyRemoval(
  file: VisualLayerFile,
  layer: VisualLayer,
  r: Removal,
): VisualLayerFile {
  const doomed = new Set(r.wallIds);

  // Doors in a wall that no longer exists go with it. Doors on the walls
  // that are kept must survive: a door from either room into the corridor is
  // still there after the merge.
  const lostDoors = new Set(
    file.doors.filter((d) => d.wall_id && doomed.has(d.wall_id)).map((d) => d.id),
  );

  const walls = file.walls
    .filter((w) => !doomed.has(w.id))
    .map((w) =>
      r.goneId && r.keepId
        ? {
            ...w,
            room_a: w.room_a === r.goneId ? r.keepId : w.room_a,
            room_b: w.room_b === r.goneId ? r.keepId : w.room_b,
          }
        : w,
    );

  let rooms = file.rooms.map((room) => ({
    ...room,
    walls: room.walls.filter((id) => !doomed.has(id)),
  }));

  if (r.keepId && r.goneId) {
    const goneRoom = rooms.find((x) => x.id === r.goneId)!;
    rooms = rooms
      .map((room) =>
        room.id === r.keepId
          ? {
              ...room,
              name: r.name ?? room.name,
              space_type:
                r.spaceType !== undefined ? r.spaceType : room.space_type,
              group_id: r.groupId ?? null,
              walls: [...new Set([...room.walls, ...goneRoom.walls])],
            }
          : room,
      )
      .filter((room) => room.id !== r.goneId);
  }

  const devices: Device[] = file.devices.map((d) => {
    // Orphaned, never deleted: host_id null puts it in the unplaced list,
    // where a manager can re-place a reader that is still on the wall.
    if (d.host_kind === "door" && d.host_id && lostDoors.has(d.host_id)) {
      return { ...d, host_id: null, guards: [] };
    }
    if (r.keepId && r.goneId) {
      const host =
        d.host_kind === "room" && d.host_id === r.goneId ? r.keepId : d.host_id;
      const guards = d.guards.includes(r.goneId)
        ? [...new Set(d.guards.map((g) => (g === r.goneId ? r.keepId! : g)))]
        : d.guards;
      if (host !== d.host_id || guards !== d.guards) {
        return { ...d, host_id: host, guards };
      }
    }
    return d;
  });

  let next: VisualLayerFile = {
    ...file,
    walls,
    rooms,
    doors: file.doors.filter((d) => !lostDoors.has(d.id)),
    devices,
    unplaced_devices: devices.filter((d) => d.host_id === null).map((d) => d.id),
  };

  // An envelope left holding nothing goes too. Its domain_ref goes with it;
  // the undo entry is the whole file, so the binding comes back intact.
  next = { ...next, groups: pruneEmptyGroups(next) };

  return dissolveCollinear(
    next,
    r.wallIds.flatMap((id) => {
      const w = layer.walls.get(id);
      return w ? [w.v1, w.v2] : [];
    }),
  );
}

function pruneEmptyGroups(file: VisualLayerFile): Group[] {
  const used = new Set(file.rooms.map((r) => r.group_id).filter(Boolean));
  const hasChild = new Set(
    file.groups.map((g) => g.parent_group_id).filter(Boolean),
  );
  return file.groups.filter((g) => used.has(g.id) || hasChild.has(g.id));
}

/**
 * Collinear dissolve over the vertices an operation disturbed.
 *
 * Without it wall counts only grow: merge four flats and each outer face
 * carries a dozen collinear fragments, hover highlights break into pieces,
 * and "how many walls does this room have" stops meaning anything.
 *
 * A degree-2 collinear vertex whose walls have different room pairs is a
 * real junction and stays — dissolving it would silently reassign ownership.
 * A wall carrying a door is left alone too: joining it to its neighbour would
 * rescale the door's `t` for no gain, and that rescaling is lossy.
 */
export function dissolveCollinear(
  file: VisualLayerFile,
  vertexIds: string[],
): VisualLayerFile {
  let out = file;

  for (const vid of new Set(vertexIds)) {
    const layer = indexVisualLayer(out);
    if (!layer.vertices.has(vid)) continue;

    const incident = out.walls.filter((w) => w.v1 === vid || w.v2 === vid);
    if (incident.length !== 2) continue;

    const [w1, w2] = incident;
    if (w1.state !== w2.state) continue;
    if (w1.room_a !== w2.room_a || w1.room_b !== w2.room_b) continue;
    if (out.doors.some((d) => d.wall_id === w1.id || d.wall_id === w2.id)) {
      continue;
    }

    // The two have to form a continuous directed path through the vertex, so
    // that the merged wall keeps one sense of travel and its sides with it.
    let from: string;
    let to: string;
    if (w1.v2 === vid && w2.v1 === vid) {
      from = w1.v1;
      to = w2.v2;
    } else if (w1.v1 === vid && w2.v2 === vid) {
      from = w2.v1;
      to = w1.v2;
    } else {
      continue;
    }

    const a = vertexOf(layer, from);
    const b = vertexOf(layer, to);
    const m = vertexOf(layer, vid);
    const cross =
      (m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x);
    const scale = Math.hypot(b.x - a.x, b.y - a.y);
    if (scale === 0 || Math.abs(cross) / scale > 1e-6) continue;

    const merged: Wall = { ...w1, v1: from, v2: to };
    out = {
      ...out,
      vertices: out.vertices.filter((v) => v.id !== vid),
      walls: out.walls
        .filter((w) => w.id !== w2.id)
        .map((w) => (w.id === w1.id ? merged : w)),
      rooms: out.rooms.map((room) =>
        room.walls.includes(w1.id) || room.walls.includes(w2.id)
          ? {
              ...room,
              walls: [
                ...new Set(
                  room.walls.filter((id) => id !== w2.id).concat(w1.id),
                ),
              ],
            }
          : room,
      ),
    };
  }

  return out;
}

/** A preview of the merge a click would make, or the reason it would fail. */
export function previewDeleteWall(
  state: EditState,
  req: DeleteWallRequest,
): { ok: true; walls: number } | { ok: false; reason: string } {
  try {
    const wall = state.layer.walls.get(req.wallId);
    const count =
      wall && wall.room_a !== wall.room_b
        ? sharedWalls(state.layer, wall.room_a, wall.room_b).length
        : 1;
    deleteWall(state, req);
    return { ok: true, walls: count };
  } catch (e) {
    if (e instanceof OperationRejected) return { ok: false, reason: e.message };
    throw e;
  }
}
