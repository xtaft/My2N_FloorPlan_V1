/**
 * Drawing a wall anywhere on a floor.
 *
 * `divideRoom` draws a wall from one side of a room to the other and
 * refuses anything else. This is the same act without the refusal: a
 * wall may start on a boundary and stop in the middle of the room, or
 * stand on open floor with nothing around it. The model already knows
 * what that is — a slit, a wall with the same space on both sides — and
 * already walks around one correctly. What was missing was letting one
 * be drawn, and noticing when the next wall closes it into a room.
 *
 * So: snap each end to a corner, a wall or nothing; put the wall in as
 * a slit of whatever space it lies in, the exterior included; then walk
 * the faces. If the walk comes back with the faces it had, the wall is
 * a slit and that is that. If a face has appeared, it is a room — split
 * off the space it was cut from, or born on open floor — and every wall
 * on it gets its two sides read off the walk. Two walls from a corner
 * make a room in the corner; four on a blank floor make the first room
 * of a plan drawn from scratch.
 *
 * Which side of a wall is which is read, never guessed: in a room's
 * interior face, a wall walked from v1 to v2 has that room on its left,
 * which is `room_a`. That holds for every edge of every room in the
 * fixture, and a test keeps it so.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { indexVisualLayer, must, type VisualLayer } from "./load";
import { dist, doorSpan, vertexOf, wallEnds } from "./geometry";
import {
  faceWalks,
  insideRings,
  roomRings,
  signedArea,
  type FaceEdge,
} from "./rings";
import { freeId, segmentsCross, splitWall, type Work } from "./divide";
import { unnamedRoomName } from "./structure";
import {
  EXTERIOR,
  type Point,
  type Room,
  type Vertex,
  type VisualLayerFile,
  type Wall,
} from "./types";

/** Plan units within which an end takes a corner or a wall it is near. */
export const WALL_SNAP = 15;

export interface AddWallRequest {
  floorId: string;
  from: Point;
  to: Point;
  /** For a room the wall makes, if any. */
  name?: string;
}

/** Where an end lands. */
export type WallEnd =
  | { kind: "vertex"; vertexId: string; at: Point }
  | { kind: "wall"; wallId: string; t: number; at: Point }
  | { kind: "free"; at: Point };

function prefix(id: string): string {
  return id.split(":")[0];
}

/**
 * Every wall on a floor, by the floor its vertices are namespaced to —
 * a wall between two rooms could be found through either, but a slit on
 * open floor has no room to be found through.
 */
export function wallsOnFloor(layer: VisualLayer, floorId: string): Wall[] {
  const p = prefix(floorId);
  return layer.file.walls.filter((w) => prefix(w.v1) === p);
}

/**
 * What the pointer is offering: the nearest corner within reach, else
 * the nearest wall, else the point itself. Corners first, so that a
 * second wall drawn from the loose end of the first joins it there
 * rather than splitting the first a hair from its end.
 */
export function snapEnd(
  layer: VisualLayer,
  floorId: string,
  pt: Point,
  snap = WALL_SNAP,
): WallEnd {
  const walls = wallsOnFloor(layer, floorId);

  let bestV: { id: string; d: number; at: Point } | null = null;
  for (const w of walls) {
    for (const id of [w.v1, w.v2]) {
      const v = vertexOf(layer, id);
      const d = dist(pt, v);
      if (d <= snap && (!bestV || d < bestV.d)) {
        bestV = { id, d, at: { x: v.x, y: v.y } };
      }
    }
  }
  if (bestV) return { kind: "vertex", vertexId: bestV.id, at: bestV.at };

  let bestW: { wallId: string; t: number; at: Point; d: number } | null = null;
  for (const w of walls) {
    const [a, b] = wallEnds(layer, w);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const at = { x: a.x + dx * t, y: a.y + dy * t };
    const d = dist(pt, at);
    if (d <= snap && (!bestW || d < bestW.d)) bestW = { wallId: w.id, t, at, d };
  }
  if (bestW) return { kind: "wall", wallId: bestW.wallId, t: bestW.t, at: bestW.at };

  return { kind: "free", at: { x: pt.x, y: pt.y } };
}

/** The room a point is inside, on this floor, or null on open floor. */
export function roomAtPoint(
  layer: VisualLayer,
  floorId: string,
  pt: Point,
): Room | null {
  for (const room of layer.roomsByFloor.get(floorId) ?? []) {
    if (insideRings(pt, roomRings(layer, room))) return room;
  }
  return null;
}

/** The faces a wall set encloses — the ones walked with the space on the left. */
function interiorFaces(layer: VisualLayer, wallIds: Iterable<string>): FaceEdge[][] {
  return faceWalks(layer, wallIds).filter(
    (face) =>
      face.length > 2 &&
      signedArea(face.map((e) => vertexOf(layer, e.from))) < 0,
  );
}

