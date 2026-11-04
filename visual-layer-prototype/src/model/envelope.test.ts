/**
 * Making an apartment or a group out of spaces that exist, and adding
 * a storey that does not yet.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  OperationRejected,
  accessType,
  addStoreys,
  createEnvelope,
  envelopeRefusal,
  floorEnvelopes,
  groupAccessType,
  initEditState,
  membersFloor,
  roomsInGroup,
  spaceCategories,
  undo,
  type EditState,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/** Rooms on the ground floor with categories of their own to disagree. */
function roomsOf(st: EditState, groupId: string): string[] {
  return roomsInGroup(st.layer, groupId).map((r) => r.id);
}

describe("createEnvelope — an apartment", () => {
  it("is made of rooms, lands at the top of its floor, and reads Apartment", () => {
    const st = state();
    // Two rooms out of A1 and one out of A2 — a flat re-cut across the
    // hallway, which is the kind of thing a new apartment is for.
    const members = [...roomsOf(st, "1:A1").slice(0, 2), roomsOf(st, "1:A2")[0]];
    const next = createEnvelope(st, { kind: "apartment", name: "A8", members });

    const made = [...next.layer.groups.values()].find((g) => g.name === "A8")!;
    expect(made.space_type).toBe("apartment");
    expect(made.floor_id).toBe("1:floor");
    expect(made.parent_group_id).toBe("1:floorgroup");
    expect(roomsOf(next, made.id).sort()).toEqual([...members].sort());

    // Its rooms read the flat's category and carry none of their own.
    for (const id of members) {
      const room = next.layer.rooms.get(id)!;
      expect(room.space_type).toBeNull();
      expect(accessType(next.layer, room)).toBe("apartment");
    }
  });

  it("shows up under Apartments in the categories panel", () => {
    const st = state();
    const before = spaceCategories(st.layer).find((c) => c.id === "apartment")!;
    const next = createEnvelope(st, {
      kind: "apartment",
      name: "A8",
      members: roomsOf(st, "1:A1").slice(0, 1),
    });
    const after = spaceCategories(next.layer).find((c) => c.id === "apartment")!;
    expect(after.groups.length).toBe(before.groups.length + 1);
    expect(after.groups.some((g) => g.name === "A8")).toBe(true);
  });

  it("refuses an envelope as a member", () => {
    const st = state();
    expect(() =>
      createEnvelope(st, { kind: "apartment", name: "X", members: ["1:A1"] }),
    ).toThrow(/is not a room/);
  });

  it("takes rooms out of the flat they were in, and drops a flat left empty", () => {
    const st = state();
    const all = roomsOf(st, "1:A3");
    const next = createEnvelope(st, { kind: "apartment", name: "A9", members: all });
    expect(next.layer.groups.has("1:A3")).toBe(false);
    for (const id of all) {
      expect(next.layer.rooms.get(id)!.group_id).not.toBe("1:A3");
    }
  });
});

