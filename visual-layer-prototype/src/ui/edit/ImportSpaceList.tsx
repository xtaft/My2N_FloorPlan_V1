/**
 * Import Space List. Figma 42:74682 — a drop zone, the template beside it,
 * and the matching rules stated before anything is chosen rather than after
 * something has gone wrong.
 *
 * Two steps, as the design's Next implies. A space list arrives from a
 * letting system or a spreadsheet nobody has checked, and an import that
 * renames thirty rooms is not something to find out about afterwards — so
 * the second step says what matched before any of it is written.
 */
import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import Close from "@mui/icons-material/Close";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import {
  OperationRejected,
  matchSpaceList,
  parseSpaceList,
  summarise,
  type SpaceMatch,
  type VisualLayer,
} from "../../model";
import { SheetError, readSheet } from "./readSheet";

/** Served from public/, so the link hands over the real file. */
const TEMPLATE = "My2N_space_list_template.xlsx";

export interface ImportSpaceListProps {
  open: boolean;
  layer: VisualLayer;
  onClose: () => void;
  onImport: (matches: SpaceMatch[]) => void;
}

export function ImportSpaceList({
  open,
  layer,
  onClose,
  onImport,
}: ImportSpaceListProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{
    name: string;
    matches: SpaceMatch[];
  } | null>(null);

  const reset = () => {
    setChosen(null);
    setError(null);
    setOver(false);
  };

  const take = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const matches = matchSpaceList(layer, parseSpaceList(await readSheet(file)));
      if (matches.length === 0) {
        setError("That list has no rows under its header.");
        return;
      }
      setChosen({ name: file.name, matches });
    } catch (e) {
      if (e instanceof SheetError || e instanceof OperationRejected) {
        setError(e.message);
        return;
      }
      setError("That file could not be read as a spreadsheet.");
    }
  };

  const total = chosen?.matches.length ?? 0;
  const count = chosen ? summarise(chosen.matches) : null;

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        Import Space List
        <IconButton
          size="small"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <Divider />

      <DialogContent>
        {!chosen ? (
          <>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Import a list of apartments, rooms and other spaces from a
              spreadsheet to name them and set their space category.
            </Typography>

            <Box
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                void take(e.dataTransfer.files[0]);
              }}
              onClick={() => input.current?.click()}
              sx={{
                border: "1px dashed",
                borderColor: over ? "primary.main" : "divider",
                bgcolor: over ? "action.hover" : "transparent",
                borderRadius: 1,
                py: 4,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <FileUploadOutlined sx={{ color: "action.active" }} />
              <Typography variant="body1">
                Drop file here or{" "}
                <Link component="span" underline="hover">
                  browse
                </Link>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                CSV or XLSX; up to 5 MB
              </Typography>
              <input
                ref={input}
                type="file"
                hidden
                accept=".csv,.xlsx,.xlsm,.txt"
                onChange={(e) => {
                  void take(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </Box>

            <Box
              sx={{
                mt: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                The template contains the expected columns and an example row.
              </Typography>
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                component="a"
                href={TEMPLATE}
                download
              >
                Download template
              </Button>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Alert severity="info" sx={{ mt: 2 }}>
              <AlertTitle>How spaces are matched</AlertTitle>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  Rows that match an existing space in the building structure
                  are linked to it. Devices and residents are kept.
                </li>
                <li>
                  Rows that match nothing are added to the list of spaces to
                  place, and can be assigned to the floor plan manually.
                </li>
              </ul>
              Nothing is deleted by an import, and existing names and types are
              only replaced where a row matches.
            </Alert>
          </>
        ) : (
          <>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {chosen.name} — {total} row{total === 1 ? "" : "s"}.
            </Typography>
            <Alert severity="info">
              <AlertTitle>What this import will do</AlertTitle>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  {count!.matchedOnPlan} named a space on the plan and will be
                  renamed in place.
                </li>
                <li>
                  {count!.matchedInStructure} matched a space already waiting to
                  be placed.
                </li>
                <li>
                  {count!.added} matched nothing and will join the list of
                  spaces to place.
                </li>
              </ul>
            </Alert>
            {(count!.unknownFloors > 0 || count!.unknownTypes > 0) && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {count!.unknownFloors > 0 && (
                  <div>
                    {count!.unknownFloors}{" "}
                    {count!.unknownFloors === 1 ? "row names" : "rows name"} a
                    floor this building does not have, and come in without one.
                  </div>
                )}
                {count!.unknownTypes > 0 && (
                  <div>
                    {count!.unknownTypes}{" "}
                    {count!.unknownTypes === 1 ? "row names" : "rows name"} a
                    category this building does not have, and come in as
                    unknown.
                  </div>
                )}
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      <Divider />
      <DialogActions>
        {chosen && (
          <Button color="inherit" onClick={reset}>
            Back
          </Button>
        )}
        <Button
          color="inherit"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!chosen}
          onClick={() => {
            if (!chosen) return;
            onImport(chosen.matches);
            reset();
            onClose();
          }}
        >
          {chosen ? "Import" : "Next"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
