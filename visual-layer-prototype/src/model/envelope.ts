/**
 * New envelopes and new storeys — what the tree's "New space" makes.
 *
 * An envelope is made out of things that already exist: you point at
 * spaces and say "these are one flat", or "these go together". So the
 * operation is a regrouping with rules about what may be grouped, and
 * the rules are the whole of it:
 *
 * - everything picked is on one floor, because an envelope is a thing
 *   on a floor;
 * - an apartment is made of rooms and nothing else, because a flat
 *   does not contain other flats;
 * - a group may hold rooms, flats and other groups.
 *
 * And then the category. A new apartment is an apartment, and whatever
 * its rooms were before, they are rooms of a flat now — so they stop
 * carrying a category of their own and read the flat's. A new group
 * reads the category its members agree on; if they do not agree there
 * is nothing to read, and both the group and its members go to Unknown
 * rather than the group pretending to be one thing while holding
 * another. That is the design's rule, and it is the honest one: a
 * group of a gym and a shop is not a gym.
 *
 * A storey is different. It is made out of nothing — a page somebody
 * dropped in — so adding one adds a floor record and the envelope that
 * stands for the whole floor, and the plan for it is drawn later.
 */
import { accessType } from "./access";
import { groupAccessType } from "./derive";
import { commit, OperationRejected, type EditState } from "./edit";
import type { VisualLayer } from "./load";
import type { Floor, Group, Room } from "./types";

export type NewEnvelopeKind = "apartment" | "group";

export interface NewEnvelope {
  kind: NewEnvelopeKind;
  name: string;
  /** Room ids and, for a group, envelope ids. */
  members: string[];
}

/** Which of the two a picked id is, or why it is neither. */
function memberOf(
  layer: VisualLayer,
  id: string,
): { room: Room } | { group: Group } {
  const room = layer.rooms.get(id);
  if (room) return { room };
  const group = layer.groups.get(id);
  if (group) {
    if (group.parent_group_id === null) {
      throw new OperationRejected(
        `${group.name} is a whole floor, and a floor cannot go inside anything.`,
      );
    }
    return { group };
  }
  throw new OperationRejected(`There is no space "${id}".`);
}

function floorOf(m: { room: Room } | { group: Group }): string {
  return "room" in m ? m.room.floor_id : m.group.floor_id;
}

function parentOf(m: { room: Room } | { group: Group }): string | null {
  return "room" in m ? m.room.group_id : m.group.parent_group_id;
}

function nameOf(m: { room: Room } | { group: Group }): string {
  return "room" in m ? m.room.name : m.group.name;
}

/** The envelope that stands for the whole floor. */
function floorGroup(layer: VisualLayer, floorId: string): Group {
  const g = layer.file.groups.find(
    (x) => x.floor_id === floorId && x.parent_group_id === null,
  );
  if (!g) throw new OperationRejected(`Floor ${floorId} has no envelope.`);
  return g;
}

/** Whether `id` sits anywhere inside envelope `groupId`. */
function isInside(layer: VisualLayer, id: string, groupId: string): boolean {
  let at: string | null = (() => {
    const r = layer.rooms.get(id);
    if (r) return r.group_id;
    return layer.groups.get(id)?.parent_group_id ?? null;
  })();
  const seen = new Set<string>();
  while (at && !seen.has(at)) {
    if (at === groupId) return true;
    seen.add(at);
    at = layer.groups.get(at)?.parent_group_id ?? null;
  }
  return false;
}

/**
 * The floor a set of picked spaces is on, or why there is not one.
 *
 * Exposed because the dialog asks it before Create is pressed: once
 * one thing is ticked, the other floors' boxes grey out, and this is
 * the fact they grey out on.
 */
export function membersFloor(layer: VisualLayer, members: string[]): string | null {
  const floors = new Set(members.map((id) => floorOf(memberOf(layer, id))));
  if (floors.size > 1) {
    throw new OperationRejected("Spaces must belong to the same floor.");
  }
  return floors.size === 1 ? [...floors][0] : null;
}

function freeGroupId(layer: VisualLayer, floorId: string): string {
  const prefix = floorId.split(":")[0];
  for (let n = 1; ; n += 1) {
    const id = `${prefix}:new${n}`;
    if (!layer.groups.has(id)) return id;
  }
}

