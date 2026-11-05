/**
 * The Structure tab: the building's spaces, in the same table the
 * Devices and Residents tabs use.
 *
 * Before the plan the list is flat, because the building is. The
 * customer's records have apartments and the common spaces people are
 * admitted to, and nothing above or below them: no groups, no rooms
 * inside a flat, no storey a flat is on — and no categories, which
 * are given to spaces while the plan is checked. So a row is a space
 * of one of two kinds, a flat or a room, and that is the only filter.
 *
 * Once a plan exists the same table lists the whole structure, flat:
 * every group, flat and room, each saying what it is, which category
 * it reads, which floor it is on and what it is inside. The two
 * filters are what the table is for then — "the rooms", "the gym".
 */
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import { Column, DataTable, FilterMenu } from "./DataTable";
import {
  accessType,
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

/** What a row is: the structural kind, not the category it reads. */
type Kind = "group" | "apartment" | "room";

const KIND_LABEL: Record<Kind, string> = {
  group: "Group",
  apartment: "Apartment",
  room: "Room",
};
const KIND_ORDER: Record<Kind, number> = { group: 0, apartment: 1, room: 2 };

interface Row {
  id: string;
  name: string;
  kind: Kind;
  /** Null before the plan, when nothing has been given one. */
  category: string | null;
  /** Which storey, which only a plan can say. */
  floor: string | null;
  /** The envelope this sits in, once there is a hierarchy to sit in. */
  within: string | null;
  residents: number;
  devices: number;
}

export function StructureTab({ layer, hasPlan }: StructureTabProps) {
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());

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

    let out: Row[];
    if (!hasPlan) {
      out = buildingSpaces(layer).map((space) => ({
        id: space.id,
        name: space.name,
        kind: space.apartment ? "apartment" : "room",
        category: null,
        floor: null,
        within: null,
        residents: living(space.id),
        devices: devices(new Set(space.rooms.map((r) => r.id))),
      }));
    } else {
      const groupRows: Row[] = allEnvelopes(layer).flatMap((group) => {
        // An envelope's own rows: it, and every envelope nested in it.
        const nest = (g: typeof group, within: string | null): Row[] => {
          const type = groupAccessType(layer, g);
          const rooms = roomsInGroup(layer, g.id);
          const children = layer.childGroups.get(g.id) ?? [];
          const self: Row = {
            id: g.id,
            name: g.name,
            kind: type === "apartment" ? "apartment" : "group",
            category: type,
            floor: floorName.get(g.floor_id) ?? null,
            within,
            residents: living(g.id),
            devices: devices(new Set(rooms.map((r) => r.id))),
          };
          return [self, ...children.flatMap((c) => nest(c, g.name))];
        };
        return nest(group, null);
      });
      const roomRows: Row[] = layer.file.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        kind: "room",
        category: accessType(layer, room),
        floor: floorName.get(room.floor_id) ?? null,
        within: room.group_id ? (layer.groups.get(room.group_id)?.name ?? null) : null,
        residents: 0,
        devices: devices(new Set([room.id])),
      }));
      out = [...groupRows, ...roomRows];
    }

    return out.sort((a, b) => {
      if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }, [layer, hasPlan]);

  const typeName = (id: string | null) =>
    id ? (layer.spaceTypes.get(id)?.name ?? id) : "Unknown";
  const typeColor = (id: string | null) =>
    (id && layer.spaceTypes.get(id)?.color) || "#DADDE1";

  // The categories there are to filter by: the ones some row reads.
  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.category && !seen.has(r.category)) seen.set(r.category, typeName(r.category));
    }
    return [...seen].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const kindOptions = useMemo(
    () =>
      (Object.keys(KIND_LABEL) as Kind[])
        .filter((k) => rows.some((r) => r.kind === k))
        .map((k) => ({ id: k, label: KIND_LABEL[k] })),
    [rows],
  );

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (kinds.size === 0 || kinds.has(r.kind)) &&
          (categories.size === 0 || (r.category !== null && categories.has(r.category))),
      ),
    [rows, kinds, categories],
  );

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Space name",
      cell: (r) => (
        <Stack direction="row" alignItems="center" spacing={1}>
          {r.kind === "group" ? (
            <WidgetsOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
          ) : (
            <MeetingRoomOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
          )}
          <Typography variant="body2" fontWeight={500} noWrap>
            {r.name}
          </Typography>
        </Stack>
      ),
    },
    { key: "kind", label: "Space type", cell: (r) => KIND_LABEL[r.kind] },
    // Categories are given while the plan is checked, so before it there
    // are none to show; which storey a space is on, and what it sits
    // inside, are the first things the plan answers.
    ...(hasPlan
      ? ([
          {
            key: "category",
            label: "Category",
            cell: (r: Row) => (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "2px",
                    bgcolor: typeColor(r.category),
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2" noWrap>
                  {typeName(r.category)}
                </Typography>
              </Stack>
            ),
          },
          { key: "floor", label: "Floor", cell: (r: Row) => r.floor ?? "—" },
          { key: "within", label: "In", cell: (r: Row) => r.within ?? "—" },
        ] as Column<Row>[])
      : []),
    {
      key: "residents",
      label: "Residents",
      align: "right",
      cell: (r) => (r.kind === "apartment" ? `${r.residents}` : "—"),
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
      rows={shown}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) =>
        `${r.name} ${KIND_LABEL[r.kind]} ${r.category ? typeName(r.category) : ""} ${r.floor ?? ""} ${r.within ?? ""}`
      }
      searchPlaceholder="Search"
      filters={
        <>
          <FilterMenu
            label="Space type"
            options={kindOptions}
            selected={kinds}
            onChange={setKinds}
          />
          {hasPlan && (
            <FilterMenu
              label="Category"
              options={categoryOptions}
              selected={categories}
              onChange={setCategories}
            />
          )}
        </>
      }
    />
  );
}
