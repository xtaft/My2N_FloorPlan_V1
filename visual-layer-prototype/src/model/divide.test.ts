/**
 * Dividing a room.
 *
 * The subject is 0:CS2, a plain rectangle from (1435.5, 630.99) to
 * (1661.33, 792.25) whose single door sits on the left wall at t≈0.4. That
 * makes it good for both halves of this: a vertical cut misses the door
 * entirely, and a horizontal one through the middle lands in it.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  divideRoom,
  initEditState,
  interiorRings,
  nearestWallInRoom,
  previewDivide,
  ringsOf,
  signedArea,
  undo,
  vertexOf,
  wallEnds,
  type EditState,
  type Point,
  type VisualLayer,
  type VisualLayerFile,
} from "./index";

const SUBJECT = "0:CS2";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/** A room's area, from its own extracted outline. */
function areaOf(layer: VisualLayer, roomId: string): number {
  const room = layer.rooms.get(roomId)!;
  return interiorRings(ringsOf(layer, room)).reduce(
    (acc, ring) => acc + Math.abs(signedArea(ring)),
    0,
  );
}

function ringCount(layer: VisualLayer, roomId: string): number {
  return interiorRings(ringsOf(layer, layer.rooms.get(roomId)!)).length;
}

/** Every door's midpoint in plan coordinates, keyed by door id. */
function doorPositions(layer: VisualLayer): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const d of layer.file.doors) {
    if (d.wall_id === null || d.t === null) continue;
    const wall = layer.walls.get(d.wall_id);
    if (!wall) continue;
    const [a, b] = wallEnds(layer, wall);
    out.set(d.id, {
      x: a.x + (b.x - a.x) * d.t,
      y: a.y + (b.y - a.y) * d.t,
    });
  }
  return out;
}

/** A vertical cut through the middle, clear of the door on the left wall. */
const VERTICAL = { from: { x: 1548, y: 600 }, to: { x: 1548, y: 820 } };
/** A horizontal cut below the door, which splits the doored wall in two. */
const HORIZONTAL = { from: { x: 1400, y: 760 }, to: { x: 1700, y: 760 } };

