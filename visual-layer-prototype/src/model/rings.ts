/**
 * Room shapes, derived. A room holds an unordered wall set; to draw it you walk
 * the walls in angular order. Angular order is what makes slits, dangling stubs
 * and pinch points come out right — an arbitrary choice produces figure-eights.
 */
import { must, type VisualLayer } from "./load";
import { vertexOf } from "./geometry";
import type { Point, Room, Vertex } from "./types";

const TWO_PI = Math.PI * 2;

/** Python's `%` is always non-negative; JavaScript's keeps the sign. */
function mod(x: number, m: number): number {
  return ((x % m) + m) % m;
}

/** A directed traversal of one wall: wall id, the vertex left, the vertex reached. */
function edgeKey(wallId: string, from: string, to: string): string {
  return `${wallId}\u0000${from}\u0000${to}`;
}

/**
 * Walk the room's walls into closed rings.
 *
 * Build vertex -> incident walls using only this room's walls, then: arrive at
 * a vertex, leave by the next wall in angular order — the one immediately
 * clockwise from the reverse of the arrival direction. Continue to the start;
 * that is one ring. Repeat until every directed traversal is used.
 *
 * Termination is on the starting DIRECTED edge, not the starting vertex: a
 * pinch point appears twice in one traversal and a vertex test would
 * false-positive. A slit wall (room_a === room_b) is in the set once and so is
 * traversed in both senses, which is what makes it render as a cut rather than
 * splitting the room.
 */
export function ringsOf(layer: VisualLayer, room: Room): Vertex[][] {
  return faceWalks(layer, room.walls)
    .filter((face) => face.length > 2)
    .map((face) => face.map((e) => vertexOf(layer, e.from)));
}

/** One step of a face walk: the wall crossed, and in which direction. */
export interface FaceEdge {
  wallId: string;
  from: string;
  to: string;
}

/**
 * The same walk as `ringsOf`, kept in wall terms.
 *
 * Dividing a room needs to know which walls fall on which side of a new one,
 * and a list of vertices cannot say that. This is the one traversal; ringsOf
 * is it with the walls dropped.
 */
export function faceWalks(
  layer: VisualLayer,
  wallIds: Iterable<string>,
): FaceEdge[][] {
  const ids = [...wallIds];
  const incident = new Map<string, Array<{ wallId: string; other: string }>>();
  for (const wallId of ids) {
    const w = must(layer.walls, wallId, "wall");
    for (const [here, other] of [
      [w.v1, w.v2],
      [w.v2, w.v1],
    ] as const) {
      const list = incident.get(here);
      if (list) list.push({ wallId, other });
      else incident.set(here, [{ wallId, other }]);
    }
  }

  const used = new Set<string>();
  const faces: FaceEdge[][] = [];

  for (const startWallId of ids) {
    const sw = must(layer.walls, startWallId, "wall");
    for (const [from, to] of [
      [sw.v1, sw.v2],
      [sw.v2, sw.v1],
    ] as const) {
      if (used.has(edgeKey(startWallId, from, to))) continue;

      const face: FaceEdge[] = [];
      let cur = { wallId: startWallId, from, to };

      while (!used.has(edgeKey(cur.wallId, cur.from, cur.to))) {
        used.add(edgeKey(cur.wallId, cur.from, cur.to));
        face.push({ ...cur });

        const here = vertexOf(layer, cur.to);
        const prev = vertexOf(layer, cur.from);
        const back = Math.atan2(prev.y - here.y, prev.x - here.x);

        const options = incident.get(cur.to) ?? [];
        let best: { angle: number; wallId: string; other: string } | null = null;
        for (const opt of options) {
          // Never turn straight back along the wall we arrived on, unless it is
          // the only way out — a dangling stub has to be walked back.
          if (opt.wallId === cur.wallId && options.length > 1) continue;
          const next = vertexOf(layer, opt.other);
          const angle = mod(
            Math.atan2(next.y - here.y, next.x - here.x) - back,
            TWO_PI,
          );
          if (best === null || angle < best.angle) {
            best = { angle, wallId: opt.wallId, other: opt.other };
          }
        }
        if (best === null) break;
        cur = { wallId: best.wallId, from: cur.to, to: best.other };
      }

      if (face.length > 0) faces.push(face);
    }
  }

  return faces;
}

/**
 * The number of independent cycles, without extracting them:
 *
 *     rings = E - V + C     (E walls, V distinct vertices, C components)
 *
 * O(E) and no geometry, which is what makes it usable as a pre-commit check on
 * an edit: 1 is a simple room, more than 1 is a donut, and a merge about to
 * lose a hole shows up as the count dropping.
 */
