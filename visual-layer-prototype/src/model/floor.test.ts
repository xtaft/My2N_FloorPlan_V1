/**
 * A storey's own operations: rename, duplicate, background, delete.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  deleteFloor,
  duplicateFloor,
  fitBackground,
  floorExtent,
  placeFloorBackground,
  scaleRect,
  initEditState,
  interiorRings,
  renameFloor,
  ringsOf,
  setFloorBackground,
  treeChildren,
  undo,
  type EditState,
  type VisualLayerFile,
} from "./index";

const state = (): EditState => initEditState(fixture as unknown as VisualLayerFile);

/** Every reference in the file points at something that is there. */
function dangling(file: VisualLayerFile): string[] {
  const out: string[] = [];
  const vertices = new Set(file.vertices.map((v) => v.id));
  const walls = new Set(file.walls.map((w) => w.id));
  const rooms = new Set([...file.rooms.map((r) => r.id), "exterior"]);
  const groups = new Set(file.groups.map((g) => g.id));
  const floors = new Set(file.floors.map((f) => f.id));
  const doors = new Set(file.doors.map((d) => d.id));
  for (const w of file.walls) {
    if (!vertices.has(w.v1) || !vertices.has(w.v2)) out.push(`wall ${w.id} vertex`);
    if (!rooms.has(w.room_a) || !rooms.has(w.room_b)) out.push(`wall ${w.id} room`);
  }
  for (const r of file.rooms) {
    if (r.walls.some((id) => !walls.has(id))) out.push(`room ${r.id} wall`);
    if (r.group_id && !groups.has(r.group_id)) out.push(`room ${r.id} group`);
    if (!floors.has(r.floor_id)) out.push(`room ${r.id} floor`);
  }
  for (const g of file.groups) {
    if (g.parent_group_id && !groups.has(g.parent_group_id)) out.push(`group ${g.id} parent`);
    if (!floors.has(g.floor_id)) out.push(`group ${g.id} floor`);
  }
  for (const d of file.doors) {
    if (d.wall_id && !walls.has(d.wall_id)) out.push(`door ${d.id} wall`);
    if (d.rooms && d.rooms.some((id) => !rooms.has(id))) out.push(`door ${d.id} room`);
  }
  for (const d of file.devices) {
    if (d.host_id && !rooms.has(d.host_id) && !doors.has(d.host_id)) out.push(`device ${d.id} host`);
    if (d.floor_id && !floors.has(d.floor_id)) out.push(`device ${d.id} floor`);
    if (d.guards.some((id) => !rooms.has(id))) out.push(`device ${d.id} guards`);
  }
  for (const p of file.profiles) {
    if (p.rooms.some((id) => !rooms.has(id))) out.push(`profile ${p.id} room`);
  }
  return out;
}

const unique = (ids: string[]) => new Set(ids).size === ids.length;
const names = (st: EditState, floorId: string) =>
  treeChildren(st.layer, { floorId, groupId: null }).map((n) =>
    n.kind === "group" ? n.group.name : n.kind === "room" ? n.room.name : n.space.name,
  );

describe("renaming a floor", () => {
  it("gives it the name, trimmed", () => {
    const after = renameFloor(state(), "1:floor", "  Mezzanine ");
    expect(after.layer.floors.find((f) => f.id === "1:floor")!.name).toBe("Mezzanine");
    expect(after.undo.at(-1)!.label).toBe("Rename");
  });

  it("refuses a blank name, and does nothing for the same one", () => {
    const st = state();
    expect(() => renameFloor(st, "1:floor", "   ")).toThrow(OperationRejected);
    expect(renameFloor(st, "1:floor", "floor 1")).toBe(st);
  });
});

