/**
 * The app bar the editor and the segmentation review share.
 * Figma 42:75117 and 19:91706: logo, place, Close and Save — nothing else.
 *
 * Undo and the zoom used to live here. They act on the plan, so they
 * moved to where the plan is: undo into the action bar over it, zoom
 * into its bottom-right corner. What is left is what is about the
 * whole screen — where you are, and the two ways out of it.
 */
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import LocationOn from "@mui/icons-material/LocationOn";
import logoUrl from "../../assets/2n-logo.svg";

export interface EditAppBarProps {
  place: string;
  onClose: () => void;
  onSave: () => void;
  /** Save greyed, with the reason on hover. */
  saveDisabled?: boolean;
  saveHint?: string;
}

export function EditAppBar({
  place,
  onClose,
  onSave,
  saveDisabled = false,
  saveHint = "",
}: EditAppBarProps) {
  return (
    <AppBar position="static" sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar disableGutters sx={{ minHeight: 64, height: 64, pr: 6 }}>
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
          <Button variant="outlined" color="inherit" onClick={onClose}>
            Close
          </Button>
          <Tooltip title={saveHint}>
            <span>
              <Button
                variant="contained"
                color="primary"
                disabled={saveDisabled}
                onClick={onSave}
              >
                Save
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
