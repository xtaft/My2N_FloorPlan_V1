import { useCallback, useMemo } from 'react';
import { canPinToZone, DEVICE_TYPE } from './devices.js';
import { useFloorPlanData } from './FloorPlanDataContext.jsx';

// Stable identity so `seedEmpty` doesn't hand every render a fresh array and
// invalidate the memos downstream of it.
const NO_DEVICES = [];

/**
 * The device roster and its per-item actions (see devices.js for the data
 * model and the seed roster itself).
 *
 * This is its own hook rather than more state inside useFloorPlanEditor
 * because devices are building-wide, not per-floor: the drawer lists every
 * floor's devices at once, and two of them (IP Verso, Garage Reader) belong
 * to no floor at all until placed. useFloorPlanEditor's state is keyed by
 * floorId throughout, which is the wrong shape for that.
 *
 * Item actions, per spec:
 *  - Rename: same inline edit interaction as a zone category's rename (the
 *    row swaps to a text field; tick commits, cross or click-away reverts) —
 *    that lives in the drawer component; this hook just takes the committed
 *    name.
 *  - Unpin: only meaningful for a currently-pinned device. It clears the
 *    zone/door assignment, which is what removes the device's marker from
 *    the canvas (getDevicePinPosition returns null for an unpinned device),
 *    and returns it to the drawer's draggable/unplaced group.
 *  - Swap door side: Access Units only. Flips which perpendicular side of
 *    the wall the marker renders on — the sole indicator of which direction
 *    access is checked from, so there's no separate assignment step.
 *
 * The roster itself lives in FloorPlanDataContext (above the router), not in
 * this hook, so that pinning/unpinning/renaming a device in the editor still
 * shows up after Save/Close in the read-only view and the Devices tab —
 * those are separate routes, so local state here would die with the editor.
 *
 * seedEmpty presents the roster as empty for the one editor session that's
 * fresh out of CreateFloorPlanWizard (see FloorPlanScreen.jsx's seedDevices
 * navigation state): the wizard only ever uploads floor plans/structure,
 * never device data, so that session should show zero devices rather than
 * the building's pre-existing roster. It deliberately hides rather than
 * clearing — nothing in that session can touch a device anyway (an empty
 * drawer has nothing to drag), so the stored roster is genuinely unmodified
 * and is still there for the Created screens and every later Edit session.
 */
export function useDevices(seedEmpty = false) {
  const { devices: storedDevices, setDevices } = useFloorPlanData();
  const devices = seedEmpty ? NO_DEVICES : storedDevices;

  const renameDevice = useCallback(
    (deviceId, newName) => {
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, name: newName } : d)));
    },
    [setDevices],
  );

  const unpinDevice = useCallback(
    (deviceId) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, pinned: false, zoneId: null, doorId: null } : d)),
      );
    },
    [setDevices],
  );

  const swapDeviceDoorSide = useCallback(
    (deviceId) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, doorSide: d.doorSide === 1 ? 0 : 1 } : d)),
      );
    },
    [setDevices],
  );

  // Pinning also (re)binds the device to whichever floor it was dropped on —
  // the building-wide devices (IP Verso, Garage Reader) have no floor at all
  // until this point, and re-placing a device on a different floor should
  // move it rather than leave it claiming its old one.
  const pinDeviceToZone = useCallback(
    (deviceId, floorId, zoneId) => {
      setDevices((prev) =>
        prev.map((d) =>
          // Guarded here as well as in the drop target, so the rule holds no
          // matter which caller reaches it.
          d.id === deviceId && canPinToZone(d)
            ? { ...d, pinned: true, floorId, zoneId, doorId: null }
            : d,
        ),
      );
    },
    [setDevices],
  );

  const pinDeviceToDoor = useCallback(
    (deviceId, floorId, doorId) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, pinned: true, floorId, zoneId: null, doorId } : d)),
      );
    },
    [setDevices],
  );

  return {
    devices,
    renameDevice,
    unpinDevice,
    swapDeviceDoorSide,
    pinDeviceToZone,
    pinDeviceToDoor,
    // Raw setter, for useEditHistory (FloorPlanScreen.jsx) to restore a
    // snapshot wholesale on undo/redo, alongside floorsData/categories.
    setDevices,
  };
}

// Unpinned devices sort to the top of the drawer list, ahead of pinned ones —
// they're the ones still needing attention. Within each group the roster's
// own seed order is preserved (floor by floor, apartment by apartment)
// rather than re-sorted alphabetically, which would interleave floors.
export function useFilteredDevices(devices, searchQuery) {
  return useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matching = query ? devices.filter((d) => d.name.toLowerCase().includes(query)) : devices;
    return [...matching.filter((d) => !d.pinned), ...matching.filter((d) => d.pinned)];
  }, [devices, searchQuery]);
}

export function isAccessUnit(device) {
  return device.type === DEVICE_TYPE.accessUnit;
}
