/**
 * The left-hand containment tree: building ⊃ floor ⊃ envelope ⊃ room.
 * Figma: NavigationTreeFloorPlan (37:60005) — 256 wide, a 56px search box, the
 * tree, and a 56px action box at the foot.
 *
 * The building level is display only. The model has no building entity: a
 * floor is the top of the containment tree, because geometry does not cross
 * floors and nothing derived reads above one.
 *
 * Expansion is one flat map keyed by row id, so every row opens and closes on
 * its own: expanding one leaves the others as they were, and the arrow that
 * opened a row closes it again. Which floor the canvas shows is a separate
 * thing from which floor rows are open — tying them together meant opening a
 * floor collapsed the last one, and an open floor could not be folded at all.
 *
 * What is listed, and in which order, is the model's to say (`treeChildren`):
 * the tree draws rows and does not decide them. Mostly that is what is
 * drawn. A space unassigned from the map is here as the unnamed room it
 * left on its floor, and its name waits in the drawer on the right. A space
 * a rooms list named, with a floor, that matched nothing on the plan has no
 * room to stand for it, so it is a row of its own: greyed, and marked as
 * not placed.
 *
 * Reorder (Figma 153:304964) is a mode, entered from any row's menu. In it
 * the rows drag: up and down among their siblings, into a group, and — for
 * a space with no shape — onto another floor. The model says what may go
 * where; the tree only asks it, and shows the answer while the row is held.
 */
import { Fragment, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import DragIndicator from "@mui/icons-material/DragIndicator";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import type { RowTarget } from "./StructureRowMenu";
import { InlineRename } from "./InlineRename";
import { ResizeHandle } from "./ResizeHandle";
import { PRESSED_BACKGROUND } from "./EditorChrome";
import { PANEL_BACKGROUND } from "../theme";
import { AttentionBadge } from "../AttentionBadge";
import {
  floorsNeedingAlignment,
  envelopeChain,
  groupAccessType,
  isRoomListed,
  roomColor,
  treeChildren,
  treeMoveRefusal,
  type Group,
  type AccessBadges,
  type Room,
  type TreeDrop,
  type TreeNode,
  type TreePlace,
  type TreeRef,
  type UnplacedSpace,
  type VisualLayer,
} from "../../model";

/**
 * Circulation, stairs and lifts are left out of this tree. They are the
 * building's connective tissue rather than things a manager administers, and
 * they repeat on every storey — four hallways, five stairwells, five lift
 * cars — so listing them buries the units. They are still on the map, still
 * in the access graph, and still in the categories drawer on the right.
 */
const HIDDEN_FROM_TREE = new Set(["circulation", "stairs", "elevator"]);

/** The line and the fill that say where a held row would land. */
const DROP_COLOR = "#2196f3";

/** "You can get in here" — Figma 129:291629. */
function AccessDot() {
  return (
    <Box
      component="span"
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        bgcolor: "#2E9E4F",
        flexShrink: 0,
        ml: 1,
      }}
    />
  );
}

/** Narrow enough to still read a room name, wide enough for a deep flat. */
export const TREE_MIN = 200;
export const TREE_MAX = 560;
export const TREE_DEFAULT = 256;

