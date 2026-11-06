/**
 * Which side is which, and where a door sits. Every "side" question resolves
 * from the wall direction; no side is stored anywhere except as a/b.
 */
import { must, type VisualLayer } from "./load";
import type { Door, Point, Vertex, Wall } from "./types";

export function vertexOf(layer: VisualLayer, id: string): Vertex {
  return must(layer.vertices, id, "vertex");
}

export function wallEnds(layer: VisualLayer, wall: Wall): [Vertex, Vertex] {
  return [vertexOf(layer, wall.v1), vertexOf(layer, wall.v2)];
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function wallLength(layer: VisualLayer, wall: Wall): number {
  const [a, b] = wallEnds(layer, wall);
  return dist(a, b);
}

/**
 * Points toward `room_a`. SVG's y axis grows DOWNWARD, so left-of-travel
 * walking v1 -> v2 is (dy, -dx) — not the (-dy, dx) of a y-up system.
 *
 * Getting this sign wrong puts every swing arc and every reader marker
 * consistently on the wrong side, which reads as a rendering bug rather than
 * what it is: a convention error.
 */
export function normal(layer: VisualLayer, wall: Wall): Point {
  const [a, b] = wallEnds(layer, wall);
  return { x: b.y - a.y, y: -(b.x - a.x) };
}

export function unit(p: Point): Point {
  const len = Math.hypot(p.x, p.y);
  // A slit wall has no meaningful side; guard the renderer against a zero normal.
  if (len === 0) return { x: 0, y: 0 };
  return { x: p.x / len, y: p.y / len };
}

export function negate(p: Point): Point {
  return { x: -p.x, y: -p.y };
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function add(a: Point, b: Point, scale = 1): Point {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale };
}

export interface DoorGeometry {
  /** The two ends of the opening along the wall. */
  p1: Point;
  p2: Point;
  /** Which end the swing arc centres on. */
  hingePoint: Point;
  /** The other end of the opening. */
  freePoint: Point;
  /** Unit vector into the room the leaf opens into. */
  openSide: Point;
  /** Unit vector along the wall, pointing from hinge to free end. */
  alongWall: Point;
  width: number;
}

/**
 * The whole door renders from `t`, `width`, `hinge`, `swing` and the wall's two
 * vertices. No door endpoint is stored, so a door and its wall cannot disagree.
 *
 * Returns null for a virtual door, which has no wall to sit in.
 */
export function doorGeometry(
  layer: VisualLayer,
  door: Door,
): DoorGeometry | null {
  if (door.wall_id === null || door.t === null || door.width === null) {
    return null;
  }
  const wall = must(layer.walls, door.wall_id, "wall");
  const [a, b] = wallEnds(layer, wall);
  const L = dist(a, b);
  if (L === 0) return null;

  const half = door.width / 2 / L;
  const p1 = lerp(a, b, door.t - half);
  const p2 = lerp(a, b, door.t + half);

  const hingeAtV1 = door.hinge !== "v2";
  const hingePoint = hingeAtV1 ? p1 : p2;
  const freePoint = hingeAtV1 ? p2 : p1;

  const n = unit(normal(layer, wall));
  const openSide = door.swing === "b" ? negate(n) : n;

  return {
    p1,
    p2,
    hingePoint,
    freePoint,
    openSide,
    alongWall: unit({ x: freePoint.x - hingePoint.x, y: freePoint.y - hingePoint.y }),
    width: door.width,
  };
}

/**
 * The 0..1 span a door occupies on its wall, for the fit and overlap checks.
 */
export function doorSpan(
  layer: VisualLayer,
  door: Door,
): [number, number] | null {
  if (door.wall_id === null || door.t === null || door.width === null) {
    return null;
  }
  const L = wallLength(layer, must(layer.walls, door.wall_id, "wall"));
  if (L === 0) return null;
  const half = door.width / 2 / L;
  return [door.t - half, door.t + half];
}

/**
 * The parts of a wall that are actually built, as 0..1 spans with every door's
 * opening removed.
 *
 * Doors never split their wall: a wall with a door is still one wall with two
 * vertices, and the gap is computed here, when drawing. Remove the door and the
 * wall is whole again with nothing to rejoin.
 *
 * A wall whose `state` is "opening" was knocked through — the record survives
 * so it can be restored, but there is nothing left to draw.
 */
export function wallSolidSpans(
  layer: VisualLayer,
  wall: Wall,
): Array<[number, number]> {
  if (wall.state === "opening") return [];

  const openings = (layer.doorsOnWall.get(wall.id) ?? [])
    .map((d) => doorSpan(layer, d))
    .filter((s): s is [number, number] => s !== null)
    .map(([a, b]): [number, number] => [
      Math.max(0, Math.min(1, a)),
      Math.max(0, Math.min(1, b)),
    ])
    .sort((x, y) => x[0] - y[0]);

  const spans: Array<[number, number]> = [];
  let cursor = 0;
  for (const [start, end] of openings) {
    if (start > cursor) spans.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1) spans.push([cursor, 1]);
  return spans;
}
