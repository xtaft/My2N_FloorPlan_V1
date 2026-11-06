/**
 * The building's spaces, flat.
 *
 * Figma: 2:24387 > NavigationTreeView (107:257872). 280 wide beside the
 * 56-wide rail, a 56-tall search box with a rule under it, and rows of 48
 * — the building at the top and everything it holds one level in.
 *
 * There are no floors in it, and that is the point of the screen: before
 * the plan exists, the customer has a list of apartments and common
 * spaces and no idea which storey any of them is on. Drawing the plan is
 * what adds that.
 */
import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import type { BuildingSpace, BuildingStorey } from "../../model";
import { PANEL_BACKGROUND } from "../theme";

/**
 * Row geometry, taken from the design's frames rather than guessed.
 *
 * The building sits at the left edge with no chevron — it is always open,
 * so there is nothing to turn. Everything under it reserves a 40px column
 * for one, open or not, so the icons line up down the list. Deeper rows
 * step in by the width of one guide rail.
 */
const ROW = 48;
const PAD = 8;
const CHEVRON = 40;
const RAIL = 12;

export interface SpaceTreeProps {
  buildingName: string;
  spaces: BuildingSpace[];
  /**
   * Once the plan exists the spaces sit under the storey they turned
   * out to be on. Before it, there are no storeys to sit under.
   */
  storeys?: BuildingStorey[] | null;
  width: number;
  /**
   * The tree is the plan's navigation once there is a plan: picking a
   * storey is how you turn to it, and picking a space is how you point
   * at it. Both are the same click, because a space is on a storey.
   */
  selectedSpaceId?: string | null;
  onSelectSpace?: (spaceId: string, floorId: string | null) => void;
  selectedFloorId?: string | null;
  onSelectFloor?: (floorId: string) => void;
}

export function SpaceTree({
  buildingName,
  spaces,
  storeys = null,
  width,
  selectedSpaceId = null,
  onSelectSpace,
  selectedFloorId = null,
  onSelectFloor,
}: SpaceTreeProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** Storeys are open until shut, so the building reads at a glance. */
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const matches = query.trim() !== "";
  const visible = matches
    ? spaces.filter((s) => {
        const q = query.trim().toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.rooms.some((r) => r.name.toLowerCase().includes(q))
        );
      })
    : spaces;

  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * A space and, when it opens, what is inside it.
   *
   * An apartment never opens: the rooms in it are a consequence of the
   * floor plan, and a flat is the one thing the customer manages.
   */
  const renderSpace = (
    space: BuildingSpace,
    depth: number,
    floorId: string | null,
  ) => {
    // Before the plan nothing opens. The customer's list has no rooms
    // inside a space and no spaces inside a space; the plan is what
    // puts them there, and until then a row is a row.
    const expandable =
      storeys !== null && !space.apartment && space.rooms.length > 1;
    const isOpen = open.has(space.id) || (matches && expandable);
    return (
      <Fragment key={space.id}>
        <Row
          depth={depth}
          icon={
            expandable ? (
              <WidgetsOutlined sx={iconSx} />
            ) : (
              <MeetingRoomOutlined sx={iconSx} />
            )
          }
          label={space.name}
          open={isOpen}
          expandable={expandable}
          onToggle={() => toggle(space.id)}
          selected={space.id === selectedSpaceId}
          onClick={
            onSelectSpace ? () => onSelectSpace(space.id, floorId) : undefined
          }
        />
        {isOpen &&
          space.rooms.map((room) => (
            <Row
              key={room.id}
              depth={depth + 1}
              icon={<MeetingRoomOutlined sx={iconSx} />}
              label={room.name}
            />
          ))}
      </Fragment>
    );
  };

  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        // A shade off white, which is what separates the tree from the
        // icon rail beside it without a second rule between them.
        bgcolor: PANEL_BACKGROUND,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
        }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        <IconButton size="small" onClick={() => setOpen(new Set())}>
          <UnfoldLess sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          <Row
            depth={0}
            icon={<ApartmentOutlined sx={iconSx} />}
            label={buildingName}
            bold
            menu={false}
          />

          {storeys?.map((storey) => {
            // By id, not by identity: the storeys are built from their
            // own call and carry different objects for the same spaces.
            const shown = new Set(visible.map((x) => x.id));
            const inside = storey.spaces.filter((x) => shown.has(x.id));
            if (matches && inside.length === 0) return null;
            const isOpen = !closed.has(storey.id) || Boolean(matches);
            return (
              <Fragment key={storey.id}>
                <Row
                  depth={1}
                  icon={<LayersOutlined sx={iconSx} />}
                  label={storey.name}
                  open={isOpen}
                  expandable
                  onToggle={() =>
                    setClosed((was) => {
                      const next = new Set(was);
                      if (next.has(storey.id)) next.delete(storey.id);
                      else next.add(storey.id);
                      return next;
                    })
                  }
                  selected={storey.id === selectedFloorId}
                  onClick={
                    onSelectFloor
                      ? () => {
                          onSelectFloor(storey.id);
                          // Turning to a storey opens it: being shown a
                          // floor and a shut row at the same time reads
                          // as nothing having happened.
                          setClosed((was) => {
                            const next = new Set(was);
                            next.delete(storey.id);
                            return next;
                          });
                        }
                      : undefined
                  }
                />
                {isOpen &&
                  inside.map((space) => renderSpace(space, 2, storey.id))}
              </Fragment>
            );
          })}

          {!storeys && visible.map((space) => renderSpace(space, 1, null))}
        </List>
      </Box>
    </Box>
  );
}

const iconSx = { fontSize: 20, color: "text.secondary" } as const;

function Row({
  depth,
  icon,
  label,
  bold,
  open,
  expandable,
  onToggle,
  menu = true,
  selected = false,
  onClick,
}: {
  depth: number;
  icon: React.ReactNode;
  label: string;
  bold?: boolean;
  open?: boolean;
  expandable?: boolean;
  onToggle?: () => void;
  menu?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  // With somewhere to go, the row goes there and the chevron is left to
  // fold. Without, the whole row folds — which is all it could ever do.
  const folds = Boolean(expandable && onToggle);
  return (
    <ListItemButton
      selected={selected}
      sx={{
        height: ROW,
        pl: `${PAD + Math.max(0, depth - 1) * RAIL}px`,
        pr: 1,
      }}
      onClick={onClick ?? (folds ? onToggle : undefined)}
    >
      {/* The chevron's place is held even when there is nothing to open,
          so every icon on a level lines up with the others. */}
      {depth > 0 && (
        <Box
          onClick={
            onClick && folds
              ? (e) => {
                  e.stopPropagation();
                  onToggle?.();
                }
              : undefined
          }
          sx={{
            width: CHEVRON,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            pr: 1,
            color: "text.secondary",
          }}
        >
          {expandable ? (
            open ? (
              <ExpandMore sx={{ fontSize: 20 }} />
            ) : (
              <ChevronRight sx={{ fontSize: 20 }} />
            )
          ) : null}
        </Box>
      )}
      <Box sx={{ width: 28, flexShrink: 0, display: "flex" }}>{icon}</Box>
      <ListItemText
        primary={label}
        primaryTypographyProps={{
          variant: "body2",
          noWrap: true,
          fontWeight: bold ? 500 : 400,
        }}
      />
      {menu && (
        <IconButton size="small" edge="end" onClick={(e) => e.stopPropagation()}>
          <MoreVert sx={{ fontSize: 20 }} />
        </IconButton>
      )}
    </ListItemButton>
  );
}
