/**
 * The navigation tree: what stays where when a space comes off the map,
 * and what a drag may do.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  initEditState,
  moveInTree,
  placeSpace,
  renameUnplacedSpace,
  treeChildren,
  treeMoveRefusal,
  unassignGroup,
  unassignRoom,
  undo,
  type EditState,
  type TreeNode,
  type VisualLayerFile,
} from "./index";

const state = (): EditState => initEditState(fixture as unknown as VisualLayerFile);

const GROUND = { floorId: "0:floor", groupId: null };
const FIRST = { floorId: "1:floor", groupId: null };

/** A row's name; a star marks a space with no shape. */
const label = (n: TreeNode) =>
  n.kind === "group" ? n.group.name : n.kind === "room" ? n.room.name : n.space.name + "*";
const names = (st: EditState, place: { floorId: string; groupId: string | null }) =>
  treeChildren(st.layer, place).map(label);
const roomNamed = (st: EditState, floorId: string, name: string) =>
  st.layer.file.rooms.find((r) => r.floor_id === floorId && r.name === name)!;

describe("what the tree lists", () => {
  it("lists a floor's envelopes in drawer order, one-room envelopes as the room", () => {
    const st = state();
    expect(names(st, GROUND)).toEqual([
      "C1", "C2", "GYM", "Lobby", "Stairs", "Elevator", "Technical room",
    ]);
    const tech = treeChildren(st.layer, GROUND).at(-1)!;
    expect(tech.kind).toBe("room");
    expect(tech.id).toBe("0:gTECH");
  });

  it("lists an envelope's own rooms and groups", () => {
    const st = state();
    expect(names(st, { floorId: "0:floor", groupId: "0:C1" })).toEqual(["Shop floor", "Storage"]);
    expect(names(st, { floorId: "0:floor", groupId: "0:GYM" })).toEqual([
      "Locker room M", "Locker room W", "Gym floor",
    ]);
  });
});

describe("unassigning a room", () => {
  it("leaves the named space in the row the room had", () => {
    const st = state();
    const tech = roomNamed(st, "0:floor", "Technical room");
    const after = unassignRoom(st, tech.id);
    // The anonymous room is listed too, after everything else.
    expect(names(after, GROUND)).toEqual([
      "C1", "C2", "GYM", "Lobby", "Stairs", "Elevator", "Technical room*", "Unnamed 1",
    ]);
    const space = after.file.unplaced_spaces![0];
    expect(space).toMatchObject({ name: "Technical room", space_type: "technical", group_id: null });
    expect(after.layer.rooms.get(tech.id)).toMatchObject({
      name: "Unnamed 1", space_type: null, group_id: null,
    });
  });

  it("keeps a room of a group inside the group, in its place", () => {
    const st = state();
    const shop = roomNamed(st, "0:floor", "Shop floor");
    expect(shop.group_id).toBe("0:C1");
    const after = unassignRoom(st, shop.id);
    expect(names(after, { floorId: "0:floor", groupId: "0:C1" })).toEqual(["Shop floor*", "Storage"]);
    expect(after.file.unplaced_spaces![0].group_id).toBe("0:C1");
    expect(names(after, GROUND).at(-1)).toBe("Unnamed 1");
  });

  it("is undone whole", () => {
    const st = state();
    const tech = roomNamed(st, "0:floor", "Technical room");
    expect(undo(unassignRoom(st, tech.id)).file).toBe(st.file);
  });
});

describe("unassigning an apartment", () => {
  it("leaves an unnamed apartment on the map and the named one in its row", () => {
    const st = state();
    const after = unassignGroup(st, "1:A1");
    const rows = names(after, FIRST);
    expect(rows[0]).toBe("A1*");
    expect(rows.at(-1)).toBe("Unnamed apartment 1");

    const left = after.layer.groups.get("1:A1")!;
    expect(left).toMatchObject({ name: "Unnamed apartment 1", space_type: "apartment", domain_ref: null });
    // Its rooms are still its rooms.
    expect(after.file.rooms.filter((r) => r.group_id === "1:A1").length).toBe(
      st.file.rooms.filter((r) => r.group_id === "1:A1").length,
    );

    const space = after.file.unplaced_spaces![0];
    expect(space).toMatchObject({
      name: "A1", kind: "apartment", space_type: "apartment", domain_ref: "unit:A1",
    });
    // The answering unit is the flat's, and comes away with it.
    expect(space.devices).toContain("AN-A1");
    expect(after.layer.devices.find((d) => d.id === "AN-A1")!.host_id).toBeNull();
    expect(after.file.unplaced_devices).toContain("AN-A1");
  });

  it("refuses anything that is not an apartment", () => {
    expect(() => unassignGroup(state(), "0:C1")).toThrow(OperationRejected);
  });

  it("goes back where it was when it is placed on the apartment again", () => {
    const st = state();
    const away = unassignGroup(st, "1:A1");
    const space = away.file.unplaced_spaces![0];
    const back = placeSpace(away, space.id, "1:L1");
    expect(back.layer.groups.get("1:A1")).toMatchObject({ name: "A1", domain_ref: "unit:A1" });
    expect(back.file.unplaced_spaces).toEqual([]);
    expect(back.layer.devices.find((d) => d.id === "AN-A1")!.host_id).toBe("1:L1");
    expect(names(back, FIRST)).toEqual(names(st, FIRST));
  });
});