describe("createEnvelope — a group", () => {
  it("reads the category its members agree on", () => {
    const st = state();
    // Two flats: both apartments, so the group is one.
    const next = createEnvelope(st, {
      kind: "group",
      name: "West wing",
      members: ["1:A1", "1:A2"],
    });
    const made = [...next.layer.groups.values()].find((g) => g.name === "West wing")!;
    expect(made.space_type).toBe("apartment");
    expect(made.floor_id).toBe("1:floor");
    expect(next.layer.groups.get("1:A1")!.parent_group_id).toBe(made.id);
    expect(next.layer.groups.get("1:A2")!.parent_group_id).toBe(made.id);
    // They agreed, so they keep what they had.
    expect(next.layer.groups.get("1:A1")!.space_type).toBe("apartment");
  });

  it("goes to Unknown, and takes its members with it, when they disagree", () => {
    const st = state();
    // The gym and a shop: not the same kind of thing.
    const next = createEnvelope(st, {
      kind: "group",
      name: "Ground floor tenants",
      members: ["0:GYM", "0:C1"],
    });
    const made = [...next.layer.groups.values()].find(
      (g) => g.name === "Ground floor tenants",
    )!;
    expect(made.space_type).toBeNull();
    expect(groupAccessType(next.layer, made)).toBeNull();
    for (const id of ["0:GYM", "0:C1"]) {
      const g = next.layer.groups.get(id)!;
      expect(g.space_type).toBeNull();
      expect(groupAccessType(next.layer, g)).toBeNull();
    }
    // And the panel lists it where Unknown things go.
    const unknown = spaceCategories(next.layer).find((c) => c.id === null)!;
    expect(unknown.groups.map((g) => g.id)).toContain(made.id);
  });

  it("may hold rooms and envelopes together", () => {
    const st = state();
    const room = roomsOf(st, "1:A1")[0];
    const next = createEnvelope(st, {
      kind: "group",
      name: "Mixed",
      members: [room, "1:A2"],
    });
    const made = [...next.layer.groups.values()].find((g) => g.name === "Mixed")!;
    expect(next.layer.rooms.get(room)!.group_id).toBe(made.id);
    expect(next.layer.groups.get("1:A2")!.parent_group_id).toBe(made.id);
  });

  it("stays inside the flat when everything picked was in that flat", () => {
    const st = state();
    const members = roomsOf(st, "1:A1").slice(0, 2);
    const next = createEnvelope(st, { kind: "group", name: "Inner", members });
    const made = [...next.layer.groups.values()].find((g) => g.name === "Inner")!;
    expect(made.parent_group_id).toBe("1:A1");
  });

  it("refuses spaces from two floors", () => {
    const st = state();
    expect(() => membersFloor(st.layer, ["1:A1", "2:A21"])).toThrow(
      OperationRejected,
    );
    expect(
      envelopeRefusal(st.layer, { kind: "group", name: "X", members: ["1:A1", "2:A21"] }),
    ).toMatch(/same floor/);
  });

  it("refuses a thing and something already inside it", () => {
    const st = state();
    const inner = roomsOf(st, "1:A1")[0];
    expect(
      envelopeRefusal(st.layer, { kind: "group", name: "X", members: ["1:A1", inner] }),
    ).toMatch(/already inside/);
  });

  it("refuses a whole floor, an empty name and an empty pick", () => {
    const st = state();
    expect(
      envelopeRefusal(st.layer, { kind: "group", name: "X", members: ["1:floorgroup"] }),
    ).toMatch(/whole floor/);
    expect(
      envelopeRefusal(st.layer, { kind: "group", name: "  ", members: ["1:A1"] }),
    ).toMatch(/name/);
    expect(
      envelopeRefusal(st.layer, { kind: "apartment", name: "X", members: [] }),
    ).toMatch(/Select/);
  });

  it("is one undo", () => {
    const st = state();
    const next = createEnvelope(st, { kind: "group", name: "G", members: ["1:A1"] });
    expect(undo(next).file).toBe(st.file);
  });
});

describe("addStoreys", () => {
  it("adds floors on top, each with the envelope that stands for it", () => {
    const st = state();
    const { state: next, floorIds } = addStoreys(st, ["", "Roof"]);
    expect(floorIds).toEqual(["5:floor", "6:floor"]);
    const f5 = next.layer.floors.find((f) => f.id === "5:floor")!;
    const f6 = next.layer.floors.find((f) => f.id === "6:floor")!;
    expect(f5.level).toBe(5);
    expect(f5.name).toBe("floor 5");
    expect(f6.name).toBe("Roof");
    expect(f6.level).toBe(6);
    expect(next.layer.groups.get("5:floorgroup")?.parent_group_id).toBeNull();
    expect(next.layer.groups.get("6:floorgroup")?.floor_id).toBe("6:floor");
    // Nothing is drawn on them.
    expect(next.layer.roomsByFloor.get("5:floor") ?? []).toEqual([]);
  });

  it("is one undo, and a no-op for nothing", () => {
    const st = state();
    expect(addStoreys(st, []).state).toBe(st);
    const { state: next } = addStoreys(st, ["x"]);
    expect(undo(next).file).toBe(st.file);
  });
});

describe("an added storey, before anything is drawn on it", () => {
  it("lists no envelopes and is not an Unknown space", () => {
    // The envelope that stands for a whole floor is not a space on it.
    // With nothing drawn yet it is the only group there, and listing
    // it would put "Floor 5" in the tree under floor 5 and count it
    // in the Unknown category — which is what happened.
    const st = state();
    const { state: next, floorIds } = addStoreys(st, ["Roof"]);
    expect(floorEnvelopes(next.layer, floorIds[0])).toEqual([]);
    const unknown = spaceCategories(next.layer).find((c) => c.id === null)!;
    expect(unknown.groups.map((g) => g.id)).not.toContain("5:floorgroup");
    expect(unknown.groups.length).toBe(
      spaceCategories(st.layer).find((c) => c.id === null)!.groups.length,
    );
  });
});