describe("divideRoom", () => {
  it("turns one room into two", () => {
    const before = state();
    const after = divideRoom(before, { roomId: SUBJECT, ...VERTICAL });

    expect(after.file.rooms.length).toBe(before.file.rooms.length + 1);
    const added = after.file.rooms.filter(
      (r) => !before.layer.rooms.has(r.id),
    );
    expect(added.length).toBe(1);

    // Both halves are a single closed outline, not a slit or a figure-eight.
    expect(ringCount(after.layer, SUBJECT)).toBe(1);
    expect(ringCount(after.layer, added[0].id)).toBe(1);
  });

  it("conserves the area it divides", () => {
    const before = state();
    const whole = areaOf(before.layer, SUBJECT);
    const after = divideRoom(before, { roomId: SUBJECT, ...VERTICAL });
    const other = after.file.rooms.find((r) => !before.layer.rooms.has(r.id))!;

    const halves = areaOf(after.layer, SUBJECT) + areaOf(after.layer, other.id);
    expect(halves).toBeCloseTo(whole, 6);
    // A cut down the middle, so neither half is a sliver.
    expect(areaOf(after.layer, SUBJECT)).toBeGreaterThan(whole * 0.4);
    expect(areaOf(after.layer, other.id)).toBeGreaterThan(whole * 0.4);
  });

  it("puts the new wall between the two halves, the right way round", () => {
    // The orientation is the thing to get wrong: room_a is the room on the
    // LEFT walking v1 -> v2, and a guess that is backwards looks identical on
    // screen while every door and reader derived from it faces the wrong way.
    // So check it against the rooms' own extracted shapes.
    const before = state();
    const after = divideRoom(before, { roomId: SUBJECT, ...VERTICAL });
    const other = after.file.rooms.find((r) => !before.layer.rooms.has(r.id))!;

    const cut = after.file.walls.filter(
      (w) =>
        !before.layer.walls.has(w.id) &&
        ((w.room_a === SUBJECT && w.room_b === other.id) ||
          (w.room_a === other.id && w.room_b === SUBJECT)),
    );
    expect(cut.length).toBe(1);

    const [v1, v2] = wallEnds(after.layer, cut[0]);
    const mid = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
    // normal() is (dy, -dx) and points toward room_a.
    const len = Math.hypot(v2.x - v1.x, v2.y - v1.y);
    const step = 4;
    const toA = {
      x: mid.x + ((v2.y - v1.y) / len) * step,
      y: mid.y - ((v2.x - v1.x) / len) * step,
    };
    const toB = { x: mid.x * 2 - toA.x, y: mid.y * 2 - toA.y };

    const inside = (pt: Point, roomId: string) => {
      const rings = interiorRings(
        ringsOf(after.layer, after.layer.rooms.get(roomId)!),
      );
      let hit = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i];
          const b = ring[j];
          if (
            a.y > pt.y !== b.y > pt.y &&
            pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
          ) {
            hit = !hit;
          }
        }
      }
      return hit;
    };

    expect(inside(toA, cut[0].room_a)).toBe(true);
    expect(inside(toB, cut[0].room_b)).toBe(true);
  });

  it("leaves the neighbours' shapes alone when a shared wall splits", () => {
    // 0:CS2's top and bottom walls are shared with 0:TECH and 0:CM2. Both get
    // split, so their wall sets change — but neither room may change shape.
    const before = state();
    const was = new Map(
      ["0:TECH", "0:CM2", "0:CS1"].map((id) => [id, areaOf(before.layer, id)]),
    );
    const after = divideRoom(before, { roomId: SUBJECT, ...VERTICAL });

    for (const [id, area] of was) {
      expect(areaOf(after.layer, id)).toBeCloseTo(area, 6);
      expect(ringCount(after.layer, id)).toBe(1);
    }
    // And the split really did happen, so the check above means something.
    expect(after.layer.rooms.get("0:TECH")!.walls.length).toBeGreaterThan(
      before.layer.rooms.get("0:TECH")!.walls.length,
    );
  });

  it("keeps every door exactly where it was when its wall splits", () => {
    // t is rescaled into the fragment rather than the door being re-matched
    // by position, so this has to come out exact, not merely close.
    const before = state();
    const was = doorPositions(before.layer);
    const after = divideRoom(before, { roomId: SUBJECT, ...HORIZONTAL });
    const now = doorPositions(after.layer);

    expect(now.size).toBe(was.size);
    for (const [id, pt] of was) {
      expect(now.get(id)!.x).toBeCloseTo(pt.x, 6);
      expect(now.get(id)!.y).toBeCloseTo(pt.y, 6);
    }
    // The doored wall genuinely split: the door is on a wall that is new.
    const door = after.file.doors.find((d) => d.id === "0:d13" || d.name.includes("CS2"));
    if (door?.wall_id) {
      expect(before.layer.walls.has(door.wall_id)).toBe(false);
    }
  });

  it("gives the new room its neighbour's envelope and type", () => {
    const before = state();
    const room = before.layer.rooms.get(SUBJECT)!;
    const after = divideRoom(before, { roomId: SUBJECT, ...VERTICAL });
    const other = after.file.rooms.find((r) => !before.layer.rooms.has(r.id))!;

    expect(other.group_id).toBe(room.group_id);
    expect(other.space_type).toBe(room.space_type);
    expect(other.floor_id).toBe(room.floor_id);
    expect(other.surfaced).toBe(room.surfaced);
  });

  it("names the new room, and leaves the bigger half named as it was", () => {
    const before = state();
    const after = divideRoom(before, {
      roomId: SUBJECT,
      ...VERTICAL,
      name: "Back store",
    });
    expect(after.layer.rooms.get(SUBJECT)!.name).toBe("Storage");
    expect(after.file.rooms.some((r) => r.name === "Back store")).toBe(true);
  });

  it("is undone completely", () => {
    const before = state();
    const after = divideRoom(before, { roomId: SUBJECT, ...VERTICAL });
    expect(after.file).not.toEqual(before.file);
    expect(undo(after).file).toEqual(before.file);
  });

  it("labels itself on the undo stack", () => {
    const after = divideRoom(state(), { roomId: SUBJECT, ...VERTICAL });
    expect(after.undo.at(-1)!.kind).toBe("divide");
    expect(after.undo.at(-1)!.label).toBe("Add wall");
  });
});

