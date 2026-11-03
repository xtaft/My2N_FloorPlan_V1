/**
 * The building before it has a floor plan.
 *
 * This is where the product starts: a customer has their apartments, their
 * residents and their devices in My2N already, and no drawing of any of it.
 * The floor plan is the thing they are about to make.
 *
 * Nothing here is a second source of truth. Every list is derived from the
 * same fixture the plan is built from, with the plan ignored — so the
 * building you see before drawing and the building you edit afterwards are
 * the same building, and cannot drift apart. In particular:
 *
 * - **spaces** are the envelopes, flat. No floors: the customer's list is
 *   apartments and common spaces, and which storey each sits on is exactly
 *   what the floor plan is for.
 * - **residents** are the people whose access profile reaches an apartment,
 *   assigned to that apartment. **Operators** are everyone else.
 * - **devices** keep their answering units in their apartments, because a
 *   unit belongs to a flat rather than to a wall. Everything else is a
 *   reader or an intercom on a door, and there are no doors yet, so it
 *   starts unplaced — which is the honest state and also the reason the
 *   floor plan is worth drawing.
 */
import { accessType, roomsInGroup } from "./access";
import { allEnvelopes } from "./derive";
import type { VisualLayer } from "./load";
import type { Group } from "./types";

// ----------------------------------------------------------------- people

export type OperatorRole = "property_manager" | "maintenance" | "employee";

export interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** Ready to use the system, invited but not yet set up, or in trouble. */
  status: "ready" | "pending" | "problem";
}

export interface Resident extends Person {
  /** The envelope they live in. */
  apartment_id: string;
  apartment_name: string;
}

export interface Operator extends Person {
  role: OperatorRole;
}

/**
 * Names for the people the fixture only gives ids to.
 *
 * A fixed pool indexed by the id, so the same person is the same person on
 * every render and in every test. The mix is deliberate: the building is in
 * Prague and its residents are not all Czech, which is the case the product
 * is actually sold into and the case where a name column has to behave.
 */
const NAMES = [
  "Camille Dubois", "Jae-won Jung", "Joanna Nowak", "Kavya Sharma",
  "Rina Takahashi", "Selin Arslan", "Taras Melnyk", "Youssef Farouk",
  "Emre Arslan", "Petra Nováková", "Lukáš Dvořák", "Mei Chen",
  "Olumide Adeyemi", "Sofia Rossi", "Jonas Berg", "Amara Okonkwo",
  "Tomáš Procházka", "Elena Petrova", "Hiroshi Sato", "Fatima Zahra",
  "Marek Kowalski", "Ana Beatriz Lima", "Niels Jansen", "Priya Nair",
  "Dmytro Shevchenko", "Isabelle Moreau", "Andrés Gómez", "Nguyen Minh",
  "Klara Svobodová", "Omar Haddad", "Ingrid Larsen", "Rajesh Kumar",
  "Chiara Ferrari", "Pavel Horák", "Leila Nasser", "Sten Mägi",
  "Grace Mwangi", "Viktor Novák", "Mira Alonso", "Hassan Darwish",
  "Jana Benešová", "Kofi Mensah", "Linnea Holm", "Arjun Patel",
  "Zuzana Kučerová", "Mateo Silva", "Yuki Tanaka", "Ewa Zielińska",
  "Ibrahim Toure", "Martina Veselá", "Sanne de Vries", "Rohan Desai",
  "Alina Popescu", "Jakub Černý", "Noor Rahman", "Astrid Nilsen",
  "Daniel Moreira", "Hana Pospíšilová", "Emeka Obi",
];

/**
 * Hand out names so that no two people share one.
 *
 * Taking the number out of the id is not enough: the fixture numbers its
 * residents R001… and its staff S001… separately, so the digits collide
 * across the two. Positions in a sorted list cannot.
 */
function named(ids: string[], offset: number): Person[] {
  return ids.sort().map((id, i) => {
    const slot = (offset + i) % NAMES.length;
    const name = NAMES[slot];
    return {
      id,
      name,
      email: emailFor(name, HOSTS[slot % HOSTS.length]),
      // Czech mobile numbers, laid out so no two people share one.
      phone: `+420 ${600 + (slot % 100)} ${String(100 + (slot % 900)).padStart(3, "0")} ${String(100 + ((slot * 37) % 900)).padStart(3, "0")}`,
      // Every eighth is still setting up, so the Pending filter has
      // something to find and the status column is not one value.
      status: i % 8 === 7 ? ("pending" as const) : ("ready" as const),
    };
  });
}

const ACCENTS: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o", ř: "r",
  š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z", ł: "l", ń: "n", ś: "s",
  ź: "z", ż: "z", ğ: "g", ı: "i", ö: "o", ü: "u", ç: "c", å: "a", ø: "o",
  æ: "ae", ã: "a", õ: "o", ê: "e", è: "e", ô: "o", ñ: "n",
};

/** An address someone could actually have, from a name that has accents. */
function emailFor(name: string, host: string): string {
  const plain = [...name.toLowerCase()]
    .map((c) => ACCENTS[c] ?? c)
    .join("")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/ +/g, ".");
  return `${plain}@${host}`;
}

const HOSTS = ["gmail.com", "outlook.com", "seznam.cz", "yahoo.com"];

/**
 * Residents, read off the access profiles.
 *
 * A resident is someone whose profile reaches an apartment — that is what
 * living there means in this model, and it is why the apartment on the row
 * is derived rather than stored twice.
 */
