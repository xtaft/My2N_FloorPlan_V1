import { point, polygon, booleanPointInPolygon } from '@turf/turf';
import { FLOOR_LIST } from './floors.js';
import { findDoorWallEdge, getDoorWallMidpoint, perpendicularOffsetCandidates } from './geometry.js';

// Device roster for the Devices edit mode: a building-wide list (the drawer
// shows every floor's devices at once, not just the active floor's), where
// each device is either *pinned* — fixed to a specific zone or door on a
// specific floor, and rendered on the canvas — or *unpinned* — not placed
// anywhere yet, drawer-only.
//
// Devices are deliberately NOT stored on zones/doors the way `dropPin` is:
// a device outlives the thing it's attached to (unpinning is a normal
// action, and an unpinned device has no zone at all), and several devices
// aren't tied to any one floor. So the roster is its own flat list keyed by
// device id, holding a nullable zoneId/doorId reference — the same
// "reference, don't nest" shape doors already use for their zoneA/zoneB.

export const DEVICE_TYPE = {
  indoorView: 'indoorView',
  indoorTouch: 'indoorTouch',
  indoorClip: 'indoorClip',
  ipStyle: 'ipStyle',
  ipVerso: 'ipVerso',
  accessUnit: 'accessUnit',
};

// Apartment positions that get each in-unit device type. Positions are the
// last digit of the apartment code, and the roster only covers floors 1-4 —
// the ground and garage floors have no `Axx` apartments at all.
const INDOOR_VIEW_POSITIONS = [1, 2, 6, 7];
const INDOOR_CLIP_POSITIONS = [3, 4, 5];
const DEVICE_FLOORS = [
  { floorId: 'floor_01', floorNumber: 1 },
  { floorId: 'floor_02', floorNumber: 2 },
  { floorId: 'floor_03', floorNumber: 3 },
  { floorId: 'floor_04', floorNumber: 4 },
];

// The Indoor Touch replaces what would otherwise be this unit's Indoor Clip.
const INDOOR_TOUCH_FLOOR_NUMBER = 4;
const INDOOR_TOUCH_POSITION = 3;
const INDOOR_TOUCH_NAME = '123456789';

// Floor 1's apartments are numbered A0x, not A1x — inconsistent with floors
// 2-4 (which follow A{floor}{position}), but that's the building's actual
// existing numbering, so it's encoded as-is rather than "corrected".
function apartmentCode(floorNumber, position) {
  return floorNumber === 1 ? `A0${position}` : `A${floorNumber}${position}`;
}

function apartmentZoneId(floorNumber, position) {
  return `apartment__${apartmentCode(floorNumber, position)}`;
}

// The main entrance is the ground floor's exterior hallway door. (The spec
// called this "H01-ext"; there is no exterior door on floor 1 in the source
// geometry — `door__H00-ext` on floor_00 is the building's actual main
// entrance, so that's what this pins to.)
const MAIN_ENTRANCE_FLOOR_ID = 'floor_00';
const MAIN_ENTRANCE_DOOR_ID = 'door__H00-ext';

function pinnedToZone(id, name, type, floorId, zoneId) {
  return { id, name, type, floorId, pinned: true, zoneId, doorId: null, doorSide: 0 };
}

function pinnedToDoor(id, name, type, floorId, doorId) {
  return { id, name, type, floorId, pinned: true, zoneId: null, doorId, doorSide: 0 };
}

// floorId null = building-wide: the device belongs to no particular floor
// until someone places it (the drawer lists it regardless of which floor is
// active, since it could go on any of them).
function unpinned(id, name, type, floorId = null) {
  return { id, name, type, floorId, pinned: false, zoneId: null, doorId: null, doorSide: 0 };
}

// Which kinds of thing a device is allowed to be pinned to. Access Units
// are door-only: the whole point of one is to check access *through* a
// specific door (and "Swap door side" — which side it reads from — is only
// meaningful against a door), so dropping one into a zone interior would be
// meaningless. Everything else can go on either a zone or a door.
export function canPinToZone(device) {
  return device.type !== DEVICE_TYPE.accessUnit;
}

export function canPinToDoor() {
  return true;
}

export function buildInitialDevices() {
  const devices = [];

  for (const { floorId, floorNumber } of DEVICE_FLOORS) {
    for (const position of INDOOR_VIEW_POSITIONS) {
      const code = apartmentCode(floorNumber, position);
      devices.push(
        pinnedToZone(
          `${floorId}__${code}-indoor-view`,
          `${code} Indoor View`,
          DEVICE_TYPE.indoorView,
          floorId,
          apartmentZoneId(floorNumber, position),
        ),
      );
    }

    for (const position of INDOOR_CLIP_POSITIONS) {
      const isIndoorTouchUnit =
        floorNumber === INDOOR_TOUCH_FLOOR_NUMBER && position === INDOOR_TOUCH_POSITION;
      const code = apartmentCode(floorNumber, position);

      if (isIndoorTouchUnit) {
        devices.push(
          pinnedToZone(
            `${floorId}__${code}-indoor-touch`,
            INDOOR_TOUCH_NAME,
            DEVICE_TYPE.indoorTouch,
            floorId,
            apartmentZoneId(floorNumber, position),
          ),
        );
        continue; // this unit gets the Indoor Touch *instead of* an Indoor Clip
      }

      devices.push(
        unpinned(`${floorId}__${code}-indoor-clip`, `${code} Indoor Clip`, DEVICE_TYPE.indoorClip, floorId),
      );
    }
  }

  devices.push(
    pinnedToDoor(
      'ip-style-main-entrance',
      'IP Style Main Entrance',
      DEVICE_TYPE.ipStyle,
      MAIN_ENTRANCE_FLOOR_ID,
      MAIN_ENTRANCE_DOOR_ID,
    ),
  );

  devices.push(unpinned('ip-verso-side-entrance', 'IP Verso Side Entrance', DEVICE_TYPE.ipVerso));
  // The Garage Reader is the one device with no default assignment at all —
  // which door it checks access from is left entirely to whoever's using the
  // prototype.
  devices.push(unpinned('access-unit-garage-reader', 'Garage Reader', DEVICE_TYPE.accessUnit));

  return devices;
}

