/**
 * The three tables behind the Devices, Residents and Operators tabs.
 *
 * Figma: 108:269031 (devices), 108:270663 (people). Each is the shared
 * DataTable with its own columns and its own filter chips.
 */
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccountCircleOutlined from "@mui/icons-material/AccountCircleOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import CloudDownloadOutlined from "@mui/icons-material/CloudDownloadOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import ShareOutlined from "@mui/icons-material/ShareOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import IconButton from "@mui/material/IconButton";
import { Column, DataTable, FilterChip, StatusChip } from "./DataTable";
import { DeviceGlyph } from "../DeviceMarker";
import {
  deviceStatusName,
  operatorRoleName,
  type BuildingDevice,
  type Operator,
  type Resident,
} from "../../model";

// ---------------------------------------------------------------- devices

const DEVICE_COLUMNS: Column<BuildingDevice>[] = [
  {
    key: "name",
    label: "Device name",
    cell: (d) => (
      <Stack direction="row" alignItems="center" spacing={1}>
        <DeviceGlyph type={glyphFor(d.type)} size={20} />
        <Typography variant="body2" fontWeight={500} noWrap>
          {d.name}
        </Typography>
      </Stack>
    ),
  },
  { key: "type", label: "Device type", cell: (d) => d.type },
  {
    key: "placement",
    label: "Placement",
    // An em dash, not an empty cell: nothing has placed it yet, which is
    // a fact about the device rather than a gap in the table.
    cell: (d) => d.placement ?? "—",
  },
  {
    key: "status",
    label: "Status",
    cell: (d) => (
      <StatusChip
        label={deviceStatusName(d.status)}
        tone={d.status === "ok" ? "ok" : d.status === "offline" ? "bad" : "warn"}
      />
    ),
  },
  { key: "shared", label: "Shared configuration", cell: () => "—" },
];

/** The marker glyphs are drawn per model type, not per product name. */
function glyphFor(product: string): string {
  if (product === "IP Style") return "intercom";
  if (product === "IndoorView") return "answering_unit";
  return "access_unit";
}

export function DevicesTable({ devices }: { devices: BuildingDevice[] }) {
  return (
    <DataTable
      rows={devices}
      columns={DEVICE_COLUMNS}
      rowKey={(d) => d.id}
      searchable={(d) => `${d.name} ${d.type} ${d.placement ?? ""} ${d.id}`}
      searchPlaceholder="Name, SN, ID"
      filters={
        <>
          <FilterChip label="Errors" />
          <FilterChip label="Need fix" />
          <FilterChip label="State" />
          <FilterChip label="Type" />
          <FilterChip label="Placement" />
          <FilterChip label="FW status" />
        </>
      }
    />
  );
}

// -------------------------------------------------------------- residents

export function ResidentsTable({ residents }: { residents: Resident[] }) {
  const columns: Column<Resident>[] = [
    { key: "name", label: "Resident name", cell: (r) => <PersonName name={r.name} /> },
    {
      key: "apartment",
      label: "Apartment",
      cell: (r) => (
        <Chip
          size="small"
          icon={<MeetingRoomOutlined sx={{ fontSize: 16 }} />}
          label={r.apartment_name}
          variant="outlined"
          sx={{ height: 24, fontSize: 13 }}
        />
      ),
    },
    { key: "email", label: "Email", cell: (r) => <Email person={r} /> },
    {
      key: "status",
      label: "Status",
      cell: (r) => (
        <StatusChip
          label={r.status === "ready" ? "Ready" : "Pending"}
          tone={r.status === "ready" ? "ok" : "warn"}
        />
      ),
    },
    { key: "phone", label: "Phone number", cell: (r) => r.phone },
    { key: "notes", label: "Notes", cell: () => "" },
  ];

  return (
    <DataTable
      rows={residents}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.name} ${r.email} ${r.phone} ${r.apartment_name}`}
      searchPlaceholder="Search"
      filters={
        <>
          <FilterChip label="Pending" />
          <FilterChip label="Problem" />
          <FilterChip label="Status" />
          <FilterChip label="Services" />
        </>
      }
      tools={
        <>
          <IconButton size="small">
            <ShareOutlined sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton size="small" color="primary">
            <CloudDownloadOutlined sx={{ fontSize: 20 }} />
          </IconButton>
        </>
      }
    />
  );
}

// -------------------------------------------------------------- operators

export function OperatorsTable({ operators }: { operators: Operator[] }) {
  const columns: Column<Operator>[] = [
    { key: "name", label: "Operator name", cell: (o) => <PersonName name={o.name} /> },
    {
      key: "role",
      label: "Role",
      cell: (o) => (
        <Chip
          size="small"
          label={operatorRoleName(o.role)}
          variant="outlined"
          sx={{ height: 24, fontSize: 13 }}
        />
      ),
    },
    { key: "email", label: "Email", cell: (o) => <Email person={o} /> },
    {
      key: "status",
      label: "Status",
      cell: () => <StatusChip label="Ready" tone="ok" />,
    },
    { key: "phone", label: "Phone number", cell: (o) => o.phone },
    { key: "notes", label: "Notes", cell: () => "" },
  ];

  return (
    <DataTable
      rows={operators}
      columns={columns}
      rowKey={(o) => o.id}
      searchable={(o) => `${o.name} ${o.email} ${o.phone} ${operatorRoleName(o.role)}`}
      searchPlaceholder="Search"
      filters={
        <>
          <FilterChip label="Pending" />
          <FilterChip label="Problem" />
          <FilterChip label="Role" />
          <FilterChip label="Status" />
        </>
      }
      tools={
        <IconButton size="small">
          <ShareOutlined sx={{ fontSize: 20 }} />
        </IconButton>
      }
    />
  );
}

// ----------------------------------------------------------------- shared

function PersonName({ name }: { name: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <AccountCircleOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
      <Typography variant="body2" fontWeight={500} noWrap>
        {name}
      </Typography>
    </Stack>
  );
}

/** A tick once the address is confirmed, a warning while it is not. */
function Email({ person }: { person: { email: string; status: string } }) {
  const ready = person.status === "ready";
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      {ready ? (
        <CheckCircleOutline sx={{ fontSize: 18, color: "#2E7D32" }} />
      ) : (
        <WarningAmberOutlined sx={{ fontSize: 18, color: "#C77700" }} />
      )}
      <Typography variant="body2" noWrap>
        {person.email}
      </Typography>
      <Box />
    </Stack>
  );
}
