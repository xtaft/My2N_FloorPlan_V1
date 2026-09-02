import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import ButtonGroup from '@mui/material/ButtonGroup';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import SensorDoorIcon from '@mui/icons-material/SensorDoor';
import PinDropIcon from '@mui/icons-material/PinDrop';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import CropFreeIcon from '@mui/icons-material/CropFree';
import { CHROME_SHADOW } from '../chromeShadow.js';

// One of the four edit-mode tools (see the big comment below for the full
// behavior spec). variant carries the active/inactive visual — filled
// (contained) when this is the active tool, outlined otherwise — and the
// tooltip shows regardless of active state or breakpoint, per spec.
function ToolButton({ icon, label, description, compact, active, onClick }) {
  const variant = active ? 'contained' : 'outlined';
  const button = compact ? (
    <Button variant={variant} color="primary" onClick={onClick} sx={{ minWidth: 0, px: 2, py: 0.75 }}>
      {icon}
    </Button>
  ) : (
    <Button variant={variant} color="primary" startIcon={icon} onClick={onClick}>
      {label}
    </Button>
  );
  return (
    <Tooltip title={description}>
      <span>{button}</span>
    </Tooltip>
  );
}

// Matches the zoomIn/zoomOut/focus buttons in Figma's ActionBar (Devices
// variant, nodes 72:99928-99930): plain borderless icon buttons, always
// icon-only regardless of viewport width — unlike the tool buttons above,
// these never grow a text label and never have a filled/outlined "active"
// state (they're one-shot view actions, not toggles). No tooltip on hover
// (per instructions) — the label is still exposed as aria-label for
// accessibility.
function ZoomButton({ icon, label, onClick }) {
  return (
    <IconButton size="small" onClick={onClick} aria-label={label} sx={{ color: 'primary.main' }}>
      {icon}
    </IconButton>
  );
}

const TOOL_DESCRIPTIONS = {
  merge: 'Select two adjacent spaces to merge them into one.',
  divide: 'Click one edge, then another, to draw a dividing line between them.',
  addDoor: 'Click an edge to add a door there.',
  addPin: 'Drop a pin on the floor plan',
};

/**
 * Matches Figma's "ActionBar Floor Plan" component. It has two independent
 * variables, giving four variants (zones/zonesCollapsed/devices/
 * devicesCollapsed) — mode picks the pair, width picks which one of the pair
 * is shown:
 *  - Edit mode, set by the Zones/Devices option button below: which pair.
 *  - Viewport width: < 1700px renders the "*Collapsed" of the pair (node
 *    54:86845 for Zones) — icon-only action buttons; >= 1700px renders the
 *    full one (node 44:77993 for Zones) — icon + text label buttons. The
 *    "show actions" switches (node 77:100570, "Show labels"/"Show devices")
 *    don't change between these — only the tool buttons to their left do.
 *
 * editMode/onSelectEditMode is lifted up to FloorPlanScreen since
 * DrawerDropDownDrawer needs it too (it decides which expanded variant a
 * click on the collapsed drawer opens into). Only the mode itself is wired
 * here — the actual Devices-mode tool buttons aren't designed yet, so the
 * Merge/Divide/Add door/Add pin cluster below doesn't change per mode.
 *
 * Edit-mode tools (Merge, Divide, Add Door, Add Pin) — behavior spec:
 *  - One shared activeTool state (see useEditTool.js): activating a tool
 *    replaces whatever was active; there's one path back to null (plain
 *    selection mode) — clicking the active tool again, activating a
 *    different one, or Escape (handled globally in useEditTool).
 *  - Deactivating mid-gesture silently discards whatever was in progress —
 *    no confirmation, no snackbar. (No per-tool gesture state exists yet
 *    since the actions themselves aren't implemented — see below.)
 *  - Visual state is the only indicator needed: active tool renders filled
 *    (contained), inactive tools render outlined. No separate cursor
 *    treatment beyond CursorToolIcon.jsx.
 *  - Tooltip always shows on hover (active or not), for all four — unlike
 *    before, where label/full mode had no tooltip at all.
 *  - The Zoom In/Out/Focus cluster (bare icons, no fill/outline) never
 *    touches this state: clicking them leaves the active tool and any
 *    pending selection untouched. They already don't call onToggleTool, so
 *    this holds without extra wiring.
 *
 * Merge, Divide, and Add Door are now fully implemented (see
 * useFloorPlanEditor.js): Merge drives the click-first-zone / click-adjacent-
 * second-zone / merge-or-snackbar gesture; Divide and Add Door both drive
 * click-an-edge gestures sharing the same hover-highlight overlay
 * (FloorPlanCanvas.jsx) — Divide waits for a second edge on the same zone to
 * split it, Add Door creates a door immediately on a single click if the
 * edge borders two zones. All pending/highlighted state lives on the canvas
 * itself — no toolbar-level indicator (like a selection-count badge) is
 * needed for any of them. Add Pin remains a pure toggle with no gesture
 * wired up yet.
 *
 * flex: 1 fills the row up to DropDownDrawer — no gap between them.
 *
 * The scrollable inner Box (minWidth: 0 + overflowX: 'auto') guards the
 * narrow-window case: flex items default to `min-width: auto`, which would
 * otherwise refuse to shrink below their own content's natural width — on a
 * narrow-enough window that's wider than the compact content but narrower
 * than compact-content + the fixed 360px DropDownDrawer, that pushed the
 * drawer off the right edge of the screen entirely instead of this content
 * just getting tighter. Now it shrinks properly and, only if a window is
 * too narrow even for the compact icon-only content, scrolls internally
 * instead of blowing out the page's own width. This scrolling lives on an
 * *inner* Box rather than the outer Paper itself: `overflow` other than
 * `visible` clips that same element's own box-shadow in every browser, so
 * putting it on the Paper that also carries CHROME_SHADOW silently clipped
 * the shadow away to nothing.
 *
 * boxShadow (not `elevation`) + position/zIndex on the outer Paper: the
 * shadow matches DrawerFloorPlanNavigation and DrawerDropDownDrawer's
 * header in offset/blur/color (keep CHROME_SHADOW in sync across all three
 * if it changes) — together they should read as clearly raised above the
 * recessed canvas. It's layered (three shadows of increasing spread/
 * decreasing opacity, mimicking Material's own umbra/penumbra/ambient
 * layers) rather than a single flat one, which reads as a much more
 * convincing "elevated" surface than one hard-edged shadow. Each layer's
 * offset equals its own blur radius, so — since this Paper sits immediately
 * right of DrawerFloorPlanNavigation (DOM-earlier, so its own shadow would
 * otherwise be painted over, i.e. visible, since this Paper paints later/on
 * top) and immediately left of DrawerDropDownDrawer's header — none of the
 * three layers can cross back past this Paper's own left edge onto either
 * neighbor. But the *downward* shadow, onto the canvas below, needs
 * `position: relative` + a `zIndex` above the (unpositioned) canvas to even
 * be visible at all: canvas is a later sibling in the DOM (nested inside
 * the same column, after this header row), so without an explicit stacking
 * order it paints over this Paper's shadow rather than receiving it.
 */
