import { useState, useRef, useLayoutEffect } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DeviceIcon from './DeviceIcon.jsx';
import DeviceMenu from './DeviceMenu.jsx';
import { COLOR_ITEM_PALETTE } from '../categories.js';
import { formatDeviceFloorLabel } from '../devices.js';
import { useFilteredDevices } from '../useDevices.js';
import { CHROME_SHADOW } from '../chromeShadow.js';

const DRAWER_WIDTH = 360;
// Bigger/stronger than CHROME_SHADOW — this panel floats further above the
// canvas than the flat header row, so it should read as more elevated.
// Negative offsetX (left) rather than positive: this panel is pinned to the
// viewport's right edge (`right: 0`), so a rightward shadow has no visible
// screen space to fall on — it was rendering entirely off-screen. Left is
// the only edge that borders anything visible (the canvas). Each layer's
// offsetY still equals its own blur radius, same zero-bleed reasoning as
// CHROME_SHADOW, so it can't creep upward past this panel's own top edge
// onto the header/ActionBar above it.
const EXPANDED_PANEL_SHADOW = [
  '-8px 8px 8px rgba(0,0,0,0.3)',
  '-16px 16px 16px rgba(0,0,0,0.18)',
  '-24px 24px 24px rgba(0,0,0,0.1)',
].join(', ');

// Both the per-row options menu and the "Reassign all" target-picker menu
// are Figma's same reusable "<Menu> zoneCategories" component, just
// populated with different items (actions vs. other categories) — see
// ZoneCategoriesContent's doc comment. This is the shared anchor/transform
// origin pair for all of them: menu's top-right corner aligned to the
// clicked icon's bottom-left corner.
const MENU_ANCHOR_ORIGIN = { vertical: 'bottom', horizontal: 'left' };
const MENU_TRANSFORM_ORIGIN = { vertical: 'top', horizontal: 'right' };

