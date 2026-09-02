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
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import LinkIcon from '@mui/icons-material/Link';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import DeviceIcon from '../floorplan/components/DeviceIcon.jsx';
import { DEVICE_TYPE } from '../floorplan/devices.js';
import { useFloorPlanData } from '../floorplan/FloorPlanDataContext.jsx';
import { hashString, pick } from './fabricateData.js';
import StatusChip from './DataGridChips.jsx';

const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 56;

// Column widths mirror Figma's "<DataGridTable> byColumns" (node 105:112066)
// — same reasoning as StructureCreatedContent's COL constant.
const COL = {
  checkbox: 42,
  name: 238,
  status: 160,
  services: 200,
  fwVersion: 80,
  fwStatus: 160,
  id: 120,
  integration: 80,
  notes: 80,
  menu: 56,
};

const STATUS_OPTIONS = [
  { tone: 'success', label: 'Good' },
  { tone: 'success', label: 'Good' },
  { tone: 'success', label: 'Good' },
  { tone: 'default', label: 'Unknown' },
  { tone: 'warning', label: 'Need settings' },
  { tone: 'error', label: 'Unlicenced' },
];

const FW_VERSION_OPTIONS = ['2.48.1', '2.48.1', '2.48.1', '2.40.2', '2.23.1', '2.40.5'];

const FW_STATUS_OPTIONS = [
  { tone: 'success', label: 'Up to date' },
  { tone: 'success', label: 'Up to date' },
  { tone: 'success', label: 'Up to date' },
  { tone: 'success', label: 'Update available' },
  { tone: 'warning', label: 'Need update' },
  { tone: 'error', label: 'Need fix' },
];

// Apartment zone ids look like "apartment__A11" — matches Figma's sample "ID"
// column values (short unit codes like "B0101"), so a pinned apartment
// device gets an id built the same way; everything else has none, matching
// most of Figma's own sample rows being blank.
function externalId(device) {
  if (!device.zoneId?.startsWith('apartment__')) return '';
  const code = device.zoneId.slice('apartment__'.length);
  return `B${code.slice(1)}`;
}

// Only Name/icon and the derived externalId are real. Status/Services/FW
// version/FW status/Integration are fabricated the same way
// StructureCreatedContent's non-Name columns are — deterministically, from
// the device's own id, since none of it has a backing data model. Notes is
// the one exception with real meaning behind it: it flags devices that
// aren't pinned anywhere yet, which is genuine roster state.
function decorateDevice(device) {
  const hash = hashString(device.id);
  return {
    ...device,
    status: pick(hash, 1, STATUS_OPTIONS),
    fwVersion: pick(hash, 2, FW_VERSION_OPTIONS),
    fwStatus: pick(hash, 3, FW_STATUS_OPTIONS),
    externalId: externalId(device),
    hasIntegration: device.type === DEVICE_TYPE.accessUnit || device.type === DEVICE_TYPE.ipVerso || device.type === DEVICE_TYPE.ipStyle,
    needsNote: !device.pinned,
  };
}

/**
 * The Devices tab's Created-state content — matches Figma's "<DataGridTable>
 * byColumns" chrome AND its full column set (node 105:112066: checkbox,
 * Name, Status, Services, FW version, FW status, ID, Integration, Notes, a
 * trailing row menu) per the user's explicit correction that every column
 * must be present, not just the ones with real data behind them — see
 * decorateDevice's doc comment for what's real vs. fabricated.
 */
export default function DevicesCreatedContent() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Straight off the shared store (FloorPlanDataContext), so a device
  // pinned/unpinned/renamed in the editor is reflected here too.
  const { devices: storedDevices } = useFloorPlanData();
  const devices = useMemo(() => storedDevices.map(decorateDevice), [storedDevices]);

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return devices;
    return devices.filter((d) => d.name.toLowerCase().includes(query));
  }, [devices, search]);

  const pagedDevices = filteredDevices.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
              <TableCell sx={{ width: COL.services, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Services
              </TableCell>
              <TableCell sx={{ width: COL.fwVersion, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                FW version
              </TableCell>
              <TableCell sx={{ width: COL.fwStatus, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                FW status
              </TableCell>
              <TableCell sx={{ width: COL.id, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                External ID
              </TableCell>
              <TableCell align="center" sx={{ width: COL.integration, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Integration
              </TableCell>
              <TableCell align="center" sx={{ width: COL.notes, height: HEADER_HEIGHT, fontWeight: 500, fontSize: 14 }}>
                Notes
              </TableCell>
              <TableCell sx={{ width: COL.menu, height: HEADER_HEIGHT, py: 0 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedDevices.map((device) => (
              <TableRow key={device.id} hover sx={{ height: ROW_HEIGHT }}>
                <TableCell sx={{ width: COL.checkbox, height: ROW_HEIGHT, py: 0 }}>
                  <Checkbox size="small" disabled />
                </TableCell>
                <TableCell sx={{ width: COL.name, height: ROW_HEIGHT, py: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <DeviceIcon type={device.type} size={20} />
                    <Typography fontSize={14} fontWeight={700}>
                      {device.name}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ width: COL.status, height: ROW_HEIGHT, py: 0 }}>
                  <StatusChip tone={device.status.tone} label={device.status.label} />
                </TableCell>
                <TableCell sx={{ width: COL.services, height: ROW_HEIGHT, py: 0 }}>
                  <CloudDoneIcon sx={{ fontSize: 20, color: 'text.secondary' }} titleAccess="My2N Service" />
                </TableCell>
                <TableCell sx={{ width: COL.fwVersion, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14}>{device.fwVersion}</Typography>
                </TableCell>
                <TableCell sx={{ width: COL.fwStatus, height: ROW_HEIGHT, py: 0 }}>
                  <StatusChip tone={device.fwStatus.tone} label={device.fwStatus.label} />
                </TableCell>
                <TableCell sx={{ width: COL.id, height: ROW_HEIGHT, py: 0 }}>
                  <Typography fontSize={14}>{device.externalId}</Typography>
                </TableCell>
                <TableCell align="center" sx={{ width: COL.integration, height: ROW_HEIGHT, py: 0 }}>
                  {device.hasIntegration && <LinkIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
                </TableCell>
                <TableCell align="center" sx={{ width: COL.notes, height: ROW_HEIGHT, py: 0 }}>
                  {device.needsNote && (
                    <StickyNote2Icon
                      sx={{ fontSize: 18, color: 'text.secondary' }}
                      titleAccess="Not yet placed"
                    />
                  )}
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
        count={filteredDevices.length}
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
