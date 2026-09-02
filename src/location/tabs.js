// The Location detail page's tab bar (Figma "Header NG Loc", node 18:48661) —
// seven tabs in the real design (Overview / Structure / Residents / Devices /
// Operators / Logs & Events / Floor Plan), of which only four have a screen
// in this prototype. The other three render as disabled tabs rather than
// being omitted — matching the design's tab bar exactly — with no `path` to
// route to, the same "present but not implemented yet" status Add Pin/Save/
// Close/AppBarNgFloorPlan's Save carry elsewhere in this app.
export const LOCATION_TABS = [
  { key: 'overview', label: 'Overview', path: null },
  { key: 'structure', label: 'Structure', path: '/' },
  { key: 'residents', label: 'Residents', path: '/residents' },
  { key: 'devices', label: 'Devices', path: '/devices' },
  { key: 'operators', label: 'Operators', path: null },
  { key: 'logsEvents', label: 'Logs & Events', path: null },
  { key: 'floorPlan', label: 'Floor Plan', path: '/floor-plans' },
];
