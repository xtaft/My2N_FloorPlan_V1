/**
 * Conformance: the fixture against the structural rules stated in
 * docs/floor-plan-visual-layer.md.
 *
 * visual-layer.test.ts ports the checks verify_visual_layer.py already runs.
 * This file covers the rules the doc states in prose that nothing was checking
 * — vertex hygiene, collinear-dissolve debt, the shape of each door kind, the
 * shaft rules, and the one rule itself: that nothing derivable is stored.
 */
import { describe, expect, it } from "vitest";
import {
  EXTERIOR,
  accessType,
  floorEnvelopes,
  passThroughRoom,
  spaceCategories,
  visualLayer as layer,
} from "./index";

const { file } = layer;
const floorOf = (id: string) => id.split(":")[0];

describe("vertex hygiene (Part 1, step 2)", () => {
  it("namespaces every vertex id by floor", () => {
    // Two floors both containing (0,0) would otherwise collide and fuse
    // geometry across storeys, which nothing downstream would catch.
    const stray = file.vertices.filter(
      (v) => !file.floors.some((f) => floorOf(f.id) === floorOf(v.id)),
    );
    expect(stray).toEqual([]);
  });

  it("creates no two vertices in one quantized cell on a floor", () => {
    // The quantized key map is the only way vertices come into existence, so
    // a collision means something bypassed the lookup.
    const EPS = 1;
    const cells = new Map<string, string>();
    const dupes: string[] = [];
    for (const v of file.vertices) {
      const key = `${floorOf(v.id)}:${Math.round(v.x / EPS)}:${Math.round(v.y / EPS)}`;
      const seen = cells.get(key);
      if (seen) dupes.push(`${seen}~${v.id}`);
      else cells.set(key, v.id);
    }
    expect(dupes).toEqual([]);
  });

  it("leaves no degree-0 vertex behind", () => {
    const used = new Set<string>();
    for (const w of file.walls) {
      used.add(w.v1);
      used.add(w.v2);
    }
    const orphans = file.vertices.filter((v) => !used.has(v.id)).map((v) => v.id);
    expect(orphans).toEqual([]);
  });
});

describe("wall integrity (Part 1, steps 3-4)", () => {
  it("has no zero-length wall", () => {
    expect(file.walls.filter((w) => w.v1 === w.v2)).toEqual([]);
  });

  it("fuses no geometry across storeys", () => {
    const crossing = file.walls.filter((w) => {
      const f = floorOf(w.v1);
      if (floorOf(w.v2) !== f) return true;
      return [w.room_a, w.room_b].some(
        (r) => r !== EXTERIOR && floorOf(r) !== f,
      );
    });
    expect(crossing.map((w) => w.id)).toEqual([]);
  });

  it("has no two walls on the same vertex pair", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const w of file.walls) {
      const key = [w.v1, w.v2].sort().join("|");
      const prev = seen.get(key);
      if (prev) dupes.push(`${prev}~${w.id}`);
      else seen.set(key, w.id);
    }
    expect(dupes).toEqual([]);
  });

  it("has run collinear dissolve", () => {
    // Dissolve v when: global degree exactly 2, the two walls collinear within
    // epsilon, identical room pair as an unordered set, v is not a door's
    // anchor. Without it wall counts only grow and "how many walls does this
    // room have" stops meaning anything.
    const incident = new Map<string, typeof file.walls>();
    for (const w of file.walls) {
      for (const v of [w.v1, w.v2]) {
        const l = incident.get(v);
        if (l) l.push(w);
        else incident.set(v, [w]);
      }
    }
    const anchors = new Set<string>();
    for (const d of file.doors) {
      if (!d.wall_id) continue;
      const w = layer.walls.get(d.wall_id)!;
      anchors.add(w.v1);
      anchors.add(w.v2);
    }

    const debt: string[] = [];
    for (const [vid, walls] of incident) {
      if (walls.length !== 2 || anchors.has(vid)) continue;
      const [w1, w2] = walls;
      const pair = (w: (typeof walls)[0]) => [w.room_a, w.room_b].sort().join("|");
      if (pair(w1) !== pair(w2)) continue; // a real junction — must stay

      const v = layer.vertices.get(vid)!;
      const a = layer.vertices.get(w1.v1 === vid ? w1.v2 : w1.v1)!;
      const b = layer.vertices.get(w2.v1 === vid ? w2.v2 : w2.v1)!;
      const cross = (a.x - v.x) * (b.y - v.y) - (a.y - v.y) * (b.x - v.x);
      const scale =
        Math.hypot(a.x - v.x, a.y - v.y) * Math.hypot(b.x - v.x, b.y - v.y);
      if (scale > 0 && Math.abs(cross) / scale < 1e-6) {
        debt.push(`${vid} (${w1.id} + ${w2.id})`);
      }
    }
    expect(debt).toEqual([]);
  });
});

