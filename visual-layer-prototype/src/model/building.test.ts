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
  operatorRoleName,
  operators,
  productName,
  residents,
  visualLayer as layer,
} from "./index";

describe("residents", () => {
  it("is everyone whose access reaches an apartment", () => {
    const all = residents(layer);
    expect(all.length).toBe(44);
    for (const r of all) {
      expect(r.apartment_id).toMatch(/^\d:A\d+$/);
      expect(r.apartment_name).toBe(layer.groups.get(r.apartment_id)!.name);
    }
  });

  it("puts each person in one apartment, the one they live in", () => {
    const seen = new Map<string, string>();
    for (const r of residents(layer)) {
      expect(seen.has(r.id)).toBe(false);
      seen.set(r.id, r.apartment_id);
    }
  });

  it("gives everybody their own name, address and number", () => {
    const all = [...residents(layer), ...operators(layer)];
    expect(new Set(all.map((p) => p.name)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.email)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.phone)).size).toBe(all.length);
  });

  it("writes an address a mail server would take", () => {
    // Accents are the point: the fixture is a Prague building.
    for (const p of residents(layer)) {
      expect(p.email).toMatch(/^[a-z][a-z.]*[a-z]@[a-z.]+$/);
    }
    const accented = residents(layer).find((p) => /[^\x20-\x7E]/.test(p.name));
    expect(accented).toBeDefined();
    expect(accented!.email).toMatch(/^[a-z.]+@/);
  });

  it("is the same list every time it is asked for", () => {
    expect(residents(layer)).toEqual(residents(layer));
  });

  it("has somebody still setting up, so Pending is not an empty filter", () => {
    expect(residents(layer).some((r) => r.status === "pending")).toBe(true);
  });
});

describe("operators", () => {
  it("is everyone who is not a resident", () => {
    const staff = operators(layer);
    const living = new Set(residents(layer).map((r) => r.id));
    expect(staff.length).toBe(15);
    for (const o of staff) expect(living.has(o.id)).toBe(false);

    // Between them they are everybody the building knows.
    const people = new Set<string>();
    for (const profile of layer.profiles) {
      for (const id of profile.people) people.add(id);
    }
    expect(staff.length + living.size).toBe(people.size);
  });

  it("has one property manager and a maintenance pair", () => {
    const by = (role: string) =>
      operators(layer).filter((o) => o.role === role).length;
    expect(by("property_manager")).toBe(1);
    expect(by("maintenance")).toBe(2);
    expect(by("employee")).toBe(12);
  });

  it("names the roles for the table", () => {
    expect(operatorRoleName("property_manager")).toBe("Property manager");
    expect(operatorRoleName("maintenance")).toBe("Maintenance");
    expect(operatorRoleName("employee")).toBe("Employee");
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
