/**
 * The Floor Plan tab before and after there is one.
 *
 * Figma: 2:24387 — the empty state. Two ways in, because the two are
 * genuinely different jobs: one is uploading what an architect already
 * drew, the other is drawing it yourself because nobody has.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { FloorPlanView } from "./FloorPlanView";
import type { AccessGroup, VisualLayer } from "../../model";

export interface FloorPlanTabProps {
  layer: VisualLayer;
  floorId: string;
  onFloorChange: (floorId: string) => void;
  /** The space the tree is pointing at, drawn lit. */
  selectedGroupId: string | null;
  onClearSelection: () => void;
  groups: readonly AccessGroup[];
  hasPlan: boolean;
  /**
   * The empty state names the method, so it goes straight to that upload
   * step. Only the header button, which says nothing about how, has to ask
   * first.
   */
  onCreate: (method: "pdf" | "manual") => void;
}

export function FloorPlanTab({
  layer,
  floorId,
  onFloorChange,
  selectedGroupId,
  onClearSelection,
  groups,
  hasPlan,
  onCreate,
}: FloorPlanTabProps) {
  // Once the plan exists this tab *is* the plan — not a card inviting
  // you to open one somewhere else.
  if (hasPlan) {
    return (
      <FloorPlanView
        layer={layer}
        floorId={floorId}
        onFloorChange={onFloorChange}
        selectedGroupId={selectedGroupId}
        onClearSelection={onClearSelection}
        groups={groups}
      />
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        // The card is the page, not a box sitting on it: it takes the
        // whole area the tabs leave, as the design draws it.
        height: "100%",
        minHeight: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        p: 4,
      }}
    >
      <Box>
          <Typography variant="h5">No floor plans yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Upload floor plans as PDFs and My2N will detect the rooms and
            apartments automatically.
            <br />
            No PDFs? Create the layout yourself.
          </Typography>
          <Stack
            direction="row"
            spacing={2}
            justifyContent="center"
            sx={{ mt: 3 }}
          >
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => onCreate("manual")}
            >
              Create manually
            </Button>
            <Button variant="contained" onClick={() => onCreate("pdf")}>
              Upload PDFs
            </Button>
          </Stack>
      </Box>
    </Paper>
  );
}
