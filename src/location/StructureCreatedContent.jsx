import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TablePagination from '@mui/material/TablePagination';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { FLOOR_LIST } from '../floorplan/floors.js';
import { seedZoneCategoryIds } from '../floorplan/categories.js';
import { getZoneDisplayName } from '../floorplan/formatNames.js';
import { useFloorPlanData } from '../floorplan/FloorPlanDataContext.jsx';
import { hashString, pick } from './fabricateData.js';
import StatusChip from './DataGridChips.jsx';

const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 56;

// Column widths mirror Figma's "<DataGridTable> byColumns" (node 11:33060)
// almost exactly, so the table is wider than its container and scrolls
// horizontally — that's the original mockup's own layout (its TableBody is
// 1816px inside a 1216px frame), not an accident of this port.
const COL = {
  checkbox: 42,
  name: 240,
  status: 160,
  devices: 118,
  state: 160,
  my2nId: 160,
  tenantsStaff: 120,
  units: 120,
  access: 160,
  integrations: 160,
  alerts: 160,
  notes: 160,
  menu: 56,
};

const STATUS_OPTIONS = [
  { tone: 'default', label: 'All Good' },
  { tone: 'warning', label: 'Needs attention' },
  { tone: 'error', label: 'Issue' },
];

// Only the Devices column is real (a live count off the actual device
// roster); every other non-Name column in Figma's mockup has no backing
// data model in this prototype, so its value is deterministically fabricated
// from the row's own id — see fabricateData.js's doc comment on why hashing
// beats Math.random() here. Tenants/Staff, Units and Access at least lean on
// the zone's real category where that gives a plausible answer (an
// apartment zone housing tenants, a hallway needing access control, etc.);
// State/My2N ID/Integrations/Alerts have nothing sensible to derive from and
// are just plausible-looking noise. Notes stays "—" for every row, matching
// Figma's own mockup content for that column exactly (no fabrication needed).
function buildRow(floor, zone, deviceCountByZoneId, categoryById) {
  const id = `${floor.floorId}__${zone.id}`;
  const category = categoryById[zone.categoryId];
  const hash = hashString(id);
  const isApartment = zone.categoryId === 'apartments';
  const isCommonArea = ['hallways', 'commercial', 'elevators', 'stairs'].includes(zone.categoryId);

  return {
    id,
    name: getZoneDisplayName(zone),
    category,
    floorLabel: floor.label,
    deviceCount: deviceCountByZoneId.get(zone.id) ?? 0,
    state: hash % 5 !== 0,
    my2nId: 100000 + (hash % 899999),
    tenantsStaff: isApartment,
    units: isApartment ? 1 : 0,
    access: isCommonArea || hash % 3 === 0,
    integrations: hash % 4,
    alerts: hash % 10 === 0 ? 1 + (hash % 3) : 0,
    status: pick(hash, 0, STATUS_OPTIONS),
  };
}

function BooleanCell({ value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      {value ? (
        <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
      ) : (
        <RemoveCircleOutlineIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
      )}
    </Box>
  );
}

/**
 * The Structure tab's Created-state content — matches Figma's "<DataGridTable>
 * byColumns" chrome AND its full column set (node 11:33060: checkbox, Name,
 * Status, Devices, State, My2N ID, Tenants/Staff, Units, Access,
 * Integrations, Alerts, Notes, a trailing row menu) per the user's explicit
 * correction that every column must be present, not just the ones with real
 * data behind them — see buildRow's doc comment for what's real vs.
 * fabricated.
 */
