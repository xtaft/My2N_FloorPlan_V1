import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import CropFreeIcon from '@mui/icons-material/CropFree';
import EditIcon from '@mui/icons-material/Edit';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import { CHROME_SHADOW } from '../floorplan/chromeShadow.js';

/**
 * Matches Figma's "<ActionBarFloorPlan> viewMode" (node 104:105655) — the
 * read-only counterpart of the real editor's ActionBarFloorPlan
 * (floorplan/components/ActionBarFloorPlan.jsx), used by
 * FloorPlanCreatedContent.jsx. Same chrome shadow, same zoom-button styling,
 * but no edit tools (Merge/Divide/Add Door/Add Pin, the Zones/Devices mode
 * switch) — those don't make sense on a view-only preview. In their place: a
 * device search (typing filters `devices` down to pinned ones by name;
 * picking one calls onSelectDevice(device) — FloorPlanCreatedContent uses
 * that to switch floors and highlight the marker, all still read-only) and
 * the three "show" switches (Zone labels/Devices/Residents — "Residents"
 * has no overlay to control yet, since this prototype has no resident data
 * model at all; it's present for visual fidelity only, same "not
 * implemented yet" status as elsewhere in this app).
 *
 * Trailing actions are two distinct controls, not one: "Edit" opens the real
 * editor directly (onEdit, navigates to /floor-plan with the full device
 * roster available); the fullscreen icon toggles FloorPlanCreatedContent's
 * own fullscreen preview Dialog instead (onExpand) — leaving this screen vs.
 * not are different enough actions that collapsing them into one button
 * would be surprising either way. This same ActionBar renders inside that
 * Dialog too (FloorPlanCreatedContent's canvasArea is shared, not
 * duplicated), so `fullscreen` swaps the icon to "collapse" and its own
 * onExpand call closes the dialog rather than opening a second one.
 */
export default function FloorPlanViewActionBar({
  devices = [],
  onSelectDevice,
  showLabels,
  onToggleShowLabels,
  showDevices,
  onToggleShowDevices,
  showResidents,
  onToggleShowResidents,
  onZoomIn,
  onZoomOut,
  onFocusView,
  onEdit,
  onExpand,
  fullscreen = false,
}) {
  // Remounts the Autocomplete after a pick so it clears back to an empty,
  // unselected search box — this is a "jump to" action, not a persistent
  // filter, so leaving the picked device's name sitting in the field would
  // be misleading (nothing on screen stays filtered to it).
  const [searchKey, setSearchKey] = useState(0);
  const searchableDevices = devices.filter((d) => d.pinned);

  return (
    <Box
      sx={{
        height: 64,
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
        boxShadow: CHROME_SHADOW,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        px: 3,
      }}
    >
      <Autocomplete
        key={searchKey}
        options={searchableDevices}
        getOptionLabel={(device) => device.name}
        onChange={(_event, device) => {
          if (!device) return;
          onSelectDevice?.(device);
          setSearchKey((k) => k + 1);
        }}
        blurOnSelect
        clearOnBlur
        sx={{ width: 320, flexShrink: 0 }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Search devices"
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1, fontSize: 16 } }}
            InputProps={{
              ...params.InputProps,
              startAdornment: <SearchIcon sx={{ fontSize: 20, color: 'text.secondary', ml: 0.5 }} />,
            }}
          />
        )}
      />

      <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch size="small" checked={showLabels} onChange={(e) => onToggleShowLabels(e.target.checked)} />
          <Typography variant="body2" color="text.disabled">
            Zone labels
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch size="small" checked={showDevices} onChange={(e) => onToggleShowDevices(e.target.checked)} />
          <Typography variant="body2" color="text.disabled">
            Devices
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch size="small" checked={showResidents} onChange={(e) => onToggleShowResidents(e.target.checked)} />
          <Typography variant="body2" color="text.disabled">
            Residents
          </Typography>
        </Box>
      </Box>

      <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <IconButton size="small" onClick={onZoomOut} aria-label="Zoom out" sx={{ color: 'primary.main' }}>
          <RemoveIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onZoomIn} aria-label="Zoom in" sx={{ color: 'primary.main' }}>
          <AddIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onFocusView} aria-label="Focus" sx={{ color: 'primary.main' }}>
          <CropFreeIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1 }} />

      <Button variant="outlined" color="primary" startIcon={<EditIcon fontSize="small" />} onClick={onEdit}>
        Edit
      </Button>
      <Button
        variant="outlined"
        color="primary"
        onClick={onExpand}
        aria-label={fullscreen ? 'Close fullscreen' : 'Open fullscreen'}
        sx={{ minWidth: 0, px: 2, py: 0.75 }}
      >
        {fullscreen ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
      </Button>
    </Box>
  );
}