describe("door records carry exactly their kind's fields (Part 2)", () => {
  it("fills every field on a physical door and stores no room pair", () => {
    for (const d of file.doors.filter((x) => x.kind === "physical")) {
      expect(d.wall_id).toBeTruthy();
      expect(d.t).not.toBeNull();
      expect(d.width).not.toBeNull();
      expect(["v1", "v2"]).toContain(d.hinge);
      expect(["a", "b"]).toContain(d.swing);
      expect(d.rooms).toBeNull();
    }
  });

  it("gives an opening a wall, a position and a width but no leaf", () => {
    for (const d of file.doors.filter((x) => x.kind === "opening")) {
      expect(d.wall_id).toBeTruthy();
      expect(d.t).not.toBeNull();
      expect(d.width).not.toBeNull();
      expect(d.hinge).toBeNull();
      expect(d.swing).toBeNull();
      expect(d.rooms).toBeNull();
    }
  });

  it("gives a virtual door nothing but its room pair", () => {
    for (const d of file.doors.filter((x) => x.kind === "virtual")) {
      expect(d.wall_id).toBeNull();
      expect(d.t).toBeNull();
      expect(d.width).toBeNull();
      expect(d.hinge).toBeNull();
      expect(d.swing).toBeNull();
      expect(d.rooms).toHaveLength(2);
    }
  });

  it("distinguishes a door-kind opening from a wall-state opening", () => {
    // A door-kind opening is a doorway in a wall that still exists: it stays
    // an access edge and can carry a device. A wall-state opening means the
    // wall is gone. Conflating them drops every archway out of the graph.
    for (const d of file.doors.filter((x) => x.kind === "opening")) {
      expect(layer.walls.get(d.wall_id!)!.state).toBe("solid");
    }
  });
});

