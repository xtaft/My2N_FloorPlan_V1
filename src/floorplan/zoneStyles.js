// Single source of truth for floor-plan visual styling.
// Geometry/JSON only carries semantic `kind` — never color. Zone fill color
// is no longer a static kind lookup: it's now the zone's *category*'s own
// (user-editable) color — see categories.js and useFloorPlanEditor.js's
// categories state. getZoneStyle below just takes that resolved color
// directly and applies the state (default/hover/selected/...) treatment.
//
// State treatment: sampled from Figma's "Components" page, visual_zone
// (Property 1 = Default/Hover/Selected/Dragging). Only opacity/stroke-width change —
// the hue is always the category color, never swapped out per state.
// eligible/dimmed aren't from Figma — added for the Merge tool: once a first
// zone is picked, adjacent zones (valid merge targets) get the "eligible"
// treatment permanently (not just on actual mouse hover, unlike "hover"
// below), and everything else recedes as "dimmed".
export const ZONE_STATE_STYLE = {
  default: { fillOpacity: 0.4, strokeWidth: 1.5 },
  hover: { fillOpacity: 0.55, strokeWidth: 2 },
  selected: { fillOpacity: 0.75, strokeWidth: 3 },
  dragging: { fillOpacity: 0.4, strokeWidth: 3, strokeDasharray: '6 6' },
  eligible: { fillOpacity: 0.55, strokeWidth: 2 },
  dimmed: { fillOpacity: 0.15, strokeWidth: 1 },
};

// Door state treatment: sampled from Figma's visual_door component.
// Doors have no fill in the source design (stroke only) — selecting one swaps
// the stroke to this blue rather than changing opacity like zones do.
export const DOOR_STATE_STYLE = {
  default: { stroke: '#000000', strokeWidth: 2 },
  hover: { stroke: '#000000', strokeWidth: 4 },
  selected: { stroke: '#0D47A1', strokeWidth: 4 },
};

export function getZoneStyle(color, state = 'default') {
  const s = ZONE_STATE_STYLE[state] || ZONE_STATE_STYLE.default;
  return {
    fill: color,
    fillOpacity: s.fillOpacity,
    stroke: '#000000', // borders stay black in the real floor-plan renders, unlike the generic demo swatch
    strokeWidth: s.strokeWidth,
    strokeDasharray: s.strokeDasharray || 'none',
  };
}

export function getDoorStyle(state = 'default') {
  return DOOR_STATE_STYLE[state] || DOOR_STATE_STYLE.default;
}