export function createEnvelope(state: EditState, spec: NewEnvelope): EditState {
  const { layer, file } = state;
  const name = spec.name.trim();
  const kind = spec.kind === "apartment" ? "apartment" : "group";
  if (name === "") {
    throw new OperationRejected(`Give the ${kind} a name.`);
  }
  if (spec.members.length === 0) {
    throw new OperationRejected(
      kind === "apartment"
        ? "Select the rooms that make up the apartment."
        : "Select what goes into the group.",
    );
  }
  if (kind === "apartment" && !layer.spaceTypes.has("apartment")) {
    throw new OperationRejected("There is no Apartment category to use.");
  }

  const members = spec.members.map((id) => memberOf(layer, id));
  for (const m of members) {
    if (kind === "apartment" && "group" in m) {
      throw new OperationRejected(
        `${m.group.name} is not a room. An apartment is made of rooms.`,
      );
    }
  }
  // One thing inside another is picked twice. Moving the outer one
  // moves the inner with it, and moving the inner out as well would
  // leave the outer holding less than was pointed at.
  for (const m of members) {
    if (!("group" in m)) continue;
    for (const other of spec.members) {
      if (other !== m.group.id && isInside(layer, other, m.group.id)) {
        throw new OperationRejected(
          `${nameOf(memberOf(layer, other))} is already inside ${m.group.name}.`,
        );
      }
    }
  }

  const floorId = membersFloor(layer, spec.members)!;

  // Where the new envelope goes. A flat is a thing on a floor, so it
  // goes at the top of its floor whatever its rooms were in before. A
  // group made out of things that were all in one place stays in that
  // place — grouping two rooms of a flat makes a group inside the
  // flat, not one beside it — and otherwise it is top-level too.
  const parents = new Set(members.map(parentOf));
  const top = floorGroup(layer, floorId).id;
  const parent =
    kind === "group" && parents.size === 1 && [...parents][0] !== null
      ? ([...parents][0] as string)
      : top;

  // The category, by the rule in the header.
  const read = (m: { room: Room } | { group: Group }) =>
    "room" in m ? accessType(layer, m.room) : groupAccessType(layer, m.group);
  const seen = new Set(members.map(read));
  const agreed = seen.size === 1 ? [...seen][0] : null;
  const spaceType = kind === "apartment" ? "apartment" : agreed;
  // Members lose their own category when the envelope's is the answer
  // now: always for a flat, and for a group when they disagreed — the
  // ones that agreed still read what they read.
  const clear = kind === "apartment" || seen.size > 1;

  const siblings = file.groups.filter(
    (g) => g.floor_id === floorId && g.parent_group_id === parent,
  );
  const sortIndex = siblings.reduce((n, g) => Math.max(n, g.sort_index), 0) + 1;
  const id = freeGroupId(layer, floorId);

  const picked = new Set(spec.members);
  const made: Group = {
    id,
    name,
    space_type: spaceType,
    parent_group_id: parent,
    floor_id: floorId,
    sort_index: sortIndex,
    domain_ref: null,
    shaft_id: null,
  };

  const rooms = file.rooms.map((r) =>
    picked.has(r.id)
      ? { ...r, group_id: id, space_type: clear ? null : r.space_type }
      : r,
  );
  let groups = file.groups.map((g) =>
    picked.has(g.id)
      ? { ...g, parent_group_id: id, space_type: clear ? null : g.space_type }
      : g,
  );
  groups = [...groups, made];

  // An envelope the move emptied names nothing now, and goes — except
  // a floor's own, which stands for the floor whether or not anything
  // is drawn on it yet.
  const holdsRoom = new Set(rooms.map((r) => r.group_id));
  const holdsGroup = new Set(groups.map((g) => g.parent_group_id));
  groups = groups.filter(
    (g) =>
      g.parent_group_id === null || holdsRoom.has(g.id) || holdsGroup.has(g.id),
  );

  return commit(
    state,
    "create_envelope",
    `Create ${kind} ${name}`,
    { ...file, rooms, groups },
  );
}

// ------------------------------------------------------------- storeys

/**
 * Add storeys on top of the building.
 *
 * Each gets a floor record and the envelope that stands for the whole
 * floor, and nothing else: there is no plan for it yet. On top, because
 * the levels are counted from the ground and a building is built
 * upwards; a basement would be a different operation with a different
 * question in it.
 */
export function addStoreys(
  state: EditState,
  names: string[],
): { state: EditState; floorIds: string[] } {
  const { file } = state;
  if (names.length === 0) return { state, floorIds: [] };

  let level = file.floors.reduce((n, f) => Math.max(n, f.level), -1);
  let sort = file.floors.reduce((n, f) => Math.max(n, f.sort_index), -1);
  const taken = new Set(file.floors.map((f) => f.id));

  const floors: Floor[] = [];
  const groups: Group[] = [];
  for (const raw of names) {
    level += 1;
    sort += 1;
    let id = `${level}:floor`;
    for (let n = level; taken.has(id); n += 1) id = `${n}:floor`;
    taken.add(id);
    const prefix = id.split(":")[0];
    const name = raw.trim() || storeyLabel(level);
    floors.push({ id, name, level, sort_index: sort, transform: [0, 0, 0, 1] });
    groups.push({
      id: `${prefix}:floorgroup`,
      name: `Floor ${level}`,
      space_type: null,
      parent_group_id: null,
      floor_id: id,
      sort_index: level,
      domain_ref: null,
      shaft_id: null,
    });
  }

  const next = commit(
    state,
    "add_floor",
    floors.length === 1 ? `Add ${floors[0].name}` : `Add ${floors.length} floors`,
    { ...file, floors: [...file.floors, ...floors], groups: [...file.groups, ...groups] },
  );
  return { state: next, floorIds: floors.map((f) => f.id) };
}

/** How the fixture names a storey, so new ones read like the old. */
function storeyLabel(level: number): string {
  return level === 0 ? "ground floor" : `floor ${level}`;
}

/** For the dialog's validation, without committing anything. */
export function envelopeRefusal(
  layer: VisualLayer,
  spec: NewEnvelope,
): string | null {
  try {
    createEnvelope(
      { file: layer.file, layer, undo: [], redo: [] },
      spec,
    );
    return null;
  } catch (e) {
    if (e instanceof OperationRejected) return e.message;
    throw e;
  }
}