export function ringCount(layer: VisualLayer, room: Room): number {
  const verts = new Set<string>();
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const s = adj.get(a);
    if (s) s.add(b);
    else adj.set(a, new Set([b]));
  };

  for (const wallId of room.walls) {
    const w = must(layer.walls, wallId, "wall");
    verts.add(w.v1);
    verts.add(w.v2);
    link(w.v1, w.v2);
    link(w.v2, w.v1);
  }

  const seen = new Set<string>();
  let components = 0;
  for (const v of verts) {
    if (seen.has(v)) continue;
    components += 1;
    const stack = [v];
    seen.add(v);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
  }

  return room.walls.length - verts.size + components;
}

/**
 * The walk traces every face of the room's wall graph, which for a simple room
 * means two: the bounded interior and the unbounded exterior. They are the same
 * closed curve walked in opposite senses, so both report the room's own points
 * as inside — and handing both to an even-odd fill cancels the room out.
 *
 * The traversal rule is deterministic, so the bounded face always lands on the
 * same sign. In these SVG y-down coordinates that sign is negative, which the
 * slit rooms pin down: in `1:L6` and `1:L2` the interior walk runs down both
 * sides of the slit wall (13 vertices for 12 walls) while the exterior walk
 * never touches it (11), and it is the 13 that comes out negative.
 *
 * For a room with a hole the walk yields one bounded face per boundary
 * component — the outer ring and the hole's ring — both negative, which
 * even-odd then renders as a hole without being told.
 */
export function interiorRings(rings: Vertex[][]): Vertex[][] {
  return rings.filter((ring) => signedArea(ring) < 0);
}

/** The interior faces of a room, ready to fill or hit-test. */
export function roomRings(layer: VisualLayer, room: Room): Vertex[][] {
  return interiorRings(ringsOf(layer, room));
}

export function signedArea(ring: Vertex[]): number {
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/** The outer ring is the one with the largest absolute area. */
export function outerRing(rings: Vertex[][]): Vertex[] | null {
  let best: Vertex[] | null = null;
  let bestArea = -1;
  for (const ring of rings) {
    const area = Math.abs(signedArea(ring));
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  return best;
}

/**
 * Even-odd, not winding. Hit-testing and device placement must use even-odd
 * too, or a device dropped in a courtyard is assigned to the hallway around it.
 */
export function insideRing(pt: Point, ring: Vertex[]): boolean {
  let inside = false;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Even-odd across every ring, so a hole is a hole without special-casing. */
export function insideRings(pt: Point, rings: Vertex[][]): boolean {
  let crossings = 0;
  for (const ring of rings) {
    if (insideRing(pt, ring)) crossings += 1;
  }
  return crossings % 2 === 1;
}

/**
 * One path with several subpaths. Rendered with fill-rule="evenodd", so a
 * courtyard or a lift core inside a car park is a hole for free.
 *
 * Pass interior rings only — see interiorRings().
 */
export function ringsToPath(rings: Vertex[][]): string {
  return rings
    .map(
      (ring) =>
        `M ${ring.map((v) => `${v.x} ${v.y}`).join(" L ")} Z`,
    )
    .join(" ");
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Where to put the label: the pole of inaccessibility, not the centroid. A
 * ring-shaped room's centroid lands in the hole and an L-shaped one's lands
 * outside the room entirely.
 *
 * This is a grid search rather than the full polylabel subdivision — accurate
 * enough for a label, and it costs one pass over a coarse grid.
 */
export function labelPoint(rings: Vertex[][]): Point | null {
  if (rings.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const v of ring) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
  }

  const steps = 24;
  let best: Point | null = null;
  let bestClearance = -1;

  for (let i = 1; i < steps; i += 1) {
    for (let j = 1; j < steps; j += 1) {
      const pt = {
        x: minX + ((maxX - minX) * i) / steps,
        y: minY + ((maxY - minY) * j) / steps,
      };
      if (!insideRings(pt, rings)) continue;

      let clearance = Infinity;
      for (const ring of rings) {
        for (let k = 0; k < ring.length; k += 1) {
          const d = distToSegment(pt, ring[k], ring[(k + 1) % ring.length]);
          if (d < clearance) clearance = d;
        }
      }
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = pt;
      }
    }
  }

  // A room too thin for any grid point to land inside still needs a label.
  if (best === null) {
    const ring = outerRing(rings);
    if (!ring) return null;
    const sum = ring.reduce(
      (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / ring.length, y: sum.y / ring.length };
  }
  return best;
}

/**
 * Memoised per room against a version counter. The cost is never in computing
 * one shape — it is in computing it on every render frame.
 */
export class RingCache {
  private cache = new Map<string, Vertex[][]>();
  private version = 0;

  constructor(private layer: VisualLayer) {}

  /** Bump whenever a room's walls or their vertices change. */
  invalidate(): void {
    this.version += 1;
    this.cache.clear();
  }

  /** The room's interior faces — what a renderer and a hit-test both want. */
  get(room: Room): Vertex[][] {
    const key = `${this.version}:${room.id}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const rings = interiorRings(ringsOf(this.layer, room));
    this.cache.set(key, rings);
    return rings;
  }
}
