import { useState, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import AppBarNgFloorPlan from '../floorplan/components/AppBarNgFloorPlan.jsx';
import DrawerFloorPlanNavigation from '../floorplan/components/DrawerFloorPlanNavigation.jsx';
import ActionBarFloorPlan from '../floorplan/components/ActionBarFloorPlan.jsx';
import DrawerDropDownDrawer from '../floorplan/components/DrawerDropDownDrawer.jsx';
import DeviceMenu from '../floorplan/components/DeviceMenu.jsx';
import ZoneMenu from '../floorplan/components/ZoneMenu.jsx';
import CursorToolIcon from '../floorplan/components/CursorToolIcon.jsx';
import FloorPlanCanvas from '../floorplan/FloorPlanCanvas.jsx';
import { useFloorPlanEditor } from '../floorplan/useFloorPlanEditor.js';
import { useFloorPlanData } from '../floorplan/FloorPlanDataContext.jsx';
import { useDevices } from '../floorplan/useDevices.js';
import { useEditTool } from '../floorplan/useEditTool.js';
import { useEditHistory } from '../floorplan/useEditHistory.js';

/**
 * Mirrors Figma's "Location / FloorPlan - Created - ZonesCollapsed" screen
 * (node 55:89760). The <Container> editorCanvas placeholder image has been
 * replaced with the real native-SVG editable layer, and <Drawer>
 * FloorPlanNavigation now actually switches floors. Merge, Divide, and Add
 * Door are fully implemented; everything else (Add pin, label switches) is
 * rendered for layout fidelity only — not implemented yet.
 *
 * editMode ('zones' | 'devices') is lifted up here, rather than living in
 * either ActionBarFloorPlan or DrawerDropDownDrawer, because it drives both:
 * the ActionBar's own Zones/Devices toggle sets it, and DropDownDrawer reads
 * it to decide which expanded variant (expandedDefault vs expandedSearchable)
 * a click on its collapsed row should open into — see DrawerDropDownDrawer.jsx
 * for that behavior spec.
 *
 * activeTool (useEditTool) is the shared state machine for the four
 * edit-mode tools — see ActionBarFloorPlan.jsx for the full behavior spec.
 * It's lifted up here (rather than living in the ActionBar) because both
 * CursorToolIcon and useFloorPlanEditor need it too: CursorToolIcon is
 * rendered at this top level so its fixed positioning isn't clipped by
 * anything, and useFloorPlanEditor needs it to gate the Merge/Divide
 * gestures (zone/edge clicks only do something while the matching tool is
 * active) and to know when to discard pending gesture state on deactivation.
 *
 * toolSnackbarMessage is shared between Merge's "not adjacent" message and
 * Divide's "wrong zone" message — both render through the same Figma-styled
 * Snackbar (dark background, white text, close button — see nodes 72:99427
 * "wrongMergeSelect" and 72:100165 "wrongDivideNoneadjacent" on the
 * Components page, which share this exact presentation).
 *
 * Undo/redo (see useEditHistory.js) sits at this top level for the same
 * reason activeTool does: it needs to see edits from all of
 * useFloorPlanEditor (zones/doors/categories) and useDevices at once, as one
 * combined history rather than three independent ones.
 */
export default function FloorPlanScreen() {
  const navigate = useNavigate();
  // Set to { seedDevices: false } by CreateFloorPlanWizard's onCreateFloorPlan
  // (LocationTabScreen.jsx) the one time a floor plan is fresh out of the
  // wizard — that flow only ever uploads floor plans/structure, never device
  // data, so this editor should start with zero devices rather than the
  // building's full pre-existing roster. Re-entering later (via the
  // Location-level Floor Plan tab's Edit action) navigates here with no
  // state at all, so the `!== false` check below defaults back to the full
  // roster in every other case, including a plain reload of this route.
  const location = useLocation();
  const seedDevicesEmpty = location.state?.seedDevices === false;
  // Shared with the read-only view (FloorPlanDataContext) so the floor you
  // were looking at is the floor you land on when moving between them.
  const { activeFloorId, setActiveFloorId } = useFloorPlanData();
  const [editMode, setEditMode] = useState('zones');
  // ActionBar's "Show labels"/"Show devices" switches (node 77:100570), both
  // on by default to match that reference. Labels-on swaps each zone's hover
  // tooltip for a persistent name label in the upper third of the zone (see
  // FloorPlanCanvas.jsx); devices-off hides every device marker regardless
  // of editMode, not just the ones relevant to whichever mode is active.
  const [showLabels, setShowLabels] = useState(true);
  const [showDevices, setShowDevices] = useState(true);
  const { activeTool, toggleTool } = useEditTool();
  const {
    zones,
    doors,
    wallSegments,
    firstMergeZoneId,
    eligibleZoneIds,
    handleZoneClick,
    firstDivideEdge,
    handleWallClick,
    deleteZone,
    renameZone,
    setZoneCategory,
    toolSnackbarMessage,
    dismissToolSnackbar,
    categories,
    zonesByCategory,
    renameCategory,
    setCategoryColor,
    reassignCategoryZones,
    deleteCategory,
    addCategory,
    floorsData,
    setFloorsData,
    setCategories,
  } = useFloorPlanEditor(activeFloorId, activeTool);
  const {
    devices,
    renameDevice,
    unpinDevice,
    swapDeviceDoorSide,
    pinDeviceToZone,
    pinDeviceToDoor,
    setDevices,
  } = useDevices(seedDevicesEmpty);

  // Undo/redo (AppBarNgFloorPlan) over every edit in the app — Merge/Divide/
  // Add Door, zone-category CRUD, device pin/rename/etc. — as one combined
  // snapshot, since e.g. reassigning a category and merging zones can both
  // touch overlapping data and shouldn't be undoable independently of each
  // other. `current` needs a stable identity across renders that don't
  // change any of the three (useMemo), since useEditHistory tells "a new
  // edit happened" apart from "this is just a re-render" by reference.
  const current = useMemo(() => ({ floorsData, categories, devices }), [floorsData, categories, devices]);
  const applyRestoredState = useCallback(
    (snapshot) => {
      setFloorsData(snapshot.floorsData);
      setCategories(snapshot.categories);
      setDevices(snapshot.devices);
    },
    [setFloorsData, setCategories, setDevices],
  );
  const { undo, redo, canUndo, canRedo } = useEditHistory(current, applyRestoredState, 5);
  // Which device is mid-drag, lifted here because both ends need it: the
  // drawer sets it, and the canvas reads it to decide which drop targets to
  // offer (a dragover event can't read the drag payload — only a drop can).
  const [draggingDeviceId, setDraggingDeviceId] = useState(null);
  const draggingDevice = devices.find((d) => d.id === draggingDeviceId) ?? null;
  // The device selected by clicking its marker on the floor plan, and the
  // DOM node its menu is anchored to (the marker's own <g>) — see
  // DeviceItemMarker/DeviceMenu. Both clear together: closing the menu (via
  // its own close button, Escape, or a backdrop click) is also what
  // deselects the marker, since there's no reason for one without the other.
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [deviceMenuAnchor, setDeviceMenuAnchor] = useState(null);
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null;
  const closeDeviceMenu = () => {
    setDeviceMenuAnchor(null);
    setSelectedDeviceId(null);
  };

  // Same selection pattern as devices above, but for a zone body click (see
  // ZoneMenu.jsx) — only reachable in plain cursor mode (no tool active);
  // while Merge is active the same click instead drives handleZoneClick's
  // pending-zone gesture, and Divide/Add Door/Add Pin don't respond to a
  // zone-body click at all (only wall clicks), unchanged from before.
  // Positioned at the actual click point (clientX/clientY, from
  // FloorPlanCanvas.jsx), not the zone element itself — a zone is often much
  // bigger than the menu, so anchoring to its element would open the menu at
  // the zone's own corner instead of next to where the user clicked.
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [zoneMenuPosition, setZoneMenuPosition] = useState(null); // { left, top } | null
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  const closeZoneMenu = () => {
    setZoneMenuPosition(null);
    setSelectedZoneId(null);
  };
  // Deleting a zone also deletes every door on it and unpins any device that
  // was pinned to the zone or to one of those doors — the door ids about to
  // disappear have to be read off `doors` *before* calling deleteZone, since
  // deleteZone's own filtering happens inside useFloorPlanEditor, out of
  // reach of the devices roster (see deleteZone's doc comment).
  const handleDeleteZone = useCallback(
    (zoneId) => {
      const doorIdsBeingDeleted = doors.filter((d) => d.zoneA === zoneId || d.zoneB === zoneId).map((d) => d.id);
      deleteZone(zoneId);
      setDevices((prev) =>
        prev.map((d) =>
          d.zoneId === zoneId || doorIdsBeingDeleted.includes(d.doorId)
            ? { ...d, pinned: false, zoneId: null, doorId: null }
            : d,
        ),
      );
    },
    [doors, deleteZone, setDevices],
  );
  const transformRef = useRef(null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', bgcolor: 'background.default' }}>
      <CursorToolIcon activeTool={activeTool} />

      <Snackbar
        open={!!toolSnackbarMessage}
        autoHideDuration={4000}
        onClose={dismissToolSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        message={toolSnackbarMessage}
        action={
          <IconButton size="small" color="inherit" onClick={dismissToolSnackbar} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />

      {/* The floor-plan marker's own click-to-select menu (Figma's "<Menu>
          devices" / "<Menu> instanceRename") — one instance here rather than
          one per marker, anchored to whichever marker's <g> was clicked. */}
      <DeviceMenu
        device={selectedDevice}
        anchorEl={deviceMenuAnchor}
        open={!!deviceMenuAnchor}
        onClose={closeDeviceMenu}
        onCommitRename={renameDevice}
        onUnpin={unpinDevice}
        onSwapDoorSide={swapDeviceDoorSide}
      />

      {/* A zone body's own click-to-select menu (Figma's "<Menu>
          zoneInstance") — one instance here, anchored to whichever zone's
          <path> was clicked. See ZoneMenu.jsx for what's actually wired up. */}
      <ZoneMenu
        zone={selectedZone}
        categories={categories}
        anchorPosition={zoneMenuPosition}
        open={!!zoneMenuPosition}
        onClose={closeZoneMenu}
        onRenameZone={renameZone}
        onChangeCategory={setZoneCategory}
        onAddCategory={addCategory}
        onDeleteZone={handleDeleteZone}
      />

      <AppBarNgFloorPlan
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={() => navigate('/floor-plans')}
        onClose={() => navigate('/floor-plans')}
      />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <DrawerFloorPlanNavigation activeFloorId={activeFloorId} onSelectFloor={setActiveFloorId} />

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ActionBarFloorPlan
              activeTool={activeTool}
              onToggleTool={toggleTool}
              editMode={editMode}
              onSelectEditMode={setEditMode}
              showLabels={showLabels}
              onToggleShowLabels={setShowLabels}
              showDevices={showDevices}
              onToggleShowDevices={setShowDevices}
              devicesCount={devices.length}
              onZoomIn={() => transformRef.current?.zoomIn()}
              onZoomOut={() => transformRef.current?.zoomOut()}
              onFocusView={() => transformRef.current?.resetTransform()}
            />
            <DrawerDropDownDrawer
              editMode={editMode}
              categories={categories}
              zonesByCategory={zonesByCategory}
              onRenameCategory={renameCategory}
              onSetCategoryColor={setCategoryColor}
              onReassignCategoryZones={reassignCategoryZones}
              onDeleteCategory={deleteCategory}
              onAddCategory={addCategory}
              devices={devices}
              onRenameDevice={renameDevice}
              onUnpinDevice={unpinDevice}
              onSwapDeviceDoorSide={swapDeviceDoorSide}
              onDeviceDragStart={setDraggingDeviceId}
              onDeviceDragEnd={() => setDraggingDeviceId(null)}
            />
          </Box>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              // No padding: the canvas fills this entire area, flush against
              // the chrome around it (ActionBar/DropDownDrawer above, nav
              // Drawer to the left). This inset shadow is the depth cue where
              // the raised chrome meets the canvas, instead of an outer margin.
              boxShadow: 'inset 0px 6px 6px -4px rgba(0,0,0,0.15), inset 6px 0px 6px -4px rgba(0,0,0,0.15)',
            }}
          >
            <FloorPlanCanvas
              ref={transformRef}
              floorId={activeFloorId}
              zones={zones}
              doors={doors}
              categories={categories}
              devices={devices}
              showLabels={showLabels}
              showDevices={showDevices}
              draggingDevice={draggingDevice}
              onDropDeviceOnZone={(deviceId, zoneId) => {
                pinDeviceToZone(deviceId, activeFloorId, zoneId);
                setDraggingDeviceId(null);
              }}
              onDropDeviceOnDoor={(deviceId, doorId) => {
                pinDeviceToDoor(deviceId, activeFloorId, doorId);
                setDraggingDeviceId(null);
              }}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={(deviceId, anchorEl) => {
                setSelectedDeviceId(deviceId);
                setDeviceMenuAnchor(anchorEl);
              }}
              firstMergeZoneId={firstMergeZoneId}
              eligibleZoneIds={eligibleZoneIds}
              onZoneClick={(zoneId, clickPosition) => {
                if (activeTool) {
                  handleZoneClick(zoneId);
                  return;
                }
                setSelectedZoneId(zoneId);
                setZoneMenuPosition(clickPosition);
              }}
              activeTool={activeTool}
              firstDivideEdge={firstDivideEdge}
              wallSegments={wallSegments}
              onWallClick={handleWallClick}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
