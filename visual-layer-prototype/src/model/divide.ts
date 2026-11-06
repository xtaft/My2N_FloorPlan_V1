/**
 * Dividing a room by drawing a wall across it — the doc's `split_wall`
 * primitive and the boundary walk built on top of it.
 *
 * Separate from `edit.ts` because it is the only operation here that makes
 * new geometry: everything else edits records that already exist. Every
 * refusal is checked before anything is written.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { indexVisualLayer, must, type VisualLayer } from "./load";
import { dist, doorSpan, lerp, vertexOf, wallEnds } from "./geometry";
import { faceWalks, interiorRings, ringsOf, signedArea } from "./rings";
import type {
  Door,
  Point,
  Room,
  Vertex,
  VisualLayerFile,
  Wall,
} from "./types";

/**
 * Where a cut would meet one of a room's walls.
 *
 * Unlike `nearestWall`, which looks across the floor, this is restricted to
 * the room being divided: the refusal is that both endpoints land on walls
 * *of that room*, and the nearest wall on the floor is routinely a
 * neighbour's.
 */
export function nearestWallInRoom(
  layer: VisualLayer,
  room: Room,
  point: Point,
  maxDistance = 40,
): { wallId: string; t: number; at: Point; distance: number } | null {
  let best: { wallId: string; t: number; at: Point; distance: number } | null =
    null;

  for (const wallId of room.walls) {
    const wall = layer.walls.get(wallId);
    if (!wall) continue;
    const [a, b] = wallEnds(layer, wall);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;

    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const at = lerp(a, b, t);
    const distance = dist(point, at);
    if (distance > maxDistance) continue;
    if (best && distance >= best.distance) continue;
    best = { wallId, t, at, distance };
  }
  return best;
}

/** Strict crossing: segments that merely touch at an end do not count. */
export function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const side = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = side(p3, p4, p1);
  const d2 = side(p3, p4, p2);
  const d3 = side(p1, p2, p3);
  const d4 = side(p1, p2, p4);
  const EPS = 1e-9;
  if (Math.abs(d1) < EPS || Math.abs(d2) < EPS) return false;
  if (Math.abs(d3) < EPS || Math.abs(d4) < EPS) return false;
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Ids keep their floor prefix, so a new wall still says where it lives. */
export function freeId(taken: Set<string>, prefix: string): string {
  for (let n = 1; ; n += 1) {
    const id = `${prefix}${n}`;
    if (!taken.has(id)) return id;
  }
}

export interface Work {
  vertices: Vertex[];
  walls: Wall[];
  doors: Door[];
  rooms: Room[];
  /**
   * Every wall id the operation has seen, including ones it has since
   * removed. Minting from the live list instead hands out the id of a wall
   * just deleted by a split, so the second split silently reuses the first
   * wall's name and anything still pointing at it now points somewhere else.
   */
  spentWallIds: Set<string>;
}

/**
 * The doc's only geometric primitive, on a working copy.
 *
 * Doors follow their wall, their `t` rescaled into whichever fragment now
 * holds them — rescaled rather than re-matched by position, so a door comes
 * out exactly where it went in. Returns the vertex at the cut; a cut landing
 * on an end of the wall reuses that vertex and splits nothing.
 */