// One category row: either its normal display state (DropDownDrawerItem —
// swatch, name, a small Chip counting zones currently in it, options-menu
// icon) or, while renaming/just-added, its inline edit state
// (DropDownItemEdit — a text field with save/discard icons). The options
// menu matches Figma's "<Menu> zoneCategories" (node 58:93486) exactly:
// "Rename category" (not just "Rename"), a divider before Delete, and
// Delete itself in error red with a trash icon — Change color/Reassign all
// stay plain since Figma doesn't give them icons either.
// `editing` starts from `startInEditMode` (true only for a just-added
// category) but is otherwise fully self-managed from then on — Rename (from
// the options menu below) flips it on, Save/Discard/click-away flip it off.
function CategoryRow({
  category,
  categories,
  zoneCount,
  startInEditMode,
  onRename,
  onSetColor,
  onReassign,
  onDelete,
}) {
  const hasZones = zoneCount > 0;
  const [editing, setEditing] = useState(startInEditMode);
  const [draftName, setDraftName] = useState(category.name);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [colorMenuAnchor, setColorMenuAnchor] = useState(null);
  const [reassignMenuAnchor, setReassignMenuAnchor] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const customColorInputRef = useRef(null);

  const saveEdit = () => {
    const trimmed = draftName.trim();
    if (trimmed) onRename(category.id, trimmed);
    else setDraftName(category.name); // empty name: revert the draft, don't commit it
    setEditing(false);
  };
  const discardEdit = () => {
    setDraftName(category.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <ClickAwayListener onClickAway={discardEdit}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') discardEdit();
            }}
          />
          <IconButton size="small" onClick={saveEdit} aria-label="Save name">
            <CheckIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={discardEdit} aria-label="Discard name">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </ClickAwayListener>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
        <Box sx={{ width: 24, height: 24, borderRadius: '2px', bgcolor: category.color, border: '1px solid #cfd8dc', flexShrink: 0 }} />
        <Typography variant="body1" color="text.primary" noWrap>
          {category.name}
        </Typography>
        {/* Small label — count of zones currently assigned to this category. */}
        <Chip size="small" label={zoneCount} sx={{ height: 20, fontSize: 12, flexShrink: 0 }} />
      </Box>

      <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Category actions">
        <MoreVertIcon fontSize="small" />
      </IconButton>

      {/* Figma's "<Menu> zoneCategories" (node 58:93486). */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={MENU_ANCHOR_ORIGIN}
        transformOrigin={MENU_TRANSFORM_ORIGIN}
      >
        <MenuItem
          onClick={() => {
            setEditing(true);
            setMenuAnchor(null);
          }}
        >
          Rename category
        </MenuItem>
        <MenuItem
          onClick={() => {
            setColorMenuAnchor(menuAnchor);
            setMenuAnchor(null);
          }}
        >
          Change color
        </MenuItem>
        <MenuItem
          onClick={() => {
            setReassignMenuAnchor(menuAnchor);
            setMenuAnchor(null);
          }}
        >
          Reassign all
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={category.protected}
          onClick={() => {
            setMenuAnchor(null);
            if (hasZones) setConfirmDeleteOpen(true);
            else onDelete(category.id);
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color={category.protected ? undefined : 'error'} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ color: category.protected ? undefined : 'error' }}>
            Delete
          </ListItemText>
        </MenuItem>
      </Menu>

      {/* <Menu> zoneColors: preset swatches from the colorItem palette, plus a
          custom color option. Selecting any color applies it immediately and
          closes the menu — no separate confirm step. */}
      <Menu
        anchorEl={colorMenuAnchor}
        open={!!colorMenuAnchor}
        onClose={() => setColorMenuAnchor(null)}
        anchorOrigin={MENU_ANCHOR_ORIGIN}
        transformOrigin={MENU_TRANSFORM_ORIGIN}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, p: 1.5, width: 216 }}>
          {COLOR_ITEM_PALETTE.map((swatch) => (
            <Box
              key={swatch.id}
              role="button"
              aria-label={swatch.name}
              title={swatch.name}
              onClick={() => {
                onSetColor(category.id, swatch.hex);
                setColorMenuAnchor(null);
              }}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: swatch.hex,
                cursor: 'pointer',
                border: swatch.hex === category.color ? '2px solid #000' : '1px solid rgba(0,0,0,0.2)',
              }}
            />
          ))}
        </Box>
        <MenuItem onClick={() => customColorInputRef.current?.click()}>Custom color…</MenuItem>
        <input
          ref={customColorInputRef}
          type="color"
          value={category.color}
          onChange={(e) => {
            onSetColor(category.id, e.target.value);
            setColorMenuAnchor(null);
          }}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        />
      </Menu>

      {/* <Menu> zoneCategories, reused here listing only the OTHER existing
          categories as reassignment targets. */}
      <Menu
        anchorEl={reassignMenuAnchor}
        open={!!reassignMenuAnchor}
        onClose={() => setReassignMenuAnchor(null)}
        anchorOrigin={MENU_ANCHOR_ORIGIN}
        transformOrigin={MENU_TRANSFORM_ORIGIN}
      >
        {categories
          .filter((c) => c.id !== category.id)
          .map((c) => (
            <MenuItem
              key={c.id}
              onClick={() => {
                onReassign(category.id, c.id);
                setReassignMenuAnchor(null);
              }}
            >
              {c.name}
            </MenuItem>
          ))}
      </Menu>

      {/* <Dialog> DeleteCategory — only shown when the category actually has
          zones assigned; an empty category is deleted immediately above with
          no confirmation. */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle>Delete "{category.name}"?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Every zone currently in "{category.name}" will be reassigned to Unknown. This can't be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              onDelete(category.id);
              setConfirmDeleteOpen(false);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Matches Figma's ExpandedDefault content (node 44:78251): one row per zone
// category, color swatch + name + an options-menu action, plus an "Add
// category" button. Each row's options menu opens Figma's "<Menu>
// zoneCategories" (Rename / Change color / Reassign all / Delete) — the same
// component is reused, populated with a plain list of category names
// instead, for the Reassign-all target picker. Hallways/Stairs/Elevators/
// Unknown are permanently protected (see categories.js): their Delete option
// is disabled rather than hidden, so the restriction reads as deliberate
// rather than the option just being missing.
function ZoneCategoriesContent({
  categories,
  zonesByCategory,
  onRenameCategory,
  onSetCategoryColor,
  onReassignCategoryZones,
  onDeleteCategory,
  onAddCategory,
}) {
  const [justAddedCategoryId, setJustAddedCategoryId] = useState(null);

  return (
    <>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            categories={categories}
            zoneCount={zonesByCategory.get(category.id) ?? 0}
            startInEditMode={category.id === justAddedCategoryId}
            onRename={onRenameCategory}
            onSetColor={onSetCategoryColor}
            onReassign={onReassignCategoryZones}
            onDelete={onDeleteCategory}
          />
        ))}
      </Box>
      <Box sx={{ p: 3 }}>
        <Button
          variant="outlined"
          color="primary"
          fullWidth
          endIcon={<AddIcon fontSize="small" />}
          onClick={() => setJustAddedCategoryId(onAddCategory())}
        >
          Add zone type
        </Button>
      </Box>
    </>
  );
}

