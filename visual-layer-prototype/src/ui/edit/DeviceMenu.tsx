/**
 * The menu a device opens, on the plan or in the devices panel.
 *
 * Figma 2:53231 — Rename device, Change door side, then after a rule
 * Unassign from door or Unassign from space depending on what it is on.
 * Change door side is for a reader on a door and greyed otherwise; the
 * last item is greyed when the device is on nothing. The design draws the disabled variant rather than
 * dropping the row, which is right: an item that disappears is harder to
 * find than one that is visibly unavailable.
 */
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import EditOutlined from "@mui/icons-material/EditOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOff";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import { deviceHost, type Device } from "../../model";

export interface DeviceMenuProps {
  device: Device | null;
  at: { top: number; left: number } | null;
  anchorEl?: HTMLElement | null;
  onClose: () => void;
  onRename: () => void;
  /** The reader moves to the other side of its door and checks the other way. */
  onFlipSide: () => void;
  onUnassign: () => void;
}

const iconSx = { minWidth: 0, mr: 2, color: "action.active" } as const;

export function DeviceMenu({
  device,
  at,
  anchorEl,
  onClose,
  onRename,
  onFlipSide,
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
        disabled={!(attached && host === "door")}
        onClick={() => {
          onFlipSide();
          onClose();
        }}
      >
        <ListItemIcon sx={iconSx}>
          <SwapHorizOutlined sx={{ fontSize: 20 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ variant: "body2" }}>
          Change door side
        </ListItemText>
      </MenuItem>

      <Divider />

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
