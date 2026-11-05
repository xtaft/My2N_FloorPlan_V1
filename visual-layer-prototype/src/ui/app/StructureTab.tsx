/**
 * The Structure tab: the building's spaces, in the same table the
 * Devices and Residents tabs use.
 *
 * Before the plan the list is flat, because the building is. The
 * customer's records have apartments and the common spaces people are
 * admitted to, and nothing above or below them: no groups, no rooms
 * inside a flat, no storey a flat is on. So the table has no Floor
 * column and nothing to expand — a flat is one row.
 *
 * Once a plan exists the same table lists every envelope, shafts and
 * stairwells and hallways included, and says which floor each is on.
 * The tree in the sidebar stays the administered list; this is the
 * structure.
 */
import { useMemo } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import { Column, DataTable, FilterChip } from "./DataTable";
import {
  allEnvelopes,
  buildingSpaces,
  groupAccessType,
  residents,
  roomsInGroup,
  type VisualLayer,
} from "../../model";

export interface StructureTabProps {
  layer: VisualLayer;
  hasPlan: boolean;
}

interface Row {
  id: string;
  name: string;
  space_type: string | null;
  /** Which storey, which only a plan can say. */
  floor: string | null;
  residents: number;
  devices: number;
  apartment: boolean;
}

export function StructureTab({ layer, hasPlan }: StructureTabProps) {
  const rows = useMemo<Row[]>(() => {
    const floorName = new Map(layer.floors.map((f) => [f.id, f.name]));
    const people = residents(layer);
    const living = (id: string) => people.filter((r) => r.apartment_id === id).length;

    /**
     * A space's devices: the units standing in its rooms, plus — once
     * there are doors to hang one on — the readers on its doors, which
     * belong to the space they check the way in to.
     */
    const devices = (roomIds: Set<string>) => {
      let n = 0;
      for (const id of roomIds) n += (layer.devicesInRoom.get(id) ?? []).length;
      if (!hasPlan) return n;
      for (const d of layer.file.devices) {
        if (d.host_kind === "door" && d.guards.some((g) => roomIds.has(g))) n += 1;
      }
      return n;
    };

    const out: Row[] = hasPlan
      ? allEnvelopes(layer).map((group) => {
          const type = groupAccessType(layer, group);
          const rooms = roomsInGroup(layer, group.id);
          return {
            id: group.id,
            name: group.name,
            space_type: type,
            floor: floorName.get(group.floor_id) ?? null,
            residents: living(group.id),
            devices: devices(new Set(rooms.map((r) => r.id))),
            apartment: type === "apartment",
          };
        })
      : buildingSpaces(layer).map((space) => ({
          id: space.id,
          name: space.name,
          space_type: space.space_type,
          floor: null,
          residents: living(space.id),
          devices: devices(new Set(space.rooms.map((r) => r.id))),
          apartment: space.apartment,
        }));

    // Common spaces first, then the units, each in reading order.
    return out.sort((a, b) => {
      if (a.apartment !== b.apartment) return a.apartment ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }, [layer, hasPlan]);

  const typeName = (id: string | null) =>
    id ? (layer.spaceTypes.get(id)?.name ?? id) : "Unassigned";
  const typeColor = (id: string | null) =>
    (id && layer.spaceTypes.get(id)?.color) || "#DADDE1";

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Space name",
      cell: (r) => (
        <Stack direction="row" alignItems="center" spacing={1}>
          {r.apartment ? (
            <MeetingRoomOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
          ) : (
            <WidgetsOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
          )}
          <Typography variant="body2" fontWeight={500} noWrap>
            {r.name}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "category",
      label: "Category",
      cell: (r) => (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: "2px",
              bgcolor: typeColor(r.space_type),
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" noWrap>
            {typeName(r.space_type)}
          </Typography>
        </Stack>
      ),
    },
    // Which storey a space is on is the first thing drawing the plan
    // answers, so the column exists only once there is one.
    ...(hasPlan
      ? [{ key: "floor", label: "Floor", cell: (r: Row) => r.floor ?? "—" }]
      : []),
    {
      key: "residents",
      label: "Residents",
      align: "right",
      cell: (r) => (r.apartment ? `${r.residents}` : "—"),
    },
    {
      key: "devices",
      label: "Devices",
      align: "right",
      cell: (r) => `${r.devices}`,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.name} ${typeName(r.space_type)} ${r.floor ?? ""}`}
      searchPlaceholder="Search"
      filters={
        <>
          <FilterChip label="Category" />
          {hasPlan && <FilterChip label="Floor" />}
        </>
      }
    />
  );
}
