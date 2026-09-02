import floorNeg1 from '../data/floor_-1.json';
import floor00 from '../data/floor_00.json';
import floor01 from '../data/floor_01.json';
import floor02 from '../data/floor_02.json';
import floor03 from '../data/floor_03.json';
import floor04 from '../data/floor_04.json';

// Ordered top-to-bottom the way the FloorPlanNavigation drawer displays them
// (Figma: 3, 2, 1, 0, -1 — extended here with the floors we actually have data for).
export const FLOOR_LIST = [
  { floorId: 'floor_04', label: '4', data: floor04 },
  { floorId: 'floor_03', label: '3', data: floor03 },
  { floorId: 'floor_02', label: '2', data: floor02 },
  { floorId: 'floor_01', label: '1', data: floor01 },
  { floorId: 'floor_00', label: '0', data: floor00 },
  { floorId: 'floor_-1', label: '-1', data: floorNeg1 },
];

const FLOOR_BY_ID = Object.fromEntries(FLOOR_LIST.map((f) => [f.floorId, f.data]));

export function getFloorData(floorId) {
  return FLOOR_BY_ID[floorId];
}

export const DEFAULT_FLOOR_ID = 'floor_01';