export default function StructureCreatedContent() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Zones/categories/devices all come from the shared store
  // (FloorPlanDataContext) so this table reflects editor edits — merge two
  // apartments and this drops to one row, recolor a category and the
  // swatches follow. Floors the editor hasn't loaded yet aren't in the store,
  // so those fall back to their static seed data, exactly as the editor
  // itself would seed them on first visit.
  const { floorsData, categories, devices } = useFloorPlanData();

  const rows = useMemo(() => {
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
    const deviceCountByZoneId = new Map();
    for (const device of devices) {
      if (device.pinned && device.zoneId) {
        deviceCountByZoneId.set(device.zoneId, (deviceCountByZoneId.get(device.zoneId) ?? 0) + 1);
      }
    }
    return FLOOR_LIST.flatMap((floor) => {
      const zones = floorsData[floor.floorId]?.zones ?? seedZoneCategoryIds(floor.data.zones);
      return zones.map((zone) => buildRow(floor, zone, deviceCountByZoneId, categoryById));
    });
  }, [floorsData, categories, devices]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (row) => row.name.toLowerCase().includes(query) || row.category?.name.toLowerCase().includes(query),
    );
  }, [rows, search]);

  const pagedRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Paper elevation={12} sx={{ overflow: 'hidden' }}>
      <Box sx={{ height: 64, display: 'flex', alignItems: 'center', px: 3 }}>
        <Box
          sx={{
            width: 320,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            border: '1px solid rgba(0,0,0,0.23)',
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
          }}
        >
          <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          <InputBase
            placeholder="Search"
            fullWidth
            sx={{ fontSize: 16 }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </Box>
      </Box>
      <Divider />
      <Box sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: Object.values(COL).reduce((a, b) => a + b, 0) }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: COL.checkbox, height: HEADER_HEIGHT, py: 0 }}>
                <Checkbox size="small" disabled />
              </TableCell>
              <TableCell sx={{ width: COL.name, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Name
              </TableCell>
              <TableCell sx={{ width: COL.status, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Status
              </TableCell>
              <TableCell align="right" sx={{ width: COL.devices, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Devices
              </TableCell>
              <TableCell align="center" sx={{ width: COL.state, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                State
              </TableCell>
              <TableCell align="right" sx={{ width: COL.my2nId, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                My2N ID
              </TableCell>
              <TableCell align="center" sx={{ width: COL.tenantsStaff, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Tenants/Staff
              </TableCell>
              <TableCell align="right" sx={{ width: COL.units, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Units
              </TableCell>
              <TableCell align="center" sx={{ width: COL.access, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Access
              </TableCell>
              <TableCell align="right" sx={{ width: COL.integrations, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Integrations
              </TableCell>
              <TableCell align="right" sx={{ width: COL.alerts, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Alerts
              </TableCell>
              <TableCell sx={{ width: COL.notes, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Notes
              </TableCell>
              <TableCell sx={{ width: COL.menu, height: HEADER_HEIGHT, py: 0 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((row) => (
              <TableRow key={row.id} hover sx={{ height: ROW_HEIGHT }}>
                <TableCell sx={{ width: COL.checkbox, height: ROW_HEIGHT, py: 0 }}>
                  <Checkbox size="small" disabled />
                </TableCell>
                <TableCell sx={{ width: COL.name, height: ROW_HEIGHT, py: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: '2px',
                        bgcolor: row.category?.color,
                        border: '1px solid #cfd8dc',
                        flexShrink: 0,
                      }}
                    />
                    <Typography fontSize={14} fontWeight={700}>
                      {row.name}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ width: COL.status, height: ROW_HEIGHT, py: 0 }}>
                  <StatusChip tone={row.status.tone} label={row.status.label} />
                </TableCell>
                <TableCell align="right" sx={{ width: COL.devices, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14}>{row.deviceCount}</Typography>
                </TableCell>
                <TableCell align="center" sx={{ width: COL.state, height: ROW_HEIGHT, py: 0 }}>
                  <BooleanCell value={row.state} />
                </TableCell>
                <TableCell align="right" sx={{ width: COL.my2nId, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14}>{row.my2nId}</Typography>
                </TableCell>
                <TableCell align="center" sx={{ width: COL.tenantsStaff, height: ROW_HEIGHT, py: 0 }}>
                  <BooleanCell value={row.tenantsStaff} />
                </TableCell>
                <TableCell align="right" sx={{ width: COL.units, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14}>{row.units}</Typography>
                </TableCell>
                <TableCell align="center" sx={{ width: COL.access, height: ROW_HEIGHT, py: 0 }}>
                  <BooleanCell value={row.access} />
                </TableCell>
                <TableCell align="right" sx={{ width: COL.integrations, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14}>{row.integrations}</Typography>
                </TableCell>
                <TableCell align="right" sx={{ width: COL.alerts, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14}>{row.alerts}</Typography>
                </TableCell>
                <TableCell sx={{ width: COL.notes, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14} color="text.disabled">
                    —
                  </Typography>
                </TableCell>
                <TableCell sx={{ width: COL.menu, height: ROW_HEIGHT, py: 0 }}>
                  <IconButton size="small" disabled>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <TablePagination
        component="div"
        count={filteredRows.length}
        page={page}
        onPageChange={(_e, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
      />
    </Paper>
  );
}
