/**
 * The right-hand space-categories drawer. Figma: ModeDrawer (42:71775) —
 * 320 wide, search, the categories, and an action box at the foot.
 *
 * Three levels: category → envelope → room. A category counts envelopes, so
 * "Apartments (28)" is apartments and not bedrooms, and the rooms appear when
 * an apartment is opened. Envelopes nest, so the gym's changing rooms sit
 * inside the gym rather than beside it.
 *
 * This is the types panel the doc describes: "A room or group holds no colour
 * of its own, so the types panel owns rename and recolour, and every space of
 * that type follows."
 */
import { Fragment, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import InputBase from "@mui/material/InputBase";
import { ResizeHandle } from "./ResizeHandle";
import ArrowBack from "@mui/icons-material/ArrowBack";
import Check from "@mui/icons-material/Check";
import Clear from "@mui/icons-material/Clear";
import Delete from "@mui/icons-material/Delete";
import EditOutlined from "@mui/icons-material/EditOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import MoveDownOutlined from "@mui/icons-material/MoveDownOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import type { RowTarget } from "./StructureRowMenu";
import {
  isRoomListed,
  passThroughRoom,
  roomColor,
  spaceCategories,
  type Group,
  type SpaceCategory,
  type Room,
  type VisualLayer,
} from "../../model";

/**
 * What a category holds: its envelopes, plus the spaces that sit in no
 * envelope at all. A room given a category of its own has left whichever
 * envelope disagreed with it, so counting envelopes alone would say a
 * category was empty while listing something inside it.
 */
const size = (category: SpaceCategory) =>
  category.groups.length + category.rooms.length;

/** Wide enough for a category name and a count; wider if asked. */
export const DRAWER_MIN = 240;
export const DRAWER_MAX = 600;
export const DRAWER_DEFAULT = 320;

const menuItemSx = { minHeight: 36, py: 0.25 } as const;
const menuIconSx = { minWidth: 0, mr: 2, color: "action.active" } as const;

export interface CategoriesDrawerProps {
  layer: VisualLayer;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onRename: (typeId: string, name: string) => void;
  onRecolor: (typeId: string, color: string) => void;
  /** Move every space of one category into another, or out of all of them. */
  onReassign: (fromId: string, toId: string | null) => void;
  onDeleteCategory: (typeId: string) => void;
  onNewCategory: () => void;
  /** Figma has it at 320; the user can have it wider. */
  width: number;
  onWidthChange: (width: number) => void;
  /**
   * Opens the space menu — the same one the tree and the plan open, since a
   * space offers the same things wherever it is reached from.
   */
  onRowMenu: (el: HTMLElement, target: RowTarget) => void;
}

export function CategoriesDrawer({
  layer,
  selectedRoomId,
  onSelectRoom,
  onRename,
  onRecolor,
  onReassign,
  onDeleteCategory,
  onNewCategory,
  onRowMenu,
  width,
  onWidthChange,
}: CategoriesDrawerProps) {
  const [query, setQuery] = useState("");
  // Absent means closed; every row opens and closes on its own.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ el: HTMLElement; typeId: string } | null>(
    null,
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hex, setHex] = useState("");
  const [draft, setDraft] = useState("");

  const isExpanded = (id: string) => expanded[id] === true;
  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const categories = useMemo(() => spaceCategories(layer), [layer]);


  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = new Set<string>();
    for (const r of layer.file.rooms) {
      if (r.name.toLowerCase().includes(q)) hit.add(r.id);
    }
    for (const g of layer.file.groups) {
      if (g.name.toLowerCase().includes(q)) hit.add(g.id);
    }
    return hit;
  }, [query, layer]);

  const floorName = (floorId: string) =>
    layer.floors.find((f) => f.id === floorId)?.name ?? floorId;

  /** Does anything under this envelope match the search? */
  const branchMatches = (group: Group): boolean => {
    if (!matches) return true;
    if (matches.has(group.id)) return true;
    if (layer.file.rooms.some((r) => r.group_id === group.id && matches.has(r.id)))
      return true;
    return (layer.childGroups.get(group.id) ?? []).some(branchMatches);
  };

  const renderRoom = (room: Room, depth: number, secondary?: string) => (
    <ListItemButton
      key={room.id}
      selected={room.id === selectedRoomId}
      sx={{ pl: 2 + depth * 2, pr: 1, minHeight: secondary ? 68 : 48 }}
      onClick={() => onSelectRoom(room.id)}
    >
      <Box sx={{ width: 28, flexShrink: 0 }} />
      <Box
        sx={{
          width: 16,
          height: 16,
          mr: 1.5,
          borderRadius: "2px",
          flexShrink: 0,
          bgcolor: roomColor(layer, room),
          border: 1,
          borderColor: "divider",
        }}
      />
      <ListItemText
        primary={room.name}
        // The floor, when this room is standing in for its envelope: five
        // storeys each have a room called Stairs.
        secondary={secondary}
        primaryTypographyProps={{
          variant: secondary ? "body1" : "body2",
          noWrap: true,
        }}
        secondaryTypographyProps={{ variant: "body2" }}
      />
      <IconButton
        size="small"
        edge="end"
        onClick={(e) => {
          e.stopPropagation();
          onRowMenu(e.currentTarget, { kind: "room", room });
        }}
      >
        <MoreVert sx={{ fontSize: 20 }} />
      </IconButton>
    </ListItemButton>
  );

  const renderEnvelope = (group: Group, depth: number): React.ReactNode => {
    if (!branchMatches(group)) return null;

    // A stairwell is an envelope holding one room called Stairs. Listing both
    // puts a row inside an identical row, so the room stands in for it.
    const only = passThroughRoom(layer, group);
    if (only && isRoomListed(layer, only)) {
      return renderRoom(only, depth, floorName(group.floor_id));
    }

    // Same rule as the tree: a flat's rooms stay folded inside it until one
    // is surfaced, every other envelope lists its rooms.
    const rooms = layer.file.rooms.filter(
      (r) => r.group_id === group.id && isRoomListed(layer, r),
    );
    const children = layer.childGroups.get(group.id) ?? [];
    const expandable = rooms.length > 0 || children.length > 0;
    const open = isExpanded(group.id) || Boolean(matches);

    return (
      <Fragment key={group.id}>
        <ListItemButton
          sx={{ pl: 2 + depth * 2, pr: 1, minHeight: 68 }}
          onClick={() => expandable && toggle(group.id)}
        >
          <Box
            sx={{ width: 28, display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            {expandable ? (
              open ? (
                <ExpandMore sx={{ fontSize: 20 }} />
              ) : (
                <ChevronRight sx={{ fontSize: 20 }} />
              )
            ) : null}
          </Box>
          <ListItemText
            primary={group.name}
            // The floor, because the same envelope name repeats on every
            // storey: four Hallways, five Stairs.
            secondary={floorName(group.floor_id)}
            primaryTypographyProps={{ variant: "body1", noWrap: true }}
            secondaryTypographyProps={{ variant: "body2" }}
          />
          <IconButton
            size="small"
            edge="end"
            onClick={(e) => {
              e.stopPropagation();
              onRowMenu(e.currentTarget, { kind: "group", group });
            }}
          >
            <MoreVert sx={{ fontSize: 20 }} />
          </IconButton>
        </ListItemButton>
        {open && (
          <>
            {children.map((c) => renderEnvelope(c, depth + 1))}
            {rooms.map((r) => renderRoom(r, depth + 1))}
          </>
        )}
      </Fragment>
    );
  };

  const visible = matches
    ? categories.filter(
        (c) =>
          c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          c.groups.some(branchMatches),
      )
    : categories;

  return (
    <Box
      sx={{
        width,
        position: "relative",
        flexShrink: 0,
        borderLeft: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
      }}
    >
      <ResizeHandle
        edge="left"
        width={width}
        min={DRAWER_MIN}
        max={DRAWER_MAX}
        onChange={onWidthChange}
      />
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 1, gap: 0.5 }}>
        <TextField
          size="small"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        <Tooltip title="Collapse all">
          <IconButton size="small" onClick={() => setExpanded({})}>
            <UnfoldLess sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          {visible.map((category) => {
            const key = category.id ?? "__unknown__";
            const open = isExpanded(key) || Boolean(matches);
            return (
              <Fragment key={key}>
                <ListItemButton
                  sx={{ minHeight: 48, pl: 1, pr: 1 }}
                  onClick={() => size(category) > 0 && toggle(key)}
                >
                  <Box sx={{ width: 28, display: "flex", alignItems: "center" }}>
                    {size(category) > 0 ? (
                      open ? (
                        <ExpandMore sx={{ fontSize: 20 }} />
                      ) : (
                        <ChevronRight sx={{ fontSize: 20 }} />
                      )
                    ) : null}
                  </Box>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      mr: 1.5,
                      borderRadius: "2px",
                      flexShrink: 0,
                      bgcolor: category.color,
                      border: 1,
                      borderColor: "divider",
                    }}
                  />
                  {renaming === key ? (
                    <TextField
                      size="small"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        if (draft.trim() && category.id) {
                          onRename(category.id, draft.trim());
                        }
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (draft.trim() && category.id) {
                            onRename(category.id, draft.trim());
                          }
                          setRenaming(null);
                        }
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <ListItemText
                      primary={
                        <Box component="span" sx={{ display: "flex", gap: 1 }}>
                          <span>{category.name}</span>
                          <Typography component="span" color="text.secondary">
                            ({size(category)})
                          </Typography>
                        </Box>
                      }
                      primaryTypographyProps={{ variant: "body1" }}
                    />
                  )}
                  <IconButton
                    size="small"
                    edge="end"
                    disabled={category.id === null}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ el: e.currentTarget, typeId: category.id! });
                    }}
                  >
                    <MoreVert sx={{ fontSize: 20 }} />
                  </IconButton>
                </ListItemButton>

                {open && (
                  <>
                    {category.groups.map((g) => renderEnvelope(g, 1))}
                    {/* Spaces in no envelope. A room given a category of its
                        own leaves the envelope that disagreed with it, so
                        without these the change would show up nowhere. */}
                    {category.rooms.map((r) =>
                      renderRoom(r, 1, floorName(r.floor_id)),
                    )}
                  </>
                )}
              </Fragment>
            );
          })}
        </List>
      </Box>

      <Divider />
      <Box
        sx={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 3,
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          endIcon={<AddIcon />}
          onClick={onNewCategory}
        >
          New category
        </Button>
        <Tooltip title="Not built: importing categories needs the platform's structure">
          <span>
            <Button variant="outlined" color="inherit" sx={{ minWidth: 48 }} disabled>
              <FileUploadOutlined sx={{ fontSize: 20 }} />
            </Button>
          </span>
        </Tooltip>
      </Box>


      {/* Figma 2:53271 — what a category itself offers, as against what one
          space offers. Reassign all is here because a category with thirty
          rooms in it would otherwise be emptied one trip through the tree
          at a time. */}
      <Menu
        anchorEl={menu?.el ?? null}
        open={Boolean(menu)}
        onClose={() => {
          setMenu(null);
          setReassigning(false);
          setPicking(false);
        }}
        slotProps={{ paper: { sx: { width: 256 } } }}
      >
        {picking
          ? [
              <ColorPicker
                key="picker"
                hex={hex}
                onHexChange={setHex}
                onPick={(color) => {
                  if (menu) onRecolor(menu.typeId, color);
                  setPicking(false);
                  setHex("");
                  setMenu(null);
                }}
                onCancel={() => {
                  setPicking(false);
                  setHex("");
                }}
              />,
            ]
          : reassigning
          ? [
              <MenuItem
                key="back"
                sx={menuItemSx}
                onClick={() => setReassigning(false)}
              >
                <ListItemIcon sx={menuIconSx}>
                  <ArrowBack sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Reassign all to"
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </MenuItem>,
              <Divider key="d" />,
              ...layer.file.space_types
                .filter((t) => t.id !== menu?.typeId)
                .map((t) => (
                  <MenuItem
                    key={t.id}
                    sx={menuItemSx}
                    onClick={() => {
                      if (menu) onReassign(menu.typeId, t.id);
                      setReassigning(false);
                      setMenu(null);
                    }}
                  >
                    <ListItemIcon sx={menuIconSx}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: "2px",
                          bgcolor: t.color,
                          border: 1,
                          borderColor: "divider",
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={t.name}
                      primaryTypographyProps={{ variant: "body1" }}
                    />
                  </MenuItem>
                )),
              <MenuItem
                key="none"
                sx={menuItemSx}
                onClick={() => {
                  if (menu) onReassign(menu.typeId, null);
                  setReassigning(false);
                  setMenu(null);
                }}
              >
                <ListItemIcon sx={menuIconSx} />
                <ListItemText
                  primary="No category"
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </MenuItem>,
            ]
          : [
              <MenuItem
                key="rename"
                sx={menuItemSx}
                onClick={() => {
                  if (!menu) return;
                  const type = layer.spaceTypes.get(menu.typeId);
                  setRenaming(menu.typeId);
                  setDraft(type?.name ?? "");
                  setMenu(null);
                }}
              >
                <ListItemIcon sx={menuIconSx}>
                  <EditOutlined sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Rename"
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </MenuItem>,
              <MenuItem
                key="color"
                sx={menuItemSx}
                onClick={() => setPicking(true)}
              >
                <ListItemIcon sx={menuIconSx}>
                  <PaletteOutlined sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Change color"
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </MenuItem>,
              <MenuItem
                key="reassign"
                sx={menuItemSx}
                onClick={() => setReassigning(true)}
              >
                <ListItemIcon sx={menuIconSx}>
                  <MoveDownOutlined sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Reassign all"
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </MenuItem>,
              <Divider key="divider" sx={{ my: 1 }} />,
              <MenuItem
                key="delete"
                sx={menuItemSx}
                onClick={() => {
                  if (menu) onDeleteCategory(menu.typeId);
                  setMenu(null);
                }}
              >
                <ListItemIcon sx={{ ...menuIconSx, color: "error.main" }}>
                  <Delete sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Delete"
                  primaryTypographyProps={{
                    variant: "body1",
                    color: "error.main",
                  }}
                />
              </MenuItem>,
            ]}
      </Menu>
    </Box>
  );
}


