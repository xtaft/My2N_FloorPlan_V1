/**
 * The left-hand containment tree: building ⊃ floor ⊃ envelope ⊃ room.
 * Figma: NavigationTreeFloorPlan (37:60005) — 256 wide, a 56px search box, the
 * tree, and a 56px action box at the foot.
 *
 * The building level is display only. The model has no building entity: a
 * floor is the top of the containment tree, because geometry does not cross
 * floors and nothing derived reads above one.
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
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import {
  roomColor,
  topGroups,
  type Group,
  type Room,
  type VisualLayer,
} from "../../model";

export interface StructureTreeProps {
  layer: VisualLayer;
  buildingName: string;
  floorId: string;
  onFloorChange: (floorId: string) => void;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
}

export function StructureTree({
  layer,
  buildingName,
  floorId,
  onFloorChange,
  selectedRoomId,
  onSelectRoom,
}: StructureTreeProps) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      layer.file.rooms
        .filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
        .map((r) => r.id),
    );
  }, [query, layer]);

  const isOpen = (id: string, fallback: boolean) => !(closed[id] ?? !fallback);
  const toggle = (id: string, fallback: boolean) =>
    setClosed((prev) => ({ ...prev, [id]: isOpen(id, fallback) }));

  const row = (
    key: string,
    depth: number,
    icon: React.ReactNode,
    label: string,
    opts: {
      secondary?: string;
      expandable?: boolean;
      open?: boolean;
      onToggle?: () => void;
      onClick?: () => void;
      selected?: boolean;
      bold?: boolean;
      swatch?: string;
    } = {},
  ) => (
    <ListItemButton
      key={key}
      selected={opts.selected}
      onClick={opts.onClick}
      sx={{ pl: 1 + depth * 2, pr: 1, minHeight: 48 }}
    >
      <Box
        sx={{ width: 28, display: "flex", alignItems: "center", flexShrink: 0 }}
        onClick={(e) => {
          if (!opts.expandable) return;
          e.stopPropagation();
          opts.onToggle?.();
        }}
      >
        {opts.expandable ? (
          opts.open ? (
            <ExpandMore sx={{ fontSize: 20 }} />
          ) : (
            <ChevronRight sx={{ fontSize: 20 }} />
          )
        ) : null}
      </Box>
      <Box
        sx={{
          width: 28,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          color: "action.active",
        }}
      >
        {opts.swatch ? (
          <Box
            sx={{
              width: 16,
              height: 16,
              borderRadius: "2px",
              bgcolor: opts.swatch,
              border: 1,
              borderColor: "divider",
            }}
          />
        ) : (
          icon
        )}
      </Box>
      <ListItemText
        primary={label}
        secondary={opts.secondary}
        primaryTypographyProps={{
          variant: "body1",
          fontWeight: opts.bold ? 700 : 400,
          noWrap: true,
        }}
        secondaryTypographyProps={{ variant: "body2", noWrap: true }}
      />
      <IconButton size="small" edge="end" onClick={(e) => e.stopPropagation()}>
        <MoreVert sx={{ fontSize: 20 }} />
      </IconButton>
    </ListItemButton>
  );

  const renderRoom = (room: Room, depth: number) => {
    if (matches && !matches.has(room.id)) return null;
    return row(room.id, depth, <MeetingRoomOutlined sx={{ fontSize: 20 }} />, room.name, {
      secondary: room.surfaced ? "shown separately" : undefined,
      selected: room.id === selectedRoomId,
      onClick: () => onSelectRoom(room.id),
      swatch: roomColor(layer, room),
    });
  };

  const renderGroup = (group: Group, depth: number): React.ReactNode => {
    const rooms = layer.file.rooms.filter((r) => r.group_id === group.id);
    const children = layer.childGroups.get(group.id) ?? [];
    const open = isOpen(group.id, depth === 0);
    const expandable = rooms.length > 0 || children.length > 0;

    const body = open ? (
      <>
        {children.map((c) => renderGroup(c, depth + 1))}
        {rooms.map((r) => renderRoom(r, depth + 1))}
      </>
    ) : null;

    // While searching, a group only appears if something under it matched.
    if (matches) {
      const hasMatch = rooms.some((r) => matches.has(r.id));
      const kids = children.map((c) => renderGroup(c, depth + 1));
      const kidsHave = kids.some(Boolean);
      if (!hasMatch && !kidsHave) return null;
      return (
        <Fragment key={group.id}>
          {row(group.id, depth, <WidgetsOutlined sx={{ fontSize: 20 }} />, group.name, {
            expandable: true,
            open: true,
            onToggle: () => toggle(group.id, true),
          })}
          {kids}
          {rooms.filter((r) => matches.has(r.id)).map((r) => renderRoom(r, depth + 1))}
        </Fragment>
      );
    }

    return (
      <Fragment key={group.id}>
        {row(group.id, depth, <WidgetsOutlined sx={{ fontSize: 20 }} />, group.name, {
          secondary: group.domain_ref ?? undefined,
          expandable,
          open,
          onToggle: () => toggle(group.id, depth === 0),
        })}
        {body}
      </Fragment>
    );
  };

  return (
    <Box
      sx={{
        width: 256,
        flexShrink: 0,
        borderRight: 1,
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
          <IconButton size="small" onClick={() => setClosed({})}>
            <UnfoldLess sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          {/* Display-only building root — the model's tree starts at a floor. */}
          {row("building", 0, <ApartmentOutlined sx={{ fontSize: 20 }} />, buildingName, {
            bold: true,
          })}
          {layer.floors.map((floor) => {
            const open = floor.id === floorId;
            return (
              <Fragment key={floor.id}>
                {row(
                  floor.id,
                  1,
                  <LayersOutlined sx={{ fontSize: 20 }} />,
                  floor.name,
                  {
                    // `level` is shown because drawer order and storey are
                    // independent: an order of 3, 5, 4 is legal.
                    secondary: `level ${floor.level}`,
                    expandable: true,
                    open,
                    onToggle: () => onFloorChange(floor.id),
                    onClick: () => onFloorChange(floor.id),
                    selected: open,
                  },
                )}
                {open &&
                  topGroups(layer, floor.id).map((g) => renderGroup(g, 2))}
              </Fragment>
            );
          })}
        </List>
      </Box>

      <Divider />
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 3 }}>
        <Tooltip title="Not built: a new space needs the divide operation">
          <span style={{ width: "100%" }}>
            <Button fullWidth variant="outlined" color="inherit" endIcon={<AddIcon />} disabled>
              New space
            </Button>
          </span>
        </Tooltip>
      </Box>
      <Typography sx={{ display: "none" }}>{layer.file.rooms.length}</Typography>
    </Box>
  );
}
