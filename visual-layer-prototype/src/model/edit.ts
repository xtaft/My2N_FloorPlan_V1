/**
 * The editing operations, and the undo stack behind them.
 *
 * Every refusal here is checked BEFORE anything is written, so a rejected
 * operation leaves the model untouched, and each one names the actual reason —
 * a generic failure leaves a manager with no way forward.
 *
 * Here: add door, the two surfacing overrides, and the space-type edits the
 * categories panel owns. The two operations that change geometry have their
 * own modules — divide.ts for split_wall and the boundary walk, merge.ts for
 * wall deletion, the room merge it is, and the collinear dissolve that
 * follows. Still unbuilt from the doc: group split and merge, and the
 * knock-through that keeps both spaces (state = "opening").
 */
import { indexVisualLayer, must, type VisualLayer } from "./load";
import { dist, lerp, normal, unit, wallEnds, wallLength } from "./geometry";
import { roomsOf } from "./access";
import {
  EXTERIOR,
  type Device,
  type Door,
  type Point,
  type SpaceType,
  type VisualLayerFile,
} from "./types";

/** Five is a deliberate cap: the realistic "that was wrong, go back" window. */
export const UNDO_DEPTH = 5;

/**
 * A refusal the user is meant to read. The message names the reason rather
 * than reporting a generic failure.
 */
export class OperationRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationRejected";
  }
}

export type OperationKind =
  | "add_door"
  | "divide"
  | "delete_wall"
  | "set_space_type"
  | "align_floor"
  | "rename"
  | "regroup"
  | "delete_room"
  | "unassign_room"
  | "flip_door"
  | "delete_door"
  | "delete_space_type"
  | "import_spaces"
  | "place_space"
  | "show_room"
  | "hide_room"
  | "add_space_type"
  | "rename_space_type"
  | "recolor_space_type"
  | "rename_device"
  | "unassign_device"
  | "place_device"
  | "create_envelope"
  | "add_floor"
  | "add_wall"
  | "flip_device";

export interface EditOperation {
  kind: OperationKind;
  /** What to put on the undo button. */
  label: string;
  /**
   * The model exactly as it was.
   *
   * The doc specifies `affected` as the complete records an operation
   * touched, keyed by id, precisely because several operations destroy
   * information that cannot be reconstructed from the resulting state. A
   * whole-file snapshot is the strongest form of that, and at this size —
   * a few thousand small records — it costs less than the per-operation
   * inverse logic it replaces. Operations never mutate, so the previous file
   * stays valid as its own undo entry.
   */
  before: VisualLayerFile;
}

export interface EditState {
  file: VisualLayerFile;
  /** Rebuilt on every change: the indexes are derived, never patched. */
  layer: VisualLayer;
  undo: EditOperation[];
  redo: EditOperation[];
}

export function initEditState(file: VisualLayerFile): EditState {
  return { file, layer: indexVisualLayer(file), undo: [], redo: [] };
}

export function commit(
  state: EditState,
  kind: OperationKind,
  label: string,
  next: VisualLayerFile,
): EditState {
  return {
    file: next,
    layer: indexVisualLayer(next),
    undo: [...state.undo, { kind, label, before: state.file }].slice(-UNDO_DEPTH),
    redo: [],
  };
}

export function undo(state: EditState): EditState {
  const last = state.undo[state.undo.length - 1];
  if (!last) return state;
  return {
    file: last.before,
    layer: indexVisualLayer(last.before),
    undo: state.undo.slice(0, -1),
    redo: [...state.redo, { ...last, before: state.file }],
  };
}

export function redo(state: EditState): EditState {
  const next = state.redo[state.redo.length - 1];
  if (!next) return state;
  return {
    file: next.before,
    layer: indexVisualLayer(next.before),
    undo: [...state.undo, { ...next, before: state.file }].slice(-UNDO_DEPTH),
    redo: state.redo.slice(0, -1),
  };
}

export function canUndo(state: EditState): boolean {
  return state.undo.length > 0;
}

