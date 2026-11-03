/**
 * The operations behind the structure tree's row menus.
 *
 * Small things a manager does to one row: rename it, fold its rooms away,
 * put it in a category, take it out of its envelope, dissolve the envelope.
 * None of them touch geometry — that is what the wall tools are for — which
 * is why they live apart from divide and merge.
 */
import { commit, OperationRejected, setRoomSurfaced, type EditState } from "./edit";
import { must, type VisualLayer } from "./load";
import { roomsInGroup } from "./access";
import { doorsOfRoom } from "./derive";
import type { Group, Room, VisualLayerFile } from "./types";

function trimmed(name: string): string {
  const out = name.trim();
  if (out.length === 0) {
    throw new OperationRejected("A name cannot be blank.");
  }
  return out;
}

export function renameRoom(
  state: EditState,
  roomId: string,
  name: string,
): EditState {
  const { layer, file } = state;
  const room = must(layer.rooms, roomId, "room");
  const next = trimmed(name);
  if (room.name === next) return state;

  return commit(state, "rename", "Rename", {
    ...file,
    rooms: file.rooms.map((r) => (r.id === roomId ? { ...r, name: next } : r)),
  });
}

export function renameGroup(
  state: EditState,
  groupId: string,
  name: string,
): EditState {
  const { layer, file } = state;
  const group = must(layer.groups, groupId, "group");
  const next = trimmed(name);
  if (group.name === next) return state;

  return commit(state, "rename", "Rename", {
    ...file,
    groups: file.groups.map((g) =>
      g.id === groupId ? { ...g, name: next } : g,
    ),
  });
}

/**
 * Put a whole envelope in a category.
 *
 * Its rooms mostly carry no category of their own and inherit this one, so
 * setting it here is how a flat becomes a flat. A room that overrides it
 * keeps its own — the override is the point of having one.
 */
export function setGroupSpaceType(
  state: EditState,
  groupId: string,
  typeId: string | null,
): EditState {
  const { layer, file } = state;
  const group = must(layer.groups, groupId, "group");
  if (typeId !== null && !layer.spaceTypes.has(typeId)) {
    throw new OperationRejected(`There is no "${typeId}" category.`);
  }
  if (group.space_type === typeId) return state;

  return commit(state, "set_space_type", "Change category", {
    ...file,
    groups: file.groups.map((g) =>
      g.id === groupId ? { ...g, space_type: typeId } : g,
    ),
  });
}

/** Whether this room could be folded away, and why not if it could not. */
export function hideRoomRefusal(
  layer: VisualLayer,
  room: Room,
): string | null {
  if ((layer.devicesInRoom.get(room.id) ?? []).length > 0) {
    return `${room.name} holds a device.`;
  }
  for (const door of doorsOfRoom(layer, room)) {
    const onDoor = layer.devicesOnDoor.get(door.id) ?? [];
    if (onDoor.length > 0) return `${onDoor[0].name} is on ${room.name}'s door.`;
  }
  return null;
}

export interface GroupSurfaceResult {
  state: EditState;
  /** Rooms that had to stay on the map, and why. */
  kept: string[];
}

/**
 * Fold a whole envelope's rooms away, or bring them all back.
 *
 * Hiding is per room and a room carrying hardware refuses, so this is not
 * all-or-nothing: a flat's living room holds the entrance reader and will
 * not go, while its bedrooms will. Refusing the lot because of one would
 * make the menu item useless on every flat in the building, so it hides
 * what it can and reports what it could not.
 */
export function setGroupRoomsSurfaced(
  state: EditState,
  groupId: string,
  surfaced: boolean,
): GroupSurfaceResult {
  const { layer, file } = state;
  const group = must(layer.groups, groupId, "group");
  const rooms = roomsInGroup(layer, groupId);

  const kept: string[] = [];
  const changing: string[] = [];
  for (const room of rooms) {
    if (room.surfaced === surfaced) continue;
    if (!surfaced) {
      const why = hideRoomRefusal(layer, room);
      if (why) {
        kept.push(why);
        continue;
      }
    }
    changing.push(room.id);
  }

  if (changing.length === 0) {
    throw new OperationRejected(
      kept.length > 0
        ? `Nothing in ${group.name} can be hidden. ${kept[0]}`
        : `${group.name} is already ${surfaced ? "shown" : "hidden"}.`,
    );
  }

  const moving = new Set(changing);
  const next = commit(
    state,
    surfaced ? "show_room" : "hide_room",
    surfaced ? "Show rooms" : "Hide rooms",
    {
      ...file,
      rooms: file.rooms.map((r) =>
        moving.has(r.id) ? { ...r, surfaced } : r,
      ),
    },
  );
  return { state: next, kept };
}

/**
 * Take a room out of its envelope.
 *
 * It keeps its geometry and its own category; it just stops being part of
 * the flat. An envelope left holding nothing goes with it, the same as after
 * a merge — an empty envelope is a row that names nothing.
 */
export function detachRoom(state: EditState, roomId: string): EditState {
  const { layer, file } = state;
  const room = must(layer.rooms, roomId, "room");
  if (!room.group_id) {
    throw new OperationRejected(`${room.name} is not in an envelope.`);
  }

  const rooms = file.rooms.map((r) =>
    r.id === roomId ? { ...r, group_id: null } : r,
  );
  const used = new Set(rooms.map((r) => r.group_id).filter(Boolean));
  const hasChild = new Set(
    file.groups.map((g) => g.parent_group_id).filter(Boolean),
  );

  return commit(state, "regroup", "Detach from group", {
    ...file,
    rooms,
    groups: file.groups.filter((g) => used.has(g.id) || hasChild.has(g.id)),
  });
}

/**
 * Dissolve an envelope. Its rooms stay exactly where they are and move up to
 * whatever contained it, which for a top-level envelope is nothing.
 *
 * Deleting an envelope cannot mean deleting the spaces inside it. They are
 * drawn on the plan, and the floor is tiled — a space that vanished would
 * leave a region belonging to nobody. Giving a space away is what removing a
 * wall does.
 */
export function dissolveGroup(state: EditState, groupId: string): EditState {
  const { layer, file } = state;
  const group = must(layer.groups, groupId, "group");
  const parent = group.parent_group_id;

  const rooms = file.rooms.map((r) =>
    r.group_id === groupId ? { ...r, group_id: parent } : r,
  );
  const groups = file.groups
    .filter((g) => g.id !== groupId)
    .map((g) => (g.parent_group_id === groupId ? { ...g, parent_group_id: parent } : g));

  const next: VisualLayerFile = { ...file, rooms, groups };
  return commit(state, "regroup", `Delete ${group.name}`, next);
}

/** The envelopes a room could be moved into on its floor, for a submenu. */
export function envelopesOnFloor(layer: VisualLayer, floorId: string): Group[] {
  return layer.file.groups.filter((g) => g.floor_id === floorId);
}

export { setRoomSurfaced };
