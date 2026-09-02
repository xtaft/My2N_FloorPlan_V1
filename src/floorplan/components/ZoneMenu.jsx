import { useState, useEffect } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { getZoneDisplayName } from '../formatNames.js';

// Fixed regardless of which of the three views below is showing — Figma's
// "<Menu> zoneInstance" (58:93555), "<Menu> instanceRename" (58:93557, shared
// with DeviceMenu's rename state) and "<Menu> zoneCategories" (58:93559,
// Default/zoneCategoriesNew) are all this same 256px width.
const MENU_WIDTH = 256;

// No icon to anchor to (a zone is often much bigger than the menu) — see
// FloorPlanCanvas.jsx/FloorPlanScreen.jsx: anchored to the actual click
// point instead, with the menu's own top-left corner placed right there.
const MENU_ANCHOR_ORIGIN = { vertical: 'top', horizontal: 'left' };
const MENU_TRANSFORM_ORIGIN = { vertical: 'top', horizontal: 'left' };

/**
 * A zone's click-to-select options menu on the canvas (mirrors DeviceMenu's
 * role for device markers). Three views share one fixed-width popover rather
 * than each being its own popup, per Figma:
 *  - 'options' — Rename / Change category / divider / Delete (58:93555).
 *  - 'rename' — swaps to the same instanceRename input row DeviceMenu uses
 *    for devices (58:93557): one InputBase + Check/Clear icon buttons.
 *  - 'category' — swaps to <Menu> zoneCategories (58:93559): a search field
 *    plus every category as a swatch+name row (Default, 58:93558). Typing a
 *    search that matches nothing swaps the list portion to the
 *    zoneCategoriesNew variant (58:93700) — a single "+ {search text}" row
 *    that creates a brand new category (random palette color, same as
 *    DrawerDropDownDrawer's "Add category") named after the search and
 *    assigns it to this zone in one action.
 *
 * Committing any of the three (rename/pick a category/create a category) or
 * confirming Delete all close the whole popover rather than returning to
 * 'options' — same one-shot convention DeviceMenu's rename already uses.
 * Reopening always starts fresh at 'options' (the effect below), never a
 * half-finished rename/search left over from last time.
 */
export default function ZoneMenu({
  zone,
  categories,
  anchorPosition,
  open,
  onClose,
  onRenameZone,
  onChangeCategory,
  onAddCategory,
  onDeleteZone,
}) {
  const [view, setView] = useState('options'); // 'options' | 'rename' | 'category'
  const [draftName, setDraftName] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null); // { id, name } | null

  useEffect(() => {
    if (!open) {
      setView('options');
      setCategorySearch('');
    } else if (zone) {
      setDraftName(getZoneDisplayName(zone));
    }
  }, [open, zone]);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (zone && trimmed) onRenameZone(zone.id, trimmed);
    onClose();
  };

  const trimmedSearch = categorySearch.trim();
  const matchingCategories = (categories ?? []).filter((c) =>
    c.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
  );
  const showAddNewCategory = trimmedSearch.length > 0 && matchingCategories.length === 0;

  const selectCategory = (categoryId) => {
    if (zone) onChangeCategory(zone.id, categoryId);
    onClose();
  };

  const createAndSelectCategory = () => {
    if (!zone) return;
    const newCategoryId = onAddCategory(trimmedSearch);
    onChangeCategory(zone.id, newCategoryId);
    onClose();
  };

  // Shared "bordered box with an input inside" look for both the rename
  // field and the category search field — same styling DeviceMenu's rename
  // row already established.
  const inputBoxSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    flex: 1,
    border: '1px solid rgba(0,0,0,0.23)',
    borderRadius: 1,
    pl: 1.5,
    pr: 1.25,
    py: 0.5,
  };
  const inputSx = { fontSize: 16, letterSpacing: '0.15px', '& input': { p: 0 } };

  let menuContent;
  if (view === 'rename') {
    menuContent = [
      <MenuItem key="rename" disableRipple disableTouchRipple sx={{ '&:hover': { bgcolor: 'transparent' } }}>
        <Box sx={inputBoxSx}>
          <InputBase
            autoFocus
            fullWidth
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              // Menu would otherwise treat typing as type-ahead navigation
              // and steal the keystrokes.
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') onClose();
            }}
            sx={inputSx}
          />
          <IconButton size="small" onClick={commitRename} aria-label="Save name">
            <CheckIcon sx={{ fontSize: 20, color: 'action.active' }} />
          </IconButton>
          <IconButton size="small" onClick={onClose} aria-label="Discard name">
            <ClearIcon sx={{ fontSize: 20, color: 'action.active' }} />
          </IconButton>
        </Box>
      </MenuItem>,
    ];
  } else if (view === 'category') {
    const searchRow = (
      <MenuItem key="search" disableRipple disableTouchRipple sx={{ '&:hover': { bgcolor: 'transparent' } }}>
        <Box sx={inputBoxSx}>
          <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          <InputBase
            autoFocus
            fullWidth
            placeholder="Search"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            sx={inputSx}
          />
        </Box>
      </MenuItem>
    );
    const listRows = showAddNewCategory
      ? [
          <MenuItem key="add-new" onClick={createAndSelectCategory}>
            <ListItemIcon>
              <AddIcon sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 16, letterSpacing: '0.15px' }}>
              {trimmedSearch}
            </ListItemText>
          </MenuItem>,
        ]
      : matchingCategories.map((c) => (
          <MenuItem key={c.id} onClick={() => selectCategory(c.id)}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '2px',
                  bgcolor: c.color,
                  border: '1px solid #cfd8dc',
                  flexShrink: 0,
                }}
              />
              <ListItemText primaryTypographyProps={{ fontSize: 16, letterSpacing: '0.15px' }}>
                {c.name}
              </ListItemText>
            </Box>
          </MenuItem>
        ));
    menuContent = [searchRow, ...listRows];
  } else {
    menuContent = [
      <MenuItem key="rename" onClick={() => setView('rename')}>
        Rename
      </MenuItem>,
      <MenuItem key="category" onClick={() => setView('category')}>
        Change category
      </MenuItem>,
      <Divider key="divider" />,
      <MenuItem
        key="delete"
        onClick={() => {
          setPendingDelete({ id: zone.id, name: getZoneDisplayName(zone) });
          onClose();
        }}
      >
        <ListItemIcon>
          <DeleteIcon fontSize="small" color="error" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ color: 'error' }}>Delete</ListItemText>
      </MenuItem>,
    ];
  }

  return (
    <>
      {zone && (
        <Menu
          anchorReference="anchorPosition"
          anchorPosition={anchorPosition}
          open={open}
          onClose={onClose}
          anchorOrigin={MENU_ANCHOR_ORIGIN}
          transformOrigin={MENU_TRANSFORM_ORIGIN}
          slotProps={{ paper: { sx: { width: MENU_WIDTH, borderRadius: 1 } } }}
        >
          {menuContent}
        </Menu>
      )}

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete {pendingDelete?.name}</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to delete this zone?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              onDeleteZone(pendingDelete.id);
              setPendingDelete(null);
            }}
          >
            Delete zone
          </Button>
          <Button variant="contained" color="primary" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
