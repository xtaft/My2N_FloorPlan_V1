/**
 * Aligning a floor onto the one below it.
 *
 * Two problems that look separate have one answer. Floors arrive with no
 * shared coordinate system — different page margins, sometimes different
 * drawing scales, nothing at all in common if the plans were drawn by hand —
 * so they have to be placed relative to each other. Separately, the building
 * needs to know which lift on floor 3 is the lift on floor 2; the category
 * says a space *is* a lift and nothing about which shaft it belongs to.
 *
 * Putting this floor's lift over that floor's lift is the statement that they
 * are the same shaft, so one gesture answers both.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import type { VisualLayer } from "./load";
import { interiorRings, insideRings, ringsOf, signedArea } from "./rings";
import { accessType } from "./access";
import { isShaftType, rebuildVerticalDoors, shaftStoreys } from "./shaft";
import type { Floor, Point, Room, Vertex } from "./types";

/** dx, dy, rotation in radians, uniform scale. */
export interface Transform {
  dx: number;
  dy: number;
  rotation: number;
  scale: number;
}

export const IDENTITY: Transform = { dx: 0, dy: 0, rotation: 0, scale: 1 };

export function floorTransform(floor: Floor): Transform {
  const [dx, dy, rotation, scale] = floor.transform;
  return { dx, dy, rotation, scale };
}

export function toTuple(t: Transform): [number, number, number, number] {
  return [t.dx, t.dy, t.rotation, t.scale];
}

/**
 * Where a point on this floor sits in the building's coordinates.
 *
 * Rotation is applied about the origin before the offset, so a transform
 * composes the way the handles do: scale the drawing, turn it, then slide it
 * into place.
 */
export function applyTransform(t: Transform, p: Point): Point {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const x = p.x * t.scale;
  const y = p.y * t.scale;
  return {
    x: x * cos - y * sin + t.dx,
    y: x * sin + y * cos + t.dy,
  };
}

/** The reverse, for turning a pointer position back into floor coordinates. */
export function invertTransform(t: Transform, p: Point): Point {
  const cos = Math.cos(-t.rotation);
  const sin = Math.sin(-t.rotation);
  const x = p.x - t.dx;
  const y = p.y - t.dy;
  return {
    x: (x * cos - y * sin) / t.scale,
    y: (x * sin + y * cos) / t.scale,
  };
}

/**
 * A length on this floor, in the building's units.
 *
 * Worth having even though nothing converts to metres: a door's `width` is
 * stored in the floor's own drawing units, so the same door reads 0.9 on one
 * floor and 1.0 on another until the scale is taken out. Any comparison
 * across floors has to go through here.
 */
export function realLength(t: Transform, length: number): number {
  return length * t.scale;
}

/** The floor directly below this one by storey, or null for the lowest. */
export function referenceFloor(layer: VisualLayer, floorId: string): Floor | null {
  const floor = layer.floors.find((f) => f.id === floorId);
  if (!floor) return null;
  let best: Floor | null = null;
  for (const other of layer.floors) {
    if (other.level >= floor.level) continue;
    if (!best || other.level > best.level) best = other;
  }
  return best;
}

export interface ShaftSpace {
  /** The room standing for the shaft on this floor. */
  room: Room;
  groupId: string;
  /** Null until something is landed on it. */
  shaftId: string | null;
  /** In the floor's own coordinates. */
  centroid: Point;
}

/** The stairs and lifts on one floor, as things that can be paired. */
export function shaftSpaces(layer: VisualLayer, floorId: string): ShaftSpace[] {
  const out: ShaftSpace[] = [];
  for (const room of layer.roomsByFloor.get(floorId) ?? []) {
    if (!isShaftType(accessType(layer, room))) continue;
    if (!room.group_id) continue;
    const rings = interiorRings(ringsOf(layer, room));
    if (rings.length === 0) continue;
    out.push({
      room,
      groupId: room.group_id,
      shaftId: layer.groups.get(room.group_id)?.shaft_id ?? null,
      centroid: centroidOf(rings),
    });
  }
  return out;
}

function centroidOf(rings: Vertex[][]): Point {
  // Area-weighted, so a shaft drawn with a lobby stub does not drag its
  // centre into the stub.
  let cx = 0;
  let cy = 0;
  let total = 0;
  for (const ring of rings) {
    const area = Math.abs(signedArea(ring));
    if (area === 0) continue;
    let sx = 0;
    let sy = 0;
    for (const v of ring) {
      sx += v.x;
      sy += v.y;
    }
    cx += (sx / ring.length) * area;
    cy += (sy / ring.length) * area;
    total += area;
  }
  if (total === 0) return { x: 0, y: 0 };
  return { x: cx / total, y: cy / total };
}

