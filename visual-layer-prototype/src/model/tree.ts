/**
 * The navigation tree: what is listed under what, in which order, and
 * what may be dragged where.
 *
 * The tree lists what is drawn. Containment is derived, as it always
 * was — a room is under the group its `group_id` names, a group under
 * its parent — and a space that has no shape on the plan is not in it
 * at all: unassigned from the map, it is the anonymous room left
 * behind that the tree lists, under its floor, and the named space
 * waits in the categories drawer.
 *
 * One thing is not derivable and is stored: the order a person put the
 * rows in. `tree_order` holds, per parent, the ids of its children in
 * the order they were dragged into. Ids it does not mention come after,
 * in the order they would have had anyway, so a parent nobody has
 * reordered needs no entry and a child added later does not need the
 * list rewritten.
 *
 * A row is an envelope or a room. An envelope that is just its one
 * room — a stairwell, the technical room — is listed as that room,
 * standing in for it.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { topGroups, type VisualLayer } from "./load";
import {
  floorEnvelopes,
  groupAccessType,
  isRoomListed,
  passThroughRoom,
} from "./derive";
import { liveGroups } from "./groups";
import type { Group, Room, VisualLayerFile } from "./types";

export type TreeNode =
  /** `id` is what `tree_order` knows the row by. */
  | { kind: "group"; id: string; group: Group }
  /** `envelope` is the group this room stands in for, if it does. */
  | { kind: "room"; id: string; room: Room; envelope: Group | null };

/** A row, named the way a drag names it. */
export interface TreeRef {
  kind: "group" | "room";
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
  floorId: string,
  groupId: string | null,
): string | null {
  if (!groupId) return null;
  if (floorContainers(layer, floorId).some((g) => g.id === groupId)) return null;
  return groupId;
}

/** The room an envelope is listed as, when it is listed as one. */
function standsFor(layer: VisualLayer, group: Group): Room | null {
  const only = passThroughRoom(layer, group);
  return only && isRoomListed(layer, only) ? only : null;
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

/** The id `tree_order` knows a row by. */
export function treeOrderId(layer: VisualLayer, ref: TreeRef): string {
  if (ref.kind !== "room") return ref.id;
  const room = layer.rooms.get(ref.id);
  const group = room?.group_id ? layer.groups.get(room.group_id) : undefined;
  return group && standsFor(layer, group)?.id === ref.id ? group.id : ref.id;
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
 * Two rules, and both are about what the plan already says. Everything
 * in the tree is drawn, and what is drawn stays on the floor it is
 * drawn on — its walls are there, and the tree cannot move walls. And
 * an apartment holds rooms: not groups, not other apartments.
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
  const drawnElsewhere = (name: string, on: string) =>
    `${name} is drawn on ${floorName(layer, on)}, and what is drawn stays on its floor.`;

  if (moving.kind === "room") {
    const room = layer.rooms.get(moving.id);
    if (!room) return "That space is not in the building.";
    if (room.floor_id !== to.floorId) return drawnElsewhere(room.name, room.floor_id);
    return null;
  }

  const group = layer.groups.get(moving.id);
  if (!group) return "That group is not in the building.";
  if (group.floor_id !== to.floorId) return drawnElsewhere(group.name, group.floor_id);
  if (target && isInside(layer, target, group.id)) {
    return `${group.name} cannot go inside itself.`;
  }
  if (target && groupAccessType(layer, target) === "apartment") {
    return `${target.name} is an apartment, and an apartment holds rooms only.`;
  }
  return null;
}

/**
 * Drag a row somewhere else in the tree: to another position among its
 * siblings, into a group, or out to the floor.
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
  } else {
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

  return commit(state, "move_in_tree", stays ? `Reorder ${name}` : `Move ${name}`, {
    ...next,
    // An envelope emptied by a move is a row that names nothing, and
    // goes — the same rule every other regrouping follows.
    groups: liveGroups(next.groups, next.rooms, next.unplaced_spaces),
    tree_order: { ...(file.tree_order ?? {}), [to.groupId ?? to.floorId]: ids },
  });
}
