/**
 * The right-hand panel in devices mode.
 *
 * Figma 42:75117. Where structure mode lists the categories, devices mode
 * lists the devices: search, three filters, and a row per device saying
 * which storey and which space it is in.
 *
 * It is a flat list rather than a tree because a device is not inside
 * anything in the way a room is inside a flat — it is attached to one
 * thing, and the row says which. Grouping them by space would bury the
 * unassigned ones, and those are the whole reason this panel exists.
 */
import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowDropDown from "@mui/icons-material/ArrowDropDown";
import Close from "@mui/icons-material/Close";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldLess from "@mui/icons-material/UnfoldLess";
import { DeviceGlyph } from "../DeviceMarker";
import { ResizeHandle } from "./ResizeHandle";
import { DEVICE_MIME } from "./spaceDrag";
import { InlineRename } from "./InlineRename";
import { DRAWER_MAX, DRAWER_MIN } from "./CategoriesDrawer";
import {
  deviceRows,
  deviceTypes,
  isUnassigned,
  productName,
  type VisualLayer,
} from "../../model";

export interface DevicesDrawerProps {
  layer: VisualLayer;
  selectedId: string | null;
  onSelect: (deviceId: string | null) => void;
  onMenu: (el: HTMLElement, deviceId: string) => void;
  /** Picked up, so the plan can show where it could land. */
  onDragStart: (deviceId: string) => void;
  onDragEnd: () => void;
  renamingId: string | null;
  onRenameCommit: (deviceId: string, name: string) => void;
  onRenameCancel: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}