describe("duplicating a floor", () => {
  const copied = () => {
    const st = state();
    const { state: after, floorId } = duplicateFloor(st, "1:floor");
    return { st, after, floorId };
  };

  it("puts a copy on top of the building", () => {
    const { st, after, floorId } = copied();
    expect(floorId).toBe("5:floor");
    const copy = after.layer.floors.find((f) => f.id === floorId)!;
    expect(copy).toMatchObject({ name: "floor 1 copy", level: 5 });
    expect(after.layer.floors.length).toBe(st.layer.floors.length + 1);
  });

  it("copies the drawing: as many rooms, walls and doors, each with a shape", () => {
    const { st, after, floorId } = copied();
    const count = (file: VisualLayerFile, prefix: string) => ({
      vertices: file.vertices.filter((v) => v.id.startsWith(prefix)).length,
      walls: file.walls.filter((w) => w.id.startsWith(prefix)).length,
      rooms: file.rooms.filter((r) => r.id.startsWith(prefix)).length,
      groups: file.groups.filter((g) => g.id.startsWith(prefix)).length,
      doors: file.doors.filter((d) => d.kind !== "virtual" && d.id.startsWith(prefix)).length,
    });
    expect(count(after.file, "5:")).toEqual(count(st.file, "1:"));
    for (const room of after.layer.roomsByFloor.get(floorId) ?? []) {
      expect(interiorRings(ringsOf(after.layer, room)).length).toBeGreaterThan(0);
    }
    // And lists the same rows, in the same order.
    expect(names(after, floorId)).toEqual(names(st, "1:floor"));
  });

  it("leaves nothing pointing at something that is not there, and no id twice", () => {
    const { after } = copied();
    expect(dangling(after.file)).toEqual([]);
    expect(unique(after.file.rooms.map((r) => r.id))).toBe(true);
    expect(unique(after.file.walls.map((w) => w.id))).toBe(true);
    expect(unique(after.file.vertices.map((v) => v.id))).toBe(true);
    expect(unique(after.file.groups.map((g) => g.id))).toBe(true);
    expect(unique(after.file.doors.map((d) => d.id))).toBe(true);
  });

  it("does not copy what is one thing in the world", () => {
    const { st, after, floorId } = copied();
    // No device is on the copy, and none was added or moved.
    expect(after.file.devices).toEqual(st.file.devices);
    expect(after.file.devices.some((d) => d.floor_id === floorId)).toBe(false);
    // Its apartments point at no unit yet.
    const groups = after.file.groups.filter((g) => g.floor_id === floorId);
    expect(groups.every((g) => g.domain_ref === null)).toBe(true);
    expect(st.layer.groups.get("1:A1")!.domain_ref).toBe("unit:A1");
  });

  it("runs the same shafts through the copy", () => {
    const { st, after } = copied();
    expect(after.layer.groups.get("5:gE")!.shaft_id).toBe(st.layer.groups.get("1:gE")!.shaft_id);
    const links = after.file.doors
      .filter((d) => d.kind === "virtual")
      .map((d) => [...d.rooms!].sort().join("|"));
    expect(links).toContain("4:E|5:E");
    expect(links).toContain("4:S|5:S");
  });

  it("leaves the original as it was, and is undone whole", () => {
    const { st, after } = copied();
    expect(after.file.rooms.filter((r) => r.floor_id === "1:floor")).toEqual(
      st.file.rooms.filter((r) => r.floor_id === "1:floor"),
    );
    expect(undo(after).file).toBe(st.file);
  });
});

describe("deleting a floor", () => {
  it("takes the floor and everything drawn on it", () => {
    const st = state();
    const after = deleteFloor(st, "2:floor");
    expect(after.layer.floors.map((f) => f.id)).toEqual(["0:floor", "1:floor", "3:floor", "4:floor"]);
    expect(after.file.rooms.some((r) => r.id.startsWith("2:"))).toBe(false);
    expect(after.file.walls.some((w) => w.id.startsWith("2:"))).toBe(false);
    expect(after.file.vertices.some((v) => v.id.startsWith("2:"))).toBe(false);
    expect(after.file.groups.some((g) => g.id.startsWith("2:"))).toBe(false);
    expect(dangling(after.file)).toEqual([]);
    expect(after.undo.at(-1)!.label).toBe("Delete floor 2");
  });

  it("keeps the devices that were on it, unplaced", () => {
    const st = state();
    const there = st.file.devices.filter((d) => d.floor_id === "2:floor").map((d) => d.id);
    expect(there.length).toBeGreaterThan(0);
    const after = deleteFloor(st, "2:floor");
    expect(after.file.devices.length).toBe(st.file.devices.length);
    for (const id of there) {
      const device = after.file.devices.find((d) => d.id === id)!;
      expect(device).toMatchObject({ host_id: null, floor_id: null, guards: [] });
      expect(after.file.unplaced_devices).toContain(id);
    }
  });

  it("brings the floors above down a level, and links the shafts through", () => {
    const after = deleteFloor(state(), "2:floor");
    expect(after.layer.floors.map((f) => [f.id, f.level])).toEqual([
      ["0:floor", 0], ["1:floor", 1], ["3:floor", 2], ["4:floor", 3],
    ]);
    const links = after.file.doors
      .filter((d) => d.kind === "virtual")
      .map((d) => [...d.rooms!].sort().join("|"));
    expect(links).toContain("1:E|3:E");
    expect(links.some((l) => l.includes("2:"))).toBe(false);
  });

  it("refuses to delete the only floor", () => {
    let st = state();
    for (const id of ["4:floor", "3:floor", "2:floor", "1:floor"]) st = deleteFloor(st, id);
    expect(st.layer.floors.length).toBe(1);
    expect(() => deleteFloor(st, "0:floor")).toThrow(OperationRejected);
  });

  it("is undone whole", () => {
    const st = state();
    expect(undo(deleteFloor(st, "2:floor")).file).toBe(st.file);
  });
});