// One device row: its normal display state, or the same inline text-field
// edit state a category row uses for Rename (tick commits, cross or
// click-away reverts). The options menu's contents are gated per spec:
// Unpin only does anything for a currently-pinned device, and Swap door
// side is Access-Unit-only — both are shown-but-disabled rather than hidden
// when they don't apply, matching how a protected category's Delete reads.
function DeviceRow({ device, onRename, onUnpin, onSwapDoorSide, onDragStart, onDragEnd }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const saveEdit = () => {
    const trimmed = draftName.trim();
    if (trimmed) onRename(device.id, trimmed);
    else setDraftName(device.name); // empty name: revert the draft, don't commit it
    setEditing(false);
  };
  const discardEdit = () => {
    setDraftName(device.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <ClickAwayListener onClickAway={discardEdit}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') discardEdit();
            }}
          />
          <IconButton size="small" onClick={saveEdit} aria-label="Save name">
            <CheckIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={discardEdit} aria-label="Discard name">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </ClickAwayListener>
    );
  }

  return (
    <Box
      // Only unpinned devices are draggable — a pinned one is already placed,
      // and Unpin is the way back out of that.
      draggable={!device.pinned}
      onDragStart={
        device.pinned
          ? undefined
          : (e) => {
              e.dataTransfer.effectAllowed = 'move';
              // The payload is only readable on drop, not during dragover,
              // so the canvas also needs to know what's in flight up front —
              // that's what onDragStart lifts into shared state.
              e.dataTransfer.setData('text/plain', device.id);
              onDragStart(device.id);
            }
      }
      onDragEnd={device.pinned ? undefined : onDragEnd}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        py: 0.75,
        cursor: device.pinned ? 'default' : 'grab',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
        {/* DeviceIcon is a plain <svg> (see deviceIcons.js), not a MUI
            SvgIcon, so it takes its colour by inheritance from this Box
            rather than through sx of its own. */}
        <Box
          sx={{ display: 'flex', flexShrink: 0, color: device.pinned ? 'primary.main' : 'action.active' }}
        >
          <DeviceIcon type={device.type} size={22} />
        </Box>
        {/* gap: '4px' (not MUI's spacing scale) — the name and the
            placement label below it need exactly 4px between them, not the
            8px `gap: 0.5` would give. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <Typography variant="body1" color="text.primary" noWrap>
            {device.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {device.pinned ? formatDeviceFloorLabel(device.floorId) : 'Not placed'}
          </Typography>
        </Box>
      </Box>

      <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Device actions">
        <MoreVertIcon fontSize="small" />
      </IconButton>

      {/* Figma's "<Menu> devices" (see DeviceMenu.jsx) — the drawer row's
          own Rename interaction (swap the row to a text field) isn't the
          menu's built-in one (swap the menu to a text field), so this
          passes onRequestExternalRename instead of letting the menu handle
          it internally. */}
      <DeviceMenu
        device={device}
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={MENU_ANCHOR_ORIGIN}
        transformOrigin={MENU_TRANSFORM_ORIGIN}
        onRequestExternalRename={() => setEditing(true)}
        onUnpin={onUnpin}
        onSwapDoorSide={onSwapDoorSide}
      />
    </Box>
  );
}