describe("dragging a row", () => {
  it("reorders among its siblings", () => {
    const st = state();
    const after = moveInTree(st, { kind: "group", id: "1:A3" }, { ...FIRST, beforeId: "1:A1" });
    expect(names(after, FIRST).slice(0, 4)).toEqual(["A3", "A1", "A2", "A4"]);
    expect(after.undo.at(-1)!.label).toBe("Reorder A3");
    // Nothing about the building changed.
    expect(after.file.groups).toBe(st.file.groups);
    expect(names(undo(after), FIRST)).toEqual(names(st, FIRST));
  });

  it("moves to the end when dropped after the last row", () => {
    const st = state();
    const after = moveInTree(st, { kind: "group", id: "1:A1" }, { ...FIRST, beforeId: null });
    expect(names(after, FIRST).at(-1)).toBe("A1");
  });

  it("does nothing when a row is dropped where it already is", () => {
    const st = state();
    expect(moveInTree(st, { kind: "group", id: "1:A1" }, { ...FIRST, beforeId: "1:A1" })).toBe(st);
    expect(moveInTree(st, { kind: "group", id: "1:A1" }, { ...FIRST, beforeId: "1:A2" })).toBe(st);
  });

  it("puts a room into a group on its floor", () => {
    const st = state();
    const storage = st.file.rooms.find((r) => r.group_id === "0:C1" && r.name === "Storage")!;
    const after = moveInTree(
      st,
      { kind: "room", id: storage.id },
      { floorId: "0:floor", groupId: "0:GYM", beforeId: null },
    );
    expect(after.layer.rooms.get(storage.id)!.group_id).toBe("0:GYM");
    expect(names(after, { floorId: "0:floor", groupId: "0:GYM" }).at(-1)).toBe("Storage");
    expect(names(after, { floorId: "0:floor", groupId: "0:C1" })).toEqual(["Shop floor"]);
    expect(after.undo.at(-1)!.label).toBe("Move Storage");
  });

  it("takes a room that stood for its envelope out of it, and drops the envelope", () => {
    const st = state();
    const tech = roomNamed(st, "0:floor", "Technical room");
    const after = moveInTree(
      st,
      { kind: "room", id: tech.id },
      { floorId: "0:floor", groupId: "0:C1", beforeId: null },
    );
    expect(after.layer.rooms.get(tech.id)!.group_id).toBe("0:C1");
    expect(after.layer.groups.has("0:gTECH")).toBe(false);
    expect(names(after, { floorId: "0:floor", groupId: "0:C1" })).toEqual([
      "Shop floor", "Storage", "Technical room",
    ]);
    expect(names(after, GROUND)).not.toContain("Technical room");
  });

  it("gives a room dragged into an apartment the apartment's category", () => {
    const st = state();
    const hall = roomNamed(st, "1:floor", "Hallway");
    expect(hall.space_type).toBe("circulation");
    const after = moveInTree(
      st,
      { kind: "room", id: hall.id },
      { floorId: "1:floor", groupId: "1:A1", beforeId: null },
    );
    expect(after.layer.rooms.get(hall.id)).toMatchObject({ group_id: "1:A1", space_type: null });
  });

  it("keeps anything drawn on the floor it is drawn on", () => {
    const st = state();
    const tech = roomNamed(st, "0:floor", "Technical room");
    const why = treeMoveRefusal(st.layer, { kind: "room", id: tech.id }, FIRST);
    expect(why).toMatch(/Unassign it from the map/);
    expect(() =>
      moveInTree(st, { kind: "group", id: "1:A1" }, { floorId: "2:floor", groupId: null, beforeId: null }),
    ).toThrow(OperationRejected);
  });

  it("lets an apartment hold rooms only, and nothing hold itself", () => {
    const st = state();
    expect(
      treeMoveRefusal(st.layer, { kind: "group", id: "1:A2" }, { floorId: "1:floor", groupId: "1:A1" }),
    ).toMatch(/rooms only/);
    expect(
      treeMoveRefusal(st.layer, { kind: "group", id: "0:GYM" }, { floorId: "0:floor", groupId: "0:gGL1" }),
    ).toMatch(/inside itself/);
    expect(
      treeMoveRefusal(st.layer, { kind: "group", id: "0:C1" }, { floorId: "0:floor", groupId: "0:GYM" }),
    ).toBeNull();
  });

  it("lets a space with no shape go to another floor, and into a group there", () => {
    const st = state();
    const tech = roomNamed(st, "0:floor", "Technical room");
    const away = unassignRoom(st, tech.id);
    const space = away.file.unplaced_spaces![0];
    const moved = moveInTree(
      away,
      { kind: "space", id: space.id },
      { floorId: "1:floor", groupId: "1:A2", beforeId: null },
    );
    expect(moved.file.unplaced_spaces![0]).toMatchObject({ floor_id: "1:floor", group_id: "1:A2" });
    expect(names(moved, { floorId: "1:floor", groupId: "1:A2" })).toEqual(["Technical room*"]);
    expect(names(moved, GROUND)).not.toContain("Technical room*");
  });

  it("does not let an unassigned apartment go inside an apartment", () => {
    const away = unassignGroup(state(), "1:A1");
    const space = away.file.unplaced_spaces![0];
    expect(
      treeMoveRefusal(away.layer, { kind: "space", id: space.id }, { floorId: "1:floor", groupId: "1:A2" }),
    ).toMatch(/rooms only/);
    // Another floor is fine: it has no walls to keep it anywhere.
    expect(
      treeMoveRefusal(away.layer, { kind: "space", id: space.id }, { floorId: "3:floor", groupId: null }),
    ).toBeNull();
  });
});

describe("a space with no shape", () => {
  it("can be renamed", () => {
    const away = unassignGroup(state(), "1:A1");
    const id = away.file.unplaced_spaces![0].id;
    const renamed = renameUnplacedSpace(away, id, "  A1 bis ");
    expect(renamed.file.unplaced_spaces![0].name).toBe("A1 bis");
    expect(() => renameUnplacedSpace(away, id, "  ")).toThrow(OperationRejected);
  });
});
