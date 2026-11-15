/**
 * The row menu in the structure tree.
 *
 * Figma: `<Menu> floorPlanSpacesPlan` (93:158689 / 93:158690), and the
 * full set for a room in 153:304964 — 256 wide, 36px items, a 20px icon
 * in action/active, body1 label, one divider, and Delete under it in
 * error/main.
 *
 * A room gets everything: Rename, Reorder, Hide, Change space category,
 * Detach from group, Unassign from map, Delete. The other rows get the
 * part of that which means something for them — an envelope has no
 * group to detach from, and a floor can only be reordered within.
 * Reorder is on every row of the tree: it turns the tree into something
 * that can be dragged, and any row is a fair place to ask for that.
 *
 * A space with no shape is not in the tree; its menu opens from the
 * drawer, and offers the two things that can be done with it: put it on
 * the plan, or drop it.
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
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import PlaylistRemove from "@mui/icons-material/PlaylistRemove";
import SwapVert from "@mui/icons-material/SwapVert";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import {
  groupAccessType,
  roomsInGroup,
  type Floor,
  type Group,
  type Room,
  type UnplacedSpace,
  type VisualLayer,
} from "../../model";

export type RowTarget =
  | { kind: "room"; room: Room }
  | { kind: "group"; group: Group }
  | { kind: "floor"; floor: Floor }
  /** A space with no shape on the plan: unassigned, or never placed. */
  | { kind: "space"; space: UnplacedSpace };

export interface StructureRowMenuProps {
  layer: VisualLayer;
  /** A tree row's button, or null when the menu came from the plan. */
  anchorEl: HTMLElement | null;
  /** Where on the plan it was opened, for a click on a space. */
  at?: { top: number; left: number } | null;
  target: RowTarget | null;
  onClose: () => void;
  onRename: () => void;
  /** Turns the tree into one that can be dragged. */
  onReorder: () => void;
  /** Arms a space with no shape, to be put on a space on the plan. */
  onPlace: () => void;
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
  onReorder,
  onPlace,
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
  const hidden =
    target?.kind === "room"
      ? !target.room.surfaced
      : target?.kind === "group"
        ? roomsInGroup(layer, target.group.id).every((r) => !r.surfaced)
        : false;
  const current =
    target?.kind === "room"
      ? target.room.space_type
      : target?.kind === "group"
        ? target.group.space_type
        : undefined;

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

  const rename = () => item("rename", <Edit sx={ICON} />, "Rename", onRename);
  const reorder = () => item("reorder", <SwapVert sx={ICON} />, "Reorder", onReorder);
  const category = () => (
    <MenuItem key="category" sx={itemSx} onClick={() => setPage("category")}>
      <ListItemIcon sx={iconSx}>
        <Class sx={ICON} />
      </ListItemIcon>
      <ListItemText
        primary="Change space category"
        primaryTypographyProps={{ variant: "body1" }}
      />
    </MenuItem>
  );
  const unassign = () =>
    item("unassign", <LocationOff sx={ICON} />, "Unassign from map", onUnassign);
  const divider = () => <Divider key="divider" sx={{ my: 1 }} />;
  const remove = () =>
    item("delete", <Delete sx={ICON} />, "Delete", onDelete, { danger: true });

  /** The items for whatever the menu is on, in the design's order. */
  const mainPage = (): React.ReactNode[] => {
    if (!target) return [];
    if (target.kind === "floor") return [reorder()];
    if (target.kind === "space") {
      return [
        item("place", <PlaceOutlined sx={ICON} />, "Place on the plan", onPlace),
        divider(),
        remove(),
      ];
    }
    const hide = item(
      "hide",
      hidden ? <Visibility sx={ICON} /> : <VisibilityOff sx={ICON} />,
      isRoom ? (hidden ? "Show" : "Hide") : hidden ? "Show rooms" : "Hide rooms",
      () => onToggleHidden(!hidden),
    );
    if (target.kind === "room") {
      return [
        rename(),
        reorder(),
        hide,
        category(),
        // Detach and Unassign appear only where they mean something:
        // there is no group to leave if it is in none, and nothing to
        // unassign from the map if it is not drawn on it in its own right.
        ...(target.room.group_id !== null
          ? [item("detach", <PlaylistRemove sx={ICON} />, "Detach from group", onDetach)]
          : []),
        ...(target.room.surfaced ? [unassign()] : []),
        divider(),
        remove(),
      ];
    }
    return [
      rename(),
      reorder(),
      hide,
      category(),
      // Only an apartment comes off the map whole: it is the one kind of
      // envelope the building knows by name apart from its walls.
      ...(groupAccessType(layer, target.group) === "apartment" ? [unassign()] : []),
      divider(),
      remove(),
    ];
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
        : mainPage()}
    </Menu>
  );
}
