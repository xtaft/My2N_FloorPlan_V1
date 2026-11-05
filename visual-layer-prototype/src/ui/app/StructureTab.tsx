/**
 * The Structure tab: the building's structure, in a grid that opens.
 *
 * Once a plan exists this shows the same hierarchy the navigation tree
 * does — floors, the envelopes on them, the envelopes and rooms inside
 * those — as a MUI DataGrid whose rows fold. The grid itself is flat;
 * what it is handed is the tree walked as far as it is open, each row
 * knowing its depth, and the name cell draws the indent and the
 * chevron. Floors are rows like the rest, with no category: a category
 * is something a space reads, and a floor is not a space.
 *
 * Before the plan there is no hierarchy to show, because the building
 * has none: apartments and the common spaces people are admitted to,
 * flat, with no categories yet — those are given while the plan is
 * checked.
 *
 * A search or a filter flattens the grid: what matches is listed, with
 * the floor it is on, rather than hidden inside a folded branch where
 * it could not be seen to match.
 */
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import SearchIcon from "@mui/icons-material/Search";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import { FilterMenu } from "./DataTable";
import {
  accessType,
  buildingSpaces,
  floorEnvelopes,
  groupAccessType,
  residents,
  roomsInGroup,
  type Group,
  type Room,
  type VisualLayer,
} from "../../model";

export interface StructureTabProps {
  layer: VisualLayer;
  hasPlan: boolean;
}

/** What a row is: the structural kind, not the category it reads. */
type Kind = "floor" | "group" | "apartment" | "room";

const KIND_LABEL: Record<Kind, string> = {
  floor: "Floor",
  group: "Group",
  apartment: "Apartment",
  room: "Room",
};

/** One thing in the structure, with what hangs off it. */
interface Node {
  id: string;
  name: string;
  kind: Kind;
  category: string | null;
  floor: string | null;
  residents: number;
  devices: number;
  children: Node[];
}

/** A node as the grid sees it: where it is in the tree, and whether it is open. */
interface Row {
  id: string;
  name: string;
  kind: Kind;
  category: string | null;
  floor: string | null;
  residents: number;
  devices: number;
  depth: number;
  hasChildren: boolean;
  open: boolean;
}

