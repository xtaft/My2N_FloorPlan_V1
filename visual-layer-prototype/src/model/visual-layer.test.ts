/**
 * The checks data/verify_visual_layer.py runs, ported. Same assertions, same
 * fixture, so a divergence between the Python reference and this TypeScript
 * port fails here rather than showing up as a wrong map.
 */
import { describe, expect, it } from "vitest";
import {
  EXTERIOR,
  accessType,
  buildAdjacency,
  defaultStartRoom,
  deviceAnchor,
  deviceSide,
  groupCenter,
  doorGeometry,
  doorSpan,
  doorsOfRoom,
  groupEntrances,
  insideRings,
  interiorRings,
  labelPoint,
  normal,
  reachable,
  ringCount,
  ringsOf,
  signedArea,
  roomsInGroup,
  roomsOf,
  routeTo,
  unit,
  visualLayer as layer,
  wallLength,
} from "./index";

const { file } = layer;
const facesByRoom = new Map(file.rooms.map((r) => [r.id, ringsOf(layer, r)]));
const ringsByRoom = new Map(
  file.rooms.map((r) => [r.id, interiorRings(facesByRoom.get(r.id)!)]),
);

describe("nothing derived is stored", () => {
  it("stores no room polygons", () => {
    for (const r of file.rooms) {
      expect(r).not.toHaveProperty("polygon");
    }
  });

  it("stores no room pair on wall-mounted doors", () => {
    const stored = file.doors.filter(
      (d) => d.kind !== "virtual" && d.rooms !== null,
    );
    expect(stored).toEqual([]);
  });

  it("gives openings no leaf", () => {
    for (const d of file.doors.filter((x) => x.kind === "opening")) {
      expect(d.hinge).toBeNull();
      expect(d.swing).toBeNull();
    }
  });

  it("stores the pair on virtual doors, which have no wall to ask", () => {
    for (const d of file.doors.filter((x) => x.kind === "virtual")) {
      expect(d.rooms).toHaveLength(2);
    }
  });
});

describe("referential integrity", () => {
  it("resolves every wall's vertices", () => {
    for (const w of file.walls) {
      expect(layer.vertices.has(w.v1)).toBe(true);
      expect(layer.vertices.has(w.v2)).toBe(true);
    }
  });

  it("resolves every wall's rooms", () => {
    for (const w of file.walls) {
      for (const r of [w.room_a, w.room_b]) {
        expect(r === EXTERIOR || layer.rooms.has(r)).toBe(true);
      }
    }
  });

  it("resolves every door's wall", () => {
    for (const d of file.doors.filter((x) => x.kind !== "virtual")) {
      expect(layer.walls.has(d.wall_id!)).toBe(true);
    }
  });

  it("puts every room in an envelope", () => {
    for (const r of file.rooms) {
      expect(layer.groups.has(r.group_id!)).toBe(true);
    }
  });

  it("resolves every envelope's parent", () => {
    for (const g of file.groups) {
      if (g.parent_group_id !== null) {
        expect(layer.groups.has(g.parent_group_id)).toBe(true);
      }
    }
  });

  it("creates no envelope cycles", () => {
    for (const g of file.groups) {
      const seen = new Set<string>([g.id]);
      let cur = g.parent_group_id;
      while (cur !== null) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = layer.groups.get(cur)?.parent_group_id ?? null;
      }
    }
  });

  it("keeps one floor per envelope subtree", () => {
    for (const g of file.groups) {
      for (const child of layer.childGroups.get(g.id) ?? []) {
        expect(child.floor_id).toBe(g.floor_id);
      }
    }
  });

  it("agrees both ways between room.walls and wall.room_a/room_b", () => {
    const back = new Map<string, Set<string>>();
    for (const w of file.walls) {
      for (const r of [w.room_a, w.room_b]) {
        if (r === EXTERIOR) continue;
        const s = back.get(r);
        if (s) s.add(w.id);
        else back.set(r, new Set([w.id]));
      }
    }
    for (const r of file.rooms) {
      expect([...r.walls].sort()).toEqual(
        [...(back.get(r.id) ?? new Set())].sort(),
      );
    }
  });
});

