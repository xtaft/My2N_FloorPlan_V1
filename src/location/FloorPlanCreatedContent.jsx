import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DrawerFloorPlanNavigation from '../floorplan/components/DrawerFloorPlanNavigation.jsx';
import FloorPlanCanvas from '../floorplan/FloorPlanCanvas.jsx';
import FloorPlanViewActionBar from './FloorPlanViewActionBar.jsx';
import LocationTopAppBar from './LocationTopAppBar.jsx';
import { useFloorPlanEditor } from '../floorplan/useFloorPlanEditor.js';
import { useFloorPlanData } from '../floorplan/FloorPlanDataContext.jsx';
import { CHROME_SHADOW } from '../floorplan/chromeShadow.js';

// Every interactive callback FloorPlanCanvas takes is wired to a no-op here —
// this is a read-only preview (Figma's "Location / FloorPlan - Created",
// node 7:18085's viewCanvas), not the editor. No ZoneMenu/DeviceMenu is
// rendered either, so a click landing on a zone or device marker genuinely
// does nothing rather than half-opening a menu with nowhere to anchor.
const NOOP = () => {};

/**
 * The Floor Plan tab's Created-state content (see LocationTabScreen.jsx,
 * which swaps this in for EmptyStateCard once hasFloorPlanBeenCreated()).
 * Reuses DrawerFloorPlanNavigation, FloorPlanCanvas, and
 * FloorPlanViewActionBar (the "viewMode" ActionBar variant, node
 * 104:105655) — the same floor switcher, rendering engine, and (view-only)
 * toolbar the real editor uses, just with every edit affordance disabled.
 *
 * Two distinct exits from this screen, both off FloorPlanViewActionBar:
 * "Edit" goes straight to the real editor (/floor-plan, full device
 * roster); the fullscreen icon instead toggles `fullscreen`'s own Dialog —
 * Figma's "Location / FloorPlan - ViewOnlyFullScreen" (node 109:114089) —
 * which re-renders this exact same canvasArea under LocationTopAppBar, the
 * same platform-wide top bar every other Location screen sits under
 * (Structure/Devices/etc. — see LocationShell.jsx), rather than a one-off
 * bar of its own. That same ActionBar's fullscreen button is still there
 * inside the Dialog (canvasArea is shared, not duplicated) and, with
 * `fullscreen` true, now closes it instead of opening a second one — see
 * FloorPlanViewActionBar's doc comment. canvasArea is built once and
 * rendered in exactly one of the two return branches below — never both at
 * once — so there's only ever one mounted FloorPlanCanvas for transformRef
 * to point at.
 *
 * showLabels/showDevices mirror the real editor's own switches (Zone
 * labels/Devices); showResidents has no effect yet — see
 * FloorPlanViewActionBar's doc comment for why. Device markers here also
 * carry the small status-dot badge (showDeviceStatusBadges,
 * DeviceItemMarker.jsx) that the real editable canvas never shows.
 *
 * This mounts its own useFloorPlanEditor instance, but both it and the
 * editor's read the same zones/doors/categories/devices out of
 * FloorPlanDataContext (above the router), so edits made in the editor —
 * merges, divides, new doors, renames, recolors, device placement — are
 * visible here as soon as you come back from it. Only the ephemeral bits
 * (pending gestures, active tool) are per-mount.
 *
 * The outer Paper's elevation matches the real editor's own chrome
 * (CHROME_SHADOW, shared via chromeShadow.js) per that instruction — this
 * preview should read as "the same raised surface", not a plain flat card.
 *
 * FloorPlanViewActionBar's device search (typing filters the full roster to
 * pinned devices by name) reports its pick here via handleSelectDevice,
 * which switches activeFloorId to wherever that device is pinned and sets
 * selectedDeviceId so DeviceItemMarker draws its selected-ring — the same
 * highlight a canvas click would show in the real editor, just reached by
 * search instead, and without leaving view mode (no menu opens).
 */
export default function FloorPlanCreatedContent() {
  const navigate = useNavigate();
  // activeFloorId is shared with the editor (FloorPlanDataContext), so
  // switching to Floor 2 here and hitting Edit opens the editor on Floor 2
  // rather than snapping back to the default.
  const { devices, activeFloorId, setActiveFloorId } = useFloorPlanData();
  const { zones, doors, categories, wallSegments, eligibleZoneIds } = useFloorPlanEditor(activeFloorId, null);
  const [showLabels, setShowLabels] = useState(true);
  const [showDevices, setShowDevices] = useState(true);
  const [showResidents, setShowResidents] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const transformRef = useRef(null);

  const goToEditor = () => navigate('/floor-plan');

  const handleSelectDevice = (device) => {
    setActiveFloorId(device.floorId);
    setSelectedDeviceId(device.id);
  };

  const canvasArea = (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <DrawerFloorPlanNavigation activeFloorId={activeFloorId} onSelectFloor={setActiveFloorId} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <FloorPlanViewActionBar
          devices={devices}
          onSelectDevice={handleSelectDevice}
          showLabels={showLabels}
          onToggleShowLabels={setShowLabels}
          showDevices={showDevices}
          onToggleShowDevices={setShowDevices}
          showResidents={showResidents}
          onToggleShowResidents={setShowResidents}
          onZoomIn={() => transformRef.current?.zoomIn()}
          onZoomOut={() => transformRef.current?.zoomOut()}
          onFocusView={() => transformRef.current?.resetTransform()}
          onEdit={goToEditor}
          onExpand={() => setFullscreen((f) => !f)}
          fullscreen={fullscreen}
        />
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <FloorPlanCanvas
            ref={transformRef}
            floorId={activeFloorId}
            zones={zones}
            doors={doors}
            categories={categories}
            devices={devices}
            showLabels={showLabels}
            showDevices={showDevices}
            showDeviceStatusBadges
            draggingDevice={null}
            onDropDeviceOnZone={NOOP}
            onDropDeviceOnDoor={NOOP}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={NOOP}
            firstMergeZoneId={null}
            eligibleZoneIds={eligibleZoneIds}
            onZoneClick={NOOP}
            activeTool={null}
            firstDivideEdge={null}
            wallSegments={wallSegments}
            onWallClick={NOOP}
          />
        </Box>
      </Box>
    </Box>
  );

  if (fullscreen) {
    return (
      <Dialog fullScreen open onClose={() => setFullscreen(false)}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <LocationTopAppBar />
          {canvasArea}
        </Box>
      </Dialog>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{ display: 'flex', height: '100%', minHeight: 500, boxShadow: CHROME_SHADOW, overflow: 'hidden' }}
    >
      {canvasArea}
    </Paper>
  );
}
