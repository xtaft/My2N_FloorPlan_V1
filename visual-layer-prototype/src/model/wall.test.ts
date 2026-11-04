/**
 * Drawing a wall that need not divide anything — and the rooms that
 * appear when a later wall closes it.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  EXTERIOR,
  OperationRejected,
  addStoreys,
  addWall,
  faceWalks,
  initEditState,
  interiorRings,
  previewAddWall,
  ringsOf,
  signedArea,
  undo,
  vertexOf,
  visualLayer,
  type EditState,
  type Room,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/**
 * A plain rectangular room with nothing drawn inside it, with its box.
 * Picked rather than named so the test does not depend on which room
 * the fixture happens to draw that way.
 */
function rectangle(st: EditState): { room: Room; x0: number; x1: number; y0: number; y1: number } {
  for (const room of st.layer.file.rooms) {
    if (room.walls.length !== 4) continue;
    if (room.walls.some((id) => { const w = st.layer.walls.get(id)!; return w.room_a === w.room_b; })) continue;
    const rings = interiorRings(ringsOf(st.layer, room));
    if (rings.length !== 1 || rings[0].length !== 4) continue;
    const xs = [...new Set(rings[0].map((v) => Math.round(v.x)))];
    const ys = [...new Set(rings[0].map((v) => Math.round(v.y)))];
    if (xs.length !== 2 || ys.length !== 2) continue;
    const [x0, x1] = xs.sort((a, b) => a - b);
    const [y0, y1] = ys.sort((a, b) => a - b);
    if (x1 - x0 < 120 || y1 - y0 < 120) continue;
    return { room, x0, x1, y0, y1 };
  }
  throw new Error("the fixture has no plain rectangle to draw in");
}

/** In every room's interior face, a wall walked v1 -> v2 has that room on its left. */
function expectHandsRight(st: EditState) {
  for (const room of st.layer.file.rooms) {
    const faces = faceWalks(st.layer, room.walls).filter(
      (f) => f.length > 2 && signedArea(f.map((e) => vertexOf(st.layer, e.from))) < 0,
    );
    for (const face of faces) {
      for (const e of face) {
        const w = st.layer.walls.get(e.wallId)!;
        if (w.room_a === w.room_b) continue;
        expect([w.id, e.from === w.v1]).toEqual([w.id, w.room_a === room.id]);
      }
    }
  }
}

describe("the hand of the walk", () => {
  it("is the same for every edge of every room in the fixture", () => {
    expectHandsRight(state());
  });
});

describe("addWall inside a room", () => {
  it("leaves a slit when the wall stops short of the other side", () => {
    const st = state();
    const { room, x0, x1, y0, y1 } = rectangle(st);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    const next = addWall(st, { floorId: room.floor_id, from: { x: cx, y: y0 }, to: { x: cx, y: cy } });

    expect(next.layer.file.rooms.length).toBe(st.layer.file.rooms.length);
    const after = next.layer.rooms.get(room.id)!;
    // The top wall split in two, plus the slit: three where there were... four plus two.
    expect(after.walls.length).toBe(room.walls.length + 2);
    const slit = after.walls
      .map((id) => next.layer.walls.get(id)!)
      .find((w) => w.room_a === w.room_b);
    expect(slit).toBeDefined();
    expect(slit!.room_a).toBe(room.id);
    // Still one outline, with the slit walked down and back inside it.
    expect(interiorRings(ringsOf(next.layer, after)).length).toBe(1);
    expectHandsRight(next);
  });

  it("makes a room in the corner when the second wall closes it", () => {
    const st = state();
    const { room, x0, x1, y0, y1 } = rectangle(st);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    const one = addWall(st, { floorId: room.floor_id, from: { x: cx, y: y0 }, to: { x: cx, y: cy } });
    // From the loose end of the first wall to the right-hand wall.
    const two = addWall(one, {
      floorId: room.floor_id,
      from: { x: cx, y: cy },
      to: { x: x1, y: cy },
      name: "Corner",
    });

    expect(two.layer.file.rooms.length).toBe(st.layer.file.rooms.length + 1);
    const corner = two.layer.file.rooms.find((r) => r.name === "Corner")!;
    const host = two.layer.rooms.get(room.id)!;
    expect(corner.group_id).toBe(room.group_id);
    expect(corner.floor_id).toBe(room.floor_id);
    // Four walls round the corner room: the two drawn, the top piece and the right piece.
    expect(interiorRings(ringsOf(two.layer, corner))[0].length).toBe(4);
    // The bigger piece kept the name and is one outline with no slit left in it.
    expect(interiorRings(ringsOf(two.layer, host)).length).toBe(1);
    for (const id of host.walls) {
      const w = two.layer.walls.get(id)!;
      expect(w.room_a === w.room_b).toBe(false);
    }
    // Both drawn walls now stand between the two rooms, the right way round.
    const between = two.layer.file.walls.filter(
      (w) =>
        (w.room_a === room.id && w.room_b === corner.id) ||
        (w.room_a === corner.id && w.room_b === room.id),
    );
    expect(between.length).toBe(2);
    expectHandsRight(two);
  });

  it("divides a room outright when drawn across it, as divideRoom does", () => {
    const st = state();
    const { room, x0, x1, y0, y1 } = rectangle(st);
    const cx = (x0 + x1) / 2;
    const next = addWall(st, { floorId: room.floor_id, from: { x: cx, y: y0 }, to: { x: cx, y: y1 } });
    expect(next.layer.file.rooms.length).toBe(st.layer.file.rooms.length + 1);
    expectHandsRight(next);
  });

  it("refuses a line that cuts through a wall, and a wall drawn twice", () => {
    const st = state();
    const { room, x0, x1, y0, y1 } = rectangle(st);
    const cy = (y0 + y1) / 2;
    expect(
      previewAddWall(st, { floorId: room.floor_id, from: { x: x0 - 60, y: cy }, to: { x: x1 + 60, y: cy } }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/crosses/) });

    // A wall standing free inside the room, drawn twice: the second
    // time both ends snap to the corners the first made.
    const free = { from: { x: x0 + 40, y: cy }, to: { x: x1 - 40, y: cy } };
    const one = addWall(st, { floorId: room.floor_id, ...free });
    expect(() => addWall(one, { floorId: room.floor_id, ...free })).toThrow(/already/);
  });

  it("is one undo", () => {
    const st = state();
    const { room, x0, x1, y0, y1 } = rectangle(st);
    const next = addWall(st, {
      floorId: room.floor_id,
      from: { x: (x0 + x1) / 2, y: y0 },
      to: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
    });
    expect(undo(next).file).toBe(st.file);
  });
});