describe("the orientation convention", () => {
  it("always puts the exterior on room_b", () => {
    for (const w of file.walls) {
      expect(w.room_a).not.toBe(EXTERIOR);
    }
  });

  it("puts room_a on the left of v1->v2, with SVG's y growing downward", () => {
    const wrong: string[] = [];
    for (const w of file.walls) {
      if (w.room_a === EXTERIOR || w.room_a === w.room_b) continue;
      const a = layer.vertices.get(w.v1)!;
      const b = layer.vertices.get(w.v2)!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const n = unit(normal(layer, w));
      const probe = { x: mid.x + n.x * 3, y: mid.y + n.y * 3 };
      const rings = ringsByRoom.get(w.room_a) ?? [];
      if (rings.length > 0 && !insideRings(probe, rings)) wrong.push(w.id);
    }
    expect(wrong).toEqual([]);
  });
});

describe("ring extraction", () => {
  it("closes every room", () => {
    const empty = file.rooms
      .filter((r) => (ringsByRoom.get(r.id) ?? []).length === 0)
      .map((r) => r.id);
    expect(empty).toEqual([]);
  });

  it("traces both faces of every room, one bounded and one unbounded", () => {
    for (const r of file.rooms) {
      const faces = facesByRoom.get(r.id)!;
      expect(faces).toHaveLength(2);
      const areas = faces.map(signedArea);
      expect(areas.filter((a) => a < 0)).toHaveLength(1);
      expect(areas.filter((a) => a > 0)).toHaveLength(1);
      // The same closed curve walked both ways, so equal in magnitude.
      expect(Math.abs(areas[0])).toBeCloseTo(Math.abs(areas[1]), 6);
    }
  });

  it("picks the bounded face as the interior, so a fill does not cancel", () => {
    for (const r of file.rooms) {
      expect(ringsByRoom.get(r.id)).toHaveLength(1);
    }
  });

  it("runs the interior face down both sides of a slit wall", () => {
    // 1:w31 is a slit in the living room of A6: room_a === room_b. The interior
    // face has to walk it twice, the exterior face never touches it.
    const slit = layer.walls.get("1:w31")!;
    expect(slit.room_a).toBe(slit.room_b);

    const room = layer.rooms.get("1:L6")!;
    const [interior] = ringsByRoom.get("1:L6")!;
    const exterior = facesByRoom.get("1:L6")!.find((f) => signedArea(f) > 0)!;
    expect(interior.length).toBe(room.walls.length + 1);
    expect(exterior.length).toBe(room.walls.length - 1);
  });

  it("counts at least one ring per room by the Euler formula", () => {
    for (const r of file.rooms) {
      expect(ringCount(layer, r)).toBeGreaterThanOrEqual(1);
    }
  });

  it("finds a label point inside the room, not at the centroid", () => {
    for (const r of file.rooms) {
      const rings = ringsByRoom.get(r.id)!;
      const pt = labelPoint(rings)!;
      expect(pt).not.toBeNull();
      expect(insideRings(pt, rings)).toBe(true);
    }
  });
});

describe("door placement", () => {
  it("fits every door on its wall", () => {
    const over = file.doors
      .filter((d) => d.kind !== "virtual")
      .filter((d) => {
        const span = doorSpan(layer, d);
        return !span || span[0] < 0 || span[1] > 1;
      })
      .map((d) => d.id);
    expect(over).toEqual([]);
  });

  it("overlaps no two doors on one wall", () => {
    const clash: string[] = [];
    for (const [wallId, doors] of layer.doorsOnWall) {
      const spans = doors
        .map((d) => doorSpan(layer, d))
        .filter((s): s is [number, number] => s !== null)
        .sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < spans.length; i += 1) {
        if (spans[i][0] < spans[i - 1][1]) clash.push(wallId);
      }
    }
    expect(clash).toEqual([]);
  });

  it("puts no door on a slit wall, which has no two sides", () => {
    const onSlit = file.doors
      .filter((d) => d.kind !== "virtual")
      .filter((d) => {
        const w = layer.walls.get(d.wall_id!)!;
        return w.room_a === w.room_b;
      })
      .map((d) => d.id);
    expect(onSlit).toEqual([]);
  });

  it("derives a door's geometry without storing an endpoint", () => {
    for (const d of file.doors.filter((x) => x.kind === "physical")) {
      const g = doorGeometry(layer, d)!;
      expect(g).not.toBeNull();
      // The opening is exactly `width` long, wherever it sits on the wall.
      expect(Math.hypot(g.p2.x - g.p1.x, g.p2.y - g.p1.y)).toBeCloseTo(
        d.width!,
        4,
      );
      // The leaf opens into one of the wall's two rooms, not along the wall.
      expect(Math.hypot(g.openSide.x, g.openSide.y)).toBeCloseTo(1, 6);
      const dot = g.openSide.x * g.alongWall.x + g.openSide.y * g.alongWall.y;
      expect(Math.abs(dot)).toBeLessThan(1e-9);
    }
  });

  it("gives a virtual door no geometry to render", () => {
    for (const d of file.doors.filter((x) => x.kind === "virtual")) {
      expect(doorGeometry(layer, d)).toBeNull();
    }
  });
});

