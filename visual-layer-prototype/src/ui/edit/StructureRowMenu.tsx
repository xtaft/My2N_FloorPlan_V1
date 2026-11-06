/**
 * The row menu in the structure tree.
 *
 * Figma: `<Menu> floorPlanSpacesPlan` (93:158689 / 93:158690) — 256 wide,
 * 36px items, a 20px icon in action/active, body1 label, a divider before
 * the destructive half, and Delete in error/main. Two variants: a room gets
 * the full set, an envelope gets rename, fold, categorise and delete.
 *
 * Changing the category opens in place rather than as a nested menu. A
 * submenu that has to be kept open while the pointer crosses a gap is the
 * fiddliest thing in any menu, and there is nothing here that a second page
 * does not say just as well.
 */
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import ArrowBack from "@mui/icons-material/ArrowBack";
import Class from "@mui/icons-material/Class";
import Delete from "@mui/icons-material/Delete";
import Edit from "@mui/icons-material/Edit";
import LocationOff from "@mui/icons-material/LocationOff";
import PlaylistRemove from "@mui/icons-material/PlaylistRemove";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { roomsInGroup, type Group, type Room, type VisualLayer } from "../../model";

export type RowTarget =
  | { kind: "room"; room: Room }
  | { kind: "group"; group: Group };

export interface StructureRowMenuProps {
  layer: VisualLayer;
  /** A tree row's button, or null when the menu came from the plan. */
  anchorEl: HTMLElement | null;
  /** Where on the plan it was opened, for a click on a space. */
  at?: { top: number; left: number } | null;
  target: RowTarget | null;
  onClose: () => void;
  onRename: () => void;
  /** Fold the room away, or the envelope's rooms; or bring them back. */
  onToggleHidden: (hide: boolean) => void;
  onAssignCategory: (typeId: string | null) => void;
  onDetach: () => void;
  onUnassign: () => void;
  onDelete: () => void;
}

const ICON = { fontSize: 20 } as const;
const itemSx = { minHeight: 36, py: 0.25 } as const;
const iconSx = { minWidth: 0, mr: 2, color: "action.active" } as const;

export function StructureRowMenu({
  layer,
  anchorEl,
  at = null,
  target,
  onClose,
  onRename,
  onToggleHidden,
  onAssignCategory,
  onDetach,
  onUnassign,
  onDelete,
}: StructureRowMenuProps) {
  const [page, setPage] = useState<"main" | "category">("main");

  // A menu that reopens on the next row should not still be showing the
  // category list it was left on.
  useEffect(() => {
    if (!anchorEl && !at) setPage("main");
  }, [anchorEl, at]);

  const open = Boolean(anchorEl || at) && target !== null;
  const isRoom = target?.kind === "room";
  // An envelope counts as folded when nothing inside it is on the map, so
  // the item offers the move that is actually available.
  const hidden = target
    ? target.kind === "room"
      ? !target.room.surfaced
      : roomsInGroup(layer, target.group.id).every((r) => !r.surfaced)
    : false;
  const current = isRoom ? target.room.space_type : target?.group.space_type;

  const item = (
    key: string,
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    opts: { danger?: boolean; disabled?: boolean; why?: string } = {},
  ) => {
    const node = (
      <MenuItem
        key={key}
        sx={itemSx}
        disabled={opts.disabled}
        onClick={() => {
          onClick();
          onClose();
        }}
      >
        <ListItemIcon
          sx={opts.danger ? { ...iconSx, color: "error.main" } : iconSx}
        >
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={label}
          primaryTypographyProps={{
            variant: "body1",
            color: opts.danger ? "error.main" : "text.primary",
          }}
        />
      </MenuItem>
    );
    // A disabled MenuItem swallows pointer events, so the reason has to be
    // on a wrapper or it never shows.
    return opts.why ? (
      <Tooltip key={key} title={opts.why} placement="right">
        <span>{node}</span>
      </Tooltip>
    ) : (
      node
    );
  };

  return (
    <Menu
      anchorEl={at ? undefined : anchorEl}
      anchorReference={at ? "anchorPosition" : "anchorEl"}
      anchorPosition={at ?? undefined}
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 256 } } }}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      {page === "category"
        ? [
            <MenuItem key="back" sx={itemSx} onClick={() => setPage("main")}>
              <ListItemIcon sx={iconSx}>
                <ArrowBack sx={ICON} />
              </ListItemIcon>
              <ListItemText
                primary="Space category"
                primaryTypographyProps={{ variant: "body1" }}
              />
            </MenuItem>,
            <Divider key="d" />,
            ...layer.file.space_types.map((type) => (
              <MenuItem
                key={type.id}
                sx={itemSx}
                selected={current === type.id}
                onClick={() => {
                  onAssignCategory(type.id);
                  onClose();
                }}
              >
                <ListItemIcon sx={iconSx}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: "2px",
                      bgcolor: type.color,
                      border: 1,
                      borderColor: "divider",
                    }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={type.name}
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </MenuItem>
            )),
            <MenuItem
              key="inherit"
              sx={itemSx}
              selected={current === null}
              onClick={() => {
                onAssignCategory(null);
                onClose();
              }}
            >
              <ListItemIcon sx={iconSx} />
              <ListItemText
                primary="Inherit from envelope"
                primaryTypographyProps={{ variant: "body1" }}
              />
            </MenuItem>,
          ]
        : [
            item("rename", <Edit sx={ICON} />, "Rename", onRename),
            item(
              "hide",
              hidden ? <Visibility sx={ICON} /> : <VisibilityOff sx={ICON} />,
              isRoom
                ? hidden
                  ? "Show"
                  : "Hide"
                : hidden
                  ? "Show rooms"
                  : "Hide rooms",
              () => onToggleHidden(!hidden),
            ),
            <MenuItem
              key="category"
              sx={itemSx}
              onClick={() => setPage("category")}
            >
              <ListItemIcon sx={iconSx}>
                <Class sx={ICON} />
              </ListItemIcon>
              <ListItemText
                primary="Change space category"
                primaryTypographyProps={{ variant: "body1" }}
              />
            </MenuItem>,
            <Divider key="divider" sx={{ my: 1 }} />,
            // Detach and Unassign appear only where they mean something,
            // which is what the variants in the design differ by: there is
            // no group to leave if it is in none, and nothing to unassign
            // from the map if it is not on it.
            ...(isRoom
              ? [
                  ...(target.room.group_id !== null
                    ? [
                        item(
                          "detach",
                          <PlaylistRemove sx={ICON} />,
                          "Detach from group",
                          onDetach,
                        ),
                      ]
                    : []),
                  ...(target.room.surfaced
                    ? [
                        item(
                          "unassign",
                          <LocationOff sx={ICON} />,
                          "Unassign from map",
                          onUnassign,
                        ),
                      ]
                    : []),
                  item("delete", <Delete sx={ICON} />, "Delete", onDelete, {
                    danger: true,
                  }),
                ]
              : [
                  item("delete", <Delete sx={ICON} />, "Delete", onDelete, {
                    danger: true,
                  }),
                ]),
          ]}
    </Menu>
  );
}
