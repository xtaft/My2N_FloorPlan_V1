/**
 * Access mode: who gets in where.
 */
import { describe, expect, it } from "vitest";
import {
  ACCESS_COLORS,
  accessBadges,
  accessGroups,
  accessPaint,
  allPeople,
  accessShading,
  EXTERIOR,
  devicesHeldBy,
  reachable,
  residents,
  visualLayer as layer,
} from "./index";

describe("access groups", () => {
  it("is the four the data defines", () => {
    expect(accessGroups().map((g) => g.name)).toEqual([
      "Maintenance",
      "Commercial 1",
      "Commercial 2",
      "Gym",
    ]);
  });

  it("carries the devices and the people the data gives each", () => {
    const gym = accessGroups().find((g) => g.name === "Gym")!;
    expect(gym.devices.sort()).toEqual(["AC-0-d8", "AC-U1", "AC-U2"]);
    // Staff and the residents who are gym members.
    expect(gym.people).toHaveLength(18);
    expect(gym.people).toContain("S010");
    expect(gym.people).toContain("R003");
  });

  it("names every device it holds, and they are real devices", () => {
    const known = new Set(layer.file.devices.map((d) => d.id));
    for (const group of accessGroups()) {
      expect(group.devices.length).toBeGreaterThan(0);
      for (const id of group.devices) expect(known.has(id)).toBe(true);
    }
  });

  it("names every person it holds, and they are real people", () => {
    const known = new Set(allPeople(layer).map((p) => p.id));
    for (const group of accessGroups()) {
      for (const id of group.people) expect(known.has(id)).toBe(true);
    }
  });
});

