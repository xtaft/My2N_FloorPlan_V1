// Single source of truth for floor-plan visual styling.
// Geometry/JSON only carries semantic `kind` — never color. Color lives here so
// a palette change is a one-line edit instead of a find-and-replace across every floor's JSON.
//
// Category base colors: sampled from the actual floor-plan zone fills in Figma
// ("Floor Plans" canvas). Category is orthogonal to state.
export const ZONE_CATEGORY_COLORS = {
  apartment: '#03A9F4',
  hallway: '#D9D9D9',
  elevator: '#696969',
  stairs: '#676767',
  garage: '#E3B1DF',
  commercial: '#FFC471',
  technical: '#FFEB99',
  unknown: '#999999',
};

// State treatment: sampled from Figma's "Components" page, visual_zone
// (Property 1 = Default/Hover/Selected/Dragging). Only opacity/stroke-width change —
// the hue is always the category color, never swapped out per state.
export const ZONE_STATE_STYLE = {
  default: { fillOpacity: 0.4, strokeWidth: 1.5 },
  hover: { fillOpacity: 0.55, strokeWidth: 2 },
  selected: { fillOpacity: 0.75, strokeWidth: 3 },
  dragging: { fillOpacity: 0.4, strokeWidth: 3, strokeDasharray: '6 6' },
};

// Door state treatment: sampled from Figma's visual_door component.
// Doors have no fill in the source design (stroke only) — selecting one swaps
// the stroke to this blue rather than changing opacity like zones do.
export const DOOR_STATE_STYLE = {
  default: { stroke: '#000000', strokeWidth: 2 },
  hover: { stroke: '#000000', strokeWidth: 4 },
  selected: { stroke: '#0D47A1', strokeWidth: 4 },
};

export function getZoneStyle(kind, state = 'default') {
  const color = ZONE_CATEGORY_COLORS[kind] || ZONE_CATEGORY_COLORS.unknown;
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
