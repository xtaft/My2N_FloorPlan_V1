/**
 * The left-hand containment tree: building ⊃ floor ⊃ envelope ⊃ room.
 * Figma: NavigationTreeFloorPlan (37:60005) — 256 wide, a 56px search box, the
 * tree, and a 56px action box at the foot.
 *
 * The building level is display only. The model has no building entity: a
 * floor is the top of the containment tree, because geometry does not cross
 * floors and nothing derived reads above one.
 *
 * Expansion is one flat map keyed by row id, so every row opens and closes on
 * its own: expanding one leaves the others as they were, and the arrow that
 * opened a row closes it again. Which floor the canvas shows is a separate
 * thing from which floor rows are open — tying them together meant opening a
 * floor collapsed the last one, and an open floor could not be folded at all.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
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
import { HiddenRoomsMenu } from "./HiddenRoomsMenu";
import {
  envelopeChain,
  floorEnvelopes,
  groupAccessType,
  isRoomListed,
  roomColor,
  type Group,
  type Room,
  type VisualLayer,
} from "../../model";

/**
 * Circulation, stairs and lifts are left out of this tree. They are the
 * building's connective tissue rather than things a manager administers, and
 * they repeat on every storey — four hallways, five stairwells, five lift
 * cars — so listing them buries the units. They are still on the map, still
 * in the access graph, and still in the categories drawer on the right.
 */
const HIDDEN_FROM_TREE = new Set(["circulation", "stairs", "elevator"]);

export interface StructureTreeProps {
  layer: VisualLayer;
  buildingName: string;
  /** The floor the canvas is showing — not the same as which rows are open. */
  floorId: string;
  onFloorChange: (floorId: string) => void;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  /** Show a room that is folded away inside an envelope. */
  onShowRoom: (roomId: string) => void;
}