// Figma's ExpandedSearchable variant (node 50:81777) — the searchable device
// roster. Lists every device across every floor (not just the active one),
// scrollable since the full roster is long, filtered by the search box, with
// unpinned ("not placed yet") devices sorted ahead of pinned ones.
function DropdownDevicesContent({
  devices,
  onRenameDevice,
  onUnpinDevice,
  onSwapDeviceDoorSide,
  onDeviceDragStart,
  onDeviceDragEnd,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const visibleDevices = useFilteredDevices(devices, searchQuery);

  // A freshly-created floor plan (CreateFloorPlanWizard only ever uploads
  // floor plans/structure, never device data — see useDevices.js's
  // seedEmpty) genuinely has zero devices, not just zero matching the
  // current search — worth its own empty state rather than a search box
  // over an list that can't ever return anything. Same copy as the
  // Location-level Devices tab's empty state (LocationTabScreen.jsx) for
  // the same "no devices" condition, just phrased for this compact drawer.
  if (devices.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No devices yet
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
          Connect devices to manage the building
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ px: 3, pt: 1, pb: 1 }}>
        <TextField
          placeholder="Search devices"
          size="small"
          fullWidth
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, pb: 3 }}>
        {visibleDevices.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 4, textAlign: 'center' }}>
            No devices match "{searchQuery}"
          </Typography>
        ) : (
          visibleDevices.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              onRename={onRenameDevice}
              onUnpin={onUnpinDevice}
              onSwapDoorSide={onSwapDeviceDoorSide}
              onDragStart={onDeviceDragStart}
              onDragEnd={onDeviceDragEnd}
            />
          ))
        )}
      </Box>
    </>
  );
}

/**
 * Matches Figma's "<Drawer> DropDownDrawer" (node 44:78238), which has three
 * variants: Collapsed (50:81692), ExpandedDefault (44:78251), and
 * ExpandedSearchable (50:81777).
 *
 * Expand/collapse is a single toggle: clicking the header row (collapsed or
 * expanded) flips `expanded`, which starts open (see below). Which expanded
 * variant it shows is *derived* from `editMode` rather than stored —
 * zonesCollapsed opens into expandedDefault (the real zone-categories list),
 * devicesCollapsed opens into expandedSearchable (dropdownDevicesContent).
 * Deriving instead of storing means switching edit mode while the drawer is
 * already open just swaps its content in place, instead of leaving a stale
 * variant showing — and, since it starts open, both modes land on their
 * respective panel already visible.
 *
 * Categories themselves (rename/recolor/reassign/delete/add) are owned by
 * useFloorPlanEditor.js and passed down as plain data + callbacks — see
 * ZoneCategoriesContent's doc comment for the actual editing behavior.
 *
 * boxShadow (not `elevation`) on the header row Paper: same offset/blur/
 * color as ActionBarFloorPlan and DrawerFloorPlanNavigation's CHROME_SHADOW
 * — all three chrome pieces read at one raised level. This header is
 * DOM-later than (and sits immediately right of) ActionBarFloorPlan, so a
 * symmetric `elevation` shadow's leftward reach painted visibly on top of
 * it; biasing right/down by exactly the blur radius keeps it from ever
 * crossing back over this Paper's own left edge. `position: relative` +
 * `zIndex: 1` make the *downward* half of that shadow visible at all: the
 * canvas below is a later DOM sibling (nested in the same column, after
 * this whole row), so without an explicit stacking order it paints over
 * this shadow rather than receiving it — same reasoning as
 * DrawerFloorPlanNavigation.jsx.
 *
 * The header's shadow only applies while collapsed, though: once expanded,
 * directly below it is this component's own floating panel, not the
 * canvas — that panel already carries its own (bigger) shadow, so the
 * header casting a second, separate downward shadow onto the panel's own
 * top edge just looked like a stray seam. Collapsing back removes the
 * panel and restores the header's normal shadow onto the canvas again.
 *
 * The expanded content panel below that header is a different story — it
 * genuinely floats over the canvas, so it gets its own, bigger shadow,
 * biased left/down (see EXPANDED_PANEL_SHADOW) rather than right/down: it's
 * pinned to the viewport's right edge, so unlike the header/ActionBar/nav
 * Drawer trio, a rightward shadow here would render entirely off-screen.
 * Left is the only side that borders anything visible (the canvas); down
 * still avoids bleeding upward onto the header/ActionBar for the same
 * offset-equals-blur reason as everywhere else.
 *
 * The expanded panel is positioned with `position: fixed`, pinned to the
 * viewport's right and bottom edges (right:0 lines up because this drawer
 * is always the rightmost thing in its row; bottom:0 always reaches the
 * screen's true bottom, whatever the viewport height is) — rather than a
 * `calc(100vh - <hardcoded chrome height>)`, which broke the moment that
 * hardcoded number didn't exactly match the real rendered height of the
 * AppBar + header row above it (e.g. the AppBar's 1px border), causing a
 * page-level scrollbar. `top` is measured directly off the header row's own
 * DOM node instead, so it can never drift out of sync with the real layout.
 */
