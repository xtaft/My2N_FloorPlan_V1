/**
 * The navigation tree and the spaces that come off the map: what the
 * tree lists, where the named space waits, and what a drag may do.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  initEditState,
  moveInTree,
  placeSpace,
  removeUnplacedSpace,
  spaceCategories,
  treeChildren,
  treeMoveRefusal,
  unassignGroup,
  unassignRoom,
  undo,
  unplacedCategory,
  type EditState,
  type TreeNode,
  type VisualLayerFile,
} from "./index";

const state = (): EditState => initEditState(fixture as unknown as VisualLayerFile);

const GROUND = { floorId: "0:floor", groupId: null };
const FIRST = { floorId: "1:floor", groupId: null };
const C1 = { floorId: "0:floor", groupId: "0:C1" };

const label = (n: TreeNode) => (n.kind === "group" ? n.group.name : n.room.name);
const names = (st: EditState, place: { floorId: string; groupId: string | null }) =>
  treeChildren(st.layer, place).map(label);
const roomNamed = (st: EditState, floorId: string, name: string) =>
  st.layer.file.rooms.find((r) => r.floor_id === floorId && r.name === name)!;
const roomIn = (st: EditState, groupId: string, name: string) =>
  st.layer.file.rooms.find((r) => r.group_id === groupId && r.name === name)!;
const category = (st: EditState, id: string | null) =>
  spaceCategories(st.layer).find((c) => c.id === id)!;

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
    expect(names(st, C1)).toEqual(["Shop floor", "Storage"]);
    expect(names(st, { floorId: "0:floor", groupId: "0:GYM" })).toEqual([
      "Locker room M", "Locker room W", "Gym floor",
    ]);
  });
});

describe("unassigning a room of a group", () => {
  const unassignStorage = () => {
    const st = state();
    const storage = roomIn(st, "0:C1", "Storage");
    return { st, storage, after: unassignRoom(st, storage.id) };
  };

  it("leaves an unnamed space of no category on the floor, and lists that", () => {
    const { storage, after } = unassignStorage();
    expect(after.layer.rooms.get(storage.id)).toMatchObject({
      name: "Unnamed 1", space_type: null, group_id: null, surfaced: true,
    });
    // On the floor, after everything else — and out of the group.
    expect(names(after, GROUND).at(-1)).toBe("Unnamed 1");
    expect(names(after, C1)).toEqual(["Shop floor"]);
    // Under Unknown in the drawer.
    expect(category(after, null).rooms.map((r) => r.name)).toEqual(["Unnamed 1"]);
  });

  it("does not list the named space in the tree", () => {
    const { after } = unassignStorage();
    const everything = [...names(after, GROUND), ...names(after, C1)];
    expect(everything).not.toContain("Storage");
  });

  it("keeps the named space as part of its group, under the group's category", () => {
    const { after } = unassignStorage();
    const space = after.file.unplaced_spaces![0];
    expect(space).toMatchObject({ name: "Storage", group_id: "0:C1", space_type: "commercial" });
    expect(unplacedCategory(after.layer, space)).toBe("commercial");
  });

  it("keeps the group a group, even down to one room", () => {
    const { after } = unassignStorage();
    // Not collapsed into a row called Shop floor: it is still C1.
    const row = treeChildren(after.layer, GROUND).find((n) => n.id === "0:C1")!;
    expect(row.kind).toBe("group");
  });

  it("does not remove the group when every room of it has been unassigned", () => {
    const { after } = unassignStorage();
    const shop = roomIn(after, "0:C1", "Shop floor");
    const both = unassignRoom(after, shop.id);
    expect(both.layer.groups.has("0:C1")).toBe(true);
    expect(names(both, GROUND)).toContain("C1");
    expect(names(both, C1)).toEqual([]);
    expect(both.file.unplaced_spaces!.map((s) => s.group_id)).toEqual(["0:C1", "0:C1"]);
    // Still a commercial unit, with two spaces to place.
    expect(category(both, "commercial").groups.map((g) => g.id)).toContain("0:C1");
  });

  it("goes back into its group when it is placed again", () => {
    const { st, storage, after } = unassignStorage();
    const space = after.file.unplaced_spaces![0];
    const back = placeSpace(after, space.id, storage.id);
    expect(back.layer.rooms.get(storage.id)).toMatchObject({
      name: "Storage", group_id: "0:C1", space_type: storage.space_type,
    });
    expect(back.file.unplaced_spaces).toEqual([]);
    expect(names(back, C1)).toEqual(names(st, C1));
  });

  it("lets the group go once its last waiting space is dropped", () => {
    const { after } = unassignStorage();
    const both = unassignRoom(after, roomIn(after, "0:C1", "Shop floor").id);
    const [a, b] = both.file.unplaced_spaces!;
    const one = removeUnplacedSpace(both, a.id);
    expect(one.layer.groups.has("0:C1")).toBe(true);
    const none = removeUnplacedSpace(one, b.id);
    expect(none.layer.groups.has("0:C1")).toBe(false);
  });

  it("is undone whole", () => {
    const { st, after } = unassignStorage();
    expect(undo(after).file).toBe(st.file);
  });
});

describe("unassigning a space that is its own envelope", () => {
  it("drops the envelope, which was only the room by another name", () => {
    const st = state();
    const tech = roomNamed(st, "0:floor", "Technical room");
    const after = unassignRoom(st, tech.id);
    expect(after.layer.groups.has("0:gTECH")).toBe(false);
    expect(names(after, GROUND)).toEqual([
      "C1", "C2", "GYM", "Lobby", "Stairs", "Elevator", "Unnamed 1",
    ]);
    const space = after.file.unplaced_spaces![0];
    expect(space).toMatchObject({ name: "Technical room", group_id: null });
    expect(unplacedCategory(after.layer, space)).toBe("technical");
    // The category stays, for the space that is waiting in it.
    expect(category(after, "technical")).toBeDefined();
  });
});

describe("unassigning an apartment", () => {
  it("leaves an unnamed apartment in the same row, and the named one waiting", () => {
    const st = state();
    const after = unassignGroup(st, "1:A1");
    // The tree lists what is drawn: the envelope, under its new name.
    expect(names(after, FIRST)[0]).toBe("Unnamed apartment 1");
    expect(names(after, FIRST)).not.toContain("A1");

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
    expect(unplacedCategory(after.layer, space)).toBe("apartment");
    // The answering unit is the flat's, and comes away with it.
    expect(space.devices).toContain("AN-A1");
    expect(after.layer.devices.find((d) => d.id === "AN-A1")!.host_id).toBeNull();
    expect(after.file.unplaced_devices).toContain("AN-A1");
  });

  it("refuses anything that is not an apartment", () => {
    expect(() => unassignGroup(state(), "0:C1")).toThrow(OperationRejected);
  });

  it("is itself again when it is placed on the apartment", () => {
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
    expect(after.file.rooms).toBe(st.file.rooms);
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
    const storage = roomIn(st, "0:C1", "Storage");
    const after = moveInTree(
      st,
      { kind: "room", id: storage.id },
      { floorId: "0:floor", groupId: "0:GYM", beforeId: null },
    );
    expect(after.layer.rooms.get(storage.id)!.group_id).toBe("0:GYM");
    expect(names(after, { floorId: "0:floor", groupId: "0:GYM" }).at(-1)).toBe("Storage");
    expect(after.undo.at(-1)!.label).toBe("Move Storage");
  });

  it("puts the unnamed space left by an unassign into a group", () => {
    const st = state();
    const storage = roomIn(st, "0:C1", "Storage");
    const away = unassignRoom(st, storage.id);
    const after = moveInTree(
      away,
      { kind: "room", id: storage.id },
      { floorId: "0:floor", groupId: "0:C2", beforeId: null },
    );
    expect(names(after, { floorId: "0:floor", groupId: "0:C2" }).at(-1)).toBe("Unnamed 1");
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
    expect(names(after, C1)).toEqual(["Shop floor", "Storage", "Technical room"]);
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

  it("keeps what is drawn on the floor it is drawn on", () => {
    const st = state();
    const tech = roomNamed(st, "0:floor", "Technical room");
    expect(treeMoveRefusal(st.layer, { kind: "room", id: tech.id }, FIRST)).toMatch(
      /stays on its floor/,
    );
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

  it("does not drop a group that a drag empties while a space of it is waiting", () => {
    const st = state();
    const away = unassignRoom(st, roomIn(st, "0:C1", "Storage").id);
    const shop = roomIn(away, "0:C1", "Shop floor");
    const after = moveInTree(
      away,
      { kind: "room", id: shop.id },
      { floorId: "0:floor", groupId: "0:C2", beforeId: null },
    );
    expect(after.layer.groups.has("0:C1")).toBe(true);
  });
});