export function canRedo(state: EditState): boolean {
  return state.redo.length > 0;
}

// ---------------------------------------------------------------- add a door

export interface AddDoorRequest {
  wallId: string;
  /** 0..1 along the wall — the centre of the opening. */
  t: number;
  /** Defaults to whatever this floor's doors already use. */
  width?: number;
  /** Which of the wall's two rooms the leaf opens into. */
  opensInto: string;
  hinge?: "v1" | "v2";
  name?: string;
}

/** The width this floor's doors are already drawn at, so a new one matches. */
export function standardDoorWidth(layer: VisualLayer, floorId: string): number {
  const widths = new Map<number, number>();
  for (const d of layer.file.doors) {
    if (d.width === null || d.wall_id === null) continue;
    const wall = layer.walls.get(d.wall_id);
    if (!wall) continue;
    const room = layer.rooms.get(wall.room_a) ?? layer.rooms.get(wall.room_b);
    if (room?.floor_id !== floorId) continue;
    widths.set(d.width, (widths.get(d.width) ?? 0) + 1);
  }
  let best = 43.5;
  let bestCount = 0;
  for (const [w, n] of widths) {
    if (n > bestCount) {
      bestCount = n;
      best = w;
    }
  }
  return best;
}

/** Short name for a room, for composing a door's name the way the data does. */
function shortName(roomId: string): string {
  const i = roomId.indexOf(":");
  return i === -1 ? roomId : roomId.slice(i + 1);
}

