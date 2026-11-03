/**
 * The menu a device opens, on the plan or in the devices panel.
 *
 * Figma 2:53230 — Rename device, then Unassign from door or Unassign from
 * space depending on what it is on, with that second item greyed when the
 * device is on nothing. The design draws the disabled variant rather than
 * dropping the row, which is right: an item that disappears is harder to
 * find than one that is visibly unavailable.
 */
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import EditOutlined from "@mui/icons-material/EditOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOff";
import { deviceHost, type Device } from "../../model";

export interface DeviceMenuProps {
  device: Device | null;
  at: { top: number; left: number } | null;
  anchorEl?: HTMLElement | null;
  onClose: () => void;
  onRename: () => void;
  onUnassign: () => void;
}

const iconSx = { minWidth: 0, mr: 2, color: "action.active" } as const;

export function DeviceMenu({
  device,
  at,
  anchorEl,
  onClose,
  onRename,
  onUnassign,
}: DeviceMenuProps) {
  // What it is on, or — once it is on nothing — what it was on. The kind
  // of host survives being unassigned, so the greyed item can still name
  // the right thing instead of guessing "door" for an answering unit.
  const host = device
    ? (deviceHost(device) ?? (device.host_kind === "room" ? "space" : "door"))
    : null;
  const attached = device ? deviceHost(device) !== null : false;

  return (
    <Menu
      open={Boolean(device)}
      onClose={onClose}
      anchorEl={at ? undefined : anchorEl}
      anchorReference={at ? "anchorPosition" : "anchorEl"}
      anchorPosition={at ?? undefined}
    >
      <MenuItem
        sx={{ minHeight: 36 }}
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        <ListItemIcon sx={iconSx}>
          <EditOutlined sx={{ fontSize: 20 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ variant: "body2" }}>
          Rename device
        </ListItemText>
      </MenuItem>

      <MenuItem
        sx={{ minHeight: 36 }}
        disabled={!attached}
        onClick={() => {
          onUnassign();
          onClose();
        }}
      >
        <ListItemIcon sx={iconSx}>
          <LinkOffOutlined sx={{ fontSize: 20 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ variant: "body2" }}>
          {/* Named after what it is on, because taking a reader off a
              door and taking a unit out of a flat are different acts. */}
          {host === "space" ? "Unassign from space" : "Unassign from door"}
        </ListItemText>
      </MenuItem>
    </Menu>
  );
}