describe("devices", () => {
  it("names a side of its own door in every guards entry", () => {
    for (const dv of file.devices) {
      if (dv.host_kind !== "door" || dv.host_id === null) continue;
      const door = layer.doors.get(dv.host_id)!;
      const pair = roomsOf(layer, door);
      for (const g of dv.guards) {
        expect(pair).toContain(g);
      }
    }
  });

  it("derives a device's side from guards rather than storing it", () => {
    for (const dv of file.devices) {
      if (dv.host_kind !== "door" || dv.guards.length === 0) continue;
      const side = deviceSide(layer, dv);
      expect(side === "a" || side === "b").toBe(true);
    }
  });

  it("draws a reader on the side access is verified from", () => {
    // The sign of the wall normal is the thing to get wrong here, and getting
    // it wrong puts every reader consistently on the far side of its door —
    // visible, but easy to read as a rendering bug rather than a convention
    // error. So assert both halves against the rooms' own extracted shapes:
    // out of the room the reader protects, and into the one you approach from.
    const insideGuarded: string[] = [];
    const notInApproach: string[] = [];
    for (const dv of file.devices) {
      if (dv.host_kind !== "door" || dv.guards.length === 0) continue;
      const door = layer.doors.get(dv.host_id!)!;
      if (door.kind === "virtual") continue;

      const anchor = deviceAnchor(layer, dv);
      expect(anchor).not.toBeNull();

      const pair = roomsOf(layer, door);
      const guarded = dv.guards[0];
      const approach = pair[0] === guarded ? pair[1] : pair[0];

      if (guarded !== EXTERIOR && insideRings(anchor!, ringsByRoom.get(guarded)!)) {
        insideGuarded.push(dv.id);
      }
      if (approach !== EXTERIOR && !insideRings(anchor!, ringsByRoom.get(approach)!)) {
        notInApproach.push(dv.id);
      }
    }
    expect(insideGuarded).toEqual([]);
    expect(notInApproach).toEqual([]);
  });

  it("puts a room-hosted device in the middle of its envelope", () => {
    // Not inside its host room: an answering unit belongs to the flat, whose
    // rooms are folded away by default, so it is drawn where the flat's own
    // name is. Assert it lands in some room of that envelope — the centre of
    // an L-shaped set of rooms is otherwise free to fall in the courtyard.
    const misplaced: string[] = [];
    const offCentre: string[] = [];
    for (const dv of file.devices) {
      if (dv.host_kind !== "room" || dv.host_id === null) continue;
      const anchor = deviceAnchor(layer, dv)!;
      const host = layer.rooms.get(dv.host_id)!;

      if (host.group_id) {
        const middle = groupCenter(layer, host.group_id)!;
        if (anchor.x !== middle.x || anchor.y !== middle.y) offCentre.push(dv.id);
        const members = roomsInGroup(layer, host.group_id);
        if (!members.some((r) => insideRings(anchor, ringsByRoom.get(r.id)!))) {
          misplaced.push(dv.id);
        }
      } else if (!insideRings(anchor, ringsByRoom.get(dv.host_id)!)) {
        misplaced.push(dv.id);
      }
    }
    expect(offCentre).toEqual([]);
    expect(misplaced).toEqual([]);
  });

  it("centres every apartment's answering unit on the flat, not a bedroom", () => {
    // The fixture still stores a position for each one. It is a fallback now,
    // and the point of the change is that it is no longer what gets drawn, so
    // at least one unit must have moved off it.
    const moved = file.devices.filter((dv) => {
      if (dv.host_kind !== "room" || !dv.position) return false;
      const anchor = deviceAnchor(layer, dv)!;
      return anchor.x !== dv.position[0] || anchor.y !== dv.position[1];
    });
    expect(moved.length).toBeGreaterThan(0);
  });

  it("has the two locker-room readers waiting to be placed", () => {
    // Deliberate: a building that arrives with every device already on a
    // door never exercises placing one, and the locker rooms are the
    // natural pair to leave — adjacent, same kind, one each side.
    expect(layer.unplacedDevices.map((d) => d.id).sort()).toEqual([
      "AC-U1",
      "AC-U2",
    ]);
    expect([...file.unplaced_devices].sort()).toEqual(["AC-U1", "AC-U2"]);

    // Waiting means nowhere and nothing checked, but still a reader.
    for (const d of layer.unplacedDevices) {
      expect(d.host_id).toBeNull();
      expect(d.guards).toEqual([]);
      expect(d.floor_id).toBeNull();
      expect(d.host_kind).toBe("door");
    }
  });

  it("surfaces both rooms of a door that carries a guarding device", () => {
    // Placement targets the door, so the reader never sits on a boundary to
    // nowhere. Apartments stay hidden: their rooms are the envelope's business.
    for (const dv of file.devices) {
      if (dv.host_kind !== "door" || dv.guards.length === 0) continue;
      const door = layer.doors.get(dv.host_id!)!;
      if (door.kind === "virtual") continue;
      for (const roomId of roomsOf(layer, door)) {
        const room = layer.rooms.get(roomId);
        if (!room) continue;
        const envelope = room.group_id
          ? layer.groups.get(room.group_id)
          : undefined;
        if (envelope && envelope.space_type !== "apartment") {
          expect(room.surfaced).toBe(true);
        }
      }
    }
  });
});

