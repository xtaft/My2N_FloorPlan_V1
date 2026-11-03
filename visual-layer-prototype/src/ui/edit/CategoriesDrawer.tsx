/**
 * The right-hand space-categories drawer. Figma: ModeDrawer (42:71775) —
 * 320 wide, search, the categories, and an action box at the foot.
 *
 * This is the types panel the doc describes: "A room or group holds no colour
 * of its own, so the types panel owns rename and recolour, and every space of
 * that type follows." Counts are derived, and a category with no spaces still
 * lists, because an empty category is a real state.
 *
 * The Unknown bucket is the doc's "unbound is a valid state": a segmented,
 * not-yet-assigned space is a real thing a manager must resolve.
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
import { accessType, type Room, type VisualLayer } from "../../model";

const UNKNOWN = "__unknown__";

export interface CategoriesDrawerProps {
  layer: VisualLayer;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onRename: (typeId: string, name: string) => void;
  onRecolor: (typeId: string, color: string) => void;
  onNewCategory: () => void;
}

export function CategoriesDrawer({
  layer,
  selectedRoomId,
  onSelectRoom,
  onRename,
  onRecolor,
  onNewCategory,
}: CategoriesDrawerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ el: HTMLElement; typeId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  /** Counts are derived — the file stores none, and a stored one could lie. */
  const buckets = useMemo(() => {
    const byType = new Map<string, Room[]>();
    for (const room of layer.file.rooms) {
      const key = accessType(layer, room) ?? UNKNOWN;
      const list = byType.get(key);
      if (list) list.push(room);
      else byType.set(key, [room]);
    }
    const known = layer.file.space_types.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      rooms: byType.get(t.id) ?? [],
    }));
    const unknown = byType.get(UNKNOWN) ?? [];
    return unknown.length > 0
      ? [
          ...known,
          { id: UNKNOWN, name: "Unknown", color: "#DADDE1", rooms: unknown },
        ]
      : known;
  }, [layer]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? buckets.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.rooms.some((r) => r.name.toLowerCase().includes(q)),
      )
    : buckets;

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
          <IconButton size="small" onClick={() => setOpen({})}>
            <UnfoldLess sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          {visible.map((bucket) => {
            const isOpen = open[bucket.id] ?? false;
            return (
              <Fragment key={bucket.id}>
                <ListItemButton
                  sx={{ minHeight: 48, pl: 1, pr: 1 }}
                  onClick={() =>
                    setOpen((p) => ({ ...p, [bucket.id]: !isOpen }))
                  }
                >
                  <Box sx={{ width: 28, display: "flex", alignItems: "center" }}>
                    {bucket.rooms.length > 0 ? (
                      isOpen ? (
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
                      bgcolor: bucket.color,
                      border: 1,
                      borderColor: "divider",
                    }}
                  />
                  {renaming === bucket.id ? (
                    <TextField
                      size="small"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        if (draft.trim()) onRename(bucket.id, draft.trim());
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (draft.trim()) onRename(bucket.id, draft.trim());
                          setRenaming(null);
                        }
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <ListItemText
                      primary={
                        <Box component="span" sx={{ display: "flex", gap: 1 }}>
                          <span>{bucket.name}</span>
                          <Typography component="span" color="text.secondary">
                            ({bucket.rooms.length})
                          </Typography>
                        </Box>
                      }
                      primaryTypographyProps={{ variant: "body1" }}
                    />
                  )}
                  <IconButton
                    size="small"
                    edge="end"
                    disabled={bucket.id === UNKNOWN}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ el: e.currentTarget, typeId: bucket.id });
                    }}
                  >
                    <MoreVert sx={{ fontSize: 20 }} />
                  </IconButton>
                </ListItemButton>

                {isOpen &&
                  bucket.rooms.map((room) => (
                    <ListItemButton
                      key={room.id}
                      selected={room.id === selectedRoomId}
                      sx={{ pl: 6, pr: 1, minHeight: 68 }}
                      onClick={() => onSelectRoom(room.id)}
                    >
                      <ListItemText
                        primary={room.name}
                        secondary={
                          layer.floors.find((f) => f.id === room.floor_id)?.name
                        }
                        primaryTypographyProps={{ variant: "body1", noWrap: true }}
                        secondaryTypographyProps={{ variant: "body2" }}
                      />
                      <IconButton size="small" edge="end" onClick={(e) => e.stopPropagation()}>
                        <MoreVert sx={{ fontSize: 20 }} />
                      </IconButton>
                    </ListItemButton>
                  ))}
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

      <Menu
        anchorEl={menu?.el ?? null}
        open={menu !== null}
        onClose={() => setMenu(null)}
      >
        <MenuItem
          onClick={() => {
            const bucket = buckets.find((b) => b.id === menu?.typeId);
            setDraft(bucket?.name ?? "");
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
            const next = randomColor();
            if (menu) onRecolor(menu.typeId, next);
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

function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}
