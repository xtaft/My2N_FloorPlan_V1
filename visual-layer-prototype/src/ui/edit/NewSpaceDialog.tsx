/**
 * "Add new space" — Figma 142:301325, three states of one dialog.
 *
 * The left column is the same in all three: which kind of thing is
 * being made, what it is called, and a line saying what to pick. The
 * right column is what changes. A flat or a group is made out of
 * spaces that already exist, so it is the building as a tree with a
 * box beside each thing that may go in. A floor is made out of a page
 * somebody drops in, so it is a dropzone and a note on which kind of
 * file does what.
 *
 * The one-floor rule is enforced where it is felt: once something is
 * ticked, every box on another storey greys out, rather than letting
 * the pick go wrong and refusing it at Create. The other rules —
 * rooms only for a flat, nothing already inside something else — are
 * the model's, and the dialog asks the model whether the pick so far
 * would be refused and shows the reason under the name.
 */
import { useMemo, useRef, useState, Fragment } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import ArrowForward from "@mui/icons-material/ArrowForward";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Close from "@mui/icons-material/Close";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import {
  envelopeRefusal,
  floorEnvelopes,
  roomsInGroup,
  type Group,
  type NewEnvelopeKind,
  type VisualLayer,
} from "../../model";

export type NewSpaceKind = "floor" | NewEnvelopeKind;

/** A page for a new storey, as the dialog hands it on. */
export interface NewFloorPage {
  name: string;
  source: "pdf" | "image";
}

export interface NewSpaceDialogProps {
  open: boolean;
  layer: VisualLayer;
  buildingName: string;
  onClose: () => void;
  onCreateEnvelope: (kind: NewEnvelopeKind, name: string, members: string[]) => void;
  /**
   * A floor with pages goes on to be checked; a floor with none is
   * made empty on the spot. Both leave through here, and the caller
   * decides which it was by whether `pages` holds anything.
   */
  onCreateFloor: (name: string, pages: NewFloorPage[]) => void;
}

const KINDS: { kind: NewSpaceKind; label: string; hint: string }[] = [
  {
    kind: "floor",
    label: "Floor",
    hint: "A storey of the building, drawn from a page you drop in or on a blank canvas.",
  },
  {
    kind: "apartment",
    label: "Apartment",
    hint: "A flat: rooms that are let together and opened by one credential.",
  },
  {
    kind: "group",
    label: "Group",
    hint: "Spaces that belong together — flats, rooms, other groups — on one floor.",
  },
];

function pageKind(file: File): "pdf" | "image" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) {
    return "image";
  }
  return null;
}