describe("divideRoom refusals", () => {
  const rejects = (req: Parameters<typeof divideRoom>[1], match: RegExp) => {
    const s = state();
    expect(() => divideRoom(s, req)).toThrow(OperationRejected);
    try {
      divideRoom(s, req);
    } catch (e) {
      expect((e as Error).message).toMatch(match);
    }
    // Nothing is written on the way to a refusal.
    expect(s.file).toEqual(state().file);
  };

  it("refuses a cut that starts in a doorway", () => {
    // y = 700 is inside the door's span on the left wall (roughly 673..719).
    rejects(
      { roomId: SUBJECT, from: { x: 1400, y: 700 }, to: { x: 1700, y: 700 } },
      /doorway/,
    );
  });

  it("refuses both ends on the same wall", () => {
    rejects(
      {
        roomId: SUBJECT,
        from: { x: 1480, y: 630.99 },
        to: { x: 1600, y: 630.99 },
      },
      /same wall/,
    );
  });

  it("refuses an end that reaches no wall of the room", () => {
    rejects(
      { roomId: SUBJECT, from: { x: 1548, y: 600 }, to: { x: 3000, y: 3000 } },
      /have to land on a wall/,
    );
  });

  it("refuses a room it does not have", () => {
    expect(() =>
      divideRoom(state(), { roomId: "0:nope", ...VERTICAL }),
    ).toThrow();
  });

  it("reports the reason through previewDivide rather than throwing", () => {
    const bad = previewDivide(state(), {
      roomId: SUBJECT,
      from: { x: 1400, y: 700 },
      to: { x: 1700, y: 700 },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/doorway/);

    expect(previewDivide(state(), { roomId: SUBJECT, ...VERTICAL }).ok).toBe(
      true,
    );
  });
});

describe("nearestWallInRoom", () => {
  it("ignores walls that belong to other rooms", () => {
    const { layer } = state();
    const room = layer.rooms.get(SUBJECT)!;
    // Just outside the left wall, where 0:CM2's own walls are closer to hand.
    const hit = nearestWallInRoom(layer, room, { x: 1430, y: 760 }, 40);
    expect(hit).not.toBeNull();
    expect(room.walls).toContain(hit!.wallId);
  });

  it("finds nothing when the point is far from the room", () => {
    const { layer } = state();
    const room = layer.rooms.get(SUBJECT)!;
    expect(nearestWallInRoom(layer, room, { x: 100, y: 100 }, 40)).toBeNull();
  });

  it("reports the foot of the perpendicular, on the wall", () => {
    const { layer } = state();
    const room = layer.rooms.get(SUBJECT)!;
    const hit = nearestWallInRoom(layer, room, { x: 1548, y: 600 })!;
    const wall = layer.walls.get(hit.wallId)!;
    const [a, b] = wallEnds(layer, wall);
    expect(hit.at.x).toBeCloseTo(a.x + (b.x - a.x) * hit.t, 9);
    expect(hit.at.y).toBeCloseTo(a.y + (b.y - a.y) * hit.t, 9);
    expect(vertexOf(layer, wall.v1)).toBeDefined();
  });
});
