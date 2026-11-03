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
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import {
  isRoomListed,
  passThroughRoom,
  roomColor,
  spaceCategories,
  type Group,
  type Room,
  type VisualLayer,
} from "../../model";

export interface CategoriesDrawerProps {
  layer: VisualLayer;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onRename: (typeId: string, name: string) => void;
  onRecolor: (typeId: string, color: string) => void;
  onNewCategory: () => void;
  /**
   * Put a room in a category. The screen above owns this rather than the
   * drawer, because moving a stairwell out of its category breaks the floors
   * apart and has to be asked about first.
   */
  onAssignCategory: (roomId: string, typeId: string | null) => void;
}

export function CategoriesDrawer({
  layer,
  selectedRoomId,
  onSelectRoom,
  onRename,
  onRecolor,
  onNewCategory,
  onAssignCategory,
}: CategoriesDrawerProps) {
  const [query, setQuery] = useState("");
  // Absent means closed; every row opens and closes on its own.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ el: HTMLElement; typeId: string } | null>(
    null,
  );
  /** The room whose category is being picked. */
  const [assigning, setAssigning] = useState<{
    el: HTMLElement;
    room: Room;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
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
          setAssigning({ el: e.currentTarget, room });
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
            onClick={(e) => e.stopPropagation()}
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
        width: 320,
        flexShrink: 0,
        borderLeft: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
      }}
    >
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
                  onClick={() => category.groups.length > 0 && toggle(key)}
                >
                  <Box sx={{ width: 28, display: "flex", alignItems: "center" }}>
                    {category.groups.length > 0 ? (
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
                            ({category.groups.length})
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

                {open && category.groups.map((g) => renderEnvelope(g, 1))}
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

      {/* Which category this one room is in. The categories' own menu,
          below, renames and recolours the category for every space in it. */}
      <Menu
        anchorEl={assigning?.el ?? null}
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
      >
        <MenuItem disabled>
          <Typography variant="overline">Category</Typography>
        </MenuItem>
        {layer.file.space_types.map((type) => (
          <MenuItem
            key={type.id}
            selected={assigning?.room.space_type === type.id}
            onClick={() => {
              if (assigning) onAssignCategory(assigning.room.id, type.id);
              setAssigning(null);
            }}
          >
            <Box
              sx={{
                width: 14,
                height: 14,
                mr: 1.5,
                borderRadius: "2px",
                bgcolor: type.color,
                border: 1,
                borderColor: "divider",
              }}
            />
            {type.name}
          </MenuItem>
        ))}
        <MenuItem
          selected={assigning?.room.space_type === null}
          onClick={() => {
            if (assigning) onAssignCategory(assigning.room.id, null);
            setAssigning(null);
          }}
        >
          <Box sx={{ width: 14, mr: 1.5 }} />
          Inherit from envelope
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={menu?.el ?? null}
        open={menu !== null}
        onClose={() => setMenu(null)}
      >
        <MenuItem
          onClick={() => {
            const c = categories.find((x) => x.id === menu?.typeId);
            setDraft(c?.name ?? "");
            setRenaming(menu?.typeId ?? null);
            setMenu(null);
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            // Recolour is the point of the panel: every space of the type
            // follows, because none of them holds a colour of its own.
            if (menu) onRecolor(menu.typeId, nextColor());
            setMenu(null);
          }}
        >
          Recolour
        </MenuItem>
      </Menu>
    </Box>
  );
}

const PALETTE = [
  "#6B8FD4", "#8FA8CC", "#C9CFD6", "#A8B4C4", "#D4A96B",
  "#7FC4A8", "#5FA88C", "#B0A8A0", "#D48A8A", "#9B8FD4",
];

function nextColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}
