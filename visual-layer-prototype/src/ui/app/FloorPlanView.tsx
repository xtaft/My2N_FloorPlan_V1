/**
 * The Floor Plan tab once a plan exists.
 *
 * Figma 96:163318, 106:180640, 106:182544 — the same screen in its
 * three right-hand states, which the mode dropdown switches between.
 *
 * This is the plan at rest: you look at it, you ask it who gets in
 * where, and you go to the editor to change it. So the structure and
 * device panels here are lists rather than the editor's drawers — no
 * row menus, no drag, nothing that writes. Access mode is the
 * exception and needs no exception made for it: asking what a
 * credential opens never changes anything, so the editor's own panel
 * is already a read-only thing and is reused whole.
 */
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Close from "@mui/icons-material/Close";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ExpandMore from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import { Fragment } from "react";
import { DeviceGlyph } from "../DeviceMarker";
import { FloorPlanCanvas } from "../FloorPlanCanvas";
import { AccessDrawer } from "../edit/AccessDrawer";
import { AccessDeviceMenu } from "../edit/AccessDeviceMenu";
import { PersonMenu } from "../edit/PersonMenu";
import { CANVAS_BACKGROUND, PANEL_BACKGROUND } from "../theme";
import {
  accessPaint,
  accessShading,
  deviceRows,
  devicesHeldBy,
  roomsInGroup,
  spaceCategories,
  type VisualLayer,
} from "../../model";

export type PlanMode = "structure" | "devices" | "access";

export interface FloorPlanViewProps {
  layer: VisualLayer;
  floorId: string;
  onFloorChange: (floorId: string) => void;
  onEdit: () => void;
}

export function FloorPlanView({
  layer,
  floorId,
  onFloorChange,
  onEdit,
}: FloorPlanViewProps) {
  const [mode, setMode] = useState<PlanMode>("access");
  const [query, setQuery] = useState("");

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [personId, setPersonId] = useState<string | null>(null);
  const [accessMenu, setAccessMenu] = useState<{
    el: HTMLElement | null;
    at?: { top: number; left: number };
    deviceId: string;
    bulk: boolean;
  } | null>(null);
  const [personMenu, setPersonMenu] = useState<{
    el: HTMLElement;
    personId: string;
  } | null>(null);

  const allowed = useMemo(
    () => (personId ? new Set(devicesHeldBy(layer, personId)) : picked),
    [layer, personId, picked],
  );
  const shading = useMemo(
    () =>
      mode === "access"
        ? accessShading(layer, allowed, personId ? "outside" : "devices")
        : null,
    [mode, layer, allowed, personId],
  );

  return (
    // Not a card on the page: the plan is the screen. It fills whatever
    // the tabs leave it, edge to edge, with the toolbar sitting directly
    // under the tab rule and the canvas running to the window.
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        sx={{ px: 2, py: 1.5, flexShrink: 0 }}
      >
        <TextField
          size="small"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ width: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        <Button variant="outlined" color="inherit" size="small" disabled>
          Device type
        </Button>
        <Button variant="outlined" color="inherit" size="small" disabled>
          Error
        </Button>
        <Button variant="outlined" color="inherit" size="small" disabled>
          Warning
        </Button>
        <Button
          size="small"
          startIcon={<Close sx={{ fontSize: 16 }} />}
          disabled={query === ""}
          onClick={() => setQuery("")}
          sx={{ color: "text.secondary" }}
        >
          Clear filters
        </Button>

        <Box sx={{ flex: 1 }} />

        <Button
          variant="outlined"
          color="inherit"
          size="small"
          startIcon={<EditOutlined sx={{ fontSize: 16 }} />}
          onClick={onEdit}
        >
          Edit floor plan
        </Button>
        <TextField
          select
          size="small"
          value={mode}
          onChange={(e) => setMode(e.target.value as PlanMode)}
          sx={{ width: 240 }}
        >
          <MenuItem value="structure">Structure</MenuItem>
          <MenuItem value="devices">Devices</MenuItem>
          <MenuItem value="access">Access</MenuItem>
        </TextField>
      </Stack>
      <Divider />

      <Tabs
        value={floorId}
        onChange={(_, v) => onFloorChange(v as string)}
        variant="scrollable"
        sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
      >
        {layer.floors.map((f) => (
          <Tab key={f.id} value={f.id} label={f.name} />
        ))}
      </Tabs>

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, bgcolor: CANVAS_BACKGROUND }}>
          <FloorPlanCanvas
            layer={layer}
            floorId={floorId}
            showAllRooms={false}
            reach={null}
            selectedRoomId={null}
            selectedGroupId={null}
            onSelectRoom={() => {}}
            showDeviceStatus={mode === "devices"}
            showDevices={mode !== "structure"}
            paint={shading ? accessPaint(shading) : undefined}
            onDeviceMenu={
              mode === "access"
                ? (deviceId, at) =>
                    setAccessMenu({ el: null, at, deviceId, bulk: false })
                : undefined
            }
          />
        </Box>

        {mode === "access" ? (
          <AccessDrawer
            layer={layer}
            picked={picked}
            onPicked={(next) => {
              setPicked(next);
              if (next.size > 0) setPersonId(null);
            }}
            personId={personId}
            onPerson={(id) => {
              setPersonId(id);
              if (id) setPicked(new Set());
            }}
            onDeviceMenu={(el, deviceId) =>
              setAccessMenu({ el, deviceId, bulk: picked.size > 1 })
            }
            onPersonMenu={(el, id) => setPersonMenu({ el, personId: id })}
            width={320}
            onWidthChange={() => {}}
          />
        ) : (
          <SidePanel layer={layer} mode={mode} query={query} />
        )}
      </Box>

      <AccessDeviceMenu
        open={Boolean(accessMenu)}
        anchorEl={accessMenu?.el ?? null}
        at={accessMenu?.at ?? null}
        count={accessMenu?.bulk ? picked.size : 1}
        inPath={accessMenu ? picked.has(accessMenu.deviceId) : false}
        onClose={() => setAccessMenu(null)}
        onShowInPath={() => {
          if (!accessMenu) return;
          setPersonId(null);
          setPicked(new Set([...picked, accessMenu.deviceId]));
        }}
        onRemoveFromPath={() => {
          if (!accessMenu) return;
          const next = new Set(picked);
          next.delete(accessMenu.deviceId);
          setPicked(next);
        }}
      />
      <PersonMenu
        open={Boolean(personMenu)}
        anchorEl={personMenu?.el ?? null}
        inAGroup={false}
        onClose={() => setPersonMenu(null)}
      />
    </Box>
  );
}

