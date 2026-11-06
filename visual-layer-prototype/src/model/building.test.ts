/**
 * The building before it has a floor plan.
 *
 * Everything here is derived from the same fixture the plan is drawn from,
 * so most of these tests are really one claim: the building you see before
 * drawing and the building you edit afterwards cannot disagree.
 */
import { describe, expect, it } from "vitest";
import {
  buildingDevices,
  buildingSpaces,
  deviceStatusName,
  allPeople,
  operatorRoleName,
  operators,
  productName,
  residents,
  visualLayer as layer,
} from "./index";

describe("residents", () => {
  it("is everybody the data says lives here", () => {
    const all = residents(layer);
    expect(all).toHaveLength(44);
    for (const r of all) expect(r.apartment_id).toMatch(/^\d:A\d+$/);
  });

  it("names their answering unit the way the plan names it", () => {
    // The record points at the device by id. The id is not a name the
    // product shows anywhere else, so a resident row that printed it
    // would be naming a box nobody could find in the Devices tab.
    const grace = residents(layer).find((r) => r.id === "R001")!;
    expect(grace.answeringUnit).toBe("A1 IndoorView");
    for (const r of residents(layer)) {
      if (r.answeringUnit === null) continue;
      expect(r.answeringUnit).not.toMatch(/^AN-/);
    }
  });

  it("joins their flat to the plan's envelope for it", () => {
    // The data gives a storey and a name — "A1" on floor 1 — and the
    // plan calls that envelope 1:A1. That join is the only derivation
    // left in here; everything else is read.
    const grace = residents(layer).find((r) => r.id === "R001")!;
    expect(grace.name).toBe("Grace Collins");
    expect(grace.floor).toBe(1);
    expect(grace.apartment_name).toBe("A1");
    expect(layer.groups.get(grace.apartment_id)).toBeDefined();
  });

  it("reads names and addresses rather than making them up", () => {
    const all = residents(layer);
    expect(all.map((r) => r.name)).toContain("Carlos García");
    for (const r of all) expect(r.email).toMatch(/@example\.com$/);
  });

  it("knows who the building writes to for each flat", () => {
    const byFlat = new Map<string, number>();
    for (const r of residents(layer)) {
      if (r.mainContact) byFlat.set(r.apartment_id, (byFlat.get(r.apartment_id) ?? 0) + 1);
    }
    // One per flat, which is what a main contact is.
    for (const n of byFlat.values()) expect(n).toBe(1);
    expect(byFlat.size).toBe(28);
  });

  it("carries the note the data wanted kept", () => {
    // Four flats have no entrance door drawn yet, and the data says so
    // on the people who live in them.
    const noted = residents(layer).filter((r) => r.note !== null);
    expect(noted.length).toBeGreaterThan(0);
    for (const r of noted) expect(r.note).toMatch(/no entrance door/);
  });
});

describe("operators", () => {
  it("is everybody who works here, with the job the data gives them", () => {
    const staff = operators(layer);
    expect(staff).toHaveLength(15);
    const by = (role: string) => staff.filter((o) => o.role === role).length;
    expect(by("property_manager")).toBe(1);
    expect(by("maintenance")).toBe(2);
    expect(by("employee")).toBe(12);

    const manager = staff.find((o) => o.role === "property_manager")!;
    expect(manager.name).toBe("James Foster");
    expect(manager.jobTitle).toBe("Property manager");
    // Null workplace means the whole building rather than a gap.
    expect(manager.workplace).toBeNull();
  });

  it("places the shop and gym staff at their business", () => {
    const where = new Set(
      operators(layer)
        .filter((o) => o.role === "employee")
        .map((o) => o.workplace),
    );
    expect([...where].sort()).toEqual(["C1", "C2", "GYM"]);
  });

  it("names the roles for the table", () => {
    expect(operatorRoleName("property_manager")).toBe("Property manager");
    expect(operatorRoleName("maintenance")).toBe("Maintenance");
    expect(operatorRoleName("employee")).toBe("Employee");
  });
});

describe("everybody", () => {
  it("is the residents and the operators, all 59 of them", () => {
    const all = allPeople(layer);
    expect(all).toHaveLength(59);
    expect(new Set(all.map((p) => p.id)).size).toBe(59);
    expect(new Set(all.map((p) => p.email)).size).toBe(59);
  });
});

