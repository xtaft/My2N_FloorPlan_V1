/**
 * The menu a person opens in the access panel.
 *
 * Figma 37:48428 — Add to group, then Remove from group in error/main.
 *
 * Add to group opens a second menu in its place: a search box over the
 * groups they are not yet in, and picking one puts them in it. From
 * then on they hold its devices, and if they are the person the plan
 * is being asked about, the plan already shows where that gets them.
 * Remove from group takes them out of the one group they are in, or
 * asks which when they are in several, the same way.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Add from "@mui/icons-material/Add";
import Close from "@mui/icons-material/Close";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { groupsOf, type AccessGroup } from "../../model";

export interface PersonMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  personId: string | null;
  groups: readonly AccessGroup[];
  onClose: () => void;
  onAddToGroup: (groupId: string) => void;
  onRemoveFromGroup: (groupId: string) => void;
}

const iconSx = { minWidth: 0, mr: 2 } as const;

export function PersonMenu({
  open,
  anchorEl,
  personId,
  groups,
  onClose,
  onAddToGroup,
  onRemoveFromGroup,
}: PersonMenuProps) {
  /** Which list the search is over, once an item has been chosen. */
  const [picking, setPicking] = useState<"add" | "remove" | null>(null);

  const mine = personId ? groupsOf(groups, personId) : [];
  const others = personId ? groups.filter((g) => !g.people.includes(personId)) : [];

  const close = () => {
    setPicking(null);
    onClose();
  };

  if (picking) {
    const options = picking === "add" ? others : mine;
    return (
      <GroupPicker
        anchorEl={anchorEl}
        title={picking === "add" ? "Add to group" : "Remove from group"}
        options={options}
        onPick={(id) => {
          if (picking === "add") onAddToGroup(id);
          else onRemoveFromGroup(id);
          close();
        }}
        onClose={close}
      />
    );
  }

  return (
    <Menu open={open} anchorEl={anchorEl} onClose={close}>
      <Tooltip title={others.length === 0 ? "They are in every group there is" : ""}>
        <span>
          <MenuItem
            sx={{ minHeight: 36 }}
            disabled={others.length === 0}
            onClick={() => setPicking("add")}
          >
            <ListItemIcon sx={{ ...iconSx, color: "action.active" }}>
              <Add sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: "body2" }}>
              Add to group
            </ListItemText>
          </MenuItem>
        </span>
      </Tooltip>
      <Tooltip title={mine.length === 0 ? "They are not in a group" : ""}>
        <span>
          <MenuItem
            sx={{ minHeight: 36 }}
            disabled={mine.length === 0}
            onClick={() => {
              // One group needs no asking which.
              if (mine.length === 1) {
                onRemoveFromGroup(mine[0].id);
                close();
              } else {
                setPicking("remove");
              }
            }}
          >
            <ListItemIcon sx={{ ...iconSx, color: "error.main" }}>
              <Close sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primaryTypographyProps={{ variant: "body2", color: "error.main" }}
            >
              Remove from group
            </ListItemText>
          </MenuItem>
        </span>
      </Tooltip>
    </Menu>
  );
}

/**
 * A search over groups, in the menu's place. The box takes the keys
 * the menu would otherwise use to move between items, so typing a
 * name types it rather than jumping the highlight about.
 */
function GroupPicker({
  anchorEl,
  title,
  options,
  onPick,
  onClose,
}: {
  anchorEl: HTMLElement | null;
  title: string;
  options: AccessGroup[];
  onPick: (groupId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = options.filter((g) => !q || g.name.toLowerCase().includes(q));

  return (
    <Menu
      open
      anchorEl={anchorEl}
      onClose={onClose}
      autoFocus={false}
      MenuListProps={{ sx: { width: 280, pt: 0 } }}
    >
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
        <TextField
          autoFocus
          size="small"
          fullWidth
          placeholder="Search groups"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          sx={{ mt: 0.5 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      {shown.map((g) => (
        <MenuItem key={g.id} sx={{ minHeight: 40 }} onClick={() => onPick(g.id)}>
          <ListItemIcon sx={{ ...iconSx, color: "action.active" }}>
            <GroupOutlined sx={{ fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary={g.name}
            secondary={`${g.devices.length} device${g.devices.length === 1 ? "" : "s"} · ${g.people.length} people`}
            primaryTypographyProps={{ variant: "body2" }}
            secondaryTypographyProps={{ variant: "caption" }}
          />
        </MenuItem>
      ))}
      {shown.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
          No group matches “{query}”.
        </Typography>
      )}
    </Menu>
  );
}
