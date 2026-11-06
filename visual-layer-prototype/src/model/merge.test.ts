/**
 * Removing a wall, and the merge it is.
 *
 * Floor 1 carries the interesting cases as real data:
 *
 *   1:L2 | 1:T2  three shared wall fragments — one goes, two become slits
 *   1:H  | 1:L1  a hallway and a flat, with a reader on the shared door
 *   1:L1 | 1:L2  two apartments, which the right-hand rule settles
 *   1:B1 | 1:L1  two separate runs, which single-wall deletion handles
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  deleteWall,
  initEditState,
  interiorRings,
  previewDeleteWall,
  ringsOf,
  sharedWalls,
  signedArea,
  undo,
  type EditState,
  type VisualLayer,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

function areaOf(layer: VisualLayer, roomId: string): number {
  const room = layer.rooms.get(roomId)!;
  return interiorRings(ringsOf(layer, room)).reduce(
    (acc, ring) => acc + Math.abs(signedArea(ring)),
    0,
  );
}

/** The first wall shared by two rooms, as a click on it would find. */
function wallBetween(layer: VisualLayer, a: string, b: string): string {
  const shared = sharedWalls(layer, a, b);
  expect(shared.length).toBeGreaterThan(0);
  return shared[0].id;
}

describe("deleteWall", () => {
  it("merges the two rooms into one", () => {
    const before = state();
    const whole = areaOf(before.layer, "1:L2") + areaOf(before.layer, "1:T2");
    const id = wallBetween(before.layer, "1:L2", "1:T2");
    // room_b is the side kept, and the test should say which that is rather
    // than discover it.
    const survivor = before.layer.walls.get(id)!.room_b;

    const after = deleteWall(before, { wallId: id });

    expect(after.file.rooms.length).toBe(before.file.rooms.length - 1);
    expect(after.layer.rooms.has(survivor)).toBe(true);
    expect(areaOf(after.layer, survivor)).toBeCloseTo(whole, 6);
  });

  it("deletes the clicked wall and no other", () => {
    const before = state();
    const shared = sharedWalls(before.layer, "1:L2", "1:T2");
    expect(shared.length).toBe(3);

    const after = deleteWall(before, { wallId: shared[0].id });

    expect(after.layer.walls.has(shared[0].id)).toBe(false);
    expect(after.file.walls.length).toBe(before.file.walls.length - 1);
  });

  it("leaves the walls it did not delete standing, as slits", () => {
    // Two sides of the toilet are still masonry after one is knocked out.
    // The same room is now on both sides of them, which is what a slit is.
    const before = state();
    const shared = sharedWalls(before.layer, "1:L2", "1:T2");
    const after = deleteWall(before, { wallId: shared[0].id });
    const survivor = before.layer.walls.get(shared[0].id)!.room_b;

    for (const w of shared.slice(1)) {
      const now = after.layer.walls.get(w.id);
      expect(now).toBeDefined();
      expect(now!.room_a).toBe(survivor);
      expect(now!.room_b).toBe(survivor);
    }
    expect(after.layer.rooms.get(survivor)!.walls).toContain(shared[1].id);
  });

  it("still closes the merged room into one outline", () => {
    // Slits are traversed down both sides, so the shape stays closed even
    // with two stubs of wall standing inside it.
    const before = state();
    const shared = sharedWalls(before.layer, "1:L2", "1:T2");
    const survivor = before.layer.walls.get(shared[0].id)!.room_b;
    const after = deleteWall(before, { wallId: shared[0].id });

    expect(
      interiorRings(ringsOf(after.layer, after.layer.rooms.get(survivor)!)).length,
    ).toBe(1);
  });

  it("refuses to merge two rooms around a third", () => {
    // 1:B1 and 1:L1 wrap around the bathroom, meeting on either side of it.
    // Once they are one room their walls close a loop around it, and an
    // even-odd fill then paints the bathroom as part of the merged room
    // while it carries on being its own space. Deleting only the clicked
    // wall does not help: the bathroom is enclosed either way.
    const before = state();
    const shared = sharedWalls(before.layer, "1:B1", "1:L1");
    expect(shared.length).toBe(2);

    expect(() => deleteWall(before, { wallId: shared[0].id })).toThrow(
      OperationRejected,
    );
    const preview = previewDeleteWall(before, { wallId: shared[0].id });
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.reason).toMatch(/wrap around Bathroom/);
  });

  it("names whatever would be swallowed, not just that something would", () => {
    // The same shape with a different occupant: the lobby and shop floor
    // meet on either side of the stairs.
    const before = state();
    const shared = sharedWalls(before.layer, "0:CM1", "0:L");
    const preview = previewDeleteWall(before, { wallId: shared[0].id });
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.reason).toMatch(/wrap around Stairs/);
  });

  it("keeps the room on the right of the wall", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L2", "1:T2");
    const wall = before.layer.walls.get(id)!;

    const after = deleteWall(before, { wallId: id });

    expect(after.layer.rooms.has(wall.room_b)).toBe(true);
    expect(after.layer.rooms.has(wall.room_a)).toBe(false);
    expect(after.layer.rooms.get(wall.room_b)!.name).toBe(
      before.layer.rooms.get(wall.room_b)!.name,
    );
  });

  it("keeps doors on the walls that survive", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:H", "1:L1");
    const kept = before.file.doors.filter((d) => d.wall_id !== id);

    const after = deleteWall(before, { wallId: id });
    expect(after.file.doors.some((d) => d.wall_id === id)).toBe(false);
    for (const d of kept) {
      // Only doors stranded on a slit go with it; the rest are all still here.
      const slit = after.layer.walls.get(d.wall_id ?? "");
      if (slit && slit.room_a === slit.room_b) continue;
      expect(after.file.doors.some((x) => x.id === d.id)).toBe(true);
    }
  });

  it("takes a door that would be left straddling a slit", () => {
    // 1:L2 and 1:T2 share three walls, one of them with a door. Knock out a
    // different one and that door has the same room on both sides, which the
    // model does not allow: a slit has no two sides to open between.
    const before = state();
    const shared = sharedWalls(before.layer, "1:L2", "1:T2");
    const doored = shared.find((w) =>
      before.file.doors.some((d) => d.wall_id === w.id),
    )!;
    const other = shared.find((w) => w.id !== doored.id)!;
    expect(doored).toBeDefined();

    const after = deleteWall(before, { wallId: other.id });

    expect(after.layer.walls.has(doored.id)).toBe(true);
    expect(after.file.doors.some((d) => d.wall_id === doored.id)).toBe(false);
    for (const w of after.file.walls) {
      if (w.room_a !== w.room_b) continue;
      expect(after.file.doors.some((d) => d.wall_id === w.id)).toBe(false);
    }
  });

  it("orphans a device on a deleted door rather than destroying it", () => {
    // AC-1-d11 is the reader on A1's entrance. A reader is a provisioned
    // physical asset: losing its record to a wall edit would lose a real
    // device and make undo meaningless.
    const before = state();
    const id = wallBetween(before.layer, "1:H", "1:L1");
    expect(before.file.unplaced_devices).not.toContain("AC-1-d11");

    const after = deleteWall(before, { wallId: id });
    const reader = after.file.devices.find((d) => d.id === "AC-1-d11")!;

    expect(reader).toBeDefined();
    expect(reader.host_id).toBeNull();
    expect(reader.guards).toEqual([]);
    expect(after.file.unplaced_devices).toContain("AC-1-d11");
    expect(after.layer.unplacedDevices.map((d) => d.id)).toContain("AC-1-d11");
  });

  it("moves a room-hosted device to the surviving room", () => {
    const before = state();
    expect(before.file.devices.find((d) => d.id === "AN-A1")!.host_id).toBe(
      "1:L1",
    );
    const id = wallBetween(before.layer, "1:H", "1:L1");
    // Force 1:L1 to be the one that goes, or the unit never has to move.
    const after = deleteWall(before, { wallId: id, keep: "1:H" });

    expect(after.layer.rooms.has("1:L1")).toBe(false);
    expect(after.file.devices.find((d) => d.id === "AN-A1")!.host_id).toBe(
      "1:H",
    );
  });

  it("re-points a device that guarded the room which disappeared", () => {
    const before = state();
    const guard = before.file.devices.find((d) => d.id === "AC-1-d7")!;
    expect(guard.guards).toContain("1:L2");

    const id = wallBetween(before.layer, "1:L2", "1:T2");
    const after = deleteWall(before, { wallId: id, keep: "1:T2" });

    expect(after.layer.rooms.has("1:L2")).toBe(false);
    const moved = after.file.devices.find((d) => d.id === "AC-1-d7")!;
    expect(moved.guards).toContain("1:T2");
    expect(moved.guards).not.toContain("1:L2");
  });

  it("gives the apartment the merged room when a plain envelope is the other side", () => {
    // Hallway is a plain group, A1 is an apartment: the apartment wins
    // whichever side of the wall it is on.
    const before = state();
    const flat = before.layer.rooms.get("1:L1")!.group_id;
    const hall = before.layer.rooms.get("1:H")!.group_id;
    expect(flat).not.toBe(hall);

    const id = wallBetween(before.layer, "1:H", "1:L1");
    const after = deleteWall(before, { wallId: id });
    const survivor = after.file.rooms.find(
      (r) => r.id === "1:H" || r.id === "1:L1",
    )!;
    expect(survivor.group_id).toBe(flat);
  });

  it("takes the right-hand room's envelope when both are apartments", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L1", "1:L2");
    const right = before.layer.walls.get(id)!.room_b;
    const envelope = before.layer.rooms.get(right)!.group_id;

    // No question asked: the wall's own orientation settles it.
    const after = deleteWall(before, { wallId: id });
    expect(after.layer.rooms.get(right)!.group_id).toBe(envelope);
  });

  it("deletes an envelope the merge leaves empty", () => {
    const before = state();
    const hall = before.layer.rooms.get("1:H")!.group_id!;
    const id = wallBetween(before.layer, "1:H", "1:L1");
    // The hallway is that envelope's only room, so make it the one that goes.
    const after = deleteWall(before, { wallId: id, keep: "1:L1" });

    expect(after.file.rooms.some((r) => r.group_id === hall)).toBe(false);
    expect(after.file.groups.some((g) => g.id === hall)).toBe(false);
    expect(after.file.groups.length).toBe(before.file.groups.length - 1);
  });

  it("lets the caller override the survivor, its name and its type", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L2", "1:T2");
    const left = before.layer.walls.get(id)!.room_a;

    const after = deleteWall(before, {
      wallId: id,
      keep: left,
      name: "Studio",
      spaceType: null,
    });

    expect(after.layer.rooms.has(left)).toBe(true);
    expect(after.layer.rooms.get(left)!.name).toBe("Studio");
    expect(after.layer.rooms.get(left)!.space_type).toBeNull();
  });

  it("leaves no wall pointing at a room that is gone", () => {
    const before = state();
    const after = deleteWall(before, {
      wallId: wallBetween(before.layer, "1:L2", "1:T2"),
    });
    const ids = new Set(after.file.rooms.map((r) => r.id));
    for (const w of after.file.walls) {
      for (const side of [w.room_a, w.room_b]) {
        if (side !== "exterior") expect(ids.has(side)).toBe(true);
      }
    }
    for (const room of after.file.rooms) {
      for (const id of room.walls) expect(after.layer.walls.has(id)).toBe(true);
    }
  });

  it("removes a slit on its own, merging nothing", () => {
    const before = state();
    const slit = before.file.walls.find((w) => w.room_a === w.room_b)!;
    const after = deleteWall(before, { wallId: slit.id });

    expect(after.file.rooms.length).toBe(before.file.rooms.length);
    expect(after.layer.walls.has(slit.id)).toBe(false);
  });

  it("is undone completely", () => {
    const before = state();
    const after = deleteWall(before, {
      wallId: wallBetween(before.layer, "1:L2", "1:T2"),
    });
    expect(after.file).not.toEqual(before.file);
    expect(undo(after).file).toEqual(before.file);
    expect(after.undo.at(-1)!.kind).toBe("delete_wall");
    expect(after.undo.at(-1)!.label).toBe("Remove wall");
  });
});

