/**
 * The right-hand panel in access mode.
 *
 * Figma 42:89556 and 42:82046. Search, a three-way All / Devices /
 * People, and a list of access groups with their devices and people
 * under them.
 *
 * Groups and devices carry a checkbox because reach adds up: holding two
 * groups gets you everywhere either one does, so the question "what can
 * these open together" is a real one. A person does not add up with
 * anything — you are one person — so a person is picked, not ticked.
 */
import { Fragment, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import MoreVert from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import { DeviceGlyph } from "../DeviceMarker";
import { DRAWER_MAX, DRAWER_MIN } from "./CategoriesDrawer";
import { ResizeHandle } from "./ResizeHandle";
import {
  accessGroups,
  deviceRows,
  operatorRoleName,
  operators,
  residents,
  type VisualLayer,
} from "../../model";

export type AccessTab = "all" | "devices" | "people";

export interface AccessDrawerProps {
  layer: VisualLayer;
  /** Groups and devices ticked; their reach is added together. */
  picked: ReadonlySet<string>;
  onPicked: (next: Set<string>) => void;
  /** The one person being asked about, if any. */
  personId: string | null;
  onPerson: (personId: string | null) => void;
  onDeviceMenu: (el: HTMLElement, deviceId: string) => void;
  onPersonMenu: (el: HTMLElement, personId: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
}

export function AccessDrawer({
  layer,
  picked,
  onPicked,
  personId,
  onPerson,
  onDeviceMenu,
  onPersonMenu,
  width,
  onWidthChange,
}: AccessDrawerProps) {
  const [tab, setTab] = useState<AccessTab>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => accessGroups(), []);
  const rows = useMemo(() => deviceRows(layer), [layer]);
  const people = useMemo(
    () => ({ residents: residents(layer), operators: operators(layer) }),
    [layer],
  );
  const everyone = useMemo(
    () => [...people.residents, ...people.operators],
    [people],
  );

  const byId = useMemo(
    () => new Map(rows.map((r) => [r.device.id, r])),
    [rows],
  );
  const person = useMemo(
    () => new Map(everyone.map((p) => [p.id, p])),
    [everyone],
  );

  const q = query.trim().toLowerCase();
  const hit = (text: string) => !q || text.toLowerCase().includes(q);

  const toggleOpen = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tick = (ids: string[], on: boolean) => {
    const next = new Set(picked);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onPicked(next);
  };

  const groupState = (devices: string[]) => {
    const on = devices.filter((d) => picked.has(d)).length;
    return { all: on > 0 && on === devices.length, some: on > 0 };
  };

  const deviceRow = (deviceId: string, depth: number) => {
    const row = byId.get(deviceId);
    if (!row || !hit(`${row.device.name} ${row.placeName ?? ""}`)) return null;
    return (
      <ListItemButton
        key={`d:${deviceId}`}
        sx={{ minHeight: 48, pl: 1 + depth * 2, pr: 0.5 }}
        onClick={() => tick([deviceId], !picked.has(deviceId))}
      >
        <Checkbox
          size="small"
          checked={picked.has(deviceId)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => tick([deviceId], e.target.checked)}
        />
        <Box sx={{ mr: 1, color: "text.secondary", display: "flex" }}>
          <DeviceGlyph type={row.device.device_type} size={18} />
        </Box>
        <ListItemText
          primary={row.device.name}
          secondary={
            row.floorName && row.placeName
              ? `${row.floorName}, ${row.placeName}`
              : "Unassigned"
          }
          primaryTypographyProps={{ variant: "body2", noWrap: true }}
          secondaryTypographyProps={{ variant: "caption", noWrap: true }}
        />
        <IconButton
          size="small"
          edge="end"
          onClick={(e) => {
            e.stopPropagation();
            onDeviceMenu(e.currentTarget, deviceId);
          }}
        >
          <MoreVert sx={{ fontSize: 18 }} />
        </IconButton>
      </ListItemButton>
    );
  };

  const personRow = (id: string, depth: number) => {
    const who = person.get(id);
    if (!who || !hit(who.name)) return null;
    // A resident is placed by their flat, somebody who works here by
    // their job — both from the data, neither invented.
    const where =
      "apartment_name" in who
        ? who.apartment_name
        : (who.jobTitle ?? operatorRoleName(who.role));
    return (
      <ListItemButton
        key={`p:${id}`}
        selected={personId === id}
        sx={{ minHeight: 48, pl: 2 + depth * 2, pr: 0.5 }}
        // One person at a time: picking a second would be asking a
        // question nobody has — two people are not a thing that walks
        // through a door together.
        onClick={() => onPerson(personId === id ? null : id)}
      >
        <AccountCircleOutlined
          sx={{ fontSize: 18, mr: 1, color: "text.secondary" }}
        />
        <ListItemText
          primary={who.name}
          secondary={where}
          primaryTypographyProps={{ variant: "body2", noWrap: true }}
          secondaryTypographyProps={{ variant: "caption", noWrap: true }}
        />
        <IconButton
          size="small"
          edge="end"
          onClick={(e) => {
            e.stopPropagation();
            onPersonMenu(e.currentTarget, id);
          }}
        >
          <MoreVert sx={{ fontSize: 18 }} />
        </IconButton>
      </ListItemButton>
    );
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

      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 1 }}>
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
      </Box>

      <Box sx={{ px: 1, pb: 1 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={tab}
          onChange={(_, v) => v && setTab(v as AccessTab)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="devices">Devices</ToggleButton>
          <ToggleButton value="people">People</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <List dense disablePadding>
          {/* Devices on their own are a flat list. Grouping them under
              the access groups would hide the ones no group holds and
              make the same device appear twice when two groups hold it
              — and the question this tab asks is "what does this
              device open", which has nothing to do with groups. */}
          {tab === "devices" &&
            rows.map((r) => deviceRow(r.device.id, 0))}

          {/* People are grouped by what they are, not by which access
              group they happen to be in: somebody in two groups would
              otherwise be listed twice, and somebody in none would
              vanish — which is most residents, because living
              somewhere is not a group. */}
          {tab === "people" && (
            <>
              <SubHeading label={count(people.residents.length, "resident")} depth={0} />
              {people.residents.map((r) => personRow(r.id, 0))}
              <SubHeading label={count(people.operators.length, "operator")} depth={0} />
              {people.operators.map((o) => personRow(o.id, 0))}
            </>
          )}

          {/* All: the groups, each opening onto what it holds. */}
          {tab === "all" &&
            groups.map((group) => {
              const isOpen = open.has(group.id) || Boolean(q);
              const state = groupState(group.devices);
              return (
                <Fragment key={group.id}>
                  <ListItemButton
                    sx={{ minHeight: 52, pl: 1, pr: 0.5 }}
                    onClick={() => toggleOpen(group.id)}
                  >
                    <Checkbox
                      size="small"
                      checked={state.all}
                      indeterminate={state.some && !state.all}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => tick(group.devices, e.target.checked)}
                    />
                    <Box sx={{ width: 24, display: "flex" }}>
                      {isOpen ? (
                        <ExpandMore sx={{ fontSize: 18 }} />
                      ) : (
                        <ChevronRight sx={{ fontSize: 18 }} />
                      )}
                    </Box>
                    <ListItemText
                      primary={group.name}
                      secondary={`${count(group.devices.length, "device")}   ${count(group.people.length, "person", "people")}`}
                      primaryTypographyProps={{ variant: "body2", noWrap: true }}
                      secondaryTypographyProps={{
                        variant: "caption",
                        noWrap: true,
                      }}
                    />
                    <IconButton size="small" edge="end" disabled>
                      <MoreVert sx={{ fontSize: 18 }} />
                    </IconButton>
                  </ListItemButton>

                  {isOpen && (
                    <>
                      <SubHeading label="Devices" depth={1} />
                      {group.devices.map((id) => deviceRow(id, 2))}
                      <SubHeading label="People" depth={1} />
                      {group.people.map((id) => personRow(id, 1))}
                    </>
                  )}
                </Fragment>
              );
            })}
        </List>
      </Box>

      <Divider />
      <Box sx={{ height: 56, display: "flex", alignItems: "center", px: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {personId
            ? `Showing where ${person.get(personId)?.name ?? "they"} can go`
            : picked.size > 0
              ? `${picked.size} device${picked.size === 1 ? "" : "s"} selected`
              : "Select a group, a device or a person"}
        </Typography>
        {(picked.size > 0 || personId) && (
          <Button
            size="small"
            onClick={() => {
              onPicked(new Set());
              onPerson(null);
            }}
          >
            Clear
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** "1 device", "3 devices" — a count nobody has to read twice. */
function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function SubHeading({ label, depth }: { label: string; depth: number }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={{ pl: 2 + depth * 2, py: 0.5 }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={500}>
        {label}
      </Typography>
    </Stack>
  );
}
