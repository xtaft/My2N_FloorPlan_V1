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
import peopleFile from "../fixtures/people.json";
import { accessType, roomsInGroup } from "./access";
import { allEnvelopes } from "./derive";
import { placeOf, placedOn } from "./device";
import type { VisualLayer } from "./load";
import type { Group } from "./types";

// ----------------------------------------------------------------- people

/**
 * The people are read, not invented.
 *
 * `people.json` is part of the building's data: names, roles, job titles,
 * which flat somebody lives in, and — importantly — which devices each
 * person holds personally. Nothing here derives any of that. An earlier
 * version of this file made names up from a pool because the access
 * profiles carried ids alone; that is gone, and anything the data does
 * not say is now shown as missing rather than filled in.
 */

export type OperatorRole = "property_manager" | "maintenance" | "employee";

export interface Person {
  id: string;
  name: string;
  email: string;
  /** Devices this person holds in their own right, not through a group. */
  accessPoints: string[];
  /** What the data wanted said about them, if anything. */
  note: string | null;
}

export interface Resident extends Person {
  /** The envelope they live in, as the plan knows it. */
  apartment_id: string;
  /** The flat as the customer names it. */
  apartment_name: string;
  floor: number;
  /** The one the building writes to when it has to write to the flat. */
  mainContact: boolean;
  answeringUnit: string | null;
}

export interface Operator extends Person {
  role: OperatorRole;
  jobTitle: string | null;
  /** Which business they work for, or null for the whole building. */
  workplace: string | null;
}

/** A row of `people.json`, which is the shape on disk. */
interface PersonRecord {
  id: string;
  role: string;
  job_title: string | null;
  workplace: string | null;
  full_name: string;
  floor: number | null;
  apartment: string | null;
  main_contact: boolean | null;
  email: string;
  answering_unit: string | null;
  access_points: string[];
  note: string | null;
}

const PEOPLE = (peopleFile as { people: PersonRecord[] }).people;

function base(record: PersonRecord): Person {
  return {
    id: record.id,
    name: record.full_name,
    email: record.email,
    accessPoints: [...record.access_points],
    note: record.note,
  };
}

/**
 * Everybody who lives here, with the flat they live in.
 *
 * The flat is given as a name and a storey — "A1" on floor 1 — and the
 * plan's envelope for it is `1:A1`. Putting the two together here is the
 * only joining this needs: the rest is read straight off the record.
 */
export function residents(layer: VisualLayer): Resident[] {
  return PEOPLE.filter((r) => r.role === "resident")
    .map((record) => {
      const id = `${record.floor}:${record.apartment}`;
      const group = layer.groups.get(id);
      return {
        ...base(record),
        apartment_id: group?.id ?? id,
        apartment_name: group?.name ?? record.apartment ?? "",
        floor: record.floor ?? 0,
        mainContact: record.main_contact === true,
        // The record names the unit by id — AN-A1 — and the plan calls
        // the same box "A1 IndoorView". Showing the id would put a
        // device in the Residents tab that appears nowhere else in the
        // product, so it is resolved to the name everything else uses.
        answeringUnit: answeringUnitName(layer, record.answering_unit),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The unit's name as the rest of the product says it.
 *
 * An id that names no device is left as it is rather than blanked: a
 * reference to something that is not there is worth seeing.
 */
function answeringUnitName(
  layer: VisualLayer,
  id: string | null,
): string | null {
  if (id === null) return null;
  return layer.file.devices.find((d) => d.id === id)?.name ?? id;
}

/** Everybody who works here rather than living here. */
export function operators(_layer: VisualLayer): Operator[] {
  return PEOPLE.filter((r) => r.role !== "resident")
    .map((record) => ({
      ...base(record),
      role: record.role as OperatorRole,
      jobTitle: record.job_title,
      workplace: record.workplace,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everybody, for the panels that do not care which they are. */
export function allPeople(layer: VisualLayer): (Resident | Operator)[] {
  return [...residents(layer), ...operators(layer)];
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
  /** The space it is in or the one it guards, or null while unplaced. */
  placement: string | null;
  /** The storey, once it is on one. */
  floor: string | null;
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
 * Every device the building has, and where it is.
 *
 * Where it is comes from `placeOf` and `placedOn` — the same two the
 * plan's own device panel uses — so the Devices tab and the floor plan
 * cannot tell different stories about the same box. They used to: this
 * read the host room itself and only for answering units, which left
 * every reader showing an em dash in the tab while the plan drew it on
 * a door with a name and a storey.
 *
 * An answering unit is the flat's, so it is placed from the day the flat
 * exists. A reader or an intercom is on a door, and until the building
 * has been drawn there are no doors to put one on — so before the plan
 * it is genuinely unplaced, and placing it is one of the things the
 * floor plan is for.
 */
export function buildingDevices(
  layer: VisualLayer,
  hasPlan = false,
): BuildingDevice[] {
  return layer.file.devices
    .map((device) => {
      // The fixture is the drawn building, so the doors exist in it
      // whether or not the customer has drawn them yet. Which question
      // is being asked has to be said, and this is where it is said:
      // before the plan, a device on a door has nowhere to be.
      const placed = hasPlan || device.host_kind !== "door";
      return {
        id: device.id,
        name: device.name,
        type: productName(device.device_type),
        placement: placed ? placeOf(layer, device) : null,
        floor: placed ? placedOn(layer, device) : null,
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

/** A storey and the spaces on it, for the tree once a plan exists. */
export interface BuildingStorey {
  id: string;
  name: string;
  spaces: BuildingSpace[];
}

/**
 * The same spaces, now grouped by the storey they turned out to be on.
 *
 * Before the plan this list is flat, because which floor a flat is on
 * is exactly what nobody knows yet. Drawing the plan answers that, and
 * the tree stops being flat — the one visible difference the plan makes
 * to a screen that is otherwise about the customer's own data.
 */
export function spacesByFloor(layer: VisualLayer): BuildingStorey[] {
  const spaces = buildingSpaces(layer);
  const floorOf = new Map<string, string>();
  for (const group of layer.file.groups) floorOf.set(group.id, group.floor_id);

  return layer.floors.map((floor) => ({
    id: floor.id,
    name: floor.name,
    spaces: spaces.filter((s) => floorOf.get(s.id) === floor.id),
  }));
}
