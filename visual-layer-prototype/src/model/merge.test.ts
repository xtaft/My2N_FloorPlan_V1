/**
 * Removing a wall, and the merge it is.
 *
 * Floor 1 happens to carry every case in the doc as real data:
 *
 *   1:L2 | 1:T2  three shared wall fragments, one door, one envelope
 *   1:H  | 1:L1  a hallway and a flat, with a reader on the shared door
 *   1:L1 | 1:L2  two apartments — not decidable, so it has to ask
 *   1:B1 | 1:L1  two separate runs — merging would leave a gap
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
  wallRuns,
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

    const after = deleteWall(before, { wallId: id });

    expect(after.file.rooms.length).toBe(before.file.rooms.length - 1);
    // The larger of the two keeps its name by default; 1:L2 is the living room.
    expect(after.layer.rooms.has("1:L2")).toBe(true);
    expect(after.layer.rooms.has("1:T2")).toBe(false);
    expect(areaOf(after.layer, "1:L2")).toBeCloseTo(whole, 6);
    expect(interiorRings(ringsOf(after.layer, after.layer.rooms.get("1:L2")!)).length).toBe(1);
  });

  it("takes every shared wall, not just the one clicked", () => {
    // 1:L2 and 1:T2 share three fragments across T-junctions. Leaving two
    // behind would strand a wall in the middle of the merged room.
    const before = state();
    const shared = sharedWalls(before.layer, "1:L2", "1:T2");
    expect(shared.length).toBe(3);

    const after = deleteWall(before, { wallId: shared[0].id });
    for (const w of shared) expect(after.layer.walls.has(w.id)).toBe(false);
  });

  it("keeps doors on the walls that survive", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L2", "1:T2");
    const shared = new Set(sharedWalls(before.layer, "1:L2", "1:T2").map((w) => w.id));
    const doomed = before.file.doors.filter((d) => d.wall_id && shared.has(d.wall_id));
    const kept = before.file.doors.filter((d) => !d.wall_id || !shared.has(d.wall_id));
    expect(doomed.length).toBeGreaterThan(0);

    const after = deleteWall(before, { wallId: id });
    for (const d of doomed) expect(after.file.doors.some((x) => x.id === d.id)).toBe(false);
    for (const d of kept) expect(after.file.doors.some((x) => x.id === d.id)).toBe(true);
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

    // 1:L1 is the larger of the two and would survive by default, leaving
    // the unit where it already is and proving nothing — so keep the
    // hallway instead and make the living room the one that disappears.
    const id = wallBetween(before.layer, "1:H", "1:L1");
    const after = deleteWall(before, { wallId: id, keep: "1:H" });

    expect(after.layer.rooms.has("1:L1")).toBe(false);
    expect(after.file.devices.find((d) => d.id === "AN-A1")!.host_id).toBe(
      "1:H",
    );
  });

  it("re-points a device that guarded the room which disappeared", () => {
    const before = state();
    // A2's entrance reader guards 1:L2 through a door that survives this
    // merge, so it has to follow the room into its replacement.
    const guard = before.file.devices.find((d) => d.id === "AC-1-d7")!;
    expect(guard.guards).toContain("1:L2");

    const id = wallBetween(before.layer, "1:L2", "1:T2");
    const after = deleteWall(before, { wallId: id, keep: "1:T2" });

    expect(after.layer.rooms.has("1:L2")).toBe(false);
    const moved = after.file.devices.find((d) => d.id === "AC-1-d7")!;
    expect(moved.guards).toContain("1:T2");
    expect(moved.guards).not.toContain("1:L2");
  });

  it("deletes an envelope the merge leaves empty", () => {
    const before = state();
    const hall = before.layer.rooms.get("1:H")!.group_id!;
    expect(before.file.groups.some((g) => g.id === hall)).toBe(true);
    // The hallway is that envelope's only room, and it is the one that goes.
    const id = wallBetween(before.layer, "1:H", "1:L1");
    const after = deleteWall(before, { wallId: id });

    expect(after.file.rooms.some((r) => r.group_id === hall)).toBe(false);
    expect(after.file.groups.some((g) => g.id === hall)).toBe(false);
    expect(after.file.groups.length).toBe(before.file.groups.length - 1);
  });

  it("gives the apartment the merged room when a plain envelope is the other side", () => {
    // Hallway is a plain group, A1 is an apartment: the apartment wins, and
    // nothing has to be asked.
    const before = state();
    const flat = before.layer.rooms.get("1:L1")!.group_id;
    const hall = before.layer.rooms.get("1:H")!.group_id;
    expect(flat).not.toBe(hall);

    const after = deleteWall(before, { wallId: wallBetween(before.layer, "1:H", "1:L1") });
    const survivor = after.file.rooms.find((r) => r.id === "1:H" || r.id === "1:L1")!;
    expect(survivor.group_id).toBe(flat);
  });

  it("lets the caller choose the surviving name and type", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L2", "1:T2");
    const after = deleteWall(before, {
      wallId: id,
      keep: "1:T2",
      name: "Studio",
      spaceType: null,
    });

    expect(after.layer.rooms.has("1:T2")).toBe(true);
    expect(after.layer.rooms.has("1:L2")).toBe(false);
    expect(after.layer.rooms.get("1:T2")!.name).toBe("Studio");
    expect(after.layer.rooms.get("1:T2")!.space_type).toBeNull();
  });

  it("dissolves the collinear leftovers at the seam", () => {
    // Every fragment the deleted walls met now has one wall on each side
    // with the same room pair. Left alone, wall counts only ever grow.
    const before = state();
    const shared = sharedWalls(before.layer, "1:L2", "1:T2");
    const after = deleteWall(before, { wallId: shared[0].id });

    // More walls went than were deleted, and a vertex went with them: that
    // difference is the dissolve, and without it this test would pass on an
    // empty list below.
    const dissolved =
      before.file.walls.length - after.file.walls.length - shared.length;
    expect(dissolved).toBeGreaterThan(0);
    expect(after.file.vertices.length).toBe(
      before.file.vertices.length - dissolved,
    );

    const degreeTwoCollinear = after.file.walls.filter((w) => {
      const others = after.file.walls.filter(
        (o) => o.id !== w.id && (o.v1 === w.v2 || o.v2 === w.v2),
      );
      return (
        others.length === 1 &&
        others[0].room_a === w.room_a &&
        others[0].room_b === w.room_b &&
        !after.file.doors.some(
          (d) => d.wall_id === w.id || d.wall_id === others[0].id,
        )
      );
    });

    // Any that remain must be genuinely bent, not straight.
    for (const w of degreeTwoCollinear) {
      const other = after.file.walls.find(
        (o) => o.id !== w.id && (o.v1 === w.v2 || o.v2 === w.v2),
      )!;
      const V = (id: string) => after.file.vertices.find((v) => v.id === id)!;
      const m = V(w.v2);
      const a = V(w.v1);
      const b = V(other.v1 === w.v2 ? other.v2 : other.v1);
      const cross = (m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x);
      const scale = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      expect(Math.abs(cross) / scale).toBeGreaterThan(1e-6);
    }
  });

  it("leaves no wall pointing at a room that is gone", () => {
    const before = state();
    const after = deleteWall(before, { wallId: wallBetween(before.layer, "1:L2", "1:T2") });
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

  it("is undone completely", () => {
    const before = state();
    const after = deleteWall(before, { wallId: wallBetween(before.layer, "1:L2", "1:T2") });
    expect(after.file).not.toEqual(before.file);
    expect(undo(after).file).toEqual(before.file);
    expect(after.undo.at(-1)!.kind).toBe("delete_wall");
    expect(after.undo.at(-1)!.label).toBe("Remove wall");
  });
});

describe("deleteWall refusals", () => {
  it("refuses rooms that touch in two separate places", () => {
    const before = state();
    const shared = sharedWalls(before.layer, "1:B1", "1:L1");
    expect(wallRuns(shared)).toBe(2);

    expect(() => deleteWall(before, { wallId: shared[0].id })).toThrow(
      OperationRejected,
    );
    const preview = previewDeleteWall(before, { wallId: shared[0].id });
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.reason).toMatch(/touch in two places/);
  });

  it("asks which envelope when both are apartments", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L1", "1:L2");
    const preview = previewDeleteWall(before, { wallId: id });
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.reason).toMatch(/same standing/);

    // Answered, it goes through.
    const chosen = before.layer.rooms.get("1:L1")!.group_id;
    const after = deleteWall(before, { wallId: id, keep: "1:L1", groupId: chosen });
    expect(after.layer.rooms.get("1:L1")!.group_id).toBe(chosen);
  });

  it("refuses an envelope that is neither room's", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L1", "1:L2");
    expect(() =>
      deleteWall(before, { wallId: id, groupId: "1:gH" }),
    ).toThrow(/one of the two envelopes/);
  });

  it("refuses a wall that faces outside", () => {
    const before = state();
    const outer = before.file.walls.find(
      (w) => w.room_b === "exterior" && w.room_a.startsWith("1:"),
    )!;
    expect(() => deleteWall(before, { wallId: outer.id })).toThrow(/outside/);
  });

  it("refuses to keep a room that is not on this wall", () => {
    const before = state();
    const id = wallBetween(before.layer, "1:L2", "1:T2");
    expect(() => deleteWall(before, { wallId: id, keep: "1:L5" })).toThrow(
      /not one of the two rooms/,
    );
  });

  it("writes nothing on the way to a refusal", () => {
    const before = state();
    const shared = sharedWalls(before.layer, "1:B1", "1:L1");
    try {
      deleteWall(before, { wallId: shared[0].id });
    } catch {
      /* expected */
    }
    expect(before.file).toEqual(state().file);
  });
});

describe("wallRuns", () => {
  it("counts a chain of fragments as one run", () => {
    const { layer } = state();
    expect(wallRuns(sharedWalls(layer, "1:L2", "1:T2"))).toBe(1);
  });

  it("counts two detached groups as two", () => {
    const { layer } = state();
    expect(wallRuns(sharedWalls(layer, "1:B1", "1:L1"))).toBe(2);
  });

  it("counts nothing as nothing", () => {
    expect(wallRuns([])).toBe(0);
  });
});
