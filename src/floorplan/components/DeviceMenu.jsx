import { useState, useEffect } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import LocationOffIcon from '@mui/icons-material/LocationOff';
import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import { isAccessUnit } from '../useDevices.js';

const MENU_WIDTH = 256;

/**
 * Figma's "<Menu> devices" (node 58:93447) and its rename state, "<Menu>
 * instanceRename" (node 58:93557) — one component, since the rename state
 * is the same popover with its contents swapped rather than a second menu.
 *
 * The four Figma variants (Default / accessUnit / DefaultUnpinned /
 * accessUnitUnpinned) are derived here rather than passed in: "accessUnit"
 * is just the device's type, and the "…Unpinned" pair only differ by
 * "Unpin from zone" being disabled. Note that per the design "Swap door
 * side" stays enabled on an unpinned Access Unit — it isn't greyed out the
 * way Unpin is.
 *
 * Rename has two homes. On the floor plan, clicking "Rename device" swaps
 * this popover to the instanceRename input in place (that's the flow the
 * design shows). In the drawer, the row itself becomes the text field
 * instead — same interaction as renaming a zone category — so that caller
 * passes onRequestExternalRename and this menu just closes. Both share this
 * one component so the menu's styling and wording stay identical either way.
 *
 * MUI's Menu already renders at elevation 8, whose shadow is exactly the
 * elevation/8 effect the design specifies, so only width/radius need setting.
 */
export default function DeviceMenu({
  device,
  anchorEl,
  open,
  onClose,
  onCommitRename,
  onRequestExternalRename,
  onUnpin,
  onSwapDoorSide,
  anchorOrigin,
  transformOrigin,
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  // Reopening the menu should always start from the action list, never from
  // a half-finished rename left over from last time.
  useEffect(() => {
    if (!open) {
      setRenaming(false);
    } else if (device) {
      setDraftName(device.name);
    }
  }, [open, device]);

  if (!device) return null;

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed) onCommitRename(device.id, trimmed);
    setRenaming(false);
    onClose();
  };

  const cancelRename = () => {
    setDraftName(device.name);
    setRenaming(false);
    onClose();
  };

  const paperWidth = { width: MENU_WIDTH, borderRadius: 1 };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
      slotProps={{ paper: { sx: paperWidth } }}
    >
      {renaming
        ? [
            // A MenuItem wrapper keeps the row's padding identical to the
            // action rows it replaces; disableRipple/disableTouchRipple stop
            // it behaving like a clickable option while it hosts an input.
            <MenuItem key="rename" disableRipple disableTouchRipple sx={{ '&:hover': { bgcolor: 'transparent' } }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  flex: 1,
                  border: '1px solid rgba(0,0,0,0.23)',
                  borderRadius: 1,
                  pl: 1.5,
                  pr: 1.25,
                  py: 0.5,
                }}
              >
                <InputBase
                  autoFocus
                  fullWidth
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    // Menu would otherwise treat typing as type-ahead
                    // navigation and steal the keystrokes.
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  sx={{ fontSize: 16, letterSpacing: '0.15px', '& input': { p: 0 } }}
                />
                <IconButton size="small" onClick={commitRename} aria-label="Save name">
                  <CheckIcon sx={{ fontSize: 20, color: 'action.active' }} />
                </IconButton>
                <IconButton size="small" onClick={cancelRename} aria-label="Discard name">
                  <ClearIcon sx={{ fontSize: 20, color: 'action.active' }} />
                </IconButton>
              </Box>
            </MenuItem>,
          ]
        : [
            <MenuItem
              key="rename"
              onClick={() => {
                if (onRequestExternalRename) {
                  onRequestExternalRename(device.id);
                  onClose();
                } else {
                  setRenaming(true);
                }
              }}
            >
              <ListItemText primaryTypographyProps={{ fontSize: 16, letterSpacing: '0.15px' }}>
                Rename device
              </ListItemText>
            </MenuItem>,

            // Access-Unit-only, and shown enabled even when unpinned, per the
            // accessUnitUnpinned variant.
            isAccessUnit(device) ? (
              <MenuItem
                key="swap"
                disabled={!device.doorId}
                onClick={() => {
                  onSwapDoorSide(device.id);
                  onClose();
                }}
              >
                <ListItemText primaryTypographyProps={{ fontSize: 16, letterSpacing: '0.15px' }}>
                  Swap door side
                </ListItemText>
              </MenuItem>
            ) : null,

            <Divider key="divider" />,

            <MenuItem
              key="unpin"
              disabled={!device.pinned}
              onClick={() => {
                onUnpin(device.id);
                onClose();
              }}
            >
              <ListItemIcon>
                <LocationOffIcon sx={{ fontSize: 20 }} />
              </ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 16, letterSpacing: '0.15px' }}>
                Unpin from zone
              </ListItemText>
            </MenuItem>,
          ].filter(Boolean)}
    </Menu>
  );
}
