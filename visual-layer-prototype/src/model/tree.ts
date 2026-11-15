/**
 * The navigation tree: what is listed under what, in which order, and
 * what may be dragged where.
 *
 * Containment is derived, as it always was — a room is under the group
 * its `group_id` names, a group under its parent. Two things are not
 * derivable and are stored:
 *
 * - The order a person put the rows in. `tree_order` holds, per parent,
 *   the ids of its children in the order they were dragged into. Ids it
 *   does not mention come after, in the order they would have had anyway,
 *   so a parent nobody has reordered needs no entry and a child added
 *   later does not need the list rewritten.
 *
 * - Where a space with no shape is listed. A room's place in the tree is
 *   its place in the building, but a space unassigned from the map has
 *   no walls to say which flat it is in, so it carries a `group_id` of
 *   its own. That is what lets it stay where it was when it comes off
 *   the plan, and what lets it be dragged to another floor.
 *
 * A row is one of three things: an envelope, a room, or a space with no
 * shape. An envelope that is just its one room — a stairwell, the
 * technical room — is listed as that room, standing in for it.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { topGroups, type VisualLayer } from "./load";
import {
  floorEnvelopes,
  groupAccessType,
  isRoomListed,
  passThroughRoom,
} from "./derive";
import type { Group, Room, UnplacedSpace, VisualLayerFile } from "./types";

export type TreeNode =
  /** `id` is what `tree_order` knows the row by. */
  | { kind: "group"; id: string; group: Group }
  /** `envelope` is the group this room stands in for, if it does. */
  | { kind: "room"; id: string; room: Room; envelope: Group | null }
  | { kind: "space"; id: string; space: UnplacedSpace };

/** A row, named the way a drag names it. */
export interface TreeRef {
  kind: "group" | "room" | "space";
  id: string;
}

/** A place in the tree: under a floor, or under a group on it. */
export interface TreePlace {
  floorId: string;
  /** Null for the floor itself. */
  groupId: string | null;
}

/** Where a drag lets go: a place, and the row it lands in front of. */
export interface TreeDrop extends TreePlace {
  /** A row's order id, or null for the end. */
  beforeId: string | null;
}

/**
 * The top-level groups that only hold the floor together — no rooms of
 * their own, everything else inside them. The tree does not list them,
 * so "directly under the floor" means "inside one of these".
 */
function floorContainers(layer: VisualLayer, floorId: string): Group[] {
  return topGroups(layer, floorId).filter(
    (g) => !layer.file.rooms.some((r) => r.group_id === g.id),
  );
}

/** A group id as the tree means it: null where the tree shows the floor. */
function listedGroup(
  layer: VisualLayer,
  floorId: string | null,
  groupId: string | null | undefined,
): string | null {
  if (!groupId || floorId === null) return null;
  const group = layer.groups.get(groupId);
  // A group that has gone, or is on another floor, is no place to be
  // listed: the space falls back to the floor rather than vanishing.
  if (!group || group.floor_id !== floorId) return null;
  if (floorContainers(layer, floorId).some((g) => g.id === groupId)) return null;
  return groupId;
}

/** The spaces with no shape that are listed at this place. */
function spacesAt(layer: VisualLayer, place: TreePlace): UnplacedSpace[] {
  return (layer.file.unplaced_spaces ?? []).filter(
    (s) =>
      s.floor_id === place.floorId &&
      listedGroup(layer, s.floor_id, s.group_id) === place.groupId,
  );
}

/** Spaces with no shape and no floor either: imported with the column blank. */
export function floorlessSpaces(layer: VisualLayer): UnplacedSpace[] {
  const floors = new Set(layer.floors.map((f) => f.id));
  return (layer.file.unplaced_spaces ?? []).filter(
    (s) => s.floor_id === null || !floors.has(s.floor_id),
  );
}

/**
 * The room an envelope is listed as, when it is listed as one.
 *
 * Not while a space with no shape is listed inside it: then the
 * envelope has two things in it to show, and has to be a row of its own.
 */
function standsFor(layer: VisualLayer, group: Group): Room | null {
  const only = passThroughRoom(layer, group);
  if (!only || !isRoomListed(layer, only)) return null;
  if (spacesAt(layer, { floorId: group.floor_id, groupId: group.id }).length > 0) {
    return null;
  }
  return only;
}

