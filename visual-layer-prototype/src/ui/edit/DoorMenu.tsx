/**
 * The menu a door opens when it is clicked on the plan.
 *
 * Figma 36:45300 — Flip wall side, Flip opening side, then Delete in
 * error/main below a divider.
 *
 * Both flips exist because a door's orientation is read off the drawing's
 * swing arc during segmentation, and an ambiguous arc produces a confident
 * wrong answer. Nothing else in the model can tell which way a leaf opens,
 * so nothing else can correct it.
 */
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Delete from "@mui/icons-material/Delete";
import FlipOutlined from "@mui/icons-material/FlipOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import type { Door } from "../../model";

export interface DoorMenuProps {
  door: Door | null;
  at: { top: number; left: number } | null;
  onClose: () => void;
  onFlipSwing: () => void;
  onFlipHinge: () => void;
  onDelete: () => void;
}

const ICON = { fontSize: 20 } as const;
const itemSx = { minHeight: 36, py: 0.25 } as const;
const iconSx = { minWidth: 0, mr: 2, color: "action.active" } as const;

export function DoorMenu({
  door,
  at,
  onClose,
  onFlipSwing,
  onFlipHinge,
  onDelete,
}: DoorMenuProps) {
  const item = (
    key: string,
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    danger = false,
  ) => (
    <MenuItem
      key={key}
      sx={itemSx}
      onClick={() => {
        onClick();
        onClose();
      }}
    >
      <ListItemIcon sx={danger ? { ...iconSx, color: "error.main" } : iconSx}>
        {icon}
      </ListItemIcon>
      <ListItemText
        primary={label}
        primaryTypographyProps={{
          variant: "body1",
          color: danger ? "error.main" : "text.primary",
        }}
      />
    </MenuItem>
  );

  return (
    <Menu
      open={Boolean(door && at)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={at ?? undefined}
      slotProps={{ paper: { sx: { width: 256 } } }}
    >
      {item(
        "swing",
        <SwapHorizOutlined sx={ICON} />,
        "Flip wall side",
        onFlipSwing,
      )}
      {item(
        "hinge",
        <FlipOutlined sx={ICON} />,
        "Flip opening side",
        onFlipHinge,
      )}
      <Divider key="d" sx={{ my: 1 }} />
      {item("delete", <Delete sx={ICON} />, "Delete", onDelete, true)}
    </Menu>
  );
}