export default function ActionBarFloorPlan({
  activeTool,
  onToggleTool,
  editMode,
  onSelectEditMode,
  showLabels,
  onToggleShowLabels,
  showDevices,
  onToggleShowDevices,
  devicesCount,
  onZoomIn,
  onZoomOut,
  onFocusView,
}) {
  const compact = !useMediaQuery('(min-width:1700px)');

  return (
    <Paper
      elevation={0}
      square
      sx={{
        height: 64,
        flex: 1,
        minWidth: 0,
        position: 'relative',
        zIndex: 1,
        boxShadow: CHROME_SHADOW,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: '100%',
          px: 4,
          minWidth: 0,
          overflowX: 'auto',
        }}
      >
        <ButtonGroup variant="contained" disableElevation>
          <Button
            variant={editMode === 'zones' ? 'contained' : 'outlined'}
            color="primary"
            onClick={() => onSelectEditMode('zones')}
          >
            Zones
          </Button>
          <Button
            variant={editMode === 'devices' ? 'contained' : 'outlined'}
            color="primary"
            onClick={() => onSelectEditMode('devices')}
          >
            Devices
          </Button>
        </ButtonGroup>

        <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToolButton
            icon={<CallMergeIcon fontSize="small" />}
            label="Merge"
            description={TOOL_DESCRIPTIONS.merge}
            compact={compact}
            active={activeTool === 'merge'}
            onClick={() => onToggleTool('merge')}
          />
          <ToolButton
            icon={<ContentCutIcon fontSize="small" />}
            label="Divide"
            description={TOOL_DESCRIPTIONS.divide}
            compact={compact}
            active={activeTool === 'divide'}
            onClick={() => onToggleTool('divide')}
          />
          <ToolButton
            icon={<SensorDoorIcon fontSize="small" />}
            label="Add door"
            description={TOOL_DESCRIPTIONS.addDoor}
            compact={compact}
            active={activeTool === 'addDoor'}
            onClick={() => onToggleTool('addDoor')}
          />
          <ToolButton
            icon={<PinDropIcon fontSize="small" />}
            label="Add pin"
            description={TOOL_DESCRIPTIONS.addPin}
            compact={compact}
            active={activeTool === 'addPin'}
            onClick={() => onToggleTool('addPin')}
          />
        </Box>

        <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch
              size="small"
              checked={showLabels}
              onChange={(e) => onToggleShowLabels(e.target.checked)}
            />
            <Typography variant="body2" color="text.disabled">
              Show labels
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch
              size="small"
              checked={showDevices}
              disabled={devicesCount === 0}
              onChange={(e) => onToggleShowDevices(e.target.checked)}
            />
            <Typography variant="body2" color="text.disabled">
              Show devices
            </Typography>
          </Box>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <ZoomButton icon={<RemoveIcon fontSize="small" />} label="Zoom out" onClick={onZoomOut} />
          <ZoomButton icon={<AddIcon fontSize="small" />} label="Zoom in" onClick={onZoomIn} />
          <ZoomButton icon={<CropFreeIcon fontSize="small" />} label="Focus" onClick={onFocusView} />
        </Box>
      </Box>
    </Paper>
  );
}
