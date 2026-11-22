/**
 * The operations on a storey's row in the navigation tree (Figma
 * 153:303569): rename it, duplicate it, give it a background image or
 * take one away, delete it.
 *
 * A storey is everything whose id starts with its number — its vertices,
 * walls, rooms, envelopes and the doors in its walls — plus the floor
 * record itself. That prefix is what makes duplicating and deleting a
 * storey a matter of collecting one family of ids rather than walking
 * references, and it is why a copy gets a prefix of its own.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { liveGroups } from "./groups";
import { rebuildVerticalDoors } from "./shaft";
import type { Floor, FloorBackground, PlanRect, VisualLayerFile } from "./types";

const prefixOf = (floorId: string) => `${floorId.split(":")[0]}:`;

function floorOf(file: VisualLayerFile, floorId: string): Floor {
  const floor = file.floors.find((f) => f.id === floorId);
  if (!floor) throw new OperationRejected(`No such floor: ${floorId}`);
  return floor;
}

export function renameFloor(
  state: EditState,
  floorId: string,
  name: string,
): EditState {
  const { file } = state;
  const floor = floorOf(file, floorId);
  const next = name.trim();
  if (next.length === 0) throw new OperationRejected("A name cannot be blank.");
  if (next === floor.name) return state;
  return commit(state, "rename", "Rename", {
    ...file,
    floors: file.floors.map((f) => (f.id === floorId ? { ...f, name: next } : f)),
  });
}

/**
 * A copy of a storey, put on top of the building.
 *
 * What is copied is the drawing and what the drawing was sorted into:
 * the walls, the rooms, the envelopes, the doors, their names and their
 * categories. Typical floors are the reason this exists — draw one, and
 * the four above it are the same plan.
 *
 * What is not copied is anything that is one thing in the world. A
 * device is a box on a wall, so the copy has none. An envelope's
 * `domain_ref` is one apartment in the platform, so the copy's
 * envelopes point at nothing until somebody says which they are.
 *
 * The stairs and the lift keep the `shaft_id` they had, because the
 * copy is a storey of the same building and the same shafts run through
 * it; the vertical doors are rebuilt so they do.
 */
export function duplicateFloor(
  state: EditState,
  floorId: string,
): { state: EditState; floorId: string } {
  const { file } = state;
  const floor = floorOf(file, floorId);
  const from = prefixOf(floorId);

  const level = file.floors.reduce((n, f) => Math.max(n, f.level), -1) + 1;
  const sort = file.floors.reduce((n, f) => Math.max(n, f.sort_index), -1) + 1;
  const taken = new Set(file.floors.map((f) => f.id));
  let number = level;
  while (taken.has(`${number}:floor`)) number += 1;
  const to = `${number}:`;
  const newId = `${to}floor`;

  /** The same id on the copy; anything not of this storey is left alone. */
  const re = (id: string) => (id.startsWith(from) ? to + id.slice(from.length) : id);
  const reOrNull = (id: string | null) => (id === null ? null : re(id));
  const ofFloor = (id: string) => id.startsWith(from);

  const copy: Floor = { ...floor, id: newId, name: `${floor.name} copy`, level, sort_index: sort };
  delete copy.domain_ref;

  const order: Record<string, string[]> = { ...(file.tree_order ?? {}) };
  for (const [key, ids] of Object.entries(file.tree_order ?? {})) {
    if (ofFloor(key)) order[re(key)] = ids.map(re);
  }

  const next: VisualLayerFile = {
    ...file,
    floors: [...file.floors, copy],
    vertices: [
      ...file.vertices,
      ...file.vertices.filter((v) => ofFloor(v.id)).map((v) => ({ ...v, id: re(v.id) })),
    ],
    walls: [
      ...file.walls,
      ...file.walls
        .filter((w) => ofFloor(w.id))
        .map((w) => ({
          ...w,
          id: re(w.id),
          v1: re(w.v1),
          v2: re(w.v2),
          room_a: re(w.room_a),
          room_b: re(w.room_b),
        })),
    ],
    rooms: [
      ...file.rooms,
      ...file.rooms
        .filter((r) => r.floor_id === floorId)
        .map((r) => {
          const room = {
            ...r,
            id: re(r.id),
            walls: r.walls.map(re),
            group_id: reOrNull(r.group_id),
            floor_id: newId,
          };
          delete room.domain_ref;
          return room;
        }),
    ],
    groups: [
      ...file.groups,
      ...file.groups
        .filter((g) => g.floor_id === floorId)
        .map((g) => ({
          ...g,
          id: re(g.id),
          parent_group_id: reOrNull(g.parent_group_id),
          floor_id: newId,
          domain_ref: null,
        })),
    ],
    doors: [
      ...file.doors,
      // The doors in its walls. The links between storeys are not copied;
      // they are worked out again below, for the building as it now is.
      ...file.doors
        .filter((d) => d.kind !== "virtual" && d.wall_id !== null && ofFloor(d.wall_id))
        .map((d) => ({ ...d, id: re(d.id), wall_id: reOrNull(d.wall_id) })),
    ],
    ...(file.tree_order ? { tree_order: order } : {}),
  };

  return {
    state: commit(state, "duplicate_floor", `Duplicate ${floor.name}`, rebuildVerticalDoors(next)),
    floorId: newId,
  };
}

/**
 * Delete a storey and everything drawn on it.
 *
 * Not the things that are only standing on it. A device there is still
 * a device the building has: it loses its place and goes back to the
 * unplaced list, to be put somewhere else. A space a rooms list named
 * for this floor is still in the list: it loses its floor. Access
 * profiles stop naming the rooms that are gone.
 *
 * The storeys above come down a level, because that is what taking a
 * storey out of a building does to them — and because the stairs and
 * the lift link adjacent levels: left with a gap, the shafts would stop
 * at it. Their ids and their names stay as they were; only `level`
 * moves, and the vertical doors are rebuilt for the building as it is.
 */