function areaOf(layer: VisualLayer, face: FaceEdge[]): number {
  return Math.abs(signedArea(face.map((e) => vertexOf(layer, e.from))));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function addWall(state: EditState, req: AddWallRequest): EditState {
  const { layer, file } = state;
  const floor = prefix(req.floorId);
  if (!layer.floors.some((f) => f.id === req.floorId)) {
    throw new OperationRejected(`There is no floor ${req.floorId}.`);
  }

  const endA = snapEnd(layer, req.floorId, req.from);
  const endB = snapEnd(layer, req.floorId, req.to);
  if (dist(endA.at, endB.at) < 1e-6) {
    throw new OperationRejected("Both ends are in the same place, so there is no wall to draw.");
  }

  // The space the wall lies in, read at its middle. Each end may sit on
  // that space's boundary; neither may sit on anybody else's.
  const mid = { x: (endA.at.x + endB.at.x) / 2, y: (endA.at.y + endB.at.y) / 2 };
  const host = roomAtPoint(layer, req.floorId, mid);
  const hostId = host?.id ?? EXTERIOR;

  const touches = (w: Wall) =>
    host ? host.walls.includes(w.id) : w.room_a === EXTERIOR || w.room_b === EXTERIOR;
  const where = host ? host.name : "open floor";
  for (const end of [endA, endB]) {
    if (end.kind === "wall") {
      const w = must(layer.walls, end.wallId, "wall");
      if (!touches(w)) {
        throw new OperationRejected(
          `That wall runs through ${where} but ends on a wall of somewhere else. A wall stays inside one space.`,
        );
      }
      for (const door of layer.doorsOnWall.get(w.id) ?? []) {
        const span = doorSpan(layer, door);
        if (span && end.t > span[0] && end.t < span[1]) {
          throw new OperationRejected(
            `One end lands on ${door.name}. A wall cannot start in a doorway.`,
          );
        }
      }
    }
    if (end.kind === "vertex") {
      const ok = wallsOnFloor(layer, req.floorId).some(
        (w) => (w.v1 === end.vertexId || w.v2 === end.vertexId) && touches(w),
      );
      if (!ok) {
        throw new OperationRejected(
          `That wall runs through ${where} but ends on a corner of somewhere else. A wall stays inside one space.`,
        );
      }
    }
  }

  const snappedTo = new Set(
    [endA, endB].flatMap((e) => (e.kind === "wall" ? [e.wallId] : [])),
  );
  for (const w of wallsOnFloor(layer, req.floorId)) {
    if (snappedTo.has(w.id)) continue;
    const [a, b] = wallEnds(layer, w);
    if (segmentsCross(endA.at, endB.at, a, b)) {
      throw new OperationRejected(
        "That line crosses another wall on its way. A wall runs from where it starts to where it stops without cutting through one.",
      );
    }
  }
  if (endA.kind === "vertex" && endB.kind === "vertex") {
    const dup = wallsOnFloor(layer, req.floorId).some(
      (w) =>
        (w.v1 === endA.vertexId && w.v2 === endB.vertexId) ||
        (w.v2 === endA.vertexId && w.v1 === endB.vertexId),
    );
    if (dup) throw new OperationRejected("There is a wall there already.");
  }

  // --- build it, on a copy -------------------------------------------------
  const work: Work = {
    vertices: [...file.vertices],
    walls: [...file.walls],
    doors: [...file.doors],
    rooms: [...file.rooms],
    spentWallIds: new Set(file.walls.map((w) => w.id)),
  };
  const land = (end: WallEnd): string => {
    if (end.kind === "vertex") return end.vertexId;
    if (end.kind === "wall") return splitWall(work, end.wallId, end.t, floor);
    const v: Vertex = {
      id: freeId(new Set(work.vertices.map((x) => x.id)), `${floor}:v`),
      x: end.at.x,
      y: end.at.y,
    };
    work.vertices.push(v);
    return v.id;
  };
  const vA = land(endA);
  const vB = land(endB);
  if (vA === vB) {
    throw new OperationRejected("Both ends landed on the same corner, so there is no wall to draw.");
  }

  const cut: Wall = {
    id: freeId(work.spentWallIds, `${floor}:w`),
    v1: vA,
    v2: vB,
    // A slit until the walk says otherwise.
    room_a: hostId,
    room_b: hostId,
    state: "solid",
  };
  work.walls.push(cut);
  if (host) {
    work.rooms = work.rooms.map((r) =>
      r.id === host.id ? { ...r, walls: [...r.walls, cut.id] } : r,
    );
  }

  const probeFile: VisualLayerFile = {
    ...file,
    vertices: work.vertices,
    walls: work.walls,
    doors: work.doors,
    rooms: work.rooms,
  };
  const probe = indexVisualLayer(probeFile);

  // --- what the walk says --------------------------------------------------
  // The faces that are rooms now, each with the room it belongs to. For a
  // wall inside a room they are that room's faces: the biggest keeps the
  // name, the rest are new. On open floor they are the faces the new wall
  // closed, which were nothing a moment ago.
  let faces: { roomId: string; face: FaceEdge[] }[];
  let newRooms: Room[] = [];
  const nameFor = (k: number) => {
    const base = req.name ?? unnamedRoomName(probe);
    return k === 0 ? base : `${base} ${k + 1}`;
  };
  const roomIds = new Set(work.rooms.map((r) => r.id));
  const mint = () => {
    const id = freeId(roomIds, `${floor}:r`);
    roomIds.add(id);
    return id;
  };

  if (host) {
    const probeRoom = must(probe.rooms, host.id, "room");
    const found = interiorFaces(probe, probeRoom.walls);
    if (found.length === 0) {
      throw new OperationRejected(`${host.name} has no outline to draw inside.`);
    }
    if (found.length === 1) {
      return commit(state, "add_wall", "Add wall", probeFile);
    }
    found.sort((a, b) => areaOf(probe, b) - areaOf(probe, a));
    faces = [{ roomId: host.id, face: found[0] }];
    found.slice(1).forEach((face, k) => {
      const made: Room = {
        id: mint(),
        name: nameFor(k),
        walls: [],
        group_id: host.group_id,
        space_type: host.space_type,
        floor_id: host.floor_id,
        surfaced: host.surfaced,
      };
      newRooms.push(made);
      faces.push({ roomId: made.id, face });
    });
  } else {
    const all = wallsOnFloor(probe, req.floorId).map((w) => w.id);
    const known = (probe.roomsByFloor.get(req.floorId) ?? []).map(
      (r) => new Set(r.walls),
    );
    const fresh = interiorFaces(probe, all).filter((face) => {
      if (!face.some((e) => e.wallId === cut.id)) return false;
      const ids = new Set(face.map((e) => e.wallId));
      return !known.some((k) => sameSet(k, ids));
    });
    if (fresh.length === 0) {
      return commit(state, "add_wall", "Add wall", probeFile);
    }
    faces = [];
    fresh.forEach((face, k) => {
      const made: Room = {
        id: mint(),
        name: nameFor(k),
        walls: [],
        group_id: null,
        space_type: null,
        floor_id: req.floorId,
        surfaced: true,
      };
      newRooms.push(made);
      faces.push({ roomId: made.id, face });
    });
  }

  // --- give every wall on those faces its two sides ------------------------
  // A wall walked twice in one face is a slit of that room. One walked in
  // two faces lies between them, and the face that walks it forward is on
  // its left. One walked once has something else on its other side — a
  // neighbour, or the outside — which it keeps.
  const hits = new Map<string, { roomId: string; forward: boolean }[]>();
  for (const { roomId, face } of faces) {
    for (const e of face) {
      const w = must(probe.walls, e.wallId, "wall");
      const list = hits.get(w.id) ?? [];
      list.push({ roomId, forward: e.from === w.v1 });
      hits.set(w.id, list);
    }
  }
  const touched = new Set(faces.flatMap((f) => f.face.map((e) => e.wallId)));

  let walls = work.walls.map((w) => {
    const h = hits.get(w.id);
    if (!h) return w;
    const rooms = new Set(h.map((x) => x.roomId));
    if (rooms.size === 1) {
      const [roomId] = [...rooms];
      if (h.length >= 2) return { ...w, room_a: roomId, room_b: roomId };
      // One side is this face's room; the other — a neighbour, or the
      // outside — stays what it was.
      return h[0].forward
        ? { ...w, room_a: roomId }
        : { ...w, room_b: roomId };
    }
    const fwd = h.find((x) => x.forward);
    const back = h.find((x) => !x.forward);
    if (!fwd || !back) {
      throw new OperationRejected("The walk around the new wall did not come out two-sided.");
    }
    return { ...w, room_a: fwd.roomId, room_b: back.roomId };
  });

  // The outside is always room_b, by the file's rule. A wall drawn on open
  // floor was given a direction by the hand that drew it, and when the
  // room it closes turns out to be on its right, the wall turns round.
  walls = walls.map((w) => {
    if (!touched.has(w.id)) return w;
    if (w.room_a !== EXTERIOR || w.room_b === EXTERIOR) return w;
    work.doors = work.doors.map((d) =>
      d.wall_id === w.id && d.t !== null ? { ...d, t: 1 - d.t } : d,
    );
    return { ...w, v1: w.v2, v2: w.v1, room_a: w.room_b, room_b: w.room_a };
  });

  const wallsOf = (roomId: string) => [
    ...new Set(
      walls.filter((w) => w.room_a === roomId || w.room_b === roomId).map((w) => w.id),
    ),
  ];
  const rooms = work.rooms
    .map((r) => (faces.some((f) => f.roomId === r.id) ? { ...r, walls: wallsOf(r.id) } : r))
    .concat(newRooms.map((r) => ({ ...r, walls: wallsOf(r.id) })));

  return commit(
    state,
    "add_wall",
    newRooms.length === 0
      ? "Add wall"
      : host
        ? "Add wall"
        : `Add wall — ${newRooms.map((r) => r.name).join(", ")}`,
    { ...file, vertices: work.vertices, walls, doors: work.doors, rooms },
  );
}

/** The wall a request would make, or why it would be refused. */
export function previewAddWall(
  state: EditState,
  req: AddWallRequest,
): { ok: true } | { ok: false; reason: string } {
  try {
    addWall(state, req);
    return { ok: true };
  } catch (e) {
    if (e instanceof OperationRejected) return { ok: false, reason: e.message };
    throw e;
  }
}