export function splitWall(work: Work, wallId: string, t: number, floor: string): string {
  const wall = work.walls.find((w) => w.id === wallId)!;
  const v1 = work.vertices.find((v) => v.id === wall.v1)!;
  const v2 = work.vertices.find((v) => v.id === wall.v2)!;

  const length = Math.hypot(v2.x - v1.x, v2.y - v1.y);
  const SNAP = 1e-6;
  if (length > 0) {
    if (t * length < SNAP) return wall.v1;
    if ((1 - t) * length < SNAP) return wall.v2;
  }

  const vm: Vertex = {
    id: freeId(new Set(work.vertices.map((v) => v.id)), `${floor}:v`),
    x: v1.x + (v2.x - v1.x) * t,
    y: v1.y + (v2.y - v1.y) * t,
  };
  work.vertices.push(vm);

  const w1: Wall = {
    ...wall,
    id: freeId(work.spentWallIds, `${floor}:w`),
    v2: vm.id,
  };
  work.spentWallIds.add(w1.id);
  const w2: Wall = {
    ...wall,
    id: freeId(work.spentWallIds, `${floor}:w`),
    v1: vm.id,
  };
  work.spentWallIds.add(w2.id);

  work.walls = work.walls.filter((w) => w.id !== wallId);
  work.walls.push(w1, w2);

  work.doors = work.doors.map((d) => {
    if (d.wall_id !== wallId || d.t === null) return d;
    return d.t < t
      ? { ...d, wall_id: w1.id, t: d.t / t }
      : { ...d, wall_id: w2.id, t: (d.t - t) / (1 - t) };
  });

  work.rooms = work.rooms.map((r) =>
    r.walls.includes(wallId)
      ? { ...r, walls: [...r.walls.filter((x) => x !== wallId), w1.id, w2.id] }
      : r,
  );

  return vm.id;
}

export interface DivideRoomRequest {
  roomId: string;
  /** Both in plan units; each is snapped to the nearest wall of the room. */
  from: Point;
  to: Point;
  name?: string;
}

/**
 * Divide a room by drawing a wall across it.
 *
 * The doc's recipe: split at each endpoint, create the connecting wall, then
 * walk the boundary from one endpoint to the other and give what you collect
 * to the new room. The walk is the one `ringsOf` already does. The new wall
 * goes in as a slit — both sides still the one room — and the face traversal
 * then returns two interior faces where there was one. Each is a room.
 *
 * Which side of the new wall is which gets read off the data rather than
 * assumed. Find a wall the surviving face already has `room_a` on, see which
 * way that face walks it, and give the new wall the same hand. A sign
 * convention guessed here would put every new wall's rooms the wrong way
 * round, and nothing on screen would say so.
 */