export function NewSpaceDialog({
  open,
  layer,
  buildingName,
  onClose,
  onCreateEnvelope,
  onCreateFloor,
}: NewSpaceDialogProps) {
  const [kind, setKind] = useState<NewSpaceKind>("group");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<NewFloorPage[]>([]);

  const reset = () => {
    setName("");
    setPicked(new Set());
    setPages([]);
  };
  const close = () => {
    reset();
    onClose();
  };

  // Picking a kind starts the pick over: what counts as a member is
  // not the same thing for a flat and a group.
  const choose = (k: NewSpaceKind) => {
    setKind(k);
    setPicked(new Set());
  };

  const members = useMemo(() => [...picked], [picked]);
  const refusal =
    kind === "floor" || members.length === 0
      ? null
      : envelopeRefusal(layer, { kind, name: name || "x", members });

  const create = () => {
    if (kind === "floor") {
      onCreateFloor(name, pages);
    } else {
      onCreateEnvelope(kind, name, members);
    }
    reset();
  };

  const ready =
    kind === "floor"
      ? true
      : name.trim() !== "" && members.length > 0 && refusal === null;

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <Stack
        direction="row"
        alignItems="center"
        sx={{ pl: 3, pr: 1.5, height: 56 }}
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          Add new space
        </Typography>
        <IconButton onClick={close} size="small">
          <Close />
        </IconButton>
      </Stack>
      <Divider />

      <Box sx={{ display: "flex", minHeight: 420 }}>
        {/* ------------------------------------------------- what and name */}
        <Box sx={{ width: 280, flexShrink: 0, p: 2, pt: 2.5 }}>
          <Typography variant="body2" fontWeight={500} sx={{ mb: 1.5 }}>
            Space type
          </Typography>
          <Stack spacing={1} alignItems="flex-start">
            {KINDS.map((k) => (
              <Stack key={k.kind} direction="row" alignItems="center" spacing={1}>
                <Chip
                  label={k.label}
                  onClick={() => choose(k.kind)}
                  onDelete={() => choose(k.kind)}
                  deleteIcon={<ArrowForward sx={{ fontSize: "16px !important" }} />}
                  color="primary"
                  variant={kind === k.kind ? "filled" : "outlined"}
                  sx={{ borderRadius: 1, height: 28 }}
                />
                <Tooltip title={k.hint}>
                  <InfoOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                </Tooltip>
              </Stack>
            ))}
          </Stack>

          <Typography variant="body2" fontWeight={500} sx={{ mt: 3.5, mb: 1 }}>
            {KINDS.find((k) => k.kind === kind)!.label} name
          </Typography>
          <TextField
            size="small"
            fullWidth
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {kind === "group" &&
              "Select spaces from the building to add to the group. Spaces must belong to the same floor."}
            {kind === "apartment" &&
              "Select rooms to add to the apartment. Rooms must be on the same floor."}
            {kind === "floor" &&
              (pages.length === 0
                ? "Drop a page for each new floor, or create one empty and draw it."
                : pages.length === 1
                  ? "One floor will be added and shown for checking."
                  : `${pages.length} floors will be added, named from their files, and shown for checking.`)}
          </Typography>
          {refusal && (
            <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
              {refusal}
            </Typography>
          )}
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* --------------------------------------------- members or pages */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {kind === "floor" ? (
            <PagesDrop pages={pages} onPages={setPages} />
          ) : (
            <MemberTree
              layer={layer}
              buildingName={buildingName}
              kind={kind}
              picked={picked}
              onPicked={setPicked}
            />
          )}
        </Box>
      </Box>

      <Divider />
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" disabled={!ready} onClick={create}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------- members

/**
 * The building with a box beside each thing that may go in.
 *
 * A floor has no box: an envelope is a thing on a floor, so a floor is
 * where you look, not what you pick. For a flat only rooms have one.
 * Rooms folded away inside their flat are listed all the same: the
 * plan hides them because a flat is drawn whole, but a flat is made
 * of rooms, and making one means pointing at rooms wherever they are.
 */
function MemberTree({
  layer,
  buildingName,
  kind,
  picked,
  onPicked,
}: {
  layer: VisualLayer;
  buildingName: string;
  kind: NewEnvelopeKind;
  picked: Set<string>;
  onPicked: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(layer.floors.map((f) => f.id)),
  );
  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The floor the pick is on, once there is a pick: the other floors
  // grey out rather than letting the second tick be the wrong one.
  const onFloor = useMemo(() => {
    for (const id of picked) {
      const r = layer.rooms.get(id);
      if (r) return r.floor_id;
      const g = layer.groups.get(id);
      if (g) return g.floor_id;
    }
    return null;
  }, [picked, layer]);

  const tick = (id: string) =>
    onPicked(
      (() => {
        const next = new Set(picked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })(),
    );

  const renderGroup = (g: Group, depth: number, disabled: boolean) => {
    const children = layer.childGroups.get(g.id) ?? [];
    const rooms = roomsInGroup(layer, g.id).filter((r) => r.group_id === g.id);
    const canOpen = children.length > 0 || rooms.length > 0;
    const isOpen = open.has(g.id);
    return (
      <Fragment key={g.id}>
        <Row
          depth={depth}
          icon={<WidgetsOutlined sx={iconSx} />}
          label={g.name}
          open={canOpen ? isOpen : undefined}
          onToggle={canOpen ? () => toggle(g.id) : undefined}
          checked={picked.has(g.id)}
          // A flat is made of rooms; an envelope is not one.
          checkable={kind === "group"}
          disabled={disabled}
          onTick={() => tick(g.id)}
        />
        {isOpen &&
          children.map((c) => renderGroup(c, depth + 1, disabled))}
        {isOpen &&
          rooms.map((r) => (
            <Row
              key={r.id}
              depth={depth + 1}
              icon={<MeetingRoomOutlined sx={iconSx} />}
              label={r.name}
              checked={picked.has(r.id)}
              checkable
              disabled={disabled}
              onTick={() => tick(r.id)}
            />
          ))}
      </Fragment>
    );
  };

  return (
    <List dense disablePadding sx={{ py: 1 }}>
      <Row depth={0} icon={<ApartmentOutlined sx={iconSx} />} label={buildingName} bold />
      {layer.floors.map((floor) => {
        const disabled = onFloor !== null && onFloor !== floor.id;
        const isOpen = open.has(floor.id);
        const loose = (layer.roomsByFloor.get(floor.id) ?? []).filter(
          (r) => r.group_id === null,
        );
        return (
          <Fragment key={floor.id}>
            <Row
              depth={1}
              icon={<LayersOutlined sx={iconSx} />}
              label={floor.name}
              open={isOpen}
              onToggle={() => toggle(floor.id)}
              disabled={disabled}
            />
            {isOpen &&
              floorEnvelopes(layer, floor.id).map((g) =>
                renderGroup(g, 2, disabled),
              )}
            {isOpen &&
              loose.map((r) => (
                <Row
                  key={r.id}
                  depth={2}
                  icon={<MeetingRoomOutlined sx={iconSx} />}
                  label={r.name}
                  checked={picked.has(r.id)}
                  checkable
                  disabled={disabled}
                  onTick={() => tick(r.id)}
                />
              ))}
          </Fragment>
        );
      })}
    </List>
  );
}

const iconSx = { fontSize: 18, color: "text.secondary" } as const;

function Row({
  depth,
  icon,
  label,
  bold,
  open,
  onToggle,
  checked,
  checkable,
  disabled,
  onTick,
}: {
  depth: number;
  icon: React.ReactNode;
  label: string;
  bold?: boolean;
  /** undefined: nothing to open. */
  open?: boolean;
  onToggle?: () => void;
  checked?: boolean;
  checkable?: boolean;
  disabled?: boolean;
  onTick?: () => void;
}) {
  return (
    <ListItemButton
      dense
      onClick={onToggle}
      sx={{ pl: 1 + depth * 2, pr: 1, minHeight: 36, opacity: disabled ? 0.5 : 1 }}
    >
      <Box sx={{ width: 22, display: "flex", color: "text.secondary" }}>
        {open === undefined ? null : open ? (
          <ExpandMore sx={{ fontSize: 18 }} />
        ) : (
          <ChevronRight sx={{ fontSize: 18 }} />
        )}
      </Box>
      <Box sx={{ width: 26, display: "flex" }}>{icon}</Box>
      <ListItemText
        primary={label}
        primaryTypographyProps={{
          variant: "body2",
          noWrap: true,
          fontWeight: bold ? 500 : 400,
        }}
      />
      {checkable && (
        <Checkbox
          size="small"
          edge="end"
          checked={Boolean(checked)}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          onChange={onTick}
          sx={{ p: 0.5 }}
        />
      )}
    </ListItemButton>
  );
}

// --------------------------------------------------------------- pages

function PagesDrop({
  pages,
  onPages,
}: {
  pages: NewFloorPage[];
  onPages: (next: NewFloorPage[]) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null) => {
    if (!files) return;
    const dropped = [...files]
      .map((f) => ({ name: f.name, source: pageKind(f) }))
      .filter((p): p is NewFloorPage => p.source !== null);
    if (dropped.length > 0) onPages([...pages, ...dropped]);
  };

  return (
    <Box sx={{ p: 2 }}>
      <input
        ref={picker}
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <Box
        onClick={() => picker.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        sx={{
          border: "1px dashed",
          borderColor: over ? "primary.main" : "divider",
          bgcolor: over ? "action.hover" : undefined,
          borderRadius: 1,
          py: 3,
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <FileUploadOutlined sx={{ color: "text.secondary" }} />
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          Drop PDF, PNG or JPEG floor plans here or{" "}
          <Box component="span" sx={{ color: "primary.main" }}>
            browse
          </Box>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          one page per floor
        </Typography>
      </Box>

      {pages.length > 0 && (
        <List dense disablePadding sx={{ mt: 1.5 }}>
          {pages.map((p, i) => (
            <ListItemButton key={`${p.name}:${i}`} dense sx={{ px: 1, minHeight: 36 }}>
              <InsertDriveFileOutlined sx={{ ...iconSx, mr: 1.5 }} />
              <ListItemText
                primary={p.name}
                secondary={p.source === "pdf" ? "PDF — spaces will be detected" : "Image — drawn over by hand"}
                primaryTypographyProps={{ variant: "body2", noWrap: true }}
                secondaryTypographyProps={{ variant: "caption" }}
              />
              <IconButton
                size="small"
                edge="end"
                onClick={() => onPages(pages.filter((_, j) => j !== i))}
              >
                <Close sx={{ fontSize: 16 }} />
              </IconButton>
            </ListItemButton>
          ))}
        </List>
      )}

      <Box
        sx={{
          mt: 2,
          p: 1.5,
          borderRadius: 1,
          bgcolor: "#e3f2fd",
          display: "flex",
          gap: 1.5,
        }}
      >
        <InfoOutlined sx={{ fontSize: 20, color: "primary.main", mt: 0.25 }} />
        <Box>
          <Typography variant="body2" fontWeight={500}>
            Which file to use
          </Typography>
          <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
            <b>Vector PDF</b> — exported from CAD software. My2N detects the
            spaces automatically.
          </Typography>
          <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
            <b>Image or scanned PDF</b> — used as a background only. The layout
            is drawn manually over it.
          </Typography>
          <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
            <b>No file</b> — the floor is created empty and can be drawn on a
            blank canvas.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