/**
 * Which outline below each of this floor's shafts came to rest on.
 *
 * Read from where the shafts actually are under the transform, which is what
 * "captured from the gesture" means: the pairing is whatever the user put
 * there. A shaft that lands on nothing gets no partner, and that is a real
 * answer — a service lift serving only the lower storeys, a stair core ending
 * below a setback. Snapping it to the nearest outline instead would invent a
 * fact about the building that only the person placing the floor knows.
 */
export function landingsFor(
  layer: VisualLayer,
  floorId: string,
  transform: Transform,
): Map<string, string | null> {
  const below = referenceFloor(layer, floorId);
  const out = new Map<string, string | null>();
  if (!below) return out;

  const targets = shaftSpaces(layer, below.id).map((s) => ({
    space: s,
    rings: interiorRings(ringsOf(layer, s.room)),
    world: applyTransform(floorTransform(below), s.centroid),
  }));
  const belowT = floorTransform(below);

  for (const space of shaftSpaces(layer, floorId)) {
    const here = applyTransform(transform, space.centroid);
    let landed: string | null = null;
    for (const target of targets) {
      // Test in the reference floor's own coordinates: its rings are drawn
      // there, and un-transforming one point beats transforming a ring.
      const local = invertTransform(belowT, here);
      if (insideRings(local, target.rings)) {
        landed = target.space.groupId;
        break;
      }
    }
    out.set(space.groupId, landed);
  }
  return out;
}

export interface ScaleProposal {
  scale: number;
  /** The two shafts it was measured between. */
  between: [string, string];
  /** Close enough to 1 that the difference is segmentation noise. */
  snapped: boolean;
  /** Outside 0.5–2.0: almost certainly the wrong reference floor. */
  suspect: boolean;
}

/**
 * Scale proposed from the distance between two paired shaft centroids.
 *
 * A two-shaft baseline is ~20m where a single lift core is ~2m, so the same
 * absolute segmentation error produces ten times less scale error. One pair
 * is not enough to propose anything.
 *
 * Returned the way round the caller needs it: what to put in `transform`
 * so this floor comes to fit the one below. A floor drawn half again as
 * large has to come back to two thirds, so a drawing measuring 1.5x the
 * reference proposes 0.667 — the reciprocal of the ratio the spec writes,
 * which is a measurement rather than a setting. It is also the number the
 * readout shows, and "scaled to 112%" has to mean the floor is drawn at
 * 112%, not that it was measured 12% too big and will be shrunk.
 */