describe("shafts (Part 1, steps 8 and 10)", () => {
  const shaftOfRoom = (roomId: string): string | null => {
    const room = layer.rooms.get(roomId);
    if (!room) return null;
    let g = room.group_id ? layer.groups.get(room.group_id) : undefined;
    while (g) {
      if (g.shaft_id) return g.shaft_id;
      g = g.parent_group_id ? layer.groups.get(g.parent_group_id) : undefined;
    }
    return null;
  };

  it("links one shaft's own rooms with every virtual door", () => {
    for (const d of file.doors.filter((x) => x.kind === "virtual")) {
      const [a, b] = d.rooms!;
      const shaft = shaftOfRoom(a);
      expect(shaft).not.toBeNull();
      expect(shaftOfRoom(b)).toBe(shaft);
    }
  });

  it("puts no two groups on one floor in the same shaft", () => {
    const seen = new Map<string, number>();
    for (const g of file.groups) {
      if (!g.shaft_id) continue;
      const k = `${g.floor_id}|${g.shaft_id}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("leaves no shaft with a single member", () => {
    // A lone member usually means the other floors were not tagged.
    const counts = new Map<string, number>();
    for (const g of file.groups) {
      if (g.shaft_id) counts.set(g.shaft_id, (counts.get(g.shaft_id) ?? 0) + 1);
    }
    expect([...counts].filter(([, n]) => n < 2)).toEqual([]);
  });

  it("puts readers on the physical door into the shaft, never on a link", () => {
    // Hardware lives on the hallway door, which is also why regenerating the
    // vertical doors can never destroy a device.
    const onLink = file.devices.filter(
      (dv) =>
        dv.host_kind === "door" &&
        dv.host_id !== null &&
        layer.doors.get(dv.host_id)?.kind === "virtual",
    );
    expect(onLink.map((d) => d.id)).toEqual([]);
  });
});

describe("devices (Part 2, Part 3)", () => {
  it("resolves every host", () => {
    for (const d of file.devices) {
      if (d.host_id === null) continue;
      if (d.host_kind === "room") expect(layer.rooms.has(d.host_id)).toBe(true);
      else if (d.host_kind === "door") expect(layer.doors.has(d.host_id)).toBe(true);
      else throw new Error(`${d.id}: host_kind is ${d.host_kind}`);
    }
  });

  it("gives a room-hosted device a position and nothing to guard", () => {
    for (const d of file.devices.filter((x) => x.host_kind === "room")) {
      expect(d.position).not.toBeNull();
      expect(d.guards).toEqual([]);
    }
  });

  it("gives a door-hosted device guards and no position", () => {
    // On a door, not merely of the kind that goes on doors: a reader
    // waiting to be placed keeps its kind and has nothing to guard yet.
    for (const d of file.devices.filter(
      (x) => x.host_kind === "door" && x.host_id !== null,
    )) {
      expect(d.position).toBeNull();
      // An unguarded reader on a real door is a configuration error worth
      // surfacing, so the fixture should not contain one.
      expect(d.guards.length).toBeGreaterThan(0);
    }
  });

  it("agrees with its host about which floor it is on", () => {
    const wrong: string[] = [];
    for (const d of file.devices) {
      if (d.host_id === null) continue;
      let hostFloor: string | null = null;
      if (d.host_kind === "room") {
        hostFloor = layer.rooms.get(d.host_id)!.floor_id;
      } else {
        const door = layer.doors.get(d.host_id)!;
        if (door.wall_id) {
          const w = layer.walls.get(door.wall_id)!;
          hostFloor = layer.rooms.get(w.room_a)?.floor_id ?? null;
        }
      }
      if (hostFloor !== null && d.floor_id !== hostFloor) wrong.push(d.id);
    }
    expect(wrong).toEqual([]);
  });
});

describe("surfacing (Part 3)", () => {
  /**
   * The doc says "Both of the door's rooms surface, so the reader never sits
   * on a boundary to nowhere." The fixture surfaces only the non-apartment
   * side, which satisfies the stated reason while keeping flats collapsed —
   * and keeping them collapsed is what the rest of the section asks for
   * ("Rooms default to hidden; the group is what the map shows"). Taken
   * literally the sentence would surface all 28 apartment living rooms and
   * explode every flat on the map.
   *
   * So these two tests pin the behaviour the fixture actually has, and the
   * reason the rule exists.
   */
  it("never leaves a reader on a boundary to nowhere", () => {
    const nowhere: string[] = [];
    for (const dv of file.devices) {
      if (dv.host_kind !== "door" || dv.host_id === null) continue;
      if (dv.guards.length === 0) continue;
      const door = layer.doors.get(dv.host_id)!;
      if (!door.wall_id) continue;
      const w = layer.walls.get(door.wall_id)!;
      const sides = [w.room_a, w.room_b]
        .map((id) => layer.rooms.get(id))
        .filter((r) => r !== undefined);
      if (!sides.some((r) => r!.surfaced)) nowhere.push(dv.id);
    }
    expect(nowhere).toEqual([]);
  });

  it("keeps apartments collapsed, surfacing only the hallway side", () => {
    const surfacedApartmentRooms = file.rooms
      .filter((r) => r.surfaced && accessType(layer, r) === "apartment")
      .map((r) => r.id);
    expect(surfacedApartmentRooms).toEqual([]);
  });
});

describe("the one rule: nothing derivable is stored", () => {
  /**
   * These three fields in the fixture ARE derivable, so by the doc's own rule
   * they should not be stored at all. They are build-report metadata rather
   * than model state, and the model layer derives rather than trusting them —
   * but while they sit in the file they can go stale, so pin them.
   */
  it("keeps unplaced_devices consistent with the devices that have no host", () => {
    const derived = file.devices
      .filter((d) => d.host_id === null)
      .map((d) => d.id)
      .sort();
    expect([...file.unplaced_devices].sort()).toEqual(derived);
  });

  it("keeps counts consistent with the arrays they count", () => {
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

  it("keeps profile.rooms consistent with what its devices guard", () => {
    const guardsOf = new Map(file.devices.map((d) => [d.id, d.guards]));
    for (const p of file.profiles) {
      const derived = [
        ...new Set(p.devices.flatMap((id) => guardsOf.get(id) ?? [])),
      ].sort();
      expect([...p.rooms].sort()).toEqual(derived);
    }
  });
});

describe("the tree under a floor", () => {
  it("names each floor once, not twice", () => {
    // Every floor's single top-level group holds no rooms and exists only to
    // parent the real envelopes, so showing it repeats the floor row.
    for (const floor of layer.floors) {
      const envelopes = floorEnvelopes(layer, floor.id);
      expect(envelopes.length).toBeGreaterThan(1);
      expect(envelopes.map((g) => g.id)).not.toContain(`${floorOf(floor.id)}:floorgroup`);
    }
  });

  it("keeps a top-level group that does own rooms", () => {
    // The rule is "holds no rooms", not "is called floorgroup".
    for (const floor of layer.floors) {
      for (const group of floorEnvelopes(layer, floor.id)) {
        const holdsRooms = file.rooms.some((r) => r.group_id === group.id);
        const children = layer.childGroups.get(group.id) ?? [];
        expect(holdsRooms || children.length > 0).toBe(true);
      }
    }
  });

  it("reaches every room on the floor through what it returns", () => {
    for (const floor of layer.floors) {
      const reached = new Set<string>();
      const walk = (groupId: string) => {
        for (const r of file.rooms) if (r.group_id === groupId) reached.add(r.id);
        for (const c of layer.childGroups.get(groupId) ?? []) walk(c.id);
      };
      for (const g of floorEnvelopes(layer, floor.id)) walk(g.id);

      const onFloor = (layer.roomsByFloor.get(floor.id) ?? []).map((r) => r.id);
      expect([...reached].sort()).toEqual([...onFloor].sort());
    }
  });
});

describe("the categories panel groups by envelope", () => {
  it("counts apartments, not the rooms inside them", () => {
    const apartments = spaceCategories(layer).find((c) => c.id === "apartment")!;
    expect(apartments.groups).toHaveLength(28); // 7 flats on each of 4 floors
    for (const g of apartments.groups) expect(g.space_type).toBe("apartment");

    // The rooms are a level further in, not in the count.
    const roomCount = file.rooms.filter(
      (r) => accessType(layer, r) === "apartment",
    ).length;
    expect(roomCount).toBe(76);
  });

  it("leaves room-level types out of the top level", () => {
    // `locker_room` and `room` are overrides set on rooms inside the gym, so
    // they belong under Gym rather than as categories of their own.
    const ids = spaceCategories(layer).map((c) => c.id);
    expect(ids).not.toContain("locker_room");
    expect(ids).not.toContain("room");
    expect(ids).toEqual([
      "apartment",
      "circulation",
      "elevator",
      "stairs",
      "commercial",
      "gym",
      "technical",
      null,
    ]);
  });

  it("treats a one-room envelope as that room", () => {
    // A stairwell is an envelope holding one room called Stairs; listing
    // both puts a row inside an identical row.
    for (const id of ["0:gS", "0:gE", "0:gL", "1:gH", "0:gTECH"]) {
      const group = layer.groups.get(id)!;
      const only = passThroughRoom(layer, group);
      expect(only).not.toBeNull();
      expect(only!.group_id).toBe(id);
    }
  });

  it("keeps the level where the envelope says something the rooms do not", () => {
    // A shop and its storage, and the gym with its changing rooms.
    for (const id of ["0:C1", "0:C2", "0:GYM", "1:A1"]) {
      expect(passThroughRoom(layer, layer.groups.get(id)!)).toBeNull();
    }
  });

  it("always offers the unbound bucket, empty here", () => {
    const unknown = spaceCategories(layer).find((c) => c.id === null)!;
    expect(unknown.name).toBe("Unknown");
    expect(unknown.groups).toEqual([]);
  });

  it("reaches every room through category -> envelope -> rooms", () => {
    const seen = new Set<string>();
    const walk = (groupId: string) => {
      for (const r of file.rooms) if (r.group_id === groupId) seen.add(r.id);
      for (const c of layer.childGroups.get(groupId) ?? []) walk(c.id);
    };
    for (const category of spaceCategories(layer)) {
      for (const g of category.groups) walk(g.id);
    }
    expect(seen.size).toBe(file.rooms.length);
  });

  it("finds the gym's locker rooms nested inside the gym", () => {
    const gym = spaceCategories(layer).find((c) => c.id === "gym")!;
    expect(gym.groups.map((g) => g.id)).toEqual(["0:GYM"]);
    const children = layer.childGroups.get("0:GYM") ?? [];
    expect(children.map((g) => g.name).sort()).toEqual([
      "Locker room M",
      "Locker room W",
    ]);
  });
});

describe("space types (Part 3)", () => {
  it("names a declared type wherever a type is set", () => {
    const declared = new Set(file.space_types.map((t) => t.id));
    const unknown = [
      ...file.rooms.filter((r) => r.space_type && !declared.has(r.space_type)).map((r) => r.id),
      ...file.groups.filter((g) => g.space_type && !declared.has(g.space_type)).map((g) => g.id),
    ];
    expect(unknown).toEqual([]);
  });

  it("holds colour on the type and nowhere else", () => {
    // A room or group holds no colour of its own, so the types panel owns
    // rename and recolour and every space of that type follows.
    for (const r of file.rooms) expect(r).not.toHaveProperty("color");
    for (const g of file.groups) expect(g).not.toHaveProperty("color");
    for (const t of file.space_types) expect(t.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe("floors (Part 1, step 9)", () => {
  it("gives each floor a unique level", () => {
    const levels = file.floors.map((f) => f.level);
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("stores a transform of dx, dy, rotation and one uniform scale", () => {
    // Uniform scale only: independent x/y scaling would make walls
    // non-perpendicular. Alignment is never baked into the vertices.
    for (const f of file.floors) {
      expect(f.transform).toHaveLength(4);
      expect(f.transform[3]).toBeGreaterThan(0);
    }
  });
});