/** The rows under a floor or a group, in the order they are listed. */
export function treeChildren(layer: VisualLayer, place: TreePlace): TreeNode[] {
  const { floorId, groupId } = place;
  const groups =
    groupId === null
      ? floorEnvelopes(layer, floorId)
      : (layer.childGroups.get(groupId) ?? []);
  const rooms =
    groupId === null
      ? (layer.roomsByFloor.get(floorId) ?? []).filter(
          (r) => r.group_id === null && isRoomListed(layer, r),
        )
      : layer.file.rooms.filter(
          (r) => r.group_id === groupId && isRoomListed(layer, r),
        );

  const nodes: TreeNode[] = [
    ...groups.map((group): TreeNode => {
      const only = standsFor(layer, group);
      return only
        ? { kind: "room", id: group.id, room: only, envelope: group }
        : { kind: "group", id: group.id, group };
    }),
    ...rooms.map((room): TreeNode => ({ kind: "room", id: room.id, room, envelope: null })),
    ...spacesAt(layer, place).map((space): TreeNode => ({ kind: "space", id: space.id, space })),
  ];

  const order = layer.file.tree_order?.[groupId ?? floorId];
  if (!order || order.length === 0) return nodes;
  const rank = new Map(order.map((id, i) => [id, i]));
  // Rows the order names come first, as it names them; the rest keep
  // the order they had, after. Array.sort is stable, which is the "keep".
  return [...nodes].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
}

/** Where a row is listed, or null if it is not a row. */
export function treePlaceOf(layer: VisualLayer, ref: TreeRef): TreePlace | null {
  if (ref.kind === "group") {
    const group = layer.groups.get(ref.id);
    if (!group) return null;
    return {
      floorId: group.floor_id,
      groupId: listedGroup(layer, group.floor_id, group.parent_group_id),
    };
  }
  if (ref.kind === "room") {
    const room = layer.rooms.get(ref.id);
    if (!room) return null;
    const group = room.group_id ? layer.groups.get(room.group_id) : undefined;
    if (!group) return { floorId: room.floor_id, groupId: null };
    // Standing in for its envelope, it is listed where the envelope is.
    if (standsFor(layer, group)?.id === room.id) {
      return {
        floorId: room.floor_id,
        groupId: listedGroup(layer, group.floor_id, group.parent_group_id),
      };
    }
    return { floorId: room.floor_id, groupId: listedGroup(layer, room.floor_id, group.id) };
  }
  const space = (layer.file.unplaced_spaces ?? []).find((s) => s.id === ref.id);
  if (!space || space.floor_id === null) return null;
  return {
    floorId: space.floor_id,
    groupId: listedGroup(layer, space.floor_id, space.group_id),
  };
}

/** The id `tree_order` knows a row by. */
export function treeOrderId(layer: VisualLayer, ref: TreeRef): string {
  if (ref.kind !== "room") return ref.id;
  const room = layer.rooms.get(ref.id);
  const group = room?.group_id ? layer.groups.get(room.group_id) : undefined;
  return group && standsFor(layer, group)?.id === ref.id ? group.id : ref.id;
}

/**
 * The stored order with one row's place handed to another: what was
 * listed as `oldId` is listed as `newId`, in the same position.
 *
 * Unassigning a space is this — the named space takes the row the room
 * had — and so is placing it again.
 */
export function orderWithSwap(
  layer: VisualLayer,
  place: TreePlace,
  oldId: string,
  newId: string,
): Record<string, string[]> {
  const ids = treeChildren(layer, place)
    .map((n) => n.id)
    .filter((id) => id !== newId)
    .map((id) => (id === oldId ? newId : id));
  return { ...(layer.file.tree_order ?? {}), [place.groupId ?? place.floorId]: ids };
}

function isInside(layer: VisualLayer, group: Group, ancestorId: string): boolean {
  let at: Group | undefined = group;
  const seen = new Set<string>();
  while (at && !seen.has(at.id)) {
    if (at.id === ancestorId) return true;
    seen.add(at.id);
    at = at.parent_group_id ? layer.groups.get(at.parent_group_id) : undefined;
  }
  return false;
}

const floorName = (layer: VisualLayer, id: string) =>
  layer.floors.find((f) => f.id === id)?.name ?? id;

/**
 * Why a row cannot be dropped there, or null if it can.
 *
 * Two rules, and both are about what the plan already says. Anything
 * drawn stays on the floor it is drawn on — its walls are there, and
 * the tree cannot move walls — so only a space with no shape changes
 * floor. And an apartment holds rooms: not groups, not other apartments.
 */
export function treeMoveRefusal(
  layer: VisualLayer,
  moving: TreeRef,
  to: TreePlace,
): string | null {
  if (!layer.floors.some((f) => f.id === to.floorId)) return "There is no such floor.";
  const target = to.groupId ? layer.groups.get(to.groupId) : undefined;
  if (to.groupId && (!target || target.floor_id !== to.floorId)) {
    return "That group is not on this floor.";
  }
  const intoApartment =
    target !== undefined && groupAccessType(layer, target) === "apartment";
  const drawnElsewhere = (name: string, on: string) =>
    `${name} is drawn on ${floorName(layer, on)}. Unassign it from the map to move it to another floor.`;

  if (moving.kind === "room") {
    const room = layer.rooms.get(moving.id);
    if (!room) return "That space is not in the building.";
    if (room.floor_id !== to.floorId) return drawnElsewhere(room.name, room.floor_id);
    return null;
  }

  if (moving.kind === "group") {
    const group = layer.groups.get(moving.id);
    if (!group) return "That group is not in the building.";
    if (group.floor_id !== to.floorId) return drawnElsewhere(group.name, group.floor_id);
    if (target && isInside(layer, target, group.id)) {
      return `${group.name} cannot go inside itself.`;
    }
    if (intoApartment) {
      return `${target!.name} is an apartment, and an apartment holds rooms only.`;
    }
    return null;
  }

  const space = (layer.file.unplaced_spaces ?? []).find((s) => s.id === moving.id);
  if (!space) return "That space is not in the building.";
  if (intoApartment && space.kind === "apartment") {
    return `${target!.name} is an apartment, and an apartment holds rooms only.`;
  }
  return null;
}

