import { findDoorConnectingZones } from './geometry.js';

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// "apartment__A07" -> "Apartment A07"
// "apartment__A02+apartment__A01" (a merged zone) -> "Apartment A02 + Apartment A01"
export function formatZoneName(id) {
  return id
    .split('+')
    .map((part) => {
      const [kind, code] = part.split('__');
      return code ? `${capitalize(kind)} ${code}` : part;
    })
    .join(' + ');
}

// A zone's own display name — its `name` override if it's been renamed (see
// ZoneMenu.jsx/useFloorPlanEditor.js's renameZone), otherwise the id-derived
// name every zone starts with. Doors still tooltip via the id-derived name
// only (formatDoorTooltip below) — a door's zoneA/zoneB are bare id strings,
// not zone objects, so plumbing a custom name through there as well would
// need a wider signature change than renaming itself calls for.
export function getZoneDisplayName(zone) {
  return zone.name || formatZoneName(zone.id);
}

// "door__H01-A07" -> "Door H01 ↔ A07"
export function formatDoorName(id) {
  const rest = id.replace(/^door__/, '');
  return `Door ${rest.replace('-', ' ↔ ')}`;
}

// "Door: [zone 1] to [zone 2]", per the Add Door spec's tooltip note.
// Zone ids are read straight off the door's own explicit zoneA/zoneB fields
// (kept correct across Merge/Divide by useFloorPlanEditor.js) rather than
// re-derived from geometry on every render. The geometric lookup
// (findDoorConnectingZones) only runs as a fallback for a door that somehow
// predates the zoneA/zoneB migration.
export function formatDoorTooltip(door, zones) {
  if (door.zoneA) {
    return door.zoneB
      ? `Door: ${formatZoneName(door.zoneA)} to ${formatZoneName(door.zoneB)}`
      : `Door: ${formatZoneName(door.zoneA)} to Exterior`;
  }

  const connected = findDoorConnectingZones(door, zones);
  if (connected.length === 2) {
    return `Door: ${formatZoneName(connected[0].id)} to ${formatZoneName(connected[1].id)}`;
  }
  if (connected.length === 1) {
    return `Door: ${formatZoneName(connected[0].id)} to Exterior`;
  }
  return formatDoorName(door.id);
}
