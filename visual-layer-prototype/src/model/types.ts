/**
 * The stored objects, exactly as Part 2 of docs/floor-plan-visual-layer.md
 * defines them. Nothing derived appears here: no room polygons, no door room
 * pair, no room->doors list, no adjacency. Those live in the other modules and
 * are computed from these.
 */

/** The sentinel room on the outside of the building. Always `room_b`. */
export const EXTERIOR = "exterior";

export interface Vertex {
  id: string;
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  /** Walking v1 -> v2, `room_a` is on the LEFT. */
  v1: string;
  v2: string;
  /** A room id, or EXTERIOR. */
  room_a: string;
  room_b: string;
  /** "opening" means the wall was knocked through; the record is kept. */
  state: "solid" | "opening";
}

export interface Room {
  /** The access node — reachability runs over these, not over groups. */
  id: string;
  name: string;
  /** Unordered. The shape is derived from these by angular traversal. */
  walls: string[];
  /** Which envelope it sits in. */
  group_id: string | null;
  /** Usually null — inherited from the envelope via accessType(). */
  space_type: string | null;
  /** Denormalised, so a search need not walk the containment tree. */
  floor_id: string;
  /** Visibility only. Carries no access meaning. */
  surfaced: boolean;
}

export interface Group {
  /** The envelope: a flat, a gym, a hallway, a shaft. */
  id: string;
  name: string;
  space_type: string | null;
  /** Envelopes nest; null means top level on its floor. */
  parent_group_id: string | null;
  floor_id: string;
  /** Drawer position only — nothing derived reads it. */
  sort_index: number;
  /** The platform apartment/unit entity this envelope points at. */
  domain_ref: string | null;
  /** Set on shaft groups only, shared by that shaft on every floor. */
  shaft_id: string | null;
}

export type DoorKind = "physical" | "opening" | "virtual";

export interface Door {
  id: string;
  name: string;
  kind: DoorKind;
  /** physical and opening only. */
  wall_id: string | null;
  /** 0..1 along the wall — the centre of the opening. */
  t: number | null;
  width: number | null;
  /** physical only — which end of the wall the swing arc centres on. */
  hinge: "v1" | "v2" | null;
  /** physical only — which room the leaf opens into. */
  swing: "a" | "b" | null;
  /** virtual only: no wall to ask, so the pair IS stored. */
  rooms: [string, string] | null;
}

export interface Device {
  id: string;
  name: string;
  device_type: string;
  host_kind: "room" | "door" | null;
  /** null means orphaned — the device sits in the unplaced list. */
  host_id: string | null;
  /** room-hosted only. */
  position: [number, number] | null;
  /** door-hosted — the room ids it checks entry INTO. */
  guards: string[];
  floor_id: string | null;
  status: string;
}

export interface Floor {
  id: string;
  name: string;
  /** The real storey. Vertical doors pair adjacent levels, never drawer rows. */
  level: number;
  sort_index: number;
  /** dx, dy, rotation, scale — never baked into the vertices. */
  transform: [number, number, number, number];
}

/** Colour belongs to the type, never to a room or an envelope. */
export interface SpaceType {
  id: string;
  name: string;
  color: string;
}

/**
 * A permission set, not a person. A building has a handful of distinct
 * profiles rather than one per resident.
 */
export interface Profile {
  id: string;
  devices: string[];
  /** The rooms those devices guard — a convenience, re-derivable. */
  rooms: string[];
  people: string[];
  people_count: number;
}

export interface Repair {
  apartment: string;
  door: string;
  device: string;
  reason: string;
}

/** The shape of src/fixtures/visual_layer.json. */
export interface VisualLayerFile {
  note: string;
  space_types: SpaceType[];
  floors: Floor[];
  vertices: Vertex[];
  walls: Wall[];
  rooms: Room[];
  groups: Group[];
  doors: Door[];
  devices: Device[];
  profiles: Profile[];
  unplaced_devices: string[];
  repairs: Repair[];
  counts: Record<string, number>;
}

export interface Point {
  x: number;
  y: number;
}