/**
 * An envelope emptied by a move is a row that names nothing, and goes —
 * the same rule every other regrouping follows. A space with no shape
 * that was listed inside it moves up to wherever the envelope was.
 */
function withoutEmptied(file: VisualLayerFile): VisualLayerFile {
  const used = new Set(file.rooms.map((r) => r.group_id).filter(Boolean));
  const hasChild = new Set(file.groups.map((g) => g.parent_group_id).filter(Boolean));
  const gone = new Map(
    file.groups
      .filter((g) => !used.has(g.id) && !hasChild.has(g.id))
      .map((g) => [g.id, g]),
  );
  if (gone.size === 0) return file;
  return {
    ...file,
    groups: file.groups.filter((g) => !gone.has(g.id)),
    unplaced_spaces: file.unplaced_spaces?.map((s) =>
      s.group_id && gone.has(s.group_id)
        ? { ...s, group_id: gone.get(s.group_id)!.parent_group_id }
        : s,
    ),
  };
}

/**
 * Drag a row somewhere else in the tree: to another position among its
 * siblings, into a group, out to the floor, or — for a space with no
 * shape — onto another floor.
 */
export function moveInTree(
  state: EditState,
  moving: TreeRef,
  to: TreeDrop,
): EditState {
  const { layer, file } = state;
  const why = treeMoveRefusal(layer, moving, to);
  if (why) throw new OperationRejected(why);

  const from = treePlaceOf(layer, moving);
  const stays = from !== null && from.floorId === to.floorId && from.groupId === to.groupId;
  const oldId = treeOrderId(layer, moving);
  // Dropped in front of itself: it is already there.
  if (stays && to.beforeId === oldId) return state;

  let next: VisualLayerFile = file;
  // A room that stood in for its envelope leaves the envelope behind,
  // and is known by its own id from then on.
  let newId = oldId;
  let name = moving.id;

  if (moving.kind === "room") {
    const room = layer.rooms.get(moving.id)!;
    name = room.name;
    if (!stays) {
      const target = to.groupId ? layer.groups.get(to.groupId) : undefined;
      const intoApartment =
        target !== undefined && groupAccessType(layer, target) === "apartment";
      newId = room.id;
      next = {
        ...file,
        rooms: file.rooms.map((r) =>
          r.id === room.id
            ? {
                ...r,
                group_id: to.groupId,
                // A room of an apartment is the apartment's: it takes the
                // flat's category rather than bringing its own into it.
                space_type: intoApartment ? null : r.space_type,
              }
            : r,
        ),
      };
    }
  } else if (moving.kind === "group") {
    const group = layer.groups.get(moving.id)!;
    name = group.name;
    if (!stays) {
      const container = floorContainers(layer, to.floorId)[0]?.id ?? null;
      next = {
        ...file,
        groups: file.groups.map((g) =>
          g.id === group.id ? { ...g, parent_group_id: to.groupId ?? container } : g,
        ),
      };
    }
  } else {
    const space = (file.unplaced_spaces ?? []).find((s) => s.id === moving.id)!;
    name = space.name;
    if (!stays) {
      next = {
        ...file,
        unplaced_spaces: (file.unplaced_spaces ?? []).map((s) =>
          s.id === space.id ? { ...s, floor_id: to.floorId, group_id: to.groupId } : s,
        ),
      };
    }
  }

  const before = treeChildren(layer, to).map((n) => n.id);
  const ids = before.filter((id) => id !== oldId && id !== newId);
  const at = to.beforeId === null ? -1 : ids.indexOf(to.beforeId);
  if (at < 0) ids.push(newId);
  else ids.splice(at, 0, newId);

  // Dropped where it already was: nothing to undo, so nothing is done.
  if (stays && ids.length === before.length && ids.every((id, i) => id === before[i])) {
    return state;
  }

  next = withoutEmptied({
    ...next,
    tree_order: { ...(file.tree_order ?? {}), [to.groupId ?? to.floorId]: ids },
  });

  return commit(state, "move_in_tree", stays ? `Reorder ${name}` : `Move ${name}`, next);
}