function freeDoorId(file: VisualLayerFile, wallId: string): string {
  const taken = new Set(file.doors.map((d) => d.id));
  const base = `${wallId}:door`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Add a door to a wall.
 *
 * Refuses when:
 *   - it would not fit: `t ± width/2` outside [0, 1]
 *   - it would overlap an existing door on the same wall, which would render
 *     as one wide hole
 *   - the wall is a slit (`room_a === room_b`), which has no two sides
 *   - `opensInto` is not one of the wall's rooms
 */
export function addDoor(state: EditState, req: AddDoorRequest): EditState {
  const { layer, file } = state;
  const wall = layer.walls.get(req.wallId);
  if (!wall) throw new OperationRejected(`No such wall: ${req.wallId}`);

  if (wall.room_a === wall.room_b) {
    throw new OperationRejected(
      "That wall is a slit — it has the same room on both sides, so there is no side for a door to open into.",
    );
  }
  if (req.opensInto !== wall.room_a && req.opensInto !== wall.room_b) {
    throw new OperationRejected(
      `${req.opensInto} is not one of this wall's two rooms.`,
    );
  }

  const roomForFloor =
    layer.rooms.get(wall.room_a) ?? layer.rooms.get(wall.room_b);
  const width = req.width ?? standardDoorWidth(layer, roomForFloor!.floor_id);

  const length = wallLength(layer, wall);
  const half = width / (2 * length);
  if (req.t - half < 0 || req.t + half > 1) {
    throw new OperationRejected(
      `A ${Math.round(width)}-unit door does not fit there: the wall is ${Math.round(
        length,
      )} units long and the door would run past its end.`,
    );
  }

  for (const existing of layer.doorsOnWall.get(wall.id) ?? []) {
    if (existing.t === null || existing.width === null) continue;
    const otherHalf = existing.width / (2 * length);
    if (Math.abs(existing.t - req.t) < half + otherHalf) {
      throw new OperationRejected(
        `That would overlap ${existing.name}. Two doors stacked on one wall would render as a single wide hole.`,
      );
    }
  }

  const other = req.opensInto === wall.room_a ? wall.room_b : wall.room_a;
  const door: Door = {
    id: freeDoorId(file, wall.id),
    name:
      req.name ??
      `${shortName(other === EXTERIOR ? "outside" : other)}–${shortName(req.opensInto)}`,
    kind: "physical",
    wall_id: wall.id,
    t: Number(req.t.toFixed(5)),
    width,
    hinge: req.hinge ?? "v1",
    swing: req.opensInto === wall.room_a ? "a" : "b",
    rooms: null,
  };

  return commit(state, "add_door", "Add door", {
    ...file,
    doors: [...file.doors, door],
  });
}

// ------------------------------------------------------------- show and hide

/**
 * The two manual overrides on surfacing. Surfacing is purely visual: it does
 * not move a room out of its envelope and does not touch the access graph,
 * which already contains every room.
 *
 * Hiding refuses for a room that carries hardware — a reader in an invisible
 * room is a boundary nobody can see.
 */
/**
 * The device that verifies access INTO this room, if any.
 *
 * Being guarded is what stops a room being folded away, and it is narrower
 * than carrying hardware. A room with an answering unit in it can fold —
 * the unit belongs to the flat and draws with it. A walk-through room can
 * fold even though a reader stands in it, because that reader guards the
 * room beyond; it is the room beyond that has to stay visible, since that
 * is the boundary being checked.
 */
export function guardingDevice(
  layer: VisualLayer,
  roomId: string,
): Device | null {
  for (const device of layer.file.devices) {
    if (device.guards.includes(roomId)) return device;
  }
  return null;
}

export function setRoomSurfaced(
  state: EditState,
  roomId: string,
  surfaced: boolean,
): EditState {
  const { layer, file } = state;
  const room = layer.rooms.get(roomId);
  if (!room) throw new OperationRejected(`No such room: ${roomId}`);
  if (room.surfaced === surfaced) return state;

  if (!surfaced) {
    const guard = guardingDevice(layer, roomId);
    if (guard) {
      throw new OperationRejected(
        `${guard.name} verifies access into ${room.name}. A room somebody has to be let into has to be visible, or the check guards a boundary nobody can see.`,
      );
    }
  }

  return commit(
    state,
    surfaced ? "show_room" : "hide_room",
    surfaced ? "Show room" : "Hide room",
    {
      ...file,
      rooms: file.rooms.map((r) =>
        r.id === roomId ? { ...r, surfaced } : r,
      ),
    },
  );
}

// ------------------------------------------------------------- space types

/**
 * Colours a new category can be given.
 *
 * Muted and of similar weight, because a floor plan is read as a whole and
 * one loud category would pull the eye to whichever spaces happen to be in
 * it. They are far enough apart to tell two adjacent spaces apart.
 */
export const SPACE_TYPE_PALETTE = [
  "#6B8FD4", // blue
  "#D4A96B", // sand
  "#7FC4A8", // green
  "#C47F7F", // clay
  "#A88FD4", // violet
  "#D4C06B", // ochre
  "#6BBFD4", // teal
  "#D48FB4", // rose
  "#8FD47F", // leaf
  "#B0A8A0", // stone
];

/**
 * A category the user has just asked for, before they have named it.
 *
 * The colour is picked at random from those the building is not already
 * using, so two categories are not born the same shade and the user does
 * not have to go and fix that before the panel is readable. Once every
 * colour is in use it falls back to the whole palette — a repeat is better
 * than refusing to make a category.
 */
export function newSpaceType(layer: VisualLayer): SpaceType {
  const types = layer.file.space_types;

  const taken = new Set(types.map((t) => t.id));
  let id = "";
  for (let n = 1; !id; n += 1) {
    const candidate = `category_${n}`;
    if (!taken.has(candidate)) id = candidate;
  }

  const used = new Set(types.map((t) => t.color.toUpperCase()));
  const free = SPACE_TYPE_PALETTE.filter((c) => !used.has(c.toUpperCase()));
  const from = free.length > 0 ? free : SPACE_TYPE_PALETTE;

  return {
    id,
    name: "New category",
    color: from[Math.floor(Math.random() * from.length)],
  };
}

/**
 * Type is a field and colour comes from the type, so this panel owns rename
 * and recolour and every space of that type follows.
 */
export function addSpaceType(state: EditState, type: SpaceType): EditState {
  if (state.layer.spaceTypes.has(type.id)) {
    throw new OperationRejected(`A category called ${type.id} already exists.`);
  }
  return commit(state, "add_space_type", "New category", {
    ...state.file,
    space_types: [...state.file.space_types, type],
  });
}

export function renameSpaceType(
  state: EditState,
  id: string,
  name: string,
): EditState {
  if (!state.layer.spaceTypes.has(id)) {
    throw new OperationRejected(`No such category: ${id}`);
  }
  return commit(state, "rename_space_type", "Rename category", {
    ...state.file,
    space_types: state.file.space_types.map((t) =>
      t.id === id ? { ...t, name } : t,
    ),
  });
}

export function recolorSpaceType(
  state: EditState,
  id: string,
  color: string,
): EditState {
  if (!state.layer.spaceTypes.has(id)) {
    throw new OperationRejected(`No such category: ${id}`);
  }
  return commit(state, "recolor_space_type", "Recolour category", {
    ...state.file,
    space_types: state.file.space_types.map((t) =>
      t.id === id ? { ...t, color } : t,
    ),
  });
}

// ------------------------------------------------------------------ hit test

export interface WallHit {
  wallId: string;
  /** 0..1 along the wall, where the pointer landed. */
  t: number;
  /** Distance from the pointer to the wall, in canvas units. */
  distance: number;
  /** Which side the pointer is on, and so which room a door would open into. */
  side: "a" | "b";
  room: string;
}

/**
 * The wall nearest a point on this floor, with the side the point is on.
 * Used to turn a click into an add-door request.
 */
export function nearestWall(
  layer: VisualLayer,
  floorId: string,
  point: Point,
  maxDistance = 40,
): WallHit | null {
  let best: WallHit | null = null;

  // By the floor the wall's vertices are namespaced to, not by a room on
  // either side: a slit on open floor has no room, and still has to be
  // found to be removed.
  const floor = floorId.split(":")[0];
  for (const wall of layer.file.walls) {
    if (wall.v1.split(":")[0] !== floor) continue;

    const [a, b] = wallEnds(layer, wall);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;

    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const foot = lerp(a, b, t);
    const distance = dist(point, foot);
    if (distance > maxDistance) continue;
    if (best && distance >= best.distance) continue;

    // The normal points toward room_a, so a positive dot product means the
    // pointer is on room_a's side.
    const n = unit(normal(layer, wall));
    const towardA =
      (point.x - foot.x) * n.x + (point.y - foot.y) * n.y >= 0;
    const side: "a" | "b" = towardA ? "a" : "b";

    best = {
      wallId: wall.id,
      t,
      distance,
      side,
      room: side === "a" ? wall.room_a : wall.room_b,
    };
  }

  return best;
}

/** Whether a wall could take a door at all, for hover feedback. */
export function wallAcceptsDoors(layer: VisualLayer, wallId: string): boolean {
  const wall = layer.walls.get(wallId);
  if (!wall) return false;
  return wall.room_a !== wall.room_b;
}

/** A preview of the door a click would create, or the reason it would fail. */
export function previewAddDoor(
  state: EditState,
  hit: WallHit,
): { ok: true; width: number } | { ok: false; reason: string } {
  try {
    const wall = must(state.layer.walls, hit.wallId, "wall");
    const room =
      state.layer.rooms.get(wall.room_a) ?? state.layer.rooms.get(wall.room_b);
    const width = standardDoorWidth(state.layer, room!.floor_id);
    addDoor(state, { wallId: hit.wallId, t: hit.t, opensInto: hit.room, width });
    return { ok: true, width };
  } catch (e) {
    if (e instanceof OperationRejected) return { ok: false, reason: e.message };
    throw e;
  }
}

/** The rooms a door would join, for the confirmation line. */
export function doorEndpoints(layer: VisualLayer, door: Door): string[] {
  return roomsOf(layer, door).map(
    (id) => layer.rooms.get(id)?.name ?? "Outside",
  );
}
