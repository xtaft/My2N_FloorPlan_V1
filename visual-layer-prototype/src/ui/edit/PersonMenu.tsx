/**
 * The menu a person opens in the access panel.
 *
 * Figma 37:48428 — Add to group, then Remove from group in error/main.
 * Which groups are offered is the product's business; this prototype
 * shows the two actions and says plainly that neither is wired, rather
 * than drawing a menu that silently does nothing.
 */
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Add from "@mui/icons-material/Add";
import Close from "@mui/icons-material/Close";

export interface PersonMenuProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  /** Whether they are in any group, which is what there is to remove. */
  inAGroup: boolean;
  onClose: () => void;
}

const iconSx = { minWidth: 0, mr: 2 } as const;

export function PersonMenu({
  open,
  anchorEl,
  inAGroup,
  onClose,
}: PersonMenuProps) {
  return (
    <Menu open={open} anchorEl={anchorEl} onClose={onClose}>
      <Tooltip title="Not built: which groups a person is in is managed outside the floor plan">
        <span>
          <MenuItem sx={{ minHeight: 36 }} disabled>
            <ListItemIcon sx={{ ...iconSx, color: "action.active" }}>
              <Add sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: "body2" }}>
              Add to group
            </ListItemText>
          </MenuItem>
        </span>
      </Tooltip>
      <Tooltip
        title={
          inAGroup
            ? "Not built: which groups a person is in is managed outside the floor plan"
            : "They are not in a group"
        }
      >
        <span>
          <MenuItem sx={{ minHeight: 36 }} disabled>
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