describe("deleteWall refusals", () => {
  it("refuses a wall that faces outside", () => {
    const before = state();
    const outer = before.file.walls.find(
      (w) => w.room_b === "exterior" && w.room_a.startsWith("1:"),
    )!;
    expect(() => deleteWall(before, { wallId: outer.id })).toThrow(/outside/);
    expect(() => deleteWall(before, { wallId: outer.id })).toThrow(
      OperationRejected,
    );
  });

  it("refuses to keep a room that is not on this wall", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L2", "1:T2");
    expect(() => deleteWall(before, { wallId: id, keep: "1:L5" })).toThrow(
      /not one of the two rooms/,
    );
  });

  it("refuses an envelope that is neither room's", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L1", "1:L2");
    expect(() => deleteWall(before, { wallId: id, groupId: "1:gH" })).toThrow(
      /one of the two envelopes/,
    );
  });

  it("writes nothing on the way to a refusal", () => {
    const before = state();
    const outer = before.file.walls.find((w) => w.room_b === "exterior")!;
    try {
      deleteWall(before, { wallId: outer.id });
    } catch {
      /* expected */
    }
    expect(before.file).toEqual(state().file);
  });

  it("reports the reason through previewDeleteWall rather than throwing", () => {
    const before = state();
    const outer = before.file.walls.find((w) => w.room_b === "exterior")!;
    const bad = previewDeleteWall(before, { wallId: outer.id });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/outside/);

    const id = wallBetween(before.layer, "1:L2", "1:T2");
    expect(previewDeleteWall(before, { wallId: id }).ok).toBe(true);
  });
});

describe("sharedWalls", () => {
  it("finds the pair's walls in either order", () => {
    const { layer } = state();
    const ab = sharedWalls(layer, "1:L2", "1:T2");
    const ba = sharedWalls(layer, "1:T2", "1:L2");
    expect(ab.map((w) => w.id)).toEqual(ba.map((w) => w.id));
    expect(ab.length).toBe(3);
  });

  it("finds nothing between rooms that do not touch", () => {
    const { layer } = state();
    expect(sharedWalls(layer, "1:L1", "1:L5")).toEqual([]);
  });
});
