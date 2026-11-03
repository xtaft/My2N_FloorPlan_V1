/**
 * The containment tree: floor > group (envelope) > room, ordered by
 * `sort_index`. Nothing derived reads `sort_index`, which is the test for
 * whether a reorder can break anything — it cannot.
 */
import { Fragment, useState } from "react";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Typography from "@mui/material/Typography";
import {
  floorEnvelopes,
  groupAccessState,
  roomAccessState,
  roomColor,
  spaceTypeName,
  type Group,
  type Reachability,
  type VisualLayer,
} from "../model";

export interface NavigationDrawerProps {
  layer: VisualLayer;
  floorId: string;
  reach: Reachability | null;
  selectedRoomId: string | null;
  selectedGroupId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onSelectGroup: (groupId: string | null) => void;
}

const STATE_COLOR: Record<string, string> = {
  accessible: "#2E7D32",
  partial: "#C77700",
  inaccessible: "#9AA0A6",
  empty: "#9AA0A6",
};

export function NavigationDrawer({
  layer,
  floorId,
  reach,
  selectedRoomId,
  selectedGroupId,
  onSelectRoom,
  onSelectGroup,
}: NavigationDrawerProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderGroup = (group: Group, depth: number) => {
    const rooms = layer.file.rooms.filter((r) => r.group_id === group.id);
    const children = layer.childGroups.get(group.id) ?? [];
    const expandable = rooms.length > 0 || children.length > 0;
    // Everything starts closed: floorEnvelopes already skips the floor's
    // pass-through group, so these are the real envelopes and opening them
    // all would arrive as one long list of every room on the floor.
    const isOpen = open[group.id] ?? false;
    const state = reach ? groupAccessState(layer, reach, group.id) : null;

    return (
      <Fragment key={group.id}>
        <ListItemButton
          selected={group.id === selectedGroupId}
          sx={{ pl: 1 + depth * 2 }}
          onClick={() => {
            onSelectGroup(group.id);
            if (expandable) toggle(group.id);
          }}
        >
          <ListItemText
            primary={group.name}
            secondary={
              group.space_type
                ? layer.spaceTypes.get(group.space_type)?.name
                : "inherits"
            }
            primaryTypographyProps={{ fontSize: 14 }}
            secondaryTypographyProps={{ fontSize: 11 }}
          />
          {state && state !== "empty" && (
            <Chip
              size="small"
              label={state}
              sx={{
                mr: 1,
                height: 18,
                fontSize: 10,
                bgcolor: STATE_COLOR[state],
                color: "#fff",
              }}
            />
          )}
          {expandable && (isOpen ? <ExpandLess /> : <ExpandMore />)}
        </ListItemButton>

        {isOpen && (
          <>
            {children.map((child) => renderGroup(child, depth + 1))}
            {rooms.map((room) => {
              const state = reach ? roomAccessState(reach, room.id) : null;
              return (
                <ListItemButton
                  key={room.id}
                  selected={room.id === selectedRoomId}
                  sx={{ pl: 2 + (depth + 1) * 2 }}
                  onClick={() => onSelectRoom(room.id)}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "2px",
                      mr: 1.5,
                      flexShrink: 0,
                      bgcolor: roomColor(layer, room),
                    }}
                  />
                  <ListItemText
                    primary={room.name}
                    secondary={`${spaceTypeName(layer, room)}${
                      room.surfaced ? " · surfaced" : ""
                    }`}
                    primaryTypographyProps={{ fontSize: 13 }}
                    secondaryTypographyProps={{ fontSize: 11 }}
                  />
                  {state === "blocked" && (
                    <Chip
                      size="small"
                      label="blocked"
                      sx={{
                        height: 18,
                        fontSize: 10,
                        bgcolor: "#C77700",
                        color: "#fff",
                      }}
                    />
                  )}
                </ListItemButton>
              );
            })}
          </>
        )}
      </Fragment>
    );
  };

  const floor = layer.floors.find((f) => f.id === floorId);

  return (
    <Box sx={{ overflowY: "auto", height: "100%" }}>
      <List
        dense
        subheader={
          <ListSubheader sx={{ lineHeight: "32px" }}>
            {/* `level` is shown because a drawer order of 3, 5, 4 is legal and
                should not look like a bug: vertical doors pair levels, never
                drawer rows. */}
            {floor ? `${floor.name} — level ${floor.level}` : floorId}
          </ListSubheader>
        }
      >
        {floorEnvelopes(layer, floorId).map((group) => renderGroup(group, 0))}
      </List>

      <Box sx={{ px: 2, pb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Envelopes nest to any depth and carry no access meaning. The access
          graph runs over rooms.
        </Typography>
      </Box>
    </Box>
  );
}