export function DevicesDrawer({
  layer,
  selectedId,
  onSelect,
  onMenu,
  onDragStart,
  onDragEnd,
  renamingId,
  onRenameCommit,
  onRenameCancel,
  width,
  onWidthChange,
}: DevicesDrawerProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<{
    el: HTMLElement;
    which: "type" | "floor";
  } | null>(null);

  const rows = useMemo(() => deviceRows(layer), [layer]);

  // The field opens on the name it is replacing, selected, so the first
  // keystroke takes it.
  useEffect(() => {
    if (!renamingId) return;
    const device = layer.file.devices.find((d) => d.id === renamingId);
    setDraft(device?.name ?? "");
  }, [renamingId, layer]);
  const types = useMemo(() => deviceTypes(layer), [layer]);

  const filtering = type !== null || floor !== null || unassignedOnly;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== null && r.device.device_type !== type) return false;
      if (floor !== null && r.floorName !== floor) return false;
      if (unassignedOnly && !isUnassigned(r.device)) return false;
      if (!q) return true;
      return `${r.device.name} ${r.placeName ?? ""} ${r.floorName ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, type, floor, unassignedOnly]);

  const clear = () => {
    setType(null);
    setFloor(null);
    setUnassignedOnly(false);
  };

  return (
    <Box
      sx={{
        width,
        position: "relative",
        flexShrink: 0,
        borderLeft: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ResizeHandle
        edge="left"
        width={width}
        min={DRAWER_MIN}
        max={DRAWER_MAX}
        onChange={onWidthChange}
      />

      <Box
        sx={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
        }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        <IconButton size="small" onClick={() => onSelect(null)}>
          <UnfoldLess sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <Stack direction="row" spacing={1} sx={{ px: 1, pb: 1, flexWrap: "wrap" }}>
        <Chip
          label={type ? productName(type) : "Type"}
          active={type !== null}
          onClick={(el) => setPicker({ el, which: "type" })}
        />
        <Chip
          label={floor ?? "Floor"}
          active={floor !== null}
          onClick={(el) => setPicker({ el, which: "floor" })}
        />
        {/* On or off, so it carries no arrow: there is nothing to open. */}
        <Chip
          label="Unassigned"
          active={unassignedOnly}
          opens={false}
          onClick={() => setUnassignedOnly((was) => !was)}
        />
      </Stack>

      {filtering && (
        <Button
          size="small"
          startIcon={<Close sx={{ fontSize: 16 }} />}
          onClick={clear}
          sx={{ alignSelf: "flex-start", ml: 1, mb: 0.5, color: "text.secondary" }}
        >
          Clear filters
        </Button>
      )}
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          {shown.map(({ device, floorName, placeName }) => (
            <ListItemButton
              key={device.id}
              selected={device.id === selectedId}
              onClick={() => onSelect(device.id)}
              // Only a device with nowhere to be is dragged from here.
              // One already on a door is moved by taking it off first,
              // which is a decision worth making on purpose.
              draggable={isUnassigned(device)}
              onDragStart={(e) => {
                e.dataTransfer.setData(DEVICE_MIME, device.id);
                e.dataTransfer.effectAllowed = "move";
                // The browser's own drag image is the whole row — its
                // highlight, its place line, its button. What is being
                // moved is one device, so that is what travels with the
                // pointer: a chip with its name.
                const ghost = document.createElement("div");
                ghost.textContent = device.name;
                Object.assign(ghost.style, {
                  position: "fixed",
                  top: "-1000px",
                  left: "-1000px",
                  padding: "6px 12px",
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.23)",
                  borderRadius: "4px",
                  font: "14px Roboto, Helvetica, Arial, sans-serif",
                  whiteSpace: "nowrap",
                });
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 12, 16);
                setTimeout(() => ghost.remove(), 0);
                onDragStart(device.id);
              }}
              onDragEnd={() => onDragEnd()}
              sx={{
                minHeight: 56,
                pl: 1.5,
                pr: 0.5,
                cursor: isUnassigned(device) ? "grab" : undefined,
              }}
            >
              <Box sx={{ mr: 1.5, color: "text.secondary", display: "flex" }}>
                <DeviceGlyph type={device.device_type} size={20} />
              </Box>
              {renamingId === device.id ? (
                <InlineRename
                  value={draft}
                  onChange={setDraft}
                  onCommit={() => onRenameCommit(device.id, draft)}
                  onCancel={onRenameCancel}
                />
              ) : (
                <ListItemText
                  primary={device.name}
                  // Where it is, said the way the panel says it: the
                  // storey and the space, or that it is on neither.
                  secondary={
                    floorName && placeName
                      ? `${floorName}, ${placeName}`
                      : "Unassigned"
                  }
                  primaryTypographyProps={{ variant: "body2", noWrap: true }}
                  secondaryTypographyProps={{ variant: "caption", noWrap: true }}
                />
              )}
              <IconButton
                size="small"
                edge="end"
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu(e.currentTarget, device.id);
                }}
              >
                <MoreVert sx={{ fontSize: 20 }} />
              </IconButton>
            </ListItemButton>
          ))}

          {shown.length === 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ p: 3, textAlign: "center" }}
            >
              No device matches.
            </Typography>
          )}
        </List>
      </Box>

      <Divider />
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {shown.length} of {rows.length} devices
          {rows.filter((r) => isUnassigned(r.device)).length > 0 &&
            ` · ${rows.filter((r) => isUnassigned(r.device)).length} unassigned`}
        </Typography>
      </Box>

      <Menu
        open={Boolean(picker)}
        anchorEl={picker?.el ?? null}
        onClose={() => setPicker(null)}
      >
        {/* No "Any" row: not filtering is what the chip already says
            when nothing is picked. Choosing what is already chosen turns
            it off again, so there is still a way back without reaching
            for Clear filters. */}
        {picker?.which === "type"
          ? types.map((t) => (
              <MenuItem
                key={t}
                selected={type === t}
                onClick={() => {
                  setType(type === t ? null : t);
                  setPicker(null);
                }}
              >
                {productName(t)}
              </MenuItem>
            ))
          : layer.floors.map((f) => (
              <MenuItem
                key={f.id}
                selected={floor === f.name}
                onClick={() => {
                  setFloor(floor === f.name ? null : f.name);
                  setPicker(null);
                }}
              >
                {f.name}
              </MenuItem>
            ))}
      </Menu>
    </Box>
  );
}

/** The outlined pills above the list, which hold the filter they carry. */
function Chip({
  label,
  active,
  opens = true,
  onClick,
}: {
  label: string;
  active: boolean;
  /** Whether it opens a list. A plain toggle shows no arrow. */
  opens?: boolean;
  onClick: (el: HTMLElement) => void;
}) {
  return (
    <Button
      size="small"
      variant={active && !opens ? "contained" : "outlined"}
      color={active ? "primary" : "inherit"}
      endIcon={opens ? <ArrowDropDown sx={{ fontSize: 18 }} /> : undefined}
      onClick={(e) => onClick(e.currentTarget)}
      sx={{ px: 1 }}
    >
      {label}
    </Button>
  );
}
