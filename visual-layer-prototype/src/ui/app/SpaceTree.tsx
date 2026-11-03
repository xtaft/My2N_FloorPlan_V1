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
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import type { BuildingSpace } from "../../model";

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
  width: number;
}

export function SpaceTree({ buildingName, spaces, width }: SpaceTreeProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

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

  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
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

          {visible.map((space) => {
              // An apartment is one space the customer manages. The rooms
              // inside it are a consequence of the floor plan, and there
              // is no floor plan yet — opening a flat here would show
              // something this screen is not supposed to know.
              const expandable = !space.apartment && space.rooms.length > 1;
              const isOpen = open.has(space.id) || (matches && expandable);
              return (
                <Fragment key={space.id}>
                  <Row
                    depth={1}
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
                  />
                  {isOpen &&
                    space.rooms.map((room) => (
                      <Row
                        key={room.id}
                        depth={2}
                        icon={<MeetingRoomOutlined sx={iconSx} />}
                        label={room.name}
                      />
                    ))}
                </Fragment>
            );
          })}
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
}: {
  depth: number;
  icon: React.ReactNode;
  label: string;
  bold?: boolean;
  open?: boolean;
  expandable?: boolean;
  onToggle?: () => void;
  menu?: boolean;
}) {
  return (
    <ListItemButton
      sx={{
        height: ROW,
        pl: `${PAD + Math.max(0, depth - 1) * RAIL}px`,
        pr: 1,
      }}
      onClick={expandable ? onToggle : undefined}
    >
      {/* The chevron's place is held even when there is nothing to open,
          so every icon on a level lines up with the others. */}
      {depth > 0 && (
        <Box
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
