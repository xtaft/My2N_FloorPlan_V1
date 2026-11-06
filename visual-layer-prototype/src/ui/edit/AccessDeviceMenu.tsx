/**
 * What a device offers in access mode.
 *
 * Figma 2:53230, variants AccessMode, AccessModeAdded and AccessBulk.
 *
 * The "path" is the selection itself — the set of credentials the plan
 * is currently answering for. So Show in path adds this device to it
 * and Remove from path takes it out, which is the same act as the
 * checkbox in the panel and is worth offering here because on the map
 * there is no checkbox to reach.
 *
 * Group membership is the other two items, and the bulk variant adds
 * making a group out of what is selected. None of those are built:
 * which devices a group holds is managed outside the floor plan, and a
 * menu that silently does nothing is worse than one that says so.
 */
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import Add from "@mui/icons-material/Add";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import Close from "@mui/icons-material/Close";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";

export interface AccessDeviceMenuProps {
  open: boolean;
  anchorEl?: HTMLElement | null;
  at?: { top: number; left: number } | null;
  /** How many devices the action would apply to. */
  count: number;
  /** Whether the one device is already in the selection. */
  inPath: boolean;
  onClose: () => void;
  onShowInPath: () => void;
  onRemoveFromPath: () => void;
}

const NOT_BUILT =
  "Not built: which devices a group holds is managed outside the floor plan";

const iconSx = { minWidth: 0, mr: 2, color: "action.active" } as const;

export function AccessDeviceMenu({
  open,
  anchorEl,
  at,
  count,
  inPath,
  onClose,
  onShowInPath,
  onRemoveFromPath,
}: AccessDeviceMenuProps) {
  // Several devices in hand is a different menu: there is no single
  // path to put "this" into, and making a group out of a selection is
  // the thing that only makes sense for more than one.
  const bulk = count > 1;

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorEl={at ? undefined : anchorEl}
      anchorReference={at ? "anchorPosition" : "anchorEl"}
      anchorPosition={at ?? undefined}
    >
      {bulk ? (
        <Disabled
          key="create"
          icon={<AddCircleOutline sx={{ fontSize: 20 }} />}
          label="Create group"
        />
      ) : (
        <MenuItem
          sx={{ minHeight: 36 }}
          onClick={() => {
            if (inPath) onRemoveFromPath();
            else onShowInPath();
            onClose();
          }}
        >
          <ListItemIcon sx={iconSx}>
            {inPath ? (
              <VisibilityOffOutlined sx={{ fontSize: 20 }} />
            ) : (
              <VisibilityOutlined sx={{ fontSize: 20 }} />
            )}
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: "body2" }}>
            {inPath ? "Remove from path" : "Show in path"}
          </ListItemText>
        </MenuItem>
      )}

      <Disabled
        key="add"
        icon={<Add sx={{ fontSize: 20 }} />}
        label="Add to group"
      />
      <Divider />
      <Disabled
        key="remove"
        icon={<Close sx={{ fontSize: 20, color: "error.main" }} />}
        label="Remove from group"
        danger
      />
    </Menu>
  );
}

function Disabled({
  icon,
  label,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <Tooltip title={NOT_BUILT}>
      <span>
        <MenuItem sx={{ minHeight: 36 }} disabled>
          <ListItemIcon sx={iconSx}>{icon}</ListItemIcon>
          <ListItemText
            primaryTypographyProps={{
              variant: "body2",
              color: danger ? "error.main" : undefined,
            }}
          >
            {label}
          </ListItemText>
        </MenuItem>
      </span>
    </Tooltip>
  );
}
