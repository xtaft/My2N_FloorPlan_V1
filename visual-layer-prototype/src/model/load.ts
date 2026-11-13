/**
 * Index the fixture once. Everything here is a lookup built from the stored
 * records — never a stored relationship, so none of it can go stale.
 */
import rawFixture from "../fixtures/visual_layer.json";
import type {
  Device,
  Door,
  Floor,
  Group,
  Profile,
  Room,
  SpaceType,
  Vertex,
  VisualLayerFile,
  Wall,
} from "./types";
import { EXTERIOR } from "./types";

export interface VisualLayer {
  file: VisualLayerFile;

  vertices: Map<string, Vertex>;
  walls: Map<string, Wall>;
  rooms: Map<string, Room>;
  groups: Map<string, Group>;
  doors: Map<string, Door>;
  spaceTypes: Map<string, SpaceType>;

  floors: Floor[];
  devices: Device[];
  profiles: Profile[];

  /** door id -> the devices hosted on it. */
  devicesOnDoor: Map<string, Device[]>;
  /** room id -> the devices hosted in it. */
  devicesInRoom: Map<string, Device[]>;
  /** wall id -> the doors sitting in it. */
  doorsOnWall: Map<string, Door[]>;
  /** floor id -> its rooms. */
  roomsByFloor: Map<string, Room[]>;
  /** group id -> its direct child envelopes, in drawer order. */
  childGroups: Map<string, Group[]>;
  /** host_id null — a state a manager resolves, not an error to clean up. */
  unplacedDevices: Device[];
}

function byId<T extends { id: string }>(xs: T[]): Map<string, T> {
  return new Map(xs.map((x) => [x.id, x]));
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const existing = m.get(k);
  if (existing) existing.push(v);
  else m.set(k, [v]);
}

export function indexVisualLayer(file: VisualLayerFile): VisualLayer {
  const devicesOnDoor = new Map<string, Device[]>();
  const devicesInRoom = new Map<string, Device[]>();
  for (const d of file.devices) {
    if (d.host_id === null) continue;
    if (d.host_kind === "door") push(devicesOnDoor, d.host_id, d);
    else if (d.host_kind === "room") push(devicesInRoom, d.host_id, d);
  }

  const doorsOnWall = new Map<string, Door[]>();
  for (const d of file.doors) {
    if (d.wall_id !== null) push(doorsOnWall, d.wall_id, d);
  }

  const roomsByFloor = new Map<string, Room[]>();
  for (const r of file.rooms) push(roomsByFloor, r.floor_id, r);

  const childGroups = new Map<string, Group[]>();
  for (const g of file.groups) {
    if (g.parent_group_id !== null) push(childGroups, g.parent_group_id, g);
  }
  for (const kids of childGroups.values()) {
    kids.sort((a, b) => a.sort_index - b.sort_index);
  }

  return {
    file,
    vertices: byId(file.vertices),
    walls: byId(file.walls),
    rooms: byId(file.rooms),
    groups: byId(file.groups),
    doors: byId(file.doors),
    spaceTypes: byId(file.space_types),
    floors: [...file.floors].sort((a, b) => a.sort_index - b.sort_index),
    devices: file.devices,
    profiles: file.profiles,
    devicesOnDoor,
    devicesInRoom,
    doorsOnWall,
    roomsByFloor,
    childGroups,
    unplacedDevices: file.devices.filter((d) => d.host_id === null),
  };
}

/**
 * The fixture is imported statically so Vite bundles it rather than fetching
 * it at runtime. The cast is deliberate: letting tsc infer the literal type of
 * an 8000-line JSON file costs seconds on every typecheck and buys nothing,
 * since the field names are already pinned by VisualLayerFile.
 */
export const fixture = rawFixture as unknown as VisualLayerFile;

export const visualLayer: VisualLayer = indexVisualLayer(fixture);

/** Top-level envelopes on a floor, in drawer order. */
export function topGroups(layer: VisualLayer, floorId: string): Group[] {
  return layer.file.groups
    .filter((g) => g.floor_id === floorId && g.parent_group_id === null)
    .sort((a, b) => a.sort_index - b.sort_index);
}

export function isExterior(roomId: string): boolean {
  return roomId === EXTERIOR;
}

/** Lookup that states the invariant rather than silently returning undefined. */
export function must<T>(m: Map<string, T>, id: string, what: string): T {
  const v = m.get(id);
  if (v === undefined) throw new Error(`${what} not found: ${id}`);
  return v;
}