export interface StructureTreeProps {
  layer: VisualLayer;
  buildingName: string;
  /** The floor the canvas is showing — not the same as which rows are open. */
  floorId: string;
  onFloorChange: (floorId: string) => void;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  /** Pointing at an envelope lights the whole of it, the way a flat is one shape. */
  onSelectGroup?: (groupId: string | null) => void;
  selectedGroupId?: string | null;
  /**
   * Opens the row menu. Left out in devices and access mode: every item
   * on a row's menu edits the structure — its name, its category, its
   * place — so in the modes that are about something else there is
   * nothing on it to offer, and the row draws no button rather than one
   * that opens an empty menu.
   */
  onRowMenu?: (el: HTMLElement, target: RowTarget) => void;
  /**
   * Rows the current access selection reaches. Access mode only — the
   * map shows one storey at a time, so this is the only thing that can
   * say where in the *building* somebody gets.
   */
  badges?: AccessBadges | null;
  /** The row being renamed in place, if any, and the text so far. */
  renaming: { id: string; draft: string } | null;
  onRenameChange: (draft: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  /** Figma has it at 256; the user can have it wider. */
  width: number;
  onWidthChange: (width: number) => void;
  /**
   * Opens the Add new space dialog. Structure mode only — in the
   * other modes the button draws disabled, since what it makes is
   * structure.
   */
  onNewSpace?: () => void;
  /** The rows can be dragged: entered from a row's Reorder. */
  reordering?: boolean;
  onReorderDone?: () => void;
  /** A row was let go somewhere it may go. */
  onMove?: (moving: TreeRef, to: TreeDrop) => void;
}

/** What a row is to a drag: something to move, somewhere to land, or both. */
interface RowDnd {
  /** What dragging this row moves. A floor has none: storeys stay put. */
  ref?: TreeRef;
  /** Where the row is listed, and the id its siblings know it by. */
  place?: TreePlace;
  orderId?: string;
  /** Where a drop *into* this row goes. Absent where it can hold nothing. */
  into?: TreePlace;
}

type Zone = "before" | "after" | "into";

const nameOf = (node: TreeNode) =>
  node.kind === "group"
    ? node.group.name
    : node.kind === "room"
      ? node.room.name
      : node.space.name;

export function StructureTree({
  layer,
  buildingName,
  floorId,
  onFloorChange,
  selectedRoomId,
  onSelectRoom,
  onSelectGroup,
  selectedGroupId = null,
  onRowMenu,
  badges = null,
  renaming,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  width,
  onWidthChange,
  onNewSpace,
  reordering = false,
  onReorderDone,
  onMove,
}: StructureTreeProps) {
  const [query, setQuery] = useState("");
  // Absent means closed. The floor on screen when the tree first mounts
  // starts open so there is something to look at.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [floorId]: true,
  }));
  /** The row in the hand, where it would land, and why not if it would not. */
  const [drag, setDrag] = useState<TreeRef | null>(null);
  const [over, setOver] = useState<{ key: string; zone: Zone } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  /**
   * Open the way to the selected room, once it is a room the tree names.
   *
   * Surfacing a bedroom is meant to make it appear here, but it sits inside a
   * flat that is probably folded, so the change would be invisible. This also
   * means clicking a room on the map reveals where it lives.
   */
  useEffect(() => {
    if (!selectedRoomId) return;
    const room = layer.rooms.get(selectedRoomId);
    if (!room || !isRoomListed(layer, room)) return;
    const path = [room.floor_id, ...envelopeChain(layer, room)];
    setExpanded((prev) => {
      if (path.every((id) => prev[id])) return prev;
      const next = { ...prev };
      for (const id of path) next[id] = true;
      return next;
    });
  }, [layer, selectedRoomId]);

  // Leaving the mode mid-drag must not leave a line drawn across a row.
  useEffect(() => {
    if (reordering) return;
    setDrag(null);
    setOver(null);
    setRefusal(null);
  }, [reordering]);

  const isExpanded = (id: string) => expanded[id] === true;
  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const open = (id: string) =>
    setExpanded((prev) => (prev[id] ? prev : { ...prev, [id]: true }));

  const q = query.trim().toLowerCase();
  const selfMatches = (node: TreeNode) =>
    nameOf(node).toLowerCase().includes(q) ||
    (node.kind === "room" && node.room.id.toLowerCase().includes(q));
  /** A row survives a search by matching it, or by holding something that does. */
  const shows = (node: TreeNode): boolean =>
    selfMatches(node) ||
    (node.kind === "group" &&
      treeChildren(layer, { floorId: node.group.floor_id, groupId: node.group.id }).some(shows));

  /** Floors whose stairs and lifts are not over the ones below. */
  const misaligned = floorsNeedingAlignment(layer);

  // A search rearranges what is on screen, and a drag across rows that
  // are only there because they matched says nothing about order.
  const draggable = reordering && q === "";

  /** Where letting go on this row, in this part of it, would put the drag. */
  const dropFor = (dnd: RowDnd, zone: Zone): TreeDrop | null => {
    if (zone === "into") return dnd.into ? { ...dnd.into, beforeId: null } : null;
    if (!dnd.place || !dnd.orderId) return null;
    if (zone === "before") return { ...dnd.place, beforeId: dnd.orderId };
    const siblings = treeChildren(layer, dnd.place);
    const at = siblings.findIndex((n) => n.id === dnd.orderId);
    return { ...dnd.place, beforeId: siblings[at + 1]?.id ?? null };
  };

  /**
   * Which part of the row the pointer is in. A row that can hold things
   * has a middle that means "into it" and edges that mean beside it; a
   * row that cannot has only halves. A floor is all middle.
   */
  const zoneAt = (e: React.DragEvent<HTMLElement>, dnd: RowDnd): Zone => {
    if (!dnd.place) return "into";
    const box = e.currentTarget.getBoundingClientRect();
    const t = (e.clientY - box.top) / box.height;
    if (dnd.into) return t < 0.3 ? "before" : t > 0.7 ? "after" : "into";
    return t < 0.5 ? "before" : "after";
  };

  /**
   * Where the held row would land on this row, or why it cannot.
   *
   * The middle of a row that holds things means "into it" — unless this
   * row may not go in, and then the middle means beside it, like the
   * edges. Otherwise reordering apartments would mean aiming for a
   * sliver: an apartment dropped on an apartment can only ever have
   * meant next to it.
   */
  const landing = (
    e: React.DragEvent<HTMLElement>,
    dnd: RowDnd,
    moving: TreeRef,
  ): { zone: Zone; to: TreeDrop } | { why: string | null } => {
    const attempt = (zone: Zone) => {
      const to = dropFor(dnd, zone);
      return { zone, to, why: to ? treeMoveRefusal(layer, moving, to) : null };
    };
    const first = attempt(zoneAt(e, dnd));
    if (first.to && !first.why) return { zone: first.zone, to: first.to };
    if (first.zone === "into" && dnd.place) {
      const box = e.currentTarget.getBoundingClientRect();
      const beside = attempt(e.clientY - box.top < box.height / 2 ? "before" : "after");
      if (beside.to && !beside.why) return { zone: beside.zone, to: beside.to };
    }
    return { why: first.why };
  };

  const endDrag = () => {
    setDrag(null);
    setOver(null);
    setRefusal(null);
  };

  const row = (
    key: string,
    depth: number,
    icon: React.ReactNode,
    label: string,
    opts: {
      expandable?: boolean;
      expanded?: boolean;
      onToggle?: () => void;
      onClick?: () => void;
      selected?: boolean;
      bold?: boolean;
      /** Paints the icon in the space's own colour. */
      tint?: string;
      /** Named in the structure but not drawn: nothing to select. */
      muted?: boolean;
      onMenu?: (el: HTMLElement) => void;
      /** Says what is wrong with the row, on the orange mark. */
      attention?: string;
      /** A mark after the name: what state the row is in. */
      trailing?: React.ReactNode;
      dnd?: RowDnd;
    } = {},
  ) => {
    const dnd = opts.dnd;
    const held = drag !== null && dnd?.ref?.kind === drag.kind && dnd.ref.id === drag.id;
    const zone = over?.key === key ? over.zone : null;

    const dragProps =
      draggable && dnd
        ? {
            draggable: Boolean(dnd.ref),
            onDragStart: (e: React.DragEvent<HTMLElement>) => {
              if (!dnd.ref) return;
              e.dataTransfer.setData("text/plain", label);
              e.dataTransfer.effectAllowed = "move";
              setDrag(dnd.ref);
            },
            onDragEnd: endDrag,
            onDragOver: (e: React.DragEvent<HTMLElement>) => {
              if (!drag || held) {
                if (over) setOver(null);
                return;
              }
              const at = landing(e, dnd, drag);
              if ("why" in at) {
                // Not preventing the default is what refuses the drop;
                // the banner says why, since a "no" cursor does not.
                if (over) setOver(null);
                if (refusal !== at.why) setRefusal(at.why);
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over?.key !== key || over.zone !== at.zone) setOver({ key, zone: at.zone });
              if (refusal) setRefusal(null);
            },
            onDrop: (e: React.DragEvent<HTMLElement>) => {
              e.preventDefault();
              const moving = drag;
              const at = moving ? landing(e, dnd, moving) : { why: null };
              endDrag();
              if (!moving || "why" in at) return;
              // Dropped into something folded, it would vanish from view.
              if (at.zone === "into" && dnd.into) {
                open(dnd.into.groupId ?? dnd.into.floorId);
              }
              onMove?.(moving, at.to);
            },
          }
        : {};

    return (
      <ListItemButton
        key={key}
        selected={opts.selected}
        onClick={opts.onClick}
        {...dragProps}
        sx={{
          pl: 1 + depth * 2,
          pr: 1,
          minHeight: 48,
          opacity: held ? 0.35 : 1,
          cursor: draggable && dnd?.ref ? "grab" : undefined,
          ...(zone === "into"
            ? { bgcolor: PRESSED_BACKGROUND, boxShadow: `inset 0 0 0 2px ${DROP_COLOR}` }
            : zone === "before"
              ? { boxShadow: `inset 0 2px 0 ${DROP_COLOR}` }
              : zone === "after"
                ? { boxShadow: `inset 0 -2px 0 ${DROP_COLOR}` }
                : {}),
        }}
      >
        {/* The arrow is its own hit target: it toggles this row and does
            nothing else, so the row's main action stays separate. */}
        <Box
          sx={{
            width: 28,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            cursor: opts.expandable ? "pointer" : "default",
          }}
          onClick={(e) => {
            if (!opts.expandable) return;
            e.stopPropagation();
            opts.onToggle?.();
          }}
        >
          {opts.expandable ? (
            opts.expanded ? (
              <ExpandMore sx={{ fontSize: 20 }} />
            ) : (
              <ChevronRight sx={{ fontSize: 20 }} />
            )
          ) : null}
        </Box>
        <Box
          sx={{
            width: 28,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            // A space keeps its category's colour, which the swatch used to
            // carry: the icon wears it instead, so the row says what kind of
            // space it is and what category it is in at once.
            color: opts.tint ?? "action.active",
            opacity: opts.muted ? 0.6 : 1,
          }}
        >
          {icon}
        </Box>
        {renaming?.id === key ? (
          <InlineRename
            value={renaming.draft}
            onChange={onRenameChange}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : (
          <ListItemText
            primary={label}
            primaryTypographyProps={{
              variant: "body1",
              fontWeight: opts.bold ? 700 : 400,
              noWrap: true,
              color: opts.muted ? "text.secondary" : undefined,
            }}
          />
        )}
        {opts.trailing}
        {/* Every row carries the same mark, and the row's own id is
            what decides: a floor, an envelope and a room are all just
            keys the selection either reaches or does not. */}
        {badges &&
          (badges.rooms.has(key) ||
            badges.groups.has(key) ||
            badges.floors.has(key)) && <AccessDot />}
        {opts.attention && (
          <Box sx={{ display: "flex", ml: 1, mr: opts.onMenu ? 0.5 : 0 }}>
            <AttentionBadge label="Needs aligning" hint={opts.attention} />
          </Box>
        )}
        {/* While reordering the row's handle takes the menu's place: the
            row is for dragging now, and its menu would only get in the way. */}
        {draggable && dnd?.ref ? (
          <DragIndicator
            sx={{ fontSize: 20, color: "text.secondary", flexShrink: 0, ml: 0.5 }}
          />
        ) : (
          opts.onMenu &&
          !reordering &&
          renaming?.id !== key && (
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                opts.onMenu?.(e.currentTarget);
              }}
            >
              <MoreVert sx={{ fontSize: 20 }} />
            </IconButton>
          )
        )}
      </ListItemButton>
    );
  };

  const renderRoom = (
    room: Room,
    depth: number,
    place: TreePlace,
    orderId: string,
  ) =>
    row(room.id, depth, <MeetingRoomOutlined sx={{ fontSize: 20 }} />, room.name, {
      selected: room.id === selectedRoomId,
      // Pointing at a space turns the plan to its storey as well:
      // a highlight on a floor you are not looking at is no highlight.
      onClick: () => {
        onFloorChange(room.floor_id);
        onSelectRoom(room.id);
      },
      tint: roomColor(layer, room),
      onMenu:
        onRowMenu && ((el: HTMLElement) => onRowMenu(el, { kind: "room", room })),
      dnd: { ref: { kind: "room", id: room.id }, place, orderId },
    });

  /**
   * A space a rooms list says is on this floor, that the plan does not
   * have. It gets a row — greyed, and marked with the same badge the
   * drawer puts on it — because the list is a statement about the
   * building, and the tree is the list of what the building has.
   */
  const renderSpace = (space: UnplacedSpace, depth: number, place: TreePlace) =>
    row(space.id, depth, <MeetingRoomOutlined sx={{ fontSize: 20 }} />, space.name, {
      muted: true,
      tint: layer.spaceTypes.get(space.space_type ?? "")?.color,
      // There is no shape to point at, but there is a floor to turn to.
      onClick: () => {
        if (space.floor_id) onFloorChange(space.floor_id);
      },
      trailing: (
        <Box sx={{ display: "flex", ml: 1, mr: 0.5 }}>
          <AttentionBadge
            label="Unplaced"
            hint="In the rooms list, not placed on the plan yet"
          />
        </Box>
      ),
      onMenu:
        onRowMenu && ((el: HTMLElement) => onRowMenu(el, { kind: "space", space })),
      dnd: { ref: { kind: "space", id: space.id }, place, orderId: space.id },
    });

  /**
   * A flat is a unit, and a unit is a door off the hallway — the same thing
   * a room is, one level up. Envelopes that are not units keep the generic
   * mark, since a gym is not a door.
   */
  const groupIcon = (group: Group) =>
    groupAccessType(layer, group) === "apartment" ? (
      <MeetingRoomOutlined sx={{ fontSize: 20 }} />
    ) : (
      <WidgetsOutlined sx={{ fontSize: 20 }} />
    );

  /**
   * One row and whatever is under it. `all` is set once a row above has
   * matched the search itself: then everything inside it is shown, not
   * only what matches too.
   */
  const renderNode = (
    node: TreeNode,
    depth: number,
    place: TreePlace,
    all = false,
  ): React.ReactNode => {
    if (q && !all && !shows(node)) return null;
    if (node.kind === "room") return renderRoom(node.room, depth, place, node.id);
    if (node.kind === "space") return renderSpace(node.space, depth, place);

    const { group } = node;
    const inside: TreePlace = { floorId: group.floor_id, groupId: group.id };
    const children = treeChildren(layer, inside);
    // A flat's rooms stay folded inside it until one is surfaced, so an
    // apartment with nothing listed has nothing to expand, and no chevron.
    const expandable = children.length > 0;
    // A search opens every branch that holds a hit; it does not disturb
    // what the user had expanded.
    const forced = q !== "" && children.some(shows);
    const isOpen = forced || isExpanded(group.id);
    const below = all || (q !== "" && selfMatches(node) && !forced);

    return (
      <Fragment key={group.id}>
        {row(group.id, depth, groupIcon(group), group.name, {
          expandable,
          expanded: isOpen,
          onToggle: () => toggle(group.id),
          selected: group.id === selectedGroupId,
          // The row points at the envelope — turning the plan to its
          // storey and lighting the whole of it — and the chevron is
          // what folds it. Without anything to point with, the row
          // folds, which is all it could do.
          onClick: () => {
            if (onSelectGroup) {
              onFloorChange(group.floor_id);
              onSelectGroup(group.id);
            } else if (expandable) {
              toggle(group.id);
            }
          },
          onMenu:
            onRowMenu && ((el: HTMLElement) => onRowMenu(el, { kind: "group", group })),
          dnd: { ref: { kind: "group", id: group.id }, place, orderId: group.id, into: inside },
        })}
        {isOpen && children.map((c) => renderNode(c, depth + 1, inside, below))}
      </Fragment>
    );
  };

  /** A floor's own rows, without the connective tissue. */
  const floorRows = (id: string) =>
    treeChildren(layer, { floorId: id, groupId: null }).filter((node) => {
      const envelope =
        node.kind === "group" ? node.group : node.kind === "room" ? node.envelope : null;
      return !(envelope && HIDDEN_FROM_TREE.has(groupAccessType(layer, envelope) ?? ""));
    });

  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        position: "relative",
        borderRight: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: PANEL_BACKGROUND,
      }}
    >
      <ResizeHandle
        edge="right"
        width={width}
        min={TREE_MIN}
        max={TREE_MAX}
        onChange={onWidthChange}
      />
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
          <IconButton size="small" onClick={() => setExpanded({})}>
            <UnfoldLess sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />

      {/* The mode says it is on, what it is for, and how to leave it. While
          a row is held over somewhere it may not go, it says why instead. */}
      {reordering && (
        <Box
          role="status"
          sx={{
            px: 2,
            py: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
            bgcolor: PRESSED_BACKGROUND,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography
            variant="body2"
            sx={{ flex: 1, minWidth: 0 }}
            color={refusal ? "error.main" : "text.primary"}
          >
            {refusal ??
              (q
                ? "Clear the search to drag rows."
                : "Drag rows to reorder them, or onto a group to move them into it.")}
          </Typography>
          <Button size="small" onClick={onReorderDone} sx={{ flexShrink: 0 }}>
            Done
          </Button>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          {/* Display-only building root — the model's tree starts at a floor. */}
          {row(
            "building",
            0,
            <ApartmentOutlined sx={{ fontSize: 20 }} />,
            buildingName,
            { bold: true },
          )}
          {layer.floors.map((floor) => {
            const place: TreePlace = { floorId: floor.id, groupId: null };
            const isOpen = isExpanded(floor.id);
            return (
              <Fragment key={floor.id}>
                {row(
                  floor.id,
                  1,
                  <LayersOutlined sx={{ fontSize: 20 }} />,
                  floor.name,
                  {
                    expandable: true,
                    expanded: isOpen,
                    onToggle: () => toggle(floor.id),
                    // Clicking the row takes the canvas to this floor and
                    // opens it; it never closes another floor.
                    onClick: () => {
                      onFloorChange(floor.id);
                      open(floor.id);
                    },
                    selected: floor.id === floorId,
                    attention: misaligned.has(floor.id)
                      ? "This floor does not sit over the one below. Use Align floor."
                      : undefined,
                    onMenu:
                      onRowMenu &&
                      ((el: HTMLElement) => onRowMenu(el, { kind: "floor", floor })),
                    // A storey is where it is in the building, so it does
                    // not drag; it is somewhere to drop.
                    dnd: { into: place },
                  },
                )}
                {isOpen && floorRows(floor.id).map((node) => renderNode(node, 2, place))}
              </Fragment>
            );
          })}
        </List>
      </Box>

      <Divider />
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 3 }}>
        <Tooltip title={onNewSpace ? "" : "Switch to Structure to add a space"}>
          <span style={{ width: "100%" }}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              endIcon={<AddIcon />}
              disabled={!onNewSpace}
              onClick={onNewSpace}
            >
              New space
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
