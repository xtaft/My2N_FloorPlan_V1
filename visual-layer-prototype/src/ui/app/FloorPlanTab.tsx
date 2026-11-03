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
import MapOutlined from "@mui/icons-material/MapOutlined";

export interface FloorPlanTabProps {
  hasPlan: boolean;
  /**
   * The empty state names the method, so it goes straight to that upload
   * step. Only the header button, which says nothing about how, has to ask
   * first.
   */
  onCreate: (method: "pdf" | "manual") => void;
  onOpen: () => void;
}

export function FloorPlanTab({ hasPlan, onCreate, onOpen }: FloorPlanTabProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 520,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        p: 4,
      }}
    >
      {hasPlan ? (
        <Box>
          <MapOutlined sx={{ fontSize: 40, color: "text.secondary" }} />
          <Typography variant="h5" sx={{ mt: 2 }}>
            The floor plan is ready
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Open it to place the devices that are still waiting, and to check
            who can reach what.
          </Typography>
          <Button variant="contained" sx={{ mt: 3 }} onClick={onOpen}>
            Open floor plan
          </Button>
        </Box>
      ) : (
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
      )}
    </Paper>
  );
}
