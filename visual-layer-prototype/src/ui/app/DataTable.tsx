/**
 * The table the Devices, Residents and Operators tabs are all made of.
 *
 * Figma: 108:269031, 108:270663. The three tabs differ in their columns
 * and their filter chips and in nothing else — same card, same toolbar,
 * same checkbox column, same row menu, same footer. Writing it three times
 * would be writing the pagination three times.
 */
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import FilterListIcon from "@mui/icons-material/FilterList";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import KeyboardArrowLeft from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import LastPageIcon from "@mui/icons-material/LastPage";
import MoreHoriz from "@mui/icons-material/MoreHoriz";
import SearchIcon from "@mui/icons-material/Search";
import ViewWeekOutlined from "@mui/icons-material/ViewWeekOutlined";

export interface Column<T> {
  key: string;
  label: string;
  /** What goes in the cell; a string is rendered as body2 text. */
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: number | string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Free-text search runs over whatever this returns. */
  searchable: (row: T) => string;
  searchPlaceholder: string;
  /** The chips and dropdowns above the table, which are per tab. */
  filters: ReactNode;
  /** Icons at the right of the toolbar, after search. */
  tools?: ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchable,
  searchPlaceholder,
  filters,
  tools,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchable(r).toLowerCase().includes(q));
  }, [rows, query, searchable]);

  // A search that shortens the list can leave the page past the end.
  const lastPage = Math.max(0, Math.ceil(found.length / perPage) - 1);
  const at = Math.min(page, lastPage);
  const shown = found.slice(at * perPage, at * perPage + perPage);

  const allPicked = shown.length > 0 && shown.every((r) => picked.has(rowKey(r)));
  const togglePage = () =>
    setPicked((was) => {
      const next = new Set(was);
      for (const row of shown) {
        if (allPicked) next.delete(rowKey(row));
        else next.add(rowKey(row));
      }
      return next;
    });

  return (
    <Paper variant="outlined" sx={{ display: "flex", flexDirection: "column" }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ p: 2, flexWrap: "wrap", rowGap: 1 }}
      >
        {filters}
        <Box sx={{ flex: 1, minWidth: 16 }} />
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          sx={{ width: 200 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        {tools}
        <IconButton size="small">
          <FilterListIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <IconButton size="small">
          <ViewWeekOutlined sx={{ fontSize: 20 }} />
        </IconButton>
      </Stack>

      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={allPicked}
                  indeterminate={
                    !allPicked && shown.some((r) => picked.has(rowKey(r)))
                  }
                  onChange={togglePage}
                />
              </TableCell>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  align={c.align ?? "left"}
                  sx={{ width: c.width, whiteSpace: "nowrap" }}
                >
                  <Typography variant="body2" fontWeight={500}>
                    {c.label}
                  </Typography>
                </TableCell>
              ))}
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((row) => {
              const id = rowKey(row);
              return (
                <TableRow key={id} hover sx={{ height: 45 }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={picked.has(id)}
                      onChange={() =>
                        setPicked((was) => {
                          const next = new Set(was);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.align ?? "left"}>
                      {typeof c.cell(row) === "string" ? (
                        <Typography variant="body2" noWrap>
                          {c.cell(row)}
                        </Typography>
                      ) : (
                        c.cell(row)
                      )}
                    </TableCell>
                  ))}
                  <TableCell padding="checkbox">
                    <IconButton size="small">
                      <MoreHoriz sx={{ fontSize: 20 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 2}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ py: 3, textAlign: "center" }}
                  >
                    Nothing matches “{query}”.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <Divider />
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="flex-end"
        spacing={2}
        sx={{ px: 2, py: 1 }}
      >
        <Typography variant="body2" color="text.secondary">
          Rows per page:
        </Typography>
        <Select
          variant="standard"
          disableUnderline
          value={perPage}
          onChange={(e) => {
            setPerPage(Number(e.target.value));
            setPage(0);
          }}
          sx={{ fontSize: 14 }}
        >
          {[10, 25, 50].map((n) => (
            <MenuItem key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </Select>
        <Typography variant="body2" color="text.secondary">
          {found.length === 0
            ? "0 of 0"
            : `${at * perPage + 1}-${Math.min(found.length, (at + 1) * perPage)} of ${found.length}`}
        </Typography>
        <Box>
          <IconButton
            size="small"
            disabled={at === 0}
            onClick={() => setPage(0)}
          >
            <FirstPageIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton
            size="small"
            disabled={at === 0}
            onClick={() => setPage(at - 1)}
          >
            <KeyboardArrowLeft sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton
            size="small"
            disabled={at >= lastPage}
            onClick={() => setPage(at + 1)}
          >
            <KeyboardArrowRight sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton
            size="small"
            disabled={at >= lastPage}
            onClick={() => setPage(lastPage)}
          >
            <LastPageIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Stack>
    </Paper>
  );
}

/** The outlined pills above the table — Errors, Need fix, Pending, … */
export function FilterChip({ label }: { label: string }) {
  return (
    <Button variant="outlined" color="inherit" size="small" sx={{ px: 1.5 }}>
      {label}
    </Button>
  );
}

/** A status pill: green when it is fine, amber when somebody must act. */
export function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok" ? "#2E7D32" : tone === "warn" ? "#C77700" : "#C62828";
  return (
    <Chip
      size="small"
      label={label}
      variant="outlined"
      sx={{
        height: 24,
        fontSize: 13,
        color,
        borderColor: color,
      }}
    />
  );
}