export function divideRoom(
  state: EditState,
  req: DivideRoomRequest,
): EditState {
  const { layer, file } = state;
  const room = must(layer.rooms, req.roomId, "room");
  const floor = room.floor_id.split(":")[0];

  if (interiorRings(ringsOf(layer, room)).length !== 1) {
    throw new OperationRejected(
      `${room.name} is not a single outline — it has a hole or a detached part. Dividing one of those is not built.`,
    );
  }

  const hitA = nearestWallInRoom(layer, room, req.from);
  const hitB = nearestWallInRoom(layer, room, req.to);
  if (!hitA || !hitB) {
    throw new OperationRejected(
      `Both ends of a new wall have to land on a wall of ${room.name}.`,
    );
  }
  if (hitA.wallId === hitB.wallId) {
    throw new OperationRejected(
      "Both ends landed on the same wall, which cuts a slit rather than dividing anything.",
    );
  }

  for (const [hit, which] of [
    [hitA, "first"],
    [hitB, "second"],
  ] as const) {
    for (const door of layer.doorsOnWall.get(hit.wallId) ?? []) {
      const span = doorSpan(layer, door);
      if (span && hit.t > span[0] && hit.t < span[1]) {
        throw new OperationRejected(
          `The ${which} end lands on ${door.name}. A wall cannot start in a doorway.`,
        );
      }
    }
  }

  for (const wallId of room.walls) {
    if (wallId === hitA.wallId || wallId === hitB.wallId) continue;
    const wall = layer.walls.get(wallId);
    if (!wall) continue;
    const [a, b] = wallEnds(layer, wall);
    if (segmentsCross(hitA.at, hitB.at, a, b)) {
      throw new OperationRejected(
        "That line crosses another wall of the room on its way across. A wall has to run from one boundary straight to another.",
      );
    }
  }

  // --- build it, on a copy -------------------------------------------------
  const work: Work = {
    vertices: [...file.vertices],
    walls: [...file.walls],
    doors: [...file.doors],
    rooms: [...file.rooms],
    spentWallIds: new Set(file.walls.map((w) => w.id)),
  };

  const vA = splitWall(work, hitA.wallId, hitA.t, floor);
  const vB = splitWall(work, hitB.wallId, hitB.t, floor);
  if (vA === vB) {
    throw new OperationRejected(
      "Both ends landed on the same corner, so there is no wall to draw.",
    );
  }

  const cut: Wall = {
    id: freeId(work.spentWallIds, `${floor}:w`),
    v1: vA,
    v2: vB,
    // A slit for now. The face walk below is what decides the two sides.
    room_a: room.id,
    room_b: room.id,
    state: "solid",
  };
  work.walls.push(cut);
  work.rooms = work.rooms.map((r) =>
    r.id === room.id ? { ...r, walls: [...r.walls, cut.id] } : r,
  );

  const probeFile: VisualLayerFile = {
    ...file,
    vertices: work.vertices,
    walls: work.walls,
    doors: work.doors,
    rooms: work.rooms,
  };
  const probe = indexVisualLayer(probeFile);
  const probeRoom = must(probe.rooms, room.id, "room");

  const faces = faceWalks(probe, probeRoom.walls).filter(
    (face) =>
      face.length > 2 &&
      signedArea(face.map((e) => vertexOf(probe, e.from))) < 0,
  );
  if (faces.length !== 2) {
    throw new OperationRejected(
      "That line does not divide the room — it leaves one space with a slit in it.",
    );
  }

  const areaOf = (face: (typeof faces)[number]) =>
    Math.abs(signedArea(face.map((e) => vertexOf(probe, e.from))));
  // The bigger half keeps the name. A room should not be renamed because
  // someone partitioned a cupboard off the end of it.
  const [keep, split] =
    areaOf(faces[0]) >= areaOf(faces[1]) ? faces : [faces[1], faces[0]];

  // Which hand does the surviving face walk with? Read it off a wall whose
  // sides are already known rather than assuming one.
  let handForward: boolean | null = null;
  for (const e of keep) {
    const w = must(probe.walls, e.wallId, "wall");
    if (w.room_a === room.id && w.room_b !== room.id) {
      handForward = e.from === w.v1;
      break;
    }
    if (w.room_b === room.id && w.room_a !== room.id) {
      handForward = e.from !== w.v1;
      break;
    }
  }
  if (handForward === null) {
    throw new OperationRejected(
      `Cannot tell which side of the new wall is which: every wall of ${room.name} has it on both sides.`,
    );
  }

  const keepWalls = new Set(keep.map((e) => e.wallId));
  const splitWalls = new Set(split.map((e) => e.wallId));

  const newRoom: Room = {
    id: freeId(new Set(work.rooms.map((r) => r.id)), `${floor}:r`),
    name: req.name ?? `${room.name} 2`,
    walls: [...splitWalls],
    group_id: room.group_id,
    space_type: room.space_type,
    floor_id: room.floor_id,
    surfaced: room.surfaced,
  };

  const cutEdge = keep.find((e) => e.wallId === cut.id)!;
  const keepIsSideA = (cutEdge.from === cut.v1) === handForward;

  const walls = work.walls.map((w) => {
    if (w.id === cut.id) {
      return {
        ...w,
        room_a: keepIsSideA ? room.id : newRoom.id,
        room_b: keepIsSideA ? newRoom.id : room.id,
      };
    }
    // A wall on the far side of the cut now faces the new room. One in both
    // faces is a slit of the original and stays with it.
    if (!splitWalls.has(w.id) || keepWalls.has(w.id)) return w;
    return {
      ...w,
      room_a: w.room_a === room.id ? newRoom.id : w.room_a,
      room_b: w.room_b === room.id ? newRoom.id : w.room_b,
    };
  });

  const rooms = work.rooms
    .map((r) => (r.id === room.id ? { ...r, walls: [...keepWalls] } : r))
    .concat(newRoom);

  return commit(state, "divide", "Add wall", {
    ...file,
    vertices: work.vertices,
    walls,
    doors: work.doors,
    rooms,
  });
}

/** A preview of the division a cut would make, or the reason it would fail. */
export function previewDivide(
  state: EditState,
  req: DivideRoomRequest,
): { ok: true } | { ok: false; reason: string } {
  try {
    divideRoom(state, req);
    return { ok: true };
  } catch (e) {
    if (e instanceof OperationRejected) return { ok: false, reason: e.message };
    throw e;
  }
}