export function StructureTab({ layer, hasPlan }: StructureTabProps) {
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  /** Floors start open, the way the navigation tree has them. */
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const tree = useMemo<Node[]>(() => buildTree(layer, hasPlan), [layer, hasPlan]);

  const typeName = (id: string | null) =>
    id ? (layer.spaceTypes.get(id)?.name ?? id) : "Unknown";
  const typeColor = (id: string | null) =>
    (id && layer.spaceTypes.get(id)?.color) || "#DADDE1";

  const every = useMemo(() => flatten(tree), [tree]);

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of every) {
      if (n.category && !seen.has(n.category)) seen.set(n.category, typeName(n.category));
    }
    return [...seen]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [every]);
  const kindOptions = useMemo(
    () =>
      (Object.keys(KIND_LABEL) as Kind[])
        .filter((k) => every.some((n) => n.kind === k))
        .map((k) => ({ id: k, label: KIND_LABEL[k] })),
    [every],
  );

  const q = query.trim().toLowerCase();
  const narrowing = q !== "" || kinds.size > 0 || categories.size > 0;

  const rows = useMemo<Row[]>(() => {
    if (narrowing) {
      // Flat: what matches, wherever it is.
      return every
        .filter(
          (n) =>
            (kinds.size === 0 || kinds.has(n.kind)) &&
            (categories.size === 0 || (n.category !== null && categories.has(n.category))) &&
            (!q ||
              `${n.name} ${KIND_LABEL[n.kind]} ${n.category ? typeName(n.category) : ""} ${n.floor ?? ""}`
                .toLowerCase()
                .includes(q)),
        )
        .map((n) => ({ ...n, depth: 0, hasChildren: false, open: false }));
    }
    // The tree, as far as it is open.
    const out: Row[] = [];
    const walk = (n: Node, depth: number) => {
      const isOpen = n.kind === "floor" ? !closed.has(n.id) : opened.has(n.id);
      out.push({ ...n, depth, hasChildren: n.children.length > 0, open: isOpen });
      if (isOpen) for (const c of n.children) walk(c, depth + 1);
    };
    for (const n of tree) walk(n, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, every, narrowing, q, kinds, categories, closed, opened]);

  const toggle = (row: Row) => {
    if (row.kind === "floor") {
      setClosed((was) => {
        const next = new Set(was);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    } else {
      setOpened((was) => {
        const next = new Set(was);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    }
  };

  const columns: GridColDef<Row>[] = [
    {
      field: "name",
      headerName: "Space name",
      flex: 1.6,
      minWidth: 240,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack
          direction="row"
          alignItems="center"
          sx={{ pl: `${row.depth * 24}px`, height: "100%", minWidth: 0 }}
        >
          <Box sx={{ width: 28, display: "flex", justifyContent: "center" }}>
            {row.hasChildren && (
              <IconButton size="small" onClick={() => toggle(row)} sx={{ p: 0.25 }}>
                {row.open ? (
                  <ExpandMore sx={{ fontSize: 18 }} />
                ) : (
                  <ChevronRight sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            )}
          </Box>
          <KindIcon kind={row.kind} />
          <Typography variant="body2" fontWeight={row.kind === "floor" ? 500 : 400} noWrap>
            {row.name}
          </Typography>
        </Stack>
      ),
    },
    { field: "kind", headerName: "Space type", width: 130, sortable: false, valueGetter: (_v, row) => KIND_LABEL[row.kind] },
    ...(hasPlan
      ? ([
          {
            field: "category",
            headerName: "Category",
            width: 170,
            sortable: false,
            // A floor is not a space, and reads nothing.
            renderCell: ({ row }) =>
              row.kind === "floor" ? null : (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ height: "100%" }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "2px",
                      bgcolor: typeColor(row.category),
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="body2" noWrap>
                    {typeName(row.category)}
                  </Typography>
                </Stack>
              ),
          },
          {
            field: "floor",
            headerName: "Floor",
            width: 130,
            sortable: false,
            valueGetter: (_v, row) => (row.kind === "floor" ? "" : (row.floor ?? "—")),
          },
        ] as GridColDef<Row>[])
      : []),
    {
      field: "residents",
      headerName: "Residents",
      width: 110,
      align: "right",
      headerAlign: "right",
      sortable: false,
      valueGetter: (_v, row) => (row.kind === "apartment" ? row.residents : "—"),
    },
    {
      field: "devices",
      headerName: "Devices",
      width: 100,
      align: "right",
      headerAlign: "right",
      sortable: false,
    },
  ];

  return (
    <Paper variant="outlined">
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ p: 2, flexWrap: "wrap", rowGap: 1 }}
      >
        <FilterMenu label="Space type" options={kindOptions} selected={kinds} onChange={setKinds} />
        {hasPlan && (
          <FilterMenu
            label="Category"
            options={categoryOptions}
            selected={categories}
            onChange={setCategories}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 16 }} />
        <TextField
          size="small"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ width: 200 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
      </Stack>
      <DataGrid
        rows={rows}
        columns={columns}
        autoHeight
        rowHeight={45}
        columnHeaderHeight={45}
        checkboxSelection
        disableRowSelectionOnClick
        disableColumnMenu
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        sx={{
          border: 0,
          borderTop: 1,
          borderColor: "divider",
          "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 500 },
          "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
        }}
      />
    </Paper>
  );
}

function KindIcon({ kind }: { kind: Kind }) {
  const sx = { fontSize: 20, color: "text.secondary", mr: 1, flexShrink: 0 } as const;
  if (kind === "floor") return <LayersOutlined sx={sx} />;
  if (kind === "group") return <WidgetsOutlined sx={sx} />;
  return <MeetingRoomOutlined sx={sx} />;
}

// ------------------------------------------------------------------ tree

function flatten(nodes: Node[]): Node[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/**
 * The structure, as the navigation tree walks it.
 *
 * With a plan: floors, then `floorEnvelopes` on each — the same call
 * the tree uses, which passes through a floor's own envelope — then
 * each envelope's nested envelopes and its rooms. Without one: the
 * customer's spaces, flat.
 */
function buildTree(layer: VisualLayer, hasPlan: boolean): Node[] {
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

  if (!hasPlan) {
    return buildingSpaces(layer).map((space) => ({
      id: space.id,
      name: space.name,
      kind: space.apartment ? "apartment" : "room",
      category: null,
      floor: null,
      residents: living(space.id),
      devices: devices(new Set(space.rooms.map((r) => r.id))),
      children: [],
    }));
  }

  const floorName = new Map(layer.floors.map((f) => [f.id, f.name]));
  const roomNode = (room: Room): Node => ({
    id: room.id,
    name: room.name,
    kind: "room",
    category: accessType(layer, room),
    floor: floorName.get(room.floor_id) ?? null,
    residents: 0,
    devices: devices(new Set([room.id])),
    children: [],
  });
  const groupNode = (g: Group): Node => {
    const type = groupAccessType(layer, g);
    const own = layer.file.rooms.filter((r) => r.group_id === g.id);
    const kids = layer.childGroups.get(g.id) ?? [];
    return {
      id: g.id,
      name: g.name,
      kind: type === "apartment" ? "apartment" : "group",
      category: type,
      floor: floorName.get(g.floor_id) ?? null,
      residents: living(g.id),
      devices: devices(new Set(roomsInGroup(layer, g.id).map((r) => r.id))),
      children: [
        ...kids.map(groupNode),
        ...own
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map(roomNode),
      ],
    };
  };

  return layer.floors.map((floor) => ({
    id: floor.id,
    name: floor.name,
    kind: "floor",
    category: null,
    floor: null,
    residents: 0,
    // Everything placed on the storey, the way the Devices tab counts.
    devices: layer.file.devices.filter((d) => d.floor_id === floor.id && d.host_id !== null).length,
    children: [
      ...floorEnvelopes(layer, floor.id).map(groupNode),
      // Rooms in no envelope sit under the floor itself, as in the tree.
      ...(layer.roomsByFloor.get(floor.id) ?? [])
        .filter((r) => r.group_id === null)
        .map(roomNode),
    ],
  }));
}