describe("adjacency and reachability", () => {
  const adj = buildAdjacency(layer);
  const allDevices = new Set(file.devices.map((d) => d.id));
  const lobby = defaultStartRoom(layer);

  it("starts from the lobby on the ground floor", () => {
    expect(lobby).toBe("0:L");
  });

  it("strands nothing with full access", () => {
    const { seen } = reachable(layer, lobby, { allowedDevices: allDevices }, adj);
    const stranded = file.rooms
      .filter((r) => !seen.has(r.id))
      .map((r) => r.id)
      .sort();
    expect(stranded).toEqual([]);
  });

  it("gives every apartment an entrance", () => {
    const noEntry = file.groups
      .filter((g) => g.space_type === "apartment")
      .filter((g) => groupEntrances(layer, g.id).length === 0)
      .map((g) => g.id);
    expect(noEntry).toEqual([]);
  });

  it("puts virtual doors in the same index, so vertical travel is ordinary", () => {
    const lift = file.doors.find((d) => d.id === "vd1")!;
    expect(roomsOf(layer, lift)).toEqual(["0:E", "1:E"]);
    expect(adj.get("0:E")?.some((e) => e.door.id === "vd1")).toBe(true);
    expect(adj.get("1:E")?.some((e) => e.door.id === "vd1")).toBe(true);
  });

  it("links only consecutive levels in a shaft", () => {
    for (const d of file.doors.filter((x) => x.kind === "virtual")) {
      const [a, b] = d.rooms!;
      const la = layer.floors.find((f) => f.id === layer.rooms.get(a)!.floor_id)!;
      const lb = layer.floors.find((f) => f.id === layer.rooms.get(b)!.floor_id)!;
      expect(Math.abs(la.level - lb.level)).toBe(1);
    }
  });

  it("passes a door with no device freely", () => {
    // An interior bedroom door carries nothing, so it is traversed by a
    // profile holding no devices at all.
    const bedroomDoor = file.doors.find((d) => d.id === "1:d14")!;
    expect(layer.devicesOnDoor.get(bedroomDoor.id)).toBeUndefined();
    const { seen } = reachable(layer, "1:L1", { allowedDevices: new Set() }, adj);
    expect(seen.has("1:B1")).toBe(true);
  });

  it("allows free egress: a guard applies only to the side being entered", () => {
    // Walking out of A1 into the hallway passes the entrance reader, which
    // guards 1:L1 — the way in, not the way out.
    const { seen } = reachable(layer, "1:L1", { allowedDevices: new Set() }, adj);
    expect(seen.has("1:H")).toBe(true);
  });

  it("blocks a resident at the doors they have no device for", () => {
    const profile = file.profiles.find((p) => p.id === "P4")!;
    const result = reachable(
      layer,
      lobby,
      { allowedDevices: new Set(profile.devices) },
      adj,
    );
    // Their own flat is reachable...
    expect(result.seen.has("1:L1")).toBe(true);
    expect(result.seen.has("1:B1")).toBe(true);
    // ...their neighbour's is not, and we know which door refused.
    expect(result.seen.has("1:L2")).toBe(false);
    expect(result.blocked.has("1:L2")).toBe(true);
    expect(result.blocked.get("1:L2")).toBe("1:d7");
  });

  it("explains the answer with a route rather than asserting it", () => {
    const profile = file.profiles.find((p) => p.id === "P4")!;
    const result = reachable(
      layer,
      lobby,
      { allowedDevices: new Set(profile.devices) },
      adj,
    );
    const route = routeTo(layer, result, "1:L1");
    expect(route.length).toBeGreaterThan(0);
    // The route ends at the door into the flat.
    expect(route[route.length - 1].id).toBe("1:d11");
    // and every hop shares a room with the next.
    for (let i = 1; i < route.length; i += 1) {
      const prev = roomsOf(layer, route[i - 1]);
      const cur = roomsOf(layer, route[i]);
      expect(prev.some((r) => cur.includes(r))).toBe(true);
    }
  });

  it("handles loops: a room reached twice is not visited twice", () => {
    const result = reachable(layer, lobby, { allowedDevices: allDevices }, adj);
    // Every room, plus `exterior` — a real sentinel node, which is what makes
    // the front door an ordinary door rather than a special case.
    expect(result.seen.size).toBe(file.rooms.length + 1);
    expect(result.seen.has(EXTERIOR)).toBe(true);
    expect(result.via.size).toBe(result.seen.size);
  });
});