describe("addWall on open floor", () => {
  const square = (st: EditState, floorId: string, x: number, y: number, s: number, name?: string) => {
    let cur = st;
    const pts = [
      { x, y },
      { x: x + s, y },
      { x: x + s, y: y + s },
      { x, y: y + s },
    ];
    for (let i = 0; i < 4; i += 1) {
      cur = addWall(cur, { floorId, from: pts[i], to: pts[(i + 1) % 4], name });
    }
    return cur;
  };

  it("draws the first room of a plan from scratch, four walls at a time", () => {
    const { state: st, floorIds } = addStoreys(state(), ["Roof"]);
    const floorId = floorIds[0];
    expect(st.layer.roomsByFloor.get(floorId) ?? []).toEqual([]);

    // Three walls: nothing closed yet, three slits on open floor.
    let cur = st;
    const pts = [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 100, y: 300 }];
    for (let i = 0; i < 3; i += 1) {
      cur = addWall(cur, { floorId, from: pts[i], to: pts[i + 1] });
    }
    expect(cur.layer.roomsByFloor.get(floorId) ?? []).toEqual([]);
    const open = cur.layer.file.walls.filter((w) => w.v1.startsWith(floorId.split(":")[0] + ":"));
    expect(open.length).toBe(3);
    for (const w of open) expect([w.room_a, w.room_b]).toEqual([EXTERIOR, EXTERIOR]);

    // The fourth closes it.
    cur = addWall(cur, { floorId, from: pts[3], to: pts[0], name: "Plant room" });
    const rooms = cur.layer.roomsByFloor.get(floorId) ?? [];
    expect(rooms.map((r) => r.name)).toEqual(["Plant room"]);
    const room = rooms[0];
    expect(room.walls.length).toBe(4);
    for (const id of room.walls) {
      const w = cur.layer.walls.get(id)!;
      expect(w.room_a).toBe(room.id);
      expect(w.room_b).toBe(EXTERIOR);
    }
    expect(interiorRings(ringsOf(cur.layer, room))[0].length).toBe(4);
    expectHandsRight(cur);
  });

  it("adds a room beside the first, sharing the wall between them", () => {
    const { state: st, floorIds } = addStoreys(state(), ["Roof"]);
    const floorId = floorIds[0];
    let cur = square(st, floorId, 100, 100, 200, "West");
    // Three more walls hang a second square off the east wall of the first.
    cur = addWall(cur, { floorId, from: { x: 300, y: 100 }, to: { x: 500, y: 100 } });
    cur = addWall(cur, { floorId, from: { x: 500, y: 100 }, to: { x: 500, y: 300 } });
    cur = addWall(cur, { floorId, from: { x: 500, y: 300 }, to: { x: 300, y: 300 }, name: "East" });

    const rooms = cur.layer.roomsByFloor.get(floorId) ?? [];
    expect(rooms.map((r) => r.name).sort()).toEqual(["East", "West"]);
    const west = rooms.find((r) => r.name === "West")!;
    const east = rooms.find((r) => r.name === "East")!;
    const shared = cur.layer.file.walls.filter(
      (w) =>
        (w.room_a === west.id && w.room_b === east.id) ||
        (w.room_a === east.id && w.room_b === west.id),
    );
    expect(shared.length).toBe(1);
    // The outside stays on room_b everywhere.
    for (const w of cur.layer.file.walls) {
      if (w.v1.startsWith(floorId.split(":")[0] + ":")) expect(w.room_a).not.toBe(EXTERIOR);
    }
    expectHandsRight(cur);
  });

  it("refuses a zero-length wall", () => {
    const { state: st, floorIds } = addStoreys(state(), ["Roof"]);
    expect(() =>
      addWall(st, { floorId: floorIds[0], from: { x: 10, y: 10 }, to: { x: 10, y: 10 } }),
    ).toThrow(OperationRejected);
  });
});

// Keep the exported name in use so the type import is not flagged.
void visualLayer;
