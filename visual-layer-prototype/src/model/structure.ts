/**
 * The operations behind the structure tree's row menus.
 *
 * Small things a manager does to one row: rename it, fold its rooms away,
 * put it in a category, take it out of its envelope, dissolve the envelope.
 * None of them touch geometry — that is what the wall tools are for — which
 * is why they live apart from divide and merge.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { must, type VisualLayer } from "./load";
import { accessType, roomsInGroup } from "./access";
import { doorsOfRoom } from "./derive";
import type { Group, Room, UnplacedSpace, VisualLayerFile } from "./types";

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

/**
 * The next free "Unnamed N".
 *
 * Numbered across the building rather than per floor: the number is there
 * to tell two anonymous spaces apart, and two called "Unnamed 3" on
 * different storeys would defeat that the moment anyone searched.
 */
export function unnamedRoomName(layer: VisualLayer): string {
  const taken = new Set(layer.file.rooms.map((r) => r.name));
  for (let n = 1; ; n += 1) {
    const name = `Unnamed ${n}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Strip a space's identity: it stops being a named room of a known kind and
 * becomes an anonymous area.
 *
 * The geometry cannot go. The floor is tiled, so the area has to belong to
 * something — giving it away is what removing a wall does. What can go is
 * everything that says what it *is*: its name, its category, and its place
 * in an envelope. With no category of its own and no envelope to inherit
 * one from, it resolves to Unknown, which is the bucket the drawer keeps
 * open for exactly this.
 */
function anonymise(
  state: EditState,
  roomId: string,
  surfaced: boolean,
  kind: "delete_room" | "unassign_room",
  label: string,
): EditState {
  const { layer, file } = state;
  must(layer.rooms, roomId, "room"); // refuse an id that is not a room
  const name = unnamedRoomName(layer);

  const rooms = file.rooms.map((r) =>
    r.id === roomId
      ? { ...r, name, space_type: null, group_id: null, surfaced }
      : r,
  );
  // The envelope it leaves may now hold nothing, and an empty envelope is a
  // row that names nothing.
  const used = new Set(rooms.map((r) => r.group_id).filter(Boolean));
  const hasChild = new Set(
    file.groups.map((g) => g.parent_group_id).filter(Boolean),
  );

  return commit(state, kind, label, {
    ...file,
    rooms,
    groups: file.groups.filter((g) => used.has(g.id) || hasChild.has(g.id)),
  });
}

/**
 * Delete a space: out of the structure and off the map.
 *
 * It keeps its shape, because something has to own the floor, but it is
 * listed nowhere and drawn as nothing in particular — `surfaced` false is
 * what takes a space out of the tree and off the map as a space in its own
 * right. Undo brings all of it back, which is the other reason the record
 * survives.
 */
export function deleteRoom(state: EditState, roomId: string): EditState {
  return anonymise(state, roomId, false, "delete_room", "Delete space");
}

/**
 * Unassign a space from the map: it stops being a known room, but stays in
 * the tree as an anonymous space on its floor, waiting to be named.
 *
 * The difference from delete is only whether it is still listed. Both leave
 * the same thing on the plan.
 */
/** Ids keep their floor prefix, so a new room still says where it lives. */
function freeRoomId(taken: Set<string>, floor: string): string {
  for (let n = 1; ; n += 1) {
    const id = `${floor}:r${n}`;
    if (!taken.has(id)) return id;
  }
}

function freeSpaceId(taken: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const id = `space:${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Unassign a space from the map: separate what it *is* from where it *is*.
 *
 * Two things come out of one. The shape stays on the plan as a new space
 * that nobody has identified yet — Unnamed, Unknown, exactly the area the
 * old one covered. The identity leaves the plan and waits in the types
 * panel under the category it had, still named, still that kind of space,
 * now labelled unplaced.
 *
 * That is the honest reading of "this room is not what the plan says it
 * is": the drawing was right about there being a space there and wrong
 * about which one, so neither half should be thrown away.
 *
 * Devices divide the same way. An answering unit is the flat's and comes
 * away with it; a reader is on a door, the door is part of the shape, and
 * the shape has not moved — so it stays where it is, now checking entry
 * into the space that is still there.
 */
export function unassignRoom(state: EditState, roomId: string): EditState {
  const { layer, file } = state;
  const room = must(layer.rooms, roomId, "room");
  const floor = room.floor_id.split(":")[0];

  const shape: Room = {
    id: freeRoomId(new Set(file.rooms.map((r) => r.id)), floor),
    name: unnamedRoomName(layer),
    walls: [...room.walls],
    // Unknown: no category of its own and no envelope to inherit one from.
    group_id: null,
    space_type: null,
    floor_id: room.floor_id,
    surfaced: true,
    note: null,
  };

  const carried = (layer.devicesInRoom.get(roomId) ?? []).map((d) => d.id);
  const space: UnplacedSpace = {
    id: freeSpaceId(new Set((file.unplaced_spaces ?? []).map((x) => x.id))),
    name: room.name,
    floor_id: room.floor_id,
    // What it read as, not what it stored: a bedroom inheriting "apartment"
    // is an apartment space, and that is the category it waits under.
    space_type: accessType(layer, room),
    note: room.note ?? null,
    devices: carried,
  };

  const swap = (id: string) => (id === roomId ? shape.id : id);

  const rooms = file.rooms.filter((r) => r.id !== roomId).concat(shape);
  const used = new Set(rooms.map((r) => r.group_id).filter(Boolean));
  const hasChild = new Set(
    file.groups.map((g) => g.parent_group_id).filter(Boolean),
  );

  return commit(state, "unassign_room", "Unassign from map", {
    ...file,
    rooms,
    walls: file.walls.map((w) => ({
      ...w,
      room_a: swap(w.room_a),
      room_b: swap(w.room_b),
    })),
    doors: file.doors.map((d) =>
      d.rooms ? { ...d, rooms: [swap(d.rooms[0]), swap(d.rooms[1])] as [string, string] } : d,
    ),
    devices: file.devices.map((d) => {
      // Inside it: away with the space, to come back when it is placed.
      if (d.host_kind === "room" && d.host_id === roomId) {
        return { ...d, host_id: null };
      }
      // On its door: the door has not moved, so neither has the check —
      // it now verifies entry into whatever is there now.
      if (d.guards.includes(roomId)) {
        return { ...d, guards: d.guards.map(swap) };
      }
      return d;
    }),
    groups: file.groups.filter((g) => used.has(g.id) || hasChild.has(g.id)),
    unplaced_spaces: [...(file.unplaced_spaces ?? []), space],
  });
}

/** The envelopes a room could be moved into on its floor, for a submenu. */
export function envelopesOnFloor(layer: VisualLayer, floorId: string): Group[] {
  return layer.file.groups.filter((g) => g.floor_id === floorId);
}


/**
 * Move every space of one category into another, or out of all of them.
 *
 * The types panel owns the category, so emptying one is its business rather
 * than something to do space by space — a category with thirty rooms in it
 * would otherwise take thirty trips through the tree.
 */
export function reassignSpaceType(
  state: EditState,
  fromId: string,
  toId: string | null,
): EditState {
  const { layer, file } = state;
  if (!layer.spaceTypes.has(fromId)) {
    throw new OperationRejected(`There is no "${fromId}" category.`);
  }
  if (toId !== null && !layer.spaceTypes.has(toId)) {
    throw new OperationRejected(`There is no "${toId}" category.`);
  }
  if (toId === fromId) return state;

  return commit(state, "set_space_type", "Reassign all", {
    ...file,
    rooms: file.rooms.map((r) =>
      r.space_type === fromId ? { ...r, space_type: toId } : r,
    ),
    groups: file.groups.map((g) =>
      g.space_type === fromId ? { ...g, space_type: toId } : g,
    ),
  });
}

/**
 * Delete a category. Whatever was in it falls back to inheriting, and where
 * there is nothing to inherit from it reads as Unknown — the bucket the
 * panel keeps open for exactly that.
 */
export function deleteSpaceType(
  state: EditState,
  typeId: string,
): EditState {
  const { layer, file } = state;
  const type = must(layer.spaceTypes, typeId, "space type");

  return commit(state, "delete_space_type", `Delete ${type.name}`, {
    ...file,
    space_types: file.space_types.filter((t) => t.id !== typeId),
    rooms: file.rooms.map((r) =>
      r.space_type === typeId ? { ...r, space_type: null } : r,
    ),
    groups: file.groups.map((g) =>
      g.space_type === typeId ? { ...g, space_type: null } : g,
    ),
  });
}

/** How many spaces a category holds, for "this will affect N spaces". */
export function spacesInCategory(
  layer: VisualLayer,
  typeId: string,
): { rooms: number; groups: number } {
  return {
    rooms: layer.file.rooms.filter((r) => r.space_type === typeId).length,
    groups: layer.file.groups.filter((g) => g.space_type === typeId).length,
  };
}