describe("the building's spaces, before there is a plan", () => {
  it("is flat: no floors, because that is what the plan is for", () => {
    const spaces = buildingSpaces(layer);
    for (const s of spaces) {
      expect(s).not.toHaveProperty("floor_id");
      expect(layer.floors.map((f) => f.name)).not.toContain(s.name);
    }
  });

  it("lists what somebody manages, and nothing the drawing invented", () => {
    const names = buildingSpaces(layer).map((s) => s.name);
    expect(names.filter((n) => !/^A\d+$/.test(n))).toEqual([
      "C1",
      "C2",
      "GYM",
      "Lobby",
      "Technical room",
    ]);
    // Vertical connections are a fact about the shape, not a space.
    expect(names).not.toContain("Stairs");
    expect(names).not.toContain("Elevator");
    // A corridor nobody is admitted to is not managed by anybody; the
    // lobby, which every resident is admitted to, is.
    expect(names).not.toContain("Hallway");
  });

  it("holds every apartment", () => {
    const flats = buildingSpaces(layer).filter((s) => s.apartment);
    expect(flats.length).toBe(28);
    for (const f of flats) expect(f.space_type).toBe("apartment");
  });

  it("puts the common spaces first and sorts units the way they read", () => {
    const spaces = buildingSpaces(layer);
    const firstFlat = spaces.findIndex((s) => s.apartment);
    expect(spaces.slice(0, firstFlat).every((s) => !s.apartment)).toBe(true);
    expect(spaces.slice(firstFlat).every((s) => s.apartment)).toBe(true);
    // A2 before A21, which a plain string sort gets wrong.
    const flats = spaces.filter((s) => s.apartment).map((s) => s.name);
    expect(flats.indexOf("A2")).toBeLessThan(flats.indexOf("A21"));
  });

  it("knows what is inside each one", () => {
    const gym = buildingSpaces(layer).find((s) => s.name === "GYM")!;
    expect(gym.rooms.map((r) => r.name).sort()).toEqual([
      "Gym floor",
      "Locker room M",
      "Locker room W",
      "Showers M",
      "Showers W",
    ]);
  });
});

describe("the building's devices, before there is a plan", () => {
  it("has them all", () => {
    expect(buildingDevices(layer).length).toBe(layer.file.devices.length);
  });

  it("places answering units in their flat and nothing else anywhere", () => {
    const devices = buildingDevices(layer);
    const placed = devices.filter((d) => d.placement !== null);
    const loose = devices.filter((d) => d.placement === null);

    // A unit belongs to the flat, so it is placed from the day the flat is.
    expect(placed.length).toBe(28);
    for (const d of placed) {
      expect(d.type).toBe("IndoorView");
      expect(d.placement).toMatch(/^A\d+$/);
    }

    // Everything else goes on a door, and there are no doors yet.
    expect(loose.length).toBe(35);
    for (const d of loose) {
      expect(["Access Unit 2.0", "IP Style"]).toContain(d.type);
    }
  });

  it("says where the plan put them once there is one", () => {
    // The same list asked the other question. Nothing is waiting any
    // more except the two readers the fixture leaves unassigned, and
    // every placement is one the plan's own device panel would give.
    const devices = buildingDevices(layer, true);
    const loose = devices.filter((d) => d.placement === null);
    expect(loose.map((d) => d.id).sort()).toEqual(["AC-U1", "AC-U2"]);

    const lobby = devices.find((d) => d.name === "Lobby Entrance")!;
    expect(lobby.placement).toBe("Lobby");
    expect(lobby.floor).toBe("ground floor");

    const unit = devices.find((d) => d.id === "AN-A1")!;
    expect(unit.placement).toBe("A1");
    expect(unit.floor).toBe("floor 1");
  });

  it("names the product rather than the model's word for it", () => {
    expect(productName("intercom")).toBe("IP Style");
    expect(productName("answering_unit")).toBe("IndoorView");
    expect(productName("access_unit")).toBe("Access Unit 2.0");
    // An unknown type says what it is instead of pretending.
    expect(productName("doorbell")).toBe("doorbell");
  });

  it("says what a status means in the table's words", () => {
    expect(deviceStatusName("ok")).toBe("Up to date");
    expect(deviceStatusName("offline")).toBe("Offline");
    expect(deviceStatusName("not_verified")).toBe("Need settings");
  });
});