const FLOOR_LABEL_BY_ID = Object.fromEntries(FLOOR_LIST.map((f) => [f.floorId, f.label]));

export function formatDeviceFloorLabel(floorId) {
  if (!floorId) return 'Any floor';
  const label = FLOOR_LABEL_BY_ID[floorId];
  return label ? `Floor ${label}` : floorId;
}

// --- pin placement ---

// A zone-assigned device sits at the horizontal center of the zone's width,
// in the bottom third of its height. Both are measured off the ring's
// bounding box rather than a true centroid: for the rectilinear apartment
// zones this roster targets they're the same thing, and the bounding box
// keeps the "center of the width / bottom third of the height" reading
// literal and predictable even after a Divide reshapes a zone.
const ZONE_PIN_HEIGHT_FRACTION = 0.75; // within the bottom third (0.667-1.0)

// Mirrors ZONE_PIN_HEIGHT_FRACTION (1 - 0.75) so the "Show labels" zone name
// sits in the upper third at the same relative depth the device pin sits in
// the bottom third — see FloorPlanCanvas.jsx's zone label rendering.
const ZONE_LABEL_HEIGHT_FRACTION = 0.25; // within the upper third (0-0.333)

export function zoneBoundingBox(zone) {
  const xs = zone.rings[0].map((p) => p[0]);
  const ys = zone.rings[0].map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// Where a zone's name label renders when "Show labels" is on — horizontally
// centered, upper third of the zone's height (see zoneBoundingBox's caveat
// about bounding-box vs. true centroid, which applies here too).
export function getZoneLabelPosition(zone) {
  const { minX, maxX, minY, maxY } = zoneBoundingBox(zone);
  return [(minX + maxX) / 2, minY + (maxY - minY) * ZONE_LABEL_HEIGHT_FRACTION];
}

// How far off the wall a door-assigned device sits — enough to read as
// "beside the door" rather than on top of the door glyph itself.
const DOOR_PIN_OFFSET = 34;

// perpendicularOffsetCandidates orders its two points by the wall edge's own
// direction vector, which just follows however that zone's ring happens to
// be wound in the source data. So "candidate 0" was whichever side the
// winding pointed at — not a meaningful side, and different from door to
// door. On floor -1's hallway/garage door that put the Garage Reader outside
// the hallway (down in the garage) by default, which is what made it look
// misplaced.
//
// This reorders them so index 0 is always the point that falls INSIDE
// `zone` — the door's zoneA. For an interior door that's the higher-priority
// kind (orderZonesForDoorName: hallway > commercial > apartment > technical >
// garage); for an exterior one it's the only real zone. Either way doorSide 0
// now means "the hallway/public/interior side" and "Swap door side" flips it
// out to the other side, which is the orientation choice worth testing.
function orderDoorSideCandidates([first, second], zone) {
  const ring = polygon(zone.rings);
  if (booleanPointInPolygon(point(first), ring)) return [first, second];
  if (booleanPointInPolygon(point(second), ring)) return [second, first];
  return [first, second]; // neither lands inside (shouldn't happen) — leave the order alone
}

// Where a pinned device renders on the floor plan, or null if it isn't
// placeable right now (unpinned, on a different floor, or its zone/door has
// since been merged/divided/deleted out of existence — the same
// self-healing tolerance pruneOrphanedDoors gives doors).
export function getDevicePinPosition(device, zones, doors) {
  if (!device.pinned) return null;

  if (device.zoneId) {
    const zone = zones.find((z) => z.id === device.zoneId);
    if (!zone) return null;
    const { minX, maxX, minY, maxY } = zoneBoundingBox(zone);
    return [(minX + maxX) / 2, minY + (maxY - minY) * ZONE_PIN_HEIGHT_FRACTION];
  }

  if (device.doorId) {
    const door = doors.find((d) => d.id === device.doorId);
    if (!door) return null;
    const zone = zones.find((z) => z.id === door.zoneA);
    if (!zone) return null;
    // Exterior doors pass a null neighbor, which findDoorWallEdge already
    // handles (it then looks for an edge no other zone shares).
    const edge = findDoorWallEdge(door, zone, door.zoneB ?? null, zones);
    if (!edge) return null;
    const midpoint = getDoorWallMidpoint(door, edge);
    // doorSide picks which perpendicular side of the wall the device sits
    // on — that's exactly what "Swap door side" toggles, and it's the only
    // marker of which direction access is checked from. 0 is the zoneA
    // (interior/public) side — see orderDoorSideCandidates.
    const candidates = orderDoorSideCandidates(
      perpendicularOffsetCandidates(midpoint, edge, DOOR_PIN_OFFSET),
      zone,
    );
    return candidates[device.doorSide === 1 ? 1 : 0];
  }

  return null;
}
