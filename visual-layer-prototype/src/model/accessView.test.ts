/**
 * Access mode: who gets in where.
 */
import { describe, expect, it } from "vitest";
import {
  ACCESS_COLORS,
  accessGroups,
  accessPaint,
  accessShading,
  devicesHeldBy,
  devicesIntoGroup,
  mainEntranceDevices,
  operators,
  residents,
  visualLayer as layer,
} from "./index";

describe("access groups", () => {
  it("is the profiles, one for one", () => {
    const groups = accessGroups(layer);
    expect(groups).toHaveLength(layer.profiles.length);
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
  });

  it("is named after what it admits to, not after its id", () => {
    const names = accessGroups(layer).map((g) => g.name);
    for (const n of names) expect(n).not.toMatch(/^P\d+$/);
    // A resident group is named for the flat it opens.
    expect(names).toContain("A1 residents");
    // Everything else by the space, so the list reads as places.
    expect(names.some((n) => n.endsWith(" access"))).toBe(true);
  });

  it("carries the devices and the people the profile holds", () => {
    const groups = accessGroups(layer);
    for (const profile of layer.profiles) {
      const group = groups.find((g) => g.id === profile.id)!;
      expect(group.devices).toEqual(profile.devices);
      expect(group.people).toEqual(profile.people);
    }
  });
});

describe("the way in everybody has", () => {
  it("is the device guarding the space the building is entered through", () => {
    expect(mainEntranceDevices(layer)).toEqual(["IC-0-d10"]);
  });

  it("finds the devices into a flat", () => {
    const into = devicesIntoGroup(layer, "1:A1");
    expect(into.length).toBeGreaterThan(0);
    for (const id of into) {
      const device = layer.file.devices.find((d) => d.id === id)!;
      expect(device.host_kind).toBe("door");
    }
  });
});

describe("what a person holds", () => {
  it("is the union of their groups", () => {
    const staff = operators(layer)[0];
    const expected = new Set<string>();
    for (const p of layer.profiles) {
      if (p.people.includes(staff.id)) for (const d of p.devices) expected.add(d);
    }
    expect(new Set(devicesHeldBy(layer, staff.id))).toEqual(expected);
  });

  it("gives a resident their own front door and the building's", () => {
    const person = residents(layer)[0];
    const held = new Set(devicesHeldBy(layer, person.id));
    for (const id of devicesIntoGroup(layer, person.apartment_id)) {
      expect(held.has(id)).toBe(true);
    }
    for (const id of mainEntranceDevices(layer)) expect(held.has(id)).toBe(true);
  });

  it("gets a resident home when their group does not open their door", () => {
    // The rule exists for this: a group that grants the entrance but
    // not the flat would otherwise draw somebody locked out of where
    // they live, which is a lie about the building rather than a
    // finding about the data.
    //
    // It cannot be tested by taking the person out of every group,
    // because living somewhere is *derived* from a group of theirs
    // reaching an apartment — out of all of them they stop being a
    // resident. So the groups keep them and lose the device.
    const person = residents(layer)[0];
    const theirDoor = devicesIntoGroup(layer, person.apartment_id);
    expect(theirDoor.length).toBeGreaterThan(0);

    const stripped = {
      ...layer,
      profiles: layer.profiles.map((p) => ({
        ...p,
        devices: p.people.includes(person.id)
          ? p.devices.filter((d) => !theirDoor.includes(d))
          : p.devices,
      })),
    };
    // The groups no longer open it...
    const fromGroups = new Set(
      stripped.profiles
        .filter((p) => p.people.includes(person.id))
        .flatMap((p) => p.devices),
    );
    for (const id of theirDoor) expect(fromGroups.has(id)).toBe(false);

    // ...and they can still go home.
    const held = new Set(devicesHeldBy(stripped, person.id));
    for (const id of theirDoor) expect(held.has(id)).toBe(true);
  });

  it("adds nothing in this fixture, where the groups already grant it", () => {
    // Worth stating: the rule above is a guard, not something doing
    // visible work here. Every resident profile already carries the
    // entrance and the flat, so the extra grant is a no-op — and a
    // reader of the screen should not think it is what makes the
    // colours come out as they do.
    for (const person of residents(layer)) {
      const fromGroups = new Set(
        layer.profiles
          .filter((p) => p.people.includes(person.id))
          .flatMap((p) => p.devices),
      );
      expect(new Set(devicesHeldBy(layer, person.id))).toEqual(fromGroups);
    }
  });

  it("gives somebody who is in nothing and lives nowhere nothing", () => {
    expect(devicesHeldBy(layer, "nobody")).toEqual([]);
  });
});

describe("shading the plan", () => {
  it("asks nothing and answers nothing when nothing is selected", () => {
    const shade = accessShading(layer, new Set());
    expect(shade.size).toBe(layer.file.rooms.length);
    for (const v of shade.values()) expect(v).toBe("none");
  });

  it("puts every space on one side or the other once something is", () => {
    const person = residents(layer)[0];
    const shade = accessShading(layer, new Set(devicesHeldBy(layer, person.id)));
    expect(shade.size).toBe(layer.file.rooms.length);
    for (const v of shade.values()) expect(v).not.toBe("none");
    expect([...shade.values()].some((v) => v === "open")).toBe(true);
    expect([...shade.values()].some((v) => v === "closed")).toBe(true);
  });

  it("opens the flat a resident lives in and not the one next door", () => {
    const person = residents(layer).find((r) => r.apartment_name === "A1")!;
    const shade = accessShading(layer, new Set(devicesHeldBy(layer, person.id)));

    const theirs = layer.file.rooms.filter((r) => r.group_id === "1:A1");
    for (const room of theirs) expect(shade.get(room.id)).toBe("open");

    const neighbour = layer.file.rooms.filter((r) => r.group_id === "1:A2");
    expect(neighbour.length).toBeGreaterThan(0);
    for (const room of neighbour) expect(shade.get(room.id)).toBe("closed");
  });

  it("opens more as more groups are selected", () => {
    const groups = accessGroups(layer);
    const one = new Set(groups[0].devices);
    const two = new Set([...groups[0].devices, ...groups[1].devices]);
    const count = (s: Set<string>) =>
      [...accessShading(layer, s).values()].filter((v) => v === "open").length;
    expect(count(two)).toBeGreaterThan(count(one));
  });

  it("paints grey, green and red and nothing else", () => {
    const paint = accessPaint(accessShading(layer, new Set()));
    const room = layer.file.rooms[0];
    expect(paint(room)).toBe(ACCESS_COLORS.none);

    const person = residents(layer)[0];
    const lit = accessPaint(
      accessShading(layer, new Set(devicesHeldBy(layer, person.id))),
    );
    const colours = new Set(layer.file.rooms.map((r) => lit(r)));
    expect([...colours].sort()).toEqual(
      [ACCESS_COLORS.open, ACCESS_COLORS.closed].sort(),
    );
  });
});
