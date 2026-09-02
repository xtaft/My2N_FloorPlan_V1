// Zone categories: a building-wide, user-editable list (rename/recolor/
// reassign/delete/add — see DrawerDropDownDrawer.jsx's ZoneCategoriesContent)
// that a zone's `categoryId` field points into. This is deliberately
// separate from `zone.kind` (geometry.js/KIND_PRIORITY_ORDER): `kind` is the
// zone's immutable semantic type from the source Figma data, used for door
// naming priority — renaming/recoloring/reassigning a category must not
// disturb that. `categoryId` only drives the zone's rendered color and its
// row in the categories panel.
//
// COLOR_ITEM_PALETTE mirrors Figma's "colorItem" swatch palette. The 7 named
// colors actually assigned to a seed category below (lightBlue, lightGrey,
// darkYellow, purple, midGrey, darkGrey, brown) are real named tokens; the
// rest fill out a reasonably complete preset picker for "Change Color".
export const COLOR_ITEM_PALETTE = [
  { id: 'red', name: 'Red', hex: '#F44336' },
  { id: 'pink', name: 'Pink', hex: '#E91E63' },
  { id: 'purple', name: 'Purple', hex: '#9C27B0' },
  { id: 'indigo', name: 'Indigo', hex: '#3F51B5' },
  { id: 'blue', name: 'Blue', hex: '#2196F3' },
  { id: 'lightBlue', name: 'Light blue', hex: '#03A9F4' },
  { id: 'teal', name: 'Teal', hex: '#009688' },
  { id: 'green', name: 'Green', hex: '#4CAF50' },
  { id: 'lightGreen', name: 'Light green', hex: '#8BC34A' },
  { id: 'yellow', name: 'Yellow', hex: '#FFEB3B' },
  { id: 'darkYellow', name: 'Dark yellow', hex: '#F9A825' },
  { id: 'orange', name: 'Orange', hex: '#FF9800' },
  { id: 'deepOrange', name: 'Deep orange', hex: '#FF5722' },
  { id: 'brown', name: 'Brown', hex: '#795548' },
  { id: 'lightGrey', name: 'Light grey', hex: '#D9D9D9' },
  { id: 'midGrey', name: 'Mid grey', hex: '#9E9E9E' },
  { id: 'darkGrey', name: 'Dark grey', hex: '#616161' },
];

function paletteColor(colorId) {
  return COLOR_ITEM_PALETTE.find((c) => c.id === colorId).hex;
}

// Seed categories, in list order — protected ones can never be deleted (see
// ZoneCategoriesContent's options menu).
export const DEFAULT_CATEGORIES = [
  { id: 'apartments', name: 'Apartments', color: paletteColor('lightBlue'), protected: false },
  { id: 'hallways', name: 'Hallways', color: paletteColor('lightGrey'), protected: true },
  { id: 'commercial', name: 'Commercial', color: paletteColor('darkYellow'), protected: false },
  { id: 'technical', name: 'Technical', color: paletteColor('purple'), protected: false },
  { id: 'stairs', name: 'Stairs', color: paletteColor('midGrey'), protected: true },
  { id: 'elevators', name: 'Elevators', color: paletteColor('darkGrey'), protected: true },
  { id: 'unknown', name: 'Unknown', color: paletteColor('brown'), protected: true },
];

export const UNKNOWN_CATEGORY_ID = 'unknown';

// A zone's default category comes from the leading letter of its id's code
// part ("apartment__A07" -> "A"), not from `kind` — e.g. a "P" (parking)
// zone starts in Unknown rather than a separate category, per spec. Anything
// unrecognized also falls back to Unknown.
const ZONE_PREFIX_TO_CATEGORY_ID = {
  A: 'apartments',
  H: 'hallways',
  C: 'commercial',
  T: 'technical',
  S: 'stairs',
  E: 'elevators',
  P: 'unknown',
};

export function getDefaultCategoryIdForZoneId(zoneId) {
  const code = zoneId.split('__')[1];
  const letter = code?.[0]?.toUpperCase();
  return ZONE_PREFIX_TO_CATEGORY_ID[letter] ?? UNKNOWN_CATEGORY_ID;
}

// Backfills `categoryId` on any zone that doesn't already have one (fresh
// floor data, or a floor loaded before this field existed) — leaves zones
// that already have one untouched, so it's safe to call on every load.
export function seedZoneCategoryIds(zones) {
  return zones.map((zone) =>
    zone.categoryId !== undefined ? zone : { ...zone, categoryId: getDefaultCategoryIdForZoneId(zone.id) },
  );
}

export function pickRandomPaletteColor() {
  return COLOR_ITEM_PALETTE[Math.floor(Math.random() * COLOR_ITEM_PALETTE.length)].hex;
}