export function residents(layer: VisualLayer): Resident[] {
  const home = new Map<string, Group>();

  for (const profile of layer.profiles) {
    for (const roomId of profile.rooms) {
      const room = layer.rooms.get(roomId);
      if (!room || accessType(layer, room) !== "apartment") continue;
      const group = room.group_id ? layer.groups.get(room.group_id) : undefined;
      if (!group) continue;
      for (const personId of profile.people) {
        if (!home.has(personId)) home.set(personId, group);
      }
      break; // one apartment per profile: the one they live in
    }
  }

  return named([...home.keys()], 0)
    .map((person) => {
      const group = home.get(person.id)!;
      return {
        ...person,
        apartment_id: group.id,
        apartment_name: group.name,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Everyone else: the people who work in the building rather than live in it.
 *
 * The roles are assigned by rank rather than stored, because the fixture has
 * no notion of a job. One property manager, two on maintenance, the rest
 * employees of whatever the building holds — the shops and the gym.
 */
export function operators(layer: VisualLayer): Operator[] {
  const living = residents(layer);
  const isResident = new Set(living.map((r) => r.id));

  const ids = new Set<string>();
  for (const profile of layer.profiles) {
    for (const personId of profile.people) {
      if (!isResident.has(personId)) ids.add(personId);
    }
  }

  // Named from where the residents left off, so the two lists never show
  // the same person under two jobs.
  return named([...ids], living.length)
    .map((person, i) => ({
      ...person,
      status: "ready" as const,
      role:
        i === 0
          ? ("property_manager" as const)
          : i < 3
            ? ("maintenance" as const)
            : ("employee" as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function operatorRoleName(role: OperatorRole): string {
  if (role === "property_manager") return "Property manager";
  if (role === "maintenance") return "Maintenance";
  return "Employee";
}

// ----------------------------------------------------------------- spaces

export interface BuildingSpace {
  id: string;
  name: string;
  /** The category it reads as, for the icon and the chip. */
  space_type: string | null;
  /** Spaces inside it, which is what makes a row expandable. */
  rooms: { id: string; name: string }[];
  /** Apartments are listed after the common spaces, as the design has it. */
  apartment: boolean;
}

/**
 * The customer's list of spaces, flat.
 *
 * Envelopes only, and not the ones that exist because a floor plan does.
 * A storey's own envelope is an artefact of drawing. A stairwell or a lift
 * shaft is a vertical connection, which is a fact about the building's
 * shape rather than a space anybody administers.
 *
 * Corridors are the interesting case, because the lobby is one and the
 * four hallways are too. What separates them is in the data: every
 * resident is admitted to the lobby, and nobody is admitted to a hallway,
 * because walking down it is not something anyone needs permission for.
 * A common space somebody has been given access to is a space somebody
 * manages — so the lobby is on the list and the hallways are not.
 */
const VERTICAL = new Set(["stairs", "elevator"]);

export function buildingSpaces(layer: VisualLayer): BuildingSpace[] {
  const admitted = new Set<string>();
  for (const profile of layer.profiles) {
    for (const roomId of profile.rooms) admitted.add(roomId);
  }

  const out: BuildingSpace[] = [];

  for (const group of allEnvelopes(layer)) {
    const type = groupType(layer, group);
    if (type === null) continue; // a storey's own envelope
    if (VERTICAL.has(type)) continue;
    if (
      type === "circulation" &&
      !roomsInGroup(layer, group.id).some((r) => admitted.has(r.id))
    ) {
      continue;
    }

    out.push({
      id: group.id,
      name: group.name,
      space_type: type,
      rooms: roomsInGroup(layer, group.id).map((r) => ({
        id: r.id,
        name: r.name,
      })),
      apartment: type === "apartment",
    });
  }

  // Common spaces first, then the units, each alphabetically — the order
  // the list is read in rather than the order the file happens to store.
  return out.sort((a, b) => {
    if (a.apartment !== b.apartment) return a.apartment ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

function groupType(layer: VisualLayer, group: Group): string | null {
  if (group.space_type) return group.space_type;
  const rooms = roomsInGroup(layer, group.id);
  const first = rooms[0];
  return first ? accessType(layer, first) : null;
}

// ---------------------------------------------------------------- devices

export interface BuildingDevice {
  id: string;
  name: string;
  /** The product, as the catalogue names it. */
  type: string;
  /** The space it is in, or null while nothing has placed it. */
  placement: string | null;
  status: "ok" | "offline" | "not_verified";
}

const PRODUCT: Record<string, string> = {
  intercom: "IP Style",
  answering_unit: "IndoorView",
  access_unit: "Access Unit 2.0",
};

export function productName(deviceType: string): string {
  return PRODUCT[deviceType] ?? deviceType;
}

/**
 * Every device the building has, and where it is before there is a plan.
 *
 * An answering unit is the flat's, so it is placed from the day the flat
 * exists. A reader or an intercom is on a door, and until the building has
 * been drawn there are no doors to put one on — so it is unplaced, and
 * placing it is one of the things the floor plan is for.
 */
export function buildingDevices(layer: VisualLayer): BuildingDevice[] {
  return layer.file.devices
    .map((device) => {
      const room =
        device.device_type === "answering_unit" && device.host_id
          ? layer.rooms.get(device.host_id)
          : undefined;
      const group = room?.group_id ? layer.groups.get(room.group_id) : undefined;

      return {
        id: device.id,
        name: device.name,
        type: productName(device.device_type),
        placement: group?.name ?? null,
        status: device.status as BuildingDevice["status"],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deviceStatusName(status: BuildingDevice["status"]): string {
  if (status === "ok") return "Up to date";
  if (status === "offline") return "Offline";
  return "Need settings";
}
