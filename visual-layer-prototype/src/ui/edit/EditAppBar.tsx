/**
 * The edit-mode app bar: logo, place, undo/redo, zoom, Close and Save.
 * Figma: building/floorplan/editMode/StructureMode > <AppBar> (36:4875).
 */
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CenterFocusStrongOutlined from "@mui/icons-material/CenterFocusStrongOutlined";
import LocationOn from "@mui/icons-material/LocationOn";
import Redo from "@mui/icons-material/Redo";
import Remove from "@mui/icons-material/Remove";
import Add from "@mui/icons-material/Add";
import Undo from "@mui/icons-material/Undo";
import logoUrl from "../../assets/2n-logo.svg";

export interface EditAppBarProps {
  place: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  dirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onClose: () => void;
  onSave: () => void;
}

/** The design draws these as 36×30 outlined icon buttons, not IconButtons. */
const iconButtonSx = { minWidth: 36, width: 36, height: 30, px: 0 } as const;

export function EditAppBar({
  place,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  dirty,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onClose,
  onSave,
}: EditAppBarProps) {
  return (
    <AppBar position="static" sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar disableGutters sx={{ minHeight: 64, height: 64, pr: 3 }}>
        {/* The 2N logo sits in a black 64×64 box flush to the corner. */}
        <Box
          sx={{
            width: 64,
            height: 64,
            bgcolor: "common.black",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <img src={logoUrl} alt="2N" width={64} height={64} />
        </Box>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 2, flex: 1 }}>
          <Typography variant="h6">My2N</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <LocationOn sx={{ fontSize: 24, color: "action.active" }} />
            <Typography variant="h6">{place}</Typography>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <Tooltip title={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : "Nothing to undo"}>
            <span>
              <Button
                variant="outlined"
                size="small"
                color="inherit"
                sx={iconButtonSx}
                disabled={!canUndo}
                onClick={onUndo}
                aria-label="Undo"
              >
                <Undo sx={{ fontSize: 16 }} />
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={redoLabel ? `Redo ${redoLabel.toLowerCase()}` : "Nothing to redo"}>
            <span>
              <Button
                variant="outlined"
                size="small"
                color="inherit"
                sx={iconButtonSx}
                disabled={!canRedo}
                onClick={onRedo}
                aria-label="Redo"
              >
                <Redo sx={{ fontSize: 16 }} />
              </Button>
            </span>
          </Tooltip>
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 3 }} />

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            sx={iconButtonSx}
            onClick={onZoomOut}
            aria-label="Zoom out"
          >
            <Remove sx={{ fontSize: 16 }} />
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            sx={iconButtonSx}
            onClick={onZoomIn}
            aria-label="Zoom in"
          >
            <Add sx={{ fontSize: 16 }} />
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            sx={iconButtonSx}
            onClick={onZoomFit}
            aria-label="Fit to view"
          >
            <CenterFocusStrongOutlined sx={{ fontSize: 16 }} />
          </Button>
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 3 }} />

        <Stack direction="row" spacing={2} alignItems="center">
          <Button variant="outlined" color="inherit" onClick={onClose}>
            Close
          </Button>
          <Tooltip
            title={
              dirty
                ? "Keep the changes and leave edit mode"
                : "Nothing has changed yet"
            }
          >
            <span>
              <Button variant="contained" color="primary" onClick={onSave}>
                Save
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