export function deleteFloor(state: EditState, floorId: string): EditState {
  const { file } = state;
  const floor = floorOf(file, floorId);
  if (file.floors.length <= 1) {
    throw new OperationRejected(
      `${floor.name} is the only floor. A building needs at least one.`,
    );
  }
  const prefix = prefixOf(floorId);
  const ofFloor = (id: string) => id.startsWith(prefix);

  const goneRooms = new Set(file.rooms.filter((r) => r.floor_id === floorId).map((r) => r.id));
  const goneDoors = new Set(
    file.doors
      .filter(
        (d) =>
          (d.wall_id !== null && ofFloor(d.wall_id)) ||
          (d.rooms !== null && d.rooms.some((id) => goneRooms.has(id))),
      )
      .map((d) => d.id),
  );

  const devices = file.devices.map((d) => {
    const here =
      d.floor_id === floorId ||
      (d.host_id !== null && (goneRooms.has(d.host_id) || goneDoors.has(d.host_id)));
    return here
      ? { ...d, host_id: null, floor_id: null, position: null, guards: [] }
      : d;
  });

  const order = Object.fromEntries(
    Object.entries(file.tree_order ?? {}).filter(([key]) => !ofFloor(key)),
  );
  const rooms = file.rooms.filter((r) => r.floor_id !== floorId);
  const spaces = file.unplaced_spaces?.map((s) =>
    s.floor_id === floorId ? { ...s, floor_id: null, group_id: null } : s,
  );

  const next: VisualLayerFile = {
    ...file,
    floors: file.floors
      .filter((f) => f.id !== floorId)
      .map((f) => (f.level > floor.level ? { ...f, level: f.level - 1 } : f)),
    vertices: file.vertices.filter((v) => !ofFloor(v.id)),
    walls: file.walls.filter((w) => !ofFloor(w.id)),
    rooms,
    groups: liveGroups(
      file.groups.filter((g) => g.floor_id !== floorId),
      rooms,
      spaces,
    ),
    doors: file.doors.filter((d) => !goneDoors.has(d.id)),
    devices,
    unplaced_devices: devices.filter((d) => d.host_id === null).map((d) => d.id),
    profiles: file.profiles.map((p) => ({
      ...p,
      rooms: p.rooms.filter((id) => !goneRooms.has(id)),
    })),
    ...(spaces ? { unplaced_spaces: spaces } : {}),
    ...(file.tree_order ? { tree_order: order } : {}),
  };

  return commit(state, "delete_floor", `Delete ${floor.name}`, rebuildVerticalDoors(next));
}

/** What an empty floor is drawn on: the canvas's page. */
const PAGE: PlanRect = { x: 0, y: 0, width: 1200, height: 800 };

/**
 * The box round what is drawn on a storey, in its own coordinates — or
 * the page, for a storey with nothing on it yet.
 */
export function floorExtent(file: VisualLayerFile, floorId: string): PlanRect {
  const prefix = prefixOf(floorId);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of file.vertices) {
    if (!v.id.startsWith(prefix)) continue;
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return PAGE;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Where an image first lands: as large as fits inside the box, in its
 * own proportions, centred. A starting point, not a claim — the image
 * is then the user's to move and size.
 */
export function fitBackground(
  into: PlanRect,
  natural: { width: number; height: number },
): PlanRect {
  if (!(natural.width > 0) || !(natural.height > 0)) return into;
  const scale = Math.min(into.width / natural.width, into.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    x: into.x + (into.width - width) / 2,
    y: into.y + (into.height - height) / 2,
    width,
    height,
  };
}

/** The same rectangle, made `factor` times the size about its middle. */
export function scaleRect(rect: PlanRect, factor: number): PlanRect {
  const width = rect.width * factor;
  const height = rect.height * factor;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

/**
 * Put an image behind a storey's plan, or take it away.
 *
 * Something to draw over: a scan, a photo of the fire-escape plan on
 * the wall. It is stored as given — a data URL here — with the place
 * it lies, and is no part of the model anything derives from; it is
 * only ever drawn.
 */
export function setFloorBackground(
  state: EditState,
  floorId: string,
  background: FloorBackground | null,
): EditState {
  const { file } = state;
  const floor = floorOf(file, floorId);
  if (background === null && !floor.background) return state;
  return commit(
    state,
    "floor_background",
    background === null ? "Remove background" : "Add background image",
    {
      ...file,
      floors: file.floors.map((f) => {
        if (f.id !== floorId) return f;
        const out = { ...f };
        if (background === null) delete out.background;
        else out.background = background;
        return out;
      }),
    },
  );
}

/**
 * Move and size a storey's background image: the action bar's Edit
 * image, applied.
 */
export function placeFloorBackground(
  state: EditState,
  floorId: string,
  rect: PlanRect,
): EditState {
  const { file } = state;
  const floor = floorOf(file, floorId);
  const was = floor.background;
  if (!was) {
    throw new OperationRejected(`${floor.name} has no background image to edit.`);
  }
  const ok = [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite);
  if (!ok || !(rect.width > 0) || !(rect.height > 0)) {
    throw new OperationRejected("An image has to have a size.");
  }
  if (
    was.x === rect.x &&
    was.y === rect.y &&
    was.width === rect.width &&
    was.height === rect.height
  ) {
    return state;
  }
  return commit(state, "floor_background", "Edit image", {
    ...file,
    floors: file.floors.map((f) =>
      f.id === floorId
        ? { ...f, background: { src: was.src, x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
        : f,
    ),
  });
}
