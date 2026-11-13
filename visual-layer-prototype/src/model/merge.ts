/**
 * Removing a wall — which is how two rooms become one.
 *
 * There is no standalone merge. The user's model ("take this wall out") and
 * the data operation are the same thing, which keeps the two from drifting
 * apart. Knocking a hole while keeping both spaces is a different intent and
 * a different operation: `state = "opening"`, not implemented here.
 *
 * Exactly the wall that was clicked goes, and no other. Where the two rooms
 * shared more than one wall, the rest stay standing inside the merged room
 * as slits — the same room on both sides — which is what actually happens
 * when a section of wall is taken out of a flat. The doc calls for every
 * shared wall to go at once; that loses standing masonry nobody asked about,
 * and the slit it leaves instead is a shape the model already describes.
 *
 * What that does not change is the doc's void rejection. Two rooms that wrap
 * around a third still close a loop around it once they are one room, and
 * an even-odd fill then paints that third room as part of the merged one
 * while it carries on existing. The check for it is the outcome itself —
 * build the merge, then see whether it swallowed a neighbour — rather than
 * the number of runs, which only approximates the question.
 *
 * Every refusal is checked before anything is written.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { indexVisualLayer, must, type VisualLayer } from "./load";
import { vertexOf } from "./geometry";
import { insideRings, interiorRings, labelPoint, ringsOf } from "./rings";
import { groupAccessType } from "./derive";
import {
  EXTERIOR,
  type Device,
  type Group,
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
   * Which room's name and type survive. Not inferable from the shapes — a
   * kitchen merged with a dining room could reasonably be either — so it
   * falls to the wall's own orientation: `room_b`, the side on the right
   * walking v1 to v2. The caller can say otherwise.
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
 * What this has to get right: only the clicked wall goes, and any other wall
 * the two rooms shared stays as a slit; doors on retained walls survive,
 * while a door whose two sides have become one room cannot and goes with it;
 * devices on those doors are orphaned and never deleted, because a reader is
 * a provisioned physical asset; one name survives; and envelope membership
 * resolves by type precedence, with the right-hand side breaking a tie.
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

  // --- who survives --------------------------------------------------------
  // room_b is the side on the right walking v1 to v2, which is the one the
  // wall itself nominates. Rooms touching in more than one place need no
  // special case now that only the clicked wall goes: the other runs stay
  // standing, so there is no region left over between them.
  const keepId = req.keep ?? roomB.id;
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
  if (req.groupId !== undefined) {
    if (req.groupId !== keep.group_id && req.groupId !== gone.group_id) {
      throw new OperationRejected(
        "The merged room has to stay in one of the two envelopes it came from.",
      );
    }
    groupId = req.groupId;
  } else if (rankKeep !== rankGone) {
    // An apartment still beats a plain envelope whichever side it is on:
    // merging a flat into a hallway must not quietly un-flat it.
    groupId = rankKeep > rankGone ? keep.group_id : gone.group_id;
  } else {
    // Two envelopes of the same standing, or the same one twice: the
    // surviving room's, which is the one on the right of the wall.
    groupId = keep.group_id;
  }

  const next = applyRemoval(file, layer, {
    wallIds: [wall.id],
    keepId: keep.id,
    goneId: gone.id,
    name: req.name,
    spaceType: req.spaceType,
    groupId,
  });

  const swallowed = roomSwallowedBy(next, keep.id);
  if (swallowed) {
    throw new OperationRejected(
      `${roomA.name} and ${roomB.name} wrap around ${swallowed}, so merging them would close it inside the new room while it is still a space of its own.`,
    );
  }

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

  /**
   * Any other wall the two rooms shared now has the survivor on both sides:
   * a slit. The wall itself stays — it is still standing — but a door in it
   * cannot, because a slit has no two sides for a door to open between.
   */
  const slit = new Set<string>();
  if (r.keepId && r.goneId) {
    for (const w of file.walls) {
      if (doomed.has(w.id) || w.room_a === w.room_b) continue;
      const a = w.room_a === r.goneId ? r.keepId : w.room_a;
      const b = w.room_b === r.goneId ? r.keepId : w.room_b;
      if (a === b) slit.add(w.id);
    }
  }

  // Doors in a wall that no longer exists go with it, and so do doors left
  // straddling nothing. Doors on retained walls survive: a door from either
  // room into the corridor is still there after the merge.
  const lostDoors = new Set(
    file.doors
      .filter((d) => d.wall_id && (doomed.has(d.wall_id) || slit.has(d.wall_id)))
      .map((d) => d.id),
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

/**
 * A room that ends up inside the merged one without being part of it.
 *
 * Only a neighbour can be swallowed: whatever closes around it is made of
 * the merged room's own walls. Testing the outcome is exact where counting
 * runs is a proxy — and cheap, since the candidates are one room's
 * neighbours rather than the floor.
 */
function roomSwallowedBy(
  file: VisualLayerFile,
  survivorId: string,
): string | null {
  const layer = indexVisualLayer(file);
  const survivor = layer.rooms.get(survivorId);
  if (!survivor) return null;

  const rings = interiorRings(ringsOf(layer, survivor));
  if (rings.length < 2) return null; // one ring cannot enclose anything else

  const neighbours = new Set<string>();
  for (const id of survivor.walls) {
    const w = layer.walls.get(id);
    if (!w) continue;
    for (const side of [w.room_a, w.room_b]) {
      if (side !== survivorId && side !== EXTERIOR) neighbours.add(side);
    }
  }

  for (const id of neighbours) {
    const room = layer.rooms.get(id);
    if (!room) continue;
    const pt = labelPoint(interiorRings(ringsOf(layer, room)));
    if (pt && insideRings(pt, rings)) return room.name;
  }
  return null;
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
): { ok: true } | { ok: false; reason: string } {
  try {
    deleteWall(state, req);
    return { ok: true };
  } catch (e) {
    if (e instanceof OperationRejected) return { ok: false, reason: e.message };
    throw e;
  }
}
