// Whether this browser tab has actually completed CreateFloorPlanWizard this
// session — gates direct access to /floor-plan (see RequireFloorPlanCreated,
// App.jsx) so the prototype's real entry point (the empty Structure screen
// at "/") can't be skipped by bookmarking/reloading straight into the
// pre-existing demo floor plan. sessionStorage (not a plain module variable)
// so it survives a reload of /floor-plan itself once created, but resets the
// next time the tab/window is actually closed — "created" doesn't mean
// "permanently unlocked forever" the way it would with localStorage.
const STORAGE_KEY = 'floorPlanCreated';

export function markFloorPlanCreated() {
  sessionStorage.setItem(STORAGE_KEY, 'true');
}

export function hasFloorPlanBeenCreated() {
  return sessionStorage.getItem(STORAGE_KEY) === 'true';
}
