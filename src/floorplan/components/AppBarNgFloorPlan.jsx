import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';

// Icon-only outlined buttons, same compact-button shape as
// ActionBarFloorPlan's ToolButton — disabled per Figma's "Saving" variant
// treatment (grey border/icon) reused here for "nothing to undo/redo" rather
// than for an in-flight save, since there's no backend in this prototype to
// actually be saving to.
function HistoryButton({ icon, label, disabled, onClick }) {
  return (
    <Tooltip title={label}>
      <span>
        <Button variant="outlined" color="primary" disabled={disabled} onClick={onClick} sx={{ minWidth: 0, px: 2, py: 0.75 }}>
          {icon}
        </Button>
      </span>
    </Tooltip>
  );
}

/**
 * Matches Figma's "<AppBar> NG Floor Plan" (node 42:66752), Default variant —
 * the "Saving" variant (a loading Save button) isn't implemented since there's
 * no backend for Save to actually talk to.
 *
 * Undo/Redo drive useEditHistory (FloorPlanScreen.jsx), which snapshots
 * floorsData/categories/devices on every edit across the whole app (Merge/
 * Divide/Add Door, zone-category CRUD, device pin/rename/etc.) and keeps 5
 * steps of history in both directions.
 *
 * Save and Close are both real now too — there's still no backend to save
 * *to*, but both leave the editor the same way: back to the Location-level
 * Floor Plan tab (see FloorPlanScreen.jsx), now showing its Created state
 * instead of the empty one, since a floor plan demonstrably exists once
 * you've been in here.
 */
export default function AppBarNgFloorPlan({ onUndo, onRedo, canUndo, canRedo, onSave, onClose }) {
  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: '1px solid rgba(0,0,0,0.12)', zIndex: 2 }}
    >
      <Toolbar sx={{ minHeight: '64px !important', gap: 2 }}>
        <Box sx={{ width: 64, height: 64, ml: -3, bgcolor: 'common.black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ color: 'white', fontWeight: 700, fontSize: 14 }}>2N</Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          My2N
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Floor Plan: Riverside, Prague 4
        </Typography>

        <Box sx={{ flex: 1 }} />

        <Stack direction="row" spacing={2}>
          <HistoryButton icon={<UndoIcon fontSize="small" />} label="Undo" disabled={!canUndo} onClick={onUndo} />
          <HistoryButton icon={<RedoIcon fontSize="small" />} label="Redo" disabled={!canRedo} onClick={onRedo} />
        </Stack>

        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="primary" onClick={onSave}>
            Save
          </Button>
          <Button variant="outlined" color="error" onClick={onClose}>
            Close
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