export function proposeScale(
  layer: VisualLayer,
  floorId: string,
  landings: Map<string, string | null>,
): ScaleProposal | null {
  const below = referenceFloor(layer, floorId);
  if (!below) return null;

  const here = new Map(shaftSpaces(layer, floorId).map((s) => [s.groupId, s]));
  const there = new Map(shaftSpaces(layer, below.id).map((s) => [s.groupId, s]));

  const pairs: Array<[ShaftSpace, ShaftSpace]> = [];
  for (const [mine, theirs] of landings) {
    const a = here.get(mine);
    const b = theirs ? there.get(theirs) : undefined;
    if (a && b) pairs.push([a, b]);
  }
  if (pairs.length < 2) return null;

  // The widest baseline available, for the same reason two beats one.
  let best: { d: number; i: number; j: number } | null = null;
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const d = dist(pairs[i][1].centroid, pairs[j][1].centroid);
      if (!best || d > best.d) best = { d, i, j };
    }
  }
  if (!best || best.d === 0) return null;

  const mine = dist(pairs[best.i][0].centroid, pairs[best.j][0].centroid);
  if (mine === 0) return null;
  const raw = best.d / mine;
  const snapped = raw > 0.95 && raw < 1.05;

  return {
    scale: snapped ? 1 : raw,
    between: [pairs[best.i][0].groupId, pairs[best.j][0].groupId],
    snapped,
    suspect: raw < 0.5 || raw > 2,
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export interface AlignWarning {
  kind: "lone_member" | "nothing_landed";
  message: string;
}

/**
 * What the align would leave worth mentioning. Neither stops it: an unpaired
 * shaft is a valid result in both directions, and a floor nobody has aligned
 * above yet will always look like a shaft that ends here.
 */
export function alignWarnings(
  layer: VisualLayer,
  floorId: string,
  landings: Map<string, string | null>,
): AlignWarning[] {
  const out: AlignWarning[] = [];
  const spaces = shaftSpaces(layer, floorId);

  if (spaces.length > 0 && [...landings.values()].every((v) => v === null)) {
    out.push({
      kind: "nothing_landed",
      message:
        "None of this floor's shafts came to rest on one below. That usually means it is being aligned against the wrong floor.",
    });
  }

  for (const [mine, theirs] of landings) {
    if (!theirs) continue;
    const shaftId = layer.groups.get(theirs)?.shaft_id;
    if (!shaftId) continue;
    const members = shaftStoreys(layer, shaftId).length;
    if (members + 1 <= 1) {
      out.push({
        kind: "lone_member",
        message: `${layer.groups.get(mine)?.name ?? mine} would be the only storey of its shaft, so it gets no vertical links yet.`,
      });
    }
  }
  return out;
}

export interface AlignFloorRequest {
  floorId: string;
  transform: Transform;
  /** This floor's envelope id -> the envelope below it landed on, or null. */
  landings: Map<string, string | null>;
  /** Required to accept a scale outside 0.5–2.0. */
  acceptOddScale?: boolean;
}

/**
 * Place a floor, and record which shaft is which.
 *
 * The transform is stored, never baked into the vertices: alignment stays
 * adjustable and errors do not compound up the building. Vertical doors are
 * rebuilt for every shaft the pairing touched, which reaches floors the user
 * was not looking at — the undo entry is the whole file, so those doors come
 * back without anyone having to trust a rebuild to restore them.
 */
export function alignFloor(state: EditState, req: AlignFloorRequest): EditState {
  const { layer, file } = state;
  const floor = layer.floors.find((f) => f.id === req.floorId);
  if (!floor) throw new OperationRejected(`No such floor: ${req.floorId}`);

  const below = referenceFloor(layer, req.floorId);
  if (!below) {
    throw new OperationRejected(
      `${floor.name} is the lowest storey. It is the reference every other floor is fitted to, so there is nothing to align it against.`,
    );
  }

  if (!(req.transform.scale > 0) || !Number.isFinite(req.transform.scale)) {
    throw new OperationRejected("Scale has to be a positive number.");
  }
  if (
    (req.transform.scale < 0.5 || req.transform.scale > 2) &&
    !req.acceptOddScale
  ) {
    throw new OperationRejected(
      `Scaled to ${Math.round(req.transform.scale * 100)}%. A drawing-scale difference of a few per cent is ordinary; this much usually means the floor is being aligned against the wrong reference.`,
    );
  }

  // Two of this floor's shafts on one outline below would make them the same
  // shaft, which they are not — they are two shafts on one storey.
  const taken = new Map<string, string>();
  for (const [mine, theirs] of req.landings) {
    if (!theirs) continue;
    const already = taken.get(theirs);
    if (already) {
      const name = (id: string) => layer.groups.get(id)?.name ?? id;
      throw new OperationRejected(
        `${name(already)} and ${name(mine)} both landed on ${name(theirs)}. Two shafts on one storey cannot be the same shaft.`,
      );
    }
    taken.set(theirs, mine);
  }

  for (const mine of req.landings.keys()) {
    const group = layer.groups.get(mine);
    if (!group || group.floor_id !== req.floorId) {
      throw new OperationRejected(`${mine} is not an envelope on ${floor.name}.`);
    }
  }

  const floors = file.floors.map((f) =>
    f.id === req.floorId ? { ...f, transform: toTuple(req.transform) } : f,
  );

  // A shaft id comes from the outline landed on. Where that outline has no
  // id yet — the floor below has never been aligned either — the pair starts
  // one, named for the storey it begins on.
  const groups = [...file.groups];
  const touched = new Set<string>();
  for (const [mine, theirs] of req.landings) {
    const i = groups.findIndex((g) => g.id === mine);
    if (i < 0) continue;
    if (!theirs) {
      // Landed on nothing: it is not part of any shaft until it is.
      if (groups[i].shaft_id) touched.add(groups[i].shaft_id!);
      groups[i] = { ...groups[i], shaft_id: null };
      continue;
    }
    const j = groups.findIndex((g) => g.id === theirs);
    if (j < 0) continue;
    let shaftId = groups[j].shaft_id;
    if (!shaftId) {
      shaftId = `shaft:${theirs}`;
      groups[j] = { ...groups[j], shaft_id: shaftId };
    }
    if (groups[i].shaft_id && groups[i].shaft_id !== shaftId) {
      touched.add(groups[i].shaft_id!);
    }
    groups[i] = { ...groups[i], shaft_id: shaftId };
    touched.add(shaftId);
  }

  // Rebuilt wholesale: the pairing can reach shafts on floors nobody is
  // looking at, and a stale link lives on the shaft a storey just left.
  const next = rebuildVerticalDoors({ ...file, floors, groups });

  return commit(state, "align_floor", `Align ${floor.name}`, next);
}

/** The align a commit would make, or the reason it would be refused. */
export function previewAlign(
  state: EditState,
  req: AlignFloorRequest,
): { ok: true; warnings: AlignWarning[] } | { ok: false; reason: string } {
  try {
    alignFloor(state, req);
    return {
      ok: true,
      warnings: alignWarnings(state.layer, req.floorId, req.landings),
    };
  } catch (e) {
    if (e instanceof OperationRejected) return { ok: false, reason: e.message };
    throw e;
  }
}

/** Rooms of a floor, for drawing the reference underlay. */
export function floorShaftRings(layer: VisualLayer, floorId: string) {
  return shaftSpaces(layer, floorId).map((s) => ({
    groupId: s.groupId,
    name: s.room.name,
    rings: interiorRings(ringsOf(layer, s.room)),
  }));
}