describe("type inheritance", () => {
  it("inherits a room's type from the nearest ancestor that defines one", () => {
    // The gym's fitness hall has no type of its own and no typed parent until
    // the gym envelope.
    const gymFloor = layer.rooms.get("0:GM")!;
    expect(gymFloor.space_type).toBeNull();
    expect(accessType(layer, gymFloor)).toBe("gym");

    // A locker room sets its own and overrides the gym.
    const locker = layer.rooms.get("0:GL1")!;
    expect(locker.space_type).toBe("locker_room");
    expect(accessType(layer, locker)).toBe("locker_room");

    // A bedroom inside a flat inherits `apartment` rather than being typed.
    const bedroom = layer.rooms.get("1:B1")!;
    expect(bedroom.space_type).toBeNull();
    expect(accessType(layer, bedroom)).toBe("apartment");
  });

  it("gives every room a resolvable type", () => {
    const untyped = file.rooms
      .filter((r) => accessType(layer, r) === null)
      .map((r) => r.id);
    expect(untyped).toEqual([]);
  });

  it("keeps a surfaced room inside its envelope", () => {
    // Surfacing is purely visual: a locker room with a reader is still part of
    // the gym in the containment tree.
    const locker = layer.rooms.get("0:GL1")!;
    expect(locker.surfaced).toBe(true);
    expect(roomsInGroup(layer, "0:GYM").map((r) => r.id)).toContain("0:GL1");
  });
});

describe("derivations the fixture refuses to store", () => {
  it("finds a room's doors from the doors on its walls", () => {
    const hallway = layer.rooms.get("1:H")!;
    const ids = doorsOfRoom(layer, hallway).map((d) => d.id).sort();
    // Seven flats plus the lift opening and the stair opening.
    expect(ids).toContain("1:d11");
    expect(ids).toContain("1:dA7");
    expect(ids).toContain("1:d19");
    expect(ids).toContain("1:d20");
    expect(ids.length).toBe(9);
  });

  it("finds an envelope's entrances as the doors with one side inside", () => {
    const entrances = groupEntrances(layer, "1:A1").map((d) => d.id).sort();
    expect(entrances).toEqual(["1:d11"]);
  });

  it("measures a wall from its vertices", () => {
    const w = layer.walls.get("0:w1")!;
    expect(wallLength(layer, w)).toBeCloseTo(337.99, 2);
  });
});

describe("the repairs the build recorded", () => {
  it("added the missing A7 entrance on every floor", () => {
    expect(file.repairs).toHaveLength(4);
    for (const repair of file.repairs) {
      const door = layer.doors.get(repair.door)!;
      expect(door.kind).toBe("physical");
      const device = file.devices.find((d) => d.id === repair.device)!;
      expect(device.host_id).toBe(door.id);
      expect(roomsOf(layer, door)).toContain(device.guards[0]);
    }
  });
});

describe("the counts the build reported", () => {
  it("matches the fixture", () => {
    expect(file.counts).toEqual({
      floors: file.floors.length,
      vertices: file.vertices.length,
      walls: file.walls.length,
      rooms: file.rooms.length,
      groups: file.groups.length,
      doors: file.doors.length,
      devices: file.devices.length,
      profiles: file.profiles.length,
    });
  });
});
