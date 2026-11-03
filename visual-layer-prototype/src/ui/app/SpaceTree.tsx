/**
 * The building's spaces, flat.
 *
 * Figma: 2:24387 — the panel beside the icon rail. There are no floors in
 * it, and that is the point of the screen: before the plan exists, the
 * customer has a list of apartments and common spaces and no idea which
 * storey any of them is on. Drawing the plan is what adds that.
 */
import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import type { BuildingSpace } from "../../model";

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
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1 }}>
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

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 1,
          }}
        >
          <ApartmentOutlined sx={{ fontSize: 18 }} />
          <Typography variant="body2" fontWeight={500}>
            {buildingName}
          </Typography>
        </Box>

        <List dense disablePadding>
          {visible.map((space) => {
            const expandable = space.rooms.length > 1;
            const isOpen = open.has(space.id) || (matches && expandable);
            return (
              <Fragment key={space.id}>
                <ListItemButton
                  sx={{ pl: 1, pr: 0.5, minHeight: 41 }}
                  onClick={() => expandable && toggle(space.id)}
                >
                  <Box sx={{ width: 24, display: "flex" }}>
                    {expandable ? (
                      isOpen ? (
                        <ExpandMore sx={{ fontSize: 18 }} />
                      ) : (
                        <ChevronRight sx={{ fontSize: 18 }} />
                      )
                    ) : null}
                  </Box>
                  <SpaceIcon space={space} />
                  <ListItemText
                    primary={space.name}
                    primaryTypographyProps={{ variant: "body2", noWrap: true }}
                  />
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVert sx={{ fontSize: 18 }} />
                  </IconButton>
                </ListItemButton>

                {isOpen &&
                  space.rooms.map((room) => (
                    <ListItemButton key={room.id} sx={{ pl: 6, minHeight: 36 }}>
                      <ListItemText
                        primary={room.name}
                        primaryTypographyProps={{
                          variant: "body2",
                          noWrap: true,
                        }}
                      />
                    </ListItemButton>
                  ))}
              </Fragment>
            );
          })}
        </List>
      </Box>
    </Box>
  );
}

/**
 * A door for anything somebody is let into, a generic shape for the rest —
 * the same rule the editor's tree follows, so one building does not have
 * two icon languages.
 */
function SpaceIcon({ space }: { space: BuildingSpace }) {
  const sx = { fontSize: 18, mr: 1, color: "text.secondary" } as const;
  if (space.apartment) return <MeetingRoomOutlined sx={sx} />;
  if (space.rooms.length > 1) return <WidgetsOutlined sx={sx} />;
  return <MeetingRoomOutlined sx={sx} />;
}