describe("what a person holds", () => {
  it("is what they hold themselves plus what their groups open", () => {
    // The gym's cleaner: the gym door from the group, and nothing of
    // her own beyond it.
    const chloe = allPeople(layer).find((p) => p.name === "Chloe Taylor")!;
    expect(new Set(devicesHeldBy(layer, chloe.id))).toEqual(
      new Set(["AC-0-d8", "AC-U1", "AC-U2"]),
    );
  });

  it("gives a resident the entrance and their own door, from the data", () => {
    const grace = residents(layer).find((r) => r.id === "R001")!;
    expect(new Set(devicesHeldBy(layer, grace.id))).toEqual(
      new Set(["IC-0-d10", "AC-1-d11"]),
    );
  });

  it("adds the gym to a resident who is a member", () => {
    // R003 lives in A2 and is in the Gym group, so he holds both.
    const held = new Set(devicesHeldBy(layer, "R003"));
    expect(held.has("AC-1-d7")).toBe(true); // his own flat
    expect(held.has("IC-0-d10")).toBe(true); // the entrance
    expect(held.has("AC-0-d8")).toBe(true); // the gym
  });

  it("gives no flat key where the data says there is no door yet", () => {
    // Four flats have no entrance door drawn. Their residents hold the
    // intercom and nothing else — and deriving "a resident always gets
    // their own door" would have handed them a key to a door that is
    // not there, which is what this file used to do.
    const lorenzo = residents(layer).find((r) => r.id === "R012")!;
    expect(lorenzo.apartment_name).toBe("A7");
    expect(devicesHeldBy(layer, lorenzo.id)).toEqual(["IC-0-d10"]);
  });

  it("gives somebody the data has never heard of nothing", () => {
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
    const person = residents(layer).find((r) => r.id === "R001")!;
    const shade = accessShading(layer, new Set(devicesHeldBy(layer, person.id)));

    const theirs = layer.file.rooms.filter((r) => r.group_id === "1:A1");
    for (const room of theirs) expect(shade.get(room.id)).toBe("open");

    const neighbour = layer.file.rooms.filter((r) => r.group_id === "1:A2");
    expect(neighbour.length).toBeGreaterThan(0);
    for (const room of neighbour) expect(shade.get(room.id)).toBe("closed");
  });

  it("opens more as more groups are selected", () => {
    const groups = accessGroups();
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

describe("who the building actually lets in where", () => {
  const openTo = (personId: string) => {
    const shade = accessShading(layer, new Set(devicesHeldBy(layer, personId)));
    return new Set(
      [...shade.entries()]
        .filter(([, v]) => v === "open")
        .map(([id]) => layer.rooms.get(id)?.name ?? id),
    );
  };

  it("lets a resident into the shared spaces, and their own flat", () => {
    // R001 lives in A1. The entrance intercom gets her in; the shared
    // spaces beyond it are not guarded, so they are hers too; and her
    // own reader opens her flat.
    const open = openTo("R001");
    expect(open.has("Lobby")).toBe(true);
    expect(open.has("Hallway")).toBe(true);
    expect(open.has("Stairs")).toBe(true);
    expect(open.has("Elevator")).toBe(true);
    expect(open.has("Living room")).toBe(true);
  });

  it("keeps the shop staff out of the rest of the building", () => {
    // They come in from the street through their own door and hold
    // nothing else — no intercom, so no lobby, so nothing beyond it.
    const open = openTo("S004");
    expect(open.has("Shop floor")).toBe(true);
    expect(open.has("Lobby")).toBe(false);
    expect(open.has("Stairs")).toBe(false);
    expect(open.has("Hallway")).toBe(false);
  });

  it("keeps the gym staff out of it too, lockers aside", () => {
    const open = openTo("S015");
    expect(open.has("Gym floor")).toBe(true);
    expect(open.has("Locker room M")).toBe(true);
    expect(open.has("Lobby")).toBe(false);
  });

  it("is the walk starting outside that makes that true", () => {
    // Worth pinning: start the walk in the lobby and everybody is
    // standing in it before they have opened anything, which hands the
    // shop staff the whole building.
    const fromLobby = reachable(layer, "0:L", {
      allowedDevices: new Set(devicesHeldBy(layer, "S004")),
    }).seen;
    expect(fromLobby.has("0:L")).toBe(true);

    const fromOutside = reachable(layer, EXTERIOR, {
      allowedDevices: new Set(devicesHeldBy(layer, "S004")),
    }).seen;
    expect(fromOutside.has("0:L")).toBe(false);
  });

  it("does not call a flat an access group", () => {
    // An apartment door is a hidden group: the resident holds its
    // reader in their own right, and it is not something a manager
    // administers in the groups list.
    const names = accessGroups().map((g) => g.name);
    for (const name of names) expect(name).not.toMatch(/^A\d+$/);
    expect(names).toHaveLength(4);

    // And no group's devices are an apartment reader.
    const flatReaders = new Set(
      residents(layer).flatMap((r) =>
        r.accessPoints.filter((d) => d !== "IC-0-d10"),
      ),
    );
    for (const group of accessGroups()) {
      for (const id of group.devices) expect(flatReaders.has(id)).toBe(false);
    }
  });
});

describe("marking the tree with where you can get", () => {
  const badgesFor = (personId: string) =>
    accessBadges(layer, accessShading(layer, new Set(devicesHeldBy(layer, personId))));

  it("marks nothing while nothing is selected", () => {
    const none = accessBadges(layer, accessShading(layer, new Set()));
    expect(none.rooms.size).toBe(0);
    expect(none.floors.size).toBe(0);
    expect(none.groups.size).toBe(0);
  });

  it("marks the rooms somebody gets into, and not the way there", () => {
    // R001 can walk every hallway in the building, which is true of
    // anybody who can get through the front door and so says nothing.
    // What is worth marking is her flat.
    const badges = badgesFor("R001");
    const named = [...badges.rooms].map((id) => layer.rooms.get(id)!.name);
    expect(named).toContain("Living room");
    expect(named).not.toContain("Hallway");
    expect(named).not.toContain("Stairs");
    expect(named).not.toContain("Elevator");
    expect(named).not.toContain("Lobby");
  });

  it("marks the flat a resident lives in, and no other", () => {
    const badges = badgesFor("R001");
    expect(badges.groups.has("1:A1")).toBe(true);
    expect(badges.groups.has("1:A2")).toBe(false);
  });

  it("marks only the floors that hold such a room", () => {
    // Her flat is on floor 1. The other storeys are hallway and stairs
    // to her, so they carry nothing.
    expect([...badgesFor("R001").floors]).toEqual(["1:floor"]);
  });

  it("marks the ground floor for somebody who only works there", () => {
    const badges = badgesFor("S004");
    expect([...badges.floors]).toEqual(["0:floor"]);
    const named = [...badges.rooms].map((id) => layer.rooms.get(id)!.name);
    expect(named).toContain("Shop floor");
    expect(named).not.toContain("Lobby");
  });

  it("marks every floor for a key that opens a room on each", () => {
    // Every apartment reader at once: a room on all four upper floors.
    const readers = residents(layer).flatMap((r) =>
      r.accessPoints.filter((d) => d !== "IC-0-d10"),
    );
    const badges = accessBadges(
      layer,
      accessShading(layer, new Set([...readers, "IC-0-d10"])),
    );
    expect([...badges.floors].sort()).toEqual([
      "1:floor",
      "2:floor",
      "3:floor",
      "4:floor",
    ]);
  });
});

describe("what a set of devices opens, and what lies beyond", () => {
  const open = (devices: string[]) => {
    const shade = accessShading(layer, new Set(devices), "devices");
    return new Set(
      [...shade.entries()]
        .filter(([, v]) => v === "open")
        .map(([id]) => layer.rooms.get(id)?.name ?? id),
    );
  };

  it("opens the room a reader guards, wherever that door is", () => {
    // Maintenance holds one device, the reader on the technical room,
    // whose single door is off the lobby. Asking "what does this open"
    // is not asking anyone to walk there from the street.
    expect(open(["RD-0-d3"]).has("Technical room")).toBe(true);
  });

  it("does not hand back the space you were standing in", () => {
    // You were in the lobby when you used the reader. The reader did
    // not let you in there, so it does not colour it — and through the
    // lobby it would otherwise claim every shared space in the
    // building, which is the opposite of what an inside reader means.
    const gained = open(["RD-0-d3"]);
    expect(gained.has("Lobby")).toBe(false);
    expect(gained.has("Stairs")).toBe(false);
    expect(gained.has("Elevator")).toBe(false);
    expect(gained.has("Hallway")).toBe(false);
  });

  it("carries on through whatever is unlocked beyond it", () => {
    // The shop's reader opens the shop floor, and the storage behind
    // it has no door of its own to ask for anything.
    const gained = open(["AC-0-d9"]);
    expect(gained.has("Shop floor")).toBe(true);
    expect(gained.has("Storage")).toBe(true);
    expect(gained.has("Lobby")).toBe(false);
  });

  it("gives the entrance intercom the lobby and the shared spaces", () => {
    // Here the space on the far side *is* what the device opens, and
    // everything beyond it is unguarded.
    const gained = open(["IC-0-d10"]);
    expect(gained.has("Lobby")).toBe(true);
    expect(gained.has("Stairs")).toBe(true);
    expect(gained.has("Hallway")).toBe(true);
    // But not through a door that asks for something else.
    expect(gained.has("Technical room")).toBe(false);
    expect(gained.has("Living room")).toBe(false);
  });

  it("adds a flat when its reader is selected too", () => {
    const gained = open(["IC-0-d10", "AC-1-d11"]);
    expect(gained.has("Lobby")).toBe(true);
    expect(gained.has("Living room")).toBe(true);
  });

  it("opens nothing for a device that is on no door", () => {
    expect(open(["nope"]).size).toBe(0);
    // An answering unit guards nothing, so it admits nobody anywhere.
    expect(open(["AN-A1"]).size).toBe(0);
  });
});

describe("a person is asked about from the street", () => {
  const open = (personId: string) => {
    const shade = accessShading(
      layer,
      new Set(devicesHeldBy(layer, personId)),
      "outside",
    );
    return new Set(
      [...shade.entries()]
        .filter(([, v]) => v === "open")
        .map(([id]) => layer.rooms.get(id)?.name ?? id),
    );
  };

  it("includes everything they pass through on the way", () => {
    // The same technical room, asked about as a journey rather than as
    // a device: the maintenance technician holds the entrance intercom
    // too, so the lobby really is hers and she really can get there.
    const hannah = open("S002");
    expect(hannah.has("Lobby")).toBe(true);
    expect(hannah.has("Technical room")).toBe(true);
  });

  it("stops at the front door for somebody without a key to it", () => {
    const lorenzo = open("S004");
    expect(lorenzo.has("Shop floor")).toBe(true);
    expect(lorenzo.has("Lobby")).toBe(false);
  });

  it("gets a resident home through the shared spaces", () => {
    const grace = open("R001");
    expect(grace.has("Lobby")).toBe(true);
    expect(grace.has("Stairs")).toBe(true);
    expect(grace.has("Living room")).toBe(true);
  });
});