describe("a floor's background image", () => {
  const image = { src: "data:image/png;base64,AAAA", x: 10, y: 20, width: 300, height: 200 };

  it("is set, and taken away again", () => {
    const st = state();
    const withImage = setFloorBackground(st, "1:floor", image);
    expect(withImage.layer.floors.find((f) => f.id === "1:floor")!.background).toEqual(image);
    expect(withImage.undo.at(-1)!.label).toBe("Add background image");

    const without = setFloorBackground(withImage, "1:floor", null);
    expect(without.layer.floors.find((f) => f.id === "1:floor")!.background).toBeUndefined();
    expect(without.undo.at(-1)!.label).toBe("Remove background");
    // Removing what is not there changes nothing.
    expect(setFloorBackground(st, "1:floor", null)).toBe(st);
  });

  it("first lands inside the plan's extent, whole and in proportion", () => {
    const st = state();
    const extent = floorExtent(st.file, "1:floor");
    // A wide sheet: as wide as the plan, centred top to bottom.
    const wide = fitBackground(extent, { width: 4000, height: 1000 });
    expect(wide.width).toBeCloseTo(extent.width, 6);
    expect(wide.width / wide.height).toBeCloseTo(4, 6);
    expect(wide.y + wide.height / 2).toBeCloseTo(extent.y + extent.height / 2, 6);
    // A tall one: as tall as the plan, centred side to side.
    const tall = fitBackground(extent, { width: 500, height: 2000 });
    expect(tall.height).toBeCloseTo(extent.height, 6);
    expect(tall.x + tall.width / 2).toBeCloseTo(extent.x + extent.width / 2, 6);
  });

  it("lands on the page when the floor has nothing drawn", () => {
    const empty = { ...state().file, vertices: [] } as VisualLayerFile;
    expect(floorExtent(empty, "1:floor")).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
  });

  it("is moved and sized freely — past the walls if that is where it goes", () => {
    const st = setFloorBackground(state(), "1:floor", image);
    const extent = floorExtent(st.file, "1:floor");
    const far = { x: extent.x - 5000, y: extent.y - 5000, width: 20000, height: 12000 };
    const placed = placeFloorBackground(st, "1:floor", far);
    expect(placed.layer.floors.find((f) => f.id === "1:floor")!.background).toEqual({
      src: image.src,
      ...far,
    });
    expect(placed.undo.at(-1)!.label).toBe("Edit image");
    // The same place again is not an edit.
    expect(placeFloorBackground(placed, "1:floor", far)).toBe(placed);
    expect(undo(placed).file).toBe(st.file);
  });

  it("scales about its own middle", () => {
    const twice = scaleRect({ x: 100, y: 100, width: 200, height: 100 }, 2);
    expect(twice).toEqual({ x: 0, y: 50, width: 400, height: 200 });
  });

  it("refuses to place an image that is not there, or one with no size", () => {
    const st = state();
    expect(() => placeFloorBackground(st, "1:floor", { x: 0, y: 0, width: 10, height: 10 })).toThrow(
      OperationRejected,
    );
    const withImage = setFloorBackground(st, "1:floor", image);
    expect(() =>
      placeFloorBackground(withImage, "1:floor", { x: 0, y: 0, width: 0, height: 10 }),
    ).toThrow(OperationRejected);
  });

  it("goes with a copy of the floor", () => {
    const st = setFloorBackground(state(), "1:floor", image);
    const { state: after, floorId } = duplicateFloor(st, "1:floor");
    expect(after.layer.floors.find((f) => f.id === floorId)!.background).toEqual(image);
  });
});