export function StructureTree({
  layer,
  buildingName,
  floorId,
  onFloorChange,
  selectedRoomId,
  onSelectRoom,
  onShowRoom,
}: StructureTreeProps) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ el: HTMLElement; groupId: string } | null>(
    null,
  );
  // Absent means closed. The floor on screen when the tree first mounts
  // starts open so there is something to look at.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [floorId]: true,
  }));

  /**
   * Open the way to the selected room, once it is a room the tree names.
   *
   * Surfacing a bedroom is meant to make it appear here, but it sits inside a
   * flat that is probably folded, so the change would be invisible. This also
   * means clicking a room on the map reveals where it lives.
   */
  useEffect(() => {
    if (!selectedRoomId) return;
    const room = layer.rooms.get(selectedRoomId);
    if (!room || !isRoomListed(layer, room)) return;
    const path = [room.floor_id, ...envelopeChain(layer, room)];
    setExpanded((prev) => {
      if (path.every((id) => prev[id])) return prev;
      const next = { ...prev };
      for (const id of path) next[id] = true;
      return next;
    });
  }, [layer, selectedRoomId]);

  const isExpanded = (id: string) => expanded[id] === true;
  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const open = (id: string) =>
    setExpanded((prev) => (prev[id] ? prev : { ...prev, [id]: true }));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      layer.file.rooms
        .filter(
          (r) =>
            r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
        )
        .map((r) => r.id),
    );
  }, [query, layer]);

  const row = (
    key: string,
    depth: number,
    icon: React.ReactNode,
    label: string,
    opts: {
      secondary?: string;
      expandable?: boolean;
      expanded?: boolean;
      onToggle?: () => void;
      onClick?: () => void;
      selected?: boolean;
      bold?: boolean;
      swatch?: string;
      onMenu?: (el: HTMLElement) => void;
    } = {},
  ) => (
    <ListItemButton
      key={key}
      selected={opts.selected}
      onClick={opts.onClick}
      sx={{ pl: 1 + depth * 2, pr: 1, minHeight: 48 }}
    >
      {/* The arrow is its own hit target: it toggles this row and does
          nothing else, so the row's main action stays separate. */}
      <Box
        sx={{
          width: 28,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          cursor: opts.expandable ? "pointer" : "default",
        }}
        onClick={(e) => {
          if (!opts.expandable) return;
          e.stopPropagation();
          opts.onToggle?.();
        }}
      >
        {opts.expandable ? (
          opts.expanded ? (
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
      <IconButton
        size="small"
        edge="end"
        onClick={(e) => {
          e.stopPropagation();
          opts.onMenu?.(e.currentTarget);
        }}
      >
        <MoreVert sx={{ fontSize: 20 }} />
      </IconButton>
    </ListItemButton>
  );

  const renderRoom = (room: Room, depth: number) => {
    if (matches && !matches.has(room.id)) return null;
    return row(
      room.id,
      depth,
      <MeetingRoomOutlined sx={{ fontSize: 20 }} />,
      room.name,
      {
        secondary: room.surfaced ? "shown separately" : undefined,
        selected: room.id === selectedRoomId,
        onClick: () => onSelectRoom(room.id),
        swatch: roomColor(layer, room),
      },
    );
  };

  const renderGroup = (group: Group, depth: number): React.ReactNode => {
    // A flat's rooms stay folded inside it until one is surfaced; every other
    // envelope lists its rooms. An apartment with nothing surfaced therefore
    // has nothing to expand, and gets no chevron.
    const rooms = layer.file.rooms.filter(
      (r) => r.group_id === group.id && isRoomListed(layer, r),
    );
    const children = layer.childGroups.get(group.id) ?? [];
    const expandable = rooms.length > 0 || children.length > 0;

    // A search forces every branch that contains a hit open, and hides the
    // rest; it does not disturb what the user had expanded.
    if (matches) {
      const kids = children.map((c) => renderGroup(c, depth + 1));
      const hits = rooms.filter((r) => matches.has(r.id));
      if (hits.length === 0 && !kids.some(Boolean)) return null;
      return (
        <Fragment key={group.id}>
          {row(
            group.id,
            depth,
            <WidgetsOutlined sx={{ fontSize: 20 }} />,
            group.name,
            { expandable: true, expanded: true, onToggle: () => toggle(group.id) },
          )}
          {kids}
          {hits.map((r) => renderRoom(r, depth + 1))}
        </Fragment>
      );
    }

    const isOpen = isExpanded(group.id);
    return (
      <Fragment key={group.id}>
        {row(
          group.id,
          depth,
          <WidgetsOutlined sx={{ fontSize: 20 }} />,
          group.name,
          {
            secondary: group.domain_ref ?? undefined,
            expandable,
            expanded: isOpen,
            onToggle: () => toggle(group.id),
            onClick: () => expandable && toggle(group.id),
            // The envelope is how a room folded inside it is reached, since
            // the room itself is in no list and cannot be clicked.
            onMenu: (el) => setMenu({ el, groupId: group.id }),
          },
        )}
        {isOpen && (
          <>
            {children.map((c) => renderGroup(c, depth + 1))}
            {rooms.map((r) => renderRoom(r, depth + 1))}
          </>
        )}
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
          <IconButton size="small" onClick={() => setExpanded({})}>
            <UnfoldLess sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          {/* Display-only building root — the model's tree starts at a floor. */}
          {row(
            "building",
            0,
            <ApartmentOutlined sx={{ fontSize: 20 }} />,
            buildingName,
            { bold: true },
          )}
          {layer.floors.map((floor) => {
            const isOpen = isExpanded(floor.id);
            return (
              <Fragment key={floor.id}>
                {row(
                  floor.id,
                  1,
                  <LayersOutlined sx={{ fontSize: 20 }} />,
                  floor.name,
                  {
                    // `level` is shown because drawer order and storey are
                    // independent: an order of 3, 5, 4 is legal and should
                    // not look like a bug.
                    secondary: `level ${floor.level}`,
                    expandable: true,
                    expanded: isOpen,
                    onToggle: () => toggle(floor.id),
                    // Clicking the row takes the canvas to this floor and
                    // opens it; it never closes another floor.
                    onClick: () => {
                      onFloorChange(floor.id);
                      open(floor.id);
                    },
                    selected: floor.id === floorId,
                  },
                )}
                {/* floorEnvelopes skips the pass-through group that would
                    otherwise name the floor a second time. */}
                {isOpen &&
                  floorEnvelopes(layer, floor.id)
                    .filter(
                      (g) =>
                        !HIDDEN_FROM_TREE.has(groupAccessType(layer, g) ?? ""),
                    )
                    .map((g) => renderGroup(g, 2))}
              </Fragment>
            );
          })}
        </List>
      </Box>

      <HiddenRoomsMenu
        layer={layer}
        menu={menu}
        onClose={() => setMenu(null)}
        onShowRoom={onShowRoom}
      />

      <Divider />
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 3 }}>
        <Tooltip title="Not built: a new space needs the divide operation">
          <span style={{ width: "100%" }}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              endIcon={<AddIcon />}
              disabled
            >
              New space
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
