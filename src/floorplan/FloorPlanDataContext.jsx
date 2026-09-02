import { createContext, useContext, useMemo, useState } from 'react';
import { getFloorData, DEFAULT_FLOOR_ID } from './floors.js';
import { DEFAULT_CATEGORIES, seedZoneCategoryIds } from './categories.js';
import { buildInitialDevices } from './devices.js';

const FloorPlanDataContext = createContext(null);

/**
 * The state that makes up "the floor plan" — every floor's zones/doors, the
 * building-wide zone categories, the device roster, and which floor is
 * currently being looked at.
 *
 * These live here, above the router (App.jsx), rather than inside
 * useFloorPlanEditor/useDevices, because the editor (/floor-plan,
 * FloorPlanScreen.jsx) and the read-only view (the Location Floor Plan tab's
 * FloorPlanCreatedContent.jsx) are separate routes: component-local state
 * dies when the editor unmounts on Save/Close, so every edit was being
 * silently thrown away and the view re-seeded itself from the static source
 * data. Hoisting it here is what makes an edit in the editor actually show
 * up in view mode — and in the Structure/Devices tables, which read the same
 * store.
 *
 * activeFloorId is here for the same reason, even though it's a view
 * concern rather than data: the editor and the view each used to own their
 * own copy, so switching between them always snapped back to
 * DEFAULT_FLOOR_ID — walk to Floor 2 in view mode, hit Edit, and you'd land
 * on Floor 1. Sharing it means whichever floor you're on follows you both
 * ways, including through the fullscreen preview.
 *
 * Everything else those hooks own (pending Merge/Divide gestures, the active
 * tool, snackbars, memoized geometry) is genuinely per-screen UI state and
 * deliberately stays local to them.
 *
 * Still in-memory only: there's no backend in this prototype, so a full page
 * reload starts over from the seed data. Surviving navigation between the
 * editor and the view is the part that matters for the demo.
 *
 * floorsData seeds DEFAULT_FLOOR_ID eagerly (other floors are seeded lazily
 * by useFloorPlanEditor when first visited) so the first screen to mount
 * already has its data — useEditHistory watches floorsData for changes, and
 * an empty-to-seeded transition right after mount would otherwise be
 * recorded as if it were the user's first edit, wrongly enabling Undo.
 */
export function FloorPlanDataProvider({ children }) {
  const [floorsData, setFloorsData] = useState(() => {
    const data = getFloorData(DEFAULT_FLOOR_ID);
    if (!data) return {};
    return { [DEFAULT_FLOOR_ID]: { zones: seedZoneCategoryIds(data.zones), doors: data.doors } };
  });
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [devices, setDevices] = useState(buildInitialDevices);
  const [activeFloorId, setActiveFloorId] = useState(DEFAULT_FLOOR_ID);

  const value = useMemo(
    () => ({
      floorsData,
      setFloorsData,
      categories,
      setCategories,
      devices,
      setDevices,
      activeFloorId,
      setActiveFloorId,
    }),
    [floorsData, categories, devices, activeFloorId],
  );

  return <FloorPlanDataContext.Provider value={value}>{children}</FloorPlanDataContext.Provider>;
}

export function useFloorPlanData() {
  const context = useContext(FloorPlanDataContext);
  if (!context) throw new Error('useFloorPlanData must be used inside a FloorPlanDataProvider');
  return context;
}