/**
 * Figma 2:53313 — the category menu turns into this rather than opening a
 * second popover: it is the same decision, so it belongs in the same place.
 *
 * A swatch is the colour at full strength as a border around itself at 40%,
 * which is roughly how the space reads on the plan — a solid outline round a
 * washed fill. Picking from a set keeps the plan legible; the hex field is
 * there for the one that has to match something outside it.
 */
const SWATCHES = [
  "#1e88e5", "#ff8a65", "#00e676", "#cee500", "#cfd8dc",
  "#0d47a1", "#e91e63", "#009688", "#ffd600", "#9e9e9e",
  "#673ab7", "#d50000", "#1b5e20", "#663c00", "#212121",
];

const HEX = /^#?([0-9a-fA-F]{6})$/;

function ColorPicker({
  hex,
  onHexChange,
  onPick,
  onCancel,
}: {
  hex: string;
  onHexChange: (value: string) => void;
  onPick: (color: string) => void;
  onCancel: () => void;
}) {
  const match = HEX.exec(hex.trim());
  const typed = match ? `#${match[1].toLowerCase()}` : null;

  return (
    <Box
      sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}
      // The menu would take a click on a swatch as a selection and close.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {SWATCHES.map((color) => (
          <Box
            key={color}
            role="button"
            aria-label={color}
            onClick={() => onPick(color)}
            sx={{
              width: 24,
              height: 24,
              borderRadius: "2px",
              cursor: "pointer",
              border: 1,
              borderColor: color,
              // 40% of the same colour, as the design has it.
              bgcolor: color + "66",
              "&:hover": { outline: "2px solid", outlineColor: "action.active" },
            }}
          />
        ))}
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          pl: 1.5,
          pr: 0.5,
          borderRadius: 1,
          border: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="body1" color="text.primary">
          #
        </Typography>
        <InputBase
          value={hex.replace(/^#/, "")}
          placeholder="000000"
          onChange={(e) => onHexChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && typed) onPick(typed);
            if (e.key === "Escape") onCancel();
          }}
          sx={{ flex: 1, minWidth: 0, fontSize: 16, py: 1 }}
        />
        <IconButton
          size="small"
          disabled={!typed}
          onClick={() => typed && onPick(typed)}
        >
          <Check sx={{ fontSize: 20 }} />
        </IconButton>
        <IconButton size="small" onClick={onCancel}>
          <Clear sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