export default function DrawerDropDownDrawer({
  editMode,
  categories,
  zonesByCategory,
  onRenameCategory,
  onSetCategoryColor,
  onReassignCategoryZones,
  onDeleteCategory,
  onAddCategory,
  devices,
  onRenameDevice,
  onUnpinDevice,
  onSwapDeviceDoorSide,
  onDeviceDragStart,
  onDeviceDragEnd,
}) {
  // Open on arrival: this drawer only ever renders inside the editor
  // (FloorPlanScreen.jsx), where its contents — the zone categories or the
  // device roster, depending on editMode — are the things you came here to
  // work with. Starting collapsed hid the device list behind a click even
  // though dragging a device out of it is the primary way to place one.
  const [expanded, setExpanded] = useState(true);
  const [panelTop, setPanelTop] = useState(64);
  const headerRef = useRef(null);
  const toggleExpanded = () => setExpanded((prev) => !prev);
  const headerLabel = editMode === 'devices' ? 'Devices' : 'Zone categories';

  useLayoutEffect(() => {
    if (expanded && headerRef.current) {
      setPanelTop(headerRef.current.getBoundingClientRect().bottom);
    }
  }, [expanded]);

  return (
    <Box sx={{ width: DRAWER_WIDTH }}>
      <Paper
        ref={headerRef}
        elevation={0}
        square
        onClick={toggleExpanded}
        sx={{
          width: DRAWER_WIDTH,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          color: 'text.secondary',
          cursor: 'pointer',
          position: 'relative',
          zIndex: 1,
          transition: 'none',
          boxShadow: expanded ? 'none' : CHROME_SHADOW,
        }}
      >
        {expanded ? (
          <ExpandLessIcon sx={{ color: 'action.active' }} />
        ) : (
          <ExpandMoreIcon sx={{ color: 'action.active' }} />
        )}
        <Typography variant="body1" color="text.secondary">
          {headerLabel}
        </Typography>
      </Paper>

      {expanded && (
        <Paper
          elevation={0}
          square
          sx={{
            position: 'fixed',
            top: panelTop,
            right: 0,
            bottom: 0,
            width: DRAWER_WIDTH,
            display: 'flex',
            flexDirection: 'column',
            zIndex: (theme) => theme.zIndex.appBar - 1,
            boxShadow: EXPANDED_PANEL_SHADOW,
          }}
        >
          {editMode === 'devices' ? (
            <DropdownDevicesContent
              devices={devices}
              onRenameDevice={onRenameDevice}
              onUnpinDevice={onUnpinDevice}
              onSwapDeviceDoorSide={onSwapDeviceDoorSide}
              onDeviceDragStart={onDeviceDragStart}
              onDeviceDragEnd={onDeviceDragEnd}
            />
          ) : (
            <ZoneCategoriesContent
              categories={categories}
              zonesByCategory={zonesByCategory}
              onRenameCategory={onRenameCategory}
              onSetCategoryColor={onSetCategoryColor}
              onReassignCategoryZones={onReassignCategoryZones}
              onDeleteCategory={onDeleteCategory}
              onAddCategory={onAddCategory}
            />
          )}
        </Paper>
      )}
    </Box>
  );
}
