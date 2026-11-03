/**
 * The Structure tab.
 *
 * Like Overview, this one has a tab in the design and no frame behind it,
 * so it is derived rather than copied. What it is for: the tree in the
 * sidebar shows the building's shape one row at a time, and this shows the
 * same shape all at once — every space, its category, which storey it is
 * on, and how much is in it.
 *
 * It reads two different buildings, because before the plan there are two.
 *
 * Without a plan, the only structure that exists is the customer's own
 * list: apartments and the common spaces somebody is admitted to. There
 * are no storeys, so there is nothing to say about which floor anything is
 * on — and no per-storey envelopes either. Listing five rows called
 * "Elevator" here would be reporting a fact that drawing the building is
 * what establishes.
 *
 * With a plan, every envelope lists, which is more than the sidebar shows.
 * The tree stays the administered list and leaves out the shafts, the
 * stairwells and the hallways nobody needs permission to walk down — but a
 * lift shaft is structure, and this is the Structure tab. Listing them is
 * also what makes the strip above the table and the table itself count the
 * same building: both run off `allEnvelopes`, through the same
 * `groupAccessType` the editor's structure drawer groups by. A category
 * panel that counted differently here than it does while you are drawing
 * would be a second opinion about the building.
 */
import { useMemo } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  allEnvelopes,
  buildingSpaces,
  groupAccessType,
  roomsInGroup,
  spaceCategories,
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
  rooms: number;
  /** The storey, which only a plan can say. */
  floor: string | null;
  devices: number;
  apartment: boolean;
}

export function StructureTab({ layer, hasPlan }: StructureTabProps) {
  const categories = useMemo(
    () => (hasPlan ? spaceCategories(layer) : []),
    [layer, hasPlan],
  );

  const rows = useMemo<Row[]>(() => {
    const floorName = new Map(layer.floors.map((f) => [f.id, f.name]));

    /**
     * What a space's devices are: the units standing in its rooms, plus
     * the readers on its doors. A reader belongs to the space it checks
     * the way in to, which is what `guards` names — not to whichever side
     * of the wall it happens to be screwed on.
     *
     * Only once a plan exists, though. A door device is counted against
     * the space it guards, and before the building is drawn there are no
     * doors to hang one on — so counting it here would credit the Lobby
     * with a reader the Devices tab rightly lists as waiting to be
     * placed. Pre-plan, a space's devices are the units inside it.
     */
    const countDevices = (roomIds: Set<string>) => {
      let n = 0;
      for (const id of roomIds) {
        n += (layer.devicesInRoom.get(id) ?? []).length;
      }
      if (!hasPlan) return n;
      for (const device of layer.file.devices) {
        if (device.host_kind !== "door") continue;
        if (device.guards.some((g) => roomIds.has(g))) n += 1;
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
            rooms: rooms.length,
            floor: floorName.get(group.floor_id) ?? null,
            devices: countDevices(new Set(rooms.map((r) => r.id))),
            apartment: type === "apartment",
          };
        })
      : buildingSpaces(layer).map((space) => ({
          id: space.id,
          name: space.name,
          space_type: space.space_type,
          rooms: space.rooms.length,
          floor: null,
          devices: countDevices(new Set(space.rooms.map((r) => r.id))),
          apartment: space.apartment,
        }));

    // Common spaces first, then the units — the order the list is read in
    // rather than the order the file happens to store.
    return out.sort((a, b) => {
      if (a.apartment !== b.apartment) return a.apartment ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }, [layer, hasPlan]);

  const columns = hasPlan
    ? ["Space", "Category", "Floor", "Spaces inside", "Devices"]
    : ["Space", "Category", "Spaces inside", "Devices"];

  return (
    <Stack spacing={3}>
      {hasPlan && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Categories
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {categories.map((c) => (
              <Chip
                key={c.id ?? "unassigned"}
                label={`${c.name} · ${c.groups.length + c.rooms.length}`}
                variant="outlined"
                icon={
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "2px",
                      bgcolor: c.color,
                      ml: 1,
                    }}
                  />
                }
                sx={{ height: 28 }}
              />
            ))}
          </Stack>
        </Box>
      )}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((h, i) => (
                <TableCell
                  key={h}
                  align={i >= columns.length - 2 ? "right" : "left"}
                >
                  <Typography variant="body2" fontWeight={500}>
                    {h}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const type = row.space_type
                ? layer.spaceTypes.get(row.space_type)
                : undefined;
              return (
                <TableRow key={row.id} hover sx={{ height: 45 }}>
                  <TableCell>
                    <Typography variant="body2">{row.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "2px",
                          bgcolor: type?.color ?? "#DADDE1",
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        {type?.name ?? row.space_type ?? "Unassigned"}
                      </Typography>
                    </Stack>
                  </TableCell>
                  {hasPlan && (
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.floor ?? "—"}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <Typography variant="body2">{row.rooms}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{row.devices}</Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      {!hasPlan && (
        <Typography variant="caption" color="text.secondary">
          This is the building as the customer's own records describe it:
          apartments and the common spaces somebody is admitted to. Which
          storey each is on, where the stairs and the lifts run, and the
          hallways between them are what a floor plan adds.
        </Typography>
      )}
    </Stack>
  );
}