/** The structure and device lists, which here only list. */
function SidePanel({
  layer,
  mode,
  query,
}: {
  layer: VisualLayer;
  mode: PlanMode;
  query: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const hit = (text: string) => !q || text.toLowerCase().includes(q);

  const categories = useMemo(() => spaceCategories(layer), [layer]);
  const devices = useMemo(() => deviceRows(layer), [layer]);

  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        borderLeft: 1,
        borderColor: "divider",
        bgcolor: PANEL_BACKGROUND,
        overflowY: "auto",
      }}
    >
      <List dense disablePadding>
        {mode === "devices" &&
          devices
            .filter((r) => hit(`${r.device.name} ${r.placeName ?? ""}`))
            .map((r) => (
              <ListItemButton key={r.device.id} sx={{ minHeight: 52, pl: 2 }}>
                <Box sx={{ mr: 1.5, color: "text.secondary", display: "flex" }}>
                  <DeviceGlyph type={r.device.device_type} size={20} />
                </Box>
                <ListItemText
                  primary={r.device.name}
                  secondary={
                    r.floorName && r.placeName
                      ? `${r.floorName}, ${r.placeName}`
                      : "Unassigned"
                  }
                  primaryTypographyProps={{ variant: "body2", noWrap: true }}
                  secondaryTypographyProps={{ variant: "caption", noWrap: true }}
                />
              </ListItemButton>
            ))}

        {mode === "structure" &&
          categories.map((category) => {
            const inside = [
              ...category.groups.map((g) => ({
                id: g.id,
                name: g.name,
                where: layer.floors.find((f) => f.id === g.floor_id)?.name ?? "",
                rooms: roomsInGroup(layer, g.id).length,
              })),
              ...category.rooms.map((r) => ({
                id: r.id,
                name: r.name,
                where: layer.floors.find((f) => f.id === r.floor_id)?.name ?? "",
                rooms: 0,
              })),
            ];
            if (!hit(category.name) && !inside.some((x) => hit(x.name))) {
              return null;
            }
            const isOpen = open.has(category.id ?? "unknown") || Boolean(q);
            return (
              <Fragment key={category.id ?? "unknown"}>
                <ListItemButton
                  sx={{ minHeight: 52, pl: 1.5 }}
                  onClick={() => toggle(category.id ?? "unknown")}
                >
                  <Box sx={{ width: 24, display: "flex" }}>
                    {inside.length > 0 ? (
                      isOpen ? (
                        <ExpandMore sx={{ fontSize: 18 }} />
                      ) : (
                        <ChevronRight sx={{ fontSize: 18 }} />
                      )
                    ) : null}
                  </Box>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      mr: 1.5,
                      borderRadius: "2px",
                      bgcolor: category.color,
                      border: 1,
                      borderColor: "divider",
                    }}
                  />
                  <ListItemText
                    primary={`${category.name}  (${inside.length})`}
                    primaryTypographyProps={{ variant: "body2", noWrap: true }}
                  />
                </ListItemButton>
                {isOpen &&
                  inside.map((x) => (
                    <ListItemButton key={x.id} sx={{ minHeight: 48, pl: 6 }}>
                      <ListItemText
                        primary={x.name}
                        secondary={x.where}
                        primaryTypographyProps={{
                          variant: "body2",
                          noWrap: true,
                        }}
                        secondaryTypographyProps={{
                          variant: "caption",
                          noWrap: true,
                        }}
                      />
                    </ListItemButton>
                  ))}
              </Fragment>
            );
          })}

        {mode === "devices" && devices.length === 0 && (
          <Typography variant="body2" sx={{ p: 3, color: "text.secondary" }}>
            No devices.
          </Typography>
        )}
      </List>
    </Box>
  );
}
